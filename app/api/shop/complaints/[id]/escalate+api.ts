/**
 * POST /api/shop/complaints/[id]/escalate — F-39 "Escalate to platform"
 * (STAGE D1-FIX, bodyless: the auth token is the only input boundary).
 * OWNER|MANAGER of the complaint's shop moves open → escalated. The
 * complaint then surfaces in the admin customer-complaints queue
 * (escalated → admin travels via the queue — no admin push infra exists
 * on disk). WS shop:complaint_status to shop staff + customer after commit.
 */
import { requireShopMember } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { customerComplaints } from '@/src/db/schema';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { notifyWs } from '@/lib/wsNotify';
import * as errors from '@/lib/errors';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid complaint id' }, { status: 400 });
    }

    const [complaint] = await db
      .select()
      .from(customerComplaints)
      .where(eq(customerComplaints.id, id))
      .limit(1);
    if (!complaint) {
      return Response.json({ error: 'not_found', message: 'Complaint not found' }, { status: 404 });
    }

    const auth = await requireShopMember(complaint.shop_id, ['OWNER', 'MANAGER'])(request);

    if (complaint.status !== 'open') {
      return Response.json(
        { error: 'invalid_transition', message: `Cannot escalate from ${complaint.status}` },
        { status: 409 },
      );
    }

    const now = new Date();
    await db
      .update(customerComplaints)
      .set({
        status: 'escalated',
        escalated_by: auth.dbUser.id,
        escalated_at: now,
        updated_at: now,
      })
      .where(and(eq(customerComplaints.id, id), eq(customerComplaints.status, 'open')));

    // Z2: emit after the tx — shop staff + the flagged customer.
    try {
      notifyWs([
        {
          event: 'shop:complaint_status',
          to: [
            { kind: 'shop_staff', shop_id: complaint.shop_id },
            { kind: 'user', user_id: complaint.against_user_id },
          ],
          payload: { complaint_id: id, order_id: complaint.order_id, status: 'escalated' },
        },
      ]);
    } catch (e: unknown) {
      logger.warn('[shop/complaints/escalate] ws notify failed', {
        complaintId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ id, status: 'escalated' });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    logger.error('[shop/complaints/escalate] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
