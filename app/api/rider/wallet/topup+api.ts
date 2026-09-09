import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { isConfigured } from '@/lib/portpos';
import { initiatePortposPayment } from '@/lib/paymentEvents';
import {
  beginIdempotencyClaim,
  storeIdempotencyOutcome,
  extractIdempotencyKey,
  sha256Fingerprint,
  IDEMPOTENCY_ROUTES,
} from '@/lib/idempotency';
import { z } from 'zod';
import * as errors from '@/lib/errors';

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000).max(5000000),
});

export async function POST(originalRequest: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(originalRequest);
    const [appUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!appUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    // Raw body captured for the idempotency fingerprint; parseJsonBody still
    // performs the authoritative Zod validation.
    const rawBody: string = await originalRequest.text();
    const bodyForParse = new Request('http://internal/parse', { method: 'POST', body: rawBody, headers: { 'content-type': 'application/json' } });

    const parsed = await parseJsonBody(bodyForParse, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;
    if (!isConfigured()) return Response.json({ error: 'payment_not_configured', message: 'Payment provider not configured' }, { status: 503 });

    // ── Idempotency-Key convention (decision 01M23628A1566SK1D5XXV1NT5G).
    // The header is OPTIONAL here: absent → fresh server key (legacy behavior
    // preserved); present → (route, key) barrier with replay-or-conflict.
    const idempotencyKey = extractIdempotencyKey(originalRequest);
    let reference: string = crypto.randomUUID();
    if (idempotencyKey) {
      const claim = await beginIdempotencyClaim({
        route: IDEMPOTENCY_ROUTES.riderWalletTopup,
        key: idempotencyKey,
        userId: appUser.id,
        requestFingerprint: sha256Fingerprint('POST', rawBody),
      });
      if (claim.kind === 'replay') return claim.response;
      if (claim.kind === 'conflict') return claim.response;
      reference = idempotencyKey;
    }

    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? '';

    const finish = async (initiated: { payment_url: string; payment_event_id: string } | null): Promise<Response> => {
      if (!initiated) {
        return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
      }
      return Response.json({ payment_url: initiated.payment_url, payment_event_id: initiated.payment_event_id });
    };

    try {
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
      const response = await finish(initiated);
      if (idempotencyKey) await storeIdempotencyOutcome({ route: IDEMPOTENCY_ROUTES.riderWalletTopup, key: idempotencyKey }, response);
      return response;
    } catch (e: unknown) {
      if (errors.getErrorStatus(e) === 401) {
        return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
      }
      throw e;
    }
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[rider/wallet/topup] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
