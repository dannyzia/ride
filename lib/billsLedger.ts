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

/** Bill kinds the settlement resolver may settle (Batch-2 Item 8 adds the
 * aggregated usage/commission receivable). */
const SETTLEABLE_BILL_KINDS = new Set(['subscription_purchase', 'usage']);

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
 * Batch-2 Item 8 — accrue platform fee into the operator's ONE open usage bill
 * (the aggregate receivable: the rides model, where per-event detail lives with
 * the event, not in the bill).
 *
 * Caller passes its own transaction so the accrual commits or rolls back with
 * the event that produced it (a shop order's delivered transition). Concurrent
 * events serialize on `usage_bill_<role>:<id>`, so two orders can never lose an
 * increment; the partial unique index `operator_bills_one_open_usage_uq` is the
 * backstop that forbids a second open usage row. due_at stays NULL — commission
 * is payable at any time (D6).
 *
 * amount_bdt is integer paisa and MUST be positive: a zero-fee event writes no
 * bill at all, so a 0 row here is a programming error rather than data.
 */
export async function accrueUsageBill(
  tx: Tx,
  params: {
    operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet';
    operatorId: string;
    amountBdt: number;
  },
): Promise<{ billId: string; amount_bdt: number }> {
  if (!Number.isInteger(params.amountBdt) || params.amountBdt <= 0) {
    throw new Error(
      `accrueUsageBill: amount must be a positive integer paisa (got ${params.amountBdt})`,
    );
  }

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`usage_bill_${params.operatorRole}:${params.operatorId}`}))`,
  );

  const [existing] = await tx
    .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, params.operatorRole),
        eq(operatorBills.operator_id, params.operatorId),
        eq(operatorBills.kind, 'usage'),
        eq(operatorBills.status, 'open'),
      ),
    )
    .for('update')
    .limit(1);

  if (existing) {
    const next = existing.amount_bdt + params.amountBdt;
    await tx
      .update(operatorBills)
      .set({ amount_bdt: next, updated_at: new Date() })
      .where(eq(operatorBills.id, existing.id));
    logger.info('[billsLedger] usage bill accrued', {
      billId: existing.id,
      operatorRole: params.operatorRole,
      operatorId: params.operatorId,
      amountBdt: params.amountBdt,
      totalBdt: next,
    });
    return { billId: existing.id, amount_bdt: next };
  }

  const [bill] = await tx
    .insert(operatorBills)
    .values({
      operator_id: params.operatorId,
      operator_role: params.operatorRole,
      subscription_id: null,
      amount_bdt: params.amountBdt,
      due_at: null,
      status: 'open',
      kind: 'usage',
    })
    .onConflictDoNothing()
    .returning({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt });

  if (bill) {
    logger.info('[billsLedger] usage bill opened', {
      billId: bill.id,
      operatorRole: params.operatorRole,
      operatorId: params.operatorId,
      amountBdt: params.amountBdt,
    });
    return { billId: bill.id, amount_bdt: bill.amount_bdt };
  }

  // A writer that skipped the lock created the slot between our SELECT and
  // INSERT; the unique index rejected ours. We hold the lock now, so re-read
  // and fold the increment in.
  const [racer] = await tx
    .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, params.operatorRole),
        eq(operatorBills.operator_id, params.operatorId),
        eq(operatorBills.kind, 'usage'),
        eq(operatorBills.status, 'open'),
      ),
    )
    .for('update')
    .limit(1);
  if (!racer) {
    throw new Error('accrueUsageBill: open usage bill vanished after an insert conflict');
  }
  const next = racer.amount_bdt + params.amountBdt;
  await tx
    .update(operatorBills)
    .set({ amount_bdt: next, updated_at: new Date() })
    .where(eq(operatorBills.id, racer.id));
  logger.info('[billsLedger] usage bill accrued (post-conflict)', {
    billId: racer.id,
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    totalBdt: next,
  });
  return { billId: racer.id, amount_bdt: next };
}

/**
 * Batch-2 Item 8 — take one order's commission back out of the aggregate
 * usage bill (admin force-cancel / reversal of a delivered order).
 *
 * The accrual is an aggregate, so the reversal is a subtraction under the same
 * usage lock. A bill reduced to zero is voided rather than left as a 0-amount
 * open row (it must leave the owed figure and free the one-open slot). Settled
 * bills are money already received and are never rewritten: they return null.
 */
export async function reduceUsageBillForReversal(
  tx: Tx,
  params: { operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet'; operatorId: string; amountBdt: number },
): Promise<{ billId: string; amount_bdt: number } | null> {
  if (!Number.isInteger(params.amountBdt) || params.amountBdt <= 0) {
    throw new Error(
      `reduceUsageBillForReversal: amount must be a positive integer paisa (got ${params.amountBdt})`,
    );
  }

  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`usage_bill_${params.operatorRole}:${params.operatorId}`}))`,
  );

  const [bill] = await tx
    .select({ id: operatorBills.id, amount_bdt: operatorBills.amount_bdt })
    .from(operatorBills)
    .where(
      and(
        eq(operatorBills.operator_role, params.operatorRole),
        eq(operatorBills.operator_id, params.operatorId),
        eq(operatorBills.kind, 'usage'),
        eq(operatorBills.status, 'open'),
      ),
    )
    .for('update')
    .limit(1);
  if (!bill) return null;

  const next = Math.max(0, bill.amount_bdt - params.amountBdt);
  await tx
    .update(operatorBills)
    .set({
      amount_bdt: next,
      status: next === 0 ? 'void' : 'open',
      updated_at: new Date(),
    })
    .where(eq(operatorBills.id, bill.id));

  logger.info('[billsLedger] usage bill reduced for reversal', {
    billId: bill.id,
    operatorRole: params.operatorRole,
    operatorId: params.operatorId,
    reducedBy: params.amountBdt,
    totalBdt: next,
  });
  return { billId: bill.id, amount_bdt: next };
}

