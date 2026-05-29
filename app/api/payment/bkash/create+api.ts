import { bkashClient } from '@/lib/bkash';
import { db } from '@/src/db';
import { rides, paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

const schema = z.object({
  ride_id:    z.string().uuid(),
  amount_bdt: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const body = await schema.parseAsync(await request.json());
    const { ride_id, amount_bdt } = body;

    // Verify ride exists and belongs to this user
    const [ride] = await db.select().from(rides).where(eq(rides.id, ride_id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.user_id !== user.id) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }

    // Deterministic idempotency key for bKash deduplication
    const idempotencyKey = `bkash_${ride_id}`;

    // Check for existing payment event (idempotency)
    const [existing] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotency_key, idempotencyKey))
      .limit(1);

    if (existing && existing.status !== 'initiated') {
      return Response.json({
        paymentID: existing.provider_txn_id,
        bkashURL: null,
        idempotencyKey,
        status: existing.status,
        already_processed: true,
      });
    }

    const callbackUrl = process.env.BKASH_CALLBACK_URL!;

    const { paymentID, bkashURL } = await bkashClient.createPayment({
      amount: amount_bdt,
      idempotencyKey,
      callbackUrl,
    });

    // Insert or update payment event
    if (existing) {
      await db.update(paymentEvents)
        .set({ provider_txn_id: paymentID })
        .where(eq(paymentEvents.id, existing.id));
    } else {
      await db.insert(paymentEvents).values({
        ride_id,
        idempotency_key: idempotencyKey,
        provider: 'bkash' as 'portpos',
        amount_bdt,
        status: 'initiated',
        provider_txn_id: paymentID,
      }).onConflictDoNothing();
    }

    logger.info('[bkash/create] payment initiated', { ride_id, paymentID, amount_bdt });

    return Response.json({ paymentID, bkashURL, idempotencyKey });
  } catch (e: any) {
    if (e.name === 'ZodError') return Response.json({ error: e.issues }, { status: 400 });
    return Response.json({ error: e.message ?? 'bkash_create_failed' }, { status: 500 });
  }
}
