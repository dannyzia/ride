import { db } from '@/src/db';
import { rides, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const [ride] = await db.select({
      status: rides.status,
      driver_id: rides.driver_id,
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      destination_latitude: rides.destination_latitude,
      destination_longitude: rides.destination_longitude,
    }).from(rides).where(eq(rides.id, id)).limit(1);

    if (!ride) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });

    let driverName: string | null = null;
    let driverRating: string | null = null;
    let vehicleType: string | null = null;
    if (ride.driver_id) {
      const [drv] = await db.select({
        name: users.name,
        rating: drivers.rating,
        vehicle_type: drivers.vehicle_type,
      }).from(drivers)
        .leftJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      if (drv) { driverName = drv.name; driverRating = drv.rating; vehicleType = drv.vehicle_type; }
    }

    // Status gate: this endpoint is unauthenticated (share-link page). Active
    // rides may show pickup/dropoff + driver info; terminal rides must degrade
    // to nothing so finished trips stop leaking coordinates (home addresses)
    // and driver details forever behind a static UUID.
    const ACTIVE_STATUSES = new Set([
      "dispatching",
      "matched",
      "driver_arriving",
      "driver_arrived",
      "in_progress",
    ]);
    const isActive = ACTIVE_STATUSES.has(ride.status);

    return Response.json({
      status: ride.status,
      driver_name: isActive ? driverName : null,
      driver_rating: isActive ? driverRating : null,
      vehicle_type: isActive ? vehicleType : null,
      origin_lat: isActive ? ride.origin_latitude : null,
      origin_lng: isActive ? ride.origin_longitude : null,
      destination_lat: isActive ? ride.destination_latitude : null,
      destination_lng: isActive ? ride.destination_longitude : null,
    });
  } catch (err: unknown) {
    logger.error('[track] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
