// [auth-required] Initiate bKash package purchase for driver
// Idempotency-Key header required — prevents double-charge

import { z } from 'zod';
import { db } from '@/src/db';
import { packages, paymentEvents, users, drivers, subscriptions } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';
import { bkashClient } from '@/lib/bkash';
import { logger } from '@/lib/logger';

const purchaseSchema = z.object({
  package_id: z.string().uuid(),
  provider: z.enum(['bkash', 'nagad']),
}).strict();

export async function POST(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.firebase_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    if (!['active', 'temporary'].includes(driver.status)) {
      return Response.json({ error: 'driver_status_invalid', message: 'Driver must be active or temporary' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'invalid_body', message: parsed.error.flatten() }, { status: 400 });
    }
    const { package_id, provider } = parsed.data;

    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
      return Response.json({ error: 'missing_idempotency_key', message: 'Idempotency-Key header required (uuid v4)' }, { status: 400 });
    }

    const [pkg] = await db.select().from(packages).where(eq(packages.id, package_id)).limit(1);
    if (!pkg || !pkg.is_active) {
      return Response.json({ error: 'package_not_found', message: 'Package not found or inactive' }, { status: 422 });
    }

    const [activeSub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);
    if (activeSub) {
      return Response.json({ error: 'active_subscription_exists', message: 'Driver already has an active subscription' }, { status: 409 });
    }

    if (pkg.is_trial) {
      const [trialSub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.is_trial, true)))
        .limit(1);
      if (trialSub) {
        return Response.json({ error: 'trial_already_used', message: 'Driver has already used a trial package' }, { status: 409 });
      }
    }

    if (provider === 'nagad') {
      return Response.json({ error: 'provider_unavailable', message: 'Nagad is coming soon' }, { status: 400 });
    }

    const [evt] = await db
      .insert(paymentEvents)
      .values({
        driver_id: driver.id,
        package_id: pkg.id,
        idempotency_key: idempotencyKey,
        provider: 'bkash',
        amount_bdt: pkg.price_bdt,
        status: 'initiated',
      })
      .onConflictDoNothing()
      .returning();

    if (!evt) {
      const [existing] = await db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.idempotency_key, idempotencyKey))
        .limit(1);
      if (existing) {
        return Response.json({ payment_url: null, payment_event_id: existing.id });
      }
    }

    const callbackUrl = `${process.env.EXPO_PUBLIC_SERVER_URL}/api/payment/bkash/callback`;
    const { paymentID, bkashURL } = await bkashClient.createPayment({
      amount: pkg.price_bdt,
      idempotencyKey,
      callbackUrl,
    });

    await db
      .update(paymentEvents)
      .set({ provider_txn_id: paymentID })
      .where(eq(paymentEvents.id, evt!.id));

    logger.info('[package/purchase] payment initiated', {
      paymentEventId: evt!.id,
      paymentID,
      driverId: driver.id,
    });

    return Response.json({ payment_url: bkashURL, payment_event_id: evt!.id });
  } catch (e: any) {
    if (e.status === 401) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    logger.error('[package/purchase] error', e);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
