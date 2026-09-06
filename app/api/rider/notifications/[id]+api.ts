// DELETE /api/rider/notifications/[id] — soft-delete one notification
// (sets deleted_at; the 30-day retention sweep never hard-removes rows).
// Bodyless DELETE (no request body to validate).
import { requireAnyRole } from '@/lib/auth';
import { softDeleteNotification } from '@/lib/notifications/server';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function DELETE(request: Request, { id }: { id: string }) {
  try {
    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) {
      return Response.json({ error: 'invalid_uuid', message: 'id must be a UUID' }, { status: 400 });
    }

    const { dbUser } = await requireAnyRole(['rider'])(request);
    const ok = await softDeleteNotification(dbUser.id, parsedId.data);
    if (!ok) {
      return Response.json({ error: 'not_found', message: 'Notification not found' }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[rider/notifications/delete] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
