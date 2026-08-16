import { db } from '@/src/db';
import { paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { portposClient } from '@/lib/portpos';
import { logger } from '@/lib/logger';

/**
 * Write-ownership (AGENTS.md): payment_events rows may ONLY be created through
 * `initiatePortposPayment` in this file. The payment-initiation routes call it:
 *   - app/api/rider/wallet/topup+api.ts
 *   - app/api/rider/passes+api.ts
 *   - app/api/driver/wallet/topup+api.ts
 *   - app/api/package/purchase+api.ts
 * Status transitions (paid/failed) happen ONLY in lib/activateSubscription.ts
 * and app/api/payment/portpos/callback+api.ts. No other file writes
 * payment_events directly.
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
  const [evt] = await db.insert(paymentEvents).values({
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
