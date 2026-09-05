/**
 * POST /api/rental/requests/[id]/fleet-ack
 * Fleet acknowledges a tracking-required booking within 5-min SLA (F45/ruling 7).
 * Only for tracking_required requests where fleet_ack_at IS NULL.
 */
import { db } from "@/src/db";
import { rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

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
          isNull(awardedBidAssignments.released_at),
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
      const updated = await tx
        .update(rentalRequests)
        .set({ fleet_ack_at: new Date(), updated_at: new Date() })
        .where(
          and(
            eq(rentalRequests.id, id),
            eq(rentalRequests.status, "awarded"),
            eq(rentalRequests.tracking_required, true),
            isNull(rentalRequests.fleet_ack_at),
          ),
        )
        .returning({ id: rentalRequests.id });

      if (updated.length === 0) {
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      }

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "fleet_acknowledged",
        payload: { fleet_id: assignment.fleet_id },
      });
    });

    // Z2: emit after the tx (v1 §D — rental:fleet_ack to owner, rental:status to fleet)
    try {
      const [reqRow] = await db
        .select({ rider_user_id: rentalRequests.rider_user_id })
        .from(rentalRequests)
        .where(eq(rentalRequests.id, id))
        .limit(1);
      notifyWs([
        ...(reqRow
          ? [
              {
                event: "rental:fleet_ack",
                to: [{ kind: "user" as const, user_id: reqRow.rider_user_id }],
                payload: {
                  request_id: id,
                  fleet_id: assignment.fleet_id,
                  status: "awarded",
                },
              },
            ]
          : []),
        {
          event: "rental:status",
          to: [{ kind: "fleet", fleet_id: assignment.fleet_id }],
          payload: { request_id: id, status: "awarded" },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[rental/fleet-ack] ws notify failed", {
        requestId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

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
