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
import { rentalBids, rentalRequests, drivers, vehicles, rentalRequestEvents, rentalVehicleTypeEnum } from "@/src/db/schema";
import { requireFleetMarketplaceAccess } from "@/lib/marketplaceRbac";
import { fleetHasVerifiedCertPair } from "@/lib/ambulanceCerts";
import { parseJsonBody } from "@/lib/parseBody";
import { isVerticalEnabled, getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, desc, sql, count as cnt } from "drizzle-orm";

const submitSchema = z.object({
  request_id: z.string().uuid(),
  fleet_id: z.string().uuid().optional(), // REQUIRED when memberships.length > 1 (F30)
  vehicle_type: z.enum(rentalVehicleTypeEnum.enumValues as any),
  driver_user_id: z.string().uuid().optional(), // REQUIRED when parent.tracking_required=true
  vehicle_id: z.string().uuid().optional(),
  quoted_price_bdt: z.number().int().positive(),
  quoted_notes: z.string().max(500).optional(),
  overtime_rate_bdt: z.number().int().nonnegative().optional(), // Ruling 15: paisa, display-only
});

export async function POST(request: Request) {
  try {
    // N5 (§C.0): every vertical's bid endpoint checks the feature flag —
    // 403 feature_disabled when the marketplace vertical is off.
    if (!(await isVerticalEnabled("marketplace_rental_enabled"))) {
      return Response.json(
        { error: "feature_disabled", message: "Rental marketplace is not enabled" },
        { status: 403 },
      );
    }

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

    // Ambulance-scheduled (§C.2, ruling 6): the bidding fleet must hold ≥1
    // VERIFIED cert pair matching the request's service_level — cert holder
    // is an active fleet driver, cert vehicle ∈ fleet, unexpired.
    if (req.category === "ambulance_scheduled" && req.service_level) {
      const hasPair = await fleetHasVerifiedCertPair(fleetId!, req.service_level);
      if (!hasPair) {
        return Response.json(
          { error: "ambulance_certification_required", message: `Fleet needs a verified ${req.service_level} ambulance certification` },
          { status: 403 },
        );
      }
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

    // Validate driver belongs to the bidding fleet and is active
    if (body.driver_user_id) {
      const [driverRow] = await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(
          and(
            eq(drivers.user_id, body.driver_user_id),
            eq(drivers.fleet_id, fleetId!),
            eq(drivers.status, "active"),
          ),
        )
        .limit(1);
      if (!driverRow) {
        return Response.json(
          { error: "invalid_driver", message: "Driver not found or not in this fleet" },
          { status: 403 },
        );
      }
    }

    // Validate vehicle belongs to the bidding fleet
    if (body.vehicle_id) {
      const [vehicleRow] = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.id, body.vehicle_id),
            eq(vehicles.fleet_id, fleetId!),
          ),
        )
        .limit(1);
      if (!vehicleRow) {
        return Response.json(
          { error: "invalid_vehicle", message: "Vehicle not found or not in this fleet" },
          { status: 403 },
        );
      }
    }

    // N12 (§B.0): submit runs in ONE tx — re-lock the request row, re-verify
    // status + deadline in-tx (guards the transition), conditional
    // broadcasting→collecting flip on the first bid (§B.1), insert the bid,
    // append the bid_submitted audit event — same tx.
    const { bid } = await db.transaction(async (tx) => {
      const [reqLocked] = await tx
        .select()
        .from(rentalRequests)
        .where(eq(rentalRequests.id, body.request_id))
        .for("update");

      if (!reqLocked) {
        throw Object.assign(new Error("Request not found"), { status: 404 });
      }
      if (!["broadcasting", "collecting"].includes(reqLocked.status)) {
        throw Object.assign(new Error("Request is not accepting bids"), { status: 409 });
      }
      if (new Date(reqLocked.soft_deadline_at) <= new Date()) {
        throw Object.assign(new Error("Bidding deadline has passed"), { status: 409 });
      }

      // §B.1: broadcasting → collecting on the first bid (conditional update)
      if (reqLocked.status === "broadcasting") {
        await tx
          .update(rentalRequests)
          .set({ status: "collecting", updated_at: new Date() })
          .where(
            and(
              eq(rentalRequests.id, body.request_id),
              eq(rentalRequests.status, "broadcasting"),
            ),
          );
      }

      // Insert bid (partial unique prevents duplicate active bid per request+fleet)
      const [inserted] = await tx
        .insert(rentalBids)
        .values({
          request_id: body.request_id,
          submitted_by_user_id: dbUser.id,
          fleet_id: fleetId!,
          driver_user_id: body.driver_user_id ?? null,
          vehicle_id: body.vehicle_id ?? null,
          vehicle_type: body.vehicle_type as any,
          quoted_price_bdt: body.quoted_price_bdt,
          quoted_notes: body.quoted_notes,
          overtime_rate_bdt: body.overtime_rate_bdt ?? null,
        })
        .returning({ id: rentalBids.id });

      await tx.insert(rentalRequestEvents).values({
        request_id: body.request_id,
        event_type: "bid_submitted",
        payload: { bid_id: inserted.id, fleet_id: fleetId, vehicle_type: body.vehicle_type },
        created_by: dbUser.id,
      });

      return { bid: inserted };
    });

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
