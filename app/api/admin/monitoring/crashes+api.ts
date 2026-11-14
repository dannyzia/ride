/**
 * GET /api/admin/monitoring/crashes — recent client crash reports (read-only).
 *
 * Auth: requireAdminPermission('admin.read'). Returns the newest rows first,
 * capped at 100 (default 50).
 */
import { desc } from "drizzle-orm";
import { db } from "@/src/db";
import { clientCrashReports } from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    await requireAdminPermission("admin.read")(request);

    const url = new URL(request.url);
    const rawLimit = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.floor(rawLimit), 1), 100)
      : 50;

    const rows = await db
      .select()
      .from(clientCrashReports)
      .orderBy(desc(clientCrashReports.createdAt))
      .limit(limit);

    return Response.json({ crashes: rows, total: rows.length });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Access denied" },
        { status: 403 },
      );
    logger.error("[admin/monitoring/crashes] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
