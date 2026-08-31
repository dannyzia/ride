/**
 * POST /api/delivery/bids/[id]/withdraw — courier withdraws a pre-settle bid (F3).
 * GET  /api/delivery/bids/[id] — bid detail (public).
 */
import { requireCourier } from '@/lib/marketplaceRbac';
import { db } from '@/src/db';
import { deliveryBids, deliveryRequests } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    const [bid] = await db
      .select()
      .from(deliveryBids)
      .where(eq(deliveryBids.id, id))
      .limit(1);

    if (!bid) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    return Response.json({ bid });
  } catch (error: unknown) {
    logger.error('Failed to get delivery bid', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid' }, { status: 400 });
    }

    // Auth — must be the bid owner's courier
    const auth = await requireCourier('food')(request).catch(() => requireCourier('parcel')(request));

    // Find the bid
    const [bid] = await db
      .select()
      .from(deliveryBids)
      .where(eq(deliveryBids.id, id))
      .limit(1);

    if (!bid) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    if (bid.courier_user_id !== auth.dbUser.id) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (bid.status !== 'active') {
      return Response.json({ error: 'not_withdrawable', message: 'Bid is no longer active' }, { status: 409 });
    }

    // Check request is still in bidding state (not yet accepted/awarded)
    const [req] = await db
      .select()
      .from(deliveryRequests)
      .where(eq(deliveryRequests.id, bid.request_id))
      .limit(1);

    if (!req || (req.status !== 'pending' && req.status !== 'assigned')) {
      return Response.json({ error: 'not_withdrawable', message: 'Request is no longer in bidding state' }, { status: 409 });
    }

    // Withdraw the bid
    await db.update(deliveryBids)
      .set({ status: 'withdrawn', settled_at: new Date() })
      .where(eq(deliveryBids.id, id));

    logger.info('Delivery bid withdrawn', { bidId: id, courierId: auth.dbUser.id });

    return Response.json({ success: true });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err.status) {
      return Response.json({ error: err.message || 'error' }, { status: err.status });
    }
    logger.error('Delivery bid withdrawal failed', error);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
