import { db } from '@/src/db';
import { fareDisputes, users, riderWalletTransactions } from '@/src/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/parseBody';
import { recordAdminRefund } from '@/lib/accounting';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    if (status) {
      const disputes = await db.select().from(fareDisputes).where(eq(fareDisputes.status, status as any)).orderBy(desc(fareDisputes.created_at));
      return Response.json({ disputes });
    }
    const disputes = await db.select().from(fareDisputes).orderBy(desc(fareDisputes.created_at));
    return Response.json({ disputes });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/fare-disputes] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}

// T-6: bounded like the wallet topup / admin refund routes (৳50,000) — a
// fat-fingered ৳500k must not credit silently. Positive-only: the route only
// ever credits the rider's wallet (negative adjustments aren't applied).
const MAX_ADJUSTMENT_BDT = 5_000_000;

const resolveSchema = z.object({
  dispute_id: z.string().uuid(),
  action: z.enum(['admin_approved', 'admin_rejected']),
  adjustment_bdt: z.number().int().positive().max(MAX_ADJUSTMENT_BDT).optional(),
});

export async function PATCH(request: Request) {
  try {
    await requireRole('admin')(request);
    const parsed = await parseJsonBody(request, resolveSchema);
    if (!parsed.ok) return parsed.response;

    const [dispute] = await db.select().from(fareDisputes).where(eq(fareDisputes.id, parsed.data.dispute_id)).limit(1);
    if (!dispute) return Response.json({ error: 'not_found', message: 'Resource not found' }, { status: 404 });

    const refundBdt = parsed.data.adjustment_bdt ?? (parsed.data.action === 'admin_approved' ? dispute.charged_fare_bdt - dispute.claimed_fare_bdt : 0);

    await db.transaction(async (tx) => {
      if (refundBdt > 0) {
        await tx.update(users)
          .set({ rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} + ${refundBdt}` })
          .where(eq(users.id, dispute.rider_id));
        // T-6: wallet ledger row — the refund must appear in the rider's own
        // history like every other wallet mutation.
        await tx.insert(riderWalletTransactions).values({
          rider_id: dispute.rider_id,
          transaction_type: 'adjustment',
          amount_bdt: refundBdt,
          balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${dispute.rider_id})`,
        });
      }
      await tx.update(fareDisputes)
        .set({
          status: 'resolved',
          final_resolution: parsed.data.action,
          admin_adjustment_bdt: refundBdt,
          resolved_at: new Date(),
        })
        .where(eq(fareDisputes.id, parsed.data.dispute_id));
    });

    // T-6: double-entry (Dr 4004 / Cr 2004) so trial balances reconcile.
    // Non-blocking like every other accounting call — a failed journal entry
    // must never undo the wallet credit.
    if (refundBdt > 0) {
      try {
        await recordAdminRefund({
          riderId: dispute.rider_id,
          amountPaisa: refundBdt,
          reason: `Fare dispute ${dispute.id} (${parsed.data.action})`,
        });
      } catch (e: any) {
        logger.warn('[admin/fare-disputes] refund journal entry failed', { dispute_id: dispute.id, refund_bdt: refundBdt, error: e.message });
      }
    }

    return Response.json({ success: true, resolution: parsed.data.action, refund_bdt: refundBdt });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/fare-disputes] PATCH error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
