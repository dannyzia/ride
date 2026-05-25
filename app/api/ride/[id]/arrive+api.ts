import { db } from '@/src/db';
import { rides, drivers, users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRole('driver')(request);

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride' }, { status: 403 });
    }
    if (!['matched', 'driver_arriving'].includes(ride.status)) {
      return Response.json({
        error: 'invalid_status',
        message: `Cannot mark arrive in status: ${ride.status}`,
      }, { status: 409 });
    }

    const now = new Date();
    await db.update(rides)
      .set({ status: 'driver_arrived', arrived_at: now, updated_at: now })
      .where(eq(rides.id, params.id));

    logger.info('[ride/arrive] driver arrived', { rideId: params.id, driverId: driver.id });
    return Response.json({ ok: true, status: 'driver_arrived', arrived_at: now.toISOString() });

  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized' }, { status: err.status });
    }
    logger.error('[ride/arrive] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
