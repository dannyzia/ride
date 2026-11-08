// Write-ownership (AGENTS.md): `operator_bills` rows may ONLY be created/settled
// through this module (Batch-2 Item 2 — generalized from driver_bills; driver
// rows carry operator_role='driver'). Every function takes the caller's tx
// handle — no module-level `db` writes. `lib/fleetAssignment.ts` is the
// precedent for a single-writer module over a money table.
import * as schema from '@/src/db/schema';
import { driverErrorCode } from '@/lib/idempotency';
import { logger } from './logger';
import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

const { operatorBills, paymentEvents } = schema;

/** The DB rejected a second open subscription_purchase bill for this operator+role (operator_bills_one_open_uq). The purchase route maps this to `409 dues_outstanding_purchase_blocked` (IR-A15). */
export class BillSlotConflictError extends Error {
  constructor() {
    super('operator_bills_one_open_uq: this operator already holds an open subscription bill for the role');
    this.name = 'BillSlotConflictError';
  }
}

/** Insert an open subscription-purchase bill inside the shared purchase transaction.
 * The grant MUST run first (the bill's subscription_id/due_at depend on it); a
 * 23505 here rolls the grant and call_ledger back completely (owner fix, Gate 3).
 * Batch-2 Item 2: params carry the operator identity (role + id). packageId is
 * accepted for caller symmetry/logging — operator_bills has no package_id column
 * (the subscription carries the package link).
 * Batch-2 Item 6: non-driver purchases have NO subscriptions row — the grant
 * (`operator_packages`) carries the package link instead — so subscriptionId is
 * null for shop/delivery/fleet bills, and dueAt follows the grant's expires_at
 * (null = unlimited term). Driver callers are unchanged.
 */
export async function createOpenBill(
  tx: Tx,
  params: {
    operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet';
    operatorId: string;
    packageId?: string;
    subscriptionId?: string | null;
    amountBdt: number;
    dueAt: Date | null;
  },
): Promise<{ id: string; operator_id: string; operator_role: string; amount_bdt: number; due_at: Date | null; status: string }> {
  try {
    const [bill] = await tx
      .insert(operatorBills)
      .values({
        operator_id: params.operatorId,
        operator_role: params.operatorRole,
        subscription_id: params.subscriptionId ?? null,
        amount_bdt: params.amountBdt,
        due_at: params.dueAt,
        status: 'open',
        kind: 'subscription_purchase',
      })
      .returning();
    if (!bill) throw new Error('createOpenBill: insert returned no row');
    logger.info('[billsLedger] open bill created', {
      billId: bill.id,
      operatorRole: params.operatorRole,
      operatorId: params.operatorId,
      packageId: params.packageId ?? null,
      amountBdt: params.amountBdt,
    });
    return {
      id: bill.id,
      operator_id: bill.operator_id,
      operator_role: bill.operator_role,
      amount_bdt: bill.amount_bdt,
      due_at: bill.due_at,
      status: bill.status,
    };
  } catch (err) {
    if (driverErrorCode(err) === '23505') {
      logger.warn('[billsLedger] open bill slot conflict', {
        operatorRole: params.operatorRole,
        operatorId: params.operatorId,
      });
      throw new BillSlotConflictError();
    }
    throw err;
  }
}

/**
 * Batch-2 Item 8 — open ONE per-order usage bill (platform fee accrued by a
 * usage-time hook, e.g. the shop's delivered-transition commission).
 *
 * Caller passes its own transaction: the accrual must commit or roll back with
 * the event that produced it (the delivered transition). Idempotent at the DB
 * layer via `operator_bills_source_order_uq` — a retried transition returns
 * null instead of accruing twice. Usage bills never take the purchase lock and
 * never collide with the subscription slot (that barrier is kind-scoped).
 *
 * amount_bdt is integer paisa and MUST be positive: a zero-fee event writes no
 * bill at all (the caller gates on its own fresh-read rate), so a 0 row here is
 * a programming error rather than data.
 */
export async function openUsageBill(
  tx: Tx,
  params: {
    operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet';
    operatorId: string;
    amountBdt: number;
    sourceOrderId: string;
    dueAt?: Date | null;
  },
): Promise<{ id: string } | null> {
  if (!Number.isInteger(params.amountBdt) || params.amountBdt <= 0) {
    throw new Error(
      `openUsageBill: amount must be a positive integer paisa (got ${params.amountBdt})`,
    );
  }

  const [bill] = await tx
    .insert(operatorBills)
    .values({
      operator_id: params.operatorId,
      operator_role: params.operatorRole,
      subscription_id: null,
      amount_bdt: params.amountBdt,
      due_at: params.dueAt ?? null,
      status: 'open',
      kind: 'usage',
      source_order_id: params.sourceOrderId,
    })
    .onConflictDoNothing()
    .returning({ id: operatorBills.id });

  if (!bill) {
    logger.debug('[billsLedger] usage bill already accrued for this source', {
      operatorRole: params.operatorRole,
      operatorId: params.operatorId,
      sourceOrderId: params.sourceOrderId,
    });
    return null;
  }

  logger.info('[billsLedger] usage bill accrued', {
    billId: bill.id,
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    sourceOrderId: params.sourceOrderId,
    amountBdt: params.amountBdt,
  });
  return { id: bill.id };
}

