/**
 * GET/PATCH /api/driver/deliveries-toggle — S6 driver Deliveries toggle
 * (plan 27 §6.1 + Amendment 2 / F-15).
 *
 * GET:    current state (+ why it cannot be enabled, for the UI).
 * PATCH:  flip the toggle. Server-side gates:
 *   - enable is REJECTED while the driver is carrying a rider (409
 *     active_ride — mutual exclusion; auto-OFF already flipped it at match
 *     time, this blocks a manual re-enable mid-trip),
 *   - enable is REJECTED on a non-active drivers row,
 *   - disable is always allowed (the driver may drop out of delivery
 *     offers at any time; an accepted leg keeps its assignment — the
 *     one-active-job rule applies to claims, not to stopping new offers).
 * Default is OFF (migration 0074 DEFAULT false) — a driver NEVER receives
 * delivery offers until they turn it on, and the dispatch pool filters on
 * this column directly (lib/deliveryDispatch.ts), so a tampered client
 * cannot widen its own eligibility.
 */
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { db } from '@/src/db';
import { drivers, rides } from '@/src/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const patchSchema = z.object({
  enabled: z.boolean(),
});

const CARRYING_STATES: (typeof rides.status.enumValues)[number][] = [
  'matched',
  'driver_arriving',
  'driver_arrived',
  'in_progress',
];

export async function GET(request: Request) {
  try {
    const { dbUser } = await requireRole('driver')(request);
    const [row] = await db
      .select({ deliveries_enabled: drivers.deliveries_enabled, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!row) {
      return Response.json({ error: 'driver_not_found', message: 'No drivers row' }, { status: 404 });
    }

    const [busyRide] = await db
      .select({ id: rides.id })
      .from(rides)
      .innerJoin(drivers, eq(rides.driver_id, drivers.id))
      .where(
        and(eq(drivers.user_id, dbUser.id), inArray(rides.status, CARRYING_STATES)),
      )
      .limit(1);

    return Response.json(
      {
        enabled: row.deliveries_enabled,
        driver_status: row.status,
        carrying_rider: !!busyRide,
        can_enable: row.status === 'active' && !busyRide,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Driver role required' }, { status });
    }
    logger.error('[driver/deliveries-toggle GET] error', err);
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
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!row) {
      return Response.json({ error: 'driver_not_found', message: 'No drivers row' }, { status: 404 });
    }

    if (enabled) {
      if (row.status !== 'active') {
        return Response.json(
          { error: 'driver_not_active', message: 'Deliveries require an active driver account' },
          { status: 409 },
        );
      }
      // Mutual exclusion (Amendment 2): never deliver while carrying a rider.
      const [busyRide] = await db
        .select({ id: rides.id })
        .from(rides)
        .innerJoin(drivers, eq(rides.driver_id, drivers.id))
        .where(and(eq(drivers.user_id, dbUser.id), inArray(rides.status, CARRYING_STATES)))
        .limit(1);
      if (busyRide) {
        return Response.json(
          { error: 'active_ride', message: 'Deliveries stay OFF while you are on a trip' },
          { status: 409 },
        );
      }
    }

    await db
      .update(drivers)
      .set({ deliveries_enabled: enabled, updated_at: sql`now()` })
      .where(eq(drivers.id, row.id));

    return Response.json({ success: true, enabled }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      return Response.json({ error: 'forbidden', message: 'Driver role required' }, { status });
    }
    logger.error('[driver/deliveries-toggle PATCH] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
