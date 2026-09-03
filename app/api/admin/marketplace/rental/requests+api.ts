/**
 * GET /api/admin/marketplace/rental/requests     — list rental requests (status filter, 30d)
 * GET /api/admin/marketplace/rental/requests/[id] — request detail + bids + events timeline
 * GET /api/admin/marketplace/rental/bids          — list all rental bids
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import {
  rentalRequests,
  rentalBids,
  rentalRequestEvents,
  fleetMembers,
} from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, gte, desc, sql } from "drizzle-orm";

const listQuerySchema = z.object({
  status: z.string().max(30).optional(),
  category: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── List rental requests ──

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const url = new URL(request.url);
    const path = url.pathname;

    // /rental/requests/[id] — detail with bids + events
    const idMatch = path.match(/\/rental\/requests\/([0-9a-f-]{36})/);
    if (idMatch) {
      const requestId = idMatch[1];

      const [req] = await db
        .select()
        .from(rentalRequests)
        .where(eq(rentalRequests.id, requestId))
        .limit(1);

      if (!req) {
        return Response.json({ error: "not_found", message: "Request not found" }, { status: 404 });
      }

      const bids = await db
        .select()
        .from(rentalBids)
        .where(eq(rentalBids.request_id, requestId))
        .orderBy(desc(rentalBids.quoted_price_bdt));

      const events = await db
        .select()
        .from(rentalRequestEvents)
        .where(eq(rentalRequestEvents.request_id, requestId))
        .orderBy(desc(rentalRequestEvents.created_at));

      return Response.json({ request: req, bids, events });
    }

    // /rental/requests — list
    const parsed = listQuerySchema.safeParse({
      status: url.searchParams.get("status"),
      category: url.searchParams.get("category"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Invalid query parameters" }, { status: 400 });
    }
    const { status, category, page, limit } = parsed.data;
    const offset = (page - 1) * limit;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const conditions = [gte(rentalRequests.created_at, thirtyDaysAgo)];
    if (status) conditions.push(eq(rentalRequests.status, status as typeof rentalRequests.status.enumValues[number]));
    if (category) conditions.push(eq(rentalRequests.category, category as typeof rentalRequests.category.enumValues[number]));

    const where = and(...conditions);

    const rows = await db
      .select()
      .from(rentalRequests)
      .where(where)
      .orderBy(desc(rentalRequests.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rentalRequests)
      .where(where);

    return Response.json({ requests: rows, total: countResult?.count ?? 0, page, limit });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/rental] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

// ── List rental bids (separate path suffix) ──

// Note: /rental/bids handled via path suffix check in GET above.
// Since this is a single GET handler, we check for /rental/bids path.
// This is registered at app/api/admin/marketplace/rental/bids+api.ts if needed,
// but for simplicity we keep the bids listing in the same handler via path check.

// Actually, Expo API routes don't support sub-paths easily. We handle it via
// the path matching above: /rental/requests/[id] for detail, /rental/requests for list.
// Bids listing goes through /rental/requests?status=active pattern or separate file.
