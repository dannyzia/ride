import { db } from '@/src/db';
import { rides, drivers, pricing, riderFeeDeductions } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { evaluateCancellation } from '@/lib/cancellation';
import { createCancellationCredit } from '@/lib/cancellationCompensation';
import { logger } from '@/lib/logger';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { z } from 'zod';
import * as errors from '@/lib/errors';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    // C4-1: resolve the DRIVERS row via the house pattern (join drivers on
    // auth_uid → users.id). requireRole('driver') returns the USERS row —
    // its id is users.id, never drivers.id.
    const { dbUser } = await requireRole('driver')(request);
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });
    const driverId = driver.id;

    // Snapshot BEFORE the claim: the fee must be evaluated against the
    // pre-cancel state (re-reading after the claim would see status='cancelled'
    // and match no policy, silently dropping the fee).
    const [ride] = await db
      .select({
        id: rides.id,
        driver_id: rides.driver_id,
        user_id: rides.user_id,
        status: rides.status,
        created_at: rides.created_at,
        wait_start_at: rides.wait_start_at,
        vehicle_type: rides.vehicle_type,
        zone_id: rides.zone_id,
      })
      .from(rides)
      .where(eq(rides.id, id))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.driver_id !== driverId) {
      return Response.json({ error: 'not_your_ride', message: 'This ride does not belong to you' }, { status: 403 });
    }

    // C4-1 gate: no-show is allowed ONLY from driver_arrived. A pre-arrival
    // claim (matched / driver_arriving) is an abuse path — the fee would be
    // collected without the driver ever reaching the pickup.
    if (ride.status !== 'driver_arrived') {
      return Response.json(
        { error: 'no_show_requires_arrival', message: `Rider can only be marked no-show after arrival (current status: ${ride.status})` },
        { status: 409 },
      );
    }

    // C4-1 gate: the §7.20 minimum wait must have elapsed, measured off the
    // wait-start machinery's server-stamped wait_start_at against the
    // zone × vehicle pricing row's free_wait_minutes (default 3).
    const [priceTier] = await db.select({ free_wait_minutes: pricing.free_wait_minutes })
      .from(pricing)
      .where(and(
        eq(pricing.vehicle_type, ride.vehicle_type as any),
        eq(pricing.zone_id, ride.zone_id),
        eq(pricing.is_active, true),
      ))
      .limit(1);
    const freeMinutes = priceTier?.free_wait_minutes ?? 3;
    if (!ride.wait_start_at) {
      return Response.json(
        { error: 'no_show_wait_not_met', message: 'Wait period has not started — start the wait timer first' },
        { status: 409 },
      );
    }
    const elapsedMs = Date.now() - new Date(ride.wait_start_at).getTime();
    const requiredMs = freeMinutes * 60_000;
    if (elapsedMs < requiredMs) {
      const waitRemainingSeconds = Math.ceil((requiredMs - elapsedMs) / 1000);
      return Response.json(
        {
          error: 'no_show_wait_not_met',
          message: `Minimum wait of ${freeMinutes} minute(s) has not elapsed`,
          wait_remaining_seconds: waitRemainingSeconds,
        },
        { status: 409 },
      );
    }

    // Atomic claim: the conditional UPDATE is the exactly-once guard. If the
    // rider cancelled first (or the ride started), this matches zero rows and
    // we write nothing — no double fee deduction, no double compensation
    // credit. driver_arrived-only: the gate above already enforced it, and
    // the WHERE re-asserts it against the locked row.
    const [claimed] = await db.update(rides)
      .set({
        status: 'cancelled',
        cancelled_by: 'driver',
        cancel_reason: 'rider_no_show',
        updated_at: new Date(),
      })
      .where(and(
        eq(rides.id, id),
        eq(rides.driver_id, driverId),
        eq(rides.status, 'driver_arrived'),
      ))
      .returning({ id: rides.id });

    if (!claimed) {
      const [fresh] = await db.select({ status: rides.status }).from(rides).where(eq(rides.id, id)).limit(1);
      return Response.json({ error: 'invalid_status', message: `Cannot mark no-show in status: ${fresh?.status ?? ride.status}` }, { status: 409 });
    }

    // Fee against the PRE-cancel snapshot (never re-read the ride here).
    // Evaluated AFTER the claim so the loser writes nothing — no fee
    // evaluation side effects, no credit, no deduction.
    const { feeBdt } = await evaluateCancellation(
      { status: ride.status, created_at: ride.created_at },
      'rider',
    );

    // Second (unconditional) update to stamp the fee fields — safe: we own
    // the status transition.
    await db.update(rides)
      .set({
        cancellation_fee_bdt: feeBdt > 0 ? feeBdt : undefined,
        cancellation_fee_pending: feeBdt > 0 ? true : undefined,
      })
      .where(eq(rides.id, id));

    // Free the driver back into the pool (mirrors cancel's restore).
    await db.update(drivers)
      .set({ is_online: true, updated_at: new Date() })
      .where(eq(drivers.id, driverId));

    // Create compensation credit for the original driver (platform-funded)
    if (feeBdt > 0 && ride.driver_id) {
      try {
        await createCancellationCredit({
          originalDriverId: ride.driver_id,
          cancellationRideId: id,
          amountBdt: feeBdt,
        });
      } catch (e: unknown) {
        logger.warn('[no-show] cancellation credit creation failed', e);
      }
    }

    // Create rider fee deduction (collected from future cashback)
    if (feeBdt > 0) {
      try {
        const expiresAt = new Date(Date.now() + 90 * 86400_000);
        await db.insert(riderFeeDeductions).values({
          rider_id: ride.user_id,
          ride_id: id,
          total_amount_bdt: feeBdt,
          remaining_amount_bdt: feeBdt,
          status: 'pending',
          expires_at: expiresAt,
        });
        logger.info('[no-show] rider fee deduction created', { rideId: id, feeBdt });
      } catch (e: unknown) {
        logger.warn('[no-show] rider fee deduction creation failed', e);
      }
    }

    // C4-1: the rider must be told why they were charged (the cancel route's
    // Z2 pattern — push + WS, fire-and-forget; a notification failure must
    // never fail the committed no-show).
    {
      const feeText = feeBdt > 0
        ? ` A no-show fee of ৳${(feeBdt / 100).toFixed(0)} was applied to your account.`
        : ' No fee was charged.';
      sendNotification(
        ride.user_id,
        'ride:cancelled',
        'Ride cancelled — marked as no-show',
        `Your driver waited and marked you as a no-show.${feeText}`,
        { ride_id: id },
        { priority: 'high' },
      ).catch(() => {});
      notifyWs([{
        event: 'ride:cancelled',
        to: [{ kind: 'user', user_id: ride.user_id }],
        payload: { ride_id: id, cancelled_by: 'driver', cancel_reason: 'rider_no_show', fee_bdt: feeBdt },
      }]);
    }

    logger.info('[no-show] driver marked rider no-show', { ride_id: id, driver_id: driverId, fee_bdt: feeBdt });
    return Response.json({ success: true, fee_bdt: feeBdt });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[no-show] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
