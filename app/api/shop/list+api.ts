/**
 * GET /api/shop/list?page=1&limit=20&search=...
 * Public paginated shop listing (active, non-deleted shops).
 */
import { db } from "@/src/db";
import { shops } from "@/src/db/schema";
import { logger } from "@/lib/logger";
import { count, asc, ilike, and, isNull, eq } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
    const search = url.searchParams.get("search") ?? "";
    const offset = (page - 1) * limit;

    const conditions = [isNull(shops.deleted_at), eq(shops.status, "active")];
    if (search) {
      conditions.push(ilike(shops.name, `%${search}%`));
    }

    const [totalRow] = await db
      .select({ count: count() })
      .from(shops)
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
        created_at: shops.created_at,
      })
      .from(shops)
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
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}


