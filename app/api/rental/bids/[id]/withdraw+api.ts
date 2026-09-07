/**
 * POST /api/rental/bids/[id]/withdraw — fleet staff withdraws a bid
 *   plain (pre-settle) or force=true (won bid, request awarded, assignment pending, non-tracking)
 */
import { db } from "@/src/db";
import { rentalBids, rentalRequests, awardedBidAssignments, rentalRequestEvents } from "@/src/db/schema";
import { requireAnyRole, requireFleetMember } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { getConfigInt } from "@/lib/platformConfig";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, isNull, sql } from "drizzle-orm";
import { resolveF35Branch } from "@/lib/resolveF35Branch";
import { notifyWs } from "@/lib/wsNotify";

const withdrawSchema = z.object({
  force: z.boolean().default(false),
});

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

    if (bid.status !== "active" && bid.status !== "won") {
      return Response.json(
        { error: "invalid_transition", message: `Cannot withdraw from ${bid.status}` },
        { status: 409 },
      );
    }

    await requireFleetMember(bid.fleet_id, ["OWNER", "MANAGER", "DISPATCHER"])(request);

    const result = await parseJsonBody(request, withdrawSchema);
    if (!result.ok) return result.response;
    const body = result.data;

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
      const assignRows = await db
        .select()
        .from(awardedBidAssignments)
        .where(
          and(
            eq(awardedBidAssignments.request_id, bid.request_id),
            eq(awardedBidAssignments.winning_bid_id, id),
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
      const reselectMinutes = await getConfigInt("rental_reselect_window_minutes", 10);
      let guard: Response | null = null;
      let withdrewTo: "collecting" | "no_bidders" = "collecting";
      await db.transaction(async (tx) => {
        // R3-completion: the pre-tx reads above are UNLOCKED — a pick handler
        // can commit between them and this tx. Lock the request row and
        // re-verify BOTH conditions before any writes (same pattern as
        // demoteWinner / sweepConfirmationDeadlines), else the bid UPDATEs
        // below run unguarded and strand a live assignment on a collecting
        // request.
        const [lockedReq] = await tx
          .select({ status: rentalRequests.status })
          .from(rentalRequests)
          .where(eq(rentalRequests.id, bid.request_id))
          .for("update")
          .limit(1);

        if (!lockedReq || lockedReq.status !== "awarded") {
          guard = Response.json(
            { error: "invalid_transition", message: "Request is not in awarded state" },
            { status: 409 },
          );
          return;
        }

        const [liveAssign] = await tx
          .select({ assigned_driver_user_id: awardedBidAssignments.assigned_driver_user_id })
          .from(awardedBidAssignments)
          .where(
            and(
              eq(awardedBidAssignments.request_id, bid.request_id),
              eq(awardedBidAssignments.winning_bid_id, id),
              isNull(awardedBidAssignments.released_at),
            ),
          )
          .limit(1);

        if (liveAssign?.assigned_driver_user_id) {
          guard = Response.json(
            { error: "assignment_fulfilled", message: "Cannot withdraw after driver has been picked" },
            { status: 403 },
          );
          return;
        }

        await tx
          .update(rentalBids)
          .set({ status: "lost", settled_at: new Date() })
          .where(eq(rentalBids.id, id));

        await tx
          .update(rentalBids)
          .set({ status: "active" })
          .where(
            and(
              eq(rentalBids.request_id, bid.request_id),
              eq(rentalBids.status, "superseded"),
            ),
          );

        if (assignRows[0]) {
          await tx
            .update(awardedBidAssignments)
            .set({
              released_at: new Date(),
              release_reason: "fleet_cancelled",
            })
            .where(
              and(
                eq(awardedBidAssignments.id, assignRows[0].id),
                isNull(awardedBidAssignments.released_at),
                // belt-and-suspenders: never release a fulfilled assignment
                isNull(awardedBidAssignments.assigned_driver_user_id),
              ),
            );
        }

        // R3 round-2 (Item 2 #2): mirror demoteWinner's §B.1 branch — no
        // superseded bids ⇒ terminal no_bidders (bidding can NEVER reopen,
        // F35), never a bid-less 'collecting' that only sweeps to expired.
        const [{ cnt: supersededCnt }] = await tx
          .select({ cnt: sql<number>`count(*)::int` })
          .from(rentalBids)
          .where(
            and(
              eq(rentalBids.request_id, bid.request_id),
              eq(rentalBids.status, "superseded"),
            ),
          );

        if (supersededCnt === 0) {
          await tx
            .update(rentalRequests)
            .set({ status: "no_bidders", updated_at: new Date() })
            .where(eq(rentalRequests.id, bid.request_id));

          await tx.insert(rentalRequestEvents).values({
            request_id: bid.request_id,
            event_type: "no_bidders",
            payload: { reason: "fleet_cancelled" },
            created_by: dbUser.id,
          });
          withdrewTo = "no_bidders";
        } else {
          await tx
            .update(rentalRequests)
            .set({
              status: "collecting",
              awarded_bid_id: null,
              confirmation_deadline_at: null,
              reselect_deadline_at: new Date(Date.now() + reselectMinutes * 60 * 1000),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(rentalRequests.id, bid.request_id),
                eq(rentalRequests.status, "awarded"),
              ),
            );

          await tx.insert(rentalRequestEvents).values({
            request_id: bid.request_id,
            event_type: "bid_demoted",
            payload: { reason: "fleet_cancelled", bid_id: id },
            created_by: dbUser.id,
          });
        }
      });

      if (guard) return guard;

      // Z2: force-withdraw emissions — after the tx (v1 §D)
      try {
        notifyWs([
          {
            event: "rental:bid_settled",
            to: [{ kind: "fleet", fleet_id: bid.fleet_id }],
            payload: {
              request_id: bid.request_id,
              bid_id: id,
              reason: "withdrawn",
              status: withdrewTo,
            },
          },
          {
            event: "rental:status",
            to: [
              { kind: "user", user_id: req.rider_user_id },
              { kind: "fleet", fleet_id: bid.fleet_id },
            ],
            payload: { request_id: bid.request_id, status: withdrewTo },
          },
        ]);
      } catch (e: unknown) {
        logger.warn("[rental/withdraw] ws notify failed", { bidId: id, error: e instanceof Error ? e.message : String(e) });
      }

      return Response.json({ message: `Bid withdrawn, request returned to ${withdrewTo}` });
    }

    // Plain withdraw (pre-settle) — §B.0 atomic transition
    // M1 (audit-fix): the WS emit after the tx needs the POST-tx request
    // status; branches inside capture it here. Default = pre-tx status (the
    // no-transition branch); F35 branches overwrite it.
    let withdrewTo: string = req.status;
    await db.transaction(async (tx) => {
      // R3 round-2 (1g): lock the request row FIRST — the COUNT and the F35
      // branch UPDATEs below must serialize against a racing bid-submit's own
      // request lock, else a submit landing between the COUNT and the F35
      // UPDATE leaves a fresh 'active' bid on a 'broadcasting' request (the
      // bid becomes un-accept-able and sweeps to expired).
      const [lockedReq] = await tx
        .select({ status: rentalRequests.status })
        .from(rentalRequests)
        .where(eq(rentalRequests.id, bid.request_id))
        .for("update")
        .limit(1);

      if (!lockedReq || lockedReq.status !== "collecting") {
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      }

      const updated = await tx
        .update(rentalBids)
        .set({
          status: "withdrawn",
          withdrawn_at: new Date(),
          withdrawn_by_user_id: dbUser.id,
        })
        .where(
          and(
            eq(rentalBids.id, id),
            eq(rentalBids.status, "active"),
          ),
        )
        .returning({ id: rentalBids.id });

      if (updated.length === 0) {
        throw Object.assign(new Error("invalid_transition"), { status: 409 });
      }

      // F35: check remaining active bids
      const [{ cnt }] = await tx
        .select({ cnt: sql<number>`count(*)::int` })
        .from(rentalBids)
        .where(
          and(
            eq(rentalBids.request_id, bid.request_id),
            eq(rentalBids.status, "active"),
          ),
        );

      const f35Branch = resolveF35Branch(req, cnt);

      if (f35Branch === "no_bidders") {
        // Post-demotion: no_bidders (terminal) — bidding can NEVER reopen (F35)
        await tx
          .update(rentalRequests)
          .set({ status: "no_bidders", updated_at: new Date() })
          .where(
            and(
              eq(rentalRequests.id, bid.request_id),
              eq(rentalRequests.status, "collecting"),
            ),
          );
        await tx.insert(rentalRequestEvents).values({
          request_id: bid.request_id,
          event_type: "no_bidders",
          payload: { reason: "last_bid_withdrawn" },
          created_by: dbUser.id,
        });
        withdrewTo = "no_bidders";
      } else if (f35Branch === "broadcasting") {
        // Never awarded: revert collecting → broadcasting with fresh window (F35)
        const biddingWindow = req.bidding_window_seconds || 1200;
        await tx
          .update(rentalRequests)
          .set({
            status: "broadcasting",
            soft_deadline_at: new Date(Date.now() + biddingWindow * 1000),
            updated_at: new Date(),
          })
          .where(
            and(
              eq(rentalRequests.id, bid.request_id),
              eq(rentalRequests.status, "collecting"),
              isNull(rentalRequests.awarded_at),
            ),
          );
        await tx.insert(rentalRequestEvents).values({
          request_id: bid.request_id,
          event_type: "bid_withdrawn",
          payload: { bid_id: id, reopened: true },
          created_by: dbUser.id,
        });
        withdrewTo = "broadcasting";
      } else {
        await tx.insert(rentalRequestEvents).values({
          request_id: bid.request_id,
          event_type: "bid_withdrawn",
          payload: { bid_id: id },
          created_by: dbUser.id,
        });
        // No request transition — the default (pre-tx status) already holds.
      }
    });

    // Z2: plain-withdraw emissions — after the tx (v1 §D)
    try {
      notifyWs([
        {
          event: "rental:bid_settled",
          to: [{ kind: "fleet", fleet_id: bid.fleet_id }],
          payload: {
            request_id: bid.request_id,
            bid_id: id,
            reason: "withdrawn",
            status: withdrewTo, // M1: post-tx actual status, not the stale pre-tx read
          },
        },
        {
          event: "rental:status",
          to: [
            { kind: "user", user_id: req.rider_user_id },
            { kind: "fleet", fleet_id: bid.fleet_id },
          ],
          payload: { request_id: bid.request_id, status: withdrewTo },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[rental/withdraw] ws notify failed", { bidId: id, error: e instanceof Error ? e.message : String(e) });
    }

    return Response.json({ message: "Bid withdrawn" });
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
    logger.error("[rental/bids/[id]/withdraw POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
