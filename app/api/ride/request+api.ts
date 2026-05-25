import { db } from '@/src/db';
import { rides, pricing } from '@/src/db/schema';
import { eq, and, sql, inArray, lt, gte } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, haversineKm } from '@/lib/fareCalc';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const requestSchema = z.object({
  pickup_lat:       z.number().min(-90).max(90),
  pickup_lng:       z.number().min(-180).max(180),
  pickup_address:   z.string().min(1).max(500),
  dropoff_lat:      z.number().min(-90).max(90),
  dropoff_lng:      z.number().min(-180).max(180),
  dropoff_address:  z.string().min(1).max(500),
  vehicle_type:     z.enum(['bike_basic','bike_standard','bike_plus','cng','car_economy','car_comfort','car_premium','car_xl']),
  scheduled_at:     z.string().datetime().optional(),
  allow_downgrade:  z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);
    const uid = decoded.uid;

    const [user] = await db.select().from(sql`users` as any).where(sql`auth_uid = ${uid}`).limit(1) as any[];
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    if (user.role !== 'rider') return Response.json({ error: 'forbidden' }, { status: 403 });

    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, vehicle_type, scheduled_at, allow_downgrade } = parsed.data;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json({ error: 'outside_zone', message: 'Pickup location is outside the operational zone' }, { status: 422 });
    }
    const zoneId = zoneCheck.zone?.id ?? '00000000-0000-0000-0000-000000000000';

    // Rate limit: max 1 active ride per rider
    const [activeRide] = await db.select().from(rides).where(
      and(eq(rides.user_id, user.id), sql`status IN ('pending','dispatching','matched','in_progress')`)
    ).limit(1);
    if (activeRide) {
      return Response.json({ error: 'ride_already_active', message: 'You already have an active ride' }, { status: 409 });
    }

    // Rate limit: 5 requests per hour
    const hourAgo = new Date(Date.now() - 3600000);
    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(rides)
      .where(and(eq(rides.user_id, user.id), gte(rides.created_at, hourAgo)));
    if (Number(countResult?.count ?? 0) >= 5) {
      return Response.json({ error: 'rider_rate_limited' }, { status: 429 });
    }

    // Calculate distance + fare
    const distanceKm = haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    const [activePricing] = await db.select().from(pricing)
      .where(and(
        eq(pricing.vehicle_type, vehicle_type as any),
        eq(pricing.zone_id, zoneId),
        eq(pricing.is_active, true),
      )).limit(1);
    if (!activePricing) {
      return Response.json({ error: 'pricing_not_found' }, { status: 422 });
    }

    const fareBreakdown = calculateFare({
      base_fare_bdt:        activePricing.base_fare_bdt,
      per_km_bdt:           activePricing.per_km_bdt,
      per_min_wait_bdt:     activePricing.per_min_wait_bdt,
      free_wait_minutes:    activePricing.free_wait_minutes,
      minimum_fare_bdt:     Number(activePricing.minimum_fare_bdt ?? 0),
      brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
    }, distanceKm, 0);

    // INSERT ride
    const [ride] = await db.insert(rides).values({
      user_id:               user.id,
      driver_id:             null,
      zone_id:               zoneId,
      pricing_id:            activePricing.id,
      origin_address:        pickup_address,
      destination_address:   dropoff_address,
      origin_latitude:       String(pickup_lat),
      origin_longitude:      String(pickup_lng),
      destination_latitude:  String(dropoff_lat),
      destination_longitude: String(dropoff_lng),
      vehicle_type:          vehicle_type as any,
      status:                'pending',
      fare_breakdown:        fareBreakdown as any,
      distance_km:           String(fareBreakdown.distance_km),
      scheduled_at:          scheduled_at ? new Date(scheduled_at) : null,
    }).returning();

    // Dispatch for immediate rides
    if (!scheduled_at) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? '3001';
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        const dispatchBody = JSON.stringify({ ride_id: ride.id, vehicle_type, pickup_lat, pickup_lng, allow_downgrade });

        let dispatched = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch(dispatchUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalSecret}` },
              signal: AbortSignal.timeout(5_000),
              body: dispatchBody,
            });
            if (res.ok) { dispatched = true; break; }
          } catch { /* retry */ }
          if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
        if (!dispatched) {
          logger.error('[ride/request] dispatch failed after 3 retries', { ride_id: ride.id });
        }
      }
    }

    return Response.json({
      ride_id: ride.id,
      fare_breakdown: fareBreakdown,
      status: 'pending',
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[ride/request] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
