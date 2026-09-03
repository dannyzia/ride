/**
 * GET /api/admin/marketplace/overview — vertical counts (requests/bids/orders/deliveries/emergencies
 * by status, 30d) + per-fleet SLA-fault counters (driver_pick_sla_timeout events).
 *
 * Auth: requireAdminPermission('marketplace.write').
 */
import { db } from "@/src/db";
import {
  rentalRequests,
  rentalBids,
  rentalRequestEvents,
  shopOrders,
  deliveryRequests,
  deliveryLegs,
  fleets,
} from "@/src/db/schema";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, gte, sql, desc } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    await requireAdminPermission("marketplace.write")(request);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // ── Rental requests by status (30d) ──
    const rentalByStatus = await db
      .select({
        status: rentalRequests.status,
        count: sql<number>`count(*)::int`,
      })
      .from(rentalRequests)
      .where(gte(rentalRequests.created_at, thirtyDaysAgo))
      .groupBy(rentalRequests.status);

    // ── Rental bids by status (30d) ──
    const rentalBidsByStatus = await db
      .select({
        status: rentalBids.status,
        count: sql<number>`count(*)::int`,
      })
      .from(rentalBids)
      .where(gte(rentalBids.submitted_at, thirtyDaysAgo))
      .groupBy(rentalBids.status);

    // ── Shop orders by status (30d) ──
    const shopOrdersByStatus = await db
      .select({
        status: shopOrders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(shopOrders)
      .where(gte(shopOrders.created_at, thirtyDaysAgo))
      .groupBy(shopOrders.status);

    // ── Delivery requests by status (30d) ──
    const deliveryByStatus = await db
      .select({
        status: deliveryRequests.status,
        count: sql<number>`count(*)::int`,
      })
      .from(deliveryRequests)
      .where(gte(deliveryRequests.created_at, thirtyDaysAgo))
      .groupBy(deliveryRequests.status);

    // ── Delivery legs by status (30d) ──
    const deliveryLegsByStatus = await db
      .select({
        status: deliveryLegs.leg_state,
        count: sql<number>`count(*)::int`,
      })
      .from(deliveryLegs)
      .where(gte(deliveryLegs.created_at, thirtyDaysAgo))
      .groupBy(deliveryLegs.leg_state);

    // ── SLA-fault counters per fleet (driver_pick_sla_timeout events) ──
    const slaFaults = await db
      .select({
        fleet_id: rentalRequestEvents.created_by,
        count: sql<number>`count(*)::int`,
      })
      .from(rentalRequestEvents)
      .where(
        and(
          eq(rentalRequestEvents.event_type, "driver_pick_sla_timeout"),
          gte(rentalRequestEvents.created_at, thirtyDaysAgo),
        ),
      )
      .groupBy(rentalRequestEvents.created_by)
      .orderBy(desc(sql`count(*)::int`));

    // Enrich SLA faults with fleet names
    const fleetIds = slaFaults
      .map((f) => f.fleet_id)
      .filter((id): id is string => id != null);

    let fleetMap = new Map<string, string>();
    if (fleetIds.length > 0) {
      const fleetRows = await db
        .select({ id: fleets.id, name: fleets.name })
        .from(fleets)
        .where(sql`${fleets.id} IN ${fleetIds}`);
      fleetMap = new Map(fleetRows.map((r) => [r.id, r.name]));
    }

    const slaFaultsWithNames = slaFaults.map((f) => ({
      fleet_id: f.fleet_id,
      fleet_name: f.fleet_id ? fleetMap.get(f.fleet_id) ?? "Unknown" : "Unknown",
      timeout_count: f.count,
    }));

    return Response.json({
      rental_requests: rentalByStatus,
      rental_bids: rentalBidsByStatus,
      shop_orders: shopOrdersByStatus,
      delivery_requests: deliveryByStatus,
      delivery_legs: deliveryLegsByStatus,
      sla_faults: slaFaultsWithNames,
      period_days: 30,
    });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (status === 403)
      return Response.json({ error: "forbidden", message: "Admin access required" }, { status: 403 });
    logger.error("[admin/marketplace/overview] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
