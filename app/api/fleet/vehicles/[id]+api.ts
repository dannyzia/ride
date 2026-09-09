/**
 * DELETE /api/fleet/vehicles/[id]?fleet_id=...  — Staff remove-vehicle (OWNER/MANAGER)
 *
 * ERROR-FIRST removal (plan §4.4 as re-scoped by R4, 2026-09-09; pulled
 * forward into Phase A by Zia direction):
 *   1. an ACTIVE assignment on the vehicle → 409 vehicle_in_use
 *      (staff reassigns via POST /api/fleet/assignments, which closes the
 *      prior active assignment in-tx);
 *   2. append-only assignment history (FK 23503 on delete) → 409
 *      vehicle_has_history — true delisting (end assignment + free the
 *      slot + retain the row) ships with the fleet exit/dues-gate flow
 *      (ISSUE-36), not here.
 *
 * No fleet-status gate on removal (a SUSPENDED fleet's staff may wind down);
 * no limit check needed (removal cannot breach a limit). The advisory lock
 * is taken anyway so per-fleet add/remove flows serialize on one key.
 *
 * NOTE: deleting frees a limit slot only because the vehicle row leaves the
 * fleet entirely — the limit counts vehicles.fleet_id rows (lib semantics,
 * R4 evidence). A fleet at limit whose vehicles all have history stays
 * frozen until the ISSUE-36 exit flow exists.
 */
import { db } from "@/src/db";
import { fleets, fleetVehicleAssignments, vehicles } from "@/src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { takeFleetLimitLock } from "@/lib/fleetLimits";

const querySchema = z.object({ fleet_id: z.string().uuid() });

export async function DELETE(
  request: Request,
  { id }: { id: string },
) {
  try {
    // Path param: validate BEFORE any DB query (house convention: invalid_uuid).
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      return Response.json(
        { error: "invalid_uuid", message: "Valid vehicle id required" },
        { status: 400 },
      );
    }
    const vehicleId = idParsed.data;

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

    const auth = await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    await db.transaction(async (tx) => {
      // Serialize with concurrent add/remove flows on the same fleet key.
      await takeFleetLimitLock(tx, fleetId);

      // Existence + fleet membership (cross-fleet probing → 404, not 403).
      const [vehicle] = await tx
        .select({ id: vehicles.id, fleet_id: vehicles.fleet_id })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);
      if (!vehicle) {
        throw Object.assign(new Error("Vehicle not found"), {
          status: 404,
          errorCode: "vehicle_not_found",
        });
      }
      if (vehicle.fleet_id !== fleetId) {
        throw Object.assign(new Error("Vehicle does not belong to this fleet"), {
          status: 404,
          errorCode: "vehicle_not_in_fleet",
        });
      }

      // ERROR-FIRST: block on any active assignment (append-only history
      // rows are fine — the FK only blocks the delete, not the read).
      const [active] = await tx
        .select({ id: fleetVehicleAssignments.id })
        .from(fleetVehicleAssignments)
        .where(
          and(
            eq(fleetVehicleAssignments.vehicle_id, vehicleId),
            isNull(fleetVehicleAssignments.unassigned_at),
          ),
        )
        .limit(1);
      if (active) {
        throw Object.assign(
          new Error(
            "Vehicle has an active assignment — reassign it via POST /api/fleet/assignments or end the assignment first",
          ),
          { status: 409, errorCode: "vehicle_in_use" },
        );
      }

      // 23503 from append-only history (fleet_vehicle_assignments.vehicle_id
      // NOT NULL, NO ACTION) is mapped to 409 vehicle_has_history in the
      // outer catch — the tx aborts with nothing written.
      await tx.delete(vehicles).where(eq(vehicles.id, vehicleId));

      logger.info("[fleet/vehicles] vehicle deleted", {
        fleet_id: fleetId,
        vehicle_id: vehicleId,
        actor_user_id: auth.dbUser.id,
      });
    });

    return Response.json({ success: true, vehicle_id: vehicleId }, { status: 200 });
  } catch (err: unknown) {
    // Append-only assignment history blocks the hard delete (FK NO ACTION).
    if (errors.getErrorCode(err) === "23503") {
      return Response.json(
        {
          error: "vehicle_has_history",
          message:
            "Vehicle has assignment history and cannot be deleted; delisting ships with the fleet exit flow (ISSUE-36)",
        },
        { status: 409 },
      );
    }
    // Auth errors arrive as bare { status: 401/403 } from lib/auth.
    const status = errors.getErrorStatus(err);
    if (status !== undefined) {
      const routeCode = (err as { errorCode?: string }).errorCode;
      const code =
        routeCode ?? (status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error");
      return Response.json(
        { error: code, message: errors.getErrorMessage(err) },
        { status },
      );
    }
    logger.error("[fleet/vehicles/[id]] DELETE error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
