/**
 * GET /api/fleet/dashboard?fleet_id=...
 *
 * Fleet dashboard overview — metrics, vehicle/driver counts, recent alerts.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 *
 * Expo route convention: fleet_id arrives as a query parameter (client sends
 * it from useFleetStore.activeFleetId). Cross-fleet tampering blocked by
 * requireFleetMember binding.
 */
import { db } from "@/src/db";
import {
  drivers,
  fleets,
  fleetAlerts,
  fleetMembers,
  fleetVehicleAssignments,
  vehicles,
  rides,
} from "@/src/db/schema";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    // Cross-fleet guard — binds this request to fleetId only.
    await requireFleetMember(fleetId)(request);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Parallel queries for dashboard metrics.
    const [fleetRow] = await db
      .select({
        id: fleets.id,
        name: fleets.name,
        fleet_type: fleets.fleet_type,
        status: fleets.status,
        owner_user_id: fleets.owner_user_id,
        created_at: fleets.created_at,
      })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!fleetRow) {
      return Response.json(
        { error: "fleet_not_found", message: "Fleet not found" },
        { status: 404 },
      );
    }

    const [vehicleCounts] = await db
      .select({
        total: count(),
      })
      .from(vehicles)
      .where(eq(vehicles.fleet_id, fleetId));

    const [driverCounts] = await db
      .select({
        total: count(),
      })
      .from(drivers)
      .where(eq(drivers.fleet_id, fleetId));

    const [onlineDriverCounts] = await db
      .select({
        online: count(),
      })
      .from(drivers)
      .where(and(eq(drivers.fleet_id, fleetId), eq(drivers.is_online, true)));

    const [assignedVehicleCounts] = await db
      .select({
        assigned: count(),
      })
      .from(fleetVehicleAssignments)
      .where(
        and(
          eq(fleetVehicleAssignments.fleet_id, fleetId),
          sql`unassigned_at IS NULL`,
        ),
      );

    // Today's trips for this fleet (via drivers → rides join).
    const todayTrips = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(rides)
      .innerJoin(drivers, eq(rides.driver_id, drivers.id))
      .where(
        and(
          eq(drivers.fleet_id, fleetId),
          gte(rides.created_at, todayStart),
        ),
      );

    // Unread alerts count.
    const [unreadAlerts] = await db
      .select({ count: count() })
      .from(fleetAlerts)
      .where(
        and(
          eq(fleetAlerts.fleet_id, fleetId),
          eq(fleetAlerts.is_read, false),
        ),
      );

    return Response.json(
      {
        fleet: fleetRow,
        vehicles: {
          total: vehicleCounts?.total ?? 0,
          assigned: assignedVehicleCounts?.assigned ?? 0,
        },
        drivers: {
          total: driverCounts?.total ?? 0,
          online: onlineDriverCounts?.online ?? 0,
        },
        today: {
          trips: todayTrips[0]?.count ?? 0,
        },
        unread_alerts: unreadAlerts?.count ?? 0,
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
    logger.error("[fleet/dashboard] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
