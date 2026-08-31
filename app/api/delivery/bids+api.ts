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

    // Require courier — food or parcel (request category determines which)
    const auth = await requireCourier('food')(request).catch(() => requireCourier('parcel')(request));

    const parsed = await parseJsonBody(request, submitBidSchema);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;

    // Verify request exists and is in bidding state
    const [req] = await db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, data.request_id))
      .limit(1);

    if (!req) {
      return Response.json({ error: 'not_found', message: 'Delivery request not found' }, { status: 404 });
    }
    if (req.status !== 'pending') {
      return Response.json({ error: 'not_biddable', message: 'Request is not accepting bids' }, { status: 409 });
    }
    if (new Date(req.deadline_at) < new Date()) {
      return Response.json({ error: 'deadline_passed', message: 'Bidding deadline has passed' }, { status: 409 });
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
