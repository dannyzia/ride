/**
 * GET /api/shop/my-orders — the CALLER's own orders (F-11 tracking entry).
 *
 * Auth: required (any customer-capable role). Optional `?shop_id=` filter.
 * Rows carry just enough for the list + tracking deep-link; the tracking
 * screen reads the full detail from GET /api/shop/orders/[id].
 */
import { db } from "@/src/db";
import { shopOrders, shops } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { dbUser } = await requireAnyRole(["rider", "driver"])(request);

    const url = new URL(request.url);
    const shopId = url.searchParams.get("shop_id");
    if (shopId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: shopOrders.id,
        shop_id: shopOrders.shop_id,
        shop_name: shops.name,
        status: shopOrders.status,
        fulfillment: shopOrders.fulfillment,
        subtotal_bdt: shopOrders.subtotal_bdt,
        delivery_fee_bdt: shopOrders.delivery_fee_bdt,
        total_bdt: shopOrders.total_bdt,
        unavailable_item_ids: shopOrders.unavailable_item_ids,
        created_at: shopOrders.created_at,
      })
      .from(shopOrders)
      .innerJoin(shops, eq(shopOrders.shop_id, shops.id))
      .where(
        shopId
          ? and(eq(shopOrders.rider_user_id, dbUser.id), eq(shopOrders.shop_id, shopId))
          : eq(shopOrders.rider_user_id, dbUser.id),
      )
      .orderBy(desc(shopOrders.created_at))
      .limit(50);

    return Response.json({ orders: rows });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Not authorized" }, { status: 403 });
    logger.error("[shop/my-orders GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
