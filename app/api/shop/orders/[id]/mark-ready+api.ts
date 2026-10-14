/**
 * POST /api/shop/orders/[id]/mark-ready
 * Shop staff marks order as ready.
 * - PURE conditional transition (S4/§6.1): the delivery leg is created in
 *   the ORDER PLACEMENT tx (lib/shopDeliveryBridge.ts) — no leg write here
 * - Pickup + delivery orders alike: order sits ready_for_pickup until shop
 *   marks delivered
 */
import { db } from "@/src/db";
import { shopOrders } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid order id" }, { status: 400 });
    }

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

      // S4/§6.1 RETIREMENT: the RFQ bridge (delivery_requests insert for the
      // courier-bidding marketplace) is gone. The universal `deliveries` leg
      // is created in the ORDER PLACEMENT tx (lib/shopDeliveryBridge.ts, R8)
      // and dispatches from here via the sequential offer chain (S6).
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
      // S4/§6.1: the food_delivery_unavailable arm is retired with the RFQ
      // bridge — a 409 from the tx is a transition conflict.
      return Response.json(
        {
          error: "invalid_transition",
          message: "Order must be in 'preparing' status",
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
