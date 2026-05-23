import { bkashClient } from '@/lib/bkash';
import { db } from '@/src/db';
import { rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const schema = z.object({
  ride_id:   z.string().uuid(),
  paymentID: z.string(),
});

export async function POST(request: Request) {
  try {
    const body = await schema.parseAsync(await request.json());
    const { ride_id, paymentID } = body;

    // Execute bKash payment
    const result = await bkashClient.executePayment(paymentID);

    if (result.transactionStatus === 'Completed') {
      await db.update(rides)
        .set({ payment_status: 'paid' })
        .where(eq(rides.id, ride_id));

      return Response.json({ success: true, trxID: result.trxID });
    }

    return Response.json({ success: false, transactionStatus: result.transactionStatus });
  } catch (e: any) {
    if (e.name === 'ZodError') return Response.json({ error: e.issues }, { status: 400 });
    return Response.json({ error: e.message ?? 'bkash_confirm_failed' }, { status: 500 });
  }
}
