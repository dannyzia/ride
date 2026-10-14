/**
 * shopDeliveryBridge.ts — Declared writer of `deliveries` legs for shop
 * orders (plan 27 §6.1 + R8: EXTEND this bridge's storage — the universal
 * legs table from migration 0060 — never a parallel legs table).
 *
 * S4: the leg is created in the SAME transaction as the order (§6.1 step 1),
 * with the customer-paid fee SNAPSHOT carried over from the order (R-A9 — a
 * mid-flight admin fee edit never changes a placed order). Status starts at
 * `created`; the sequential courier offers (S6) take it from there.
 *
 * Write-ownership: this is the ONLY file that creates delivery legs from
 * shop orders.
 *
 * Retirement note (§6.1): the previous RFQ implementation inserted a
 * `delivery_requests` row for the retired courier-bidding marketplace. That
 * path is gone; `delivery_requests`/`delivery_bids` tables remain on disk
 * only for the parcel-P2P consumers and are archived/dropped at S6 with the
 * full consumer audit.
 */
import { db } from '@/src/db';
import { deliveries, shops } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from './logger';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One delivery order → one leg (idempotent on order_id). */
export async function createDeliveryLegFromOrder(
  order: {
    id: string;
    rider_user_id: string;
    shop_id: string;
    order_kind: string;
    category: string;
    delivery_address: string | null;
    delivery_lat: string | null;
    delivery_lng: string | null;
    delivery_fee_bdt: number | null;
  },
  tx: Tx,
): Promise<{ id: string } | null> {
  // Idempotent: the order already has its leg?
  const existing = await tx
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(eq(deliveries.order_id, order.id))
    .limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  if (!order.delivery_address || !order.delivery_lat || !order.delivery_lng) {
    logger.error('[shopDeliveryBridge] delivery order missing dropoff coords', {
      orderId: order.id,
    });
    return null;
  }

  const [shop] = await tx
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

  // §1 source_vertical: workshop service job → workshop_product; food →
  // food_order; everything else → shop_order.
  const sourceVertical =
    order.order_kind === 'service_booking'
      ? 'workshop_product'
      : order.category === 'food'
        ? 'food_order'
        : 'shop_order';

  const [leg] = await tx
    .insert(deliveries)
    .values({
      source_vertical: sourceVertical,
      order_id: order.id,
      pickup_shop_id: order.shop_id,
      pickup_address: shop.address_line,
      pickup_lat: shop.lat,
      pickup_lng: shop.lng,
      dropoff_address: order.delivery_address,
      dropoff_lat: order.delivery_lat,
      dropoff_lng: order.delivery_lng,
      dropoff_user_id: order.rider_user_id,
      // Snapshot of the customer-paid fee at placement (never null for
      // delivery legs — the order route quotes it before this call).
      delivery_fee_bdt: order.delivery_fee_bdt ?? 0,
      status: 'created',
    })
    .returning({ id: deliveries.id });

  logger.info('[shopDeliveryBridge] delivery leg created from shop order', {
    orderId: order.id,
    deliveryId: leg?.id,
    sourceVertical,
  });

  return leg ?? null;
}
