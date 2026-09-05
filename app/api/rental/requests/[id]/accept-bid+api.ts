/**
 * POST /api/rental/requests/[id]/accept-bid
 * Customer accepts a bid. §B.0 tx: collecting → awarded.
 * Re-checks winning fleet's gate IN-TX (ruling 10).
 */
import { db } from "@/src/db";
import { rentalRequests, rentalBids, awardedBidAssignments, rentalRequestEvents, fleetSubscriptions, fleetSubscriptionPlans, fleets, drivers, vehicles, deliveryLegs, emergencyRequests, ambulanceCertifications } from "@/src/db/schema";
import { requireAnyRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { getConfigInt } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { z } from "zod";
import { eq, and, isNull, inArray, notInArray, sql } from "drizzle-orm";
import { notifyWs } from "@/lib/wsNotify";

const acceptSchema = z.object({
  bid_id: z.string().uuid(),
});

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const { dbUser } = await requireAnyRole(["rider", "driver"])(request);

    const result = await parseJsonBody(request, acceptSchema);
    if (!result.ok) return result.response;

    const { acceptedBid, assignment, req } = await db.transaction(async (tx) => {
      // Lock request row (§B.0)
      const reqRows = await tx
        .select()
        .from(rentalRequests)
        .where(eq(rentalRequests.id, id))
        .for("update");

      const req = reqRows[0];
      if (!req) throw Object.assign(new Error("Request not found"), { status: 404 });
      if (req.status !== "collecting") {
        throw Object.assign(new Error("Not in collecting state"), { status: 409 });
      }
      if (req.rider_user_id !== dbUser.id) {
        throw Object.assign(new Error("Only the request owner can accept"), { status: 403 });
      }

      // Verify bid exists and is active
      const bidRows = await tx
        .select()
        .from(rentalBids)
        .where(
          and(
            eq(rentalBids.id, result.data.bid_id),
            eq(rentalBids.request_id, id),
            eq(rentalBids.status, "active"),
          ),
        )
        .limit(1);

      if (!bidRows[0]) {
        throw Object.assign(new Error("Bid not found or not active"), { status: 404 });
      }

      // Gate re-check at accept (ruling 10): fleet must still be marketplace-qualified
      const subRows = await tx
        .select({
          fleet_status: fleets.status,
          plan_features: fleetSubscriptionPlans.features,
          period_end: fleetSubscriptions.current_period_end,
        })
        .from(fleetSubscriptions)
        .innerJoin(fleets, eq(fleetSubscriptions.fleet_id, fleets.id))
        .innerJoin(fleetSubscriptionPlans, eq(fleetSubscriptions.plan_id, fleetSubscriptionPlans.id))
        .where(
          and(
            eq(fleetSubscriptions.fleet_id, bidRows[0].fleet_id),
            eq(fleetSubscriptions.status, "ACTIVE"),
            eq(fleetSubscriptionPlans.active, true),
          ),
        )
        .limit(1);

      const sub = subRows[0];
      const features = sub?.plan_features as Record<string, unknown> | null;
      const periodOk = !sub?.period_end || new Date(sub.period_end) >= new Date();
      if (!sub || sub.fleet_status !== "ACTIVE" || !features?.marketplace_bidding || !periodOk) {
        throw Object.assign(new Error("marketplace_subscription_required"), {
          status: 403,
        });
      }

      // Validate driver belongs to the winning fleet and is active
      if (bidRows[0].driver_user_id) {
        const [driverRow] = await tx
          .select({ id: drivers.id })
          .from(drivers)
          .where(
            and(
              eq(drivers.user_id, bidRows[0].driver_user_id),
              eq(drivers.fleet_id, bidRows[0].fleet_id),
              eq(drivers.status, "active"),
            ),
          )
          .limit(1)
          .for("update");
        if (!driverRow) {
          throw Object.assign(new Error("invalid_driver"), { status: 403 });
        }

        // R3 round-2 (1i): tracking accepts assign the driver DIRECTLY here —
        // no pick step follows, so the §B.7 cross-vertical exclusivity checks
        // must run at accept (mirrors pick+api.ts:144-197; the drivers lock
        // above is the serialization point). Non-tracking accepts assign no
        // driver — their §B.7 runs at pick.
        if (req.tracking_required) {
          // §B.7 Check 1: no active rental assignment (parent-status filter —
          // terminal parents don't count; only awarded/confirmed commit a driver)
          const activeRentalStatuses = ["awarded", "confirmed"] as const;
          const [activeRental] = await tx
            .select({ id: awardedBidAssignments.id })
            .from(awardedBidAssignments)
            .innerJoin(
              rentalRequests,
              eq(awardedBidAssignments.request_id, rentalRequests.id),
            )
            .where(
              and(
                eq(awardedBidAssignments.assigned_driver_user_id, bidRows[0].driver_user_id),
                isNull(awardedBidAssignments.released_at),
                inArray(rentalRequests.status, activeRentalStatuses),
              ),
            )
            .limit(1);
          if (activeRental) {
            throw Object.assign(new Error("driver_already_committed"), { status: 409 });
          }

          // §B.7 Check 2: no active delivery leg
          const [activeLeg] = await tx
            .select({ id: deliveryLegs.id })
            .from(deliveryLegs)
            .where(
              and(
                eq(deliveryLegs.courier_user_id, bidRows[0].driver_user_id),
                sql`${deliveryLegs.leg_state} IN ('pending', 'assigned', 'picked_up', 'in_transit')`,
              ),
            )
            .limit(1);
          if (activeLeg) {
            throw Object.assign(new Error("driver_already_committed"), { status: 409 });
          }

          // §B.7 Check 3: no active emergency commitment
          const [activeEmergency] = await tx
            .select({ id: emergencyRequests.id })
            .from(emergencyRequests)
            .innerJoin(
              ambulanceCertifications,
              eq(emergencyRequests.accepted_cert_id, ambulanceCertifications.id),
            )
            .where(
              and(
                eq(ambulanceCertifications.user_id, bidRows[0].driver_user_id),
                notInArray(emergencyRequests.status, ["completed", "cancelled", "failed"]),
              ),
            )
            .limit(1);
          if (activeEmergency) {
            throw Object.assign(new Error("driver_already_committed"), { status: 409 });
          }
        }
      }

      // Validate vehicle belongs to the winning fleet
      if (bidRows[0].vehicle_id) {
        const [vehicleRow] = await tx
          .select({ id: vehicles.id })
          .from(vehicles)
          .where(
            and(
              eq(vehicles.id, bidRows[0].vehicle_id),
              eq(vehicles.fleet_id, bidRows[0].fleet_id),
            ),
          )
          .limit(1);
        if (!vehicleRow) {
          throw Object.assign(new Error("invalid_vehicle"), { status: 403 });
        }
      }

      // Award: accepted bid → won, all others → superseded
      // R3 round-2 (1b): conditional on status='active' — a fleet withdraw can
      // land between the unlocked pre-read and this flip; blindly overwriting
      // 'withdrawn' → 'won' would award a request on a withdrawn bid.
      const awardedBid = await tx
        .update(rentalBids)
        .set({ status: "won", settled_at: new Date() })
        .where(
          and(
            eq(rentalBids.id, result.data.bid_id),
            eq(rentalBids.status, "active"),
          ),
        )
        .returning({ id: rentalBids.id });
      if (awardedBid.length === 0) {
        throw Object.assign(new Error("bid_no_longer_active"), { status: 409 });
      }

      await tx
        .update(rentalBids)
        .set({ status: "superseded" })
        .where(
          and(
            eq(rentalBids.request_id, id),
            eq(rentalBids.status, "active"),
          ),
        );

      // Clock freeze: confirmation_deadline_at = NULL while assignment pending (F4)
      // For tracking_required: set immediately (no assignment step)
      const slaMinutes = await getConfigInt("rental_driver_pick_sla_minutes", 5);
      const trackingDeadline = req.tracking_required
        ? new Date(Date.now() + 60 * 60 * 1000) // 60 min confirm window
        : null; // frozen until pick

      await tx
        .update(rentalRequests)
        .set({
          status: "awarded",
          awarded_bid_id: result.data.bid_id,
          awarded_at: new Date(),
          confirmation_deadline_at: trackingDeadline,
          reselect_deadline_at: null, // consumed
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, id));

      // Insert assignment
      const assignmentDeadline = new Date(Date.now() + slaMinutes * 60 * 1000);
      const [assignment] = await tx
        .insert(awardedBidAssignments)
        .values({
          request_id: id,
          winning_bid_id: result.data.bid_id,
          fleet_id: bidRows[0].fleet_id,
          assigned_driver_user_id: req.tracking_required ? bidRows[0].driver_user_id : null,
          assigned_vehicle_id: req.tracking_required ? bidRows[0].vehicle_id : null,
          assigned_by_user_id: req.tracking_required ? dbUser.id : null,
          assignment_deadline_at: assignmentDeadline,
          assigned_at: req.tracking_required ? new Date() : null,
        })
        .returning({ id: awardedBidAssignments.id });

      await tx.insert(rentalRequestEvents).values({
        request_id: id,
        event_type: "bid_accepted",
        payload: { bid_id: result.data.bid_id, fleet_id: bidRows[0].fleet_id },
        created_by: dbUser.id,
      });

      return { acceptedBid: bidRows[0], req, assignment };
    });

    // Z2: per-state-change WS emissions — AFTER the tx resolves (v1 §D).
    // Fire-and-forget; a WS outage must not fail the committed transition.
    try {
      const losingFleets = await db
        .selectDistinct({ fleet_id: rentalBids.fleet_id })
        .from(rentalBids)
        .where(
          and(
            eq(rentalBids.request_id, id),
            eq(rentalBids.status, "superseded"),
          ),
        );
      notifyWs([
        {
          event: "rental:bid_won",
          to: [{ kind: "fleet", fleet_id: acceptedBid.fleet_id }],
          payload: {
            request_id: id,
            bid_id: acceptedBid.id,
            fleet_id: acceptedBid.fleet_id,
            status: "awarded",
            quoted_price_bdt: acceptedBid.quoted_price_bdt ?? null,
            assignment_id: assignment.id,
            tracking_required: req.tracking_required,
          },
        },
        ...losingFleets
          .filter((f) => f.fleet_id !== acceptedBid.fleet_id)
          .map((f) => ({
            event: "rental:bid_settled",
            to: [{ kind: "fleet" as const, fleet_id: f.fleet_id }],
            payload: {
              request_id: id,
              bid_id: acceptedBid.id,
              reason: "accepted",
              status: "awarded",
            },
          })),
        {
          event: "rental:status",
          to: [
            { kind: "user", user_id: req.rider_user_id },
            { kind: "fleet", fleet_id: acceptedBid.fleet_id },
          ],
          payload: { request_id: id, status: "awarded", awarded_bid_id: acceptedBid.id },
        },
      ]);
    } catch (e: unknown) {
      logger.warn("[rental/accept-bid] ws notify failed", {
        requestId: id,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    return Response.json({
      message: "Bid accepted",
      assignment_id: assignment.id,
      bid_id: acceptedBid.id,
      status: "awarded",
    });
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
    if (status === 409) {
      const msg = (err as Error).message;
      return Response.json(
        {
          // R3 round-2 (1b): named code for the raced bid; legacy codes preserved
          error: msg === "bid_no_longer_active" ? "bid_no_longer_active" : "invalid_transition",
          message: msg,
        },
        { status: 409 },
      );
    }
    logger.error("[rental/accept-bid POST] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
