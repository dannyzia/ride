// [public]
import { z } from "zod";
import { db } from "../../src/db";
import { users, drivers, fleets, fleetMembers, userRoles, shopTypes } from "../../src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { supabaseAdmin } from "../../lib/supabaseServer";
import { parseJsonBody } from "@/lib/parseBody";
import { consumeVerification } from "@/lib/verifiedPhones";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { grantLaunchFreeIfEligible } from "@/lib/launchFreeSubscription";
import { LAUNCH_ROLES, createRoleRecord } from "@/lib/launchRoles";

// §2 (OWNER-DECISION #8): the register screen shows FIVE role buttons. Each
// path writes user_roles (§1) + users.role (first role = primary); the three
// new roles mint their PENDING record here and are activated by the admin
// verification queue (§7). Doc URLs come from the R2 upload flow.
const schema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
    name: z.string().min(2).max(100),
    role: z.enum(LAUNCH_ROLES),
    // C1-1 (STAGE C1-FIX): T&C + Privacy consent flag, carried from the
    // phone-entry checkbox gate. Optional at the Zod layer so a missing
    // flag surfaces as 400 terms_required (not a generic validation error).
    terms_accepted: z.boolean().optional(),
    password: z.string().min(6, "Password must be at least 6 characters"),
    vehicle_type: VEHICLE_TYPE_ZOD_ENUM.optional(),
    shop: z
      .object({
        shop_name: z.string().min(2).max(150),
        shop_type_id: z.string().uuid(),
        address_line: z.string().min(3).max(500),
        license_url: z.string().url().max(500),
        food_safety_cert_url: z.string().url().max(500).optional(),
      })
      .optional(),
    fleet: z
      .object({
        fleet_name: z.string().min(2).max(150),
        business_name: z.string().min(2).max(150).optional(),
        trade_license_number: z.string().min(1).max(100).optional(),
        trade_license_url: z.string().url().max(500),
        tax_doc_url: z.string().url().max(500).optional(),
      })
      .optional(),
    delivery: z
      .object({
        nid_url: z.string().url().max(500),
        license_url: z.string().url().max(500),
        vehicle_note: z.string().max(300).optional(),
      })
      .optional(),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, schema);
  if (!result.ok) return result.response;

  const { phone, name, role, password, vehicle_type, shop, fleet, delivery, terms_accepted } = result.data;

  // C1-1: new registrations must carry explicit T&C + Privacy consent.
  if (terms_accepted !== true)
    return Response.json({ error: "terms_required", message: "Terms of Service and Privacy Policy acceptance is required" }, { status: 400 });

  // Payload completeness BEFORE any write (each new role needs its documents).
  if (role === "shop_owner" && !shop)
    return Response.json({ error: "shop_fields_required", message: "Shop details are required" }, { status: 400 });
  if (role === "fleet_owner" && !fleet)
    return Response.json({ error: "fleet_fields_required", message: "Fleet details are required" }, { status: 400 });
  if (role === "delivery_man" && !delivery)
    return Response.json(
      { error: "delivery_fields_required", message: "Identity documents are required" },
      { status: 400 },
    );

  // A shop category must exist (and be live) before a shop can reference it.
  if (shop) {
    const [shopType] = await db
      .select({ id: shopTypes.id })
      .from(shopTypes)
      .where(and(eq(shopTypes.id, shop.shop_type_id), eq(shopTypes.active, true)))
      .limit(1);
    if (!shopType)
      return Response.json(
        { error: "invalid_shop_type", message: "Unknown or inactive shop category" },
        { status: 400 },
      );
  }

  // C1-8: OTP-consumption order — the phone_exists check runs BEFORE the
  // OTP is consumed, so a duplicate-phone tap does not burn a live OTP.
  // Accepted harshness (documented): a Supabase/DB failure AFTER the consume
  // still burns the OTP and the user re-verifies (correct security posture —
  // verifications are single-use, 5-min TTL; see lib/verifiedPhones.ts).
  // C2-4: a purged (soft-deleted) phone frees for re-registration — the
  // dedupe ignores tombstoned rows (their phone is already `deleted:*`).
  const [existing] = await db.select().from(users).where(and(eq(users.phone, phone), isNull(users.deleted_at)));
  if (existing) {
    return Response.json({ error: 'phone_exists', message: 'Phone number already registered' }, { status: 409 });
  }

  if (!consumeVerification(phone)) {
    return Response.json(
      { error: "phone_not_verified", message: "Phone number must be verified via OTP first" },
      { status: 403 },
    );
  }

  const {
    data: { user: supabaseUser },
    error: createError,
  } = await supabaseAdmin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { name, role },
  });

  if (createError || !supabaseUser) {
    logger.error("[register] adminCreateUser failed", createError);
    return Response.json(
      { error: "supabase_create_failed", message: "Failed to create auth user" },
      { status: 502 },
    );
  }

  const authUid = supabaseUser.id;

  try {
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ auth_uid: authUid, phone, name, role, terms_accepted_at: new Date() })
        .returning();

      // §1/§2: every signup path records the account's membership role.
      await tx.insert(userRoles).values({ user_id: user.id, role });

      if (role === "shop_owner" || role === "fleet_owner" || role === "delivery_man") {
        const rec = await createRoleRecord(tx, {
          userId: user.id,
          role,
          payload: { shop, fleet, delivery },
        });
        return { user_id: user.id, role, role_status: rec.status };
      }

      if (role === "driver") {
        // Universal fleet model (spec §onboarding_flow_change): every driver
        // is the OWNER of an implicit solo NATIVE fleet from registration.
        // Invisible to a solo driver; fleet UI only appears when they later
        // add a second vehicle/driver.
        const [fleet] = await tx
          .insert(fleets)
          .values({
            owner_user_id: user.id,
            name: `${name.trim()} Fleet`,
            fleet_type: "NATIVE",
            status: "ACTIVE",
          })
          .returning({ id: fleets.id });

        await tx.insert(fleetMembers).values({
          fleet_id: fleet.id,
          user_id: user.id,
          role: "OWNER",
          status: "active",
        });

        const [driver] = await tx
          .insert(drivers)
          .values({
            user_id: user.id,
            fleet_id: fleet.id,
            vehicle_type: vehicle_type ?? "bike_basic",
            status: "pending",
          })
          .returning({ id: drivers.id });

        return { user_id: user.id, driver_id: driver.id, role };
      }

      return { user_id: user.id, role };
    });

    // Owner ruling 2026-09-27: every driver gets the launch_free subscription at
    // registration. Runs AFTER the registration tx commits (driver row must exist
    // for subscriptions.driver_id FK). Non-fatal: a grant failure must never fail
    // the registration itself — the backfill script covers any stragglers at launch.
    if (role === "driver" && created.driver_id) {
      try {
        await grantLaunchFreeIfEligible({
          driver_id: created.driver_id,
          idempotency_key: `launch_free_${created.driver_id}`,
        });
      } catch (grantErr) {
        logger.error("[register] launch_free grant failed (non-fatal)", {
          user_id: created.user_id,
          error: grantErr,
        });
      }
    }

    return Response.json(
      {
        ...created,
        next: role === "driver" ? "/(main)/(rider)/home" : "/(main)/(customer)/home",
      },
      { status: 201 },
    );
  } catch (e) {
    logger.error("[register] DB insert failed, cleaning up orphaned auth user", {
      authUid,
      error: e,
    });

    await supabaseAdmin.auth.admin.deleteUser(authUid).catch((cleanupErr) => {
      logger.error("[register] failed to delete orphaned auth user", { authUid, cleanupErr });
    });

    return Response.json({ error: 'registration_failed', message: 'Registration failed' }, { status: 500 });
  }
}
