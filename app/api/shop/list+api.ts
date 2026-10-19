// [public]
/**
 * GET /api/shop/list?page=1&limit=20&search=...&type=<slug>
 * Public paginated shop listing (active, non-deleted shops).
 *
 * S4 (§5): `type` filters by shop_types.slug — the category the customer
 * tapped on the good-morning screen. Each row carries its type's display
 * fields (flat snake_case) so the client renders the restaurant-vs-catalog
 * split and locale labels without a second fetch.
 */
import { db } from "@/src/db";
import { shops, shopTypes } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import { count, asc, ilike, and, isNull, eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
    const search = url.searchParams.get("search") ?? "";
    const typeSlug = url.searchParams.get("type") ?? "";
    const offset = (page - 1) * limit;

    const conditions = [isNull(shops.deleted_at), eq(shops.status, "active")];
    if (search) {
      conditions.push(ilike(shops.name, `%${search}%`));
    }
    if (typeSlug) {
      conditions.push(eq(shopTypes.slug, typeSlug));
    }

    const [totalRow] = await db
      .select({ count: count() })
      .from(shops)
      // LEFT join: a legacy shop with no category still appears in the
      // all-shops listing (null type fields); the WHERE on shopTypes.slug
      // narrows it to the category only when `type` is given.
      .leftJoin(shopTypes, eq(shops.shop_type_id, shopTypes.id))
      .where(and(...conditions));

    const rows = await db
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
        // §5: the listing renders the restaurant-vs-catalog split and the
        // locale label straight from these fields.
        shop_type_slug: shopTypes.slug,
        shop_type_label_en: shopTypes.label_en,
        shop_type_label_bn: shopTypes.label_bn,
        shop_type_is_restaurant: shopTypes.is_restaurant,
        created_at: shops.created_at,
      })
      .from(shops)
      .leftJoin(shopTypes, eq(shops.shop_type_id, shopTypes.id))
      .where(and(...conditions))
      .orderBy(asc(shops.name))
      .limit(limit)
      .offset(offset);

    return Response.json({
      shops: rows,
      total: totalRow?.count ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    logger.error("[shop/list] error", err);
    return Response.json(
      { error: "internal_error", message: "Failed to fetch shops" },
      { status: 500 },
    );
  }
}
