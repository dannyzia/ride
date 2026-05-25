// [public] bKash redirect callback (GET — browser/WebView redirect after payment)
// Queried by bKash tokenized checkout. Always returns 200 or redirect.

import { bkashClient } from '@/lib/bkash';
import { db } from '@/src/db';
import { paymentEvents, compensationQueue } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { activateSubscription } from '@/lib/activateSubscription';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentID = url.searchParams.get('paymentID');
  const status = url.searchParams.get('status');
  const merchantInvoiceNumber = url.searchParams.get('merchantInvoiceNumber');

  const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';
  const successUrl = `${baseUrl}/payment/success`;
  const failureUrl = `${baseUrl}/payment/failure`;

  if (!paymentID || !merchantInvoiceNumber) {
    logger.warn('[bkash/callback] missing required params', { paymentID, merchantInvoiceNumber });
    return Response.redirect(`${failureUrl}?reason=missing_params`, 302);
  }

  try {
    const [evt] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotency_key, merchantInvoiceNumber))
      .limit(1);

    if (!evt) {
      logger.error('[bkash/callback] payment_event not found', { merchantInvoiceNumber });
      return Response.redirect(`${failureUrl}?reason=not_found`, 302);
    }

    if (evt.subscription_id) {
      logger.info('[bkash/callback] already activated, redirecting to success', {
        paymentEventId: evt.id,
        subscriptionId: evt.subscription_id,
      });
      return Response.redirect(successUrl, 302);
    }

    if (status === 'success') {
      // Verify with bKash API — don't trust redirect params alone
      const queryResult = await bkashClient.queryPayment(paymentID);
      if (queryResult.transactionStatus !== 'Completed') {
        logger.warn('[bkash/callback] queryPayment indicates not completed', {
          paymentID,
          transactionStatus: queryResult.transactionStatus,
        });
        await db.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
        return Response.redirect(`${failureUrl}?reason=payment_not_completed`, 302);
      }

      const result = await bkashClient.executePayment(paymentID);

      if (result.transactionStatus === 'Completed') {
        await db
          .update(paymentEvents)
          .set({ provider_txn_id: result.trxID, status: 'callback_pending' })
          .where(eq(paymentEvents.id, evt.id));

        // Ride payment — no subscription to activate, just mark paid
        if (evt.ride_id) {
          await db
            .update(paymentEvents)
            .set({ status: 'paid', confirmed_at: new Date() })
            .where(eq(paymentEvents.id, evt.id));
          logger.info('[bkash/callback] ride payment completed', {
            paymentEventId: evt.id,
            rideId: evt.ride_id,
            trxID: result.trxID,
          });
          return Response.redirect(successUrl, 302);
        }

        // Package purchase — activate subscription
        try {
          const { subscriptionId } = await activateSubscription(evt.id);
          logger.info('[bkash/callback] payment completed and subscription activated', {
            paymentEventId: evt.id,
            subscriptionId,
            trxID: result.trxID,
          });
          return Response.redirect(successUrl, 302);
        } catch (activationErr: any) {
          logger.error('[bkash/callback] activateSubscription failed, enqueuing compensation', {
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
        logger.warn('[bkash/callback] executePayment did not complete', {
          paymentID,
          transactionStatus: result.transactionStatus,
        });
        await db.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
        return Response.redirect(`${failureUrl}?reason=payment_not_completed`, 302);
      }
    } else {
      logger.info('[bkash/callback] payment not successful', { paymentID, status });
      await db.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
      return Response.redirect(`${failureUrl}?reason=${status ?? 'cancelled'}`, 302);
    }
  } catch (e: any) {
    logger.error('[bkash/callback] error processing callback', { paymentID, error: e.message });
    return Response.redirect(`${failureUrl}?reason=internal_error`, 302);
  }
}
