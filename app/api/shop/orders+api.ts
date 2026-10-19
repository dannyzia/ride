/**
 * Shop orders.
 *
 * POST /api/shop/orders — create order (rider/driver)
 * GET  /api/shop/orders?shop_id=... — list orders for a shop (owner/member)
 */
import { db } from "@/src/db";
import { shopOrders, shopOrderItems, shopProducts, shopMembers, shops, shopTypes, deliveries } from "@/src/db/schema";
import { requireMemberRoles } from "@/lib/auth";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { quoteDeliveryFee } from "@/lib/shopDeliveryFee";
import { createDeliveryLegFromOrder } from "@/lib/shopDeliveryBridge";
import { notifyShopNewOrder } from "@/lib/shopNotify";
import {
  extractIdempotencyKey,
  beginIdempotencyClaim,
  storeIdempotencyOutcome,
  sha256Fingerprint,
  IDEMPOTENCY_ROUTES,
} from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, count, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";

const orderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z
  .object({
    shop_id: z.string().uuid(),
    items: z.array(orderItemSchema).min(1),
    fulfillment: z.enum(["delivery", "pickup"]).default("delivery"),
    delivery_address: z.string().max(500).optional(),
    delivery_lat: z.number().min(-90).max(90).optional(),
    delivery_lng: z.number().min(-180).max(180).optional(),
    rider_notes: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      d.fulfillment !== "delivery" ||
      (d.delivery_address !== undefined &&
        d.delivery_lat !== undefined &&
        d.delivery_lng !== undefined),
    { message: "delivery address and coordinates required for delivery orders" },
  );

export async function POST(request: Request) {
  // §8 + decision 01M23628A1566SK1D5XXV1NT5G: optional Idempotency-Key —
  // absent → legacy behavior; present → (route, key) barrier replays the
  // stored outcome instead of double-charging stock.
  let idempotencyKey: string | null = null;
  try {
    if (!(await isVerticalEnabled("marketplace_shops_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Shops are not enabled" },
        { status: 403 },
      );
    }

    const { supabaseUser, dbUser } = await requireMemberRoles(["rider", "driver"])(
      request,
    );

    // Raw body captured BEFORE parseJsonBody consumes the stream (the
    // idempotency fingerprint); Zod runs on a re-parse — same pattern as
    // package/purchase.
    const rawBody: string = await request.text();
    const bodyForParse = new Request("http://internal/parse", {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(bodyForParse, createOrderSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    idempotencyKey = extractIdempotencyKey(request);
    if (idempotencyKey) {
      const claim = await beginIdempotencyClaim({
        route: IDEMPOTENCY_ROUTES.shopOrderCreate,
        key: idempotencyKey,
        userId: dbUser.id,
        requestFingerprint: sha256Fingerprint("POST", rawBody),
      });
      if (claim.kind !== "execute") return claim.response;
    }

    // Delivery orders require address
    if (body.fulfillment === "delivery" && !body.delivery_address) {
      return Response.json(
        { error: "delivery_address_required", message: "Delivery address is required for delivery orders" },
        { status: 400 },
      );
    }

    const { order, items, feeBdt, totalBdt } = await db.transaction(async (tx) => {
      // R5 (§3): closed is REJECTED SERVER-SIDE, not just hidden in UI. The
      // shops row is read inside the tx; busy (F-16) does NOT block orders
      // (throttle-not-close) and only surfaces as a checkout signal.
      const [shopRow] = await tx
        .select({
          is_open: shops.is_open,
          lat: shops.lat,
          lng: shops.lng,
          shop_type_id: shops.shop_type_id,
        })
        .from(shops)
        .where(and(eq(shops.id, body.shop_id), isNull(shops.deleted_at)))
        .limit(1)
        .for("update");

      if (!shopRow) {
        throw Object.assign(new Error("Shop not found"), {
          status: 404,
          code: "shop_not_found",
        });
      }
      if (!shopRow.is_open) {
        throw Object.assign(new Error("Shop is closed"), {
          status: 409,
          code: "shop_closed",
        });
      }

      // §5: the food-vs-general split is DATA-DRIVEN from the shop's type —
      // never a client-supplied or hard-coded category.
      const [shopTypeRow] = shopRow.shop_type_id
        ? await tx
            .select({ is_restaurant: shopTypes.is_restaurant })
            .from(shopTypes)
            .where(eq(shopTypes.id, shopRow.shop_type_id))
            .limit(1)
        : [];
      const isRestaurant = shopTypeRow?.is_restaurant ?? false;

      // §12: the delivery fee is QUOTED fresh from platform_config and
      // SNAPSHOT onto the order (R-A9 — a mid-flight admin edit never
      // changes a placed order). Pickup orders carry no fee.
      let deliveryFeeBdt: number | null = null;
      if (body.fulfillment === "delivery") {
        if (!shopRow.lat || !shopRow.lng) {
          throw Object.assign(new Error("shop has no pickup coordinates"), {
            status: 400,
            code: "shop_location_missing",
          });
        }
        const quote = await quoteDeliveryFee({
          shopLat: Number(shopRow.lat),
          shopLng: Number(shopRow.lng),
          dropLat: body.delivery_lat as number,
          dropLng: body.delivery_lng as number,
        });
        deliveryFeeBdt = quote.fee_bdt;
      }

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
          delivery_fee_bdt: deliveryFeeBdt,
          total_bdt:
            deliveryFeeBdt === null ? subtotal : subtotal + deliveryFeeBdt,
          category: isRestaurant ? "food" : "general",
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

      // §6.1 step 1 + R8: the delivery leg is created in the SAME tx as the
      // order, fee snapshot carried over. null ⇒ 409 + full rollback (never
      // an order without its leg). Pickup orders have no leg.
      if (body.fulfillment === "delivery") {
        const leg = await createDeliveryLegFromOrder(
          {
            id: order.id,
            rider_user_id: dbUser.id,
            shop_id: body.shop_id,
            order_kind: "catalog",
            category: isRestaurant ? "food" : "general",
            delivery_address: body.delivery_address ?? null,
            delivery_lat:
              body.delivery_lat !== undefined ? String(body.delivery_lat) : null,
            delivery_lng:
              body.delivery_lng !== undefined ? String(body.delivery_lng) : null,
            delivery_fee_bdt: deliveryFeeBdt,
          },
          tx,
        );
        if (!leg) {
          throw Object.assign(new Error("delivery leg unavailable"), {
            status: 409,
            code: "leg_unavailable",
          });
        }
      }

      return {
        order,
        items: insertedItems,
        feeBdt: deliveryFeeBdt,
        totalBdt:
          deliveryFeeBdt === null ? subtotal : subtotal + deliveryFeeBdt,
      };
    });

    // F-29: new order → shop staff (fire-and-forget, never fails placement).
    void notifyShopNewOrder(order.id, body.shop_id, totalBdt);

    const successResponse = Response.json(
      {
        order_id: order.id,
        items: items.length,
        delivery_fee_bdt: feeBdt,
        total_bdt: totalBdt,
        message: "Order placed",
      },
      { status: 201 },
    );
    if (idempotencyKey) {
      await storeIdempotencyOutcome(
        { route: IDEMPOTENCY_ROUTES.shopOrderCreate, key: idempotencyKey },
        successResponse,
      );
    }
    return successResponse;
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    const code =
      err instanceof Error ? (err as { code?: string }).code : undefined;
    let errorResponse: Response;
    if (status === 401)
      errorResponse = Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    else if (status === 403)
      errorResponse = Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    else if (status === 404)
      errorResponse = Response.json(
        { error: "shop_not_found", message: "Shop not found" },
        { status: 404 },
      );
    else if (code === "shop_closed")
      errorResponse = Response.json(
        { error: "shop_closed", message: "Shop is closed and not accepting orders" },
        { status: 409 },
      );
    else if (code === "leg_unavailable")
      errorResponse = Response.json(
        {
          error: "delivery_leg_unavailable",
          message: "Could not create the delivery leg for this order",
        },
        { status: 409 },
      );
    else if (status === 400)
      errorResponse = Response.json(
        { error: "invalid_order", message: (err as Error).message },
        { status: 400 },
      );
    else {
      logger.error("[shop/orders POST] error", err);
      errorResponse = Response.json(
        { error: "internal_error", message: "An internal server error occurred" },
        { status: 500 },
      );
    }
    // §8: the TYPED failure is stored so a retry with the same key replays
    // it instead of re-entering the flow.
    if (idempotencyKey) {
      await storeIdempotencyOutcome(
        { route: IDEMPOTENCY_ROUTES.shopOrderCreate, key: idempotencyKey },
        errorResponse,
      );
    }
    return errorResponse;
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

    // C5/C6-FIX: the dashboard's Delivered button must disappear for
    // courier orders — one batched live-leg lookup for the page (a live leg
    // = created/offered/accepted/picked_up; delivered/failed are history).
    const orderIds = rows.map((r) => r.id);
    const liveLegRows =
      orderIds.length > 0
        ? await db
            .select({ order_id: deliveries.order_id })
            .from(deliveries)
            .where(
              and(
                inArray(deliveries.order_id, orderIds),
                inArray(deliveries.status, ["created", "offered", "accepted", "picked_up"]),
              ),
            )
        : [];
    const liveLegSet = new Set(liveLegRows.map((r) => r.order_id));

    return Response.json({
      orders: rows.map((r) => ({ ...r, has_live_leg: liveLegSet.has(r.id) })),
      total,
      page,
      limit,
    });
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
