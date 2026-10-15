/**
 * deliverySettlement.ts — plan 27 §12 COD settlement for delivery legs.
 *
 * Write ownership (same rule as shop_ledger / call_ledger): ONLY this file
 * writes delivery_earnings and courier_remittance_dues rows. It is called
 * inside the delivered-transition transaction (courier deliver action), so
 * the earnings credit, the remittance due, and the leg state commit or roll
 * back together.
 *
 * Money model (§12, integer paisa, fresh-read seeds never constants):
 *   - earnings:  net = fee − round(fee × commission% ÷ hundred)
 *     (0% commission at launch → the courier keeps the whole fee; owner
 *     ruling: couriers keep 100% of the delivery fee at launch).
 *   - dues:     the items-total cash the courier collected ON BEHALF OF THE
 *     SHOP (F-33 custody: +items, −fee earned). The due is the order's
 *     subtotal snapshot — the fee cash is already the courier's earnings.
 *     A recorded amount_collected_bdt different from the expected COD total
 *     is the F-38 short-pay evidence: the due records what was actually
 *     collected, and the shortfall is visible in the courier's dues list.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  deliveries,
  deliveryEarnings,
  courierRemittanceDues,
  shopOrders,
  couriers,
} from '@/src/db/schema';
import { requireConfigInt } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

export interface SettleDeliveryLegResult {
  earned_bdt: number;
  commission_bdt: number;
  due_bdt: number;
}

/** DB tx handle type (same shape leadBilling uses). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Settle one delivered leg inside the caller's transaction:
 * insert the earnings credit + the COD remittance due, both idempotent on
 * (leg_id) via the unique indexes (read-first so a same-tx re-entry is a
 * no-op, mirroring settleShopOrder).
 */
export async function settleDeliveryLeg(
  tx: DbTx,
  opts: { legId: string; orderId: string; courierUserId: string },
): Promise<SettleDeliveryLegResult | null> {
  const { legId, orderId, courierUserId } = opts;

  const [existingEarning] = await tx
    .select({ id: deliveryEarnings.id })
    .from(deliveryEarnings)
    .where(eq(deliveryEarnings.leg_id, legId))
    .limit(1);
  if (existingEarning) return null; // already settled — no-op

  const [leg] = await tx
    .select({ delivery_fee_bdt: deliveries.delivery_fee_bdt })
    .from(deliveries)
    .where(eq(deliveries.id, legId))
    .limit(1);
  const feeBdt = leg?.delivery_fee_bdt ?? 0;

  // Fresh-read commission (seeds-not-constants): missing key propagates.
  const commissionPercent = await requireConfigInt('delivery_commission_percent');
  const commissionBdt = Math.round((feeBdt * commissionPercent) / 100);
  const netBdt = feeBdt - commissionBdt;

  await tx.insert(deliveryEarnings).values({
    delivery_man_user_id: courierUserId,
    leg_id: legId,
    order_id: orderId,
    fee_bdt: feeBdt,
    commission_bdt: commissionBdt,
    net_bdt: netBdt,
  });

  // COD remittance due — items-total cash collected for the shop. Only for
  // shop orders (P2P legs have no shop to remit to; their dues lane is the
  // F-38 receipt/dispute flow, recorded when P2P origination lands).
  let dueBdt = 0;
  const [order] = await tx
    .select({ id: shopOrders.id, subtotal_bdt: shopOrders.subtotal_bdt })
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId))
    .limit(1);
  if (order) {
    const [legRow] = await tx
      .select({
        amount_collected_bdt: deliveries.amount_collected_bdt,
        delivery_fee_bdt: deliveries.delivery_fee_bdt,
      })
      .from(deliveries)
      .where(eq(deliveries.id, legId))
      .limit(1);
    // §12 custody: the courier collected items + fee in cash on behalf of the
    // shop — the FEE is the courier's own earnings (credited above), so the
    // REMITTANCE DUE is the shop's items subtotal, always. The courier's
    // amount_collected entry is F-38 evidence: when it falls short of the
    // expected COD total (subtotal + fee), the shortfall is recorded on the
    // due row so "never paid" is never a one-sided claim.
    dueBdt = order.subtotal_bdt;
    const expected = order.subtotal_bdt + (legRow?.delivery_fee_bdt ?? feeBdt);
    const collected = legRow?.amount_collected_bdt;
    const shortfall = collected != null ? expected - collected : 0;
    await tx.insert(courierRemittanceDues).values({
      delivery_man_user_id: courierUserId,
      leg_id: legId,
      order_id: orderId,
      amount_bdt: dueBdt,
      status: 'pending',
      remittance_note:
        shortfall > 0
          ? `F-38 short-pay: expected ${expected} paisa collected, courier recorded ${collected} (short ${shortfall})`
          : null,
    });
  }

  logger.info('[deliverySettlement] leg settled', {
    legId,
    orderId,
    courierUserId,
    feeBdt,
    commissionBdt,
    netBdt,
    dueBdt,
  });

  return { earned_bdt: netBdt, commission_bdt: commissionBdt, due_bdt: dueBdt };
}

