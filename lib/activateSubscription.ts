import { db } from '../src/db';
import { paymentEvents, packages, subscriptions, callLedger, creditVouchers } from '../src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nextBdtMidnightUtc } from './time';
import { logger } from './logger';

export async function activateSubscription(paymentEventId: string): Promise<{ subscriptionId: string }> {
  return db.transaction(async (tx) => {
    const [evt] = await tx.select().from(paymentEvents).where(eq(paymentEvents.id, paymentEventId)).for('update');
    if (!evt) throw new Error(`payment_event not found: ${paymentEventId}`);
    if (!evt.driver_id) throw new Error(`payment_event ${paymentEventId} has no driver_id (ride payment?)`);
    if (!evt.package_id) throw new Error(`payment_event ${paymentEventId} has no package_id (ride payment?)`);

    if (evt.subscription_id) {
      logger.info('[activateSub] already activated', { paymentEventId, subscriptionId: evt.subscription_id });
      return { subscriptionId: evt.subscription_id };
    }

    const [pkg] = await tx.select().from(packages).where(eq(packages.id, evt.package_id));
    if (!pkg) throw new Error(`package not found: ${evt.package_id}`);
    if (evt.amount_bdt !== pkg.price_bdt) throw new Error('amount_mismatch');

    const isUnlimited = pkg.call_count === -1;
    const expiresAt = new Date(Date.now() + pkg.duration_days * 86400_000);

    const [sub] = await tx.insert(subscriptions).values({
      driver_id:          evt.driver_id,
      package_id:         evt.package_id,
      calls_remaining:    isUnlimited ? -1 : pkg.call_count,
      daily_reset_at:     nextBdtMidnightUtc(),
      status:             'active',
      expires_at:         expiresAt,
      total_deductions:   0,
      is_trial:           pkg.is_trial,
    }).returning();

    await tx.insert(callLedger).values({
      subscription_id: sub.id,
      driver_id:       evt.driver_id,
      event_type:      'initial_load',
      delta:           isUnlimited ? -1 : pkg.call_count,
      balance_after:   isUnlimited ? -1 : pkg.call_count,
      reason:          'initial_load',
    });

    const vouchers = await tx.select().from(creditVouchers)
      .where(and(eq(creditVouchers.driver_id, evt.driver_id), eq(creditVouchers.status, 'active')));
    let balanceAfter = isUnlimited ? -1 : pkg.call_count;
    for (const v of vouchers) {
      if (!isUnlimited) {
        await tx.update(subscriptions).set({ calls_remaining: sql`${subscriptions.calls_remaining} + ${v.calls}` }).where(eq(subscriptions.id, sub.id));
        balanceAfter += v.calls;
      }
      await tx.update(creditVouchers).set({ status: 'redeemed', redeemed_subscription_id: sub.id }).where(eq(creditVouchers.id, v.id));
      await tx.insert(callLedger).values({
        subscription_id: sub.id, driver_id: evt.driver_id,
        event_type: 'credit', delta: v.calls, balance_after: balanceAfter,
        reason: 'pro_rata_credit',
      });
    }

    await tx.update(paymentEvents).set({ status: 'paid', confirmed_at: new Date(), subscription_id: sub.id })
      .where(eq(paymentEvents.id, paymentEventId));

    logger.info('[activateSub] success', { paymentEventId, subscriptionId: sub.id });
    return { subscriptionId: sub.id };
  });
}
