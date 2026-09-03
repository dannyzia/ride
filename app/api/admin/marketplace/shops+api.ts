/**
 * GET  /api/admin/marketplace/shops          — list shops (search, status, owner filter)
 * PATCH /api/admin/marketplace/shops/[id]/status — suspend/restore shops
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { shops } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, like, desc, sql } from "drizzle-orm";

const listQuerySchema = z.object({
  search: z.string().max(150).optional(),
  status: z.enum(["active", "suspended", "closed"]).optional(),
  owner: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      search: url.searchParams.get("search"),
      status: url.searchParams.get("status"),
      owner: url.searchParams.get("owner"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Invalid query parameters" }, { status: 400 });
    }
    const { search, status, owner, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(sql`(${shops.name} ILIKE ${`%${search}%`} OR ${shops.slug} ILIKE ${`%${search}%`})`);
    }
    if (status) conditions.push(eq(shops.status, status));
    if (owner) conditions.push(eq(shops.owner_user_id, owner));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(shops)
      .where(where)
      .orderBy(desc(shops.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops)
      .where(where);

    return Response.json({
      shops: rows,
      total: countResult?.count ?? 0,
      page,
      limit,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/shops] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

const statusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid shop id" }, { status: 400 });
    }

    const result = await parseJsonBody(request, statusSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    const [existing] = await db
      .select({ id: shops.id, status: shops.status })
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);

    if (!existing) {
      return Response.json({ error: "not_found", message: "Shop not found" }, { status: 404 });
    }

    // Only allow active↔suspended; closed is terminal
    if (existing.status === "closed") {
      return Response.json({ error: "terminal_status", message: "Cannot change a closed shop's status" }, { status: 409 });
    }

    await db
      .update(shops)
      .set({ status: body.status, updated_at: new Date() })
      .where(eq(shops.id, id));

    logger.info("[admin/marketplace/shops] status change", { shop_id: id, from: existing.status, to: body.status });

    return Response.json({ message: `Shop ${body.status}`, previous_status: existing.status });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/shops PATCH] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
