/**
 * GET /api/shop/complaints?shop_id=… — F-39 shop surface (STAGE D1-FIX):
 * the complaints raised against this shop's customers, newest first, with
 * the evidence pointer and the customer id so the shop can "Talk to
 * customer" through the existing order chat, then "Escalate to platform".
 * Shop-member gated (any active role may view; escalate is OWNER|MANAGER).
 */
import { requireShopMember } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { customerComplaints, courierRemittanceDues } from '@/src/db/schema';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    const shopId = new URL(request.url).searchParams.get('shop_id') ?? '';
    if (!z.string().uuid().safeParse(shopId).success) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid shop id' }, { status: 400 });
    }

    await requireShopMember(shopId)(request);

    const rows = await db
      .select({
        id: customerComplaints.id,
        order_id: customerComplaints.order_id,
        leg_id: customerComplaints.leg_id,
        against_user_id: customerComplaints.against_user_id,
        reason: customerComplaints.reason,
        courier_note: customerComplaints.courier_note,
        status: customerComplaints.status,
        evidence_note: courierRemittanceDues.remittance_note,
        escalated_at: customerComplaints.escalated_at,
        decided_at: customerComplaints.decided_at,
        created_at: customerComplaints.created_at,
      })
      .from(customerComplaints)
      .leftJoin(
        courierRemittanceDues,
        eq(courierRemittanceDues.id, customerComplaints.evidence_due_id),
      )
      .where(eq(customerComplaints.shop_id, shopId))
      .orderBy(desc(customerComplaints.created_at))
      .limit(100);

    return Response.json({ complaints: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not authorized' }, { status: 403 });
    logger.error('[shop/complaints] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
