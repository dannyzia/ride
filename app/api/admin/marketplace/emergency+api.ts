/**
 * GET /api/admin/marketplace/emergency — list emergency requests
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import { emergencyRequests } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { desc, sql, eq } from "drizzle-orm";

const querySchema = z.object({
  status: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: url.searchParams.get("status"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Invalid query parameters" }, { status: 400 });
    }
    const { status, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const where = status ? eq(emergencyRequests.status, status as typeof emergencyRequests.status.enumValues[number]) : undefined;

    const rows = await db.select().from(emergencyRequests).where(where).orderBy(desc(emergencyRequests.created_at)).limit(limit).offset(offset);
    const [countResult] = await db.select({ count: sql<number>`count(*)::int` }).from(emergencyRequests).where(where);

    return Response.json({ requests: rows, total: countResult?.count ?? 0, page, limit });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/emergency] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
