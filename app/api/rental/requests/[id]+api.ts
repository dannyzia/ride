/**
 * GET /api/rental/requests/[id]
 * Request detail + bids (sealed — no bidder identity) + trust fields + rank.
 * POST /api/rental/requests/[id]/cancel — customer cancels
 * PATCH /api/rental/requests/[id]/terms — update negotiated_terms
 */
import { db } from "@/src/db";
import { rentalRequests, rentalBids, awardedBidAssignments, rentalRequestEvents, drivers, users, fleetMembers } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { notifyWs } from "@/lib/wsNotify";
import * as errors from "@/lib/errors";
import { eq, and, desc, sql, count as cnt, avg, inArray, isNull, notInArray } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: Request, { id }: { id: string }) {
  try {
    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver", "admin"])(
      request,
    );

    if (!z.string().uuid().safeParse(id).success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid request ID" },
        { status: 400 },
      );
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

    if (req.rider_user_id !== dbUser.id && dbUser.role !== "admin") {
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    }

    // Active bids (sealed — no bidder identity, just fleet_id)
    const bids = await db
      .select({
        id: rentalBids.id,
        fleet_id: rentalBids.fleet_id,
        vehicle_type: rentalBids.vehicle_type,
        quoted_price_bdt: rentalBids.quoted_price_bdt,
        quoted_notes: rentalBids.quoted_notes,
        status: rentalBids.status,
        submitted_at: rentalBids.submitted_at,
      })
      .from(rentalBids)
      .where(eq(rentalBids.request_id, id))
      .orderBy(rentalBids.quoted_price_bdt);

    // Trust signals per bidding fleet (F: fleet rating + completed count)
    const fleetIds = [...new Set(bids.map((b) => b.fleet_id))];
    const trustRows = fleetIds.length > 0
      ? await db
          .select({
            fleet_id: drivers.fleet_id,
            avg_rating: avg(drivers.rating),
            total_completed: sql<string>`COALESCE(SUM(${drivers.completed_rides_count}), 0)`,
          })
          .from(drivers)
          .where(
            and(
              sql`${drivers.fleet_id} IN ${fleetIds}`,
              eq(drivers.status, "active"),
            ),
          )
          .groupBy(drivers.fleet_id)
      : [];

    const trustMap = new Map(
      trustRows.map((r) => [
        r.fleet_id,
        { fleet_rating: Number(r.avg_rating ?? 5), fleet_completed_count: Number(r.total_completed ?? 0) },
      ]),
    );

    // N16 (ruling 9 / §F.2): rank badges apply to LIVE bids only — settled
    // rows (won/lost/superseded/withdrawn) carry no rank and no badge.
    const liveBids = bids.filter((b) => b.status === "active");
    const liveIndex = new Map(liveBids.map((b, i) => [b.id, i]));
    const rankedBids = bids.map((b) => {
      const liveIdx = liveIndex.get(b.id);
      return {
        ...b,
        rank: liveIdx === undefined ? null : liveIdx + 1,
        rank_badge:
          liveIdx === undefined ? null : liveIdx < 3 ? ["Best", "2nd", "3rd"][liveIdx] : null,
        ...trustMap.get(b.fleet_id),
      };
    });

    const responseReq: Record<string, unknown> = { ...req };
    if (responseReq.rider_user_id !== dbUser.id) {
      delete responseReq.patient_condition;
    }

    return Response.json({ request: responseReq, bids: rankedBids });
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
    logger.error("[rental/requests/[id] GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const cancelSchema = z.object({
  cancel_reason: z.string().max(500).optional(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

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

    if (req.rider_user_id !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Only the request owner can cancel" },
        { status: 403 },
      );
    }

    if (["cancelled", "expired", "no_bidders", "completed"].includes(req.status)) {
      return Response.json(
        { error: "invalid_transition", message: `Cannot cancel from ${req.status}` },
        { status: 409 },
      );
    }

    // N17: bodyless cancel is legitimate (AGENTS.md bodyless exemption) — an
    // absent body proceeds as {}; a PRESENT body must parse + validate, and a
    // present-but-invalid body returns 400 instead of being silently swallowed.
    // Body is read once as text (a consumed body cannot re-parse).
    const rawText = await request.text();
    let body: { cancel_reason?: string } = {};
    if (rawText.trim().length > 0) {
      const result = await parseJsonBody(
        new Request(request.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: rawText,
        }),
        cancelSchema,
      );
      if (!result.ok) return result.response;
      body = result.data;
    }

    const TERMINAL_STATUSES = ["cancelled", "expired", "no_bidders", "completed"] as const;

    let guard: Response | null = null;
    await db.transaction(async (tx) => {
      // R3 round-2 (Extra): lock the request row and re-verify the non-terminal
      // condition UNDER the lock — the pre-tx check at :163 is unlocked, and a
      // complete committing `confirmed → completed` in the race window must not
      // be overwritten to `cancelled` by the unconditional UPDATE below.
      const [lockedReq] = await tx
        .select({ status: rentalRequests.status })
        .from(rentalRequests)
        .where(eq(rentalRequests.id, id))
        .for("update")
        .limit(1);

      if (!lockedReq || (TERMINAL_STATUSES as readonly string[]).includes(lockedReq.status)) {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot cancel from ${lockedReq?.status ?? "unknown"}` },
          { status: 409 },
        );
        return;
      }

      // Settle every unsettled bid: active + won + superseded → lost (§B.1 —
      // superseded rows from a prior award must not linger on a terminal request)
      await tx
        .update(rentalBids)
        .set({ status: "lost", settled_at: new Date() })
        .where(
          and(
            eq(rentalBids.request_id, id),
            inArray(rentalBids.status, ["active", "won", "superseded"]),
          ),
        );

      // Release the live assignment, if any (§B.1 — no phantom-live assignment
      // on a terminal request; F36 partial unique keeps at most one live row)
      await tx
        .update(awardedBidAssignments)
        .set({
          released_at: new Date(),
          release_reason: "customer_cancelled",
          updated_at: new Date(),
        })
        .where(
          and(
            eq(awardedBidAssignments.request_id, id),
            isNull(awardedBidAssignments.released_at),
          ),
        );

      // Conditional write mirroring the pre-tx check (belt-and-suspenders over
      // the FOR UPDATE above)
      const updatedReq = await tx
        .update(rentalRequests)
        .set({
          status: "cancelled",
          cancelled_at: new Date(),
          cancel_reason: body.cancel_reason ?? null,
          cancelled_by: "rider",
          awarded_bid_id: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(rentalRequests.id, id),
            notInArray(rentalRequests.status, [...TERMINAL_STATUSES]),
          ),
        )
        .returning({ id: rentalRequests.id });

      if (updatedReq.length === 0) {
        guard = Response.json(
          { error: "invalid_transition", message: `Cannot cancel from ${lockedReq.status}` },
          { status: 409 },
        );
        return;
      }

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "customer_cancelled",
        payload: { reason: body.cancel_reason },
        created_by: dbUser.id,
      });
    });

    if (guard) return guard;

    // Z2: emit after the tx (v1 §D.1.8) — owner + all bidding fleets. The tx
    // settled every bid to 'lost', so distinct remaining-bid fleets = the
    // parties that need the terminal status.
    try {
      const biddingFleets = await db
        .selectDistinct({ fleet_id: rentalBids.fleet_id })
        .from(rentalBids)
        .where(eq(rentalBids.request_id, id));
      notifyWs([
        {
          event: "rental:status",
          to: [
            { kind: "user", user_id: req.rider_user_id },
            ...biddingFleets
              .filter((f) => f.fleet_id != null)
              .map((f) => ({ kind: "fleet" as const, fleet_id: f.fleet_id as string })),
          ],
          payload: { request_id: id, status: "cancelled" },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[rental/cancel] ws notify failed", {
        requestId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({ message: "Request cancelled" });
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
    logger.error("[rental/requests/[id] POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

const termsSchema = z.object({
  terms: z.string().max(2000),
});

export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    // B7/L1: UUID guard before any DB access
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return Response.json({ error: "invalid_uuid", message: "Invalid request id" }, { status: 400 });
    }

    const { supabaseUser, dbUser } = await requireAnyRole(["rider", "driver"])(
      request,
    );

    const reqRows = await db
      .select({ id: rentalRequests.id, rider_user_id: rentalRequests.rider_user_id, status: rentalRequests.status })
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

    // N9 (§C.2): owner OR winning-fleet member (post-award) may update terms.
    // The winning fleet is resolved from the LIVE assignment for this request.
    if (req.rider_user_id !== dbUser.id) {
      const [liveAssignment] = await db
        .select({ fleet_id: awardedBidAssignments.fleet_id })
        .from(awardedBidAssignments)
        .where(
          and(
            eq(awardedBidAssignments.request_id, id),
            isNull(awardedBidAssignments.released_at),
          ),
        )
        .limit(1);

      let isWinningFleetMember = false;
      if (liveAssignment) {
        const [membership] = await db
          .select({ id: fleetMembers.id })
          .from(fleetMembers)
          .where(
            and(
              eq(fleetMembers.fleet_id, liveAssignment.fleet_id),
              eq(fleetMembers.user_id, dbUser.id),
              eq(fleetMembers.status, "active"),
            ),
          )
          .limit(1);
        isWinningFleetMember = !!membership;
      }

      if (!isWinningFleetMember) {
        return Response.json(
          { error: "forbidden", message: "Not authorized" },
          { status: 403 },
        );
      }
    }

    const result = await parseJsonBody(request, termsSchema);
    if (!result.ok) return result.response;

    // B6 (audit #28): doc-only field — last-write-wins is acceptable (no lock);
    // the tx is for write atomicity discipline.
    await db.transaction(async (tx) => {
      await tx
        .update(rentalRequests)
        .set({ negotiated_terms: result.data.terms, updated_at: new Date() })
        .where(eq(rentalRequests.id, id));
    });

    return Response.json({ message: "Terms updated" });
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
    logger.error("[rental/requests/[id] PATCH] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
