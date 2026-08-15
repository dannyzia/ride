import { db } from '@/src/db';
import { users, riderWalletTransactions } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const refundSchema = z.object({
  amount_bdt: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });

    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, refundSchema);
    if (!parsed.ok) return parsed.response;

    const { amount_bdt, reason } = parsed.data;

    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({
          rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} + ${amount_bdt}`,
        })
        .where(and(eq(users.id, id), eq(users.role, 'rider')));

      await tx.insert(riderWalletTransactions).values({
        rider_id: id,
        transaction_type: 'adjustment',
        amount_bdt,
        balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${id})`,
      });
    });

    logger.info('[admin] rider refund', { rider_id: id, amount_bdt, reason });
    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/riders/refund] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
