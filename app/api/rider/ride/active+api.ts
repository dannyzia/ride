import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select().from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user || user.role !== 'rider') {
      return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    }

    const [ride] = await db.select().from(rides).where(
      and(
        eq(rides.user_id, user.id),
        sql`status IN ('pending','dispatching','matched','driver_arriving','in_progress')`,
      )
    ).limit(1);

    if (!ride) {
      return Response.json({ ride: null });
    }

    let driverInfo = null;
    if (ride.driver_id) {
      const [driver] = await db.select({
        name: users.name,
        phone: users.phone,
        vehicle_type: drivers.vehicle_type,
        rating: drivers.rating,
      }).from(drivers)
        .innerJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      driverInfo = driver ?? null;
    }

    return Response.json({
      ride: {
        ...ride,
        origin_latitude: parseFloat(ride.origin_latitude?.toString() ?? '0'),
        origin_longitude: parseFloat(ride.origin_longitude?.toString() ?? '0'),
        destination_latitude: parseFloat(ride.destination_latitude?.toString() ?? '0'),
        destination_longitude: parseFloat(ride.destination_longitude?.toString() ?? '0'),
        distance_km: parseFloat(ride.distance_km?.toString() ?? '0'),
        driver: driverInfo,
      },
    });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
