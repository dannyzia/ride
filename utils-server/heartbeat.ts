import { db } from '../src/db';
import { subscriptions, callLedger, packages } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';

const _DEDUCTION_GRACE_MS = parseInt(process.env.CALL_DEDUCTION_GRACE_MS ?? '500');

interface HeartbeatContext {
  driverId: string;
  subscriptionId: string;
  rideId: string;
  confirmedAt: Date;
}

export async function recordCallDeduction(ctx: HeartbeatContext): Promise<{ deducted: boolean }> {
  return db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, ctx.subscriptionId));
    if (!sub || sub.status !== 'active') {
      logger.warn('[heartbeat] deduction skipped — no active subscription', ctx);
      return { deducted: false };
    }

    const isUnlimited = sub.calls_remaining === -1;
    const [pkg] = await tx.select({ daily_cap: packages.daily_cap }).from(packages).where(eq(packages.id, sub.package_id)).limit(1);
    const dailyCap = pkg?.daily_cap ?? 200;
    if (sub.daily_calls_used >= dailyCap) {
      logger.warn('[heartbeat] daily cap reached', ctx);
      return { deducted: false };
    }

    if (!isUnlimited && sub.calls_remaining <= 0) {
      logger.warn('[heartbeat] zero balance', ctx);
      return { deducted: false };
    }

    try {
      await tx.insert(callLedger).values({
        subscription_id: ctx.subscriptionId,
        driver_id:       ctx.driverId,
        ride_id:         ctx.rideId,
        event_type:      'deduction',
        delta:           -1,
        balance_after:   isUnlimited ? -1 : sub.calls_remaining - 1,
        reason:          'app_fetch',
      });
    } catch (e: any) {
      if (e.code === '23505') {
        logger.info('[heartbeat] duplicate deduction prevented', ctx);
        return { deducted: false };
      }
      throw e;
    }

    await tx.update(subscriptions).set({
      calls_remaining:  isUnlimited ? -1 : sub.calls_remaining - 1,
      daily_calls_used: sub.daily_calls_used + 1,
      total_deductions: sub.total_deductions + 1,
    }).where(eq(subscriptions.id, ctx.subscriptionId));

    return { deducted: true };
  });
}
