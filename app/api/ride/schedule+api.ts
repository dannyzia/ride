import { db } from '@/src/db';
import { users, rides, pricing, rideStops } from '@/src/db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, haversineKm } from '@/lib/fareCalc';
import { detectOriginCity, isIntercity } from '@/lib/cityBoundary';
import { splitRoute } from '@/lib/routeSplit';
import { getRouteDistance } from '@/lib/barikoi';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { VEHICLE_TYPE_ZOD_ENUM } from '@/lib/vehicleTypes';
import { sendSms } from '@/lib/dprelay';
import * as errors from '@/lib/errors';

const scheduleSchema = z.object({
  pickup_lat: z.number().min(-90).max(90),
  pickup_lng: z.number().min(-180).max(180),
  pickup_address: z.string().min(1).max(500),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  dropoff_address: z.string().min(1).max(500),
  vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  scheduled_at: z.string().datetime(),
  promo_code: z.string().min(1).max(50).optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
  secondary_rider_name: z.string().min(1).max(255).optional(),
  secondary_rider_phone: z.string().min(1).max(20).optional(),
  upfront_tip_bdt: z.number().int().min(0).max(20000).optional(),
  stops: z.array(z.object({ lat: z.number(), lng: z.number(), address: z.string().min(1).max(500) })).max(2).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const uid = supabaseUser.id;

    const [user] = await db.select().from(users).where(eq(users.auth_uid, uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });
    if (user.role !== 'rider') return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });

    const parsed = await parseJsonBody(request, scheduleSchema);
    if (!parsed.ok) return parsed.response;

    const { pickup_lat, pickup_lng, pickup_address, dropoff_lat, dropoff_lng, dropoff_address, vehicle_type, scheduled_at, preference_ids, secondary_rider_name, secondary_rider_phone, upfront_tip_bdt, stops } = parsed.data;

    const scheduledDate = new Date(scheduled_at);
    const now = new Date();
    const minLead = 30 * 60 * 1000;
    const maxLead = 7 * 24 * 60 * 60 * 1000;
    if (scheduledDate.getTime() - now.getTime() < minLead) {
      return Response.json({ error: 'too_soon', message: 'Schedule at least 30 minutes in advance' }, { status: 422 });
    }
    if (scheduledDate.getTime() - now.getTime() > maxLead) {
      return Response.json({ error: 'too_far', message: 'Cannot schedule more than 7 days ahead' }, { status: 422 });
    }

    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json({ error: 'outside_zone', message: 'Pickup location is outside the operational zone' }, { status: 422 });
    }
    const zoneId = zoneCheck.zone?.id ?? '00000000-0000-0000-0000-000000000000';

    const dispatchWindowStart = new Date(scheduledDate.getTime() - 15 * 60 * 1000);
    const dispatchWindowEnd = new Date(scheduledDate.getTime() + 15 * 60 * 1000);

    const route = await getRouteDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng).catch(() => null);
    let totalDistanceKm = route?.distanceKm ?? haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // ── Multi-leg distance when stops are provided ──────────────────────
    if (stops && stops.length > 0) {
      const waypoints = [
        { lat: pickup_lat, lng: pickup_lng },
        ...stops,
        { lat: dropoff_lat, lng: dropoff_lng },
      ];
      let multiLegKm = 0;
      for (let i = 0; i < waypoints.length - 1; i++) {
        multiLegKm += haversineKm(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
      }
      totalDistanceKm = multiLegKm;
    }

    const { origin_city, origin_city_polygon } = await detectOriginCity({ lat: pickup_lat, lng: pickup_lng });
    const intercity = origin_city_polygon ? isIntercity({ lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon) : false;

    let insideKm = 0; let outsideKm = 0;
    if (intercity && origin_city_polygon) {
      const split = await splitRoute({ lat: pickup_lat, lng: pickup_lng }, { lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon);
      insideKm = split.inside_km; outsideKm = split.outside_km;
    } else { insideKm = totalDistanceKm; }

    const [activePricing] = await db.select().from(pricing).where(and(eq(pricing.vehicle_type, vehicle_type as any), eq(pricing.zone_id, zoneId), eq(pricing.is_active, true))).limit(1);
    if (!activePricing) return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 422 });

    const fareBreakdown = calculateFare(
      {
        base_fare_bdt: activePricing.base_fare_bdt,
        per_km_bdt: activePricing.per_km_bdt,
        intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
        per_min_bdt: activePricing.per_min_bdt,
        floor_length_km: Number(activePricing.floor_length_km ?? 0),
        floor_min: activePricing.floor_min ?? 0,
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(activePricing.platform_commission_percent ?? 0),
      },
      insideKm, 0, undefined, outsideKm, origin_city, intercity,
    );

    let preferenceSurchargeBdt = 0;
    if (preference_ids && preference_ids.length > 0) {
      const { preferences: prefsTable } = await import('@/src/db/schema');
      const { inArray: inArr } = await import('drizzle-orm');
      const prefRows = await db.select({ charge_bdt: prefsTable.charge_bdt }).from(prefsTable).where(and(inArr(prefsTable.id, preference_ids), eq(prefsTable.is_active, true)));
      preferenceSurchargeBdt = prefRows.reduce((s, p) => s + p.charge_bdt, 0);
    }

    let driverFareBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;
    let riderPayableBdt = fareBreakdown.total_bdt + preferenceSurchargeBdt;

    // ── Upfront tip (100% to driver, not subject to commission) ─
    if (upfront_tip_bdt && upfront_tip_bdt > 0) {
      driverFareBdt += upfront_tip_bdt;
      riderPayableBdt += upfront_tip_bdt;
    }

    let rideId = "";
    let alreadyScheduledConflict = false;
    let rateLimited = false;
    await db.transaction(async (tx) => {
      // C-3: the advisory lock and the "one active scheduled ride" guard must
      // run INSIDE the transaction. A pre-tx lock in autocommit releases
      // immediately, and a pre-tx SELECT lets two concurrent requests both
      // pass the check and both insert — two scheduler jobs, two dispatches.
      // Serialized by the lock, this re-check sees the first request's
      // committed ride and aborts the second with 409/429.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('ride_schedule_' || ${user.id}))`);

      const [activeScheduled] = await tx
        .select({ id: rides.id })
        .from(rides)
        .where(and(
          eq(rides.user_id, user.id),
          eq(rides.status, 'scheduled'),
        ))
        .limit(1);
      if (activeScheduled) {
        alreadyScheduledConflict = true;
        return;
      }

      // Hourly rate limit: max 3 scheduled rides per hour
      const hourAgo = new Date(Date.now() - 3600000);
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(rides)
        .where(and(eq(rides.user_id, user.id), eq(rides.status, 'scheduled'), gte(rides.created_at, hourAgo)));
      if (Number(countResult?.count ?? 0) >= 3) {
        rateLimited = true;
        return;
      }

      const [ride] = await tx.insert(rides).values({
        user_id: user.id,
        driver_id: null,
        zone_id: zoneId,
        pricing_id: activePricing.id,
        origin_address: pickup_address,
        destination_address: dropoff_address,
        origin_latitude: String(pickup_lat),
        origin_longitude: String(pickup_lng),
        destination_latitude: String(dropoff_lat),
        destination_longitude: String(dropoff_lng),
        vehicle_type: vehicle_type as any,
        status: 'scheduled',
        fare_breakdown: fareBreakdown as any,
        distance_km: String(fareBreakdown.distance_km),
        scheduled_at: scheduledDate,
        dispatch_window_start: dispatchWindowStart,
        dispatch_window_end: dispatchWindowEnd,
        driver_fare_bdt: driverFareBdt,
        rider_payable_bdt: riderPayableBdt,
        preference_surcharge_bdt: preferenceSurchargeBdt,
        preference_ids: preference_ids ?? [],
        secondary_rider_name: secondary_rider_name || null,
        secondary_rider_phone: secondary_rider_phone || null,
        is_booked_for_someone_else: !!(secondary_rider_phone || secondary_rider_name),
        upfront_tip_bdt: upfront_tip_bdt ?? 0,
       }).returning();

      if (!ride) {
        throw new Error('ride_insert_failed');
      }
      rideId = ride.id;

      if (stops && stops.length > 0) {
        await tx.insert(rideStops).values(
          stops.map((stop: { lat: number; lng: number; address: string }, i: number) => ({
            ride_id: ride.id,
            stop_order: i + 1,
            lat: stop.lat.toString(),
            lng: stop.lng.toString(),
            address: stop.address,
          }))
        );
      }
    });

    if (alreadyScheduledConflict) {
      return Response.json({ error: 'ride_already_scheduled', message: 'You already have an active scheduled ride' }, { status: 409 });
    }
    if (rateLimited) {
      return Response.json({ error: 'rider_rate_limited', message: 'Rate limit exceeded for this rider' }, { status: 429 });
    }

    // ── SMS to secondary rider (non-blocking) ────────────────────────
    if (secondary_rider_phone) {
      try {
        const trackingUrl = `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/track/${rideId}`;
        await sendSms(
          secondary_rider_phone,
          `Your ride has been booked on Ride. Track it here: ${trackingUrl}`,
        );
        logger.info("[ride/schedule] SMS sent to secondary rider", { rideId: rideId });
      } catch (smsErr) {
        logger.warn("[ride/schedule] SMS to secondary rider failed (non-blocking)", smsErr);
      }
    }

    return Response.json({ ride_id: rideId, fare_breakdown: fareBreakdown, status: 'scheduled' });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/schedule] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
