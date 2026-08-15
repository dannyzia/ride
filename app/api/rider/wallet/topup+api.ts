import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { isConfigured } from '@/lib/portpos';
import { initiatePortposPayment } from '@/lib/paymentEvents';
import { z } from 'zod';

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000).max(5000000),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [appUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;
    if (!isConfigured()) return Response.json({ error: 'payment_not_configured', message: 'Payment provider not configured' }, { status: 503 });

    const reference = crypto.randomUUID();
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

    // payment_events writes are owned by lib/paymentEvents.ts (see AGENTS.md)
    const initiated = await initiatePortposPayment({
      user_id: appUser.id,
      idempotency_key: reference,
      amount_bdt: amountBdt,
      purpose: 'wallet_topup',
      package_name: 'Wallet Top-Up',
      customer_name: appUser.name,
      customer_email: appUser.email ?? '',
      customer_phone: appUser.phone,
      redirect_url: `${serverUrl}/payment/success`,
      ipn_url: `${serverUrl}/api/payment/portpos/callback`,
    });

    if (!initiated) {
      return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
    }

    return Response.json({ payment_url: initiated.payment_url, payment_event_id: initiated.payment_event_id });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/wallet/topup] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
