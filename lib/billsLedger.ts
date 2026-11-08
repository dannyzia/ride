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
 */
export async function createOpenBill(
  tx: Tx,
  params: {
    operatorRole: 'driver' | 'shop' | 'delivery' | 'fleet';
    operatorId: string;
    packageId?: string;
    subscriptionId: string;
    amountBdt: number;
    dueAt: Date;
  },
): Promise<{ id: string; operator_id: string; operator_role: string; amount_bdt: number; due_at: Date | null; status: string }> {
  try {
    const [bill] = await tx
      .insert(operatorBills)
      .values({
        operator_id: params.operatorId,
        operator_role: params.operatorRole,
        subscription_id: params.subscriptionId,
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
 * Settle the operator's single open subscription_purchase bill under the
 * operator advisory lock, linking it to the settlement payment event.
 *
 * RESOLUTION MAPPING (pinned, Batch-2 Item 2): until multi-operator payment
 * events land, every settlement event carries the DRIVER identity —
 * payment_events.driver_id maps to operator_bills.operator_id with
 * operator_role='driver'. Shop/delivery/fleet settlement events are a
 * Batch-2 concern; they will pin their own role on the event.
 *
 * Idempotent: replays return null when the bill is already settled with the
 * same event (operator_bills_payment_event_uq makes double-settlement
 * structurally impossible).
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
  if (!evt || !evt.driver_id) return null;

  await tx.execute(
    sql.raw("SELECT pg_advisory_xact_lock(hashtext('purchase_bill_' || " + evt.driver_id + "))"),
  );

  const [bill] = await tx
    .select()
    .from(operatorBills)
    .where(
      and(
        // Resolution mapping (see doc above): driver events resolve the
        // operator_role='driver' slot only.
        eq(operatorBills.operator_role, 'driver'),
        eq(operatorBills.operator_id, evt.driver_id),
        eq(operatorBills.status, 'open'),
        eq(operatorBills.kind, 'subscription_purchase'),
      ),
    )
    .limit(1);
  if (!bill) return null;

  if (bill.status === 'settled' && bill.payment_event_id === params.eventId) {
    logger.debug('[billsLedger] bill already settled by this event (replay no-op)', {
      billId: bill.id,
      paymentEventId: params.eventId,
    });
    return null;
  }

  const now = new Date();
  await tx
    .update(operatorBills)
    .set({ status: 'settled', payment_event_id: params.eventId, updated_at: now })
    .where(eq(operatorBills.id, bill.id));

  await tx
    .update(paymentEvents)
    .set({ status: 'paid', confirmed_at: now })
    .where(eq(paymentEvents.id, params.eventId));

  logger.info('[billsLedger] subscription bill settled', {
    billId: bill.id,
    operatorRole: 'driver',
    operatorId: evt.driver_id,
    paymentEventId: params.eventId,
  });
  return { billId: bill.id };
}
