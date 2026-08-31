/**
 * POST  /api/fleet/assignments?fleet_id=...  — Assign a driver to a vehicle
 * PATCH /api/fleet/assignments?fleet_id=...  — Unassign (end active assignment)
 *
 * Both operations go through lib/fleetAssignment.ts (single transaction),
 * which syncs the denormalized caches (drivers.vehicle_id, vehicles.driver_id).
 * Gated to OWNER / MANAGER via requireFleetMember.
 */
import { db } from "@/src/db";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import {
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

/** POST — assign driver to vehicle (OWNER/MANAGER only). */
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

    // Only OWNER or MANAGER can assign.
    const { fleetMember } = await requireFleetMember(fleetId, [
      "OWNER",
      "MANAGER",
    ])(request);

    const body = await parseJsonBody(request, assignSchema);
    if (!body.ok) return body.response;

    const result = await db.transaction(async (tx) => {
      return assignVehicleToDriver(tx, {
        fleet_id: fleetId,
        vehicle_id: body.data.vehicle_id,
        driver_id: body.data.driver_id,
        assigned_by: fleetMember.id,
        reason: body.data.reason ?? null,
      });
    });

    logger.info("[fleet/assignments] assigned", {
      fleet_id: fleetId,
      assignment_id: result.assignment_id,
      by: fleetMember.id,
    });

    return Response.json(
      { assignment_id: result.assignment_id, success: true },
      { status: 201 },
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
    // FleetAssignmentError from lib/fleetAssignment.ts
    if (err && typeof err === "object" && "code" in err) {
      const fleetErr = err as { code: string; message: string };
      return Response.json(
        { error: fleetErr.code, message: fleetErr.message },
        { status: 422 },
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
    logger.error("[fleet/assignments] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
