// [public]
import { z } from "zod";
import { db } from "../../src/db";
import { users, drivers } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { supabaseAdmin } from "../../lib/supabaseServer";
import { parseJsonBody } from "@/lib/parseBody";
import { consumeVerification } from "@/lib/verifiedPhones";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";

const schema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
    name: z.string().min(2).max(100),
    role: z.enum(["rider", "driver"]),
    password: z.string().min(6, "Password must be at least 6 characters"),
    vehicle_type: VEHICLE_TYPE_ZOD_ENUM.optional(),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, schema);
  if (!result.ok) return result.response;

  const { phone, name, role, password, vehicle_type } = result.data;

  if (!consumeVerification(phone)) {
    return Response.json(
      { error: "phone_not_verified", message: "Phone number must be verified via OTP first" },
      { status: 403 },
    );
  }

  const [existing] = await db.select().from(users).where(eq(users.phone, phone));
  if (existing) {
    return Response.json({ error: 'phone_exists', message: 'Phone number already registered' }, { status: 409 });
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
        .values({ auth_uid: authUid, phone, name, role })
        .returning();

      if (role === "driver") {
        await tx.insert(drivers).values({
          user_id: user.id,
          vehicle_type: vehicle_type ?? "bike_basic",
          status: "pending",
        });
      }

      return { user_id: user.id, role };
    });

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
