// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { rides, pricing } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { getH3Ring } from '@/lib/h3';
import { z } from 'zod';

import { getDriversInCells } from '@/utils-server/h3Index';
import { calculateFare } from '@/lib/fareCalc';
import { isStage1Plus } from '@/lib/fareFrameworkConfig';
import { calculateV6Fare, type V6PricingRow } from '@/lib/fareCalc';
import { VEHICLE_TYPE_VALUES } from '@/lib/vehicleTypes';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid ride ID' }, { status: 400 });
    }
    const rideId = id;

    const { dbUser: user } = await requireRole('rider')(request);

    const [ride] = await db.select().from(rides)
      .where(and(eq(rides.id, rideId), eq(rides.user_id, user.id)))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.status !== 'no_drivers' && ride.status !== 'pending') {
      return Response.json({ error: 'ride_not_eligible', message: 'Ride is not in a no-drivers state' }, { status: 409 });
    }

    const cells = getH3Ring(
      parseFloat(ride.origin_latitude?.toString() ?? '0'),
      parseFloat(ride.origin_longitude?.toString() ?? '0'),
      1,
    );

    const alternatives: {
      vehicle_type: string;
      fare_breakdown: object;
      available_drivers: number;
    }[] = [];

    const stage1 = await isStage1Plus();
    for (const vt of VEHICLE_TYPE_VALUES) {
      if (vt === ride.vehicle_type) continue;
      const driverIds = getDriversInCells(cells, vt);
      if (!driverIds.length) continue;

      const [pricingRow] = await db.select().from(pricing)
        .where(and(eq(pricing.vehicle_type, vt as any), eq(pricing.is_active, true)))
        .limit(1);
      if (!pricingRow) continue;

      const breakdown = calculateFare({
        base_fare_bdt:              pricingRow.base_fare_bdt,
        per_km_bdt:                 pricingRow.per_km_bdt,
        intercity_per_km_bdt:       pricingRow.intercity_per_km_bdt ?? 0,
        per_min_bdt:                pricingRow.per_min_bdt,
        floor_length_km:            Number(pricingRow.floor_length_km ?? 0),
        floor_min:                  pricingRow.floor_min ?? 0,
        brta_fare_ceiling_bdt:      pricingRow.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(pricingRow.platform_commission_percent ?? 0),
      },
        parseFloat(ride.distance_km?.toString() ?? '0'),
        0,
        undefined,
        0,
        null,
        false,
      );
      const v6FareBreakdown = calculateV6Fare({
        pricing: {
          base_fare_bdt: pricingRow.base_fare_bdt,
          base_km: Number(pricingRow.base_km ?? 0),
          initiation_minutes: pricingRow.initiation_minutes ?? 4,
          per_km_bdt: pricingRow.per_km_bdt,
          intercity_per_km_bdt: pricingRow.intercity_per_km_bdt ?? 0,
          per_min_bdt: pricingRow.per_min_bdt,
          floor_length_km: Number(pricingRow.floor_length_km ?? 0),
          floor_min: pricingRow.floor_min ?? 0,
          brta_fare_ceiling_bdt: pricingRow.brta_fare_ceiling_bdt,
          platform_commission_percent: 0,
        } as V6PricingRow,
        trip_km: parseFloat(ride.distance_km?.toString() ?? '0'),
        ride_time_min: 0,
        night_mult: 1.0,
        grace_min: pricingRow.free_wait_minutes ?? 3,
        wait_min: 0,
        pickup_fee_bdt: 0,
        zone_fee_bdt: 0,
        inside_km: parseFloat(ride.distance_km?.toString() ?? '0'),
        outside_km: 0,
        origin_city: null,
        is_intercity: false,
      });
      const authoritative = stage1 ? v6FareBreakdown : breakdown;
      alternatives.push({
        vehicle_type:      vt,
        fare_breakdown:    authoritative,
        available_drivers: driverIds.length,
      });
    }

    return Response.json({
      ride_id:                rideId,
      requested_vehicle_type: ride.vehicle_type,
      alternatives,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[ride/alternatives] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
