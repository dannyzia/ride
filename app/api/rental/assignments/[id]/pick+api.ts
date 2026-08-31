/**
 * POST /api/rental/assignments/[id]/pick
 * Fleet picks driver+vehicle for a non-tracking awarded request.
 * Sets confirmation_deadline_at = now()+60min (clock unfreeze).
 */
import { db } from "@/src/db";
import { awardedBidAssignments, rentalRequests, rentalRequestEvents, drivers, vehicles } from "@/src/db/schema";
import { requireFleetMember } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

const pickSchema = z.object({
  driver_user_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const assignRows = await db
      .select()
      .from(awardedBidAssignments)
      .where(eq(awardedBidAssignments.id, id))
      .limit(1);

    const assignment = assignRows[0];
    if (!assignment) {
      return Response.json(
        { error: "not_found", message: "Assignment not found" },
        { status: 404 },
      );
    }

    if (assignment.released_at) {
      return Response.json(
        { error: "assignment_released", message: "Assignment has been released" },
        { status: 409 },
      );
    }

    if (assignment.assigned_driver_user_id) {
      return Response.json(
        { error: "already_assigned", message: "Driver already assigned" },
        { status: 409 },
      );
    }

    await requireFleetMember(assignment.fleet_id, ["OWNER", "MANAGER", "DISPATCHER"])(
      request,
    );

    const result = await parseJsonBody(request, pickSchema);
    if (!result.ok) return result.response;

    // Validate driver is in fleet (status=active)
    const driverRows = await db
      .select()
      .from(drivers)
      .where(
        and(
          eq(drivers.user_id, result.data.driver_user_id),
          eq(drivers.fleet_id, assignment.fleet_id),
          eq(drivers.status, "active"),
        ),
      )
      .limit(1);

    if (!driverRows[0]) {
      return Response.json(
        { error: "driver_not_found", message: "Driver not found or not active in this fleet" },
        { status: 404 },
      );
    }

    // Validate vehicle is in fleet
    const vehicleRows = await db
      .select()
      .from(vehicles)
      .where(
        and(
          eq(vehicles.id, result.data.vehicle_id),
          eq(vehicles.fleet_id, assignment.fleet_id),
        ),
      )
      .limit(1);

    if (!vehicleRows[0]) {
      return Response.json(
        { error: "vehicle_not_found", message: "Vehicle not found in this fleet" },
        { status: 404 },
      );
    }

    // §B.7 cross-vertical exclusivity + F37: lock drivers row
    const [lockedDriver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverRows[0].id))
      .for("update");

    // Check no active rental assignment for this driver
    const activeAssignments = await db
      .select({ id: awardedBidAssignments.id })
      .from(awardedBidAssignments)
      .innerJoin(rentalRequests, eq(awardedBidAssignments.request_id, rentalRequests.id))
      .where(
        and(
          eq(awardedBidAssignments.assigned_driver_user_id, result.data.driver_user_id),
          eq(awardedBidAssignments.released_at, null as unknown as Date),
        ),
      )
      .limit(1);

    if (activeAssignments.length > 0 && activeAssignments[0].id !== id) {
      return Response.json(
        { error: "driver_already_committed", message: "Driver has an active commitment" },
        { status: 409 },
      );
    }

    // Fulfill assignment
    await db.transaction(async (tx) => {
      await tx
        .update(awardedBidAssignments)
        .set({
          assigned_driver_user_id: result.data.driver_user_id,
          assigned_vehicle_id: result.data.vehicle_id,
          assigned_by_user_id: result.data.driver_user_id,
          assigned_at: new Date(),
        })
        .where(eq(awardedBidAssignments.id, id));

      // Unfreeze confirmation clock (F4): now + 60 min
      await tx
        .update(rentalRequests)
        .set({
          confirmation_deadline_at: new Date(Date.now() + 60 * 60 * 1000),
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, assignment.request_id));

      await tx.insert(rentalRequestEvents).values({
        request_id: assignment.request_id,
        event_type: "driver_assigned",
        payload: {
          driver_user_id: result.data.driver_user_id,
          vehicle_id: result.data.vehicle_id,
        },
      });
    });

    return Response.json({ message: "Driver assigned" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    if (status === 409)
      return Response.json(
        { error: "invalid_transition", message: (err as Error).message },
        { status: 409 },
      );
    logger.error("[rental/pick POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
