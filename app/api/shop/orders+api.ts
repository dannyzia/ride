/**
 * Shop orders.
 *
 * POST /api/shop/orders — create order (rider/driver)
 * GET  /api/shop/orders?shop_id=... — list orders for a shop (owner/member)
 */
import { db } from "@/src/db";
import { shopOrders, shopOrderItems, shopProducts, shopMembers } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, count, desc, sql } from "drizzle-orm";
import { z } from "zod";

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  shop_id: z.string().uuid(),
  items: z.array(orderItemSchema).min(1),
  fulfillment: z.enum(["delivery", "pickup"]).default("delivery"),
  delivery_address: z.string().max(500).optional(),
  delivery_lat: z.number().min(-90).max(90).optional(),
  delivery_lng: z.number().min(-180).max(180).optional(),
  rider_notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    if (!(await isVerticalEnabled("marketplace_shops_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Shops are not enabled" },
        { status: 403 },
      );
    }

    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    const result = await parseJsonBody(request, createOrderSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Delivery orders require address
    if (body.fulfillment === "delivery" && !body.delivery_address) {
      return Response.json(
        { error: "delivery_address_required", message: "Delivery address is required for delivery orders" },
        { status: 400 },
      );
    }

    const { order, items } = await db.transaction(async (tx) => {
      // Look up products and compute totals
      const productIds = body.items.map((i) => i.product_id);
      const products = await tx
        .select()
        .from(shopProducts)
        .where(
          and(
            eq(shopProducts.shop_id, body.shop_id),
            eq(shopProducts.is_active, true),
            isNull(shopProducts.deleted_at),
          ),
        );

      const productMap = new Map(products.map((p) => [p.id, p]));
      let subtotal = 0;
      const orderItems: {
        product_id: string;
        quantity: number;
        unit_price_bdt: number;
        line_total_bdt: number;
      }[] = [];

      for (const item of body.items) {
        const product = productMap.get(item.product_id);
        if (!product) {
          throw Object.assign(new Error("Product not found or inactive"), {
            status: 400,
          });
        }
        if (product.stock < item.quantity) {
          throw Object.assign(new Error("Insufficient stock"), {
            status: 400,
          });
        }
        const lineTotal = product.price_bdt * item.quantity;
        subtotal += lineTotal;
        orderItems.push({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price_bdt: product.price_bdt,
          line_total_bdt: lineTotal,
        });
      }

      const [order] = await tx
        .insert(shopOrders)
        .values({
          shop_id: body.shop_id,
          rider_user_id: dbUser.id,
          subtotal_bdt: subtotal,
          total_bdt: subtotal, // delivery_fee_bdt set later for food
          fulfillment: body.fulfillment,
          delivery_address: body.delivery_address,
          delivery_lat: body.delivery_lat ? String(body.delivery_lat) : null,
          delivery_lng: body.delivery_lng ? String(body.delivery_lng) : null,
          rider_notes: body.rider_notes,
        })
        .returning({ id: shopOrders.id });

      // Deduct stock
      for (const item of body.items) {
        await tx
          .update(shopProducts)
          .set({ stock: sql`${shopProducts.stock} - ${item.quantity}` })
          .where(eq(shopProducts.id, item.product_id));
      }

      const insertedItems = await tx
        .insert(shopOrderItems)
        .values(
          orderItems.map((oi) => ({ ...oi, order_id: order.id })),
        )
        .returning();

      return { order, items: insertedItems };
    });

    return Response.json(
      { order_id: order.id, items: items.length, message: "Order placed" },
      { status: 201 },
    );
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
    if (status === 400)
      return Response.json(
        { error: "invalid_order", message: (err as Error).message },
        { status: 400 },
      );
    logger.error("[shop/orders POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shopId = url.searchParams.get("shop_id");
    if (!shopId) {
      return Response.json(
        { error: "invalid_param", message: "shop_id required" },
        { status: 400 },
      );
    }

    const { supabaseUser, dbUser } = await requireShopMember(shopId)(request);

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;

    const [{ total }] = await db
      .select({ total: count() })
      .from(shopOrders)
      .where(eq(shopOrders.shop_id, shopId));

    const rows = await db
      .select()
      .from(shopOrders)
      .where(eq(shopOrders.shop_id, shopId))
      .orderBy(desc(shopOrders.created_at))
      .limit(limit)
      .offset(offset);

    return Response.json({ orders: rows, total, page, limit });
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
    logger.error("[shop/orders GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
