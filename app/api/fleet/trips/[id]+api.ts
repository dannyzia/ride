/**
 * GET /api/fleet/trips/[id]?fleet_id=...
 *
 * Single trip detail — verifies the trip belongs to the fleet (via driver_id →
 * drivers.fleet_id) before returning. Full fare breakdown included.
 *
 * Expo route convention: dynamic param `id` arrives DIRECTLY as the second
 * argument, NOT wrapped in `{ params }`.
 */
import { db } from "@/src/db";
import { drivers, rides, users } from "@/src/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const idSchema = z.string().uuid();
const fleetIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  { id }: { id: string },
) {
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid trip id" },
        { status: 400 },
      );
    }
    const tripId = parsedId.data;

    const url = new URL(request.url);
    const parsedFleet = fleetIdSchema.safeParse(
      url.searchParams.get("fleet_id"),
    );
    if (!parsedFleet.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsedFleet.data;

    await requireFleetMember(fleetId)(request);

    // Verify the trip belongs to this fleet (defense in depth).
    const fleetDriverIds = db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.fleet_id, fleetId));

    const [trip] = await db
      .select({
        id: rides.id,
        user_id: rides.user_id,
        driver_id: rides.driver_id,
        vehicle_type: rides.vehicle_type,
        status: rides.status,
        origin_address: rides.origin_address,
        destination_address: rides.destination_address,
        origin_latitude: rides.origin_latitude,
        origin_longitude: rides.origin_longitude,
        destination_latitude: rides.destination_latitude,
        destination_longitude: rides.destination_longitude,
        distance_km: rides.distance_km,
        rider_payable_bdt: rides.rider_payable_bdt,
        driver_fare_bdt: rides.driver_fare_bdt,
        platform_commission_bdt: rides.platform_commission_bdt,
        tip_bdt: rides.tip_bdt,
        wait_fee_bdt: rides.wait_fee_bdt,
        cancellation_fee_bdt: rides.cancellation_fee_bdt,
        promo_code: rides.promo_code,
        promo_discount_bdt: rides.promo_discount_bdt,
        created_at: rides.created_at,
        completed_at: rides.completed_at,
        started_at: rides.started_at,
        matched_at: rides.matched_at,
        arrived_at: rides.arrived_at,
        rider_name: users.name,
      })
      .from(rides)
      .leftJoin(users, eq(rides.user_id, users.id))
      .where(
        and(
          eq(rides.id, tripId),
          sql`${rides.driver_id} in (select id from ${fleetDriverIds})`,
        ),
      )
      .limit(1);

    if (!trip) {
      return Response.json(
        { error: "trip_not_found", message: "Trip not found" },
        { status: 404 },
      );
    }

    // Get driver name.
    let driverName: string | null = null;
    if (trip.driver_id) {
      const [driverUser] = await db
        .select({ name: users.name })
        .from(drivers)
        .innerJoin(users, eq(drivers.user_id, users.id))
        .where(eq(drivers.id, trip.driver_id))
        .limit(1);
      driverName = driverUser?.name ?? null;
    }

    return Response.json(
      { trip: { ...trip, driver_name: driverName } },
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
    logger.error("[fleet/trips/[id]] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
