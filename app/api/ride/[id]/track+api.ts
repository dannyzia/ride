import { db } from '@/src/db';
import { rides, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    const [ride] = await db.select({
      status: rides.status,
      driver_id: rides.driver_id,
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      destination_latitude: rides.destination_latitude,
      destination_longitude: rides.destination_longitude,
    }).from(rides).where(eq(rides.id, id)).limit(1);

    if (!ride) return Response.json({ error: 'not_found' }, { status: 404 });

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

    return Response.json({
      status: ride.status,
      driver_name: driverName,
      driver_rating: driverRating,
      vehicle_type: vehicleType,
      origin_lat: ride.origin_latitude,
      origin_lng: ride.origin_longitude,
      destination_lat: ride.destination_latitude,
      destination_lng: ride.destination_longitude,
    });
  } catch (err: any) {
    logger.error('[track] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
