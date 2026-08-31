/**
 * Shop products management.
 *
 * POST   /api/shop/[id]/products — add product (OWNER/MANAGER)
 * PATCH  /api/shop/[id]/products?id=... — update product
 * DELETE /api/shop/[id]/products?id=... — soft-delete product
 */
import { db } from "@/src/db";
import { shopProducts } from "@/src/db/schema";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price_bdt: z.number().int().positive(),
  stock: z.number().int().min(0).optional(),
  image_urls: z.array(z.string().url()).optional(),
  category: z.string().max(50).optional(),
  is_rfq: z.boolean().optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const result = await parseJsonBody(request, createProductSchema);
    if (!result.ok) return result.response;

    const [product] = await db
      .insert(shopProducts)
      .values({
        shop_id: id,
        name: result.data.name,
        description: result.data.description,
        price_bdt: result.data.price_bdt,
        stock: result.data.stock ?? 0,
        image_urls: result.data.image_urls ?? [],
        category: result.data.category,
        is_rfq: result.data.is_rfq ?? false,
      })
      .returning({ id: shopProducts.id });

    return Response.json(
      { product_id: product.id, message: "Product created" },
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
    logger.error("[shop/products POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const updateProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  price_bdt: z.number().int().positive().optional(),
  stock: z.number().int().min(0).optional(),
  image_urls: z.array(z.string().url()).optional(),
  category: z.string().max(50).nullable().optional(),
  is_active: z.boolean().optional(),
  is_rfq: z.boolean().optional(),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const result = await parseJsonBody(request, updateProductSchema);
    if (!result.ok) return result.response;

    const { id: productId, ...updates } = result.data;

    await db
      .update(shopProducts)
      .set(updates)
      .where(
        and(eq(shopProducts.id, productId), eq(shopProducts.shop_id, id)),
      );

    return Response.json({ message: "Product updated" });
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
    logger.error("[shop/products PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { id }: { id: string }) {
  try {
    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const url = new URL(request.url);
    const productId = url.searchParams.get("id");
    if (!productId) {
      return Response.json(
        { error: "invalid_param", message: "Product id required" },
        { status: 400 },
      );
    }

    await db
      .update(shopProducts)
      .set({ deleted_at: new Date(), is_active: false })
      .where(
        and(eq(shopProducts.id, productId), eq(shopProducts.shop_id, id)),
      );

    return Response.json({ message: "Product deleted" });
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
    logger.error("[shop/products DELETE] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
