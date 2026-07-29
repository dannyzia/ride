import { db } from '@/src/db';
import { paymentEvents, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { portposClient, isConfigured } from '@/lib/portpos';
import { z } from 'zod';

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000).max(5000000),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [appUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;
    if (!isConfigured()) return Response.json({ error: 'payment_not_configured' }, { status: 503 });

    const reference = crypto.randomUUID();
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

    const [evt] = await db.insert(paymentEvents).values({
      user_id: appUser.id,
      provider: 'portpos',
      status: 'initiated',
      idempotency_key: reference,
      amount_bdt: amountBdt,
      purpose: 'wallet_topup',
    }).returning({ id: paymentEvents.id });

    const invoice = await portposClient.createInvoice({
      amount: amountBdt,
      reference,
      redirectUrl: `${serverUrl}/payment/success`,
      ipnUrl: `${serverUrl}/api/payment/portpos/callback`,
      packageName: 'Wallet Top-Up',
      billing: {
        customer: { name: appUser.name, email: appUser.email ?? '', phone: appUser.phone },
        address: { street: '', city: 'Dhaka', state: 'Dhaka', zipcode: '1000', country: 'BD' },
      },
    });

    await db.update(paymentEvents)
      .set({ provider_txn_id: invoice.invoice_id, status: 'callback_pending' })
      .where(eq(paymentEvents.id, evt.id));

    return Response.json({ payment_url: invoice.payment_url, payment_event_id: evt.id });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[rider/wallet/topup] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
