// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { zones, zoneBudgets } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { getZonePnL } from "@/lib/zoneEconomics";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    await requireRole("admin")(request);

    const url = new URL(request.url);
    const zoneId = url.searchParams.get("zone_id");
    const period = url.searchParams.get("period") ?? "30d";

    const now = new Date();
    let periodStart: Date;
    if (period === "7d") {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "90d") {
      periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else {
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    if (zoneId) {
      const parsed = z.string().uuid().safeParse(zoneId);
      if (!parsed.success) {
        return Response.json({ error: "invalid_uuid", message: "Invalid zone_id" }, { status: 400 });
      }

      const pnl = await getZonePnL(zoneId, periodStart, now);
      if (!pnl) {
        return Response.json({ error: 'zone_not_found', message: 'Zone not found' }, { status: 404 });
      }

      const budgets = await db.select().from(zoneBudgets).where(eq(zoneBudgets.zone_id, zoneId));
      return Response.json({ zone_pnl: pnl, budgets });
    }

    const allZones = await db
      .select({ id: zones.id, name: zones.name, lifecycle_stage: zones.lifecycle_stage })
      .from(zones)
      .where(eq(zones.is_active, true));

    const zonePnLs = [];
    for (const zone of allZones) {
      const pnl = await getZonePnL(zone.id, periodStart, now);
      if (pnl) zonePnLs.push(pnl);
    }

    return Response.json({ zones: zonePnLs });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error("[admin/zone-pnl] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
