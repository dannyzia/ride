import { db } from '@/src/db';
import { rides, drivers, riderFeeDeductions } from '@/src/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { evaluateCancellation } from '@/lib/cancellation';
import { createCancellationCredit } from '@/lib/cancellationCompensation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const CANCELLABLE_STATUSES = ['matched', 'driver_arriving', 'driver_arrived'] as const;

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const { dbUser } = await requireRole('driver')(request);
    const driverId = dbUser.id;

    // Snapshot BEFORE the claim: the fee must be evaluated against the
    // pre-cancel state (re-reading after the claim would see status='cancelled'
    // and match no policy, silently dropping the fee).
    const [ride] = await db
      .select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, status: rides.status, created_at: rides.created_at })
      .from(rides)
      .where(and(eq(rides.id, id), eq(rides.driver_id, driverId)))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    // Atomic claim (mirror cancel+api.ts): the conditional UPDATE is the
    // exactly-once guard. If the rider cancelled first (or the ride started),
    // this matches zero rows and we write nothing — no double fee deduction,
    // no double compensation credit.
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
        inArray(rides.status, [...CANCELLABLE_STATUSES]),
      ))
      .returning({ id: rides.id });

    if (!claimed) {
      return Response.json({ error: 'invalid_status', message: `Cannot mark no-show in status: ${ride.status}` }, { status: 409 });
    }

    // Fee against the PRE-cancel snapshot (never re-read the ride here).
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
      } catch (e: any) {
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
      } catch (e: any) {
        logger.warn('[no-show] rider fee deduction creation failed', e);
      }
    }

    logger.info('[no-show] driver marked rider no-show', { ride_id: id, driver_id: driverId, fee_bdt: feeBdt });
    return Response.json({ success: true, fee_bdt: feeBdt });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[no-show] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
