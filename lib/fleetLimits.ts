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
 *
 * Phase A (fleet add-flows epic, ISSUE-35): both check functions accept an
 * optional `opts.tx` handle. When provided, the reads run on the caller's
 * transaction — the count read shares the tx's snapshot with the subsequent
 * insert (closing the count-then-insert TOCTOU family, Bug Survey consensus
 * theme 7). Semantics are UNCHANGED (I-4): NULL limit = unlimited, no active
 * subscription = no enforcement, DB error = fail-open. Signature is
 * backward-compatible — every existing caller/tests pass without changes.
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
import type { FleetTx } from "@/lib/fleetAssignment";

export interface LimitCheckResult {
  ok: boolean;
  error?: string;
  message?: string;
  current?: number;
  limit?: number;
}

export interface LimitCheckOptions {
  /** Transaction handle — when set, all reads run on it (same snapshot as the caller's writes). */
  tx?: FleetTx;
}

/**
 * Advisory lock key for per-fleet add/remove flows. Take it with
 * `pg_advisory_xact_lock` INSIDE the mutation transaction, BEFORE the limit
 * check, so concurrent add-flows for the same fleet serialize and the
 * in-tx count read cannot interleave with another flow's insert.
 */
export function fleetLimitLockKey(fleetId: string): string {
  return `fleet_limit:${fleetId}`;
}

/**
 * Convenience: take the per-fleet advisory xact lock on a tx.
 * Call as the FIRST statement of the mutation transaction.
 */
export async function takeFleetLimitLock(tx: FleetTx, fleetId: string): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${fleetLimitLockKey(fleetId)}))`,
  );
}

/**
 * Check whether adding one more vehicle to the fleet would exceed the plan's
 * vehicle_limit. Returns ok=true if within limit or if no limit applies.
 */
export async function checkVehicleLimit(
  fleetId: string,
  opts?: LimitCheckOptions,
): Promise<LimitCheckResult> {
  return checkLimit(fleetId, "vehicle", opts);
}

/**
 * Check whether adding one more driver to the fleet would exceed the plan's
 * driver_limit. Returns ok=true if within limit or if no limit applies.
 */
export async function checkDriverLimit(
  fleetId: string,
  opts?: LimitCheckOptions,
): Promise<LimitCheckResult> {
  return checkLimit(fleetId, "driver", opts);
}

async function checkLimit(
  fleetId: string,
  type: "vehicle" | "driver",
  opts?: LimitCheckOptions,
): Promise<LimitCheckResult> {
  // Reads run on the caller's tx when provided (same snapshot as the
  // subsequent insert); fall back to the global db for standalone checks.
  const conn = opts?.tx ?? db;
  try {
    // Get the fleet's subscription plan.
    const [fleet] = await conn
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
    const [plan] = await conn
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
    const [{ count }] = await conn
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
