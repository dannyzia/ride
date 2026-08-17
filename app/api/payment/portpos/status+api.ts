import { db } from '@/src/db';
import { paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

/**
 * GET /api/payment/portpos/status?invoice_id=...
 *
 * Polling endpoint used by PaymentWebView to check whether a PortPos payment
 * has been confirmed. Queries the paymentEvents table by provider_txn_id
 * (which stores the PortPos invoice_id).
 *
 * Returns the current payment status and subscription_id if activated.
 */
export async function GET(request: Request) {
  try {
    const _user = await verifySupabaseToken(request);

    const url = new URL(request.url);
    const invoiceId = url.searchParams.get('invoice_id');

    if (!invoiceId) {
      return Response.json({ error: 'missing_invoice_id', message: 'invoice_id query param is required' }, { status: 400 });
    }

    const [evt] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.provider_txn_id, invoiceId))
      .limit(1);

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
    logger.error('[payment/portpos/status] error', e);
    return Response.json({ error: 'internal_error', message: 'Status check failed' }, { status: 500 });
  }
}
