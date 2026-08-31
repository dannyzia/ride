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
import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/src/db";
import {
  drivers,
  fleets,
  fleetVehicleAssignments,
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