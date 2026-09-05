/**
 * activationJobs.ts — F46 activation seam (Jobs 54-55).
 *
 * The REST→WS bridge: polls for newly created rental/delivery requests
 * and broadcasts them to eligible bidder/courier sockets.
 *
 * Job 54: rental activation (broadcasting → bid_request)
 * Job 55: delivery activation (pending → bid_request + shop:delivery_created)
 *
 * Uses in-memory watermark for efficiency; restarts re-broadcast all
 * still-active rows (idempotent — doubles as crash recovery per TD-15).
 */
import { db } from '../src/db';
import type { DbClient } from './tx';
import {
  rentalRequests,
  deliveryRequests,
  fleetMembers,
  shopOrders,
  fleets,
} from '../src/db/schema';
import { eq, and, gt, sql, inArray } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { getConnectedBidderIds, sendToBidder } from './rentalHandler';
import { getEligibleFleets } from './rentalDispatchChain';
import { broadcastToCouriers, sendToCourier } from './deliveryHandler';
import { sendNotification } from '../lib/notify';
import { sendToUser } from './index';

// ── Job 54: Rental activation ────────────────────────────────────────────

// Epoch-initialized: on restart, re-broadcast all still-active rows (crash recovery TD-15)
let rentalWatermark: Date = new Date(0);

/**
 * Scan for broadcasting rental requests newer than watermark,
 * then broadcast to eligible fleet members.
 */
export async function activateRentalRequests(tx: DbClient = db): Promise<number> {
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

  if (broadcasting.length === 0) return 0;

  const connectedBidders = new Set(getConnectedBidderIds());
  let broadcastCount = 0;

  for (const req of broadcasting) {
    // Get eligible fleets for this request's pickup location
    const eligibleFleetIds = await getEligibleFleets(
      Number(req.pickup_lat),
      Number(req.pickup_lng),
    );

    if (eligibleFleetIds.length === 0) continue;

    // Get all active fleet members for eligible fleets
    // (getEligibleFleets above stays on the global db — rentalDispatchChain is
    // another lane's file this round; documented Phase-1 gap.)
    const members = await tx
      .select({
        user_id: fleetMembers.user_id,
        fleet_id: fleetMembers.fleet_id,
      })
      .from(fleetMembers)
      .where(
        and(
          inArray(fleetMembers.fleet_id, eligibleFleetIds),
          eq(fleetMembers.status, 'active'),
        ),
      );

    // Send to connected bidders who are members of eligible fleets
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

    for (const member of members) {
      if (connectedBidders.has(member.user_id)) {
        sendToBidder(member.user_id, 'rental:bid_request', broadcastPayload);
        broadcastCount++;
      }
    }

    // Push notification via lib/notify (alarm channel when urgency='alarm').
    // N11: deterministic idempotency key — job 54's watermark re-broadcasts on
    // restart (TD-15 recovery); without the key every restart re-pushes the
    // same activation to every member.
    try {
      const memberUserIds = members.map((m) => m.user_id);
      for (const userId of memberUserIds) {
        await sendNotification(
          userId,
          req.urgency === 'alarm' ? 'alarm' : 'default',
          req.urgency === 'alarm' ? '🚨 Urgent Rental Request' : 'New Rental Request',
          `${req.category} — ${req.pickup_address}`,
          { request_id: req.id, type: 'rental_bid_request' },
          { idempotencyKey: `rental_activation:${req.id}:${userId}` },
        );
      }
    } catch (err) {
      logger.warn('[activation] rental push notification failed', { request_id: req.id, err });
    }
  }

  // Advance watermark past the newest request
  const newest = broadcasting.reduce((max, r) =>
    new Date(r.created_at) > max ? new Date(r.created_at) : max,
    rentalWatermark,
  );
  rentalWatermark = newest;

  return broadcastCount;
}

// ── Job 55: Delivery activation ──────────────────────────────────────────

// Epoch-initialized: on restart, re-broadcast all still-active rows (crash recovery TD-15)
let deliveryWatermark: Date = new Date(0);

/**
 * Scan for pending delivery requests newer than watermark,
 * then broadcast to eligible courier sockets.
 * Also emits shop:delivery_created (F24) for food delivery orders.
 */
export async function activateDeliveryRequests(tx: DbClient = db): Promise<number> {
  const pending = await tx
    .select()
    .from(deliveryRequests)
    .where(
      and(
        eq(deliveryRequests.status, 'pending'),
        gt(deliveryRequests.created_at, deliveryWatermark),
      ),
    );

  if (pending.length === 0) return 0;

  let broadcastCount = 0;

  for (const req of pending) {
    // Broadcast to all connected couriers (they filter by eligibility client-side
    // or we could filter here by vehicle type if required_vehicle_type is set)
    const broadcastPayload = {
      request_id: req.id,
      pickup_address: req.pickup_address,
      pickup_lat: req.pickup_lat,
      pickup_lng: req.pickup_lng,
      dropoff_address: req.dropoff_address,
      dropoff_lat: req.dropoff_lat,
      dropoff_lng: req.dropoff_lng,
      required_vehicle_type: req.required_vehicle_type,
      declared_fee_bdt: req.declared_fee_bdt,
      deadline_at: req.deadline_at,
      package_description: req.package_description,
    };

    broadcastToCouriers('delivery:bid_request', broadcastPayload);
    broadcastCount++;

    // F24: if food delivery (has source_shop_order_id), emit shop:delivery_created
    // to the customer via the rider/driver registry (sendToUser) + lib/notify fallback
    if (req.source_shop_order_id) {
      try {
        const [shopOrder] = await tx
          .select({ rider_user_id: shopOrders.rider_user_id })
          .from(shopOrders)
          .where(eq(shopOrders.id, req.source_shop_order_id))
          .limit(1);

        if (shopOrder) {
          const payload = {
            type: 'shop:delivery_created',
            order_id: req.source_shop_order_id,
            delivery_request_id: req.id,
          };

          // Try WS first via rider/driver registry
          sendToUser(shopOrder.rider_user_id, payload);

          // Always send push notification as well (user may not be on WS).
          // N11: idempotency key — restart re-broadcast must not re-push.
          await sendNotification(
            shopOrder.rider_user_id,
            'default',
            'Your order is being delivered',
            'A courier has been assigned to your food order',
            { order_id: req.source_shop_order_id, type: 'delivery_created' },
            { idempotencyKey: `delivery_created:${req.id}` },
          );
        }
      } catch (err) {
        logger.warn('[activation] shop:delivery_created failed', {
          request_id: req.id,
          err,
        });
      }
    }
  }

  // Advance watermark
  const newest = pending.reduce((max, r) =>
    new Date(r.created_at) > max ? new Date(r.created_at) : max,
    deliveryWatermark,
  );
  deliveryWatermark = newest;

  return broadcastCount;
}
