import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { rides, rideStops, users, drivers } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import * as errors from '@/lib/errors';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select({ id: rides.id, user_id: rides.user_id, driver_id: rides.driver_id }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, appUser.id)).limit(1);
    const isRider = ride.user_id === appUser.id;
    const isDriver = !!driver && ride.driver_id === driver.id;
    if (!isRider && !isDriver) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const stops = await db.select().from(rideStops)
      .where(eq(rideStops.ride_id, id))
      .orderBy(rideStops.stop_order);
    return Response.json({ stops });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[stops] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const completeSchema = z.object({ stop_id: z.string().uuid() });

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, appUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db.select({ id: rides.id, driver_id: rides.driver_id }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const parsed = await parseJsonBody(request, completeSchema);
    if (!parsed.ok) return parsed.response;

    const [stop] = await db.update(rideStops)
      .set({ status: 'completed', completed_at: new Date() })
      .where(and(eq(rideStops.id, parsed.data.stop_id), eq(rideStops.ride_id, id)))
      .returning();

    if (!stop) return Response.json({ error: 'stop_not_found', message: 'Stop not found' }, { status: 404 });
    return Response.json({ success: true, stop });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[stops] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
