// [public] PortPos payment callback — handles both redirect (GET) and IPN (POST)
// After payment, PortPos redirects the user and also sends an IPN notification.

import { portposClient } from '@/lib/portpos';
import { db } from '@/src/db';
import { paymentEvents, compensationQueue } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { activateSubscription } from '@/lib/activateSubscription';
import { logger } from '@/lib/logger';

const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
const successUrl = `${baseUrl}/payment/success`;
const failureUrl = `${baseUrl}/payment/failure`;

async function processPortposPayment(invoiceId: string): Promise<'success' | 'failed'> {
  const inv = await portposClient.getInvoice(invoiceId);
  const orderStatus = inv.order?.status;

  if (orderStatus !== 'ACCEPTED' && orderStatus !== 'COMPLETED') {
    logger.warn('[portpos/callback] invoice not completed', { invoiceId, status: orderStatus });
    return 'failed';
  }

  // Find payment_event by provider_txn_id (invoice_id)
  const [evt] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.provider_txn_id, invoiceId))
    .limit(1);

  if (!evt) {
    logger.error('[portpos/callback] payment_event not found', { invoiceId });
    return 'failed';
  }

  if (evt.subscription_id) {
    logger.info('[portpos/callback] already activated', {
      paymentEventId: evt.id, subscriptionId: evt.subscription_id,
    });
    return 'success';
  }

  // Verify amount matches (anti-tamper)
  const invoiceAmountTaka = parseFloat(inv.order.amount);
  const eventAmountTaka = evt.amount_bdt / 100;
  if (Math.abs(invoiceAmountTaka - eventAmountTaka) > 0.01) {
    logger.error('[portpos/callback] amount mismatch', {
      invoiceAmount: inv.order.amount, expectedAmount: eventAmountTaka,
    });
    await db.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
    return 'failed';
  }

  await db.update(paymentEvents).set({ status: 'callback_pending' }).where(eq(paymentEvents.id, evt.id));

  if (evt.ride_id) {
    await db.update(paymentEvents).set({ status: 'paid', confirmed_at: new Date() }).where(eq(paymentEvents.id, evt.id));
    logger.info('[portpos/callback] ride payment completed', { paymentEventId: evt.id, rideId: evt.ride_id });
    return 'success';
  }

  // Package purchase — activate subscription
  try {
    const { subscriptionId } = await activateSubscription(evt.id);
    logger.info('[portpos/callback] subscription activated', { paymentEventId: evt.id, subscriptionId });
    return 'success';
  } catch (activationErr: any) {
    logger.error('[portpos/callback] activateSubscription failed, enqueuing compensation', {
      paymentEventId: evt.id, error: activationErr.message,
    });
    await db.insert(compensationQueue).values({
      payment_event_id: evt.id,
      status: 'pending',
      next_retry_at: new Date(),
      attempt_count: 0,
    });
    return 'failed';
  }
}

/**
 * GET — Browser redirect after payment.
 * PortPos redirects the user to: {redirect_url}?invoice=INVOICE_ID
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const invoiceId = url.searchParams.get('invoice');

  if (!invoiceId) {
    logger.warn('[portpos/callback] missing invoice param');
    return Response.redirect(`${failureUrl}?reason=missing_invoice`, 302);
  }

  try {
    const result = await processPortposPayment(invoiceId);
    return Response.redirect(result === 'success' ? successUrl : `${failureUrl}?reason=payment_failed`, 302);
  } catch (e: any) {
    logger.error('[portpos/callback] GET error', { invoiceId, error: e.message });
    return Response.redirect(`${failureUrl}?reason=internal_error`, 302);
  }
}

/**
 * POST — IPN notification from PortPos.
 * PortPos sends: { invoice, amount, status, reference } as JSON body.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const invoiceId = body.invoice as string;
    const _amount = body.amount as string;
    const _status = body.status as string;

    if (!invoiceId) {
      logger.warn('[portpos/callback] IPN missing invoice');
      return Response.json({ result: 'error', message: 'missing_invoice' }, { status: 400 });
    }

    const result = await processPortposPayment(invoiceId);
    return Response.json({ result: result === 'success' ? 'success' : 'error' });
  } catch (e: any) {
    logger.error('[portpos/callback] POST error', { error: e.message });
    return Response.json({ result: 'error', message: 'internal_error' }, { status: 500 });
  }
}
