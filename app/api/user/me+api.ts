import { db } from "@/src/db";
import { users, drivers } from "@/src/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { getPlan05Bool } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

// NOTE: `phone` is intentionally NOT patchable here — it is the Supabase-auth
// credential and must only change through the OTP-verified auth flows.
const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  profile_image_url: z.string().url().optional(),
  // S8 §4.2: 'unspecified' is accepted by the schema so it can be rejected
  // with the explicit 400 invalid_gender below (not a generic 400).
  gender: z.enum(["male", "female", "other", "unspecified"]).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: users.rating,
      rating_count: users.rating_count,
      zone_fee_explained: users.zone_fee_explained,
      gender: users.gender,
      created_at: users.created_at,
    })
      .from(users)
      .where(and(eq(users.auth_uid, user.id), isNull(users.deleted_at)))
      .limit(1);

    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    return Response.json({
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: dbUser.role,
        profile_image_url: dbUser.profile_image_url,
        rating: dbUser.rating ? parseFloat(String(dbUser.rating)) : null,
        rating_count: dbUser.rating_count,
        // S8 §4.2: self gender (counterparty endpoints must NEVER return this).
        gender: dbUser.gender,
        created_at: dbUser.created_at.toISOString(),
      },
      // S8 §4.2: fresh-read kill switch (never cached — admin flips apply live).
      women_only_rides_enabled: await getPlan05Bool("women_only_rides_enabled"),
      // S8 §4.3: scooter visibility flag for the booking sheet (same
      // freshness semantics; additive alongside the women-only flag).
      scooter_vehicle_type_enabled: await getPlan05Bool("scooter_vehicle_type_enabled"),
    }, { status: 200 });

  } catch (err: unknown) {
    const authBody = errors.authErrorBody(err);
    if (authBody) return Response.json(authBody.body, { status: authBody.status });
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/me] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;

    // S8 §4.2: write-once gender — away from 'unspecified' only, exactly once.
    if (parsed.data.gender !== undefined) {
      if (parsed.data.gender === "unspecified") {
        return Response.json({ error: 'invalid_gender', message: 'Gender cannot be set to unspecified' }, { status: 400 });
      }
      const gender = parsed.data.gender;
      const claimed = await db.transaction(async (tx) => {
        // Race-safe: exactly one concurrent claimer sees a row (the WHERE
        // gender = 'unspecified' barrier); losers get gender_already_set and
        // never re-execute. Dual-writes drivers.gender, which fires
        // trg_drivers_gender_reset (verification flags reset, admin re-stamps).
        const updatedRows = await tx
          .update(users)
          .set({ gender, updated_at: new Date() })
          .where(and(eq(users.id, dbUser.id), eq(users.gender, 'unspecified')))
          .returning({ id: users.id });
        if (updatedRows.length === 0) return null;
        await tx
          .update(drivers)
          .set({ gender, updated_at: new Date() })
          .where(eq(drivers.user_id, dbUser.id));
        return updatedRows;
      });
      if (!claimed) {
        return Response.json({ error: 'gender_already_set', message: 'Gender can only be set once from unspecified' }, { status: 400 });
      }
    }

    const updates: Record<string, any> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.profile_image_url !== undefined) updates.profile_image_url = parsed.data.profile_image_url;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db.update(users).set(updates).where(eq(users.id, dbUser.id));
    }

    const [updated] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      profile_image_url: users.profile_image_url,
      rating: users.rating,
      rating_count: users.rating_count,
      gender: users.gender,
      created_at: users.created_at,
    }).from(users).where(eq(users.id, dbUser.id)).limit(1);

    return Response.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role,
        profile_image_url: updated.profile_image_url,
        rating: updated.rating ? parseFloat(String(updated.rating)) : null,
        rating_count: updated.rating_count,
        gender: updated.gender,
        created_at: updated.created_at.toISOString(),
      },
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/me] PATCH error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
