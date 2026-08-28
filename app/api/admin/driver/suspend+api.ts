// POST /api/admin/driver/suspend
// F15-API-02. Suspend an active driver with reason.
import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

const schema = z.object({
  driver_id: z.string().uuid(),
  reason: z.string().min(10).max(500),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('safety.write')(request);

    const result = await parseJsonBody(request, schema);
    if (!result.ok) return result.response;
    const { driver_id, reason } = result.data;

    const [driver] = await db.select().from(drivers).where(eq(drivers.id, driver_id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    await db
      .update(drivers)
      .set({ status: 'suspended', is_online: false, updated_at: new Date() })
      .where(eq(drivers.id, driver_id));

    logger.info('[admin/driver/suspend] suspended', {
      driverId: driver_id,
      previousStatus: driver.status,
      reason,
      adminId: admin.id,
    });

    return Response.json({ driver_id, status: 'suspended' });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/driver/suspend] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
