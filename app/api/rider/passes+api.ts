import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, riderPasses, riderSubscriptions, paymentEvents } from '@/src/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { portposClient, isConfigured } from '@/lib/portpos';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import crypto from 'crypto';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const passes = await db.select().from(riderPasses).where(eq(riderPasses.is_active, true));

    const [activeSub] = await db.select().from(riderSubscriptions)
      .where(and(eq(riderSubscriptions.rider_id, user.id), eq(riderSubscriptions.status, 'active'), gt(riderSubscriptions.valid_until, new Date())))
      .limit(1);

    return Response.json({ passes, active_subscription: activeSub || null });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[rider/passes] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}

const purchaseSchema = z.object({ pass_id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const parsed = await parseJsonBody(request, purchaseSchema);
    if (!parsed.ok) return parsed.response;

    const [pass] = await db.select().from(riderPasses).where(and(eq(riderPasses.id, parsed.data.pass_id), eq(riderPasses.is_active, true))).limit(1);
    if (!pass) return Response.json({ error: 'pass_not_found' }, { status: 404 });

    if (!isConfigured()) return Response.json({ error: 'payment_not_configured' }, { status: 503 });

    const reference = crypto.randomUUID();
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

    const [evt] = await db.insert(paymentEvents).values({
      user_id: user.id,
      provider: 'portpos',
      status: 'initiated',
      idempotency_key: reference,
      amount_bdt: pass.price_bdt,
      purpose: 'rider_pass',
      pass_id: parsed.data.pass_id,
    }).returning({ id: paymentEvents.id });

    const invoice = await portposClient.createInvoice({
      amount: pass.price_bdt,
      reference,
      redirectUrl: `${serverUrl}/payment/success`,
      ipnUrl: `${serverUrl}/api/payment/portpos/callback`,
      packageName: `Rider Pass: ${pass.name}`,
      billing: {
        customer: { name: user.name, email: user.email ?? '', phone: user.phone },
        address: { street: '', city: 'Dhaka', state: 'Dhaka', zipcode: '1000', country: 'BD' },
      },
    });

    await db.update(paymentEvents)
      .set({ provider_txn_id: invoice.invoice_id, status: 'callback_pending' })
      .where(eq(paymentEvents.id, evt.id));

    return Response.json({ payment_url: invoice.payment_url, payment_event_id: evt.id });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[rider/passes] POST error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
