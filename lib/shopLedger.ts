/**
 * Shop settlement ledger (plan 27 §12/R1) — write-ownership ONLY HERE.
 *
 * Rules (same pattern as call_ledger/payment_events):
 * - shop_ledger rows are written ONLY by this file, inside the transaction of
 *   the state transition that produces the money event (shop-order `delivered`
 *   status PATCH; order-linked workshop-request `done` per F-13).
 * - amount_bdt is SIGNED integer paisa: credit positive / debit negative.
 * - Commission percent is fresh-read from platform_config at settlement time
 *   (§12 "seeds, not constants"): integer money math, round-half-up.
 * - Double settlement is impossible: the delivered transition happens once
 *   (state machine) AND the DB backstop is the partial unique index
 *   (order_id, entry_type) WHERE order_id IS NOT NULL (0067).
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { operatorPackages, packages, shopLedger, shopOrders } from "@/src/db/schema";
import { accrueUsageBill, reduceUsageBillForReversal } from "@/lib/billsLedger";
import { isOperatorPackageActive } from "@/lib/monetizationMode";
import { requireConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";

export type ShopTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SettleableOrder {
  id: string;
  shop_id: string;
  subtotal_bdt: number;
  /**
   * Customer-paid delivery fee snapshot (shopOrders.delivery_fee_bdt).
   * Credited to the shop ONLY via the self-delivery path below — a
   * courier-delivered order never books it (the fee is the courier's COD
   * remittance per §12, NOT shop revenue).
   */
  delivery_fee_bdt?: number | null;
}

/**
 * Settle a delivered order inside the caller's transaction:
 * credit `order_revenue` (items total = subtotal_bdt) and debit
 * `commission` when the fresh-read `shop_commission_percent` is non-zero
 * (commission is assessed on the items subtotal only — never on the
 * delivery fee). C6-4: when `opts.selfDelivered` is set AND the order
 * carries a positive delivery fee, credit `delivery_fee` (+fee) — the shop
 * delivered it itself, so the shop keeps the fee (§6.1 exhaustion
 * fallback; no courier earnings/due row exists for these orders).
 * Idempotent within the tx (existing-row check per entry_type) and across
 * processes (unique index backstop).
 */
export async function settleShopOrder(
  tx: ShopTx,
  order: SettleableOrder,
  opts: { note?: string; selfDelivered?: boolean } = {},
): Promise<{
  order_revenue_bdt: number;
  commission_bdt: number;
  usage_accrued_bdt: number;
  delivery_fee_bdt: number;
}> {
  const existing = await tx
    .select({ entry_type: shopLedger.entry_type })
    .from(shopLedger)
    .where(eq(shopLedger.order_id, order.id));

  if (existing.some((r) => r.entry_type === "order_revenue")) {
    // In-tx idempotence: treat as already settled.
    return {
      order_revenue_bdt: order.subtotal_bdt,
      commission_bdt: 0,
      usage_accrued_bdt: 0,
      delivery_fee_bdt: 0,
    };
  }

  await tx.insert(shopLedger).values({
    shop_id: order.shop_id,
    order_id: order.id,
    entry_type: "order_revenue",
    amount_bdt: order.subtotal_bdt,
    note: opts.note ?? null,
  });

  let commissionBdt = 0;
  let accruedBdt = 0;
  if (order.subtotal_bdt > 0) {
    const rate = await resolveCommissionRate(tx, order.shop_id);
    commissionBdt = rate.percent > 0 ? Math.round((order.subtotal_bdt * rate.percent) / 100) : 0;
    if (commissionBdt > 0) {
      // ── The two billing models are MUTUALLY EXCLUSIVE per order ──────────
      //
      // POSTPAID (Batch-2 Item 8b) — a package-billed shop is charged through
      // its bill, like every other operator: the commission accrues into the
      // single open usage bill (the unified owed figure / dues statement) and
      // the shop's ledger keeps GROSS revenue. No commission debit is written,
      // so the same ৳ of commission is never represented twice.
      //
      // LEGACY — an unpackaged/no-rate shop keeps the original debit-on-
      // settlement, byte-for-byte (the ledger nets the commission out of gross).
      if (rate.source === "package") {
        await accrueUsageBill(tx, {
          operatorRole: "shop",
          operatorId: order.shop_id,
          amountBdt: commissionBdt,
        });
        accruedBdt = commissionBdt;
      } else {
        await tx.insert(shopLedger).values({
          shop_id: order.shop_id,
          order_id: order.id,
          entry_type: "commission",
          amount_bdt: -commissionBdt,
          note: opts.note ?? null,
        });
      }
    }
  }

  // C6-4: self-delivery fee credit. Gated on the flag, NOT on the fee's
  // presence — a courier-delivered order carrying a fee snapshot must never
  // book this entry (its fee settles via settleDeliveryLeg instead).
  const feeBdt = opts.selfDelivered ? (order.delivery_fee_bdt ?? 0) : 0;
  if (feeBdt > 0 && !existing.some((r) => r.entry_type === "delivery_fee")) {
    await tx.insert(shopLedger).values({
      shop_id: order.shop_id,
      order_id: order.id,
      entry_type: "delivery_fee",
      amount_bdt: feeBdt,
      note: opts.note ?? null,
    });
  }

  // `commission_bdt` reports the LEDGER leg: 0 on the postpaid path (the fee
  // lives on the bill). `usage_accrued_bdt` reports the bill leg — exactly one
  // of the two is ever non-zero, per order.
  return {
    order_revenue_bdt: order.subtotal_bdt,
    commission_bdt: -commissionBdt + accruedBdt,
    usage_accrued_bdt: accruedBdt,
    delivery_fee_bdt: feeBdt > 0 ? feeBdt : 0,
  };
}

