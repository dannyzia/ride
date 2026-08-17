// Auth: verifySupabaseToken via requireRole
import { db } from '@/src/db';
import { drivers, pricing, platformConfig, users } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const { supabaseUser } = await requireRole('driver')(request);

    const [dbUser] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ vehicle_type: drivers.vehicle_type })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [activePricing] = await db.select({
      per_km_bdt: pricing.per_km_bdt,
      per_min_bdt: pricing.per_min_bdt,
      base_fare_bdt: pricing.base_fare_bdt,
      floor_length_km: pricing.floor_length_km,
      floor_min: pricing.floor_min,
      brta_fare_ceiling_bdt: pricing.brta_fare_ceiling_bdt,
    })
      .from(pricing)
      .where(and(
        eq(pricing.vehicle_type, driver.vehicle_type as any),
        eq(pricing.is_active, true),
      ))
      .limit(1);
    if (!activePricing) return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 404 });

    // Read ratios from platform_config for bounds
    const configRows = await db.select()
      .from(platformConfig)
      .where(inArray(platformConfig.key, ['driver_min_ratio', 'driver_max_ratio']));
    const get = (k: string, def: number) =>
      parseFloat(configRows.find(r => r.key === k)?.value ?? String(def));
    const minRatio = get('driver_min_ratio', 0.70);
    const maxRatio = get('driver_max_ratio', 1.50);

    return Response.json({
      vehicle_type: driver.vehicle_type,
      per_km_bdt: activePricing.per_km_bdt,
      per_min_bdt: activePricing.per_min_bdt,
      base_fare_bdt: activePricing.base_fare_bdt,
      floor_length_km: Number(activePricing.floor_length_km),
      floor_min: activePricing.floor_min,
      brta_fare_ceiling_bdt: activePricing.brta_fare_ceiling_bdt,
      min_per_km_floor_bdt: Math.floor(activePricing.per_km_bdt * minRatio),
      min_per_km_ceiling_bdt: Math.ceil(activePricing.per_km_bdt * maxRatio),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[driver/pricing-reference] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
