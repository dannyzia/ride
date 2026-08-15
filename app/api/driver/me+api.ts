import { db } from '@/src/db';
import { drivers, users, subscriptions, pricing, platformConfig } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isAllowedStorageUrl } from '@/lib/storageUrl';
import { z } from 'zod';

// NOTE: `vehicle_type` is intentionally NOT part of the PATCH schema. The
// driver's dispatch-facing type is owned by POST /api/driver/vehicles (B-2,
// which enforces eligibility on changes and syncs drivers.vehicle_type) and
// POST /api/driver/vehicle-type-change (gated). Accepting it here was a third,
// unguarded write path that bypassed both gates (N1).
const patchSchema = z.object({
  min_per_km_bdt: z.number().int().nonnegative().optional(),
  name: z.string().min(1).max(200).optional(),
  phone: z.string().min(1).max(20).optional(),
  profile_image_url: z.string().url().optional(),
  email: z.string().email().optional(),
  city: z.string().min(1).max(100).optional(),
  auto_accept_enabled: z.boolean().optional(),
  auto_accept_radius_meters: z.number().int().min(100).max(5000).optional(),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      email: users.email,
      profile_image_url: users.profile_image_url,
    }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [activeSub] = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);

    return Response.json({
      driver: {
        ...driver,
        name: user.name,
        phone: user.phone,
        email: user.email,
        profile_image_url: user.profile_image_url,
        calls_remaining: activeSub?.calls_remaining ?? 0,
        subscription: activeSub ?? null,
      },
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/me] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

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
        if (!activePricing) return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 422 });

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

    if (parsed.data.auto_accept_enabled !== undefined) updates.auto_accept_enabled = parsed.data.auto_accept_enabled;
    if (parsed.data.auto_accept_radius_meters !== undefined) updates.auto_accept_radius_meters = parsed.data.auto_accept_radius_meters;

    if (Object.keys(updates).length > 0) {
      await db.update(drivers)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(drivers.id, driver.id));
    }

    const userUpdates: Record<string, any> = {};
    if (parsed.data.name !== undefined) userUpdates.name = parsed.data.name;
    if (parsed.data.phone !== undefined) userUpdates.phone = parsed.data.phone;
    if (parsed.data.profile_image_url !== undefined) {
      // C3a: the profile photo is verification-adjacent display data — keep it
      // inside the project's own storage.
      if (!isAllowedStorageUrl(parsed.data.profile_image_url, 'driver-documents')) {
        return Response.json({ error: 'invalid_storage_url', message: 'Profile image must be uploaded to Ride storage' }, { status: 400 });
      }
      userUpdates.profile_image_url = parsed.data.profile_image_url;
    }
    if (parsed.data.email !== undefined) userUpdates.email = parsed.data.email;
    if (parsed.data.city !== undefined) userUpdates.city = parsed.data.city;
    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updated_at = new Date();
      await db.update(users).set(userUpdates).where(eq(users.id, user.id));
    }

    // Re-fetch to return updated state
    const [updated] = await db.select().from(drivers).where(eq(drivers.id, driver.id)).limit(1);
    return Response.json({ driver: updated });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/me] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
