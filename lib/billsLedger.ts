// Write-ownership (AGENTS.md): `driver_bills` rows may ONLY be created/settled
// through this module. `lib/fleetAssignment.ts` is the precedent for a single
// writer module over a money table; every function takes the caller's tx handle
// — no module-level `db` writes (Item 3, pinned per M-12).
import * as schema from '@/src/db/schema';
import { driverErrorCode } from '@/lib/idempotency';
import { logger } from './logger';
import { and, eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;
const { driverBills, paymentEvents } = schema;

/** The DB rejected a second open subscription_purchase bill for this driver (driver_bills_one_open_uq). The purchase route maps this to `409 dues_outstanding_purchase_blocked` (IR-A15). */
export class BillSlotConflictError extends Error {
  constructor() {
    super('driver_bills_one_open_uq: a driver already holds an open subscription bill');
    this.name = 'BillSlotConflictError';
  }
}

/** Insert an open subscription-purchase bill inside the shared purchase transaction.
 * The grant MUST run first (the bill's subscription_id/due_at depend on it); a
 * 23505 here rolls the grant and call_ledger back completely (owner fix, Gate 3).
 */
export async function createOpenBill(
  tx: Tx,
  params: { driverId: string; subscriptionId: string; amountBdt: number; dueAt: Date },
): Promise<{ id: string; driver_id: string; amount_bdt: number; due_at: Date | null; status: string }> {
  try {
    const [bill] = await tx
      .insert(driverBills)
      .values({
        driver_id: params.driverId,
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
      driverId: params.driverId,
      subscriptionId: params.subscriptionId,
      amountBdt: params.amountBdt,
    });
    return {
      id: bill.id,
      driver_id: bill.driver_id,
      amount_bdt: bill.amount_bdt,
      due_at: bill.due_at,
      status: bill.status,
    };
  } catch (err) {
    if (driverErrorCode(err) === '23505') {
      logger.warn('[billsLedger] open bill slot conflict', { driverId: params.driverId });
      throw new BillSlotConflictError();
    }
    throw err;
  }
}

/** Settle the driver's single open subscription_purchase bill under the driver advisory lock,
 * linking it to the settlement payment event. Idempotent: replays return null when the bill is
 * already settled with the same event (driver_bills_payment_event_uq makes double-settlement structurally impossible).
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

  await tx.execute(sql.raw("SELECT pg_advisory_xact_lock(hashtext('purchase_bill_' || " + evt.driver_id + "))"));

  const [bill] = await tx
    .select()
    .from(driverBills)
    .where(
      and(
        eq(driverBills.driver_id, evt.driver_id),
        eq(driverBills.status, 'open'),
        eq(driverBills.kind, 'subscription_purchase'),
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
    .update(driverBills)
    .set({ status: 'settled', payment_event_id: params.eventId, updated_at: now })
    .where(eq(driverBills.id, bill.id));

  await tx
    .update(paymentEvents)
    .set({ status: 'paid', confirmed_at: now })
    .where(eq(paymentEvents.id, params.eventId));

  logger.info('[billsLedger] subscription bill settled', {
    billId: bill.id,
    driverId: evt.driver_id,
    paymentEventId: params.eventId,
  });
  return { billId: bill.id };
}
