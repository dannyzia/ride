import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, riderPasses, riderSubscriptions } from '@/src/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { isConfigured } from '@/lib/portpos';
import { initiatePortposPayment } from '@/lib/paymentEvents';
import { parseJsonBody } from '@/lib/parseBody';
import { z } from 'zod';
import crypto from 'crypto';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const passes = await db.select().from(riderPasses).where(eq(riderPasses.is_active, true));

    const [activeSub] = await db.select().from(riderSubscriptions)
      .where(and(eq(riderSubscriptions.rider_id, user.id), eq(riderSubscriptions.status, 'active'), gt(riderSubscriptions.valid_until, new Date())))
      .limit(1);

    return Response.json({ passes, active_subscription: activeSub || null });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/passes] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

const purchaseSchema = z.object({ pass_id: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, purchaseSchema);
    if (!parsed.ok) return parsed.response;

    const [pass] = await db.select().from(riderPasses).where(and(eq(riderPasses.id, parsed.data.pass_id), eq(riderPasses.is_active, true))).limit(1);
    if (!pass) return Response.json({ error: 'pass_not_found', message: 'Pass not found' }, { status: 404 });

    // W-2: mirror package/purchase — block stacking while a pass is live.
    // Without this, a rider could buy pass #2 while #1 was active, and every
    // discounted ride burned quota from both. (The race past this gate leaves
    // two actives, but the ride now snapshots which pass supplied the
    // discount, so each pass's quota burns only when it actually discounts.)
    const [activeSub] = await db.select({ id: riderSubscriptions.id }).from(riderSubscriptions)
      .where(and(eq(riderSubscriptions.rider_id, user.id), eq(riderSubscriptions.status, 'active'), gt(riderSubscriptions.valid_until, new Date())))
      .limit(1);
    if (activeSub) {
      return Response.json({ error: 'active_subscription_exists', message: 'Rider already has an active pass' }, { status: 409 });
    }

    if (!isConfigured()) return Response.json({ error: 'payment_not_configured', message: 'Payment provider not configured' }, { status: 503 });

    const reference = crypto.randomUUID();
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

    // payment_events writes are owned by lib/paymentEvents.ts (see AGENTS.md)
    const initiated = await initiatePortposPayment({
      user_id: user.id,
      pass_id: pass.id,
      idempotency_key: reference,
      amount_bdt: pass.price_bdt,
      purpose: 'rider_pass',
      package_name: `Rider Pass: ${pass.name}`,
      customer_name: user.name,
      customer_email: user.email ?? '',
      customer_phone: user.phone,
      redirect_url: `${serverUrl}/payment/success`,
      ipn_url: `${serverUrl}/api/payment/portpos/callback`,
    });

    if (!initiated) {
      return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
    }

    return Response.json({ payment_url: initiated.payment_url, payment_event_id: initiated.payment_event_id });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/passes] POST error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
