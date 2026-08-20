import { db } from '@/src/db';
import { rides, users, drivers, riderWalletTransactions, driverWalletTransactions } from '@/src/db/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { recordTip } from '@/lib/accounting';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const tipSchema = z.object({
  amount_bdt: z.number().int().min(1),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const user = await verifySupabaseToken(request);

    if (!z.string().uuid().safeParse(id).success) return Response.json({ error: 'invalid_uuid', message: 'Invalid ride ID' }, { status: 400 });

    const body = await parseJsonBody(request, tipSchema);
    if (!body.ok) return body.response;
    const { amount_bdt } = body.data;

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [ride] = await db.select().from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });

    if (ride.status !== 'completed') {
      return Response.json({ error: 'ride_not_completed', message: `Ride status is ${ride.status}` }, { status: 422 });
    }

    if (ride.user_id !== dbUser.id) {
      return Response.json({ error: 'not_rider', message: 'Only riders can perform this action' }, { status: 403 });
    }

    if (ride.tip_bdt !== null && ride.tip_bdt > 0) {
      return Response.json({ error: 'already_tipped', message: 'Tip already added' }, { status: 409 });
    }

    // Look up the ride's driver
    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.id, ride.driver_id!)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    await db.transaction(async (tx) => {
      // M-3: atomic claim FIRST — two concurrent tips (double-tap) both pass
      // the JS pre-check above; only one wins the tip_bdt IS NULL claim and
      // the loser's transaction rolls back before any wallet movement. Without
      // this, both debited the rider, both credited the driver, both booked.
      const [claimedTip] = await tx.update(rides)
        .set({ tip_bdt: amount_bdt })
        .where(and(eq(rides.id, id), isNull(rides.tip_bdt)))
        .returning({ id: rides.id });
      if (!claimedTip) {
        throw Object.assign(new Error('already_tipped'), { status: 409 });
      }

      // Debit rider wallet
      const [rider] = await tx.select({ wallet: users.rider_wallet_balance_bdt })
        .from(users).where(eq(users.id, ride.user_id)).limit(1).for('update');
      if (!rider || rider.wallet < amount_bdt) {
        throw Object.assign(new Error('insufficient_balance'), { status: 422 });
      }

      await tx.update(users).set({
        rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} - ${amount_bdt}`,
      }).where(eq(users.id, ride.user_id));
      await tx.insert(riderWalletTransactions).values({
        rider_id: ride.user_id,
        amount_bdt: -amount_bdt,
        transaction_type: 'adjustment',
        reference_id: ride.id,
        balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${ride.user_id})`,
      });

      // Credit driver wallet
      await tx.update(drivers).set({
        driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${amount_bdt}`,
        updated_at: new Date(),
      }).where(eq(drivers.id, driver.id));
      await tx.insert(driverWalletTransactions).values({
        driver_id: driver.id,
        transaction_type: 'adjustment',
        amount_bdt: amount_bdt,
        balance_after: sql`(SELECT driver_wallet_balance_bdt FROM drivers WHERE id = ${driver.id}) + ${amount_bdt}`,
      });

    });

    // Accounting entry (non-blocking)
    try {
      await recordTip({ id, tipPaisa: amount_bdt, driverId: driver.id, zoneId: ride.zone_id });
    } catch (e) { logger.warn('[ride/tip] accounting entry failed', e); }

    logger.info('[ride/tip] tip submitted', { rideId: id, amount_bdt });
    return Response.json({ success: true, tip_bdt: amount_bdt });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 409) return Response.json({ error: 'already_tipped', message: 'Tip already added' }, { status: 409 });
    if (errors.getErrorStatus(err) === 422) return Response.json({ error: 'insufficient_balance', message: 'Insufficient account balance' }, { status: 422 });
    logger.error('[ride/tip] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
