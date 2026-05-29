// [public] Nagad redirect callback (GET — browser/WebView redirect after payment)
// Nagad redirects the user to the callbackUrl after payment completion.

import { nagadClient } from '@/lib/nagad';
import { db } from '@/src/db';
import { paymentEvents, compensationQueue } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { activateSubscription } from '@/lib/activateSubscription';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get('order_id');
  const _status = url.searchParams.get('status');

  const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
  const successUrl = `${baseUrl}/payment/success`;
  const failureUrl = `${baseUrl}/payment/failure`;

  if (!orderId) {
    logger.warn('[nagad/callback] missing order_id');
    return Response.redirect(`${failureUrl}?reason=missing_order_id`, 302);
  }

  try {
    // Look up payment event by idempotency_key (stored as order_id on init)
    const [evt] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotency_key, orderId))
      .limit(1);

    if (!evt) {
      logger.error('[nagad/callback] payment_event not found', { orderId });
      return Response.redirect(`${failureUrl}?reason=not_found`, 302);
    }

    if (evt.subscription_id) {
      logger.info('[nagad/callback] already activated, redirecting to success', {
        paymentEventId: evt.id,
        subscriptionId: evt.subscription_id,
      });
      return Response.redirect(successUrl, 302);
    }

    // Verify payment status with Nagad API
    const result = await nagadClient.verifyPayment(orderId);

    if (result.status === 'Completed' || result.status === 'Success') {
      await db
        .update(paymentEvents)
        .set({ provider_txn_id: result.transactionId, status: 'callback_pending' })
        .where(eq(paymentEvents.id, evt.id));

      if (evt.ride_id) {
        // Ride payment — no subscription to activate
        await db
          .update(paymentEvents)
          .set({ status: 'paid', confirmed_at: new Date() })
          .where(eq(paymentEvents.id, evt.id));
        logger.info('[nagad/callback] ride payment completed', {
          paymentEventId: evt.id,
          rideId: evt.ride_id,
          trxID: result.transactionId,
        });
        return Response.redirect(successUrl, 302);
      }

      // Package purchase — activate subscription
      try {
        const { subscriptionId } = await activateSubscription(evt.id);
        logger.info('[nagad/callback] payment completed and subscription activated', {
          paymentEventId: evt.id,
          subscriptionId,
          trxID: result.transactionId,
        });
        return Response.redirect(successUrl, 302);
      } catch (activationErr: any) {
        logger.error('[nagad/callback] activateSubscription failed, enqueuing compensation', {
          paymentEventId: evt.id,
          error: activationErr.message,
        });
        await db.insert(compensationQueue).values({
          payment_event_id: evt.id,
          status: 'pending',
          next_retry_at: new Date(),
          attempt_count: 0,
        });
        return Response.redirect(`${failureUrl}?reason=activation_failed`, 302);
      }
    } else {
      logger.warn('[nagad/callback] payment not completed', { orderId, status: result.status });
      await db.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
      return Response.redirect(`${failureUrl}?reason=${result.status ?? 'cancelled'}`, 302);
    }
  } catch (e: any) {
    logger.error('[nagad/callback] error processing callback', { orderId, error: e.message });
    return Response.redirect(`${failureUrl}?reason=internal_error`, 302);
  }
}
