/**
 * GET /api/fleet/trips?fleet_id=...
 *
 * Fleet-scoped trip list — reads from rides table via drivers.fleet_id join.
 * Supports: status filter, date range, search, pagination.
 * Returns ride details with rider/driver names, fare, distance, timestamps.
 *
 * All money fields are integer paisa — divide by 100 at UI display.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import { drivers, rides, users } from "@/src/db/schema";
import { and, eq, gte, lte, sql, desc, like } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
  status: z
    .enum([
      "completed",
      "cancelled",
      "in_progress",
      "matched",
      "driver_arriving",
      "driver_arrived",
      "expired",
    ])
    .optional(),
  search: z.string().max(100).optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
      status: url.searchParams.get("status"),
      search: url.searchParams.get("search"),
      from_date: url.searchParams.get("from_date"),
      to_date: url.searchParams.get("to_date"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Invalid query parameters" },
        { status: 400 },
      );
    }
    const { fleet_id: fleetId, status, search, from_date, to_date, page, limit } =
      parsed.data;
    const offset = (page - 1) * limit;

    await requireFleetMember(fleetId)(request);

    // Subquery: driver IDs belonging to this fleet.
    const fleetDriverIds = db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.fleet_id, fleetId));

    const conditions = [
      sql`${rides.driver_id} in (select id from ${fleetDriverIds})`,
    ];

    if (status) conditions.push(eq(rides.status, status));
    if (from_date) conditions.push(gte(rides.created_at, new Date(from_date)));
    if (to_date) conditions.push(lte(rides.created_at, new Date(to_date)));
    if (search) {
      conditions.push(
        sql`(${rides.origin_address} ILIKE ${`%${search}%`} OR ${rides.destination_address} ILIKE ${`%${search}%`})`,
      );
    }

    const where = and(...conditions);

    const rows = await db
      .select({
        id: rides.id,
        user_id: rides.user_id,
        driver_id: rides.driver_id,
        vehicle_type: rides.vehicle_type,
        status: rides.status,
        origin_address: rides.origin_address,
        destination_address: rides.destination_address,
        distance_km: rides.distance_km,
        rider_payable_bdt: rides.rider_payable_bdt,
        driver_fare_bdt: rides.driver_fare_bdt,
        platform_commission_bdt: rides.platform_commission_bdt,
        tip_bdt: rides.tip_bdt,
        created_at: rides.created_at,
        completed_at: rides.completed_at,
        started_at: rides.started_at,
        rider_name: users.name,
      })
      .from(rides)
      .leftJoin(users, eq(rides.user_id, users.id))
      .where(where)
      .orderBy(desc(rides.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rides)
      .where(where);

    return Response.json(
      {
        trips: rows,
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
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleet/trips] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
