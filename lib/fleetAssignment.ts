/**
 * **Purpose:**     Sole transactional write path for fleet vehicle↔driver
 *                  assignments and the drivers/vehicles active-pointer cache.
 * **Owner:**       Coding model (Phase 1 — Fleet Management)
 * **Status:**      ACTIVE
 * **Source of truth:** fleet_vehicle_assignments (this lib keeps the
 *                  denormalized caches in sync — option (i) of
 *                  migration_plan.vehicles_driver_id_disposition)
 * **Related (concrete paths):**
 *   - src/db/schema.ts — fleets, fleetMembers, fleetVehicleAssignments,
 *     drivers.vehicle_id/vehicle_type (denormalized), vehicles.driver_id (cache)
 *   - scripts/fleet-backfill.ts — universal solo-fleet backfill (same pattern)
 *   - docs/FeatureList/New Feature Plan/Fleet Management/06-FLEET-MANAGEMENT-V5-by-Claude.xml — §migration_plan
 * **Last verified:** 2026-08-30, Phase 1 build (tsc/lint clean)
 * **How to update:** Any new assignment mutation MUST go through here —
 *                    never write drivers.vehicle_id/vehicles.driver_id directly.
 *
 * Active-pointer pattern (preserves the dispatch engine untouched):
 *   - `fleet_vehicle_assignments` is the authoritative history (append-only,
 *     one active row per vehicle AND per driver via partial unique indexes).
 *   - `drivers.vehicle_id` + `drivers.vehicle_type` mirror the driver's
 *     currently assigned vehicle. Dispatch filters on `drivers.vehicle_type`
 *     directly (utils-server/dispatch.ts L202) and is NEVER touched here.
 *   - `vehicles.driver_id` mirrors the vehicle's currently assigned driver
 *     (NULL = unassigned pool vehicle).
 * All cache writes happen inside the SAME transaction as the assignment row.
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/src/db";
import {
  drivers,
  fleets,
  fleetVehicleAssignments,
  auditLogs,
  fleetBillingTransactions,
  fleetMembers,
  rides,
  vehicles,
} from "@/src/db/schema";
import { logger } from "@/lib/logger";

/** Drizzle transaction handle type (postgres-js driver). */
export type FleetTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class FleetAssignmentError extends Error {
  constructor(
    public code:
      | "fleet_not_found"
      | "vehicle_not_in_fleet"
      | "driver_not_in_fleet"
      | "vehicle_not_found"
      | "driver_not_found",
    message: string,
  ) {
    super(message);
    this.name = "FleetAssignmentError";
  }
}

export class FleetExitError extends Error {
  constructor(
    public code:
      | "driver_has_unsettled_dues"
      | "active_trip_in_progress"
      | "fleet_has_overdue_billing"
      | "vehicle_not_in_fleet"
      | "driver_not_in_fleet"
      | "vehicle_not_found"
      | "driver_not_found",
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FleetExitError";
  }
}

/**
 * Assign a driver to a vehicle within their shared fleet (F08). Closes any
 * prior active assignment for BOTH the vehicle and the driver, inserts the
 * new assignment row, and syncs the denormalized caches — all in ONE
 * transaction. Also syncs drivers.vehicle_type from the vehicle's type so
 * the dispatch pool filter stays correct without any join.
 *
 * Throws FleetAssignmentError on any validation failure (Phase 2 routes map
 * codes to HTTP responses).
 */
