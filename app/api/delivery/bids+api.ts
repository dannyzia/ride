/**
 * POST /api/delivery/bids — submit a bid on a delivery request (courier-facing).
 * GET  /api/delivery/bids/active — list own active bids.
 * GET  /api/delivery/bids/history — list own historical bids.
 */
import { requireCourier } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { deliveryBids, deliveryRequests } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { parseJsonBody } from '@/lib/parseBody';
import { isVerticalEnabled } from '@/lib/platformConfig';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const submitBidSchema = z.object({
  request_id: z.string().uuid(),
  vehicle_type: z.enum(['bike', 'cng', 'car', 'van', 'truck']).optional(),
  quoted_fee_bdt: z.number().int().positive(),
  quoted_eta_minutes: z.number().int().positive().max(480).optional(),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled('marketplace_delivery_enabled'))) {
      return Response.json({ error: 'feature_disabled', message: 'Delivery marketplace is not enabled' }, { status: 404 });
    }

    const parsed = await parseJsonBody(request, submitBidSchema);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;

    // Resolve request type BEFORE auth — source_shop_order_id present = food, absent = parcel
    const [req] = await db
      .select({
        id: deliveryRequests.id,
        status: deliveryRequests.status,
        deadline_at: deliveryRequests.deadline_at,
        source_shop_order_id: deliveryRequests.source_shop_order_id,
        required_vehicle_type: deliveryRequests.required_vehicle_type,
      })
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, data.request_id))
      .limit(1);

    if (!req) {
      return Response.json({ error: 'not_found', message: 'Delivery request not found' }, { status: 404 });
    }

    // Require courier matching the request type (food vs parcel)
    const requiredType: 'food' | 'parcel' = req.source_shop_order_id ? 'food' : 'parcel';
    const auth = await requireCourier(requiredType)(request);

    // B3 (audit #14): defense-in-depth — the caller's qualifying courier row
    // must be of the derived category type.
    if (auth.courier.courier_type !== requiredType) {
      return Response.json(
        { error: 'courier_type_mismatch', message: 'Courier type does not match this request' },
        { status: 403 },
      );
    }

    if (req.status !== 'pending') {
      return Response.json({ error: 'not_biddable', message: 'Request is not accepting bids' }, { status: 409 });
    }
    if (new Date(req.deadline_at) < new Date()) {
      return Response.json({ error: 'deadline_passed', message: 'Bidding deadline has passed' }, { status: 409 });
    }

    // §C.3: required_vehicle_type applies to PARCEL requests only — the bid's
    // vehicle_type must match it exactly.
    if (requiredType === 'parcel' && req.required_vehicle_type) {
      if (data.vehicle_type !== req.required_vehicle_type) {
        return Response.json(
          {
            error: 'vehicle_type_mismatch',
            message: `This request requires a ${req.required_vehicle_type}`,
          },
          { status: 400 },
        );
      }
    }

    // Check for existing active bid (partial unique enforces this, but check first for better error)
    const [existingBid] = await db
      .select()
      .from(deliveryBids)
      .where(and(
        eq(deliveryBids.request_id, data.request_id),
        eq(deliveryBids.courier_user_id, auth.dbUser.id),
        eq(deliveryBids.status, 'active'),
      ))
      .limit(1);

    if (existingBid) {
      return Response.json({ error: 'already_bid', message: 'You already have an active bid on this request' }, { status: 409 });
    }

    const [bid] = await db
      .insert(deliveryBids)
      .values({
        request_id: data.request_id,
        courier_user_id: auth.dbUser.id,
        vehicle_type: data.vehicle_type ?? null,
        quoted_fee_bdt: data.quoted_fee_bdt,
        quoted_eta_minutes: data.quoted_eta_minutes ?? null,
      })
      .returning();

    logger.info('Delivery bid submitted', { bidId: bid.id, requestId: data.request_id, courierId: auth.dbUser.id });

    return Response.json({ bid }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Delivery bid submission failed', error);
    return Response.json({ error: 'server_error', message: 'Failed to submit bid' }, { status: 500 });
  }
}
