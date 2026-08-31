/**
 * Fleet plan-limit enforcement.
 *
 * Before adding a vehicle or driver to a fleet, check the fleet's current
 * subscription plan limits. Returns { ok: true } if within limits, or
 * { ok: false, error, message } if the limit would be exceeded.
 *
 * If the fleet has NO active subscription, limits are not enforced (open
 * access). If the plan field is NULL, that specific limit is not enforced.
 *
 * Money fields use integer paisa (BDT) throughout.
 */
import { db } from "@/src/db";
import {
  fleets,
  fleetSubscriptionPlans,
  vehicles,
  drivers,
} from "@/src/db/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";

export interface LimitCheckResult {
  ok: boolean;
  error?: string;
  message?: string;
  current?: number;
  limit?: number;
}

/**
 * Check whether adding one more vehicle to the fleet would exceed the plan's
 * vehicle_limit. Returns ok=true if within limit or if no limit applies.
 */
export async function checkVehicleLimit(
  fleetId: string,
): Promise<LimitCheckResult> {
  return checkLimit(fleetId, "vehicle");
}

/**
 * Check whether adding one more driver to the fleet would exceed the plan's
 * driver_limit. Returns ok=true if within limit or if no limit applies.
 */
export async function checkDriverLimit(
  fleetId: string,
): Promise<LimitCheckResult> {
  return checkLimit(fleetId, "driver");
}

async function checkLimit(
  fleetId: string,
  type: "vehicle" | "driver",
): Promise<LimitCheckResult> {
  try {
    // Get the fleet's subscription plan.
    const [fleet] = await db
      .select({
        subscription_plan_id: fleets.subscription_plan_id,
      })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!fleet) {
      return { ok: false, error: "fleet_not_found", message: "Fleet not found" };
    }

    // No subscription plan — no limit enforced.
    if (!fleet.subscription_plan_id) {
      return { ok: true };
    }

    // Get the plan limits.
    const [plan] = await db
      .select({
        vehicle_limit: fleetSubscriptionPlans.vehicle_limit,
        driver_limit: fleetSubscriptionPlans.driver_limit,
        name: fleetSubscriptionPlans.name,
      })
      .from(fleetSubscriptionPlans)
      .where(eq(fleetSubscriptionPlans.id, fleet.subscription_plan_id))
      .limit(1);

    if (!plan) {
      // Plan deleted — no limit enforced.
      return { ok: true };
    }

    const limitValue =
      type === "vehicle" ? plan.vehicle_limit : plan.driver_limit;

    // NULL limit = unlimited.
    if (limitValue == null) {
      return { ok: true };
    }

    // Count current usage.
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(type === "vehicle" ? vehicles : drivers)
      .where(
        eq(type === "vehicle" ? vehicles.fleet_id : drivers.fleet_id, fleetId),
      );

    if (count >= limitValue) {
      const label = type === "vehicle" ? "Vehicles" : "Drivers";
      return {
        ok: false,
        error: "plan_limit_exceeded",
        message: `${label} limit reached (${count}/${limitValue}) on the "${plan.name}" plan. Upgrade your plan to add more.`,
        current: count,
        limit: limitValue,
      };
    }

    return { ok: true, current: count, limit: limitValue };
  } catch (err) {
    logger.error(`[fleetLimits] ${type} check failed`, { fleetId, err });
    // On error, don't block the operation (fail open).
    return { ok: true };
  }
}
