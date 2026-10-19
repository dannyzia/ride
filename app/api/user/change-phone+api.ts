import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { consumeVerification } from "@/lib/verifiedPhones";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

const changePhoneSchema = z
  .object({
    new_phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
  })
  .strict();

/**
 * C2-2 (STAGE C2-FIX, F-36 B) — OTP-verified phone change.
 *
 * Flow: client sends an OTP to the NEW number (send-otp) and verifies it
 * (verify-otp, which marks the number verified); this route CONSUMES that
 * verification and atomically updates users.phone. Roles are untouched by
 * construction — only the phone column is written, and every internal
 * reference keys off users.id (the internal User ID model), so memberships
 * survive. verify-token / check-user keep resolving by auth_uid.
 * The old phone no longer authenticates the account (Supabase phone updated
 * alongside the row).
 */
export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, phone: users.phone, auth_uid: users.auth_uid })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, changePhoneSchema);
    if (!parsed.ok) return parsed.response;
    const { new_phone } = parsed.data;

    if (new_phone === dbUser.phone) {
      return Response.json({ success: true, unchanged: true, phone: dbUser.phone }, { status: 200 });
    }

    // Live-number dedupe (tombstoned rows ignored — a purged phone is free).
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, new_phone), isNull(users.deleted_at)))
      .limit(1);
    if (taken) {
      return Response.json({ error: 'phone_exists', message: 'Phone number already registered' }, { status: 409 });
    }

    if (!consumeVerification(new_phone)) {
      return Response.json(
        { error: "phone_not_verified", message: "New phone number must be verified via OTP first" },
        { status: 403 },
      );
    }

    // Supabase credential first, then the row; on a 23505 race the Supabase
    // phone is reverted best-effort so the two never drift.
    const { error: supaError } = await supabaseAdmin.auth.admin.updateUserById(supabaseUser.id, {
      phone: new_phone,
    });
    if (supaError) {
      logger.error("[user/change-phone] supabase phone update failed", supaError);
      return Response.json({ error: "phone_update_failed", message: "Failed to update phone credential" }, { status: 502 });
    }

    try {
      await db.update(users).set({ phone: new_phone, updated_at: new Date() }).where(eq(users.id, dbUser.id));
    } catch (dbErr) {
      const code = (dbErr as { code?: string })?.code;
      if (code === "23505") {
        await supabaseAdmin.auth.admin
          .updateUserById(supabaseUser.id, { phone: dbUser.phone })
          .catch((revertErr) => logger.error("[user/change-phone] revert failed", revertErr));
        return Response.json({ error: 'phone_exists', message: 'Phone number already registered' }, { status: 409 });
      }
      throw dbErr;
    }

    return Response.json({ success: true, phone: new_phone }, { status: 200 });
  } catch (err: unknown) {
    const authBody = errors.authErrorBody(err);
    if (authBody) return Response.json(authBody.body, { status: authBody.status });
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/change-phone] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