/**
 * Batch-2 Item 8b — settle EVERY bill stamped with one payment event.
 *
 * Usage bills are aggregated receivables, so one payment clears all open usage
 * rows an operator holds at initiation time; they share the event stamp
 * (migration 0100 scopes the M-14 unique index to subscription bills, which
 * remain 1:1). The subscription rail keeps its single-bill behavior — it simply
 * has one row stamped.
 *
 * Order of operations: read the stamps WITHOUT a row lock to learn which
 * operator locks are needed, take those advisory locks in sorted order (so two
 * callbacks can never deadlock against each other), then re-read FOR UPDATE and
 * settle. `null` means "nothing left to settle" (a replay), never an error.
 */
async function settleStampedBills(
  tx: Tx,
  evt: { id: string; amount_bdt: number },
): Promise<{ billId: string; billIds: string[]; amountBdt: number } | null> {
  const stamps = await tx
    .select({
      id: operatorBills.id,
      operator_role: operatorBills.operator_role,
      operator_id: operatorBills.operator_id,
    })
    .from(operatorBills)
    .where(eq(operatorBills.payment_event_id, evt.id));

  if (stamps.length === 0) return null;

  const lockKeys = Array.from(
    new Set(stamps.map((s) => operatorPurchaseLockKey(s.operator_role, s.operator_id))),
  ).sort();
  for (const key of lockKeys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }

  const bills = await tx
    .select()
    .from(operatorBills)
    .where(eq(operatorBills.payment_event_id, evt.id))
    .for('update');

  const settleable = bills.filter(
    (b) => b.status === 'open' && SETTLEABLE_BILL_KINDS.has(b.kind),
  );
  if (settleable.length === 0) {
    logger.debug('[billsLedger] every stamped bill already settled (replay no-op)', {
      paymentEventId: evt.id,
    });
    return null;
  }

  for (const bill of settleable) {
    await markBillSettled(tx, bill, evt.id);
  }

  const settledTotal = settleable.reduce((sum, b) => sum + b.amount_bdt, 0);
  // Money-integrity check: the invoice was priced from exactly these bills. A
  // drift means an accrual landed after initiation but before the stamp — the
  // shortfall must surface, not be silently absorbed.
  if (settledTotal !== evt.amount_bdt) {
    logger.error('[billsLedger] settled total does not match the payment event amount', {
      paymentEventId: evt.id,
      settledTotal,
      eventAmountBdt: evt.amount_bdt,
      billIds: settleable.map((b) => b.id),
    });
  }

  return {
    billId: settleable[0].id,
    billIds: settleable.map((b) => b.id),
    amountBdt: settledTotal,
  };
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
 * Settle every bill stamped with one settlement payment event, under the
 * operator advisory locks.
 *
 * Batch-2 Item 8b: a subscription bill stays 1:1 with its event
 * (`operator_bills_payment_event_uq`, now kind-scoped by migration 0100); the
 * aggregated usage receivables may share one event stamp, because one payment
 * clears all of them.
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
 * operator_bills_payment_event_uq keeps a subscription bill 1:1 with its event;
 * usage bills may share one stamp (migration 0100), and ALL of them settle here.
 */
export async function settleSubscriptionBill(
  tx: Tx,
  params: { eventId: string },
): Promise<{ billId: string; billIds: string[]; amountBdt: number } | null> {
  const [evt] = await tx
    .select({
      id: paymentEvents.id,
      driver_id: paymentEvents.driver_id,
      amount_bdt: paymentEvents.amount_bdt,
    })
    .from(paymentEvents)
    .where(eq(paymentEvents.id, params.eventId))
    .for('update')
    .limit(1);
  if (!evt) return null;

  // ── PRIMARY: the initiation stamp ────────────────────────────────────────
  // Batch-2 Item 8/8b: the stamp resolves any settleable bill kind, and one
  // event may carry the stamps of the whole open usage set (aggregated
  // receivables). Subscription bills stay 1:1 (operator_bills_payment_event_uq).
  const stamped = await settleStampedBills(tx, evt);
  if (stamped) return stamped;

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

  return { ...(await markBillSettled(tx, bill, evt.id)), billIds: [bill.id], amountBdt: bill.amount_bdt };
}
