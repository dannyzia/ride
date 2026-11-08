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
 *     is the F-38 short-pay evidence (D1-2 Reading A, owner ruling
 *     2026-10-17): the due stays the FULL subtotal — the shortfall is
 *     courier liability, recorded on the due row's remittance_note so
 *     "never paid" is never a one-sided claim.
 *
 * Batch-2 Item 9 — the PLATFORM-FEE leg only (D7: the COD remittance rows and
 * the dispatch-hold rules below are a different ledger and are NOT touched by
 * this hook). The fee is priced through the same A-1 matrix the shop path uses
 * (lib/shopLedger.resolveCommissionRate): an ACTIVE delivery possession whose
 * package carries a positive rate REPLACES `delivery_commission_percent`, and
 * the fee accrues into the courier's aggregate usage bill (postpaid-gross XOR:
 * the earnings row keeps the fee whole — no at-source deduction). Unpackaged /
 * no-rate couriers keep the legacy percent byte-for-byte; an exhausted
 * possession prices at 0. The two legs are never additive.
 * The delivery operator is the courier ENTITY — couriers.id WHERE
 * courier_type='food' (the Item 6 mapping in lib/operatorPurchase) — so the
 * bill is the same row the delivery dues screen reads and settles.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  deliveries,
  deliveryEarnings,
  courierRemittanceDues,
  operatorPackages,
  packages,
  shopOrders,
  couriers,
} from '@/src/db/schema';
import { accrueUsageBill, reduceUsageBillForReversal } from '@/lib/billsLedger';
import { isOperatorPackageActive } from '@/lib/monetizationMode';
import { requireConfigInt } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

export interface SettleDeliveryLegResult {
  /** Paisa credited to the courier. GROSS on the postpaid path (the fee is billed, not withheld). */
  earned_bdt: number;
  /** Paisa withheld from the earnings AT SOURCE. 0 on the postpaid path. */
  commission_bdt: number;
  /** Paisa accrued into the courier's aggregate usage bill. 0 on the legacy path. */
  usage_accrued_bdt: number;
  due_bdt: number;
}

/** DB tx handle type (same shape leadBilling uses). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Which rate governs this courier's platform fee, and who the bill belongs to. */
interface DeliveryFeeRate {
  percent: number;
  source: 'package' | 'legacy' | 'none';
  /** couriers.id holding the possession (Item 6 mapping); null on the legacy/no-package path. */
  operatorId: string | null;
}

/**
 * The courier ENTITY for a user: `couriers.id WHERE user_id = $1 AND
 * courier_type = 'food'`. This is the exact Item 6 ownership mapping
 * (lib/operatorPurchase.resolveOperatorIdentity 'delivery'), which is what
 * operator_packages / operator_bills are keyed by — so the fee accrues onto the
 * very bill the delivery dues screen shows. Parcel couriers are driver-role and
 * have no delivery possession: their fee stays on the legacy percent.
 */
async function resolveDeliveryCourierId(
  tx: DbTx,
  courierUserId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: couriers.id })
    .from(couriers)
    .where(and(eq(couriers.user_id, courierUserId), eq(couriers.courier_type, 'food')))
    .limit(1);
  return row?.id ?? null;
}

