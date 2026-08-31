/**
 * POST /api/shop/orders/[id]/mark-ready
 * Shop staff marks order as ready.
 * - Food DELIVERY orders: triggers shopDeliveryBridge (Phase 4 glue — stub in Phase 1)
 * - Pickup orders: order sits ready_for_pickup until shop marks delivered
 */
import { db } from "@/src/db";
import { shopOrders } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const orderRows = await db
      .select()
      .from(shopOrders)
      .where(eq(shopOrders.id, id))
      .limit(1);

    const order = orderRows[0];
    if (!order) {
      return Response.json(
        { error: "not_found", message: "Order not found" },
        { status: 404 },
      );
    }

    if (order.status !== "preparing") {
      return Response.json(
        {
          error: "invalid_transition",
          message: "Order must be in 'preparing' status",
        },
        { status: 409 },
      );
    }

    await requireShopMember(order.shop_id, ["OWNER", "MANAGER", "STAFF"])(
      request,
    );

    await db
      .update(shopOrders)
      .set({
        status: "ready_for_pickup",
        ready_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(shopOrders.id, id));

    // Phase 4: food delivery orders → create delivery request via bridge (F8)
    if (order.category === "food" && order.fulfillment === "delivery") {
      const { createFromShopOrder } = await import("@/lib/shopDeliveryBridge");
      const delivery = await createFromShopOrder({
        id: order.id,
        rider_user_id: order.rider_user_id,
        shop_id: order.shop_id,
        delivery_address: order.delivery_address,
        delivery_lat: order.delivery_lat,
        delivery_lng: order.delivery_lng,
        rider_notes: order.rider_notes,
        subtotal_bdt: order.subtotal_bdt,
        total_bdt: order.total_bdt,
      });

      if (delivery) {
        logger.info("[shop/mark-ready] food delivery bridge created", {
          orderId: id,
          deliveryRequestId: delivery.id,
        });
        // Note: shop:delivery_created WS event will be emitted by the deliveryHandler
        // when the delivery request is broadcast to couriers.
      }
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
    logger.error("[shop/mark-ready POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
