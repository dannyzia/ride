// Auth: verifySupabaseToken via requireRole
import { db } from '../../../../src/db';
import { rides, pricing } from '../../../../src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '../../../../lib/auth';
import { getH3Ring } from '../../../../lib/h3';

import { getDriversInCells } from '../../../../utils-server/h3Index';
import { calculateFare } from '../../../../lib/fareCalc';
import { VEHICLE_TYPE_VALUES } from '../../../../lib/vehicleTypes';
import { logger } from '../../../../lib/logger';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split('/');
    const rideId = segments[segments.indexOf('ride') + 1];
    if (!rideId) return Response.json({ error: 'missing_ride_id' }, { status: 400 });

    const { dbUser: user } = await requireRole('rider')(req);

    const [ride] = await db.select().from(rides)
      .where(and(eq(rides.id, rideId), eq(rides.user_id, user.id)))
      .limit(1);
    if (!ride) return Response.json({ error: 'Ride not found' }, { status: 404 });
    if (ride.status !== 'no_drivers' && ride.status !== 'pending') {
      return Response.json({ error: 'Ride not in no_drivers state' }, { status: 409 });
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
        per_min_bdt:                pricingRow.per_min_bdt,
        floor_length_km:            Number(pricingRow.floor_length_km ?? 0),
        floor_min:                  pricingRow.floor_min ?? 0,
        brta_fare_ceiling_bdt:      pricingRow.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(pricingRow.platform_commission_percent ?? 0),
      },
        parseFloat(ride.distance_km?.toString() ?? '0'),
        0,
      );
      alternatives.push({
        vehicle_type:      vt,
        fare_breakdown:    breakdown,
        available_drivers: driverIds.length,
      });
    }

    return Response.json({
      ride_id:                rideId,
      requested_vehicle_type: ride.vehicle_type,
      alternatives,
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    if (err.status === 403) return Response.json({ error: 'forbidden' }, { status: 403 });
    logger.error('[ride/alternatives] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
