import { db } from '@/src/db';
import { rides, riderFeeDeductions } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { evaluateCancellation } from '@/lib/cancellation';
import { createCancellationCredit } from '@/lib/cancellationCompensation';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    const { dbUser } = await requireRole('driver')(request);
    const driverId = dbUser.id;

    const [ride] = await db
      .select({ id: rides.id, driver_id: rides.driver_id, user_id: rides.user_id, status: rides.status })
      .from(rides)
      .where(and(eq(rides.id, id), eq(rides.driver_id, driverId)))
      .limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (!['matched', 'driver_arriving', 'driver_arrived'].includes(ride.status)) {
      return Response.json({ error: 'invalid_status', message: `Cannot mark no-show in status: ${ride.status}` }, { status: 409 });
    }

    const { feeBdt } = await evaluateCancellation(id, 'rider');

    await db.update(rides)
      .set({
        status: 'cancelled',
        cancelled_by: 'driver',
        cancel_reason: 'rider_no_show',
        cancellation_fee_bdt: feeBdt > 0 ? feeBdt : null,
        cancellation_fee_pending: feeBdt > 0 ? true : undefined,
      })
      .where(eq(rides.id, id));

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
