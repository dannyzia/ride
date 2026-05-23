import { bkashClient } from '@/lib/bkash';
import { db } from '@/src/db';
import { rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  ride_id:    z.string().uuid(),
  amount_bdt: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    const body = await schema.parseAsync(await request.json());
    const { ride_id, amount_bdt } = body;

    // Verify ride exists
    const [ride] = await db.select().from(rides).where(eq(rides.id, ride_id)).limit(1);
    if (!ride) return Response.json({ error: 'ride_not_found' }, { status: 404 });
    if (ride.payment_status === 'paid')
      return Response.json({ error: 'already_paid' }, { status: 409 });

    // Create bKash payment
    const idempotencyKey = `bkash_${ride_id}_${Date.now()}`;
    const callbackUrl = process.env.BKASH_CALLBACK_URL!;

    const { paymentID, bkashURL } = await bkashClient.createPayment({
      amount: amount_bdt,
      idempotencyKey,
      callbackUrl,
    });

    return Response.json({ paymentID, bkashURL, idempotencyKey });
  } catch (e: any) {
    if (e.name === 'ZodError') return Response.json({ error: e.issues }, { status: 400 });
    return Response.json({ error: e.message ?? 'bkash_create_failed' }, { status: 500 });
  }
}
