/**
 * GET /api/rental/requests/broadcasts
 * Fleet discovery feed (round-5 amendment — closes the missed-broadcast gap).
 *
 * Returns eligible OPEN requests for ≥1 of the caller's qualifying fleets:
 * - status IN (broadcasting, collecting)
 * - now() < soft_deadline_at
 * - awarded_at IS NULL
 * - Service-zone filter (§A.2.4): request pickup cell at res 8 must match
 *   at least one fleet's active zone, OR the fleet has no zones (global).
 * - Ambulance cert gate: annotate ineligible fleets for ambulance_scheduled
 *   rather than hide the request entirely.
 *
 * Joins caller's own bid row per request (already_bid + bid status) for UI badging.
 * Paginated.
 *
 * Spec §C.2: requireFleetMarketplaceAccess()
 */
import { db } from "@/src/db";
import { rentalRequests, rentalBids, fleetServiceZones, ambulanceCertifications, drivers } from "@/src/db/schema";
import { requireFleetMarketplaceAccess } from "@/lib/marketplaceRbac";
import { getH3CellRes8 } from "@/lib/h3";
import { logger } from "@/lib/logger";
import { eq, and, or, isNull, sql, inArray } from "drizzle-orm";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  try {
    const { supabaseUser, dbUser, memberships } =
      await requireFleetMarketplaceAccess()(request);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const offset = (page - 1) * PAGE_SIZE;

    const fleetIds = memberships.map((m) => m.fleet_id);

    // ── Step 1: Get all open requests ────────────────────────────────────
    const openRequests = await db
      .select()
      .from(rentalRequests)
      .where(
        and(
          inArray(rentalRequests.status, ["broadcasting", "collecting"]),
          sql`${rentalRequests.soft_deadline_at} > NOW()`,  // now() < soft_deadline_at
          isNull(rentalRequests.awarded_bid_id),
        ),
      )
      .orderBy(rentalRequests.created_at)
      .limit(PAGE_SIZE * 2); // over-fetch for filtering

    // ── Step 2: Service-zone filter (§A.2.4) ────────────────────────────
    // For each fleet: check if it has active zones. If yes, check pickup cell match.
    // If no zones → global fleet → eligible for everything.

    // Get active zone fleets
    const activeZoneFleets = await db
      .select({ fleet_id: fleetServiceZones.fleet_id, h3_cell: fleetServiceZones.h3_cell })
      .from(fleetServiceZones)
      .where(eq(fleetServiceZones.is_active, true));

    const fleetZoneMap = new Map<string, Set<string>>();
    for (const row of activeZoneFleets) {
      if (!fleetZoneMap.has(row.fleet_id)) {
        fleetZoneMap.set(row.fleet_id, new Set());
      }
      fleetZoneMap.get(row.fleet_id)!.add(row.h3_cell);
    }

    // Fleets with NO active zone rows → global
    const fleetsWithZones = new Set(fleetZoneMap.keys());
    const globalFleetIds = fleetIds.filter((id) => !fleetsWithZones.has(id));

    // ── Step 3: Filter requests eligible for ≥1 caller fleet ─────────────
    const eligibleRequests = openRequests.filter((req) => {
      const pickupCell = getH3CellRes8(Number(req.pickup_lat), Number(req.pickup_lng));

      // Check if ANY of the caller's fleets is eligible
      for (const fleetId of fleetIds) {
        // Global fleet → always eligible
        if (globalFleetIds.includes(fleetId)) return true;

        // Zoned fleet → check pickup cell match
        const zones = fleetZoneMap.get(fleetId);
        if (zones?.has(pickupCell)) return true;
      }
      return false;
    });

    // ── Step 4: Join caller's own bids ───────────────────────────────────
    const requestIds = eligibleRequests.map((r) => r.id);

    let callerBids: {
      request_id: string;
      status: string;
      quoted_price_bdt: number;
    }[] = [];
    if (requestIds.length > 0) {
      callerBids = await db
        .select({
          request_id: rentalBids.request_id,
          status: rentalBids.status,
          quoted_price_bdt: rentalBids.quoted_price_bdt,
        })
        .from(rentalBids)
        .where(
          and(
            inArray(rentalBids.request_id, requestIds),
            eq(rentalBids.submitted_by_user_id, dbUser.id),
          ),
        );
    }

    const bidMap = new Map(callerBids.map((b) => [b.request_id, b]));

    // ── Step 5: Annotate ambulance eligibility per fleet ──────────────────
    // For ambulance_scheduled requests, check if each fleet has ≥1 verified cert pair
    const ambulanceRequests = eligibleRequests.filter(
      (r) => r.category === "ambulance_scheduled" && r.service_level,
    );

    let certFleetIds = new Set<string>();
    if (ambulanceRequests.length > 0) {
      // Cert holders → user_id → drivers.fleet_id (certs link to users, not drivers directly)
      const certRows = await db
        .select({ fleet_id: drivers.fleet_id })
        .from(ambulanceCertifications)
        .innerJoin(drivers, eq(ambulanceCertifications.user_id, drivers.user_id))
        .where(
          and(
            eq(ambulanceCertifications.certification_status, "verified"),
            sql`${ambulanceCertifications.expires_at} > NOW()`,
            inArray(drivers.fleet_id, fleetIds),
          ),
        )
        .groupBy(drivers.fleet_id);

      certFleetIds = new Set(certRows.map((r) => r.fleet_id));
    }

    // ── Step 6: Build response with already_bid + ambulance annotations ──
    const enriched = eligibleRequests.slice(offset, offset + PAGE_SIZE).map((req) => {
      const ownBid = bidMap.get(req.id) ?? null;

      // Per-fleet ambulance eligibility
      let ambulanceEligible: boolean | null = null;
      if (req.category === "ambulance_scheduled") {
        ambulanceEligible = fleetIds.some((fid) => certFleetIds.has(fid));
      }

      return {
        id: req.id,
        category: req.category,
        urgency: req.urgency,
        status: req.status,
        pickup_address: req.pickup_address,
        pickup_lat: req.pickup_lat,
        pickup_lng: req.pickup_lng,
        dropoff_address: req.dropoff_address,
        dropoff_lat: req.dropoff_lat,
        dropoff_lng: req.dropoff_lng,
        cargo_tags: req.cargo_tags,
        cargo_weight_kg: req.cargo_weight_kg,
        cargo_volume_m3: req.cargo_volume_m3,
        cargo_description: req.cargo_description,
        rental_options: req.rental_options,
        requested_vehicle_type: req.requested_vehicle_type,
        scheduled_start_at: req.scheduled_start_at,
        duration_hours: req.duration_hours,
        tracking_required: req.tracking_required,
        soft_deadline_at: req.soft_deadline_at,
        created_at: req.created_at,
        // Caller's own bid
        already_bid: ownBid !== null,
        own_bid_status: ownBid?.status ?? null,
        own_bid_price: ownBid?.quoted_price_bdt ?? null,
        // Ambulance annotation
        ambulance_eligible: ambulanceEligible,
      };
    });

    return Response.json({
      requests: enriched,
      page,
      page_size: PAGE_SIZE,
      has_more: eligibleRequests.length > offset + PAGE_SIZE,
    });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err) {
      const status = (err as { status: number }).status;
      if (status === 401)
        return Response.json(
          { error: "unauthorized", message: "Authentication required" },
          { status: 401 },
        );
      if (status === 403)
        return Response.json(
          { error: "forbidden", message: err.message ?? "Forbidden" },
          { status: 403 },
        );
    }
    logger.error("[rental/broadcasts GET] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