/**
 * Batch-2 Item 8 — void the usage bill accrued for a producer event.
 *
 * Used by the reversal path (admin force-cancel of a delivered shop order): if
 * the ledger debit is reversed, the receivable it fed must leave the owed
 * figure too, or the shop keeps owing a fee the platform already gave back.
 * Only an OPEN usage bill is voided; settled bills are money already received
 * and are never rewritten. Idempotent: a second call finds nothing to void.
 */
export async function voidUsageBillForSource(
  tx: Tx,
  params: { operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet'; sourceOrderId: string },
): Promise<{ billId: string } | null> {
  const [bill] = await tx
    .update(operatorBills)
    .set({ status: 'void', updated_at: new Date() })
    .where(
      and(
        eq(operatorBills.operator_role, params.operatorRole),
        eq(operatorBills.source_order_id, params.sourceOrderId),
        eq(operatorBills.kind, 'usage'),
        eq(operatorBills.status, 'open'),
      ),
    )
    .returning({ id: operatorBills.id });

  if (!bill) return null;

  logger.info('[billsLedger] usage bill voided', {
    billId: bill.id,
    operatorRole: params.operatorRole,
    sourceOrderId: params.sourceOrderId,
  });
  return { billId: bill.id };
}

/**
 * The advisory lock key for one operator's purchase slot. The STRING is a
 * cross-module contract: the writer that opens the bill (lib/operatorPurchase)
 * and this resolver must use the same key, or a purchase and a settlement can
 * interleave. The driver slot keeps its legacy `purchase_bill_<id>` form.
 */
function operatorPurchaseLockKey(operatorRole: string, operatorId: string): string {
  return operatorRole === 'driver'
    ? `purchase_bill_${operatorId}`
    : `purchase_bill_${operatorRole}:${operatorId}`;
}

/** Flip the bill to settled and the event to paid (same tx, caller holds lock). */
async function markBillSettled(
  tx: Tx,
  bill: typeof operatorBills.$inferSelect,
  eventId: string,
): Promise<{ billId: string }> {
  const now = new Date();
  await tx
    .update(operatorBills)
    .set({ status: 'settled', payment_event_id: eventId, updated_at: now })
    .where(eq(operatorBills.id, bill.id));

  await tx
    .update(paymentEvents)
    .set({ status: 'paid', confirmed_at: now })
    .where(eq(paymentEvents.id, eventId));

  logger.info('[billsLedger] subscription bill settled', {
    billId: bill.id,
    operatorRole: bill.operator_role,
    operatorId: bill.operator_id,
    paymentEventId: eventId,
  });
  return { billId: bill.id };
}

/**
 * Settle the operator's single open subscription_purchase bill under the
 * operator advisory lock, linking it to the settlement payment event.
 *
 * RESOLUTION — Batch-2 Item 7 (C-B2 implementation refinement):
 *   PRIMARY  resolution-by-pre-stamp. The initiating route stamps
 *            `operator_bills.payment_event_id` with the new event id at
 *            initiation, under this same advisory lock, so the BILL carries
 *            the resolution key and payment_events needs no operator identity.
 *            Works for every role — driver included — with the callback
 *            unchanged.
 *   FALLBACK the C-B2 driver resolution, kept literal: an event that carries a
 *            driver_id but resolves no stamp settles that driver's single open
 *            subscription bill (operator_role='driver'). Any event written
 *            before the stamp existed takes this path, so the ruling's driver
 *            behavior is preserved exactly.
 *
 * Replay is a no-op: a bill already settled BY THIS EVENT returns null.
 * operator_bills_payment_event_uq makes one event settle at most one bill.
 */
export async function settleSubscriptionBill(
  tx: Tx,
  params: { eventId: string },
): Promise<{ billId: string } | null> {
  const [evt] = await tx
    .select({ id: paymentEvents.id, driver_id: paymentEvents.driver_id })
    .from(paymentEvents)
    .where(eq(paymentEvents.id, params.eventId))
    .for('update')
    .limit(1);
  if (!evt) return null;

  // ── PRIMARY: the initiation stamp ────────────────────────────────────────
  const [stamp] = await tx
    .select({
      id: operatorBills.id,
      operator_role: operatorBills.operator_role,
      operator_id: operatorBills.operator_id,
    })
    .from(operatorBills)
    .where(eq(operatorBills.payment_event_id, evt.id))
    .limit(1);

  if (stamp) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${operatorPurchaseLockKey(stamp.operator_role, stamp.operator_id)}))`,
    );
    // Re-read under the lock: a concurrent settlement may have flipped it.
    const [bill] = await tx
      .select()
      .from(operatorBills)
      .where(eq(operatorBills.id, stamp.id))
      .for('update')
      .limit(1);
    if (!bill) return null;
    if (bill.status === 'settled') {
      logger.debug('[billsLedger] bill already settled by this event (replay no-op)', {
        billId: bill.id,
        paymentEventId: evt.id,
      });
      return null;
    }
    if (bill.status !== 'open' || bill.kind !== 'subscription_purchase') return null;
    return markBillSettled(tx, bill, evt.id);
  }

  // ── FALLBACK: C-B2 literal driver resolution (unstamped events) ──────────
  if (!evt.driver_id) return null;

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${operatorPurchaseLockKey('driver', evt.driver_id)}))`,
  );

  const [bill] = await tx
    .select()
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, 'driver'),
        eq(operatorBills.operator_id, evt.driver_id),
        eq(operatorBills.status, 'open'),
        eq(operatorBills.kind, 'subscription_purchase'),
      ),
    )
    .for('update')
    .limit(1);
  if (!bill) return null;

  return markBillSettled(tx, bill, evt.id);
}
