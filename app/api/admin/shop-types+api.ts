/**
 * GET  /api/admin/shop-types      — list ALL shop categories (incl. inactive) for management
 * POST /api/admin/shop-types      — add a category (admin-extensible lookup, owner ruling)
 *
 * Auth: GET → requireAdminPermission('admin.read') (all four admin roles —
 *       ops_manager/moderator are read-only on the new queues per A2).
 *      POST → requireAdminPermission('shoptypes.manage') (owner, admin).
 *
 * The customer good-morning screen reads the active rows via the public
 * GET /api/shop/types, so a type added here appears with zero client change.
 */
import { db } from "@/src/db";
import { shopTypes, auditLogs } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";

const createSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "slug must be lowercase snake_case"),
  label_en: z.string().min(1).max(120),
  label_bn: z.string().min(1).max(120),
  is_restaurant: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(9999).default(0),
  active: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("admin.read")(request);

    const rows = await db
      .select()
      .from(shopTypes)
      .orderBy(asc(shopTypes.sort_order), asc(shopTypes.slug));

    return Response.json({ shop_types: rows });
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
    logger.error("[admin/shop-types] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission("shoptypes.manage")(request);

    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const existing = await db
      .select({ id: shopTypes.id })
      .from(shopTypes)
      .where(eq(shopTypes.slug, body.slug))
      .limit(1);
    if (existing.length > 0) {
      return Response.json(
        { error: "slug_taken", message: "A shop type with this slug already exists" },
        { status: 409 },
      );
    }

    const [row] = await db
      .insert(shopTypes)
      .values({
        slug: body.slug,
        label_en: body.label_en,
        label_bn: body.label_bn,
        is_restaurant: body.is_restaurant,
        sort_order: body.sort_order,
        active: body.active,
      })
      .returning();

    // A3/A5: every admin write to this catalog lands in audit_logs.
    try {
      await db.insert(auditLogs).values({
        actor_user_id: dbUser.id,
        action: "shop_type_create",
        entity_type: "shop_type",
        entity_id: row.id,
        new_value: { ...body },
      });
    } catch (auditErr) {
      logger.error("[admin/shop-types] audit_logs write failed", auditErr);
    }

    return Response.json({ shop_type: row }, { status: 201 });
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
    if (status === 400)
      return Response.json(
        { error: "invalid_body", message: "Invalid request body" },
        { status: 400 },
      );
    if (errors.getErrorCode(err) === "23505") {
      return Response.json(
        { error: "slug_taken", message: "A shop type with this slug already exists" },
        { status: 409 },
      );
    }
    logger.error("[admin/shop-types] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
