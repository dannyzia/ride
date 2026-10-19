/**
 * Shop products management.
 *
 * GET    /api/shop/[id]/products — FULL live catalog incl. is_active=false
 *        rows (S3 catalog screen needs them to re-enable a paused item; the
 *        PUBLIC /api/shop/[id] detail route stays active-only).
 * POST   /api/shop/[id]/products — add product (OWNER/MANAGER)
 * PATCH  /api/shop/[id]/products?id=... — update product
 * DELETE /api/shop/[id]/products?id=... — soft-delete product
 */
import { db } from "@/src/db";
import { shopProducts } from "@/src/db/schema";
import { CATALOG_FOLDERS, LEGACY_STORAGE_BUCKET, folderPrefix } from "@/lib/storageFolders";
import { isAllowedStorageUrl } from "@/lib/storageUrl";
import { requireShopMember } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, isNull, desc } from "drizzle-orm";
import { z } from "zod";

/**
 * D5-1: every image URL must be Ride-owned storage under a catalog folder
 * (R2 `catalog/` prefix on our domain, or a legacy-bucket row). Owner-
 * UNSCOPED: each staffer uploads under their own uid segment and a product
 * outlives any one staffer, so only folder-prefix + host are checked — the
 * same shape as the documents/profile policies minus the uid segment.
 */
function areAllowedCatalogUrls(urls: string[]): boolean {
  return urls.every((url) =>
    CATALOG_FOLDERS.some((folder) =>
      isAllowedStorageUrl(url, {
        bucket: LEGACY_STORAGE_BUCKET,
        r2Prefix: folderPrefix(folder),
      }),
    ),
  );
}

export async function GET(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    await requireShopMember(id, ["OWNER", "MANAGER"])(request);

    const rows = await db
      .select()
      .from(shopProducts)
      .where(
        and(
          eq(shopProducts.shop_id, id),
          isNull(shopProducts.deleted_at),
        ),
      )
      .orderBy(desc(shopProducts.created_at));

    return Response.json({ products: rows });
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
    logger.error("[shop/products GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

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
    if (result.data.image_urls && !areAllowedCatalogUrls(result.data.image_urls)) {
      return Response.json(
        { error: "invalid_image_url", message: "Product images must be uploaded through the app" },
        { status: 400 },
      );
    }

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
    if (result.data.image_urls && !areAllowedCatalogUrls(result.data.image_urls)) {
      return Response.json(
        { error: "invalid_image_url", message: "Product images must be uploaded through the app" },
        { status: 400 },
      );
    }

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
