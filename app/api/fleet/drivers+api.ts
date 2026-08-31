/**
 * GET /api/fleet/drivers?fleet_id=...
 *
 * List all drivers belonging to a fleet, with their current vehicle and status.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import { drivers, users, vehicles } from "@/src/db/schema";
import { asc, eq } from "drizzle-orm";
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

    await requireFleetMember(fleetId)(request);

    const rows = await db
      .select({
        id: drivers.id,
        user_id: drivers.user_id,
        vehicle_type: drivers.vehicle_type,
        vehicle_id: drivers.vehicle_id,
        status: drivers.status,
        rating: drivers.rating,
        completed_rides_count: drivers.completed_rides_count,
        is_online: drivers.is_online,
        created_at: drivers.created_at,
        name: users.name,
        phone: users.phone,
        vehicle_reg: vehicles.registration_number,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.user_id, users.id))
      .leftJoin(vehicles, eq(drivers.vehicle_id, vehicles.id))
      .where(eq(drivers.fleet_id, fleetId))
      .orderBy(asc(drivers.created_at));

    return Response.json({ drivers: rows }, { status: 200 });
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
    logger.error("[fleet/drivers] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
