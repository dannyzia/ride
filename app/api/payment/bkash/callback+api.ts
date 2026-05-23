import { bkashClient } from '@/lib/bkash';

/**
 * bKash redirects the user here after payment approval.
 * The front-end WebView intercepts this URL and reads the query params.
 * This endpoint validates the payment and returns status to the front-end.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const paymentID = url.searchParams.get('paymentID');
  const status = url.searchParams.get('status');

  if (!paymentID) return Response.json({ error: 'missing_payment_id' }, { status: 400 });

  try {
    // Query bKash for payment status
    const result = await bkashClient.queryPayment(paymentID);

    return Response.json({
      paymentID,
      status: status ?? 'unknown',
      transactionStatus: result.transactionStatus,
      trxID: result.trxID,
    });
  } catch (e: any) {
    return Response.json({ error: e.message ?? 'bkash_callback_failed' }, { status: 500 });
  }
}