/**
 * Dispatch hold (F-33 → §12 dues threshold → reminders → hold): true when the
 * courier's OVERDUE pending dues (older than cod_remittance_overdue_days,
 * past the threshold) meet or exceed cod_dispatch_hold_threshold_bdt.
 * Both keys are fresh-read; threshold 0 = any overdue due holds.
 * Used as a delivery-dispatch candidate filter AND an accept-time guard.
 */
export async function courierDebtHoldsDispatch(
  courierUserId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [overdueDays, thresholdBdt] = await Promise.all([
    requireConfigInt('cod_remittance_overdue_days'),
    requireConfigInt('cod_dispatch_hold_threshold_bdt'),
  ]);
  const cutoff = new Date(now.getTime() - overdueDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      total: sql<string | null>`coalesce(sum(${courierRemittanceDues.amount_bdt}), 0)`,
    })
    .from(courierRemittanceDues)
    .where(
      and(
        eq(courierRemittanceDues.delivery_man_user_id, courierUserId),
        eq(courierRemittanceDues.status, 'pending'),
        sql`${courierRemittanceDues.created_at} < ${cutoff}`,
      ),
    );
  const overdueTotal = Number(row?.total ?? 0);
  return overdueTotal >= thresholdBdt;
}

/** Batch variant for the dispatch candidate pool (one query, same rule). */
export async function couriersOnDispatchHold(
  courierUserIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (courierUserIds.length === 0) return new Set();
  const [overdueDays, thresholdBdt] = await Promise.all([
    requireConfigInt('cod_remittance_overdue_days'),
    requireConfigInt('cod_dispatch_hold_threshold_bdt'),
  ]);
  const cutoff = new Date(now.getTime() - overdueDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      user_id: courierRemittanceDues.delivery_man_user_id,
      total: sql<string | null>`coalesce(sum(${courierRemittanceDues.amount_bdt}), 0)`,
    })
    .from(courierRemittanceDues)
    .where(
      and(
        inArray(courierRemittanceDues.delivery_man_user_id, courierUserIds),
        eq(courierRemittanceDues.status, 'pending'),
        sql`${courierRemittanceDues.created_at} < ${cutoff}`,
      ),
    )
    .groupBy(courierRemittanceDues.delivery_man_user_id);
  const held = new Set<string>();
  for (const row of rows) {
    if (Number(row.total ?? 0) >= thresholdBdt) held.add(row.user_id);
  }
  return held;
}

/**
 * Read the courier's dues ledger (earnings screen + remittance list).
 * Caller-scoped; newest first.
 */
export async function courierRemittanceSummary(courierUserId: string) {
  const dues = await db
    .select()
    .from(courierRemittanceDues)
    .where(eq(courierRemittanceDues.delivery_man_user_id, courierUserId))
    .orderBy(sql`${courierRemittanceDues.created_at} DESC`)
    .limit(100);
  const earnings = await db
    .select()
    .from(deliveryEarnings)
    .where(eq(deliveryEarnings.delivery_man_user_id, courierUserId))
    .orderBy(sql`${deliveryEarnings.created_at} DESC`)
    .limit(100);
  const pendingTotal = dues
    .filter((d) => d.status === 'pending')
    .reduce((sum, d) => sum + d.amount_bdt, 0);
  const earnedTotal = earnings.reduce((sum, e) => sum + e.net_bdt, 0);
  return { dues, earnings, pending_total_bdt: pendingTotal, earned_total_bdt: earnedTotal };
}

/** courier presence row helper (delivery-man eligibility probe). */
export async function activeCourierRow(courierUserId: string) {
  const [row] = await db
    .select({ id: couriers.id, status: couriers.status })
    .from(couriers)
    .where(eq(couriers.user_id, courierUserId))
    .limit(1);
  return row ?? null;
}
