import { db } from "@/src/db";
import { userDevices, users } from "@/src/db/schema";
import { and, eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { z } from "zod";
import * as errors from "@/lib/errors";

const revokeSchema = z
  .object({
    device_id: z.string().min(1).optional(),
    all: z.boolean().optional(),
  })
  .strict()
  .refine((v) => (v.device_id ? !v.all : v.all === true), {
    message: "Provide exactly one of device_id or all:true",
  });

/**
 * C2-3 (STAGE C2-FIX, F-36 C) — sessions over user_devices.
 *
 * GET: list the account's devices (id, device_id, platform, last_active_at,
 * current = matches the users.device_id binding).
 * DELETE {device_id}: revoke-single — drops the device row (+ unbinds when it
 * is the bound device, so its pushes stop).
 * DELETE {all:true}: logout-everywhere — drops ALL device rows, clears the
 * binding, and signs out the calling Supabase token.
 *
 * Limitation (disclosed): Supabase JWTs are bearer tokens — other devices'
 * access tokens stay valid until they expire. Revocation stops pushes and
 * clears the registry immediately; per-device token invalidation awaits a
 * server-issued session layer.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [dbUser] = await db
      .select({ id: users.id, device_id: users.device_id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const rows = await db
      .select({
        id: userDevices.id,
        device_id: userDevices.device_id,
        platform: userDevices.platform,
        last_active_at: userDevices.last_active_at,
      })
      .from(userDevices)
      .where(eq(userDevices.user_id, dbUser.id));

    return Response.json(
      {
        sessions: rows.map((r) => ({
          ...r,
          last_active_at: r.last_active_at.toISOString(),
          current: dbUser.device_id != null && r.device_id === dbUser.device_id,
        })),
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const authBody = errors.authErrorBody(err);
    if (authBody) return Response.json(authBody.body, { status: authBody.status });
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/sessions] GET error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [dbUser] = await db
      .select({ id: users.id, device_id: users.device_id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, revokeSchema);
    if (!parsed.ok) return parsed.response;

    if (parsed.data.all === true) {
      await db.delete(userDevices).where(eq(userDevices.user_id, dbUser.id));
      await db.update(users).set({ device_id: null, updated_at: new Date() }).where(eq(users.id, dbUser.id));
      const authHeader = request.headers.get("Authorization") ?? "";
      const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      try {
        if (jwt) await supabaseAdmin.auth.admin.signOut(jwt);
      } catch (signOutErr) {
        logger.warn("[user/sessions] signOut failed (non-fatal)", signOutErr);
      }
      return Response.json({ success: true, revoked: "all" }, { status: 200 });
    }

    const deviceId = parsed.data.device_id as string;
    await db
      .delete(userDevices)
      .where(and(eq(userDevices.user_id, dbUser.id), eq(userDevices.device_id, deviceId)));
    if (dbUser.device_id === deviceId) {
      await db.update(users).set({ device_id: null, updated_at: new Date() }).where(eq(users.id, dbUser.id));
    }
    return Response.json({ success: true, revoked: deviceId }, { status: 200 });
  } catch (err: unknown) {
    const authBody = errors.authErrorBody(err);
    if (authBody) return Response.json(authBody.body, { status: authBody.status });
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/sessions] DELETE error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