/**
 * A-1 rate precedence for a shop order (Batch-2 Item 8).
 *
 *   package with a positive rate  → that rate; the legacy percent is NOT read
 *                                  or applied (no double charge).
 *   package with no rate         → legacy shop_commission_percent continues.
 *   possession exhausted         → 0 (the billing contract lapsed; nothing
 *                                  accrues).
 *   no package ever granted      → legacy percent, exactly as before — this is
 *                                  the branch that keeps unpackaged shops
 *                                  byte-for-byte.
 */
async function resolveCommissionRate(
  tx: ShopTx,
  shopId: string,
): Promise<{ percent: number; source: "package" | "legacy" | "none" }> {
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
        eq(operatorPackages.operator_role, "shop"),
        eq(operatorPackages.operator_id, shopId),
      ),
    )
    .orderBy(desc(operatorPackages.started_at));

  if (possession.length === 0) {
    return { percent: await readPercent(), source: "legacy" };
  }

  const usable = possession.find((row) => isOperatorPackageActive(row));
  if (!usable) {
    return { percent: 0, source: "none" };
  }

  const packagePercent =
    usable.commission_percent == null ? 0 : Number(usable.commission_percent);
  if (packagePercent > 0) {
    return { percent: packagePercent, source: "package" };
  }

  return { percent: await readPercent(), source: "legacy" };
}

/** Items subtotal for a reversal that arrived without the order row. */
async function readOrderSubtotal(tx: ShopTx, orderId: string): Promise<number> {
  const [row] = await tx
    .select({ subtotal_bdt: shopOrders.subtotal_bdt })
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId))
    .limit(1);
  return Number(row?.subtotal_bdt ?? 0);
}

async function readPercent(): Promise<number> {
  try {
    return await requireConfigInt("shop_commission_percent");
  } catch (err: unknown) {
    // Missing key is a deployment defect (requireConfigInt logs loudly) — the
    // settlement transaction must not silently price off an invented zero.
    logger.error("[shopLedger] commission percent unreadable", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Reverse an order's settlement inside the caller's transaction (S7 §7 A1).
 *
 * Used by the admin force-cancel path (§7 A1 + plan line 276: "admin
 * force-cancel writes reversal entries") and by nothing else. It does NOT edit
 * the original rows — shop_ledger is append-only — it appends ONE `reversal`
 * row equal to the negative of everything the order booked (revenue +
 * self-delivery fee credits, commission debit), so the shop's balance for
 * that order nets to zero.
 *
 * "Where money moved" is literal: an order that never reached its settlement
 * point has no ledger rows and returns 0 with nothing written.
 *
 * Idempotence: in-tx check plus the (order_id, entry_type) partial unique index
 * from 0067 — at most one `reversal` row can ever exist per order.
 */
export async function reverseShopOrder(
  tx: ShopTx,
  /** `subtotal_bdt` is optional: callers that hold the order row pass it, and
   * the writer re-reads shop_orders when they do not (the postpaid reversal
   * needs the items subtotal to size the commission it takes back). */
  order: { id: string; shop_id: string; subtotal_bdt?: number },
  opts: { reason: string },
): Promise<{ reversed_bdt: number }> {
  const rows = await tx
    .select({ entry_type: shopLedger.entry_type, amount_bdt: shopLedger.amount_bdt })
    .from(shopLedger)
    .where(eq(shopLedger.order_id, order.id));

  if (rows.some((r) => r.entry_type === "reversal")) {
    return { reversed_bdt: 0 }; // already reversed — nothing to do, nothing written
  }

  const booked = rows.reduce((sum, r) => sum + Number(r.amount_bdt), 0);
  if (booked === 0) {
    return { reversed_bdt: 0 }; // no money moved — no reversal row
  }

  await tx.insert(shopLedger).values({
    shop_id: order.shop_id,
    order_id: order.id,
    entry_type: "reversal",
    amount_bdt: -booked,
    note: opts.reason,
  });

  // ── Mirror whichever pair the settlement wrote (Batch-2 Item 8b) ─────────
  // LEGACY order: the ledger carries the `commission` debit, and the reversal
  // row just written gives it back in full — no bill ever accrued for it.
  // POSTPAID order: the ledger carries GROSS revenue only (no commission row),
  // so the fee must come back out of the aggregate usage bill instead, voiding
  // it when the bill reaches zero.
  // Exactly one path runs — the pair is never mixed for the same order.
  const ledgerCommission = rows
    .filter((row) => row.entry_type === "commission")
    .reduce((sum, row) => sum + Math.abs(Number(row.amount_bdt)), 0);

  if (ledgerCommission === 0) {
    const subtotal = order.subtotal_bdt ?? (await readOrderSubtotal(tx, order.id));
    if (subtotal > 0) {
      const rate = await resolveCommissionRate(tx, order.shop_id);
      const accrued =
        rate.source === "package" && rate.percent > 0
          ? Math.round((subtotal * rate.percent) / 100)
          : 0;
      if (accrued > 0) {
        await reduceUsageBillForReversal(tx, {
          operatorRole: "shop",
          operatorId: order.shop_id,
          amountBdt: accrued,
        });
      }
    }
  }

  return { reversed_bdt: -booked };
}
