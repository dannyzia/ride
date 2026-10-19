/**
 * PATCH /api/shop/orders/[id]/status
 * Update order status. Shop staff / the ordering rider may update.
 * State machine per §B.3.
 * B2 (audit #10): the row is read under FOR UPDATE, the transition is
 * re-verified against the locked state, and the UPDATE is conditional on the
 * locked status (0 rows ⇒ 409) — no more unlocked read-check-write window.
 */
import { db } from "@/src/db";
import { shopOrders, shopOrderItems, deliveries } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { settleShopOrder } from "@/lib/shopLedger";
import { notifyCustomerOrderStatus, notifyCustomerPartialAccept } from "@/lib/shopNotify";

const statusSchema = z.object({
  status: z.enum([
    "accepted",
    "preparing",
    // S6 (§6.1): courier-search + assignment + handover + fallback states.
    "dispatched",
    "courier_assigned",
    "picked_up",
    "self_delivered",
    "ready_for_pickup",
    "out_for_delivery",
    "delivered",
    "cancelled",
  ]),
  cancel_reason: z.string().max(500).optional(),
  // S3: prep-time picker — set WITH the accept transition (§3 dashboard).
  prep_minutes: z.number().int().min(5).max(720).optional(),
  // S4/F-11: out-of-stock partial accept — shop names the missing items;
  // the totals are recomputed server-side from the remaining snapshot.
  unavailable_item_ids: z.array(z.string().uuid()).max(100).optional(),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["accepted", "cancelled"],
  // S6 (§6.1): "dispatched" = courier search under way. accepted→dispatched
  // is the shop's early Find-courier choice; preparing→dispatched is the
  // explicit trigger (the auto-trigger at prep start is state-preserving —
  // dispatch job 58 accepts orders in either state).
  accepted: ["preparing", "cancelled", "dispatched"],
  preparing: ["ready_for_pickup", "cancelled", "dispatched"],
  dispatched: ["courier_assigned", "self_delivered", "cancelled"],
  courier_assigned: ["ready_for_pickup", "cancelled"],
  // S6: the courier picks up after the shop marks ready (F-11 handover).
  // C5/C6-FIX: ready_for_pickup → self_delivered is the pickup-fulfillment
  // counter handover (no leg exists, so the courier path can never own
  // these orders). ready_for_pickup → delivered stays for the legacy
  // in-person handover, now shop-gated above like every completion state.
  ready_for_pickup: ["out_for_delivery", "delivered", "picked_up", "self_delivered", "cancelled"],
  picked_up: ["delivered"],
  out_for_delivery: ["delivered", "cancelled"],
};

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid order id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;
    const targetStatus = result.data.status;

    let guard: Response | null = null;
    let newStatus: string | undefined;
    // C5-4: set inside the tx when the accept carries missing items.
    let partialMissingCount = 0;

    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, id))
        .limit(1)
        .for("update");

      const order = orderRows[0];
      if (!order) {
        guard = Response.json(
          { error: "not_found", message: "Order not found" },
          { status: 404 },
        );
        return;
      }

      // Validate transition against the LOCKED row
      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(targetStatus)) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${order.status} to ${targetStatus}`,
          },
          { status: 409 },
        );
        return;
      }

      // Auth: shop member (owner/manager/staff) or the ordering rider
      let authorized = false;
      let isShopMember = false;
      try {
        await requireShopMember(order.shop_id, ["OWNER", "MANAGER", "STAFF"])(
          request,
        );
        authorized = true;
        isShopMember = true;
      } catch {
        // Not a shop member — check if the ordering rider
      }

      // S6 (§6.1) + C5/C6-FIX unified delivered-transition: dispatch AND
      // completion states are SHOP-side only. The ordering rider drives
      // ONLY cancel — delivered/out_for_delivery join the gate so a rider
      // can never complete their own order (the courier drives delivered
      // via the leg action; the shop drives self_delivered for pickup).
      // The gate and the completion path below are ONE change by
      // construction: neither works without the other.
      const SHOP_ONLY_STATES = [
        "dispatched",
        "courier_assigned",
        "picked_up",
        "self_delivered",
        "out_for_delivery",
        "delivered",
      ];
      if (!isShopMember && SHOP_ONLY_STATES.includes(targetStatus)) {
        guard = Response.json(
          { error: "forbidden", message: "Only the shop can perform this transition" },
          { status: 403 },
        );
        return;
      }

      if (!authorized) {
        const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);
        if (dbUser.id !== order.rider_user_id) {
          guard = Response.json(
            { error: "forbidden", message: "Not authorized" },
            { status: 403 },
          );
          return;
        }
      }

      // C5/C6-FIX unified delivered-transition (courier vs pickup split):
      // a courier-fulfillment order (a live leg exists) can NEVER complete
      // through this route — the courier's leg action owns delivered (ONE tx:
      // settleShopOrder + settleDeliveryLeg + leg close). The shop completing
      // around a live leg is the livelock this redesign deletes.
      // Pickup-fulfillment orders (no leg) complete here via self_delivered.
      const COMPLETION_STATES = ["delivered", "out_for_delivery", "self_delivered"];
      if (COMPLETION_STATES.includes(targetStatus)) {
        const liveLegs = await tx
          .select({ id: deliveries.id, status: deliveries.status })
          .from(deliveries)
          .where(
            and(
              eq(deliveries.order_id, id),
              inArray(deliveries.status, ["created", "offered", "accepted", "picked_up"]),
            ),
          )
          .limit(1);
        const liveLeg = liveLegs[0];
        if (liveLeg && (targetStatus === "delivered" || targetStatus === "out_for_delivery")) {
          guard = Response.json(
            {
              error: "courier_owns_completion",
              message: "A courier is assigned — completion runs through the courier delivery flow",
            },
            { status: 403 },
          );
          return;
        }
        if (liveLeg && targetStatus === "self_delivered") {
          if (liveLeg.status === "accepted" || liveLeg.status === "picked_up") {
            // The courier holds (or is collecting) the goods — the shop
            // cannot self-complete under them.
            guard = Response.json(
              {
                error: "courier_owns_completion",
                message: "The courier holds this delivery — cancel the dispatch first",
              },
              { status: 403 },
            );
            return;
          }
          // Unclaimed chain (created/offered): fail it in-tx with the
          // self-delivery (same shape as the cancel arm) so no further
          // offers go out for a completed order.
          await tx
            .update(deliveries)
            .set({
              status: "failed",
              offered_to_user_id: null,
              offer_expires_at: null,
              updated_at: new Date(),
            })
            .where(
              and(
                eq(deliveries.order_id, id),
                inArray(deliveries.status, ["created", "offered"]),
              ),
            );
        }
      }

      // Set timestamp fields
      const updates: Record<string, unknown> = {
        status: targetStatus,
        updated_at: new Date(),
      };

      if (targetStatus === "accepted") {
        updates.accepted_at = new Date();
        // S3 prep-time picker: the estimate rides with the accept.
        if (result.data.prep_minutes !== undefined) {
          updates.prep_minutes = result.data.prep_minutes;
        }
        // S4/F-11 partial accept: recompute the totals from the REMAINING
        // items (the fee snapshot is unchanged). The customer confirms the
        // reduced order (confirm-partial) or cancels — never silently billed.
        if (result.data.unavailable_item_ids !== undefined) {
          const unavailable = result.data.unavailable_item_ids;
          const items = await tx
            .select()
            .from(shopOrderItems)
            .where(eq(shopOrderItems.order_id, id));
          const known = new Set(items.map((it) => it.product_id));
          if (unavailable.some((pid) => !known.has(pid))) {
            guard = Response.json(
              { error: "unknown_item", message: "unavailable_item_ids must be a subset of the order items" },
              { status: 400 },
            );
            return;
          }
          const missing = new Set(unavailable);
          const newSubtotal = items
            .filter((it) => !missing.has(it.product_id))
            .reduce((sum, it) => sum + it.line_total_bdt, 0);
          updates.unavailable_item_ids = unavailable;
          updates.subtotal_bdt = newSubtotal;
          updates.total_bdt = newSubtotal + (order.delivery_fee_bdt ?? 0);
          if (unavailable.length > 0) partialMissingCount = unavailable.length;
        }
      }
      if (targetStatus === "preparing") updates.prepared_at = new Date();
      if (targetStatus === "dispatched") updates.dispatched_at = new Date();
      if (targetStatus === "ready_for_pickup") updates.ready_at = new Date();
      if (targetStatus === "picked_up") updates.picked_up_at = new Date();
      if (targetStatus === "out_for_delivery") updates.picked_up_at = new Date();
      if (targetStatus === "delivered" || targetStatus === "self_delivered") {
        updates.delivered_at = new Date();
      }
      if (targetStatus === "cancelled") {
        updates.cancelled_at = new Date();
        updates.cancel_reason = result.data.cancel_reason ?? null;
        // S6 F-12: a cancel under way kills the live dispatch chain so no
        // further offers go out for this order. C5/C6-FIX (C7-3 unified
        // leg-reconciliation): ACCEPTED legs die here too — an accepted leg
        // whose order is cancelled can never strand a courier holding a job
        // for a dead order (matches the cancel+api arm's kill list; picked_up
        // legs are unreachable — a picked-up order is not cancellable).
        await tx
          .update(deliveries)
          .set({
            status: "failed",
            offered_to_user_id: null,
            offer_expires_at: null,
            updated_at: new Date(),
          })
          .where(
            and(
              eq(deliveries.order_id, id),
              inArray(deliveries.status, ["created", "offered", "accepted"]),
            ),
          );
      }

      // Conditional write: 0 rows means a racing transition won the row
      const updated = await tx
        .update(shopOrders)
        .set(updates)
        .where(and(eq(shopOrders.id, id), eq(shopOrders.status, order.status)))
        .returning({ id: shopOrders.id });

      if (updated.length === 0) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: `Cannot transition from ${order.status} to ${targetStatus}`,
          },
          { status: 409 },
        );
        return;
      }

      // S3/§12: order revenue + commission land in the SAME tx as the
      // delivered transition — a settle failure rolls the status back (no
      // delivered order without its ledger entries). Audit (§11 review 1).
      // S6: self-delivery settles the SAME way, PLUS the delivery_fee credit
      // (C6-4 — the shop keeps the customer's delivery fee; there is no
      // courier earnings/due row — §6.1 exhaustion fallback). No courier →
      // no deliverySettlement writes.
      if (targetStatus === "delivered" || targetStatus === "self_delivered") {
        await settleShopOrder(
          tx,
          {
            id: order.id,
            shop_id: order.shop_id,
            subtotal_bdt: order.subtotal_bdt,
            delivery_fee_bdt: order.delivery_fee_bdt ?? null,
          },
          { selfDelivered: targetStatus === "self_delivered" },
        );
      }

      newStatus = targetStatus;
    });

    if (guard) return guard;

    // C5-4: the shop's partial accept → the customer (fire-and-forget,
    // deduped) — confirm the reduced order or cancel, never silently billed.
    if (newStatus === "accepted" && partialMissingCount > 0) {
      try {
        const [cust] = await db
          .select({ rider_user_id: shopOrders.rider_user_id })
          .from(shopOrders)
          .where(eq(shopOrders.id, id))
          .limit(1);
        if (cust?.rider_user_id) {
          void notifyCustomerPartialAccept(id, cust.rider_user_id, partialMissingCount);
        }
      } catch (e: unknown) {
        logger.warn("[shop/orders/status] partial-accept notify failed", {
          orderId: id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // F-29: picked up / delivered → the ordering customer (fire-and-forget,
    // deduped — a retried transition can never double-push). S6 adds
    // courier_assigned (§6.1 step 4, written by the accept route) and
    // self_delivered (§6.1 exhaustion fallback).
    if (
      newStatus === "out_for_delivery" ||
      newStatus === "delivered" ||
      newStatus === "self_delivered"
    ) {
      try {
        const [cust] = await db
          .select({ rider_user_id: shopOrders.rider_user_id })
          .from(shopOrders)
          .where(eq(shopOrders.id, id))
          .limit(1);
        if (cust?.rider_user_id) {
          void notifyCustomerOrderStatus(id, cust.rider_user_id, newStatus);
        }
      } catch (e: unknown) {
        logger.warn("[shop/orders/status] push notify failed", {
          orderId: id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Z2: emit after the tx (v1 §D.4.1 shop:order_status) — customer + shop staff
    try {
      const [orderRow] = await db
        .select({ rider_user_id: shopOrders.rider_user_id, shop_id: shopOrders.shop_id })
        .from(shopOrders)
        .where(eq(shopOrders.id, id))
        .limit(1);
      notifyWs([
        {
          event: "shop:order_status",
          to: [
            ...(orderRow ? [{ kind: "user" as const, user_id: orderRow.rider_user_id }] : []),
            ...(orderRow ? [{ kind: "shop_staff" as const, shop_id: orderRow.shop_id }] : []),
          ],
          payload: { order_id: id, shop_id: orderRow?.shop_id ?? null, status: newStatus },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[shop/orders/status] ws notify failed", {
        orderId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ message: "Order updated", status: newStatus });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    logger.error("[shop/orders/status PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
