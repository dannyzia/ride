/**
 * GET /api/shop/orders/[id]
 * Order detail (owner/member or the ordering rider).
 */
import { db } from "@/src/db";
import { shopOrders, shopOrderItems, shopProducts, shopMembers } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
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

    return Response.json({ order, items });
  } catch (err: unknown) {
    logger.error("[shop/orders/[id] GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
