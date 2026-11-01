/**
 * POST /api/driver/fleet/leave
 *
 * Driver self-exit from their assigned fleet (ISSUE-36 / Plan 27 §4.4).
 * Enforces the dues gate (BD-1..3):
 *   - driver wallet debt < 0 blocks leaving
 *   - active trip in progress blocks leaving
 */
import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { removeDriverFromFleet, FleetExitError } from "@/lib/fleetAssignment";

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);

    if (!dbUser) {
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );
    }

    const [driver] = await db
      .select({
        id: drivers.id,
        fleet_id: drivers.fleet_id,
      })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);

    if (!driver) {
      return Response.json(
        { error: "driver_not_found", message: "Driver not found" },
        { status: 404 },
      );
    }

    if (!driver.fleet_id) {
      return Response.json(
        { error: "not_in_fleet", message: "Driver is not a member of any fleet" },
        { status: 400 },
      );
    }

    const fleetId = driver.fleet_id;

    const result = await db.transaction(async (tx) => {
      return removeDriverFromFleet(tx, {
        driver_id: driver.id,
        fleet_id: fleetId,
        actor_user_id: dbUser.id,
      });
    });

    return Response.json(
      { success: true, message: "Left fleet successfully", driver_id: result.driver_id },
      { status: 200 },
    );
  } catch (err: unknown) {
    if (err instanceof FleetExitError) {
      return Response.json(
        {
          error: err.code,
          message: err.message,
          details: err.details,
        },
        { status: 409 },
      );
    }

    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }

    logger.error("[driver/fleet/leave] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

