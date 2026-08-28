/**
 * GET /api/driver/pricing-reference
 *
 * Returns v6 pricing formula parameters and the fare_framework_stage gate.
 * Used by the DriverPricingReference component to show drivers the v6
 * fare breakdown when the platform has transitioned to stage1+.
 *
 * Auth: driver JWT required.
 */
import { db } from '@/src/db';
import { pricing, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { getFareFrameworkConfig } from '@/lib/fareFrameworkConfig';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    // Get the driver's vehicle_type to select the right pricing row
    const [driverRow] = await db
      .select({ vehicle_type: drivers.vehicle_type })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(eq(users.auth_uid, user.id))
      .limit(1);

    if (!driverRow) {
      return Response.json(
        { error: 'driver_not_found', message: 'Driver not found' },
        { status: 404 },
      );
    }

    // Read stage gate from fare config
    const cfg = await getFareFrameworkConfig(['fare_framework_stage']);
    const stage = cfg.fare_framework_stage;

    // Only return pricing details when stage >= stage1
    if (stage === 'stage0') {
      return Response.json({
        stage,
        visible: false,
        pricing: null,
      });
    }

    // Get the active pricing row for this vehicle type
    const [pricingRow] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.vehicle_type, driverRow.vehicle_type))
      .limit(1);

    if (!pricingRow) {
      return Response.json({
        stage,
        visible: true,
        pricing: null,
      });
    }

    // Read v6-specific config values
    const v6Cfg = await getFareFrameworkConfig([
      'pickup_free_radius_km_bike',
      'pickup_free_radius_km_cng',
      'pickup_free_radius_km_car',
      'pickup_free_time_min_bike',
      'pickup_free_time_min_cng',
      'pickup_free_time_min_car',
      'pickup_cap_billable_km_bike',
      'pickup_cap_billable_km_cng',
      'pickup_cap_billable_km_car',
      'pickup_cap_pct_of_fare',
      'zone_fee_enabled',
    ]);

    return Response.json({
      stage,
      visible: true,
      pricing: {
        vehicle_type: driverRow.vehicle_type,
        base_km: Number(pricingRow.base_km ?? 0),
        initiation_minutes: Number(pricingRow.initiation_minutes ?? 4),
        per_km_bdt: Number(pricingRow.per_km_bdt),
        per_min_bdt: Number(pricingRow.per_min_bdt),
        floor_length_km: Number(pricingRow.floor_length_km ?? 0),
        floor_min: Number(pricingRow.floor_min ?? 0),
        free_wait_minutes: Number(pricingRow.free_wait_minutes ?? 3),
        platform_commission_percent: 0, // v6 = 0% (subscription-only)
        zone_fee_enabled: v6Cfg.zone_fee_enabled === 'true',
      },
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    logger.error('[driver/pricing-reference] GET error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
