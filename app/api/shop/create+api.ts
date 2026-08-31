/**
 * POST /api/shop/create
 * Create a new shop. Creator becomes OWNER in the same tx.
 * Gated by marketplace_shops_enabled.
 */
import { db } from "@/src/db";
import { shops, shopMembers } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

const createSchema = z.object({
  name: z.string().min(1).max(150),
  slug: z.string().min(1).max(150).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional(),
  phone: z.string().max(20).optional(),
  address_line: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
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

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Create shop + membership in a single transaction
    const { shop, member } = await db.transaction(async (tx) => {
      // Check slug uniqueness
      const existing = await tx
        .select({ id: shops.id })
        .from(shops)
        .where(eq(shops.slug, body.slug))
        .limit(1);

      if (existing.length > 0) {
        throw Object.assign(new Error("Slug taken"), { status: 409 });
      }

      // Insert shop
      const [shop] = await tx
        .insert(shops)
        .values({
          owner_user_id: dbUser.id,
          name: body.name,
          slug: body.slug,
          description: body.description,
          phone: body.phone,
          address_line: body.address_line,
          lat: body.lat ? String(body.lat) : null,
          lng: body.lng ? String(body.lng) : null,
        })
        .returning({ id: shops.id, slug: shops.slug });

      // Creator becomes OWNER member
      const [member] = await tx
        .insert(shopMembers)
        .values({
          shop_id: shop.id,
          user_id: dbUser.id,
          role: "OWNER",
        })
        .returning({ id: shopMembers.id });

      return { shop, member };
    });

    return Response.json(
      {
        shop_id: shop.id,
        slug: shop.slug,
        membership_id: member.id,
        message: "Shop created",
      },
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
    if (status === 409)
      return Response.json(
        { error: "slug_taken", message: "A shop with this slug already exists" },
        { status: 409 },
      );
    if (errors.getErrorCode(err) === "23505")
      return Response.json(
        { error: "slug_taken", message: "A shop with this slug already exists" },
        { status: 409 },
      );
    logger.error("[shop/create] error", err);
    return Response.json(
      {
        error: "internal_error",
        message: "An internal server error occurred",
      },
      { status: 500 },
    );
  }
}
