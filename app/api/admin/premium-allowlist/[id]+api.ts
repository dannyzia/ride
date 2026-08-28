// PATCH / DELETE /api/admin/premium-allowlist/[id]
// Single-resource endpoint for vehicle_premium_allowlist.
import { db } from "@/src/db";
import { vehiclePremiumAllowlist } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";

const idSchema = z.string().uuid();

const patchSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function GET(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }
    const [row] = await db
      .select()
      .from(vehiclePremiumAllowlist)
      .where(eq(vehiclePremiumAllowlist.id, parsedId.data))
      .limit(1);
    if (!row) return Response.json({ error: "not_found", message: "Resource not found" }, { status: 404 });
    return Response.json({ entry: row });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/premium-allowlist/:id] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('catalog.write')(request);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }
    const result = await parseJsonBody(request, patchSchema);
    if (!result.ok) return result.response;

    const updates: Record<string, unknown> = { updated_at: new Date() };
    for (const [k, v] of Object.entries(result.data)) {
      if (v !== undefined) updates[k] = v;
    }

    const [updated] = await db
      .update(vehiclePremiumAllowlist)
      .set(updates)
      .where(eq(vehiclePremiumAllowlist.id, parsedId.data))
      .returning();
    if (!updated) return Response.json({ error: "not_found", message: "Resource not found" }, { status: 404 });

    logger.info("[admin/premium-allowlist/:id] updated", {
      id: parsedId.data,
      adminId: admin.id,
    });

    return Response.json({ entry: updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/premium-allowlist/:id] PATCH error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('catalog.write')(request);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }

    // Soft-deactivate instead of hard delete
    const [updated] = await db
      .update(vehiclePremiumAllowlist)
      .set({ is_active: false, updated_at: new Date() })
      .where(eq(vehiclePremiumAllowlist.id, parsedId.data))
      .returning();
    if (!updated) return Response.json({ error: "not_found", message: "Resource not found" }, { status: 404 });

    logger.info("[admin/premium-allowlist/:id] deactivated", {
      id: parsedId.data,
      adminId: admin.id,
    });

    return Response.json({ entry: updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/premium-allowlist/:id] DELETE error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
