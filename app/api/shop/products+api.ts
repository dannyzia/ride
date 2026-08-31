/**
 * GET /api/shop/products?shop_id=...&page=1&limit=20
 * Public paginated product listing for a shop.
 */
import { db } from "@/src/db";
import { shopProducts } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import { count, asc, and, isNull, eq } from "drizzle-orm";
import { z } from "zod";

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

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
    const offset = (page - 1) * limit;

    const conditions = [
      eq(shopProducts.shop_id, shopId),
      eq(shopProducts.is_active, true),
      isNull(shopProducts.deleted_at),
    ];

    const [{ total }] = await db
      .select({ total: count() })
      .from(shopProducts)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(shopProducts)
      .where(and(...conditions))
      .orderBy(asc(shopProducts.name))
      .limit(limit)
      .offset(offset);

    return Response.json({ products: rows, total, page, limit });
  } catch (err: unknown) {
    logger.error("[shop/products] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
