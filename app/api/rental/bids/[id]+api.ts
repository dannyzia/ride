/**
 * Rental bid actions.
 *
 * POST /api/rental/bids/[id]/withdraw — fleet staff withdraws a bid
 *   plain (pre-settle) or force=true (won bid, request awarded, assignment pending, non-tracking)
 * POST /api/rental/bids/[id]/complete — fleet staff or assigned driver marks complete
 */
import { db } from "@/src/db";
import { rentalBids, rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole, requireFleetMember } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop();

    if (action === "withdraw") {
      return handleWithdraw(request, id);
    }
    if (action === "complete") {
      return handleComplete(request, id);
    }

    return Response.json(
      { error: "invalid_action", message: "Unknown action" },
      { status: 400 },
    );
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
    logger.error("[rental/bids/[id] POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const withdrawSchema = z.object({
  force: z.boolean().default(false),
});

async function handleWithdraw(request: Request, bidId: string) {
  const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
    request,
  );

  const bidRows = await db
    .select()
    .from(rentalBids)
    .where(eq(rentalBids.id, bidId))
    .limit(1);

  const bid = bidRows[0];
  if (!bid) {
    return Response.json(
      { error: "not_found", message: "Bid not found" },
      { status: 404 },
    );
  }

  if (bid.status !== "active" && bid.status !== "won") {
    return Response.json(
      { error: "invalid_transition", message: `Cannot withdraw from ${bid.status}` },
      { status: 409 },
    );
  }

  // Staff auth: OWNER/MANAGER/DISPATCHER of the bidding fleet
  await requireFleetMember(bid.fleet_id, ["OWNER", "MANAGER", "DISPATCHER"])(
    request,
  );

  const result = await parseJsonBody(request, withdrawSchema);
  const body = result.ok ? result.data : { force: false };

  const reqRows = await db
    .select()
    .from(rentalRequests)
    .where(eq(rentalRequests.id, bid.request_id))
    .limit(1);

  const req = reqRows[0];
  if (!req) {
    return Response.json(
      { error: "not_found", message: "Request not found" },
      { status: 404 },
    );
  }

  // Force-withdraw: only for won bid, request awarded, assignment pending, non-tracking (ruling 6)
  if (body.force) {
    if (bid.status !== "won") {
      return Response.json(
        { error: "invalid_transition", message: "Force-withdraw only applies to won bids" },
        { status: 409 },
      );
    }
    if (req.status !== "awarded") {
      return Response.json(
        { error: "invalid_transition", message: "Request is not in awarded state" },
        { status: 409 },
      );
    }
    if (req.tracking_required) {
      return Response.json(
        { error: "tracking_commitment", message: "Cannot withdraw from a tracking-required assignment" },
        { status: 403 },
      );
    }
    // Check assignment is pending (not fulfilled)
    const assignRows = await db
      .select()
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.request_id, bid.request_id),
          eq(awardedBidAssignments.winning_bid_id, bidId),
        ),
      )
      .limit(1);

    if (assignRows[0]?.assigned_driver_user_id) {
      return Response.json(
        { error: "assignment_fulfilled", message: "Cannot withdraw after driver has been picked" },
        { status: 403 },
      );
    }

    // Demotion path (§B.1)
    await db.transaction(async (tx) => {
      // Winner → lost
      await tx
        .update(rentalBids)
        .set({ status: "lost", settled_at: new Date() })
        .where(eq(rentalBids.id, bidId));

      // Superseded → active
      await tx
        .update(rentalBids)
        .set({ status: "active" })
        .where(
          and(
            eq(rentalBids.request_id, bid.request_id),
            eq(rentalBids.status, "superseded"),
          ),
        );

      // Release assignment
      if (assignRows[0]) {
        await tx
          .update(awardedBidAssignments)
          .set({
            released_at: new Date(),
            release_reason: "fleet_cancelled",
          })
          .where(eq(awardedBidAssignments.id, assignRows[0].id));
      }

      // Request → collecting
      await tx
        .update(rentalRequests)
        .set({
          status: "collecting",
          awarded_bid_id: null,
          confirmation_deadline_at: null,
          reselect_deadline_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min reselect window
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, bid.request_id));

      await tx.insert(rentalRequestEvents).values({
        request_id: bid.request_id,
        event_type: "bid_demoted",
        payload: { reason: "fleet_cancelled", bid_id: bidId },
        created_by: dbUser.id,
      });
    });

    return Response.json({ message: "Bid withdrawn, request returned to collecting" });
  }

  // Plain withdraw (pre-settle)
  await db
    .update(rentalBids)
    .set({
      status: "withdrawn",
      withdrawn_at: new Date(),
      withdrawn_by_user_id: dbUser.id,
    })
    .where(eq(rentalBids.id, bidId));

  await db.insert(rentalRequestEvents).values({
    request_id: bid.request_id,
    event_type: "bid_withdrawn",
    payload: { bid_id: bidId },
    created_by: dbUser.id,
  });

  return Response.json({ message: "Bid withdrawn" });
}

async function handleComplete(request: Request, bidId: string) {
  const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
    request,
  );

  const bidRows = await db
    .select()
    .from(rentalBids)
    .where(eq(rentalBids.id, bidId))
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
        eq(awardedBidAssignments.winning_bid_id, bidId),
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

  await db.transaction(async (tx) => {
    await tx
      .update(rentalRequests)
      .set({ status: "completed", updated_at: new Date() })
      .where(eq(rentalRequests.id, bid.request_id));

    await tx.insert(rentalRequestEvents).values({
      request_id: bid.request_id,
      event_type: "completed",
      created_by: dbUser.id,
    });
  });

  return Response.json({ message: "Ride completed" });
}
