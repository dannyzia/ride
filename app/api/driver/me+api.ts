import { db } from '@/src/db';
import { drivers, users, subscriptions, pricing, platformConfig } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const patchSchema = z.object({
  min_per_km_bdt: z.number().int().nonnegative().optional(),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [activeSub] = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);

    return Response.json({
      driver: {
        ...driver,
        calls_remaining: activeSub?.calls_remaining ?? 0,
        subscription: activeSub ?? null,
      },
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/me] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (parsed.data.min_per_km_bdt !== undefined) {
      const val = parsed.data.min_per_km_bdt;

      if (val !== 0) {
        // Fetch active pricing row for driver's vehicle type
        const [activePricing] = await db.select({ per_km_bdt: pricing.per_km_bdt })
          .from(pricing)
          .where(and(eq(pricing.vehicle_type, driver.vehicle_type as any), eq(pricing.is_active, true)))
          .limit(1);
        if (!activePricing) return Response.json({ error: 'pricing_not_found' }, { status: 422 });

        // Read min/max ratios from platform_config
        const configRows = await db.select()
          .from(platformConfig)
          .where(inArray(platformConfig.key, ['driver_min_ratio', 'driver_max_ratio']));
        const get = (k: string, def: number) =>
          parseFloat(configRows.find(r => r.key === k)?.value ?? String(def));
        const minRatio = get('driver_min_ratio', 0.70);
        const maxRatio = get('driver_max_ratio', 1.50);

        const lowerBound = Math.floor(activePricing.per_km_bdt * minRatio);
        const upperBound = Math.ceil(activePricing.per_km_bdt * maxRatio);

        if (val < lowerBound || val > upperBound) {
          return Response.json({
            error: 'min_per_km_out_of_bounds',
            system_rate_bdt: activePricing.per_km_bdt,
            lower_bound: lowerBound,
            upper_bound: upperBound,
          }, { status: 422 });
        }
      }

      updates.min_per_km_bdt = val === 0 ? null : val;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(drivers)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    // Re-fetch to return updated state
    const [updated] = await db.select().from(drivers).where(eq(drivers.id, driver.id)).limit(1);
    return Response.json({ driver: updated });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/me] PATCH error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
