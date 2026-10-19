/**
 * POST /api/shop/orders/[id]/cancel — customer cancel, PRE-PICKUP only
 * (plan 27 §5, F-11).
 *
 * Rules live in lib/shopOrderCancel.ts: a free cancel while the order is
 * still `pending`; the config-fresh state-dependent fee (seeds-not-constants,
 * launch default 0) applies after the shop accepts. Once a courier has the
 * goods (picked_up/out_for_delivery/delivered) the cancel path is closed —
 * the F-38 dispute link is the route. Same tx: the order flips, stock is
 * RESTORED, and the placement-created `deliveries` leg is failed (never a
 * cancelled order with a live leg). No ledger entry: revenue settles only
 * on `delivered` (S3 settleShopOrder).
 */
import { db } from "@/src/db";
import { shopOrders, shopOrderItems, shopProducts, deliveries } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { CUSTOMER_CANCELLABLE_STATES, cancelFeeBdt } from "@/lib/shopOrderCancel";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and, inArray, sql } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid order id" }, { status: 400 });
    }

    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);

    let guard: Response | null = null;
    let feeBdt = 0;

    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select()
        .from(shopOrders)
        .where(eq(shopOrders.id, id))
        .limit(1)
        .for("update");

      const order = orderRows[0];
      if (!order) {
        guard = Response.json({ error: "not_found", message: "Order not found" }, { status: 404 });
        return;
      }
      if (order.rider_user_id !== dbUser.id) {
        guard = Response.json({ error: "forbidden", message: "Not your order" }, { status: 403 });
        return;
      }
      if (order.status === "cancelled") {
        guard = Response.json(
          { error: "already_cancelled", message: "Order is already cancelled" },
          { status: 409 },
        );
        return;
      }
      if (!(CUSTOMER_CANCELLABLE_STATES as readonly string[]).includes(order.status)) {
        guard = Response.json(
          {
            error: "cancel_not_allowed",
            message: "Only pre-pickup orders can be cancelled — use the dispute link instead",
          },
          { status: 409 },
        );
        return;
      }

      // Config-fresh, state-dependent fee (free while pending).
      feeBdt = await cancelFeeBdt(order.status);

      const updated = await tx
        .update(shopOrders)
        .set({
          status: "cancelled",
          cancelled_at: new Date(),
          cancel_reason: "customer_cancelled",
          cancel_fee_bdt: feeBdt,
          updated_at: new Date(),
        })
        .where(and(eq(shopOrders.id, id), eq(shopOrders.status, order.status)))
        .returning({ id: shopOrders.id });

      if (updated.length === 0) {
        guard = Response.json(
          { error: "invalid_transition", message: "Order state changed — refresh and retry" },
          { status: 409 },
        );
        return;
      }

      // Restock: the placement tx deducted stock for these items.
      const items = await tx
        .select()
        .from(shopOrderItems)
        .where(eq(shopOrderItems.order_id, id));
      for (const item of items) {
        await tx
          .update(shopProducts)
          .set({ stock: sql`${shopProducts.stock} + ${item.quantity}` })
          .where(eq(shopProducts.id, item.product_id));
      }

      // Fail the placement-created leg (pre-accept/pickup only — a picked-up
      // leg can never reach here because its order status is not cancellable).
      await tx
        .update(deliveries)
        .set({ status: "failed", updated_at: new Date() })
        .where(
          and(
            eq(deliveries.order_id, id),
            inArray(deliveries.status, ["created", "offered", "accepted"]),
          ),
        );
    });

    if (guard) return guard;

    // Z2 pattern: emit after the tx — customer + shop staff.
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
          payload: { order_id: id, shop_id: orderRow?.shop_id ?? null, status: "cancelled" },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[order/cancel] ws notify failed", {
        orderId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ status: "cancelled", cancel_fee_bdt: feeBdt });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    logger.error("[order/cancel POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
