/**
 * GET /api/shop/types — public active shop categories, display order.
 *
 * The customer good-morning screen renders these tiles (label picked by
 * locale client-side); each category opens its shop list. Owner ruling:
 * a category the admin adds appears here with ZERO client change.
 * Unauthenticated, same posture as GET /api/shop/list.
 */
import { db } from "@/src/db";
import { shopTypes } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import { asc, eq, and } from "drizzle-orm";

export async function GET(_request: Request) {
  try {
    const rows = await db
      .select({
        id: shopTypes.id,
        slug: shopTypes.slug,
        label_en: shopTypes.label_en,
        label_bn: shopTypes.label_bn,
        is_restaurant: shopTypes.is_restaurant,
        sort_order: shopTypes.sort_order,
      })
      .from(shopTypes)
      .where(and(eq(shopTypes.active, true)))
      .orderBy(asc(shopTypes.sort_order), asc(shopTypes.slug));

    return Response.json({ shop_types: rows });
  } catch (err: unknown) {
    logger.error("[shop/types] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
