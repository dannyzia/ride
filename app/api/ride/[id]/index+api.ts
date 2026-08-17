import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { z } from 'zod';
import * as errors from '@/lib/errors';

export async function GET(request: Request, { id: rawId }: { id: string }) {
  try {
    const parsedId = z.string().uuid().safeParse(rawId);
    if (!parsedId.success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid ride ID' }, { status: 400 });
    }
    const rideId = parsedId.data;

    const _user = await verifySupabaseToken(request);

    const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, _user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (dbUser.id !== ride.user_id) {
      const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
      if (!driver || (ride.driver_id && ride.driver_id !== driver.id)) {
        return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
      }
    }

    // Get driver info if assigned
    let driverInfo = null;
    if (ride.driver_id) {
      const [driver] = await db.select({
        id: drivers.id,
        name: users.name,
        phone: users.phone,
        profile_image_url: users.profile_image_url,
        vehicle_type: drivers.vehicle_type,
        rating: drivers.rating,
        rating_count: drivers.rating_count,
      }).from(drivers)
        .innerJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);
      driverInfo = driver ?? null;
    }

    const pickupLat = parseFloat(ride.origin_latitude?.toString() ?? '0');
    const pickupLng = parseFloat(ride.origin_longitude?.toString() ?? '0');
    const destLat = parseFloat(ride.destination_latitude?.toString() ?? '0');
    const destLng = parseFloat(ride.destination_longitude?.toString() ?? '0');

    const ridePayload = {
      ...ride,
      origin_latitude: pickupLat,
      origin_longitude: pickupLng,
      destination_latitude: destLat,
      destination_longitude: destLng,
      distance_km: parseFloat(ride.distance_km?.toString() ?? '0'),
      // Aliases consumed by RideTrackingScreen (non-breaking for other consumers)
      pickup_lat: pickupLat,
      pickup_lng: pickupLng,
      destination_lat: destLat,
      destination_lng: destLng,
      fare_bdt: Number((ride.fare_breakdown as any)?.total_bdt ?? 0),
      otp: ride.start_pin ?? '',
      driver_lat: 0,
      driver_lng: 0,
      driver: driverInfo,
    };

    const driverPayload = driverInfo
      ? {
          id: driverInfo.id,
          first_name: driverInfo.name?.split(' ')[0] ?? '',
          last_name: driverInfo.name?.split(' ').slice(1).join(' ') ?? '',
          full_name: driverInfo.name ?? '',
          phone: driverInfo.phone ?? '',
          rating: Number(driverInfo.rating ?? 0),
          total_trips: Number(driverInfo.rating_count ?? 0),
          avatar_url: driverInfo.profile_image_url ?? null,
          vehicle_model: '',
          vehicle_color: '',
          vehicle_plate: '',
          vehicle_type: driverInfo.vehicle_type ?? '',
        }
      : null;

    return Response.json({ ride: ridePayload, driver: driverPayload });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
