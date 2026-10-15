/**
 * POST /api/shop/orders/[id]/dispatch — S6 F-12 shop fallback, the retry leg
 * of the exhaustion fallback (plan 27 §6.1): after the chain exhausts (or a
 * delivery fails), the shop retries the search with a freshly ranked
 * candidate list. Self-deliver and Cancel are the other two fallback
 * choices: self-deliver is the `self_delivered` status transition and cancel
 * is the `cancelled` transition on /status (both settle/kill the chain
 * there). OWNER/MANAGER only — a money-path decision (F-16 staff is
 * orders-only; self-delivery keeps the customer's fee).
 */
import { requireShopMember } from '@/lib/marketplaceRbac';
import { parseJsonBody } from '@/lib/parseBody';
import { retryDeliveryDispatch } from '@/lib/deliveryDispatch';
import { db } from '@/src/db';
import { shopOrders } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const retrySchema = z.object({
  action: z.literal('retry'),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: 'invalid_uuid', message: 'Invalid order id' }, { status: 400 });
    }

    const parsed = await parseJsonBody(request, retrySchema);
    if (!parsed.ok) return parsed.response;

    const [order] = await db
      .select({ id: shopOrders.id, shop_id: shopOrders.shop_id })
      .from(shopOrders)
      .where(eq(shopOrders.id, id))
      .limit(1);
    if (!order) {
      return Response.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    await requireShopMember(order.shop_id, ['OWNER', 'MANAGER'])(request);

    const retriggered = await retryDeliveryDispatch(id);
    if (!retriggered) {
      return Response.json(
        { error: 'not_dispatchable', message: 'Order is not awaiting a courier search' },
        { status: 409 },
      );
    }

    return Response.json({ success: true, action: 'retry' }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: 'forbidden', message: 'Not authorized for this shop' }, { status: 403 });
    }
    logger.error('[shop/orders/dispatch] error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
