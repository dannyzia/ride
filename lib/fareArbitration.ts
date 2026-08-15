import { db } from '@/src/db';
import { fareDisputes } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';

/**
 * Auto-arbitrate a fare dispute.
 * MVP mode: ALL disputes go to manual review since we can't reliably compare
 * estimated vs actual distance at dispute time. Admin reviews via the admin
 * fare-disputes screen.
 */
export async function autoArbitrateDispute(disputeId: string): Promise<{ resolution: string; refund_bdt: number }> {
  const [dispute] = await db.select().from(fareDisputes).where(eq(fareDisputes.id, disputeId)).limit(1);
  if (!dispute) throw new Error('Dispute not found');

  // Non-open disputes already have a resolution
  if (dispute.status !== 'open') {
    return { resolution: dispute.final_resolution ?? 'pending', refund_bdt: Number(dispute.auto_refund_bdt ?? 0) };
  }

  // MVP: send all disputes to manual review (no estimated distance tracking exists)
  await db.update(fareDisputes)
    .set({
      status: 'under_review',
      final_resolution: 'pending',
      // NOTE: do NOT set resolved_at here — the dispute is not resolved yet.
      // resolved_at is set only when an admin/auto flow actually resolves it.
    })
    .where(eq(fareDisputes.id, disputeId));

  logger.info('[fareArbitration] dispute sent to manual review', { disputeId });

  return { resolution: 'pending', refund_bdt: 0 };
}
