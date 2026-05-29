import crypto from 'crypto';
import { logger } from './logger';

const APP_KEY   = process.env.PORTPOS_APP_KEY;
const SECRET_KEY = process.env.PORTPOS_SECRET_KEY;
const BASE_URL  = process.env.PORTPOS_BASE_URL ?? 'https://api-sandbox.portpos.com';

/**
 * Generate PortPos Bearer token:
 * base64(APPKEY:md5(SECRETKEY + unixTimestamp))
 */
function generateAuthToken(): string {
  if (!APP_KEY || !SECRET_KEY) {
    throw new Error('PortPos not configured (PORTPOS_APP_KEY, PORTPOS_SECRET_KEY required)');
  }
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hash = crypto.createHash('md5').update(SECRET_KEY + timestamp).digest('hex');
  return Buffer.from(`${APP_KEY}:${hash}`).toString('base64');
}

interface CreateInvoiceParams {
  amount: number;       // integer paisa
  reference: string;    // our idempotency key
  redirectUrl: string;  // where user returns after payment
  ipnUrl: string;       // IPN notification URL
  packageName: string;  // product name
  billing: {
    customer: { name: string; email: string; phone: string };
    address: { street: string; city: string; state: string; zipcode: string; country: string };
  };
}

interface CreateInvoiceResult {
  invoice_id: string;
  payment_url: string;
  reference: string;
}

export const portposClient = {
  /**
   * Create a PortPos invoice for payment.
   * Amount is converted from integer paisa to taka (string) for the API.
   * Returns normalized { invoice_id, payment_url }.
   */
  async createInvoice(params: CreateInvoiceParams): Promise<CreateInvoiceResult> {
    const token = generateAuthToken();
    const amountTaka = (params.amount / 100).toFixed(2);

    const res = await fetch(`${BASE_URL}/payment/v2/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        order: {
          amount: amountTaka,
          currency: 'BDT',
          redirect_url: params.redirectUrl,
          ipn_url: params.ipnUrl,
          reference: params.reference,
        },
        product: {
          name: params.packageName,
          description: `Call Package: ${params.packageName}`,
        },
        billing: {
          customer: {
            name: params.billing.customer.name,
            email: params.billing.customer.email,
            phone: params.billing.customer.phone,
          },
          address: {
            street: params.billing.address.street,
            city: params.billing.address.city,
            state: params.billing.address.state,
            zipcode: params.billing.address.zipcode,
            country: params.billing.address.country,
          },
        },
      }),
    });

    const data = await res.json();
    logger.info('[PortPos] createInvoice', { reference: params.reference, status: res.status });

    if (data.result !== 'success' || !data.data?.invoice_id) {
      throw new Error(`PortPos createInvoice failed: ${JSON.stringify(data)}`);
    }

    return {
      invoice_id: data.data.invoice_id as string,
      payment_url: data.data.action?.url as string,
      reference: data.data.reference as string,
    };
  },

  /**
   * Retrieve invoice details by invoice_id.
   */
  async getInvoice(invoiceId: string) {
    const token = generateAuthToken();
    const res = await fetch(`${BASE_URL}/payment/v2/invoice/${invoiceId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();
    logger.info('[PortPos] getInvoice', { invoiceId, status: res.status });

    if (data.result !== 'success') {
      throw new Error(`PortPos getInvoice failed: ${JSON.stringify(data)}`);
    }

    return data.data as {
      invoice_id: string;
      order: { amount: string; currency: string; status: string };
      reference?: string;
    };
  },

  /**
   * Verify IPN signature by calling the IPN validate endpoint.
   * Returns true if the invoice is in ACCEPTED/COMPLETED status.
   */
  async verifyIPN(invoiceId: string, amount: string): Promise<boolean> {
    const token = generateAuthToken();
    const res = await fetch(
      `${BASE_URL}/payment/v2/invoice/ipn/${invoiceId}/${amount}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );

    const data = await res.json();
    logger.info('[PortPos] verifyIPN', { invoiceId, status: res.status });

    return data.result === 'success' && (data.data?.order?.status === 'ACCEPTED' || data.data?.order?.status === 'COMPLETED');
  },
};
