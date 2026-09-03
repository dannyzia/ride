/**
 * shopDeliveryBridge.ts — Declared writer of delivery_requests for food delivery orders.
 * Called from shop mark-ready handler when category='food' AND fulfillment='delivery'.
 * Idempotent on source_shop_order_id (F8).
 *
 * Write-ownership: this is the ONLY file that creates delivery_requests from shop orders.
 * Delivery accept-bid handles the fee write (F40).
 */
import { db } from '@/src/db';
import { deliveryRequests, shopOrders, shops } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Create a delivery request from a food delivery shop order.
 * Idempotent: if a delivery_request with this source_shop_order_id already exists,
 * returns the existing one without creating a duplicate.
 *
 * Must be called inside a transaction (pass `tx` from the caller).
 */
export async function createFromShopOrder(
  order: {
    id: string;
    rider_user_id: string;
    shop_id: string;
    delivery_address: string | null;
    delivery_lat: string | null;
    delivery_lng: string | null;
    rider_notes: string | null;
    subtotal_bdt: number;
    total_bdt: number;
  },
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<{ id: string } | null> {
  // Idempotency check: already has a delivery_request for this order?
  const existing = await (tx ?? db)
    .select({ id: deliveryRequests.id })
    .from(deliveryRequests)
    .where(eq(deliveryRequests.source_shop_order_id, order.id))
    .limit(1);

  if (existing.length > 0) {
    logger.info('[shopDeliveryBridge] delivery request already exists for order', {
      orderId: order.id,
      deliveryRequestId: existing[0].id,
    });
    return existing[0];
  }

  // Validate required fields
  if (!order.delivery_address || !order.delivery_lat || !order.delivery_lng) {
    logger.error('[shopDeliveryBridge] food delivery order missing delivery address', {
      orderId: order.id,
    });
    return null;
  }

  // A5 (audit #6): resolve the shop row for REAL pickup coordinates. The
  // previous code dispatched couriers to the customer's dropoff coords with a
  // UUID string as the pickup address.
  const [shop] = await (tx ?? db)
    .select({
      address_line: shops.address_line,
      lat: shops.lat,
      lng: shops.lng,
    })
    .from(shops)
    .where(eq(shops.id, order.shop_id))
    .limit(1);

  if (!shop || !shop.address_line || !shop.lat || !shop.lng) {
    logger.error('[shopDeliveryBridge] shop missing address/coords', {
      orderId: order.id,
      shopId: order.shop_id,
    });
    return null;
  }

  // Create delivery request from shop order
  // FLAGGED follow-up: the 10-minute bidding window is hardcoded — moving it
  // behind a platform_config key is pending the spec owner's key decision.
  const deadline = new Date(Date.now() + 10 * 60 * 1000);

  const [delivery] = await (tx ?? db)
    .insert(deliveryRequests)
    .values({
      created_by_user_id: order.rider_user_id,
      source_shop_order_id: order.id,
      status: 'pending',
      pickup_address: shop.address_line,
      pickup_lat: shop.lat,
      pickup_lng: shop.lng,
      dropoff_address: order.delivery_address,
      dropoff_lat: order.delivery_lat,
      dropoff_lng: order.delivery_lng,
      package_description: order.rider_notes ?? `Food order from shop`,
      deadline_at: deadline,
    })
    .returning({ id: deliveryRequests.id });

  logger.info('[shopDeliveryBridge] delivery request created from food order', {
    orderId: order.id,
    deliveryRequestId: delivery.id,
  });

  return delivery;
}
