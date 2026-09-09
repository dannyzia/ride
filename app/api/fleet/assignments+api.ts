/**
 * POST  /api/fleet/assignments?fleet_id=...  — Assign a driver to a vehicle
 * PATCH /api/fleet/assignments?fleet_id=...  — Unassign (end active assignment)
 *
 * Both operations go through lib/fleetAssignment.ts (single transaction),
 * which syncs the denormalized caches (drivers.vehicle_id, vehicles.driver_id).
 *
 * History: this route shipped in 54c8466 (universal fleet model phase) with
 * OWNER/MANAGER POST+PATCH. The fleet add-flows epic Phase A (f69c532)
 * briefly overwrote it — repaired in place by merging both handlers.
 * Deltas vs the pre-Phase-A route (disclosed in the plan ruling record):
 *   - POST roles widened to OWNER/MANAGER/DISPATCHER (plan §4.2).
 *   - assigned_by now carries the USERS id (schema FK
 *     fleet_vehicle_assignments.assigned_by → users.id); the prior code
 *     passed the fleet_members row id, which is not a users.id.
 *   - FleetAssignmentError maps to 404 (plan §9: existence/membership
 *     failures are not-found; the prior code returned 422).
 *   - No plan-limit check on either verb (plan §4.2: assignment moves
 *     existing fleet resources, adds none; checks live on the add endpoints).
 */
import { db } from "@/src/db";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import {
  FleetAssignmentError,
  assignVehicleToDriver,
  unassignVehicle,
} from "@/lib/fleetAssignment";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const assignSchema = z.object({
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
});

const unassignSchema = z.object({
  vehicle_id: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
});

/** POST — assign driver to vehicle (OWNER/MANAGER/DISPATCHER). */
export async function POST(request: Request) {
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

    const auth = await requireFleetMember(fleetId, [
      "OWNER",
      "MANAGER",
      "DISPATCHER",
    ])(request);

    const body = await parseJsonBody(request, assignSchema);
    if (!body.ok) return body.response;

    const result = await db.transaction(async (tx) => {
      return assignVehicleToDriver(tx, {
        fleet_id: fleetId,
        vehicle_id: body.data.vehicle_id,
        driver_id: body.data.driver_id,
        assigned_by: auth.dbUser.id,
        reason: body.data.reason ?? null,
      });
    });

    logger.info("[fleet/assignments] assigned", {
      fleet_id: fleetId,
      assignment_id: result.assignment_id,
      by: auth.dbUser.id,
    });

    return Response.json(
      { assignment_id: result.assignment_id, success: true },
      { status: 201 },
    );
  } catch (err: unknown) {
    // FleetAssignmentError → 404 (existence/membership failures inside the tx).
    if (err instanceof FleetAssignmentError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: 404 },
      );
    }
    // Auth errors arrive as bare { status: 401/403 } from lib/auth.
    const status = errors.getErrorStatus(err);
    if (status !== undefined) {
      const code =
        status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error";
      return Response.json(
        { error: code, message: errors.getErrorMessage(err) },
        { status },
      );
    }
    logger.error("[fleet/assignments] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** PATCH — unassign vehicle (end active assignment, OWNER/MANAGER only). */
export async function PATCH(request: Request) {
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

    await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    const body = await parseJsonBody(request, unassignSchema);
    if (!body.ok) return body.response;

    await db.transaction(async (tx) => {
      return unassignVehicle(tx, {
        vehicle_id: body.data.vehicle_id,
        reason: body.data.reason ?? null,
      });
    });

    logger.info("[fleet/assignments] unassigned", {
      fleet_id: fleetId,
      vehicle_id: body.data.vehicle_id,
    });

    return Response.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status !== undefined) {
      const code =
        status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error";
      return Response.json(
        { error: code, message: errors.getErrorMessage(err) },
        { status },
      );
    }
    logger.error("[fleet/assignments] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
