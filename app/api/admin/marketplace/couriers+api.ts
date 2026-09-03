/**
 * GET   /api/admin/marketplace/couriers              — list couriers (type filter, presence)
 * PATCH /api/admin/marketplace/couriers/[id]/status  — suspend/restore
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { couriers, users } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";

const listQuerySchema = z.object({
  type: z.enum(["parcel", "food"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      type: url.searchParams.get("type"),
      status: url.searchParams.get("status"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Invalid query parameters" }, { status: 400 });
    }
    const { type, status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (type) conditions.push(eq(couriers.courier_type, type));
    if (status) conditions.push(eq(couriers.status, status));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    // Join with users for display name
    const rows = await db
      .select({
        id: couriers.id,
        user_id: couriers.user_id,
        courier_type: couriers.courier_type,
        status: couriers.status,
        is_online: couriers.is_online,
        last_seen_at: couriers.last_seen_at,
        completed_count: couriers.completed_count,
        created_at: couriers.created_at,
        user_name: users.name,
        user_phone: users.phone,
      })
      .from(couriers)
      .leftJoin(users, eq(couriers.user_id, users.id))
      .where(where)
      .orderBy(desc(couriers.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(couriers)
      .where(where);

    return Response.json({ couriers: rows, total: countResult?.count ?? 0, page, limit });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/couriers GET] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid courier id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [existing] = await db
      .select({ id: couriers.id, status: couriers.status })
      .from(couriers)
      .where(eq(couriers.id, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "not_found", message: "Courier not found" }, { status: 404 });
    }

    await db
      .update(couriers)
      .set({ status: body.status, updated_at: new Date() })
      .where(eq(couriers.id, id));

    logger.info("[admin/marketplace/couriers PATCH]", { courier_id: id, from: existing.status, to: body.status });

    return Response.json({ message: `Courier ${body.status}`, previous_status: existing.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/couriers PATCH] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
