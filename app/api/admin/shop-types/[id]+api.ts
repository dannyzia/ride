/**
 * PATCH /api/admin/shop-types/[id] — edit labels / is_restaurant / sort / active.
 *
 * "Deactivate" is PATCH { active: false } (owner ruling §7: add/edit/deactivate;
 * no hard delete — the lookup row may be referenced by existing shops).
 * Auth: requireAdminPermission('shoptypes.manage') (owner, admin).
 */
import { db } from "@/src/db";
import { shopTypes, auditLogs } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq } from "drizzle-orm";

const patchSchema = z
  .object({
    label_en: z.string().min(1).max(120).optional(),
    label_bn: z.string().min(1).max(120).optional(),
    is_restaurant: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(9999).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.label_en !== undefined ||
      v.label_bn !== undefined ||
      v.is_restaurant !== undefined ||
      v.sort_order !== undefined ||
      v.active !== undefined,
    { message: "At least one field is required" },
  );

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const { dbUser } = await requireAdminPermission("shoptypes.manage")(request);

    if (!z.string().uuid().safeParse(id).success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid shop type id" },
        { status: 400 },
      );
    }

    const result = await parseJsonBody(request, patchSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [existing] = await db
      .select()
      .from(shopTypes)
      .where(eq(shopTypes.id, id))
      .limit(1);

    if (!existing) {
      return Response.json(
        { error: "not_found", message: "Shop type not found" },
        { status: 404 },
      );
    }

    const [row] = await db
      .update(shopTypes)
      .set({ ...body, updated_at: new Date() })
      .where(eq(shopTypes.id, id))
      .returning();

    if (!row) {
      return Response.json(
        { error: "not_found", message: "Shop type not found" },
        { status: 404 },
      );
    }

    // A3/A5: edit and deactivation both land in audit_logs (old vs new).
    try {
      await db.insert(auditLogs).values({
        actor_user_id: dbUser.id,
        action: body.active === false ? "shop_type_deactivate" : "shop_type_update",
        entity_type: "shop_type",
        entity_id: id,
        old_value: { ...existing },
        new_value: { ...body },
      });
    } catch (auditErr) {
      logger.error("[admin/shop-types/[id]] audit_logs write failed", auditErr);
    }

    return Response.json({ shop_type: row });
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
    logger.error("[admin/shop-types/[id]] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
