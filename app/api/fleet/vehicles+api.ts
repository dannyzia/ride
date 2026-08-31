/**
 * GET /api/fleet/vehicles?fleet_id=...
 *
 * List all vehicles belonging to a fleet, with optional driver info.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import {
  drivers,
  users,
  vehicles,
} from "@/src/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({ fleet_id: z.string().uuid() });

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
        id: vehicles.id,
        vehicle_type: vehicles.vehicle_type,
        manufacturer: vehicles.manufacturer,
        model: vehicles.model,
        manufacturing_year: vehicles.manufacturing_year,
        registration_number: vehicles.registration_number,
        passenger_seats: vehicles.passenger_seats,
        has_ac: vehicles.has_ac,
        created_at: vehicles.created_at,
        driver_id: vehicles.driver_id,
        driver_name: users.name,
        driver_phone: users.phone,
        is_online: drivers.is_online,
        driver_rating: drivers.rating,
      })
      .from(vehicles)
      .leftJoin(users, eq(vehicles.driver_id, users.id))
      .leftJoin(drivers, eq(vehicles.driver_id, drivers.id))
      .where(eq(vehicles.fleet_id, fleetId))
      .orderBy(asc(vehicles.created_at));

    return Response.json({ vehicles: rows }, { status: 200 });
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
    logger.error("[fleet/vehicles] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
