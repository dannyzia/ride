// POST /api/admin/driver/activate
// F15-API-02. Promote a temporary driver to active (after consent re-submission).
import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  driver_id: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole('admin')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });
    if (driver.status !== 'temporary') {
      return Response.json(
        { error: 'invalid_status', message: `Driver is ${driver.status}, only temporary drivers can be activated` },
        { status: 422 },
      );
    }

    await db
      .update(drivers)
      .set({
        status: 'active',
        provisional_expires_at: null,
        stage2_due_at: null,
        updated_at: new Date(),
      })
      .where(eq(drivers.id, driver_id));

    logger.info('[admin/driver/activate] temporary -> active', {
      driverId: driver_id,
      adminId: admin.id,
    });

    return Response.json({ driver_id, status: 'active' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/activate] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
