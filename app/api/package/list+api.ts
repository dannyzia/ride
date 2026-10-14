import { db } from "@/src/db";
import { packages, drivers, users } from "@/src/db/schema";
import { eq, and, or, isNull, asc, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { heldRoles } from "@/lib/launchRoles";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

// GET /api/package/list
// M-2 (§16): plans are ROLE-FILTERED (§14). A package is visible iff the
// caller holds an ACTIVE role in packages.roles, and (for driver-role
// visibility) the vehicle scope matches:
//   - vehicle_type IS NULL (universal — available to all vehicle types), OR
//   - vehicle_type matches the driver's vehicle_type.
// Divergence recorded: callers with NO active role now see an EMPTY list
// (previously: universal packages). The zero-roles caller cannot purchase
// anything after the M-2 eligibility gate either, so the old behavior only
// ever produced dead listings.
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    // ACTIVE roles only (§14): pending/verified-gated roles must not see or
    // buy their role's plans yet.
    const activeRoleNames = user
      ? (await heldRoles(user.id))
          .filter((r) => r.status === "active")
          .map((r) => r.role)
      : [];

    // Look up the driver's vehicle type.
    const [driver] = await db
      .select({ vehicle_type: drivers.vehicle_type })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    const driverVehicleType = driver?.vehicle_type ?? null;

    // Active roles OR-drives the §14 filter. Includes-operator, role values
    // are DB-constrained launch-role names (no free text is interpolated).
    const roleFilter =
      activeRoleNames.length > 0
        ? or(...activeRoleNames.map((r) => sql`${packages.roles} @> ARRAY[${r}]::text[]`))
        : // No active roles — the caller may not purchase: empty listing.
          sql`false`;

    // Always exclude soft-deleted packages in addition to active/vehicle filters.
    // Defensive: even though admin DELETE currently also sets is_active=false,
    // a future code path that sets deleted_at without clearing is_active must
    // not leak retired packages to drivers.
    // Without a drivers row (shop owner, delivery man) only vehicle-agnostic
    // plans exist to show — there is no vehicle to match a scoped one against.
    const vehicleFilter = driverVehicleType
      ? or(
          isNull(packages.vehicle_type),
          eq(packages.vehicle_type, driverVehicleType),
        )
      : isNull(packages.vehicle_type);

    const whereClause = and(
      isNull(packages.deleted_at),
      eq(packages.is_active, true),
      roleFilter,
      vehicleFilter,
    );

    const pkgList = await db
      .select({
        id: packages.id,
        name: packages.name,
        call_count: packages.call_count,
        duration_days: packages.duration_days,
        price_bdt: packages.price_bdt,
        daily_cap: packages.daily_cap,
        is_trial: packages.is_trial,
        vehicle_type: packages.vehicle_type,
        roles: packages.roles,
      })
      .from(packages)
      .where(whereClause)
      .orderBy(asc(packages.price_bdt));

    return Response.json({ packages: pkgList });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json(
        { error: "unauthorized", message: "Invalid or missing token" },
        { status: 401 },
      );
    }
    logger.error("[package/list] error", e);
    return Response.json(
      { error: "internal_error", message: "Failed to fetch packages" },
      { status: 500 },
    );
  }
}
