import { logger } from './logger';

let _token: string | null = null;
let _tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token;
  const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/token/grant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', username: process.env.BKASH_USERNAME!, password: process.env.BKASH_PASSWORD! },
    body: JSON.stringify({ app_key: process.env.BKASH_APP_KEY, app_secret: process.env.BKASH_APP_SECRET }),
  });
  const data = await res.json();
  _token = data.id_token;
  _tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  return _token!;
}

export const bkashClient = {
  getToken,
  async createPayment(params: { amount: number; idempotencyKey: string; callbackUrl: string }) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/create`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
      body: JSON.stringify({
        mode: '0011', payerReference: params.idempotencyKey,
        callbackURL: params.callbackUrl,
        amount: (params.amount / 100).toFixed(2),
        currency: 'BDT', intent: 'sale',
        merchantInvoiceNumber: params.idempotencyKey,
      }),
    });
    const data = await res.json();
    logger.info('[bKash] createPayment', { paymentID: data.paymentID, status: res.status });
    return { paymentID: data.paymentID as string, bkashURL: data.bkashURL as string };
  },
  async queryPayment(paymentID: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/payment/status?paymentID=${paymentID}`, {
      headers: { Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
    });
    const data = await res.json();
    logger.info('[bKash] queryPayment', { paymentID, status: data.transactionStatus });
    return { transactionStatus: data.transactionStatus as string, trxID: data.trxID as string };
  },
  async executePayment(paymentID: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.BKASH_BASE_URL}/tokenized/checkout/execute`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Authorization: token, 'X-APP-Key': process.env.BKASH_APP_KEY! },
      body: JSON.stringify({ paymentID }),
    });
    const data = await res.json();
    return { transactionStatus: data.transactionStatus as string, trxID: data.trxID as string };
  },
};
