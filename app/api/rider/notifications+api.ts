import { db } from '@/src/db';
import { users, notifications } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.user_id, appUser.id))
      .orderBy(desc(notifications.sent_at))
      .limit(50);
    return Response.json({ notifications: rows });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/notifications] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
