/**
 * Rental dispatch chain — broadcast → collect → award → confirmed → completed.
 * All status transitions happen in §B.0 atomic transactions.
 * WS is notification-only; REST is canonical (F25).
 *
 * This module is the SOLE writer for rentalRequests status transitions
 * and rentalBids status transitions (except initial bid submit, which
 * the API route handles).
 */
import { db } from "../src/db";
import {
  rentalRequests,
  rentalBids,
  awardedBidAssignments,
  rentalRequestEvents,
  fleets,
  fleetServiceZones,
} from "../src/db/schema";
import { eq, and, isNull, lt, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getConfigInt } from "../lib/platformConfig";
import { sendToBidder, sendToFleetMembers } from "./rentalHandler";

/**
 * Z2: best-effort rental:status emit for sweep-driven transitions (v1 §D.1.8).
 * Never throws — a WS outage must not fail a sweep.
 */
async function emitRentalStatus(
  requestId: string,
  status: string,
  fleetId?: string | null,
): Promise<void> {
  try {
    const [owner] = await db
      .select({ rider_user_id: rentalRequests.rider_user_id })
      .from(rentalRequests)
      .where(eq(rentalRequests.id, requestId))
      .limit(1);
    if (owner) {
      sendToBidder(owner.rider_user_id, "rental:status", {
        request_id: requestId,
        status,
      });
    }
    if (fleetId) {
      await sendToFleetMembers(fleetId, "rental:status", { request_id: requestId, status });
    }
  } catch (e: unknown) {
    logger.warn("[rentalDispatchChain] ws notify failed", {
      requestId,
      status,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Append an event to rental_request_events (append-only, F21).
 */
export async function appendEvent(
  requestId: string,
  eventType: string,
  payload: Record<string, unknown>,
  createdBy?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
) {
  const executor = tx ?? db;
  await executor.insert(rentalRequestEvents).values({
    request_id: requestId,
    event_type: eventType,
    payload,
    created_by: createdBy ?? null,
  });
}

/**
 * Demote the winner of an awarded request (§B.1 demotion path).
 * F5 write-set: winner→lost, superseded→active, awarded_bid_id=NULL,
 * assignment released, confirmation_deadline_at=NULL, reselect_deadline_at set,
 * request→collecting.
 *
 * If NO superseded bids exist → no_bidders instead.
 */
export async function demoteWinner(
  requestId: string,
  reason: "sla_timeout" | "fleet_ack_timeout" | "fleet_cancelled",
) {
  const result = await db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(rentalRequests)
      .where(eq(rentalRequests.id, requestId))
      .for("update");

    if (!req || req.status !== "awarded") return { ok: false as const, reason: "not_awarded" };

    // R3-completion (F3): re-check the live assignment UNDER the request lock.
    // A racing pick handler can fulfil the assignment between the sweep's
    // outer SELECT and this tx — demoting anyway would strand the driver with
    // an orphan "live" assignment on a collecting request (winner→lost,
    // superseded→active, request→collecting all fire unconditionally).
    const [liveAssign] = await tx
      .select({ assigned_driver_user_id: awardedBidAssignments.assigned_driver_user_id })
      .from(awardedBidAssignments)
      .where(
        and(
          eq(awardedBidAssignments.request_id, requestId),
          isNull(awardedBidAssignments.released_at),
        ),
      )
      .limit(1);
    if (liveAssign?.assigned_driver_user_id && reason === "sla_timeout") {
      // Reason-aware (R3 round-2, Item 2 #1): an empty assignment becoming
      // non-empty before a sla_timeout demote means fleet staff PICKED while
      // we were sweeping — the customer must not be demoted for it. For
      // fleet_ack_timeout / fleet_cancelled the FLEET is the one failing to
      // deliver (tracking assignments are born-fulfilled, so a blanket exit
      // would abort every branch-(b) ack-timeout demote); the demote proceeds
      // and the conditional release UPDATE releases the driver normally.
      return { ok: false as const, reason: "driver_picked" };
    }

    // Winner → lost
    if (req.awarded_bid_id) {
      await tx
        .update(rentalBids)
        .set({ status: "lost", settled_at: new Date() })
        .where(eq(rentalBids.id, req.awarded_bid_id));
    }

    // Superseded → active (re-select candidates)
    await tx
      .update(rentalBids)
      .set({ status: "active" })
      .where(
        and(
          eq(rentalBids.request_id, requestId),
          eq(rentalBids.status, "superseded"),
        ),
      );

    // Release assignment — only if still unassigned (guards against racing pick handler)
    await tx
      .update(awardedBidAssignments)
      .set({
        released_at: new Date(),
        release_reason: reason === "fleet_cancelled" ? "fleet_cancelled" : "sla_timeout",
      })
      .where(
        and(
          eq(awardedBidAssignments.request_id, requestId),
          isNull(awardedBidAssignments.released_at),
          isNull(awardedBidAssignments.assigned_driver_user_id),
        ),
      );

    // Count remaining active bids
    const [{ cnt }] = await tx
      .select({ cnt: sql<number>`count(*)::int` })
      .from(rentalBids)
      .where(
        and(
          eq(rentalBids.request_id, requestId),
          eq(rentalBids.status, "active"),
        ),
      );

    if (cnt === 0) {
      // No standing bids → no_bidders (terminal)
      await tx
        .update(rentalRequests)
        .set({
          status: "no_bidders",
          awarded_bid_id: null,
          confirmation_deadline_at: null,
          reselect_deadline_at: null,
          updated_at: new Date(),
        })
        .where(eq(rentalRequests.id, requestId));

      await appendEvent(requestId, "no_bidders", { reason }, undefined, tx);

      return { ok: true as const, nextStatus: "no_bidders" as const };
    }

    // Standing bids exist → collecting with reselect window (ruling 8: admin-tunable)
    const reselectMinutes = await getConfigInt("rental_reselect_window_minutes", 10);
    const reselectDeadline = new Date(Date.now() + reselectMinutes * 60 * 1000);

    await tx
      .update(rentalRequests)
      .set({
        status: "collecting",
        awarded_bid_id: null,
        confirmation_deadline_at: null, // re-frozen
        reselect_deadline_at: reselectDeadline,
        updated_at: new Date(),
      })
      .where(eq(rentalRequests.id, requestId));

    await appendEvent(requestId, "bid_demoted", {
      reason,
      standing_bids: cnt,
      reselect_deadline_at: reselectDeadline.toISOString(),
    }, undefined, tx);

    return { ok: true as const, nextStatus: "collecting" as const, standingBids: cnt };
  });

  // Z2: sweep demotion emits (owner + the demoted winning fleet). The tx's
  // `req` is closure-scoped, so re-read the post-demotion row here.
  if (result.ok && result.nextStatus) {
    let demotedFleetId: string | null = null;
    const [postRow] = await db
      .select({
        awarded_bid_id: rentalRequests.awarded_bid_id,
      })
      .from(rentalRequests)
      .where(eq(rentalRequests.id, requestId))
      .limit(1);
    if (result.nextStatus === "collecting" && postRow?.awarded_bid_id) {
      const [winningBid] = await db
        .select({ fleet_id: rentalBids.fleet_id })
        .from(rentalBids)
        .where(eq(rentalBids.id, postRow.awarded_bid_id))
        .limit(1);
      demotedFleetId = winningBid?.fleet_id ?? null;
    }
    await emitRentalStatus(requestId, result.nextStatus, demotedFleetId);
  }

  return result;
}

/**
 * Job 46: Sweep expired requests.
 * - Deadline passed + awarded_at IS NULL (F34) + ≥1 active bid → expired
 * - Deadline passed + awarded_at IS NULL + 0 active bids → no_bidders
 * - reselect_deadline_at < now() (F39) → expired (re-select window lapsed)
 */
export async function sweepDeadlines() {
  const now = new Date();

  // 1. Soft deadline: broadcasting|collecting, awarded_at IS NULL, deadline passed, ≥1 active bid → expired
  const expiredRows = await db
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(
      and(
        sql`${rentalRequests.status} IN ('broadcasting', 'collecting')`,
        isNull(rentalRequests.awarded_at),
        lt(rentalRequests.soft_deadline_at, now),
      ),
    );

  for (const row of expiredRows) {
    // Check if there are active bids
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(rentalBids)
      .where(
        and(
          eq(rentalBids.request_id, row.id),
          eq(rentalBids.status, "active"),
        ),
      );

    if (cnt > 0) {
      // Has bids → expired (not auto-awarded — customer-selects)
      // Conditional WHERE mirrors the outer read: status + awarded_at + deadline
      const updated = await db
        .update(rentalRequests)
        .set({ status: "expired", updated_at: now })
        .where(
          and(
            eq(rentalRequests.id, row.id),
            sql`${rentalRequests.status} IN ('broadcasting', 'collecting')`,
            isNull(rentalRequests.awarded_at),
            lt(rentalRequests.soft_deadline_at, now),
          ),
        )
        .returning({ id: rentalRequests.id });

      if (updated.length === 0) continue; // raced — skip

      await db
        .update(rentalBids)
        .set({ status: "expired", expired_at: now })
        .where(
          and(
            eq(rentalBids.request_id, row.id),
            eq(rentalBids.status, "active"),
          ),
        );

      await appendEvent(row.id, "expired", { active_bids: cnt });
      await emitRentalStatus(row.id, "expired");
    } else {
      // No bids → no_bidders
      // Conditional WHERE mirrors the outer read: status + awarded_at + deadline
      const updated = await db
        .update(rentalRequests)
        .set({ status: "no_bidders", updated_at: now })
        .where(
          and(
            eq(rentalRequests.id, row.id),
            sql`${rentalRequests.status} IN ('broadcasting', 'collecting')`,
            isNull(rentalRequests.awarded_at),
            lt(rentalRequests.soft_deadline_at, now),
          ),
        )
        .returning({ id: rentalRequests.id });

      if (updated.length === 0) continue; // raced — skip

      await appendEvent(row.id, "no_bidders", {});
      await emitRentalStatus(row.id, "no_bidders");
    }
  }

  // 2. Reselect window lapsed (F39): collecting + reselect_deadline_at < now
  const reselectExpired = await db
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.status, "collecting"),
        lt(rentalRequests.reselect_deadline_at, now),
        sql`${rentalRequests.reselect_deadline_at} IS NOT NULL`,
      ),
    );

  for (const row of reselectExpired) {
    // Conditional WHERE guards against racing accept-bid (§B.0)
    const updated = await db
      .update(rentalRequests)
      .set({ status: "expired", reselect_deadline_at: null, updated_at: now })
      .where(
        and(
          eq(rentalRequests.id, row.id),
          eq(rentalRequests.status, "collecting"),
          lt(rentalRequests.reselect_deadline_at, now),
          sql`${rentalRequests.reselect_deadline_at} IS NOT NULL`,
        ),
      )
      .returning({ id: rentalRequests.id });

    if (updated.length === 0) continue; // raced — skip

    // Set standing active bids → expired
    await db
      .update(rentalBids)
      .set({ status: "expired", expired_at: now })
      .where(
        and(
          eq(rentalBids.request_id, row.id),
          eq(rentalBids.status, "active"),
        ),
      );

    await appendEvent(row.id, "expired", { reason: "reselect_window_lapsed" });
    await emitRentalStatus(row.id, "expired");
  }
}

