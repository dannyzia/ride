import { db } from '@/src/db';
import { users, riderWalletTransactions } from '@/src/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { recordAdminRefund } from '@/lib/accounting';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// U-3: ceiling matches the wallet topup limit (৳50,000) — an admin typo of
// ৳10M must not pass `positive()` into a wallet credit.
const MAX_REFUND_BDT = 5_000_000;

const refundSchema = z.object({
  amount_bdt: z.number().int().positive().max(MAX_REFUND_BDT),
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

    // U-3: book the double-entry (Dr 4004 admin adjustment / Cr 2004 rider
    // wallet liability) so trial balances reconcile against wallet liability.
    // Non-blocking by design — a missing journal entry must never undo the
    // wallet credit itself (same pattern as every other accounting call).
    try {
      await recordAdminRefund({ riderId: id, amountPaisa: amount_bdt, reason });
    } catch (e: any) {
      logger.warn('[admin] refund journal entry failed', { rider_id: id, amount_bdt, error: e.message });
    }

    logger.info('[admin] rider refund', { rider_id: id, amount_bdt, reason });
    return Response.json({ success: true });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/riders/refund] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
