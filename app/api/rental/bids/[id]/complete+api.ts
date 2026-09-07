/**
 * POST /api/rental/bids/[id]/complete — fleet staff or assigned driver marks complete
 */
import { db } from "@/src/db";
import { rentalBids, rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole, requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and, isNull } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid bid id" }, { status: 400 });
    }

    const { dbUser } = await requireAnyRole(["rider", "driver"])(request);

    const bidRows = await db
      .select()
      .from(rentalBids)
      .where(eq(rentalBids.id, id))
      .limit(1);

    const bid = bidRows[0];
    if (!bid) {
      return Response.json(
        { error: "not_found", message: "Bid not found" },
        { status: 404 },
      );
    }

    // Auth: fleet staff OR assigned driver (F38)
    const assignRows = await db
      .select()
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.winning_bid_id, id),
          eq(awardedBidAssignments.request_id, bid.request_id),
        ),
      )
      .limit(1);

    const assignment = assignRows[0];
    const isAssignedDriver =
      assignment?.assigned_driver_user_id === dbUser.id;
    const isFleetStaff =
      bid.fleet_id &&
      (await (async () => {
        try {
          await requireFleetMember(bid.fleet_id, ["OWNER", "MANAGER", "DISPATCHER"])(
            request,
          );
          return true;
        } catch {
          return false;
        }
      })());

    if (!isAssignedDriver && !isFleetStaff) {
      return Response.json(
        { error: "forbidden", message: "Not authorized to complete this ride" },
        { status: 403 },
      );
    }

    const reqRows = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, bid.request_id))
      .limit(1);

    const req = reqRows[0];
    if (!req || req.status !== "confirmed") {
      return Response.json(
        { error: "invalid_transition", message: "Request must be confirmed" },
        { status: 409 },
      );
    }

    // Audit-fix M2: only the AWARDED fleet may complete. The pre-tx authz
    // above runs on the PASSED bid's fleet — a losing fleet's staff could
    // complete a confirmed request mid-service for the winning fleet (the
    // completion WS then notified the completer's fleet, not the winner's).
    // The live assignment is the authoritative awarded-fleet source: the bid
    // must be the one the live assignment was created from.
    const [liveAwardedAssign] = await db
      .select({ winning_bid_id: awardedBidAssignments.winning_bid_id })
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.request_id, bid.request_id),
          isNull(awardedBidAssignments.released_at),
        ),
      )
      .limit(1);

    if (!liveAwardedAssign || liveAwardedAssign.winning_bid_id !== bid.id) {
      return Response.json(
        {
          error: "forbidden",
          message: "Only the awarded fleet can complete this ride",
        },
        { status: 403 },
      );
    }

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(rentalRequests)
        .set({ status: "completed", updated_at: new Date() })
        .where(
          and(
            eq(rentalRequests.id, bid.request_id),
            eq(rentalRequests.status, "confirmed"),
          ),
        )
        .returning({ id: rentalRequests.id });

      // A7 (audit #9): a state change between the pre-read and the tx makes
      // this UPDATE match 0 rows — surface it as 409 instead of a silent
      // "Ride completed" no-op.
      if (updated.length === 0) {
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      }

      await tx.insert(rentalRequestEvents).values({
        request_id: bid.request_id,
        event_type: "completed",
        created_by: dbUser.id,
      });
    });

    // Z2: emit after the tx (v1 §D.1.8) — owner + winning fleet
    try {
      notifyWs([
        {
          event: "rental:status",
          to: [
            { kind: "user", user_id: req.rider_user_id },
            { kind: "fleet", fleet_id: bid.fleet_id },
          ],
          payload: {
            request_id: bid.request_id,
            status: "completed",
            awarded_bid_id: bid.id,
          },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[rental/complete] ws notify failed", {
        requestId: bid.request_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ message: "Ride completed" });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    if (status === 403)
      return Response.json(
        { error: "forbidden", message: (err as Error).message ?? "Not authorized" },
        { status: 403 },
      );
    if (status === 409)
      return Response.json(
        { error: "invalid_transition", message: (err as Error).message },
        { status: 409 },
      );
    logger.error("[rental/bids/[id]/complete POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
