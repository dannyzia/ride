/**
 * activationJobs.ts — F46 activation seam (Job 54).
 *
 * The REST→WS bridge: polls for newly created rental requests
 * and broadcasts them to eligible bidder sockets.
 *
 * Job 54: rental activation (broadcasting → bid_request)
 * Job 55: RETIRED 2026-10-16 (B5-1, plan 27 §6.1) — delivery activation
 * (pending → bid_request + shop:delivery_created) is gone with the
 * courier-bidding marketplace. activateDeliveryRequests deleted.
 *
 * Uses in-memory watermark for efficiency; restarts re-broadcast all
 * still-active rows (idempotent — doubles as crash recovery per TD-15).
 *
 * M4 (audit-fix): the scans run INSIDE the withJobBudget transaction — the
 * budget's SET LOCAL statement_timeout applies only to the work queries, and
 * Expo push HTTP held the scheduler connection idle-in-transaction
 * (unbounded wall-clock, derivation undermined). The scans now return a
 * notifyQueue; the scheduler dispatches pushes AFTER withJobBudget returns
 * (see scheduler.ts job 54; job 55 retired B5-1). Pushes keep N11 deterministic idempotency
 * keys so the watermark restart-rebroadcast never re-pushes.
 */
import { db } from '../src/db';
import type { DbClient } from './tx';
import {
  rentalRequests,
  fleetMembers,
  fleetServiceZones,
  fleets,
} from '../src/db/schema';
import { eq, and, gt, sql, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { getConnectedBidderIds, sendToBidder } from './rentalHandler';
// sendNotifications: batched push path (job 54 member fan-out) —
// dispatched by the scheduler OUTSIDE the budget tx (M4).
import { sendNotifications, type NotificationRequest } from '../lib/notify';

/** A push tuple deferred out of the budget tx for post-tx dispatch (M4). */
export type NotifyQueue = NotificationRequest[];

/** Fire a notify queue OUTSIDE any budget tx (M4). Never throws. */
export async function dispatchNotifyQueue(queue: NotifyQueue): Promise<void> {
  if (queue.length === 0) return;
  try {
    // ONE sendNotifications call for the whole batch — lib/notify does a
    // single dedup SELECT for all idempotency keys, one multi-row INSERT,
    // and chunked parallel expo pushes. N11: deterministic idempotency keys
    // — restart re-broadcasts must not re-push the same notification.
    await sendNotifications(queue);
  } catch (err) {
    // sendNotifications never throws by contract; guard kept defensive.
    logger.warn('[activation] push batch failed', { err });
  }
}

// ── Job 54: Rental activation ────────────────────────────────────────────

// Epoch-initialized: on restart, re-broadcast all still-active rows (crash recovery TD-15)
let rentalWatermark: Date = new Date(0);

/**
 * Scan for broadcasting rental requests newer than watermark,
 * then broadcast to eligible fleet members.
 *
 * M4: WS fan-out stays here (in-memory, no HTTP); the expo pushes are
 * RETURNED as a notifyQueue for post-budget dispatch by the scheduler.
 */
export async function activateRentalRequests(tx: DbClient = db): Promise<{
  count: number;
  notifyQueue: NotifyQueue;
}> {
  // Find all still-broadcasting requests (watermark catches new + restart re-broadcast)
  const broadcasting = await tx
    .select()
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.status, 'broadcasting'),
        gt(rentalRequests.created_at, rentalWatermark),
      ),
    );

  if (broadcasting.length === 0) return { count: 0, notifyQueue: [] };

  // A8 batch: eligibility is request-INDEPENDENT (F11 has no geo filter yet —
  // the Phase 2+ H3 follow-up), so the zoned + global fleet sets are computed
  // once for the whole batch instead of once per request (the first rig run
  // measured 229s p99 from that per-request loop).
  const zoned = await tx
    .select({ fleet_id: fleetServiceZones.fleet_id })
    .from(fleetServiceZones)
    .where(eq(fleetServiceZones.is_active, true))
    .groupBy(fleetServiceZones.fleet_id);

  const globalFleets = await tx
    .select({ id: fleets.id })
    .from(fleets)
    .where(
      and(
        eq(fleets.status, 'ACTIVE'),
        sql`NOT EXISTS (
          SELECT 1 FROM ${fleetServiceZones}
          WHERE ${fleetServiceZones.fleet_id} = ${fleets.id}
          AND ${fleetServiceZones.is_active} = true
        )`,
      ),
    );

  const eligibleFleetIds = [
    ...new Set([...zoned.map((z) => z.fleet_id), ...globalFleets.map((f) => f.id)]),
  ];

  let memberUserIds: string[] = [];
  if (eligibleFleetIds.length > 0) {
    const members = await tx
      .select({ user_id: fleetMembers.user_id })
      .from(fleetMembers)
      .where(
        and(
          inArray(fleetMembers.fleet_id, eligibleFleetIds),
          eq(fleetMembers.status, 'active'),
        ),
      );
    memberUserIds = members.map((m) => m.user_id);
  }

  const connectedBidders = new Set(getConnectedBidderIds());
  let broadcastCount = 0;
  const notifyQueue: NotifyQueue = [];

  for (const req of broadcasting) {
    const broadcastPayload = {
      request_id: req.id,
      category: req.category,
      urgency: req.urgency,
      pickup_address: req.pickup_address,
      pickup_lat: req.pickup_lat,
      pickup_lng: req.pickup_lng,
      dropoff_address: req.dropoff_address,
      bidding_window_seconds: req.bidding_window_seconds,
      soft_deadline_at: req.soft_deadline_at,
      cargo_tags: req.cargo_tags,
      requested_vehicle_type: req.requested_vehicle_type,
      rental_options: req.rental_options,           // Ruling 13: comma-separated option chips
      scheduled_start_at: req.scheduled_start_at,   // Ruling 14: NULL = immediate
      duration_hours: req.duration_hours,           // Ruling 14: rental duration
    };

    // WS: in-memory registry send — no DB round-trip, safe inside the budget
    for (const userId of memberUserIds) {
      if (connectedBidders.has(userId)) {
        sendToBidder(userId, 'rental:bid_request', broadcastPayload);
        broadcastCount++;
      }
    }

    // M4: push tuples are COLLECTED, not sent — the scheduler fires them via
    // dispatchNotifyQueue AFTER withJobBudget returns (Expo HTTP can no
    // longer hold the scheduler connection idle-in-transaction).
    // N11: deterministic idempotency key — restart re-broadcast must not
    // re-push the same activation to every member.
    for (const userId of memberUserIds) {
      notifyQueue.push({
        userId,
        type: req.urgency === 'alarm' ? 'alarm' : 'default',
        title: req.urgency === 'alarm' ? '🚨 Urgent Rental Request' : 'New Rental Request',
        body: `${req.category} — ${req.pickup_address}`,
        data: { request_id: req.id, type: 'rental_bid_request' },
        idempotencyKey: `rental_activation:${req.id}:${userId}`,
      });
    }
  }

  // Advance watermark past the newest request
  const newest = broadcasting.reduce((max, r) =>
    new Date(r.created_at) > max ? new Date(r.created_at) : max,
    rentalWatermark,
  );
  rentalWatermark = newest;

  return { count: broadcastCount, notifyQueue };
}

// ── Job 55: RETIRED 2026-10-16 (B5-1, plan 27 §6.1) ─────────────────────────
// Delivery activation (pending delivery_requests → delivery:bid_request +
// shop:delivery_created) deleted with the courier-bidding marketplace.
// The job number is NOT reused; scheduler.ts carries the matching tombstone.
