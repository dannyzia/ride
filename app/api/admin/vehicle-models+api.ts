// GET / POST /api/admin/vehicle-models — collection endpoint
// F15-API-08.
import { db } from "@/src/db";
import { vehicleModels } from "@/src/db/schema";
import { eq, ilike, and, sql, or, asc } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";

const createSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year_start: z.number().int().min(1900).max(2100).optional().nullable(),
  year_end: z.number().int().min(1900).max(2100).optional().nullable(),
  default_vehicle_type: VEHICLE_TYPE_ZOD_ENUM,
  typical_cc_min: z.number().int().min(0).optional().nullable(),
  typical_cc_max: z.number().int().min(0).optional().nullable(),
  has_ac: z.boolean().optional().nullable(),
  passenger_seats: z.number().int().min(1).max(20).optional().nullable(),
  is_active: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);
    const url = new URL(request.url);
    const brand = url.searchParams.get("brand");
    const search = url.searchParams.get("search");
    const vehicleType = url.searchParams.get("vehicle_type");
    const activeOnly = url.searchParams.get("active");
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
      200,
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const conditions = [];
    if (brand) conditions.push(ilike(vehicleModels.brand, `%${brand}%`));
    if (vehicleType)
      conditions.push(
        eq(vehicleModels.default_vehicle_type, vehicleType as never),
      );
    if (search) {
      conditions.push(
        or(
          ilike(vehicleModels.brand, `%${search}%`),
          ilike(vehicleModels.model, `%${search}%`),
        )!,
      );
    }
    if (activeOnly === "true")
      conditions.push(eq(vehicleModels.is_active, true));
    if (activeOnly === "false")
      conditions.push(eq(vehicleModels.is_active, false));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(vehicleModels)
        .where(where)
        .orderBy(asc(vehicleModels.brand), asc(vehicleModels.model))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vehicleModels)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? rows.length;

    return Response.json({
      models: rows,
      total,
      has_more: offset + rows.length < total,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/vehicle-models] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireRole("admin")(request);
    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;

    // Filter out null values for nullable-but-notNull-with-default columns
    // (Drizzle's insert typing for `passenger_seats` requires number | undefined.)
    const insertPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(result.data)) {
      if (v === null) continue; // let DB default apply
      insertPayload[k] = v;
    }
    const [created] = await db
      .insert(vehicleModels)
      .values(insertPayload as never)
      .returning();

    logger.info("[admin/vehicle-models] created", {
      modelId: created.id,
      brand: created.brand,
      model: created.model,
      adminId: admin.id,
    });

    return Response.json({ model: created }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/vehicle-models] POST error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
