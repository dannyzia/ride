/**
 * GET    /api/admin/marketplace/service-zones — list service zones (fleet filter)
 * POST   /api/admin/marketplace/service-zones — bulk add cells (fleet_id + h3_cells[])
 * DELETE /api/admin/marketplace/service-zones — remove by id or {fleet_id, h3_cell}
 *
 * SOLE writer of fleet_service_zones (spec §C.7).
 * Auth: requireAdminPermission('marketplace.write').
 *
 * Validates: h3_cells must be res-8 strings (res-9 rejected in v1).
 */
import { db } from "@/src/db";
import { fleetServiceZones } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";

// H3 res-8 cells are 15 chars; res-9 are 16 chars. Reject res-9 in v1.
const H3_RES8_LENGTH = 15;
const H3_RES9_LENGTH = 16;

const postSchema = z.object({
  fleet_id: z.string().uuid(),
  h3_cells: z.array(z.string().min(1).max(20)).min(1).max(200),
});

const deleteSchema = z.object({
  id: z.string().uuid().optional(),
  fleet_id: z.string().uuid().optional(),
  h3_cell: z.string().max(20).optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const url = new URL(request.url);
    const fleetId = url.searchParams.get("fleet_id");

    const where = fleetId ? eq(fleetServiceZones.fleet_id, fleetId) : undefined;

    const rows = await db
      .select()
      .from(fleetServiceZones)
      .where(where)
      .orderBy(sql`${fleetServiceZones.fleet_id}, ${fleetServiceZones.h3_cell}`);

    return Response.json({ zones: rows, count: rows.length });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/service-zones GET] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const result = await parseJsonBody(request, postSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Validate resolution: reject res-9 (16 chars) in v1
    const res9Cells = body.h3_cells.filter((c) => c.length === H3_RES9_LENGTH);
    if (res9Cells.length > 0) {
      return Response.json(
        { error: "invalid_resolution", message: `res-9 cells rejected in v1: ${res9Cells.slice(0, 3).join(", ")}${res9Cells.length > 3 ? "..." : ""}` },
        { status: 400 },
      );
    }

    // Filter to valid res-8 length (15 chars)
    const validCells = body.h3_cells.filter((c) => c.length === H3_RES8_LENGTH);
    if (validCells.length === 0) {
      return Response.json({ error: "no_valid_cells", message: "No valid res-8 H3 cells provided" }, { status: 400 });
    }

    // Bulk upsert — ON CONFLICT DO NOTHING (unique on fleet_id + h3_cell)
    const rows = validCells.map((cell) => ({
      fleet_id: body.fleet_id,
      h3_cell: cell,
      resolution: 8,
      is_active: true,
    }));

    // Chunk inserts (max 100 per batch to avoid query size limits)
    const CHUNK = 100;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const res = await db
        .insert(fleetServiceZones)
        .values(chunk)
        .onConflictDoNothing()
        .returning({ id: fleetServiceZones.id });
      inserted += res.length;
    }

    logger.info("[admin/marketplace/service-zones POST]", { fleet_id: body.fleet_id, cells: validCells.length, inserted });

    return Response.json({ inserted, total: validCells.length, duplicates_skipped: validCells.length - inserted });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/service-zones POST] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const result = await parseJsonBody(request, deleteSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    if (!body.id && !(body.fleet_id && body.h3_cell)) {
      return Response.json({ error: "missing_params", message: "Provide either 'id' or both 'fleet_id' and 'h3_cell'" }, { status: 400 });
    }

    const where = body.id
      ? eq(fleetServiceZones.id, body.id)
      : and(eq(fleetServiceZones.fleet_id, body.fleet_id!), eq(fleetServiceZones.h3_cell, body.h3_cell!));

    const deleted = await db.delete(fleetServiceZones).where(where).returning({ id: fleetServiceZones.id });

    if (deleted.length === 0) {
      return Response.json({ error: "not_found", message: "Service zone not found" }, { status: 404 });
    }

    logger.info("[admin/marketplace/service-zones DELETE]", { deleted: deleted.length });

    return Response.json({ deleted: deleted.length });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/service-zones DELETE] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