/**
 * Job 47: Sweep assignment SLA timeouts + fleet-ack timeouts.
 * - Branch (a): non-tracking, assignment pending, past deadline → demote
 * - Branch (b) F45: tracking, fleet_ack_at IS NULL, past ack deadline → demote
 */
export async function sweepAssignmentSla() {
  const now = new Date();

  // Branch (a): non-tracking, pending assignment, past deadline
  const pendingAssignments = await db
    .select({
      id: awardedBidAssignments.id,
      request_id: awardedBidAssignments.request_id,
    })
    .from(awardedBidAssignments)
    .innerJoin(rentalRequests, eq(awardedBidAssignments.request_id, rentalRequests.id))
    .where(
      and(
        eq(rentalRequests.status, "awarded"),
        isNull(awardedBidAssignments.assigned_driver_user_id),
        isNull(awardedBidAssignments.released_at),
        lt(awardedBidAssignments.assignment_deadline_at, now),
        eq(rentalRequests.tracking_required, false),
      ),
    );

  for (const row of pendingAssignments) {
    logger.info("[scheduler] job 47: assignment SLA timeout", { requestId: row.request_id });
    await demoteWinner(row.request_id, "sla_timeout");
  }

  // Branch (b) F45: tracking, fleet_ack_at IS NULL, past ack deadline
  const ackSlaMinutes = await getConfigInt("rental_driver_pick_sla_minutes", 5);
  const ackTimeout = await db
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.status, "awarded"),
        eq(rentalRequests.tracking_required, true),
        isNull(rentalRequests.fleet_ack_at),
        sql`${rentalRequests.awarded_at} + interval '1 minute' * ${ackSlaMinutes} < ${now}`,
      ),
    );

  for (const row of ackTimeout) {
    logger.info("[scheduler] job 47: fleet-ack timeout", { requestId: row.id });
    await demoteWinner(row.id, "fleet_ack_timeout");
  }
}

