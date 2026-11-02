// [public]
import { db } from '@/src/db';
import { rides, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "expired", "no_drivers"]);
const ACTIVE_STATUSES = new Set(["matched", "driver_arriving", "driver_arrived", "in_progress"]);

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const [ride] = await db.select({
      id: rides.id,
      status: rides.status,
      driver_id: rides.driver_id,
      origin_latitude: rides.origin_latitude,
      origin_longitude: rides.origin_longitude,
      destination_latitude: rides.destination_latitude,
      destination_longitude: rides.destination_longitude,
    }).from(rides).where(eq(rides.id, id)).limit(1);

    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    // Status gate: this endpoint is unauthenticated (share-link page). Active
    // rides may show pickup/dropoff + driver info + live position; terminal
    // rides must degrade to nothing so finished trips stop leaking coordinates
    // (home addresses) and driver details forever behind a static UUID.
    const isTerminal = TERMINAL_STATUSES.has(ride.status);
    const isActive = ACTIVE_STATUSES.has(ride.status);
    // dispatching exposes origin/destination but no driver fields (no driver yet).
    // A scheduled ride is not live yet: degrade it to nulls until dispatch
    // makes it active.
    const isDispatching = ride.status === "dispatching";

    let driverLat: number | null = null;
    let driverLng: number | null = null;
    let locationUpdatedAt: number | null = null;
    let locationAgeSeconds: number | null = null;
    let driverName: string | null = null;
    let driverRating: string | null = null;
    let vehicleType: string | null = null;

    if (ride.driver_id && isActive) {
      try {
        const wsInternalUrl = process.env.INTERNAL_WEBSOCKET_URL || "http://127.0.0.1:3001";
        const coordRes = await fetch(`${wsInternalUrl}/internal/ride/${ride.id}/live-coords`, {
          headers: { Authorization: `Bearer ${process.env.WEBSOCKET_INTERNAL_SECRET || ""}` },
          signal: AbortSignal.timeout(500),
        });
        if (coordRes.ok) {
          const livePt = await coordRes.json();
          if (livePt?.lat && livePt?.lng) {
            driverLat = Number(livePt.lat);
            driverLng = Number(livePt.lng);
            locationUpdatedAt = Number(livePt.ts);
            locationAgeSeconds = Math.max(0, Math.round((Date.now() - locationUpdatedAt) / 1000));
          }
        }
      } catch {
        // Fall back to database
      }

      const [drv] = await db
        .select({
          name: users.name,
          rating: drivers.rating,
          vehicle_type: drivers.vehicle_type,
          last_location_lat: drivers.last_location_lat,
          last_location_lng: drivers.last_location_lng,
        })
        .from(drivers)
        .leftJoin(users, eq(users.id, drivers.user_id))
        .where(eq(drivers.id, ride.driver_id))
        .limit(1);

      if (drv) {
        driverName = drv.name;
        driverRating = drv.rating;
        vehicleType = drv.vehicle_type;
        if (driverLat === null && drv.last_location_lat) driverLat = Number(drv.last_location_lat);
        if (driverLng === null && drv.last_location_lng) driverLng = Number(drv.last_location_lng);
      }
    }

    const body = {
      status: ride.status,
      driver_name: isActive ? driverName : null,
      driver_rating: isActive ? driverRating : null,
      vehicle_type: isActive ? vehicleType : null,
      driver_lat: isActive ? driverLat : null,
      driver_lng: isActive ? driverLng : null,
      driver_location_updated_at: isActive ? locationUpdatedAt : null,
      driver_location_age_seconds: isActive ? locationAgeSeconds : null,
      origin_lat: (isActive || isDispatching) ? ride.origin_latitude : null,
      origin_lng: (isActive || isDispatching) ? ride.origin_longitude : null,
      destination_lat: (isActive || isDispatching) ? ride.destination_latitude : null,
      destination_lng: (isActive || isDispatching) ? ride.destination_longitude : null,
    };

    // §10.2: terminal-state / no-store / noindex for finished rides.
    // Search engines must not cache completed/cancelled ride data.
    const headers = new Headers();
    if (isActive) {
      headers.set("Cache-Control", "public, max-age=3, s-maxage=3, stale-while-revalidate=5");
    } else if (isTerminal) {
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }

    return Response.json(body, { status: 200, headers });
  } catch (err: unknown) {
    logger.error('[track] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
