/**
 * GET /api/shop/orders/[id]
 * Order detail (shop member of any role, or the ordering rider) — the F-11
 * customer tracking view's full read: items, the delivery leg (courier
 * assignment state), and the config-fresh cancel affordance.
 */
import { db } from "@/src/db";
import {
  shopOrders,
  shopOrderItems,
  shopProducts,
  shops,
  deliveries,
} from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { requireMemberRoles } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { CUSTOMER_CANCELLABLE_STATES, cancelFeeBdt } from "@/lib/shopOrderCancel";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid order id" }, { status: 400 });
    }

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

    // Auth: shop member (owner/manager/staff) or the ordering rider — same
    // matrix as the status route.
    let authorized = false;
    try {
      await requireShopMember(order.shop_id, ["OWNER", "MANAGER", "STAFF"])(request);
      authorized = true;
    } catch {
      // Not a shop member — fall through to the ordering-rider check.
    }
    if (!authorized) {
      const { dbUser } = await requireMemberRoles(["rider", "driver"])(request);
      if (dbUser.id !== order.rider_user_id) {
        return Response.json(
          { error: "forbidden", message: "Not authorized" },
          { status: 403 },
        );
      }
    }

    // Items
    const items = await db
      .select({
        id: shopOrderItems.id,
        product_id: shopOrderItems.product_id,
        quantity: shopOrderItems.quantity,
        unit_price_bdt: shopOrderItems.unit_price_bdt,
        line_total_bdt: shopOrderItems.line_total_bdt,
        product_name: shopProducts.name,
      })
      .from(shopOrderItems)
      .leftJoin(shopProducts, eq(shopOrderItems.product_id, shopProducts.id))
      .where(eq(shopOrderItems.order_id, id));

    // Shop name for the tracking header.
    const [shopRow] = await db
      .select({ name: shops.name })
      .from(shops)
      .where(eq(shops.id, order.shop_id))
      .limit(1);

    // Delivery leg — courier assignment state (F-11 "courier assigned" step).
    // The leg is created in the placement tx; pickup fulfillment has none.
    const [leg] = await db
      .select({
        status: deliveries.status,
        delivery_man_user_id: deliveries.delivery_man_user_id,
        accepted_at: deliveries.accepted_at,
        delivery_fee_bdt: deliveries.delivery_fee_bdt,
      })
      .from(deliveries)
      .where(eq(deliveries.order_id, id))
      .orderBy(desc(deliveries.created_at))
      .limit(1);

    // S4/F-11: the tracking view's cancel affordance is computed HERE (one
    // source of truth; the fee is config-fresh — the client never reads it).
    const cancellable =
      (CUSTOMER_CANCELLABLE_STATES as readonly string[]).includes(order.status);
    const cancelFee = cancellable ? await cancelFeeBdt(order.status) : null;

    // C7-1 privacy: the shop→courier handover code is staff-only. The
    // rider-identity payload carries delivery_otp only (the C4-5 pattern) —
    // a rider holding pickup_code could socially-engineer a handover.
    const { pickup_code: _stripPickupCode, ...orderForRider } = order;

    return Response.json({
      order: authorized ? order : orderForRider,
      items,
      shop_name: shopRow?.name ?? null,
      leg: leg ?? null,
      cancellable,
      cancel_fee_bdt: cancelFee,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    logger.error("[shop/orders/[id] GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
