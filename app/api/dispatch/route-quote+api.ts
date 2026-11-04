/**
 * app/api/dispatch/route-quote+api.ts
 *
 * Dispatch Routing & Fare Quote endpoint powered by dpMaps.
 * Calculates road-network route, distance, duration, and fare across
 * the 4-state routing waterfall (off, shadow, primary, sole).
 */

import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { getDispatchRoute } from '@/lib/dpmaps/mapsRouter';
import { db } from '@/src/db';
import { pricing } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { calculateFare } from '@/lib/fareCalc';
import { VEHICLE_TYPE_VALUES, type VehicleTypeEnum } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import { randomUUID } from 'crypto';

function mapToPricingVehicleType(vehicleType?: string): VehicleTypeEnum {
  if (vehicleType === 'bike') return 'bike_standard';
  if (vehicleType === 'cng') return 'cng';
  if (vehicleType === 'car') return 'car_economy';
  if (vehicleType && (VEHICLE_TYPE_VALUES as readonly string[]).includes(vehicleType)) {
    return vehicleType as VehicleTypeEnum;
  }
  return 'car_economy';
}

const coordSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const routeQuoteSchema = z.object({
  pickup: coordSchema,
  dropoff: coordSchema,
  vehicle_type: z.enum(['car', 'bike', 'cng']).default('car'),
  trip_id: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, routeQuoteSchema);
    if (!parsed.ok) return parsed.response;

    const { pickup, dropoff, vehicle_type, trip_id } = parsed.data;
    const tripId = trip_id || randomUUID();

    const quote = await getDispatchRoute(
      pickup.lat,
      pickup.lng,
      dropoff.lat,
      dropoff.lng,
      vehicle_type || 'car',
      tripId,
    );

    // Optional pricing lookup to calculate fare_bdt
    let fareBdt: number | null = null;
    try {
      const pricingType = mapToPricingVehicleType(vehicle_type);
      const [activePricing] = await db
        .select()
        .from(pricing)
        .where(
          and(
            eq(pricing.vehicle_type, pricingType),
            eq(pricing.is_active, true),
          ),
        )
        .limit(1);

      if (activePricing) {
        const fare = calculateFare(
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
          quote.distanceKm,
          quote.durationMin,
        );
        fareBdt = fare.total_bdt;
      }
    } catch {
      // Pricing table lookup failed or table unavailable; return route stats without fare
    }

    return Response.json({
      distance_meters: Math.round(quote.distanceKm * 1000),
      duration_seconds: Math.round(quote.durationMin * 60),
      fare_bdt: fareBdt,
      served_by: quote.provider,
      polyline: quote.polyline,
      latency_ms: quote.latencyMs,
    });
  } catch (err: unknown) {
    logger.error('[api/dispatch/route-quote] Error calculating quote', err);
    return Response.json(
      { error: 'internal_error', message: 'Failed to calculate route quote' },
      { status: 500 },
    );
  }
}