/**
 * Job 48: Sweep confirmation deadline timeouts.
 * awarded + confirmation_deadline_at < now() → cancelled (customer_overslept)
 */
export async function sweepConfirmationDeadlines() {
  const now = new Date();

  const overdueRows = await db
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.status, "awarded"),
        lt(rentalRequests.confirmation_deadline_at, now),
        sql`${rentalRequests.confirmation_deadline_at} IS NOT NULL`,
      ),
    );

  for (const row of overdueRows) {
    logger.info("[scheduler] job 48: confirmation deadline", { requestId: row.id });

    await db.transaction(async (tx) => {
      // Lock the request row and re-verify the sweep conditions BEFORE any
      // bid writes — R3-completion (F4): the prior fix guarded the assignment
      // and request UPDATEs but left the bid UPDATEs running unguarded, so a
      // customer confirm racing the sweep produced a 'lost' bid on a
      // 'confirmed' request.
      const [req] = await tx
        .select({
          status: rentalRequests.status,
          awarded_bid_id: rentalRequests.awarded_bid_id,
        })
        .from(rentalRequests)
        .where(eq(rentalRequests.id, row.id))
        .for("update")
        .limit(1);

      if (!req || req.status !== "awarded") return;

      if (req.awarded_bid_id) {
        await tx
          .update(rentalBids)
          .set({ status: "lost", settled_at: now })
          .where(eq(rentalBids.id, req.awarded_bid_id));
      }

      // Superseded → lost (no reselect after confirm timeout)
      await tx
        .update(rentalBids)
        .set({ status: "lost", settled_at: now })
        .where(
          and(
            eq(rentalBids.request_id, row.id),
            sql`${rentalBids.status} IN ('superseded', 'active')`,
          ),
        );

      // Release assignment — only if still unassigned (guards against racing pick handler)
      await tx
        .update(awardedBidAssignments)
        .set({ released_at: now, release_reason: "customer_overslept" })
        .where(
          and(
            eq(awardedBidAssignments.request_id, row.id),
            isNull(awardedBidAssignments.released_at),
            isNull(awardedBidAssignments.assigned_driver_user_id),
          ),
        );

      // Request → cancelled — re-check deadline condition from the outer read
      await tx
        .update(rentalRequests)
        .set({
          status: "cancelled",
          cancelled_at: now,
          cancel_reason: "customer_overslept",
          cancelled_by: "system",
          awarded_bid_id: null,
          confirmation_deadline_at: null,
          updated_at: now,
        })
        .where(
          and(
            eq(rentalRequests.id, row.id),
            eq(rentalRequests.status, "awarded"),
            sql`${rentalRequests.confirmation_deadline_at} IS NOT NULL`,
          ),
        );

      await appendEvent(row.id, "customer_overslept", {}, undefined, tx);
      await emitRentalStatus(row.id, "cancelled");
    });
  }
}

