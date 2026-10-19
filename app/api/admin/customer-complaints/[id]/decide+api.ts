/**
 * POST /api/admin/customer-complaints/[id]/decide — F-39 admin decision
 * (STAGE D1-FIX): review the evidence chain (short-pay due note + both
 * notes) then Ban or Dismiss.
 *
 * Ban: users.account_status='suspended' + stored reason (the C2-1
 * enforcement makes it real — the customer's next protected call 403s
 * account_suspended with the reason). Dismiss: status → dismissed, nobody
 * banned. Every decision writes an audit_logs row in the SAME tx (A3).
 * Decided → push to the customer + the shop + the courier (fire-and-forget,
 * deduped) + WS shop:complaint_status after commit.
 */
import { requireAdminPermission } from '@/lib/adminRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { notifyComplaintDecided } from '@/lib/shopNotify';
import { db } from '@/src/db';
import { auditLogs, customerComplaints, users } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { notifyWs } from '@/lib/wsNotify';
import * as errors from '@/lib/errors';

const decideSchema = z.object({
  decision: z.enum(['ban', 'dismiss']),
  reason: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid complaint id' }, { status: 400 });
    }

    const auth = await requireAdminPermission('safety.write')(request);
    const parsed = await parseJsonBody(request, decideSchema);
    if (!parsed.ok) return parsed.response;

    const { decision, reason } = parsed.data;
    const nextStatus = decision === 'ban' ? 'banned' : 'dismissed';
    const now = new Date();

    let guard: Response | null = null;
    const decided = {
      shopId: '',
      orderId: '',
      customerId: '',
      courierId: '',
    };

    await db.transaction(async (tx) => {
      const [complaint] = await tx
        .select()
        .from(customerComplaints)
        .where(eq(customerComplaints.id, id))
        .limit(1)
        .for('update');
      if (!complaint) {
        guard = Response.json({ error: 'not_found', message: 'Complaint not found' }, { status: 404 });
        return;
      }
      if (complaint.status !== 'escalated') {
        guard = Response.json(
          { error: 'invalid_transition', message: `Cannot decide from ${complaint.status}` },
          { status: 409 },
        );
        return;
      }

      if (decision === 'ban') {
        // C2-1: persist the reason so the 403 account_suspended surfaces it.
        await tx
          .update(users)
          .set({
            account_status: 'suspended',
            suspension_reason: reason ?? 'Customer complaint upheld by support',
            updated_at: now,
          })
          .where(eq(users.id, complaint.against_user_id));
      }

      await tx
        .update(customerComplaints)
        .set({
          status: nextStatus,
          decided_by: auth.dbUser.id,
          decided_at: now,
          decision_reason: reason ?? null,
          updated_at: now,
        })
        .where(eq(customerComplaints.id, id));

      // A3: every decision is audited in the same tx.
      await tx.insert(auditLogs).values({
        actor_user_id: auth.dbUser.id,
        action: `customer_complaint.${decision}`,
        entity_type: 'customer_complaint',
        entity_id: id,
        old_value: { status: 'escalated' },
        new_value: {
          status: nextStatus,
          against_user_id: complaint.against_user_id,
          reason: reason ?? null,
        },
      });

      decided.shopId = complaint.shop_id;
      decided.orderId = complaint.order_id;
      decided.customerId = complaint.against_user_id;
      decided.courierId = complaint.raised_by_user_id;
    });

    if (guard) return guard;

    // Decided → the three affected parties (fire-and-forget, deduped).
    void notifyComplaintDecided({
      complaintId: id,
      orderId: decided.orderId,
      shopId: decided.shopId,
      customerUserId: decided.customerId,
      courierUserId: decided.courierId,
      decision: nextStatus,
    });

    try {
      notifyWs([
        {
          event: 'shop:complaint_status',
          to: [
            { kind: 'shop_staff', shop_id: decided.shopId },
            { kind: 'user', user_id: decided.customerId },
          ],
          payload: { complaint_id: id, order_id: decided.orderId, status: nextStatus },
        },
      ]);
    } catch (e: unknown) {
      logger.warn('[admin/customer-complaints/decide] ws notify failed', {
        complaintId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ id, status: nextStatus, decision });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    logger.error('[admin/customer-complaints/decide] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
