import { db } from '@/src/db';
import * as schema from '@/src/db/schema';
import { paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { portposClient } from '@/lib/portpos';
import { logger } from '@/lib/logger';

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

/**
 * Write-ownership (AGENTS.md): payment_events rows may ONLY be created through
 * this file. All creation paths:
 *   - `initiatePortposPayment` — PortPos gateway (wallet topup, rider pass, driver package)
 *   - `createZeroAmountPaymentEvent` — ৳0 trial packages
 *   - `createCancellationFeeEventInTx` — cancellation fee tracking (in-transaction)
 * Status transitions (paid/failed) happen ONLY in lib/activateSubscription.ts,
 * app/api/payment/portpos/callback+api.ts, and lib/paymentRepair.ts.
 * No other file writes payment_events directly.
 */

export interface PortposPaymentInitiation {
  user_id?: string;
  driver_id?: string;
  package_id?: string;
  pass_id?: string;
  ride_id?: string;
  idempotency_key: string;
  amount_bdt: number;
  purpose: 'wallet_topup' | 'rider_pass' | 'driver_package';
  package_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  redirect_url: string;
  ipn_url: string;
}

export interface PaymentInitiationResult {
  payment_url: string;
  payment_event_id: string;
}

/**
 * Create the payment_events row (status 'initiated'), ask PortPos for a hosted
 * invoice, then flip the row to 'callback_pending' with the provider txn id.
 *
 * When `onConflictDoNothing` is true (driver package purchases with an
 * Idempotency-Key header) an idempotency-key collision returns `null` instead
 * of creating a second invoice — the caller is expected to fetch and return
 * the existing payment_event.
 */
/**
 * Create a payment_events row WITHOUT a gateway round-trip (M-2).
 *
 * Used for ৳0 trial packages: redirecting a new driver to a hosted checkout
 * to "pay" nothing is a funnel wall (most gateways reject zero invoices
 * outright). The row is created here — the write owner — as 'initiated' with
 * amount 0; the caller then runs activateSubscription(), which validates
 * amount == price, creates the subscription + initial_load ledger, and marks
 * the event paid.
 */
export async function createZeroAmountPaymentEvent(params: {
  driver_id?: string;
  user_id?: string;
  pass_id?: string;
  package_id?: string;
  idempotency_key: string;
  purpose: 'wallet_topup' | 'rider_pass' | 'driver_package';
}): Promise<{ id: string }> {
  const result = await db.transaction(async (tx) => {
    const [evt] = await tx.insert(paymentEvents).values({
      user_id: params.user_id,
      driver_id: params.driver_id,
      package_id: params.package_id,
      pass_id: params.pass_id,
      provider: 'portpos',
      status: 'initiated',
      idempotency_key: params.idempotency_key,
      amount_bdt: 0,
      purpose: params.purpose,
    }).returning({ id: paymentEvents.id });
    return { id: evt.id };
  });
  return result;
}

/**
 * Create a payment_events row for a cancellation fee inside the caller's
 * transaction (M-28 / §1.3).
 *
 * Cancellation fees are collected from future cashback, not through a
 * gateway. The row is created as status='paid' (the fee is owed and
 * will be collected via rider_fee_deductions). The idempotency key is
 * deterministic on the ride ID so concurrent/duplicate cancels produce
 * exactly one row (unique constraint).
 *
 * @param tx — the parent Drizzle transaction (from cancel+api.ts)
 * @param params.rideId — the cancelled ride
 * @param params.riderId — the user who is charged
 * @param params.amountBdt — cancellation fee in integer paisa
 */
export async function createCancellationFeeEventInTx(
  tx: Tx,
  params: { rideId: string; riderId: string; amountBdt: number },
): Promise<{ paymentEventId: string }> {
  const idempotencyKey = `cancel_fee_${params.rideId}`;

  const [evt] = await tx
    .insert(paymentEvents)
    .values({
      user_id: params.riderId,
      ride_id: params.rideId,
      provider: 'portpos',
      status: 'paid',
      idempotency_key: idempotencyKey,
      amount_bdt: params.amountBdt,
      purpose: 'cancellation_fee',
      confirmed_at: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });

  if (!evt) {
    // Duplicate — another concurrent cancel already created the row.
    // Fetch the existing one so the caller can reference it.
    const [existing] = await tx
      .select({ id: paymentEvents.id })
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotency_key, idempotencyKey))
      .limit(1);
    logger.info('[paymentEvents] cancellation fee event already exists', {
      rideId: params.rideId,
      existingEventId: existing?.id,
    });
    return { paymentEventId: existing?.id ?? '' };
  }

  logger.info('[paymentEvents] cancellation fee event created', {
    paymentEventId: evt.id,
    rideId: params.rideId,
    amountBdt: params.amountBdt,
  });

  return { paymentEventId: evt.id };
}

export async function initiatePortposPayment(
  params: PortposPaymentInitiation,
  opts?: { onConflictDoNothing?: boolean },
): Promise<PaymentInitiationResult | null> {
  // All payment_events writes must be transactional (AGENTS.md). The insert,
  // the PortPos invoice round-trip, and the callback_pending update commit
  // atomically — if invoice creation fails, the row is rolled back instead of
  // being orphaned in `initiated` with no provider_txn_id.
  return db.transaction(async (tx) => {
    const insert = tx.insert(paymentEvents).values({
      user_id: params.user_id,
      driver_id: params.driver_id,
      package_id: params.package_id,
      pass_id: params.pass_id,
      ride_id: params.ride_id,
      provider: 'portpos',
      status: 'initiated',
      idempotency_key: params.idempotency_key,
      amount_bdt: params.amount_bdt,
      purpose: params.purpose,
    });

    const [evt] = opts?.onConflictDoNothing
      ? await insert.onConflictDoNothing().returning({ id: paymentEvents.id })
      : await insert.returning({ id: paymentEvents.id });

    if (!evt) return null;

    const invoice = await portposClient.createInvoice({
      amount: params.amount_bdt,
      reference: params.idempotency_key,
      redirectUrl: params.redirect_url,
      ipnUrl: params.ipn_url,
      packageName: params.package_name,
      billing: {
        customer: {
          name: params.customer_name,
          email: params.customer_email,
          phone: params.customer_phone,
        },
        address: {
          street: '',
          city: 'Dhaka',
          state: 'Dhaka',
          zipcode: '1000',
          country: 'BD',
        },
      },
    });

    await tx
      .update(paymentEvents)
      .set({ provider_txn_id: invoice.invoice_id, status: 'callback_pending' })
      .where(eq(paymentEvents.id, evt.id));

    logger.info('[paymentEvents] payment initiated', {
      paymentEventId: evt.id,
      invoiceId: invoice.invoice_id,
      purpose: params.purpose,
      amountBdt: params.amount_bdt,
    });

    return { payment_url: invoice.payment_url, payment_event_id: evt.id };
  });
}
