// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { rides, drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id' }, { status: 400 });

    const { dbUser: user } = await requireRole('driver')(request);

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride' }, { status: 403 });
    }
    if (!['driver_arrived', 'driver_arriving'].includes(ride.status)) {
      return Response.json({
        error: 'invalid_status',
        message: `Cannot start ride in status: ${ride.status}`,
      }, { status: 409 });
    }

    const now = new Date();
    await db.update(rides)
      .set({ status: 'in_progress', started_at: now, updated_at: now })
      .where(eq(rides.id, rideId));

    logger.info('[ride/start] ride started', { rideId, driverId: driver.id });
    return Response.json({ ok: true, status: 'in_progress', started_at: now.toISOString() });

  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized' }, { status: err.status });
    }
    logger.error('[ride/start] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
