// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { rides, drivers } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id', message: 'Ride ID is required' }, { status: 400 });

    const { dbUser: user } = await requireRole('driver')(request);

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride', message: 'This ride does not belong to you' }, { status: 403 });
    }
    // PIN verification
    const pinParsed = await parseJsonBody(request, z.object({ pin: z.string() }));
    if (!pinParsed.ok) return pinParsed.response;
    if (!ride.start_pin || ride.start_pin !== pinParsed.data.pin) {
      return Response.json({ error: 'invalid_pin', message: 'Invalid PIN' }, { status: 403 });
    }

    // M-1: atomic claim (mirror the WS start handler). A rider cancel landing
    // between the read and an unguarded write would flip a CANCELLED ride to
    // in_progress — and complete+api only checks in_progress, so a cancelled
    // ride could finish for full fare on top of the cancellation fee.
    const now = new Date();
    const [claimed] = await db.update(rides)
      .set({ status: 'in_progress', started_at: now, updated_at: now })
      .where(and(eq(rides.id, rideId), inArray(rides.status, ['driver_arrived', 'driver_arriving'])))
      .returning({ id: rides.id });
    if (!claimed) {
      return Response.json({
        error: 'invalid_status',
        message: `Cannot start ride in status: ${ride.status}`,
      }, { status: 409 });
    }

    logger.info('[ride/start] ride started', { rideId, driverId: driver.id });
    return Response.json({ ok: true, status: 'in_progress', started_at: now.toISOString() });

  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: err.status });
    }
    logger.error('[ride/start] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
