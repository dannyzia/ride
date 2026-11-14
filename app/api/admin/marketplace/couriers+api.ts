/**
 * GET /api/admin/marketplace/couriers — list couriers (type filter, presence).
 *
 * PATCH status lives in marketplace/couriers/[id]/status+api.ts.
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { couriers, users } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
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
