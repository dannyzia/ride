/**
 * Rental bids.
 *
 * POST /api/rental/bids — submit a bid (fleet marketplace member)
 * GET  /api/rental/bids/active — caller's active bids (scoped to all qualifying fleets, F30)
 * GET  /api/rental/bids/history — caller's settled bids
 *
 * Guards: requireFleetMarketplaceAccess, request broadcasting|collecting, deadline not passed,
 * open-bid cap, price bounds, tracking_required conditional NOT NULL.
 */
import { db } from "@/src/db";
import { rentalBids, rentalRequests } from "@/src/db/schema";
import { requireFleetMarketplaceAccess } from "@/lib/marketplaceRbac";
import { parseJsonBody } from "@/lib/parseBody";
import { getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, desc, sql, count as cnt } from "drizzle-orm";

const submitSchema = z.object({
  request_id: z.string().uuid(),
  fleet_id: z.string().uuid().optional(), // REQUIRED when memberships.length > 1 (F30)
  vehicle_type: z.enum([
    "pickup", "mini_truck", "medium_truck", "heavy_truck",
    "trailer", "van", "ambulance_basic", "ambulance_advanced",
  ]),
  driver_user_id: z.string().uuid().optional(), // REQUIRED when parent.tracking_required=true
  vehicle_id: z.string().uuid().optional(),
  quoted_price_bdt: z.number().int().positive(),
  quoted_notes: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabaseUser, dbUser, memberships } =
      await requireFleetMarketplaceAccess()(request);

    const result = await parseJsonBody(request, submitSchema);
    if (!result.ok) return result.response;
    const body = result.data;

    // Resolve fleet_id (F30: ambiguous → 409)
    let fleetId = body.fleet_id;
    if (!fleetId && memberships.length === 1) {
      fleetId = memberships[0].fleet_id;
    } else if (!fleetId && memberships.length > 1) {
      return Response.json(
        { error: "fleet_ambiguous", message: "fleet_id required when you belong to multiple fleets" },
        { status: 409 },
      );
    } else if (fleetId && !memberships.some((m) => m.fleet_id === fleetId)) {
      return Response.json(
        { error: "fleet_not_authorized", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }

    // Verify request exists and is bid-eligible
    const reqRows = await db
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, body.request_id))
      .limit(1);

    const req = reqRows[0];
    if (!req) {
      return Response.json(
        { error: "not_found", message: "Request not found" },
        { status: 404 },
      );
    }

    if (!["broadcasting", "collecting"].includes(req.status)) {
      return Response.json(
        { error: "bid_window_closed", message: "Request is not accepting bids" },
        { status: 409 },
      );
    }

    if (new Date(req.soft_deadline_at) <= new Date()) {
      return Response.json(
        { error: "bid_window_closed", message: "Bidding deadline has passed" },
        { status: 409 },
      );
    }

    // Price bounds (F18)
    const minPrice = await getConfigInt("rental_min_price_bdt", 10000);
    const maxPrice = await getConfigInt("rental_max_price_bdt", 5000000);
    if (body.quoted_price_bdt < minPrice || body.quoted_price_bdt > maxPrice) {
      return Response.json(
        { error: "price_out_of_range", message: `Price must be between ${minPrice} and ${maxPrice} paisa` },
        { status: 400 },
      );
    }

    // Open-bid cap (F18)
    const maxOpen = await getConfigInt("rental_max_open_bids_per_fleet", 50);
    const [openCount] = await db
      .select({ cnt: cnt() })
      .from(rentalBids)
      .where(
        and(
          eq(rentalBids.fleet_id, fleetId!),
          eq(rentalBids.status, "active"),
        ),
      );

    if ((openCount?.cnt ?? 0) >= maxOpen) {
      return Response.json(
        { error: "bid_cap_reached", message: "Maximum open bids reached" },
        { status: 429 },
      );
    }

    // Tracking-required conditional NOT NULL
    if (req.tracking_required && (!body.driver_user_id || !body.vehicle_id)) {
      return Response.json(
        { error: "tracking_fields_required", message: "driver_user_id and vehicle_id required for tracking requests" },
        { status: 400 },
      );
    }

    // Insert bid (partial unique prevents duplicate active bid per request+fleet)
    const [bid] = await db
      .insert(rentalBids)
      .values({
        request_id: body.request_id,
        submitted_by_user_id: dbUser.id,
        fleet_id: fleetId!,
        driver_user_id: body.driver_user_id ?? null,
        vehicle_id: body.vehicle_id ?? null,
        vehicle_type: body.vehicle_type,
        quoted_price_bdt: body.quoted_price_bdt,
        quoted_notes: body.quoted_notes,
      })
      .returning({ id: rentalBids.id });

    return Response.json(
      { bid_id: bid.id, message: "Bid submitted" },
      { status: 201 },
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
        { error: "bid_window_closed", message: (err as Error).message },
        { status: 409 },
      );
    if (errors.getErrorCode(err) === "23505")
      return Response.json(
        { error: "bid_already_submitted", message: "You already have an active bid on this request" },
        { status: 409 },
      );
    logger.error("[rental/bids POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const { supabaseUser, dbUser, memberships } =
      await requireFleetMarketplaceAccess()(request);

    const url = new URL(request.url);
    const path = url.pathname;
    const fleetIds = memberships.map((m) => m.fleet_id);

    if (path.endsWith("/active")) {
      const rows = await db
        .select()
        .from(rentalBids)
        .where(
          and(
            sql`${rentalBids.fleet_id} IN ${fleetIds}`,
            eq(rentalBids.status, "active"),
          ),
        )
        .orderBy(desc(rentalBids.submitted_at));

      return Response.json({ bids: rows });
    }

    // History
    const rows = await db
      .select()
      .from(rentalBids)
      .where(sql`${rentalBids.fleet_id} IN ${fleetIds}`)
      .orderBy(desc(rentalBids.submitted_at))
      .limit(50);

    return Response.json({ bids: rows });
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
    logger.error("[rental/bids GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