/**
 * Filter eligible fleets for a broadcast based on service zones (F11).
 * A fleet with NO active zone rows is GLOBAL (receives everything).
 * A fleet with rows but all is_active=false is also global (dead-fleet edge fix).
 */
export async function getEligibleFleets(
  pickupLat: number,
  pickupLng: number,
): Promise<string[]> {
  // Get all fleets with at least one active zone row
  const activeZones = await db
    .select({ fleet_id: fleetServiceZones.fleet_id })
    .from(fleetServiceZones)
    .where(eq(fleetServiceZones.is_active, true))
    .groupBy(fleetServiceZones.fleet_id);

  const zonedFleetIds = activeZones.map((z) => z.fleet_id);

  // Global fleets: fleets with NO active zone rows at all
  const globalFleets = await db
    .select({ id: fleets.id })
    .from(fleets)
    .where(
      and(
        eq(fleets.status, "ACTIVE"),
        sql`NOT EXISTS (
          SELECT 1 FROM ${fleetServiceZones}
          WHERE ${fleetServiceZones.fleet_id} = ${fleets.id}
          AND ${fleetServiceZones.is_active} = true
        )`,
      ),
    );

  const globalFleetIds = globalFleets.map((f) => f.id);

  // TODO: Phase 2+ — geo-filter zoned fleets by H3 cell proximity
  // For now, all zoned fleets receive (polygon→hex tooling is a follow-up)
  return [...new Set([...zonedFleetIds, ...globalFleetIds])];
}
