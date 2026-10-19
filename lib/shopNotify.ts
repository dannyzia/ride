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
import type { NotifyCopyKey } from "@/lib/notifyCopy";
import { notifyWs } from "@/lib/wsNotify";
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

/**
 * Customer-facing copy per order status. The copyKey twin (D2-3) resolves
 * the same text in the recipient's stored locale at send time; the literal
 * stays as fallback (dict miss → literal, never blank).
 */
const CUSTOMER_COPY: Record<string, { title: string; body: string; copyKey: NotifyCopyKey }> = {
  // S4 transitions (the status route's enum).
  out_for_delivery: {
    title: "Order picked up",
    body: "The courier picked up your order and is on the way.",
    copyKey: "shop_order_picked_up",
  },
  delivered: {
    title: "Order delivered",
    body: "Your order has been delivered. Pay cash on receipt.",
    copyKey: "shop_order_delivered",
  },
  // S6 (§6.1): assignment + self-delivery fallback states.
  courier_assigned: {
    title: "Courier assigned",
    body: "A courier is on the way for your order.",
    copyKey: "shop_courier_assigned",
  },
  picked_up: {
    title: "Order picked up",
    body: "The courier picked up your order and is on the way.",
    copyKey: "shop_order_picked_up",
  },
  self_delivered: {
    title: "Order delivered",
    body: "Your order was delivered directly by the shop. Pay cash on receipt.",
    copyKey: "shop_order_self_delivered",
  },
};

/**
 * C5/C6-FIX (C5-4): the shop's partial accept → the ordering customer, WITH
 * the missing-item count. The customer confirms the reduced order
 * (confirm-partial) or cancels — they are never silently billed. Deduped on
 * `shop_order_partial_accept:{orderId}` so a retried accept cannot double-push.
 */
