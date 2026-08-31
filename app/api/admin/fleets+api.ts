/**
 * GET  /api/admin/fleets                    — List all fleets with search/filter
 * POST /api/admin/fleets                    — Create a fleet (admin-initiated)
 *
 * Auth: requireAdminPermission('admin.read') for GET, 'catalog.write' for POST.
 * Admins can view all fleets; only owner/admin can create/suspend.
 */
import { db } from "@/src/db";
import { fleets, drivers, fleetMembers, vehicles } from "@/src/db/schema";
import { eq, desc, like, and, sql, count } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";
import { z } from "zod";

const listQuerySchema = z.object({
  search: z.string().max(150).optional(),
  status: z.string().max(20).optional(),
  fleet_type: z.enum(["NATIVE", "EXTERNAL", "HYBRID"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  owner_user_id: z.string().uuid(),
  name: z.string().min(2).max(150),
  fleet_type: z.enum(["NATIVE", "EXTERNAL", "HYBRID"]).default("NATIVE"),
  business_name: z.string().max(150).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(150).nullable().optional(),
});

/** GET — list all fleets with stats. */
export async function GET(request: Request) {
  try {
    await requireAdminPermission("admin.read")(request);

    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      search: url.searchParams.get("search"),
      status: url.searchParams.get("status"),
      fleet_type: url.searchParams.get("fleet_type"),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Invalid query parameters" },
        { status: 400 },
      );
    }
    const { search, status, fleet_type, page, limit } = parsed.data;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      conditions.push(
        sql`(${fleets.name} ILIKE ${`%${search}%`} OR ${fleets.business_name} ILIKE ${`%${search}%`})`,
      );
    }
    if (status) conditions.push(eq(fleets.status, status as "ACTIVE" | "PENDING" | "SUSPENDED" | "BLOCKED" | "CLOSED"));
    if (fleet_type) conditions.push(eq(fleets.fleet_type, fleet_type));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: fleets.id,
        name: fleets.name,
        fleet_type: fleets.fleet_type,
        status: fleets.status,
        owner_user_id: fleets.owner_user_id,
        business_name: fleets.business_name,
        phone: fleets.phone,
        email: fleets.email,
        subscription_status: fleets.subscription_status,
        created_at: fleets.created_at,
      })
      .from(fleets)
      .where(where)
      .orderBy(desc(fleets.created_at))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleets)
      .where(where);

    // Get vehicle/driver counts per fleet (top 100 fleets only for performance).
    const fleetIds = rows.map((r) => r.id);
    let vehicleCounts: { fleet_id: string; count: number }[] = [];
    let driverCounts: { fleet_id: string; count: number }[] = [];
    let memberCounts: { fleet_id: string; count: number }[] = [];

    if (fleetIds.length > 0) {
      [vehicleCounts, driverCounts, memberCounts] = await Promise.all([
        db
          .select({
            fleet_id: vehicles.fleet_id,
            count: sql<number>`count(*)::int`,
          })
          .from(vehicles)
          .where(sql`${vehicles.fleet_id} IN ${fleetIds}`)
          .groupBy(vehicles.fleet_id),
        db
          .select({
            fleet_id: drivers.fleet_id,
            count: sql<number>`count(*)::int`,
          })
          .from(drivers)
          .where(sql`${drivers.fleet_id} IN ${fleetIds}`)
          .groupBy(drivers.fleet_id),
        db
          .select({
            fleet_id: fleetMembers.fleet_id,
            count: sql<number>`count(*)::int`,
          })
          .from(fleetMembers)
          .where(sql`${fleetMembers.fleet_id} IN ${fleetIds}`)
          .groupBy(fleetMembers.fleet_id),
      ]);
    }

    const vehicleMap = new Map(vehicleCounts.map((r) => [r.fleet_id, r.count]));
    const driverMap = new Map(driverCounts.map((r) => [r.fleet_id, r.count]));
    const memberMap = new Map(memberCounts.map((r) => [r.fleet_id, r.count]));

    const enriched = rows.map((row) => ({
      ...row,
      vehicle_count: vehicleMap.get(row.id) ?? 0,
      driver_count: driverMap.get(row.id) ?? 0,
      member_count: memberMap.get(row.id) ?? 0,
    }));

    return Response.json(
      { fleets: enriched, total: countResult?.count ?? 0, page, limit },
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
    logger.error("[admin/fleets] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** POST — admin-initiated fleet creation. */
export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission("catalog.write")(request);

    const parsed = await parseJsonBody(request, createSchema);
    if (!parsed.ok) return parsed.response;
    const data = parsed.data;

    const [fleet] = await db
      .insert(fleets)
      .values({
        owner_user_id: data.owner_user_id,
        name: data.name,
        fleet_type: data.fleet_type,
        status: "ACTIVE",
        business_name: data.business_name ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
      })
      .returning({ id: fleets.id, name: fleets.name });

    logger.info("[admin/fleets] created", {
      fleet_id: fleet.id,
      by: dbUser.id,
    });

    return Response.json({ fleet }, { status: 201 });
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
        { error: "forbidden", message: "Admin write access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleets] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
