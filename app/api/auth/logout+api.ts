// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { db } from '@/src/db';
import { userDevices, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/logout — D2-1 revoke-on-logout (STAGE D2-FIX).
 *
 * Server-side path: resolves the dying token to the account, drops ALL of
 * the account's user_devices push-token rows (+ clears the users.device_id
 * binding), then signs the token out. A shared device that another user
 * then signs into can never receive this account's pushes (no rows →
 * fetchTokensByUser finds no tokens). Client sign-out funnels ALSO hit
 * this route via lib/pushRevoke (best-effort, before supabase signOut).
 *
 * Revocation is best-effort and never blocks logout: an unresolvable
 * token still signs out below.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: 'missing_token', message: 'Authentication token missing' }, { status: 401 });
  }

  // Best-effort push revoke first (needs the live token to attribute).
  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    const authUid = user?.id ?? null;
    if (authUid) {
      const [dbUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.auth_uid, authUid))
        .limit(1);
      if (dbUser) {
        await db.delete(userDevices).where(eq(userDevices.user_id, dbUser.id));
        await db
          .update(users)
          .set({ device_id: null, updated_at: new Date() })
          .where(eq(users.id, dbUser.id));
      }
    }
  } catch (err) {
    logger.warn('[auth/logout] push revoke failed (non-blocking)', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const { error } = await supabaseAdmin.auth.admin.signOut(token);
  if (error) {
    return Response.json({ error: 'logout_failed', message: 'Logout failed' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
