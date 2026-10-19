/**
 * POST /api/delivery/active/[id]/complaint — F-39 courier flag (STAGE D1-FIX,
 * owner ruling 2026-10-17): the assigned courier flags a short-paying
 * customer at the short-pay entry (the amount-collected flow) or later from
 * the leg/order history — both ride this one endpoint, keyed by leg id.
 *
 * Evidence is the F-38 short-pay row: the leg's courier_remittance_dues row
 * carrying the short-pay note. No evidence → 409 (a flag without the
 * recorded shortfall is a one-sided claim). Optional courier note only.
 * The shop is notified via the C6-2 bell (fire-and-forget, deduped).
 */
import { requireDeliveryAgent } from '@/lib/marketplaceRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { notifyShopComplaintFlagged } from '@/lib/shopNotify';
import { db } from '@/src/db';
import {
  deliveries,
  shopOrders,
  customerComplaints,
  courierRemittanceDues,
} from '@/src/db/schema';
import { and, eq, inArray, like } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const complaintSchema = z.object({
  note: z.string().min(1).max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid leg id' }, { status: 400 });
    }

    const auth = await requireDeliveryAgent(request);
    const parsed = await parseJsonBody(request, complaintSchema);
    if (!parsed.ok) return parsed.response;

    let complaintId: string | null = null;
    let guard: Response | null = null;
    const notify: {
      shopId?: string;
      orderId?: string;
      shortfallBdt?: number | null;
    } = {};

    await db.transaction(async (tx) => {
      const [leg] = await tx
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, id))
        .limit(1)
        .for('update');
      if (!leg) {
        guard = Response.json({ error: 'not_found', message: 'Delivery not found' }, { status: 404 });
        return;
      }
      if (leg.delivery_man_user_id !== auth.dbUser.id) {
        guard = Response.json({ error: 'forbidden', message: 'Not the assigned courier' }, { status: 403 });
        return;
      }

      const [order] = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, leg.order_id))
        .limit(1);
      if (!order) {
        // P2P parcel legs have no shop order (order_id is the consignment
        // uuid) — no shop, no customer account, nothing to flag.
        guard = Response.json(
          { error: 'not_shop_order', message: 'Customer complaints apply to shop orders only' },
          { status: 409 },
        );
        return;
      }

      // F-38 evidence: the leg's due row carrying the short-pay note.
      const [due] = await tx
        .select({ id: courierRemittanceDues.id })
        .from(courierRemittanceDues)
        .where(
          and(
            eq(courierRemittanceDues.leg_id, leg.id),
            like(courierRemittanceDues.remittance_note, 'F-38 short-pay%'),
          ),
        )
        .limit(1);
      if (!due) {
        guard = Response.json(
          { error: 'short_pay_evidence_required', message: 'No recorded short-pay for this delivery' },
          { status: 409 },
        );
        return;
      }

      // One live complaint per (order, courier) — a retry surfaces 409,
      // never a second row.
      const [existing] = await tx
        .select({ id: customerComplaints.id })
        .from(customerComplaints)
        .where(
          and(
            eq(customerComplaints.order_id, order.id),
            eq(customerComplaints.raised_by_user_id, auth.dbUser.id),
            inArray(customerComplaints.status, ['open', 'escalated']),
          ),
        )
        .limit(1);
      if (existing) {
        guard = Response.json(
          { error: 'complaint_already_open', message: 'A complaint for this order is already open' },
          { status: 409 },
        );
        return;
      }

      const [row] = await tx
        .insert(customerComplaints)
        .values({
          order_id: order.id,
          leg_id: leg.id,
          raised_by_user_id: auth.dbUser.id,
          shop_id: order.shop_id,
          against_user_id: order.rider_user_id,
          evidence_due_id: due.id,
          reason: 'short_pay',
          courier_note: parsed.data.note ?? null,
        })
        .returning({ id: customerComplaints.id });
      complaintId = row.id;

      const expected = order.subtotal_bdt + (leg.delivery_fee_bdt ?? 0);
      const collected = leg.amount_collected_bdt;
      notify.shopId = order.shop_id;
      notify.orderId = order.id;
      notify.shortfallBdt =
        collected != null && collected < expected ? expected - collected : null;
    });

    if (guard) return guard;
    if (!complaintId) {
      return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
    }

    // C6-2 bell → the shop (fire-and-forget; never fails the flag).
    void notifyShopComplaintFlagged({
      shopId: notify.shopId!,
      orderId: notify.orderId!,
      complaintId,
      shortfallBdt: notify.shortfallBdt ?? null,
    });

    return Response.json({ id: complaintId, status: 'open' }, { status: 201 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (status === 403)
      return Response.json({ error: 'forbidden', message: 'Not an active delivery agent' }, { status: 403 });
    logger.error('[delivery/active/complaint] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
