/**
 * Admin Fleet Billing History.
 *
 * GET /api/admin/fleet-billing?fleet_id=...&page=1&limit=20
 *
 * Lists fleet_billing_transactions, optionally filtered by fleet_id.
 * Auth: requireAdminPermission('admin.read').
 * Money fields: integer paisa (BDT).
 */
import { db } from "@/src/db";
import { fleetBillingTransactions, fleets } from "@/src/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({
  fleet_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    await requireAdminPermission("admin.read")(request);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Invalid query parameters" },
        { status: 400 },
      );
    }
    const { fleet_id, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (fleet_id) {
      conditions.push(eq(fleetBillingTransactions.fleet_id, fleet_id));
    }

    const where =
      conditions.length > 0
        ? (await import("drizzle-orm")).and(...conditions)
        : undefined;

    const rows = await db
      .select({
        id: fleetBillingTransactions.id,
        fleet_id: fleetBillingTransactions.fleet_id,
        subscription_id: fleetBillingTransactions.subscription_id,
        transaction_type: fleetBillingTransactions.transaction_type,
        amount_bdt: fleetBillingTransactions.amount_bdt,
        currency: fleetBillingTransactions.currency,
        status: fleetBillingTransactions.status,
        created_at: fleetBillingTransactions.created_at,
      })
      .from(fleetBillingTransactions)
      .where(where)
      .orderBy(desc(fleetBillingTransactions.created_at))
      .limit(limit)
      .offset(offset);

    // Enrich with fleet names.
    const fleetIds = [...new Set(rows.map((r) => r.fleet_id))];
    let fleetNames: { id: string; name: string }[] = [];
    if (fleetIds.length > 0) {
      fleetNames = await db
        .select({ id: fleets.id, name: fleets.name })
        .from(fleets)
        .where(sql`${fleets.id} IN ${fleetIds}`);
    }
    const nameMap = new Map(fleetNames.map((f) => [f.id, f.name]));

    const enriched = rows.map((r) => ({
      ...r,
      fleet_name: nameMap.get(r.fleet_id) ?? "Unknown",
    }));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetBillingTransactions)
      .where(where);

    return Response.json(
      {
        transactions: enriched,
        total: countResult?.count ?? 0,
        page,
        limit,
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    if (status === 403) {
      return Response.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleet-billing] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
