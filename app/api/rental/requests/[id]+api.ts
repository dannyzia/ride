/**
 * GET /api/rental/requests/[id]
 * Request detail + bids (sealed — no bidder identity) + trust fields + rank.
 * POST /api/rental/requests/[id]/cancel — customer cancels
 * PATCH /api/rental/requests/[id]/terms — update negotiated_terms
 */
import { db } from "@/src/db";
import { rentalRequests, rentalBids, awardedBidAssignments, rentalRequestEvents, drivers, users } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { eq, and, desc, sql, count as cnt, avg } from "drizzle-orm";
import { z } from "zod";

export async function GET(request: Request, { id }: { id: string }) {
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

    // Rank bids by price (low→high) and add rank badge
    const rankedBids = bids.map((b, i) => ({
      ...b,
      rank: i + 1,
      rank_badge: i < 3 ? ["Best", "2nd", "3rd"][i] : null,
      ...trustMap.get(b.fleet_id),
    }));

    return Response.json({ request: req, bids: rankedBids });
  } catch (err: unknown) {
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

    const result = await parseJsonBody(request, cancelSchema);
    const body = result.ok ? result.data : {};

    await db.transaction(async (tx) => {
      // Set active bids → lost
      await tx
        .update(rentalBids)
        .set({ status: "lost", settled_at: new Date() })
        .where(and(eq(rentalBids.request_id, id), eq(rentalBids.status, "active")));

      await tx
        .update(rentalRequests)
        .set({
          status: "cancelled",
          cancelled_at: new Date(),
          cancel_reason: body.cancel_reason ?? null,
          cancelled_by: "rider",
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, id));

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "customer_cancelled",
        payload: { reason: body.cancel_reason },
        created_by: dbUser.id,
      });
    });

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

    // Owner or winning-fleet member can update terms
    if (req.rider_user_id !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Not authorized" },
        { status: 403 },
      );
    }

    const result = await parseJsonBody(request, termsSchema);
    if (!result.ok) return result.response;

    await db
      .update(rentalRequests)
      .set({ negotiated_terms: result.data.terms, updated_at: new Date() })
      .where(eq(rentalRequests.id, id));

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
