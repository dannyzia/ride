/**
 * GET /api/admin/customer-complaints — F-39 admin queue (STAGE D1-FIX,
 * the F-30 pattern: a polled queue, newest first). Escalated complaints
 * surface here (escalated → admin travels via this queue — no admin push
 * infra exists on disk). Optional ?status=open|escalated|banned|dismissed.
 */
import { requireAdminPermission } from '@/lib/adminRbac';
import { db } from '@/src/db';
import { customerComplaints, courierRemittanceDues } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const querySchema = z.object({
  status: z.enum(['open', 'escalated', 'banned', 'dismissed']).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('safety.write')(request);

    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return Response.json({ error: 'invalid_status', message: 'Invalid status filter' }, { status: 400 });
    }

    const where = parsed.data.status
      ? eq(customerComplaints.status, parsed.data.status)
      : undefined;

    const rows = await db
      .select({
        id: customerComplaints.id,
        order_id: customerComplaints.order_id,
        leg_id: customerComplaints.leg_id,
        shop_id: customerComplaints.shop_id,
        raised_by_user_id: customerComplaints.raised_by_user_id,
        against_user_id: customerComplaints.against_user_id,
        reason: customerComplaints.reason,
        courier_note: customerComplaints.courier_note,
        status: customerComplaints.status,
        evidence_note: courierRemittanceDues.remittance_note,
        escalated_by: customerComplaints.escalated_by,
        escalated_at: customerComplaints.escalated_at,
        decided_by: customerComplaints.decided_by,
        decided_at: customerComplaints.decided_at,
        decision_reason: customerComplaints.decision_reason,
        created_at: customerComplaints.created_at,
      })
      .from(customerComplaints)
      .leftJoin(
        courierRemittanceDues,
        eq(courierRemittanceDues.id, customerComplaints.evidence_due_id),
      )
      .where(where)
      .orderBy(desc(customerComplaints.created_at))
      .limit(100);

    return Response.json({ complaints: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    logger.error('[admin/customer-complaints] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
