// [public]
/**
 * GET /api/shop/[id]
 * Public shop detail + active products + is_member check.
 */
import { db } from "@/src/db";
import { shops, shopProducts, shopMembers } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, count as cnt } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }
    // D4-1: explicit public business-field selection (the shop/list
    // whitelist pattern). NEVER select() the full row here: the shops table
    // carries owner_user_id, the whole verification_* family (incl.
    // verification_reject.internal_note), license/food-safety doc URLs and
    // operational columns that must not leave the server on a public route.
    // Non-active shops 404 via the WHERE clause (same as shop/list).
    const shopRows = await db
      .select({
        id: shops.id,
        name: shops.name,
        slug: shops.slug,
        description: shops.description,
        logo_url: shops.logo_url,
        phone: shops.phone,
        lat: shops.lat,
        lng: shops.lng,
        is_verified: shops.is_verified,
        is_open: shops.is_open,
        busy: shops.busy,
        rating: shops.rating,
        created_at: shops.created_at,
      })
      .from(shops)
      .where(and(eq(shops.id, id), eq(shops.status, "active"), isNull(shops.deleted_at)))
      .limit(1);

    const shop = shopRows[0];
    if (!shop) {
      return Response.json(
        { error: "shop_not_found", message: "Shop not found" },
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

    // The select above is the whitelist: build the response from it field
    // by field so a future column can never leak via a spread.
    return Response.json({
      shop: {
        id: shop.id,
        name: shop.name,
        slug: shop.slug,
        description: shop.description,
        logo_url: shop.logo_url,
        phone: shop.phone,
        lat: shop.lat ? Number(shop.lat) : null,
        lng: shop.lng ? Number(shop.lng) : null,
        is_verified: shop.is_verified,
        is_open: shop.is_open,
        busy: shop.busy,
        rating: shop.rating,
        created_at: shop.created_at,
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
