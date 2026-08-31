/**
 * GET /api/fleet/limits?fleet_id=...
 *
 * Returns the fleet's current plan limits and usage counts.
 * Used by the client to show usage meters and block adds when at limit.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import {
  fleets,
  fleetSubscriptionPlans,
  vehicles,
  drivers,
} from "@/src/db/schema";
import { and, eq, sql, isNull } from "drizzle-orm";
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

    // Get fleet subscription info.
    const [fleet] = await db
      .select({
        subscription_plan_id: fleets.subscription_plan_id,
        subscription_status: fleets.subscription_status,
      })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!fleet) {
      return Response.json(
        { error: "fleet_not_found", message: "Fleet not found" },
        { status: 404 },
      );
    }

    // Get plan details if subscribed.
    let planName: string | null = null;
    let vehicleLimit: number | null = null;
    let driverLimit: number | null = null;
    let apiLimit: number | null = null;

    if (fleet.subscription_plan_id) {
      const [plan] = await db
        .select()
        .from(fleetSubscriptionPlans)
        .where(eq(fleetSubscriptionPlans.id, fleet.subscription_plan_id))
        .limit(1);
      if (plan) {
        planName = plan.name;
        vehicleLimit = plan.vehicle_limit;
        driverLimit = plan.driver_limit;
        apiLimit = plan.api_limit;
      }
    }

    // Count current usage.
    const [{ count: vehicleCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.fleet_id, fleetId));

    const [{ count: driverCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .where(eq(drivers.fleet_id, fleetId));

    return Response.json(
      {
        plan_name: planName,
        subscription_status: fleet.subscription_status,
        vehicles: {
          used: vehicleCount,
          limit: vehicleLimit,
          at_limit: vehicleLimit != null && vehicleCount >= vehicleLimit,
        },
        drivers: {
          used: driverCount,
          limit: driverLimit,
          at_limit: driverLimit != null && driverCount >= driverLimit,
        },
        api: {
          limit: apiLimit,
        },
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
    logger.error("[fleet/limits] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
