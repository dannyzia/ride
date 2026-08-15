// Purpose-dispatched repair for failed payment events (audit Z-2/Z-3).
//
// The compensation worker previously retried EVERY queue row with
// activateSubscription — which throws for anything without driver_id +
// package_id, i.e. every wallet topup and rider pass. Those payments were
// doomed: real money taken by PortPos, credit never applied, row marked
// `failed` after 10 retries with only a log. The same credit transactions
// the callback runs live are now reusable here, dispatched by purpose:
//   - wallet_topup  → creditWalletTopup (locked, idempotent)
//   - rider_pass    → activateRiderPass (locked, idempotent)
//   - driver_package → activateSubscription
//
// The functions are shared with the callback so the live path and the repair
// path cannot drift.

import { db } from '../src/db';
import {
  paymentEvents,
  compensationQueue,
  users,
  drivers,
  driverWalletTransactions,
  riderWalletTransactions,
  riderPasses,
  riderSubscriptions,
} from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { activateSubscription } from './activateSubscription';
import { recordWalletTopup, recordRiderPassPurchase } from './accounting';
import { logger } from './logger';

type PaymentEvent = typeof paymentEvents.$inferSelect;
type RiderPass = typeof riderPasses.$inferSelect;

/** Insert a compensation_queue row (unique index + onConflictDoNothing = idempotent). */
export async function enqueueCompensation(paymentEventId: string): Promise<void> {
  await db.insert(compensationQueue).values({
    payment_event_id: paymentEventId,
    status: 'pending',
    next_retry_at: new Date(),
    attempt_count: 0,
  }).onConflictDoNothing();
}

/** Credit a wallet topup. Locked on the payment event + wallet row; a paid row short-circuits (idempotent). */
export async function creditWalletTopup(evt: PaymentEvent): Promise<void> {
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.id, evt.id))
      .for('update')
      .limit(1);
    if (!locked || locked.status === 'paid') {
      logger.debug('[paymentRepair] wallet topup already credited (concurrent)', { paymentEventId: evt.id });
      return;
    }

    if (evt.driver_id) {
      const [d] = await tx
        .select({ balance: drivers.driver_wallet_balance_bdt })
        .from(drivers)
        .where(eq(drivers.id, evt.driver_id))
        .limit(1)
        .for('update');
      const newBalance = (d?.balance ?? 0) + evt.amount_bdt;
      await tx.update(drivers)
        .set({ driver_wallet_balance_bdt: newBalance, updated_at: new Date() })
        .where(eq(drivers.id, evt.driver_id));
      await tx.insert(driverWalletTransactions).values({
        driver_id: evt.driver_id,
        transaction_type: 'adjustment',
        amount_bdt: evt.amount_bdt,
        balance_after: newBalance,
      } as any);
    } else {
      const [u] = await tx
        .select({ balance: users.rider_wallet_balance_bdt })
        .from(users)
        .where(eq(users.id, evt.user_id!))
        .limit(1)
        .for('update');
      const newBalance = (u?.balance ?? 0) + evt.amount_bdt;
      await tx.update(users)
        .set({ rider_wallet_balance_bdt: newBalance, updated_at: new Date() })
        .where(eq(users.id, evt.user_id!));
      await tx.insert(riderWalletTransactions).values({
        rider_id: evt.user_id!,
        transaction_type: 'adjustment',
        amount_bdt: evt.amount_bdt,
        balance_after: newBalance,
      } as any);
    }

    await tx.update(paymentEvents)
      .set({ status: 'paid', confirmed_at: new Date() })
      .where(eq(paymentEvents.id, evt.id));
  });

  try {
    await recordWalletTopup({
      userId: evt.user_id!,
      amountPaisa: evt.amount_bdt,
      isDriver: !!evt.driver_id,
      paymentEventId: evt.id,
    });
  } catch (e) {
    logger.warn('[paymentRepair] wallet topup accounting entry failed', e);
  }
}

/** Activate a rider pass. Locked on the payment event; a paid row short-circuits (idempotent). */
export async function activateRiderPass(evt: PaymentEvent, pass: RiderPass): Promise<void> {
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.id, evt.id))
      .for('update')
      .limit(1);
    if (!locked || locked.status === 'paid') {
      logger.debug('[paymentRepair] rider pass already activated (concurrent)', { paymentEventId: evt.id });
      return;
    }

    const [newSub] = await tx.insert(riderSubscriptions).values({
      rider_id: evt.user_id!,
      pass_id: pass.id,
      status: 'active',
      valid_until: new Date(Date.now() + pass.validity_days * 86400000),
      payment_event_id: evt.id,
    }).returning();

    await tx.update(paymentEvents)
      .set({ status: 'paid', confirmed_at: new Date() })
      .where(eq(paymentEvents.id, evt.id));

    try {
      await recordRiderPassPurchase({
        subscriptionId: newSub.id,
        amountPaisa: evt.amount_bdt,
        riderId: evt.user_id!,
        paymentEventId: evt.id,
      });
    } catch (e) {
      logger.warn('[paymentRepair] rider pass accounting entry failed', e);
    }
  });
}

/**
 * Repair a failed payment event, dispatched by purpose. Throws on unrepairable
 * state so the worker keeps backing off and eventually marks the row failed
 * with the error preserved — but every purpose that can be repaired is.
 */
export async function repairPaymentEvent(paymentEventId: string): Promise<void> {
  const [evt] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.id, paymentEventId))
    .limit(1);
  if (!evt) throw new Error(`payment_event not found: ${paymentEventId}`);
  if (evt.status === 'paid') return; // already repaired

  // Same wallet classification as the callback (covers legacy no-purpose rows).
  const isWalletTopup =
    evt.purpose === 'wallet_topup' ||
    (!evt.purpose && !!evt.user_id && !evt.subscription_id && !evt.ride_id && !evt.driver_id);
  if (isWalletTopup && !evt.pass_id) {
    await creditWalletTopup(evt);
    return;
  }

  if (evt.purpose === 'rider_pass' && evt.pass_id) {
    const [pass] = await db
      .select()
      .from(riderPasses)
      .where(eq(riderPasses.id, evt.pass_id))
      .limit(1);
    if (!pass) throw new Error(`pass not found: ${evt.pass_id}`);
    await activateRiderPass(evt, pass);
    return;
  }

  // driver_package / subscription path (and anything else).
  await activateSubscription(paymentEventId);
}