export async function notifyCustomerPartialAccept(
  orderId: string,
  userId: string,
  missingCount: number,
): Promise<void> {
  try {
    await sendNotification(
      userId,
      "shop:order_status",
      "Some items are unavailable",
      `The shop marked ${missingCount} item${missingCount === 1 ? "" : "s"} unavailable. Confirm the reduced order or cancel — you will only pay for what remains.`,
      { order_id: orderId, status: "accepted", partial: "true" },
      {
        priority: "high",
        idempotencyKey: `shop_order_partial_accept:${orderId}:${userId}`,
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[shopNotify] partial-accept notify failed", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * S7 §7 A1 + A3: admin force-cancel → the affected customer, WITH the reason.
 * The reason is part of the copy on purpose (the order requires it to surface
 * to the user); it is deduped on `shop_order_force_cancel:{orderId}:{userId}`
 * so a retried admin action cannot double-push.
 */
export async function notifyCustomerForceCancel(
  orderId: string,
  userId: string,
  reason: string,
): Promise<void> {
  try {
    await sendNotification(
      userId,
      "shop:order_status",
      "Order cancelled by support",
      `Your order was cancelled by support. Reason: ${reason}`,
      { order_id: orderId, status: "cancelled", reason },
      {
        priority: "high",
        idempotencyKey: `shop_order_force_cancel:${orderId}:${userId}`,
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[shopNotify] force-cancel notify failed", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Staff invite (S3 Flow 15): the owner minted a MANAGER|STAFF membership row
 * → the invitee gets a push AND a WS event. The push is deduped on
 * `shop_staff_invite:{memberId}:{userId}` so a retried invite cannot
 * double-push; the WS event lets a foreground app route to the shop surface
 * without waiting for the next cold boot. Fire-and-forget: never throws.
 */
export async function notifyStaffInvite(args: {
  memberId: string;
  shopId: string;
  shopName: string;
  inviteeUserId: string;
  role: "MANAGER" | "STAFF";
}): Promise<void> {
  const { memberId, shopId, shopName, inviteeUserId, role } = args;
  const roleLabel = role === "MANAGER" ? "a manager" : "staff";
  try {
    await sendNotification(
      inviteeUserId,
      "shop:staff_invite",
      "You've been added to a shop team",
      `${shopName || "A shop"} added you as ${roleLabel}. Open the shop surface to see its orders queue.`,
      { shop_id: shopId, member_id: memberId, role },
      {
        priority: "high",
        idempotencyKey: `shop_staff_invite:${memberId}:${inviteeUserId}`,
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[shopNotify] staff-invite push failed", {
      shopId,
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    notifyWs([
      {
        event: "shop:staff_invite",
        to: [{ kind: "user", user_id: inviteeUserId }],
        payload: { shop_id: shopId, member_id: memberId, role },
      },
    ]);
  } catch (err) {
    logger.warn("[shopNotify] staff-invite ws failed", {
      shopId,
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * F-39: courier flagged a short-paying customer → every active shop member
 * (+ owner), high priority. The C6-2 bell pattern: one send per recipient
 * deduped on `shop_complaint_flagged:{complaintId}:{userId}`.
 * Fire-and-forget: never throws.
 */
export async function notifyShopComplaintFlagged(args: {
  shopId: string;
  orderId: string;
  complaintId: string;
  shortfallBdt: number | null;
}): Promise<void> {
  const { shopId, orderId, complaintId, shortfallBdt } = args;
  try {
    const recipients = await shopRecipients(shopId);
    const shortfall =
      shortfallBdt != null && shortfallBdt > 0
        ? ` Short by ${formatBDT(shortfallBdt)} against the COD total.`
        : "";
    for (const userId of recipients) {
      await sendNotification(
        userId,
        "shop:complaint_flagged",
        "Customer flagged for short payment",
        `The courier reported the customer underpaid on order ${orderId.slice(0, 8)}.${shortfall} Review and escalate if needed.`,
        { order_id: orderId, complaint_id: complaintId, shop_id: shopId },
        {
          priority: "high",
          idempotencyKey: `shop_complaint_flagged:${complaintId}:${userId}`,
        },
      ).catch(() => {});
    }
  } catch (err) {
    logger.warn("[shopNotify] complaint-flagged notify failed", {
      shopId,
      orderId,
      complaintId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * F-39: admin decided a customer complaint → the three affected parties
 * (customer, shop members + owner, flagging courier), each deduped on
 * `shop_complaint_decided:{complaintId}:{userId}`. Fire-and-forget.
 */
export async function notifyComplaintDecided(args: {
  complaintId: string;
  orderId: string;
  shopId: string;
  customerUserId: string;
  courierUserId: string;
  decision: "banned" | "dismissed";
}): Promise<void> {
  const { complaintId, orderId, shopId, customerUserId, courierUserId, decision } = args;
  const customerBody =
    decision === "banned"
      ? "Support reviewed the short-payment report and suspended your account. Contact support to appeal."
      : "Support reviewed the short-payment report and closed it with no action on your account.";
  const staffBody =
    decision === "banned"
      ? "Support reviewed your escalation and suspended the customer account."
      : "Support reviewed your escalation and closed the complaint with no suspension.";
  try {
    await sendNotification(
      customerUserId,
      "shop:complaint_decided",
      "Support decision on your order",
      customerBody,
      { order_id: orderId, complaint_id: complaintId, decision },
      {
        priority: "high",
        idempotencyKey: `shop_complaint_decided:${complaintId}:${customerUserId}`,
      },
    ).catch(() => {});
    const recipients = await shopRecipients(shopId);
    for (const userId of recipients) {
      await sendNotification(
        userId,
        "shop:complaint_decided",
        "Support decided the complaint",
        staffBody,
        { order_id: orderId, complaint_id: complaintId, decision },
        {
          priority: "high",
          idempotencyKey: `shop_complaint_decided:${complaintId}:${userId}`,
        },
      ).catch(() => {});
    }
    await sendNotification(
      courierUserId,
      "shop:complaint_decided",
      "Support decided the complaint",
      staffBody,
      { order_id: orderId, complaint_id: complaintId, decision },
      {
        priority: "high",
        idempotencyKey: `shop_complaint_decided:${complaintId}:${courierUserId}`,
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[shopNotify] complaint-decided notify failed", {
      complaintId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

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
        copyKey: copy.copyKey,
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
