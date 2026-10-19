import { db } from '@/src/db';
import { rides, users, drivers } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { buildCashHandshake } from '@/lib/cashHandshake';
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
      // C3-6: no driver phone in the match/details payloads — in-app chat
      // is the contact channel; masked call is DEFERRED (D-x, provider).
      const [driver] = await db.select({
        id: drivers.id,
        name: users.name,
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

    // C4-5: the start PIN is rider-identity only. Driver-identity responses
    // strip start_pin / start_pin_attempts / start_pin_locked_at (and the
    // otp alias) — the driver proves arrival, never the secret.
    const isRiderIdentity = dbUser.id === ride.user_id;
    const { start_pin: _stripPin, start_pin_attempts: _stripAttempts, start_pin_locked_at: _stripLocked, ...rideSansPin } = ride;

    const pickupLat = parseFloat(ride.origin_latitude?.toString() ?? '0');
    const pickupLng = parseFloat(ride.origin_longitude?.toString() ?? '0');
    const destLat = parseFloat(ride.destination_latitude?.toString() ?? '0');
    const destLng = parseFloat(ride.destination_longitude?.toString() ?? '0');

    const ridePayload = {
      ...(isRiderIdentity ? ride : rideSansPin),
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
      otp: isRiderIdentity ? (ride.start_pin ?? '') : '',
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
          rating: Number(driverInfo.rating ?? 0),
          total_trips: Number(driverInfo.rating_count ?? 0),
          avatar_url: driverInfo.profile_image_url ?? null,
          vehicle_model: '',
          vehicle_color: '',
          vehicle_plate: '',
          vehicle_type: driverInfo.vehicle_type ?? '',
        }
      : null;

    // C3-5 (STAGE C3-FIX, F-05 cash handshake → receipt entry): shared
    // builder with complete+api so both surfaces agree.
    const cashHandshake = buildCashHandshake(
      ride.rider_cash_tendered_bdt,
      ride.driver_cash_received_bdt,
      ride.rider_payable_bdt,
    );

    return Response.json({ ride: ridePayload, driver: driverPayload, cash_handshake: cashHandshake });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
