import { db } from '@/src/db';
import { rides, pricing, drivers, users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { calculateFare } from '@/lib/fareCalc';
import { logger } from '@/lib/logger';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { user } = await requireRole('driver')(request);

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, params.id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride' }, { status: 403 });
    }
    if (ride.status !== 'in_progress') {
      return Response.json({
        error: 'invalid_status',
        message: `Cannot complete ride in status: ${ride.status}`,
      }, { status: 409 });
    }

    // Get pricing for commission percent
    const [pricingRow] = await db.select()
      .from(pricing)
      .where(eq(pricing.id, ride.pricing_id))
      .limit(1);
    if (!pricingRow) {
      return Response.json({ error: 'pricing_not_found' }, { status: 500 });
    }

    // Calculate actual wait time: from driver arrived to started
    const arrivedAt = ride.arrived_at ? new Date(ride.arrived_at) : null;
    const startedAt = ride.started_at ? new Date(ride.started_at) : null;
    const waitMinutes = arrivedAt && startedAt
      ? Math.max(0, Math.round((startedAt.getTime() - arrivedAt.getTime()) / 60_000))
      : 0;

    const distanceKm = parseFloat(ride.distance_km?.toString() ?? '0');

    // Recalculate fare with actual wait time and platform commission
    const fare = calculateFare({
      base_fare_bdt:              pricingRow.base_fare_bdt,
      per_km_bdt:                 pricingRow.per_km_bdt,
      per_min_wait_bdt:           pricingRow.per_min_wait_bdt,
      free_wait_minutes:          pricingRow.free_wait_minutes,
      minimum_fare_bdt:           pricingRow.minimum_fare_bdt,
      brta_fare_ceiling_bdt:      pricingRow.brta_fare_ceiling_bdt,
      platform_commission_percent: pricingRow.platform_commission_percent,
    }, distanceKm, waitMinutes);

    const now = new Date();
    await db.update(rides)
      .set({
        status: 'completed',
        completed_at: now,
        platform_commission_bdt: fare.platform_commission_bdt,
        fare_breakdown: fare as any,
        updated_at: now,
      })
      .where(eq(rides.id, params.id));

    logger.info('[ride/complete] ride completed', {
      rideId: params.id,
      driverId: driver.id,
      totalBdt: fare.total_bdt,
      commissionBdt: fare.platform_commission_bdt,
      waitMinutes,
    });

    return Response.json({
      ok: true,
      status: 'completed',
      completed_at: now.toISOString(),
      fare_breakdown: fare,
    });

  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: 'unauthorized' }, { status: err.status });
    }
    logger.error('[ride/complete] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
