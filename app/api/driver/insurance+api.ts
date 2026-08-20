import { z } from 'zod';
import { db } from '@/src/db';
import { platformConfig, drivers, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

/**
 * GET /api/driver/insurance — Plan 06 §7 / master plan §7.17-ish (insurance
 * info screen). Returns the driver-insurance policy summary.
 *
 * Source of truth is the `platform_config` row keyed `driver_insurance`
 * (JSON, admin-editable via PATCH /api/admin/config). Falls back to the
 * built-in defaults below when the key is absent or fails Zod validation.
 * platform_config is NEVER cached (AGENTS.md) — read on every request.
 */

const coverageItemSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
});

const insuranceConfigSchema = z.object({
  provider_name: z.string().min(1).max(120),
  policy_number: z.string().min(1).max(60),
  coverage: z.array(coverageItemSchema).min(1).max(20),
  support_phone: z.string().regex(/^\+880\d{10}$/),
});

const DEFAULT_INSURANCE = {
  provider_name: 'Ride Partner Insurance',
  policy_number: 'RIDE-GRP-001',
  coverage: [
    {
      title: 'Accidental damage',
      description: 'Vehicle damage sustained during an active ride is covered by the partner policy.',
    },
    {
      title: 'Third-party liability',
      description: 'Liability toward third parties during active trips, subject to policy limits.',
    },
    {
      title: 'Personal injury',
      description: 'Medical coverage for driver injuries sustained while on an active ride.',
    },
  ],
  support_phone: '+8801000000000',
} satisfies z.infer<typeof insuranceConfigSchema>;

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ status: drivers.status })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Active drivers (not suspended/rejected) are covered; others get the
    // policy summary with covered=false so the UI can show the difference.
    const covered = driver.status !== 'suspended' && driver.status !== 'rejected';

    let config: z.infer<typeof insuranceConfigSchema> = DEFAULT_INSURANCE;
    const [row] = await db.select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, 'driver_insurance'))
      .limit(1);
    if (row) {
      try {
        const parsed = insuranceConfigSchema.safeParse(JSON.parse(row.value));
        if (parsed.success) config = parsed.data;
        else logger.warn('[driver/insurance] driver_insurance config failed validation — using defaults');
      } catch {
        // Stored value is not valid JSON — fall back to defaults.
        logger.warn('[driver/insurance] driver_insurance config is not valid JSON — using defaults');
      }
    }

    return Response.json({ covered, ...config }, { status: 200 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error('[driver/insurance] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
