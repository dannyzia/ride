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
import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { shopLedger } from "@/src/db/schema";
import { requireConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";

export type ShopTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface SettleableOrder {
  id: string;
  shop_id: string;
  subtotal_bdt: number;
}

/**
 * Settle a delivered order inside the caller's transaction:
 * credit `order_revenue` (items total = subtotal_bdt; the delivery fee is the
 * courier's COD remittance per §12, NOT shop revenue) and debit
 * `commission` when the fresh-read `shop_commission_percent` is non-zero.
 * Idempotent within the tx (existing-row check) and across processes
 * (unique index backstop).
 */
export async function settleShopOrder(
  tx: ShopTx,
  order: SettleableOrder,
  opts: { note?: string } = {},
): Promise<{ order_revenue_bdt: number; commission_bdt: number }> {
  const existing = await tx
    .select({ entry_type: shopLedger.entry_type })
    .from(shopLedger)
    .where(eq(shopLedger.order_id, order.id));

  if (existing.some((r) => r.entry_type === "order_revenue")) {
    // In-tx idempotence: treat as already settled.
    return { order_revenue_bdt: order.subtotal_bdt, commission_bdt: 0 };
  }

  await tx.insert(shopLedger).values({
    shop_id: order.shop_id,
    order_id: order.id,
    entry_type: "order_revenue",
    amount_bdt: order.subtotal_bdt,
    note: opts.note ?? null,
  });

  let commissionBdt = 0;
  if (order.subtotal_bdt > 0) {
    const percent = await readPercent();
    commissionBdt = percent > 0 ? Math.round((order.subtotal_bdt * percent) / 100) : 0;
    if (commissionBdt > 0) {
      await tx.insert(shopLedger).values({
        shop_id: order.shop_id,
        order_id: order.id,
        entry_type: "commission",
        amount_bdt: -commissionBdt,
        note: opts.note ?? null,
      });
    }
  }

  return { order_revenue_bdt: order.subtotal_bdt, commission_bdt: -commissionBdt };
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
 * row equal to the negative of everything the order booked (revenue credit +
 * commission debit), so the shop's balance for that order nets to zero.
 *
 * "Where money moved" is literal: an order that never reached its settlement
 * point has no ledger rows and returns 0 with nothing written.
 *
 * Idempotence: in-tx check plus the (order_id, entry_type) partial unique index
 * from 0067 — at most one `reversal` row can ever exist per order.
 */
export async function reverseShopOrder(
  tx: ShopTx,
  order: { id: string; shop_id: string },
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

  return { reversed_bdt: -booked };
}
