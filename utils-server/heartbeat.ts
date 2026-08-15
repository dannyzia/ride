import { db } from "../src/db";
import { subscriptions, callLedger, packages } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

interface HeartbeatContext {
  driverId: string;
  subscriptionId: string;
  rideId: string;
  confirmedAt: Date;
}

export async function recordCallDeduction(
  ctx: HeartbeatContext,
): Promise<{ deducted: boolean }> {
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, ctx.subscriptionId));
    if (!sub || sub.status !== "active") {
      logger.warn(
        "[heartbeat] deduction skipped — no active subscription",
        ctx,
      );
      return { deducted: false };
    }

    const isUnlimited = sub.calls_remaining === -1;
    const [pkg] = await tx
      .select({ daily_cap: packages.daily_cap })
      .from(packages)
      .where(eq(packages.id, sub.package_id))
      .limit(1);
    const dailyCap = pkg?.daily_cap ?? 200;
    if (sub.daily_calls_used >= dailyCap) {
      logger.warn("[heartbeat] daily cap reached", ctx);
      return { deducted: false };
    }

    if (!isUnlimited && sub.calls_remaining <= 0) {
      logger.warn("[heartbeat] zero balance", ctx);
      return { deducted: false };
    }

    try {
      await tx.insert(callLedger).values({
        subscription_id: ctx.subscriptionId,
        driver_id: ctx.driverId,
        ride_id: ctx.rideId,
        event_type: "deduction",
        delta: -1,
        balance_after: isUnlimited ? -1 : sub.calls_remaining - 1,
        reason: "app_fetch",
      });
    } catch (e: any) {
      if (e.code === "23505") {
        logger.info("[heartbeat] duplicate deduction prevented", ctx);
        return { deducted: false };
      }
      throw e;
    }

    await tx
      .update(subscriptions)
      .set({
        calls_remaining: isUnlimited ? -1 : sql`${subscriptions.calls_remaining} - 1`,
        daily_calls_used: sql`${subscriptions.daily_calls_used} + 1`,
        total_deductions: sql`${subscriptions.total_deductions} + 1`,
      })
      .where(eq(subscriptions.id, ctx.subscriptionId));

    return { deducted: true };
  });
}

/**
 * Refund a call that was deducted but never consummated (accept-race loss).
 *
 * call_ledger is append-only (AGENTS.md) — the deduction row is KEPT and the
 * refund is a separate row, exactly as AC-7 specifies (`event_type='refund'`,
 * `delta=+1`). The subscription restore is guarded against the unlimited
 * sentinel: unlimited subscriptions stay at -1 (they are never decremented on
 * deduction, so `-1 + 1 = 0` would bench the driver as exhausted). Idempotent:
 * a second refund for the same (ride, driver) is a no-op.
 */
export async function recordCallRefund(ctx: {
  driverId: string;
  subscriptionId: string;
  rideId: string;
}): Promise<{ refunded: boolean }> {
  return db.transaction(async (tx) => {
    const [existingRefund] = await tx
      .select({ id: callLedger.id })
      .from(callLedger)
      .where(and(
        eq(callLedger.ride_id, ctx.rideId),
        eq(callLedger.driver_id, ctx.driverId),
        eq(callLedger.event_type, "refund"),
      ))
      .limit(1);
    if (existingRefund) {
      logger.debug("[heartbeat] refund already exists — skipping", ctx);
      return { refunded: false };
    }

    const [sub] = await tx
      .select({ calls_remaining: subscriptions.calls_remaining })
      .from(subscriptions)
      .where(eq(subscriptions.id, ctx.subscriptionId))
      .limit(1);
    if (!sub) {
      logger.warn("[heartbeat] refund skipped — subscription not found", ctx);
      return { refunded: false };
    }

    const isUnlimited = sub.calls_remaining === -1;
    const restoredBalance = isUnlimited ? -1 : sub.calls_remaining + 1;

    await tx.update(subscriptions)
      .set({
        calls_remaining: restoredBalance,
        // Reverse the daily-cap usage the deduction consumed (floor at 0).
        daily_calls_used: sql`GREATEST(${subscriptions.daily_calls_used} - 1, 0)`,
      })
      .where(eq(subscriptions.id, ctx.subscriptionId));

    await tx.insert(callLedger).values({
      subscription_id: ctx.subscriptionId,
      driver_id: ctx.driverId,
      ride_id: ctx.rideId,
      event_type: "refund",
      delta: 1,
      balance_after: restoredBalance,
      reason: "accept_race_refund",
    });

    logger.info("[heartbeat] refunded unconsumed deduction", ctx);
    return { refunded: true };
  });
}
