import { db } from '@/src/db';
import { pricing } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { validatePickupZone } from '@/lib/zone';
import { calculateFare, haversineKm } from '@/lib/fareCalc';
import { getRouteDistance } from '@/lib/barikoi';
import { VEHICLE_TYPE_VALUES, VEHICLE_TYPES } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const estimateSchema = z.object({
  pickup_lat:  z.number().min(-90).max(90),
  pickup_lng:  z.number().min(-180).max(180),
  dropoff_lat: z.number().min(-90).max(90),
  dropoff_lng: z.number().min(-180).max(180),
  vehicle_type: z.enum(VEHICLE_TYPE_VALUES).optional(),
});

export async function POST(request: Request) {
  try {
    const _user = await verifySupabaseToken(request);
    const body = await request.json();
    const parsed = estimateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, vehicle_type } = parsed.data;

    // Zone check
    const zoneCheck = await validatePickupZone(pickup_lat, pickup_lng);
    if (!zoneCheck.valid) {
      return Response.json({ error: 'outside_zone', message: 'Pickup location is outside the operational zone' }, { status: 422 });
    }
    const zoneId = zoneCheck.zone?.id ?? '00000000-0000-0000-0000-000000000000';

    // Route-based distance with Haversine fallback
    const route = await getRouteDistance(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng).catch(() => null);
    const distanceKm = route?.distanceKm ?? haversineKm(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng);

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
        per_min_wait_bdt:     activePricing.per_min_wait_bdt,
        free_wait_minutes:    activePricing.free_wait_minutes,
        minimum_fare_bdt:     Number(activePricing.minimum_fare_bdt ?? 0),
        brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
      }, distanceKm, 0);

      const vtDef = VEHICLE_TYPES.find(v => v.key === vehicle_type);
      return Response.json({
        estimates: [{
          vehicle_type,
          display_en:  vtDef?.display_en ?? vehicle_type,
          display_bn:  vtDef?.display_bn ?? vehicle_type,
          seats:       vtDef?.seats ?? 1,
          ...fare,
          eta_minutes: Math.max(2, Math.ceil(distanceKm / 0.5)),
        }],
        distance_km: distanceKm,
      });
    }

    // Return all vehicle types
    const pricings = await db.select().from(pricing)
      .where(and(eq(pricing.zone_id, zoneId), eq(pricing.is_active, true)));

    const estimates = pricings.map(p => {
      const fare = calculateFare({
        base_fare_bdt:        p.base_fare_bdt,
        per_km_bdt:           p.per_km_bdt,
        per_min_wait_bdt:     p.per_min_wait_bdt,
        free_wait_minutes:    p.free_wait_minutes,
        minimum_fare_bdt:     Number(p.minimum_fare_bdt ?? 0),
        brta_fare_ceiling_bdt: p.brta_fare_ceiling_bdt,
      }, distanceKm, 0);

      const vtDef = VEHICLE_TYPES.find(v => v.key === p.vehicle_type);
      return {
        vehicle_type:  p.vehicle_type,
        display_en:    vtDef?.display_en ?? p.vehicle_type,
        display_bn:    vtDef?.display_bn ?? p.vehicle_type,
        seats:         vtDef?.seats ?? 1,
        ...fare,
        eta_minutes:   Math.max(2, Math.ceil(distanceKm / 0.5)),
      };
    });

    estimates.sort((a, b) => a.total_bdt - b.total_bdt);

    return Response.json({ estimates, distance_km: distanceKm });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[ride/estimate] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
