// PATCH /api/rider/notifications/read-all — mark every unread notification
// read for the caller. Bodyless PATCH (no request body to validate).
import { requireAnyRole } from '@/lib/auth';
import { markAllNotificationsRead } from '@/lib/notifications/server';
import { logger } from '@/lib/logger';

export async function PATCH(request: Request) {
  try {
    const { dbUser } = await requireAnyRole(['rider'])(request);
    const updated = await markAllNotificationsRead(dbUser.id);
    return Response.json({ updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[rider/notifications/read-all] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
