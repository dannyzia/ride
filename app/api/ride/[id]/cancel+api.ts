import { db } from '@/src/db';
import { rides, users, drivers, riderFeeDeductions } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/parseBody';
import { evaluateCancellation } from '@/lib/cancellation';
import { recordCancellationFee } from '@/lib/accounting';
import { createCancellationCreditInTx } from '@/lib/cancellationCompensation';
import { createCancellationFeeEventInTx } from '@/lib/paymentEvents';
import * as errors from '@/lib/errors';

const CANCELLABLE_STATUSES = [
  'pending',
  'dispatching',
  'matched',
  'driver_arriving',
  'driver_arrived',
] as const;

const cancelSchema = z.object({
  reason: z.string().max(255).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });
    }
    const rideId = id;

    const user = await verifySupabaseToken(request);

    const parsed = await parseJsonBody(request, cancelSchema);
    if (!parsed.ok) return parsed.response;

    const { reason } = parsed.data;

    const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // Verify ownership for rider/driver cancellations
    const [ride] = await db.select().from(rides).where(eq(rides.id, rideId)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.user_id !== dbUser.id) {
      const [driver] = await db.select({ id: drivers.id }).from(drivers)
        .where(eq(drivers.user_id, dbUser.id)).limit(1);
      if (!driver || ride.driver_id !== driver.id) {
        return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
      }
    }

    // Derive cancelled_by server-side from role
    const cancelled_by = dbUser.role === 'driver' ? 'driver' : 'rider';

    // Evaluate cancellation fee against the PRE-cancel snapshot (no wallet
    // debit — collected from future cashback). Never re-read the ride here:
    // the claim below flips it to 'cancelled', and re-reading would match no
    // policy and silently drop the fee.
    const { feeBdt } = await evaluateCancellation(
      { status: ride.status, created_at: ride.created_at },
      cancelled_by as 'rider' | 'driver',
    );

    // M-28: every state write is ONE transaction. The atomic claim is the
    // exactly-once guard (two concurrent cancels both pass the pre-check;
    // only one wins the conditional UPDATE — the loser 409s and writes
    // nothing). The fee stamp, driver-free, compensation credit, and rider
    // fee deduction commit or roll back together — a crash mid-sequence can
    // no longer cancel a ride with fee fields missing, a driver stuck
    // offline, or a compensation credit without its deduction.
    let claimed = false;
    await db.transaction(async (tx) => {
      const [claimedRide] = await tx.update(rides)
        .set({
          status: 'cancelled',
          cancelled_by,
          cancel_reason: reason ?? null,
          updated_at: new Date(),
        })
        .where(and(eq(rides.id, rideId), inArray(rides.status, [...CANCELLABLE_STATUSES])))
        .returning({ id: rides.id });

      if (!claimedRide) {
        claimed = false;
        return;
      }
      claimed = true;

      // Fee stamp (we own the status transition now)
      if (feeBdt > 0) {
        await tx.update(rides).set({
          cancellation_fee_bdt: feeBdt,
          cancellation_compensation_driver_id: ride.driver_id,
          cancellation_fee_pending: true,
        }).where(eq(rides.id, rideId));
      }

      // Free the assigned driver if this cancelled ride had one
      if (ride.driver_id) {
        await tx.update(drivers)
          .set({ is_online: true, updated_at: new Date() })
          .where(eq(drivers.id, ride.driver_id));
      }

      // Create compensation credit for the original driver (platform-funded)
      if (feeBdt > 0 && ride.driver_id) {
        await createCancellationCreditInTx(tx, {
          originalDriverId: ride.driver_id,
          cancellationRideId: rideId,
          amountBdt: feeBdt,
        });
      }

      // Create rider fee deduction (collected from future cashback)
      if (feeBdt > 0) {
        const expiresAt = new Date(Date.now() + 90 * 86400_000);
        await tx.insert(riderFeeDeductions).values({
          rider_id: ride.user_id,
          ride_id: rideId,
          total_amount_bdt: feeBdt,
          remaining_amount_bdt: feeBdt,
          status: 'pending',
          expires_at: expiresAt,
        });

        // Write-ownership: payment_events row creation goes through
        // lib/paymentEvents.ts — the single write owner for this table.
        await createCancellationFeeEventInTx(tx, {
          rideId,
          riderId: ride.user_id,
          amountBdt: feeBdt,
        });
      }
    });

    if (!claimed) {
      return Response.json({ error: 'ride_not_cancellable', message: `Cannot cancel ride in status: ${ride.status}` }, { status: 409 });
    }

    // ── Accounting entry (non-blocking side ledger — outside the tx by
    // design, matching every other money route in the codebase) ──────────
    if (feeBdt > 0) {
      try { await recordCancellationFee({ id: rideId, feePaisa: feeBdt, riderId: ride.user_id, zoneId: ride.zone_id }); }
      catch (e) { logger.warn('[accounting] cancellation fee entry failed', e); }
    }

    logger.info('[ride/cancel] ride cancelled', { rideId, cancelled_by, reason, feeBdt });

    // Notify the assigned driver's WebSocket — fire-and-forget, must never
    // fail the cancellation itself if utils-server is down.
    if (ride.driver_id) {
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        fetch(`http://127.0.0.1:${wsPort}/internal/ride/cancelled`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${internalSecret}`,
          },
          signal: AbortSignal.timeout(3_000),
          body: JSON.stringify({
            ride_id: rideId,
            driver_id: ride.driver_id,
            cancelled_by,
          }),
        }).catch((e) =>
          logger.error("[ride/cancel] WS ride:cancelled broadcast failed", { rideId, driverId: ride.driver_id, error: errors.getErrorMessage(e) }),
        );
      }
    }

    return Response.json({ ok: true, status: 'cancelled' });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[ride/cancel] error', e);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
