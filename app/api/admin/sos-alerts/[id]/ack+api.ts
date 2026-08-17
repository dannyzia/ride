import { db } from '@/src/db';
import { sosAlerts } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const { dbUser } = await requireRole('admin')(request);

    const [updated] = await db.update(sosAlerts)
      .set({
        status: 'acknowledged',
        acknowledged_by: dbUser.id,
        acknowledged_at: new Date(),
      })
      .where(eq(sosAlerts.id, id))
      .returning();

    if (!updated) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });

    logger.info('[admin] SOS alert acknowledged', { id, by: dbUser.id });
    return Response.json({ success: true, alert: updated });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/sos-alerts/ack] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
