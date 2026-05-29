import { bkashClient } from '@/lib/bkash';
import { db } from '@/src/db';
import { rides, paymentEvents } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { verifySupabaseToken } from '@/lib/auth';

const schema = z.object({
  ride_id:   z.string().uuid(),
  paymentID: z.string(),
});

export async function POST(request: Request) {
  try {
    await verifySupabaseToken(request);
    const body = await schema.parseAsync(await request.json());
    const { ride_id, paymentID } = body;

    // Lock the payment event row to prevent concurrent executePayment calls
    const payment = await db.transaction(async (tx) => {
      const [evt] = await tx
        .select({ id: paymentEvents.id, status: paymentEvents.status })
        .from(paymentEvents)
        .where(eq(paymentEvents.idempotency_key, `bkash_${ride_id}`))
        .for('update')
        .limit(1);

      if (!evt) return { action: 'no_payment_event' } as const;

      if (evt.status !== 'initiated') {
        logger.warn('[bkash/confirm] payment already processed, skipping executePayment', {
          ride_id, paymentID, status: evt.status,
        });
        return { action: 'already_processed' } as const;
      }

      return { action: 'proceed', evt } as const;
    });

    if (payment.action === 'no_payment_event') {
      return Response.json({ error: 'payment_not_found' }, { status: 404 });
    }
    if (payment.action === 'already_processed') {
      return Response.json({ success: true, message: 'already_processed' });
    }

    // Guard: check ride is not already completed
    const [ride] = await db.select({ id: rides.id, status: rides.status })
      .from(rides)
      .where(eq(rides.id, ride_id))
      .limit(1);

    if (ride?.status === 'completed') {
      logger.warn('[bkash/confirm] ride already completed, skipping executePayment', { ride_id });
      return Response.json({ success: true, message: 'already_processed' });
    }

    // Execute bKash payment
    const result = await bkashClient.executePayment(paymentID);

    if (result.transactionStatus === 'Completed') {
      // Update payment event
      await db.update(paymentEvents)
        .set({
          status: 'paid',
          provider_txn_id: result.trxID,
          confirmed_at: new Date(),
        })
        .where(eq(paymentEvents.idempotency_key, `bkash_${ride_id}`));

      // Mark ride as completed
      await db.update(rides)
        .set({ status: 'completed' })
        .where(eq(rides.id, ride_id));

      return Response.json({ success: true, trxID: result.trxID });
    }

    return Response.json({ success: false, transactionStatus: result.transactionStatus });
  } catch (e: any) {
    if (e.name === 'ZodError') return Response.json({ error: e.issues }, { status: 400 });
    return Response.json({ error: e.message ?? 'bkash_confirm_failed' }, { status: 500 });
  }
}
