/**
 * POST /api/rental/requests/[id]/fleet-ack
 * Fleet acknowledges a tracking-required booking within 5-min SLA (F45/ruling 7).
 * Only for tracking_required requests where fleet_ack_at IS NULL.
 */
import { db } from "@/src/db";
import { rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const reqRows = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, id))
      .limit(1);

    const req = reqRows[0];
    if (!req) {
      return Response.json(
        { error: "not_found", message: "Request not found" },
        { status: 404 },
      );
    }

    if (req.status !== "awarded" || !req.tracking_required || req.fleet_ack_at) {
      return Response.json(
        { error: "invalid_transition", message: "Fleet-ack only applies to tracking-required awarded requests without ack" },
        { status: 409 },
      );
    }

    // Get the assignment to find the fleet_id
    const assignRows = await db
      .select({ fleet_id: awardedBidAssignments.fleet_id })
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.request_id, id),
          eq(awardedBidAssignments.released_at, null as unknown as Date),
        ),
      )
      .limit(1);

    const assignment = assignRows[0];
    if (!assignment) {
      return Response.json(
        { error: "not_found", message: "No active assignment" },
        { status: 404 },
      );
    }

    await requireFleetMember(assignment.fleet_id, ["OWNER", "MANAGER", "DISPATCHER"])(
      request,
    );

    await db.transaction(async (tx) => {
      await tx
        .update(rentalRequests)
        .set({ fleet_ack_at: new Date(), updated_at: new Date() })
        .where(eq(rentalRequests.id, id));

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "fleet_acknowledged",
        payload: { fleet_id: assignment.fleet_id },
      });
    });

    return Response.json({ message: "Fleet acknowledged" });
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
    logger.error("[rental/fleet-ack POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
