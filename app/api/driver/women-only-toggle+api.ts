/**
 * GET/PATCH /api/driver/women-only-toggle — S8 §4.4 driver women-only toggle
 * (R-2 persisted per-driver preference, `deliveries_enabled` pattern).
 *
 * GET:    current state + eligibility (why it cannot be enabled, for the UI).
 * PATCH:  flip the toggle. Server-side gates on enable (403):
 *   - kill switch `women_only_rides_enabled` off → women_only_disabled
 *   - drivers.gender !== 'female' → women_only_not_eligible
 *   - !drivers.gender_verified → women_only_not_verified
 *   - vehicle_type outside the bike family → women_only_bike_only
 * Disable is always allowed. The dispatch pool filters on this column
 * directly (shared predicate `isDriverEligibleForRideGender`), so a tampered
 * client cannot widen its own eligibility.
 *
 * Privacy: returns ONLY the caller's own gender/verification state (same
 * allowance as GET /api/user/me). No counterparty gender is ever exposed.
 */
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { getPlan05Bool } from '@/lib/platformConfig';
import { BIKE_FAMILY } from '@/lib/vehicleTypes';
import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const patchSchema = z.object({
  enabled: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const { dbUser } = await requireRole('driver')(request);
    const [row] = await db
      .select({
        gender: drivers.gender,
        gender_verified: drivers.gender_verified,
        vehicle_type: drivers.vehicle_type,
        women_only_enabled: drivers.women_only_enabled,
        status: drivers.status,
      })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!row) {
      return Response.json({ error: 'driver_not_found', message: 'No drivers row' }, { status: 404 });
    }

    const featureEnabled = await getPlan05Bool('women_only_rides_enabled');
    const can_enable =
      featureEnabled &&
      row.gender === 'female' &&
      row.gender_verified === true &&
      (BIKE_FAMILY as readonly string[]).includes(row.vehicle_type);

    return Response.json(
      {
        enabled: row.women_only_enabled,
        driver_status: row.status,
        gender: row.gender,
        gender_verified: row.gender_verified,
        vehicle_type: row.vehicle_type,
        women_only_feature_enabled: featureEnabled,
        can_enable,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Driver role required' }, { status });
    }
    logger.error('[driver/women-only-toggle GET] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { dbUser } = await requireRole('driver')(request);
    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;
    const { enabled } = parsed.data;

    const [row] = await db
      .select({
        id: drivers.id,
        gender: drivers.gender,
        gender_verified: drivers.gender_verified,
        vehicle_type: drivers.vehicle_type,
      })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!row) {
      return Response.json({ error: 'driver_not_found', message: 'No drivers row' }, { status: 404 });
    }

    if (enabled) {
      // Kill switch first: when the feature is paused, no new opt-ins.
      const featureEnabled = await getPlan05Bool('women_only_rides_enabled');
      if (!featureEnabled) {
        return Response.json(
          { error: 'women_only_disabled', message: 'Women-only rides are currently unavailable' },
          { status: 403 },
        );
      }
      if (row.gender !== 'female') {
        return Response.json(
          { error: 'women_only_not_eligible', message: 'Women-only mode is only available to female drivers' },
          { status: 403 },
        );
      }
      if (row.gender_verified !== true) {
        return Response.json(
          { error: 'women_only_not_verified', message: 'Gender verification is required before enabling women-only mode' },
          { status: 403 },
        );
      }
      if (!(BIKE_FAMILY as readonly string[]).includes(row.vehicle_type)) {
        return Response.json(
          { error: 'women_only_bike_only', message: 'Women-only mode applies to bike rides only' },
          { status: 403 },
        );
      }
    }

    await db
      .update(drivers)
      .set({ women_only_enabled: enabled, updated_at: sql`now()` })
      .where(eq(drivers.id, row.id));

    return Response.json({ success: true, enabled }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Driver role required' }, { status });
    }
    logger.error('[driver/women-only-toggle PATCH] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
