// GET / PATCH /api/admin/vehicle-model/:id — single-resource endpoint
// F15-API-08.
import { db } from "@/src/db";
import { vehicleModels } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";

const patchSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  year_start: z.number().int().min(1900).max(2100).optional().nullable(),
  year_end: z.number().int().min(1900).max(2100).optional().nullable(),
  default_vehicle_type: VEHICLE_TYPE_ZOD_ENUM.optional(),
  typical_cc_min: z.number().int().min(0).optional().nullable(),
  typical_cc_max: z.number().int().min(0).optional().nullable(),
  has_ac: z.boolean().optional().nullable(),
  passenger_seats: z.number().int().min(1).max(20).optional().nullable(),
  is_active: z.boolean().optional(),
});

const idSchema = z.string().uuid();

export async function GET(request: Request, { id }: { id: string }) {
  try {
    await requireRole("admin")(request);
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "id must be a valid UUID" },
        { status: 400 },
      );
    }
    const [row] = await db
      .select()
      .from(vehicleModels)
      .where(eq(vehicleModels.id, parsedId.data))
      .limit(1);
    if (!row) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ model: row });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/vehicle-model/:id] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser: admin } = await requireRole("admin")(request);
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
      .update(vehicleModels)
      .set(updates)
      .where(eq(vehicleModels.id, parsedId.data))
      .returning();
    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });

    logger.info("[admin/vehicle-model/:id] updated", {
      modelId: parsedId.data,
      adminId: admin.id,
    });

    return Response.json({ model: updated });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/vehicle-model/:id] PATCH error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