async function readLegacyPercent(): Promise<number> {
  try {
    return await requireConfigInt('delivery_commission_percent');
  } catch (err: unknown) {
    // Missing key is a deployment defect (requireConfigInt logs loudly) — the
    // settlement transaction must not price off an invented zero.
    logger.error('[deliverySettlement] commission percent unreadable', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * A-1 rate precedence for a delivery fee (Batch-2 Item 9) — the same matrix
 * lib/shopLedger.resolveCommissionRate applies to orders:
 *
 *   active package with a positive rate  → that rate; `delivery_commission_percent`
 *                                          is NOT read or applied (never additive).
 *   active package with no rate          → the legacy config percent continues.
 *   possession exhausted (expired)       → 0 (the billing contract lapsed).
 *   no package ever granted              → the legacy percent, byte-for-byte.
 */
async function resolveDeliveryFeeRate(
  tx: DbTx,
  courierUserId: string,
): Promise<DeliveryFeeRate> {
  const operatorId = await resolveDeliveryCourierId(tx, courierUserId);
  if (!operatorId) return { percent: await readLegacyPercent(), source: 'legacy', operatorId: null };

  const possession = await tx
    .select({
      status: operatorPackages.status,
      expires_at: operatorPackages.expires_at,
      commission_percent: packages.commission_percent,
    })
    .from(operatorPackages)
    .leftJoin(packages, eq(operatorPackages.package_id, packages.id))
    .where(
      and(
        eq(operatorPackages.operator_role, 'delivery'),
        eq(operatorPackages.operator_id, operatorId),
      ),
    )
    .orderBy(desc(operatorPackages.started_at));

  if (possession.length === 0) {
    return { percent: await readLegacyPercent(), source: 'legacy', operatorId: null };
  }

  const usable = possession.find((row) => isOperatorPackageActive(row));
  if (!usable) return { percent: 0, source: 'none', operatorId: null };

  const packagePercent =
    usable.commission_percent == null ? 0 : Number(usable.commission_percent);
  if (packagePercent > 0) {
    return { percent: packagePercent, source: 'package', operatorId };
  }

  return { percent: await readLegacyPercent(), source: 'legacy', operatorId: null };
}

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
    .select({
      delivery_fee_bdt: deliveries.delivery_fee_bdt,
      delivery_man_user_id: deliveries.delivery_man_user_id,
    })
    .from(deliveries)
    .where(eq(deliveries.id, legId))
    .limit(1);
  const feeBdt = leg?.delivery_fee_bdt ?? 0;

  // Batch-2 Item 9 — the DELIVERING courier comes off the delivery record (its
  // own assignee column); the caller's authenticated id is only a fallback for
  // a row written before that column was stamped. The route has already checked
  // `leg.delivery_man_user_id === auth.dbUser.id` for the action it authorized.
  const deliveringUserId = leg?.delivery_man_user_id ?? courierUserId;

  // A-1 matrix (fresh-read; missing key propagates): package rate > legacy config
  // > exhausted = 0, never additive.
  const rate = await resolveDeliveryFeeRate(tx, deliveringUserId);
  const platformFeeBdt = rate.percent > 0 ? Math.round((feeBdt * rate.percent) / 100) : 0;

  // ── The two billing models are MUTUALLY EXCLUSIVE per leg ────────────────
  // POSTPAID — a packaged courier is billed through the aggregate usage bill
  // (the dues screen's one owed figure): the fee accrues there and the earnings
  // row keeps the fee WHOLE (no at-source deduction), so the same paisa is never
  // credited and withheld at once.
  // LEGACY / EXHAUSTED — the fee is withheld from the earnings exactly as
  // before (config percent, or 0 when the possession lapsed); no bill is touched.
  let atSourceBdt = platformFeeBdt;
  let accruedBdt = 0;
  if (platformFeeBdt > 0 && rate.source === 'package' && rate.operatorId) {
    await accrueUsageBill(tx, {
      operatorRole: 'delivery',
      operatorId: rate.operatorId,
      amountBdt: platformFeeBdt,
    });
    accruedBdt = platformFeeBdt;
    atSourceBdt = 0;
  }
  const netBdt = feeBdt - atSourceBdt;

  await tx.insert(deliveryEarnings).values({
    delivery_man_user_id: courierUserId,
    leg_id: legId,
    order_id: orderId,
    fee_bdt: feeBdt,
    commission_bdt: atSourceBdt,
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
    rateSource: rate.source,
    ratePercent: rate.percent,
    commissionBdt: atSourceBdt,
    usageAccruedBdt: accruedBdt,
    netBdt,
    dueBdt,
  });

  return {
    earned_bdt: netBdt,
    commission_bdt: atSourceBdt,
    usage_accrued_bdt: accruedBdt,
    due_bdt: dueBdt,
  };
}

/**
 * Batch-2 Item 9 — take a delivered leg's platform fee back out of the
 * courier's aggregate usage bill (reversal parity with
 * lib/shopLedger.reverseShopOrder's postpaid branch).
 *
 * Mirror, exactly:
 *   POSTPAID leg  — the earnings row carries NO commission (commission_bdt = 0,
 *                   the fee lives on the bill), so the fee must come back out of
 *                   the bill, recomputed from the leg's own fee_bdt × the rate
 *                   that governs today (the postpaid path leaves no per-leg
 *                   receipt, so this is the same recomputation the shop reversal
 *                   performs from shop_orders.subtotal_bdt).
 *   LEGACY leg    — the fee was withheld at source; nothing ever accrued, so no
 *                   bill is touched. Exactly one path runs per leg.
 *
 * Scope guard: this reads delivery_earnings and reduces operator_bills. It never
 * writes courier_remittance_dues, delivery_earnings, or any hold input — COD
 * remittance is a different custody ledger (D7) and stays exactly as it is.
 *
 * Idempotence: the caller invokes it only in the transaction that just wrote the
 * shop ledger reversal row for this order (`reversed_bdt !== 0`), and that row is
 * the barrier — a second force-cancel is a 409 before it ever reaches here, and a
 * repeat call would return 0 from reverseShopOrder and skip this hook.
 */
export async function reverseDeliveryUsageForOrder(
  tx: DbTx,
  opts: { orderId: string },
): Promise<{ reduced_bdt: number }> {
  const rows = await tx
    .select({
      leg_id: deliveryEarnings.leg_id,
      delivery_man_user_id: deliveryEarnings.delivery_man_user_id,
      fee_bdt: deliveryEarnings.fee_bdt,
      commission_bdt: deliveryEarnings.commission_bdt,
    })
    .from(deliveryEarnings)
    .where(eq(deliveryEarnings.order_id, opts.orderId));

  let reducedBdt = 0;
  for (const row of rows) {
    // Nothing moved on this leg (never delivered) or the row is not a fee credit.
    if (!Number.isInteger(row.fee_bdt) || row.fee_bdt <= 0) continue;
    // Legacy pair: the fee came off the earnings, so no bill accrued for it.
    if (row.commission_bdt > 0) continue;

    const rate = await resolveDeliveryFeeRate(tx, row.delivery_man_user_id);
    if (rate.source !== 'package' || rate.percent <= 0 || !rate.operatorId) continue;

    const accrued = Math.round((row.fee_bdt * rate.percent) / 100);
    if (accrued <= 0) continue;

    await reduceUsageBillForReversal(tx, {
      operatorRole: 'delivery',
      operatorId: rate.operatorId,
      amountBdt: accrued,
    });
    reducedBdt += accrued;

    logger.info('[deliverySettlement] usage bill reduced for reversal', {
      orderId: opts.orderId,
      legId: row.leg_id,
      operatorId: rate.operatorId,
      reducedBy: accrued,
    });
  }

  return { reduced_bdt: reducedBdt };
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
        sql`${courierRemittanceDues.created_at} < ${cutoff.toISOString()}`,
      ),
    );
  const overdueTotal = Number(row?.total ?? 0);
  return overdueTotal > 0 && overdueTotal >= thresholdBdt;
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
        sql`${courierRemittanceDues.created_at} < ${cutoff.toISOString()}`,
      ),
    )
    .groupBy(courierRemittanceDues.delivery_man_user_id);
  const held = new Set<string>();
  for (const row of rows) {
    const total = Number(row.total ?? 0);
    if (total > 0 && total >= thresholdBdt) held.add(row.user_id);
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
