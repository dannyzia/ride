import { requireAnyRole } from '@/lib/auth';
import {
  listNotifications,
  DEFAULT_PAGE_SIZE,
} from '@/lib/notifications/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/driver/notifications?limit=20&before=<ISO cursor>&unread_only=true
 * Same shape as the rider inbox; auth requires the driver role.
 */
export async function GET(request: Request) {
  try {
    const { dbUser } = await requireAnyRole(['driver'])(request);

    const url = new URL(request.url);
    const limitRaw = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10);
    const before = url.searchParams.get('before') ?? undefined;
    const unreadOnly = url.searchParams.get('unread_only') === 'true';

    const page = await listNotifications(dbUser.id, {
      limit: Number.isFinite(limitRaw) ? limitRaw : DEFAULT_PAGE_SIZE,
      before,
      unreadOnly,
    });

    return Response.json(page);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 400) return Response.json({ error: 'invalid_cursor', message: 'Invalid pagination cursor' }, { status: 400 });
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[driver/notifications] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
