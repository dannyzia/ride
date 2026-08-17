import { db } from '@/src/db';
import { paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

/**
 * GET /api/payment/bkash/status?paymentID=...
 *
 * Polling endpoint used by PaymentWebView to check whether a payment
 * has been confirmed. Queries the paymentEvents table by either:
 *   - provider_txn_id (stores the bKash paymentID after createPayment)
 *   - idempotency_key (our own UUID, passed as merchantInvoiceNumber)
 *
 * Returns the current payment status and subscription_id if activated.
 */
export async function GET(request: Request) {
  try {
    const _user = await verifySupabaseToken(request);

    const url = new URL(request.url);
    const paymentID = url.searchParams.get('paymentID');

    if (!paymentID) {
      return Response.json({ error: 'missing_paymentID', message: 'paymentID query param is required' }, { status: 400 });
    }

    // First try finding by provider_txn_id (stores bKash paymentID from createPayment)
    let [evt] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.provider_txn_id, paymentID))
      .limit(1);

    // Fallback: try by idempotency_key
    if (!evt) {
      [evt] = await db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.idempotency_key, paymentID))
        .limit(1);
    }

    if (!evt) {
      return Response.json({ status: 'not_found' });
    }

    return Response.json({
      status: evt.status,
      subscription_id: evt.subscription_id,
    });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Invalid or missing token' }, { status: 401 });
    }
    logger.error('[payment/bkash/status] error', e);
    return Response.json({ error: 'internal_error', message: 'Status check failed' }, { status: 500 });
  }
}
