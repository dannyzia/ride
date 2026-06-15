// POST /api/admin/driver/close-account
// F15-API-02. Admin-initiated account closure with document purge timer.
import { db } from '@/src/db';
import { drivers, documents } from '@/src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const PURGE_DELAY_DAYS = 30;

const schema = z.object({
  driver_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const purgeAt = new Date(Date.now() + PURGE_DELAY_DAYS * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx
        .update(drivers)
        .set({
          status: 'rejected',
          is_online: false,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driver_id));

      await tx
        .update(documents)
        .set({ purge_at: purgeAt, updated_at: new Date() })
        .where(
          and(
            eq(documents.driver_id, driver_id),
            isNull(documents.purge_at),
          ),
        );
    });

    logger.info('[admin/driver/close-account] closed', {
      driverId: driver_id,
      reason,
      purgeAt,
      adminId: admin.id,
    });

    return Response.json({
      driver_id,
      status: 'rejected',
      documents_purge_at: purgeAt,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[admin/driver/close-account] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
