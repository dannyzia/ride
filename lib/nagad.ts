import { logger } from './logger';
import crypto from 'crypto';

const MERCHANT_ID   = process.env.NAGAD_MERCHANT_ID;
const PRIVATE_KEY   = process.env.NAGAD_MERCHANT_PRIVATE_KEY;
const PUBLIC_KEY    = process.env.NAGAD_MERCHANT_PUBLIC_KEY;
const BASE_URL      = process.env.NAGAD_BASE_URL;

/**
 * RSA-encrypt sensitive payload data using the merchant's public key.
 * Nagad requires the merchant to encrypt the payment data with their
 * own public key; Nagad decrypts it server-side using the merchant's private key.
 */
function rsaEncrypt(data: string): string {
  if (!PUBLIC_KEY) throw new Error('NAGAD_MERCHANT_PUBLIC_KEY not configured');
  return crypto.publicEncrypt(PUBLIC_KEY, Buffer.from(data)).toString('base64');
}

export const nagadClient = {
  /**
   * Initialize a Nagad payment session.
   *
   * POSTs the encrypted payment data to:
   *   {NAGAD_BASE_URL}/api/dfs/check-out/initialize/{NAGAD_MERCHANT_ID}/{orderId}
   *
   * Amount is converted from integer paisa to taka (string) before sending.
   */
  async initPayment(params: { amount: number; orderId: string; callbackUrl: string }): Promise<{ url: string }> {
    if (!MERCHANT_ID || !BASE_URL || !PRIVATE_KEY || !PUBLIC_KEY) {
      throw new Error('Nagad payment not configured (NAGAD_MERCHANT_ID, NAGAD_BASE_URL, NAGAD_MERCHANT_PRIVATE_KEY, NAGAD_MERCHANT_PUBLIC_KEY required)');
    }

    // Convert paisa to taka for the Nagad API
    const amountTaka = (params.amount / 100).toFixed(2);

    const paymentData = JSON.stringify({
      merchantId: MERCHANT_ID,
      orderId: params.orderId,
      currency: 'BDT',
      amount: amountTaka,
      callbackUrl: params.callbackUrl,
    });

    const encryptedData = rsaEncrypt(paymentData);

    const res = await fetch(
      `${BASE_URL}/api/dfs/check-out/initialize/${MERCHANT_ID}/${params.orderId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          merchantId: MERCHANT_ID,
          orderId: params.orderId,
          paymentData: encryptedData,
        }),
      },
    );

    const data = await res.json();
    logger.info('[Nagad] initPayment', { orderId: params.orderId, status: res.status });

    if (!data.callBackUrl) {
      throw new Error(`Nagad initPayment failed: ${JSON.stringify(data)}`);
    }

    return { url: data.callBackUrl as string };
  },

  /**
   * Verify a completed Nagad payment by order ID.
   *
   * GETs from:
   *   {NAGAD_BASE_URL}/api/dfs/check-out/complete/{NAGAD_MERCHANT_ID}/{orderId}
   */
  async verifyPayment(orderId: string): Promise<{ status: string; transactionId: string }> {
    if (!MERCHANT_ID || !BASE_URL) {
      throw new Error('Nagad payment not configured (NAGAD_MERCHANT_ID, NAGAD_BASE_URL required)');
    }

    const res = await fetch(
      `${BASE_URL}/api/dfs/check-out/complete/${MERCHANT_ID}/${orderId}`,
      {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      },
    );

    const data = await res.json();
    logger.info('[Nagad] verifyPayment', { orderId, status: data.status });

    return {
      status: String(data.status ?? 'unknown'),
      transactionId: String(data.transactionId ?? ''),
    };
  },
};
