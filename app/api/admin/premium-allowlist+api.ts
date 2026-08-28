// GET / POST /api/admin/premium-allowlist
// Admin CRUD for vehicle_premium_allowlist — brands/models that map to car_premium.
import { db } from "@/src/db";
import { vehiclePremiumAllowlist } from "@/src/db/schema";
import { eq, ilike, and, sql, asc } from "drizzle-orm";
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";

const createSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission('catalog.write')(request);
    const url = new URL(request.url);
    const brand = url.searchParams.get("brand");
    const activeOnly = url.searchParams.get("active");
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
      200,
    );
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const conditions = [];
    if (brand) conditions.push(ilike(vehiclePremiumAllowlist.brand, `%${brand}%`));
    if (activeOnly === "true")
      conditions.push(eq(vehiclePremiumAllowlist.is_active, true));
    if (activeOnly === "false")
      conditions.push(eq(vehiclePremiumAllowlist.is_active, false));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(vehiclePremiumAllowlist)
        .where(where)
        .orderBy(asc(vehiclePremiumAllowlist.brand), sql`COALESCE(${vehiclePremiumAllowlist.model}, '')`)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vehiclePremiumAllowlist)
        .where(where),
    ]);

    const total = countResult[0]?.count ?? rows.length;

    return Response.json({
      allowlist: rows,
      total,
      has_more: offset + rows.length < total,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/premium-allowlist] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseUser: admin } = await requireAdminPermission('catalog.write')(request);
    const result = await parseJsonBody(request, createSchema);
    if (!result.ok) return result.response;

    // M1: Normalize brand/model (trim) for storage; check LOWER() unique index first
    const brand = result.data.brand.trim();
    const model = result.data.model?.trim() ?? null;

    // Check for duplicate using case-insensitive match (same logic as the unique index)
    const normalizedBrand = brand.toLowerCase();
    const normalizedModel = model?.toLowerCase() ?? null;
    const [existing] = await db
      .select({ id: vehiclePremiumAllowlist.id })
      .from(vehiclePremiumAllowlist)
      .where(
        sql`LOWER(${vehiclePremiumAllowlist.brand}) = ${normalizedBrand} AND LOWER(COALESCE(${vehiclePremiumAllowlist.model}, '')) = ${normalizedModel ?? ''}`,
      )
      .limit(1);

    if (existing) {
      return Response.json(
        { error: "duplicate_entry", message: `An entry for ${brand}${model ? ` ${model}` : ''} already exists` },
        { status: 409 },
      );
    }

    const [created] = await db
      .insert(vehiclePremiumAllowlist)
      .values({
        brand,
        model,
        created_by: admin.id,
      })
      .returning();

    logger.info("[admin/premium-allowlist] created", {
      id: created.id,
      brand: created.brand,
      model: created.model,
      adminId: admin.id,
    });

    return Response.json({ entry: created }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/premium-allowlist] POST error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
