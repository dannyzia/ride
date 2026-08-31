/**
 * GET /api/shop/[id]
 * Public shop detail + active products + is_member check.
 */
import { db } from "@/src/db";
import { shops, shopProducts, shopMembers } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, count as cnt } from "drizzle-orm";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const shopRows = await db
      .select()
      .from(shops)
      .where(and(eq(shops.id, id), isNull(shops.deleted_at)))
      .limit(1);

    const shop = shopRows[0];
    if (!shop || shop.status !== "active") {
      return Response.json(
        { error: "not_found", message: "Shop not found" },
        { status: 404 },
      );
    }

    // Active products
    const products = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.shop_id, id),
          eq(shopProducts.is_active, true),
          isNull(shopProducts.deleted_at),
        ),
      );

    // Member count
    const [{ memberCount }] = await db
      .select({ memberCount: cnt() })
      .from(shopMembers)
      .where(
        and(
          eq(shopMembers.shop_id, id),
          isNull(shopMembers.removed_at),
        ),
      );

    return Response.json({
      shop: {
        ...shop,
        lat: shop.lat ? Number(shop.lat) : null,
        lng: shop.lng ? Number(shop.lng) : null,
      },
      products,
      member_count: memberCount ?? 0,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    logger.error("[shop/[id]] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
