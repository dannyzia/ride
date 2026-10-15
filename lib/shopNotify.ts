/**
 * shopNotify.ts — F-29 push notifications for the shop-order flow (S4).
 *
 * Spec: delivery/offer class notifications are NEVER batched across events —
 * each event is its own single-recipient send, deduped on the canonical
 * idempotency gate (one push per (event, order, recipient), ever).
 * Two edges ship with S4:
 *   - new order → the shop's active members (+ the owner)
 *   - picked up / delivered → the ordering customer
 * ("Courier assigned" rides the same helper when S6 writes that state.)
 *
 * All sends are fire-and-forget with swallowed errors: a push failure must
 * never fail the order/status transition that triggered it.
 */
import { db } from "@/src/db";
import { shopMembers, shops } from "@/src/db/schema";
import { sendNotification } from "@/lib/notify";
import { formatBDT } from "@/lib/format";
import { logger } from "@/lib/logger";
import { eq, and, isNull } from "drizzle-orm";

/** Recipients of a new-order alert: active members + the shop owner. */
async function shopRecipients(shopId: string): Promise<string[]> {
  const members = await db
    .select({ user_id: shopMembers.user_id })
    .from(shopMembers)
    .where(
      and(
        eq(shopMembers.shop_id, shopId),
        eq(shopMembers.status, "active"),
        isNull(shopMembers.removed_at),
      ),
    );
  const [shop] = await db
    .select({ owner_user_id: shops.owner_user_id })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);

  return [
    ...new Set(
      [...members.map((m) => m.user_id), shop?.owner_user_id].filter(
        (v): v is string => typeof v === "string",
      ),
    ),
  ];
}

/**
 * New order placed → every active shop member (+ owner), high priority,
 * one send per recipient deduped on `shop_new_order:{orderId}:{userId}`.
 */
export async function notifyShopNewOrder(
  orderId: string,
  shopId: string,
  totalBdt: number,
): Promise<void> {
  try {
    const recipients = await shopRecipients(shopId);
    const total = formatBDT(totalBdt);
    for (const userId of recipients) {
      await sendNotification(
        userId,
        "shop:new_order",
        "New order",
        `A new order of ${total} is waiting for your response.`,
        { order_id: orderId, shop_id: shopId },
        { priority: "high", idempotencyKey: `shop_new_order:${orderId}:${userId}` },
      ).catch(() => {});
    }
  } catch (err) {
    logger.warn("[shopNotify] new-order notify failed", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Customer-facing copy per order status. */
const CUSTOMER_COPY: Record<string, { title: string; body: string }> = {
  // S4 transitions (the status route's enum).
  out_for_delivery: {
    title: "Order picked up",
    body: "The courier picked up your order and is on the way.",
  },
  delivered: {
    title: "Order delivered",
    body: "Your order has been delivered. Pay cash on receipt.",
  },
  // S6 (§6.1): assignment + self-delivery fallback states.
  courier_assigned: {
    title: "Courier assigned",
    body: "A courier is on the way for your order.",
  },
  picked_up: {
    title: "Order picked up",
    body: "The courier picked up your order and is on the way.",
  },
  self_delivered: {
    title: "Order delivered",
    body: "Your order was delivered directly by the shop. Pay cash on receipt.",
  },
};

/**
 * Order status → the ordering customer, high priority, deduped on
 * `shop_order_status:{orderId}:{status}:{userId}` — a retried transition
 * can never double-push.
 */
export async function notifyCustomerOrderStatus(
  orderId: string,
  userId: string,
  status: string,
): Promise<void> {
  const copy = CUSTOMER_COPY[status];
  if (!copy) return; // unimplemented status — nothing to say (yet)
  try {
    await sendNotification(
      userId,
      "shop:order_status",
      copy.title,
      copy.body,
      { order_id: orderId, status },
      {
        priority: "high",
        idempotencyKey: `shop_order_status:${orderId}:${status}:${userId}`,
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[shopNotify] customer status notify failed", {
      orderId,
      status,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
