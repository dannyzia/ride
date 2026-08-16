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

    // U-4: exactly one active subscription per driver. The partial unique
    // index subs_one_active_per_driver already prevents two active rows — but
    // a concurrent second activation (two purchases raced past the initiation
    // gate, or purchase + compensation-repair overlap) would hit that index
    // and THROW, rolling back the whole activation and dooming the payment
    // into the compensation retry loop (the Z-2/Z-3 failure class). Serialize
    // activations per driver with an advisory lock, then expire any existing
    // active sub so the later purchase supersedes the earlier one instead of
    // exploding.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('activate_sub_' || ${evt.driver_id}))`);
    await tx.update(subscriptions)
      .set({ status: 'expired', updated_at: new Date() })
      .where(and(eq(subscriptions.driver_id, evt.driver_id), eq(subscriptions.status, 'active')));

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
      // Redeem with a status guard: two concurrent activations for the same
      // driver must not double-credit a voucher. Only the first tx wins the
      // status flip (the loser's UPDATE matches zero rows after the row lock
      // re-evaluates the WHERE) and writes the ledger credit.
      const [redeemed] = await tx.update(creditVouchers)
        .set({ status: 'redeemed', redeemed_subscription_id: sub.id })
        .where(and(eq(creditVouchers.id, v.id), eq(creditVouchers.status, 'active')))
        .returning();
      if (!redeemed) continue;

      if (!isUnlimited) {
        await tx.update(subscriptions).set({ calls_remaining: sql`${subscriptions.calls_remaining} + ${v.calls}` }).where(eq(subscriptions.id, sub.id));
        balanceAfter += v.calls;
      }
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
