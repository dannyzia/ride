import { db } from '@/src/db';
import { pricing, preferences } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, haversineKm } from '@/lib/fareCalc';
import { detectOriginCity, isIntercity } from '@/lib/cityBoundary';
import { splitRoute } from '@/lib/routeSplit';
import { getRouteDistance } from '@/lib/barikoi';
import { VEHICLE_TYPE_VALUES, VEHICLE_TYPES } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const estimateSchema = z.object({
  pickup_lat:     z.number().min(-90).max(90),
  pickup_lng:     z.number().min(-180).max(180),
  dropoff_lat:    z.number().min(-90).max(90),
  dropoff_lng:    z.number().min(-180).max(180),
  vehicle_type:   z.enum(VEHICLE_TYPE_VALUES).optional(),
  preference_ids: z.array(z.string().uuid()).max(10).optional(),
  promo_code:     z.string().min(1).max(30).optional(),
});

export async function POST(request: Request) {
  try {
    const _user = await verifySupabaseToken(request);
    const body = await request.json();
    const parsed = estimateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, vehicle_type, preference_ids } = parsed.data;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json({ error: 'outside_zone', message: 'Pickup location is outside the operational zone' }, { status: 422 });
    }
    const zoneId = zoneCheck.zone?.id ?? '00000000-0000-0000-0000-000000000000';

    // Route-based distance with Haversine fallback
    const route = await getRouteDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng).catch(() => null);
    const totalDistanceKm = route?.distanceKm ?? haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

    // City detection and intercity route splitting
    const { origin_city, origin_city_polygon } = await detectOriginCity({ lat: pickup_lat, lng: pickup_lng });
    const intercity = origin_city_polygon ? isIntercity({ lat: dropoff_lat, lng: dropoff_lng }, origin_city_polygon) : false;

    let insideKm = 0;
    let outsideKm = 0;

    if (intercity && origin_city_polygon) {
      const split = await splitRoute(
        { lat: pickup_lat, lng: pickup_lng },
        { lat: dropoff_lat, lng: dropoff_lng },
        origin_city_polygon,
      );
      insideKm = split.inside_km;
      outsideKm = split.outside_km;
    } else {
      insideKm = totalDistanceKm;
      outsideKm = 0;
    }

    // Compute preference surcharge
    let preferenceSurchargeBdt = 0;
    if (preference_ids && preference_ids.length > 0) {
      const prefs = await db.select({ charge_bdt: preferences.charge_bdt })
        .from(preferences)
        .where(and(
          inArray(preferences.id, preference_ids),
          eq(preferences.is_active, true),
        ));
      preferenceSurchargeBdt = prefs.reduce((sum, p) => sum + p.charge_bdt, 0);
    }

    // If specific vehicle type requested, return single estimate
    if (vehicle_type) {
      const [activePricing] = await db.select().from(pricing)
        .where(and(
          eq(pricing.vehicle_type, vehicle_type as any),
          eq(pricing.zone_id, zoneId),
          eq(pricing.is_active, true),
        )).limit(1);
      if (!activePricing) {
        return Response.json({ error: 'pricing_not_found' }, { status: 422 });
      }
      const fare = calculateFare({
        base_fare_bdt:        activePricing.base_fare_bdt,
        per_km_bdt:           activePricing.per_km_bdt,
        intercity_per_km_bdt: activePricing.intercity_per_km_bdt ?? 0,
        per_min_bdt:          activePricing.per_min_bdt,
        floor_length_km:      Number(activePricing.floor_length_km ?? 0),
        floor_min:            activePricing.floor_min ?? 0,
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(activePricing.platform_commission_percent ?? 0),
      }, insideKm, 0, undefined, outsideKm, origin_city, intercity);

      const vtDef = VEHICLE_TYPES.find(v => v.key === vehicle_type);
      const driverFare = fare.total_bdt + preferenceSurchargeBdt;
      return Response.json({
        estimates: [{
          vehicle_type,
          display_en:  vtDef?.display_en ?? vehicle_type,
          display_bn:  vtDef?.display_bn ?? vehicle_type,
          seats:       vtDef?.seats ?? 1,
          fare_breakdown: fare,
          preference_surcharge_bdt: preferenceSurchargeBdt,
          driver_fare_bdt: driverFare,
          rider_payable_bdt: driverFare,
          eta_minutes: Math.max(2, Math.ceil(totalDistanceKm / 0.5)),
        }],
        distance_km: totalDistanceKm,
        preferences_applied: preference_ids ?? [],
      });
    }

    // Return all vehicle types
    const pricings = await db.select().from(pricing)
      .where(and(eq(pricing.zone_id, zoneId), eq(pricing.is_active, true)));

    const estimates = pricings.map(p => {
      const fare = calculateFare({
        base_fare_bdt:        p.base_fare_bdt,
        per_km_bdt:           p.per_km_bdt,
        intercity_per_km_bdt: p.intercity_per_km_bdt ?? 0,
        per_min_bdt:          p.per_min_bdt,
        floor_length_km:      Number(p.floor_length_km ?? 0),
        floor_min:            p.floor_min ?? 0,
        brta_fare_ceiling_bdt: p.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(p.platform_commission_percent ?? 0),
      }, insideKm, 0, undefined, outsideKm, origin_city, intercity);

      const vtDef = VEHICLE_TYPES.find(v => v.key === p.vehicle_type);
      const driverFare = fare.total_bdt + preferenceSurchargeBdt;
      return {
        vehicle_type:  p.vehicle_type,
        display_en:    vtDef?.display_en ?? p.vehicle_type,
        display_bn:    vtDef?.display_bn ?? p.vehicle_type,
        seats:         vtDef?.seats ?? 1,
        fare_breakdown: fare,
        preference_surcharge_bdt: preferenceSurchargeBdt,
        driver_fare_bdt: driverFare,
        rider_payable_bdt: driverFare,
        eta_minutes:   Math.max(2, Math.ceil(totalDistanceKm / 0.5)),
      };
    });

    estimates.sort((a, b) => a.fare_breakdown.total_bdt - b.fare_breakdown.total_bdt);

    return Response.json({ estimates, distance_km: totalDistanceKm, preferences_applied: preference_ids ?? [] });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[ride/estimate] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
