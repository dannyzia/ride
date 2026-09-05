/**
 * POST /api/shop/orders/[id]/mark-ready
 * Shop staff marks order as ready.
 * - Food DELIVERY orders: shopDeliveryBridge runs INSIDE the same tx (§C.1) —
 *   a bridge failure rolls the status write back (no orphan ready_for_pickup)
 * - Pickup orders: order sits ready_for_pickup until shop marks delivered
 */
import { db } from "@/src/db";
import { shopOrders } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { createFromShopOrder } from "@/lib/shopDeliveryBridge";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    let guard: Response | null = null;
    await db.transaction(async (tx) => {
      // A2 (§C.1): the order row is read under FOR UPDATE; the status write,
      // the conditional guard, and the food-delivery bridge all share this tx.
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

      if (order.status !== "preparing") {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: "Order must be in 'preparing' status",
          },
          { status: 409 },
        );
        return;
      }

      await requireShopMember(order.shop_id, ["OWNER", "MANAGER", "STAFF"])(
        request,
      );

      // Conditional write: 0 rows means a racing transition/cancel won the row
      const updated = await tx
        .update(shopOrders)
        .set({
          status: "ready_for_pickup",
          ready_at: new Date(),
          updated_at: new Date(),
        })
        .where(and(eq(shopOrders.id, id), eq(shopOrders.status, "preparing")))
        .returning({ id: shopOrders.id });

      if (updated.length === 0) {
        guard = Response.json(
          {
            error: "invalid_transition",
            message: "Order must be in 'preparing' status",
          },
          { status: 409 },
        );
        return;
      }

      // Phase 4: food delivery orders → create delivery request via bridge
      // (F8) INSIDE the tx. null ⇒ 409 and full rollback: the order stays
      // 'preparing' with no orphan ready_for_pickup state.
      if (order.category === "food" && order.fulfillment === "delivery") {
        const delivery = await createFromShopOrder(
          {
            id: order.id,
            rider_user_id: order.rider_user_id,
            shop_id: order.shop_id,
            delivery_address: order.delivery_address,
            delivery_lat: order.delivery_lat,
            delivery_lng: order.delivery_lng,
            rider_notes: order.rider_notes,
            subtotal_bdt: order.subtotal_bdt,
            total_bdt: order.total_bdt,
          },
          tx,
        );

        if (!delivery) {
          throw Object.assign(new Error("food_delivery_unavailable"), {
            status: 409,
          });
        }

        logger.info("[shop/mark-ready] food delivery bridge created", {
          orderId: id,
          deliveryRequestId: delivery.id,
        });
        // Note: shop:delivery_created WS event will be emitted by the deliveryHandler
        // when the delivery request is broadcast to couriers.
      }
    });

    if (guard) return guard;

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
          payload: { order_id: id, shop_id: orderRow?.shop_id ?? null, status: "ready_for_pickup" },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[shop/mark-ready] ws notify failed", {
        orderId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ message: "Order marked ready" });
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
    if (status === 409) {
      const code = (err as Error).message === "food_delivery_unavailable"
        ? "food_delivery_unavailable"
        : "invalid_transition";
      return Response.json(
        {
          error: code,
          message:
            code === "food_delivery_unavailable"
              ? "Food delivery is unavailable for this order"
              : "Order must be in 'preparing' status",
        },
        { status: 409 },
      );
    }
    logger.error("[shop/mark-ready POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