export async function assignVehicleToDriver(
  tx: FleetTx,
  input: {
    fleet_id: string;
    vehicle_id: string;
    driver_id: string;
    assigned_by?: string | null;
    reason?: string | null;
  },
): Promise<{ assignment_id: string }> {
  const { fleet_id, vehicle_id, driver_id } = input;

  const [fleet] = await tx
    .select({ id: fleets.id })
    .from(fleets)
    .where(eq(fleets.id, fleet_id))
    .limit(1);
  if (!fleet) throw new FleetAssignmentError("fleet_not_found", "Fleet does not exist");

  const [vehicle] = await tx
    .select({
      id: vehicles.id,
      fleet_id: vehicles.fleet_id,
      vehicle_type: vehicles.vehicle_type,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicle_id))
    .limit(1);
  if (!vehicle) throw new FleetAssignmentError("vehicle_not_found", "Vehicle does not exist");
  if (vehicle.fleet_id !== fleet_id) {
    throw new FleetAssignmentError("vehicle_not_in_fleet", "Vehicle does not belong to this fleet");
  }

  const [driver] = await tx
    .select({ id: drivers.id, fleet_id: drivers.fleet_id })
    .from(drivers)
    .where(eq(drivers.id, driver_id))
    .limit(1);
  if (!driver) throw new FleetAssignmentError("driver_not_found", "Driver does not exist");
  if (driver.fleet_id !== fleet_id) {
    throw new FleetAssignmentError("driver_not_in_fleet", "Driver does not belong to this fleet");
  }

  const now = new Date();

  // Close prior active assignments (vehicle-side and driver-side).
  await tx
    .update(fleetVehicleAssignments)
    .set({ unassigned_at: now, status: "ended" })
    .where(
      and(
        eq(fleetVehicleAssignments.vehicle_id, vehicle_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    );
  await tx
    .update(fleetVehicleAssignments)
    .set({ unassigned_at: now, status: "ended" })
    .where(
      and(
        eq(fleetVehicleAssignments.driver_id, driver_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    );

  // Clear the cache on any OTHER vehicle the driver previously held.
  await tx
    .update(vehicles)
    .set({ driver_id: null, updated_at: now })
    .where(and(eq(vehicles.driver_id, driver_id), ne(vehicles.id, vehicle_id)));

  const [assignment] = await tx
    .insert(fleetVehicleAssignments)
    .values({
      fleet_id,
      vehicle_id,
      driver_id,
      assigned_by: input.assigned_by ?? null,
      reason: input.reason ?? null,
      status: "active",
    })
    .returning({ id: fleetVehicleAssignments.id });

  // Sync the active-pointer caches in the same transaction.
  await tx
    .update(vehicles)
    .set({ driver_id, updated_at: now })
    .where(eq(vehicles.id, vehicle_id));
  await tx
    .update(drivers)
    .set({ vehicle_id, vehicle_type: vehicle.vehicle_type, updated_at: now })
    .where(eq(drivers.id, driver_id));

  logger.info("[fleet] vehicle assigned to driver", {
    fleet_id,
    vehicle_id,
    driver_id,
    assignment_id: assignment.id,
  });
  return { assignment_id: assignment.id };
}

/**
 * Close a vehicle's active assignment and clear both cache pointers.
 * The vehicle stays in its fleet as an unassigned pool vehicle.
 */
export async function unassignVehicle(
  tx: FleetTx,
  input: { vehicle_id: string; reason?: string | null },
): Promise<void> {
  const now = new Date();
  const [active] = await tx
    .select({ driver_id: fleetVehicleAssignments.driver_id })
    .from(fleetVehicleAssignments)
    .where(
      and(
        eq(fleetVehicleAssignments.vehicle_id, input.vehicle_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    )
    .limit(1);

  await tx
    .update(fleetVehicleAssignments)
    .set({ unassigned_at: now, status: "ended", reason: input.reason ?? null })
    .where(
      and(
        eq(fleetVehicleAssignments.vehicle_id, input.vehicle_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    );

  await tx
    .update(vehicles)
    .set({ driver_id: null, updated_at: now })
    .where(eq(vehicles.id, input.vehicle_id));

  if (active) {
    await tx
      .update(drivers)
      .set({ vehicle_id: null, updated_at: now })
      .where(eq(drivers.id, active.driver_id));
  }

  logger.info("[fleet] vehicle unassigned", {
    vehicle_id: input.vehicle_id,
    driver_id: active?.driver_id ?? null,
  });
}

/**
 * Dues gate check for driver exit (BD-1..3):
 * 1. Wallet balance < 0 (unsettled debits) -> BLOCKED.
 * 2. Active ride in progress -> BLOCKED.
 */
export async function checkDriverExitDues(
  tx: FleetTx,
  driverId: string,
): Promise<{ blocked: boolean; reason?: string; details?: Record<string, unknown> }> {
  const [driver] = await tx
    .select({
      id: drivers.id,
      balance: drivers.driver_wallet_balance_bdt,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  if (!driver) {
    return { blocked: true, reason: "driver_not_found" };
  }

  // BD-1: Dues gate blocks exit entirely if wallet balance is negative.
  if (driver.balance < 0) {
    return {
      blocked: true,
      reason: "driver_has_unsettled_dues",
      details: { debt_bdt: Math.abs(driver.balance) },
    };
  }

  // In-flight lock: cannot leave while a ride is active.
  const activeRideStatuses = ["matched", "driver_arriving", "driver_arrived", "in_progress"] as const;
  const [activeRide] = await tx
    .select({ id: rides.id })
    .from(rides)
    .where(
      and(
        eq(rides.driver_id, driverId),
        inArray(rides.status, [...activeRideStatuses]),
      ),
    )
    .limit(1);

  if (activeRide) {
    return {
      blocked: true,
      reason: "active_trip_in_progress",
      details: { ride_id: activeRide.id },
    };
  }

  return { blocked: false };
}

/**
 * Dues gate check for vehicle delisting (BD-1..3):
 * 1. Active trip on vehicle's assigned driver -> BLOCKED.
 * 2. Overdue/pending fleet subscription transactions -> BLOCKED.
 */
export async function checkFleetVehicleExitDues(
  tx: FleetTx,
  vehicleId: string,
  fleetId: string,
): Promise<{ blocked: boolean; reason?: string; details?: Record<string, unknown> }> {
  const [vehicle] = await tx
    .select({
      id: vehicles.id,
      fleet_id: vehicles.fleet_id,
      driver_id: vehicles.driver_id,
    })
    .from(vehicles)
    .where(eq(vehicles.id, vehicleId))
    .limit(1);

  if (!vehicle) {
    return { blocked: true, reason: "vehicle_not_found" };
  }
  if (vehicle.fleet_id !== fleetId) {
    return { blocked: true, reason: "vehicle_not_in_fleet" };
  }

  // Check in-flight trip if vehicle currently has an assigned driver
  if (vehicle.driver_id) {
    const activeRideStatuses = ["matched", "driver_arriving", "driver_arrived", "in_progress"] as const;
    const [activeRide] = await tx
      .select({ id: rides.id })
      .from(rides)
      .where(
        and(
          eq(rides.driver_id, vehicle.driver_id),
          inArray(rides.status, [...activeRideStatuses]),
        ),
      )
      .limit(1);

    if (activeRide) {
      return {
        blocked: true,
        reason: "active_trip_in_progress",
        details: { ride_id: activeRide.id },
      };
    }
  }

  // BD-3: Fleet-owed dues (unsettled subscription transactions) block vehicle delisting
  const [overdueTx] = await tx
    .select({ id: fleetBillingTransactions.id, amount_bdt: fleetBillingTransactions.amount_bdt })
    .from(fleetBillingTransactions)
    .where(
      and(
        eq(fleetBillingTransactions.fleet_id, fleetId),
        inArray(fleetBillingTransactions.status, ["pending", "overdue"]),
      ),
    )
    .limit(1);

  if (overdueTx) {
    return {
      blocked: true,
      reason: "fleet_has_overdue_billing",
      details: { transaction_id: overdueTx.id, amount_bdt: overdueTx.amount_bdt },
    };
  }

  return { blocked: false };
}

/**
 * Delist a vehicle from a fleet (ISSUE-36 / Plan 27 §4.4).
 * Enforces the dues gate, closes any active assignment, clears vehicles.fleet_id/driver_id,
 * and clears drivers.vehicle_id if assigned.
 * BD-2: Platform admin can override the block; audited in audit_logs.
 */
/**
 * Ensure a solo NATIVE fleet exists for a user (universal fleet model).
 */
export async function getOrCreateSoloFleet(tx: FleetTx, userId: string): Promise<string> {
  const [existing] = await tx
    .select({ id: fleets.id })
    .from(fleets)
    .where(and(eq(fleets.owner_user_id, userId), eq(fleets.fleet_type, "NATIVE")))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [created] = await tx
    .insert(fleets)
    .values({
      owner_user_id: userId,
      name: "Solo Fleet",
      fleet_type: "NATIVE",
      status: "ACTIVE",
    })
    .returning({ id: fleets.id });

  return created.id;
}

export async function delistVehicleFromFleet(
  tx: FleetTx,
  input: {
    vehicle_id: string;
    fleet_id: string;
    actor_user_id: string;
    admin_override?: boolean;
    admin_override_reason?: string;
  },
): Promise<{ success: boolean; vehicle_id: string }> {
  const gate = await checkFleetVehicleExitDues(tx, input.vehicle_id, input.fleet_id);

  if (gate.blocked) {
    if (!input.admin_override) {
      throw new FleetExitError(
        gate.reason as any,
        `Vehicle delisting blocked: ${gate.reason}`,
        gate.details,
      );
    }

    // BD-2: Audited override
    await tx.insert(auditLogs).values({
      actor_user_id: input.actor_user_id,
      fleet_id: input.fleet_id,
      action: "fleet_vehicle_delist_override",
      entity_type: "vehicle",
      entity_id: input.vehicle_id,
      new_value: {
        reason: input.admin_override_reason ?? "admin_override",
        bypassed_gate: gate.reason,
        details: gate.details,
      },
    });
  }

  const now = new Date();

  // Close active assignment row
  const [active] = await tx
    .select({ driver_id: fleetVehicleAssignments.driver_id })
    .from(fleetVehicleAssignments)
    .where(
      and(
        eq(fleetVehicleAssignments.vehicle_id, input.vehicle_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    )
    .limit(1);

  await tx
    .update(fleetVehicleAssignments)
    .set({ unassigned_at: now, status: "ended", reason: "delisted_from_fleet" })
    .where(
      and(
        eq(fleetVehicleAssignments.vehicle_id, input.vehicle_id),
        isNull(fleetVehicleAssignments.unassigned_at),
      ),
    );

  const targetFleetId = await getOrCreateSoloFleet(tx, input.actor_user_id);

  // Clear denormalized caches and detach vehicle from fleet (reverts to actor solo fleet)
  await tx
    .update(vehicles)
    .set({ fleet_id: targetFleetId, driver_id: null, updated_at: now })
    .where(eq(vehicles.id, input.vehicle_id));

  if (active) {
    await tx
      .update(drivers)
      .set({ vehicle_id: null, updated_at: now })
      .where(eq(drivers.id, active.driver_id));
  }

  logger.info("[fleet] vehicle delisted from fleet", {
    fleet_id: input.fleet_id,
    vehicle_id: input.vehicle_id,
    actor_user_id: input.actor_user_id,
    admin_override: !!input.admin_override,
  });

  return { success: true, vehicle_id: input.vehicle_id };
}

/**
 * Remove a driver from a fleet or allow driver to leave (ISSUE-36 / Plan 27 §4.4).
 * Enforces the dues gate, detaches drivers.fleet_id, unassigns any held vehicle,
 * and marks fleetMembers.removed_at.
 * BD-2: Platform admin can override the block; audited in audit_logs.
 */
export async function removeDriverFromFleet(
  tx: FleetTx,
  input: {
    driver_id: string;
    fleet_id: string;
    actor_user_id: string;
    admin_override?: boolean;
    admin_override_reason?: string;
  },
): Promise<{ success: boolean; driver_id: string }> {
  const [driver] = await tx
    .select({
      id: drivers.id,
      user_id: drivers.user_id,
      fleet_id: drivers.fleet_id,
      vehicle_id: drivers.vehicle_id,
    })
    .from(drivers)
    .where(eq(drivers.id, input.driver_id))
    .limit(1);

  if (!driver) {
    throw new FleetExitError("driver_not_found", "Driver not found");
  }
  if (driver.fleet_id !== input.fleet_id) {
    throw new FleetExitError("driver_not_in_fleet", "Driver does not belong to this fleet");
  }

  const gate = await checkDriverExitDues(tx, input.driver_id);

  if (gate.blocked) {
    if (!input.admin_override) {
      throw new FleetExitError(
        gate.reason as any,
        `Driver exit blocked: ${gate.reason}`,
        gate.details,
      );
    }

    // BD-2: Audited override
    await tx.insert(auditLogs).values({
      actor_user_id: input.actor_user_id,
      fleet_id: input.fleet_id,
      action: "fleet_driver_exit_override",
      entity_type: "driver",
      entity_id: input.driver_id,
      new_value: {
        reason: input.admin_override_reason ?? "admin_override",
        bypassed_gate: gate.reason,
        details: gate.details,
      },
    });
  }

  const now = new Date();

  // If driver holds an active vehicle assignment, close it and clear vehicle cache
  if (driver.vehicle_id) {
    await tx
      .update(fleetVehicleAssignments)
      .set({ unassigned_at: now, status: "ended", reason: "driver_exited_fleet" })
      .where(
        and(
          eq(fleetVehicleAssignments.driver_id, input.driver_id),
          isNull(fleetVehicleAssignments.unassigned_at),
        ),
      );

    await tx
      .update(vehicles)
      .set({ driver_id: null, updated_at: now })
      .where(eq(vehicles.id, driver.vehicle_id));
  }

  const soloFleetId = await getOrCreateSoloFleet(tx, driver.user_id);

  // Clear driver's held vehicle and revert fleet pointer to solo fleet
  await tx
    .update(drivers)
    .set({ fleet_id: soloFleetId, vehicle_id: null, updated_at: now })
    .where(eq(drivers.id, input.driver_id));

  // Stamp fleet_members.removed_at
  await tx
    .update(fleetMembers)
    .set({ removed_at: now, status: "inactive", updated_at: now })
    .where(
      and(
        eq(fleetMembers.fleet_id, input.fleet_id),
        eq(fleetMembers.user_id, driver.user_id),
        isNull(fleetMembers.removed_at),
      ),
    );

  logger.info("[fleet] driver removed from fleet", {
    fleet_id: input.fleet_id,
    driver_id: input.driver_id,
    actor_user_id: input.actor_user_id,
    admin_override: !!input.admin_override,
  });

  return { success: true, driver_id: input.driver_id };
}
