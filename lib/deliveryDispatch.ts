/**
 * deliveryDispatch.ts — S6 sequential single-offer dispatch for delivery
 * legs (plan 27 §6.1, the binding flow; supersedes the §6 broadcast feed).
 *
 * Model (the ride-dispatch pattern, never broadcast):
 *   - ONE outstanding offer per leg at any time (status='offered' +
 *     offered_to_user_id, persisted on the deliveries row so a restart
 *     cannot re-offer past the suggestion cap or forget a declined
 *     candidate; the chain itself is in-memory state-free).
 *   - Rank: nearest to pickup → rating → subscription-active, across
 *     Delivery Men (couriers rows, active+online) AND drivers with the
 *     Deliveries toggle ON (drivers.deliveries_enabled).
 *   - Offer window × suggestion cap: delivery_offer_window_seconds (seed
 *     45s) × delivery_max_suggestions (seed 3) — both fresh-read from
 *     platform_config via requireConfigInt; a missing key propagates.
 *   - Decline/timeout → advance to the next ranked candidate the tick
 *     after the offer clears. Exhaustion → the shop falls back (F-12:
 *     retry / self-deliver / cancel — wired in app/api/shop).
 *   - Mutual exclusion BOTH directions (Amendment 2, one active job):
 *     a driver carrying an active ride never receives delivery offers
 *     (filtered here), and utils-server/dispatch.ts excludes drivers with
 *     an active delivery from the ride pool. A candidate holding ANY
 *     active leg (both roles) is excluded — one job at a time.
 *   - COD dispatch hold (F-33): couriers with overdue remittance dues
 *     beyond the config threshold are skipped as candidates.
 *
 * Notifications are fire-and-forget AFTER the chain write commits.
 */
import { and, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db';
import {
  deliveries,
  couriers,
  drivers,
  rides,
  shopOrders,
  shops,
  shopMembers,
  users,
  subscriptions,
} from '@/src/db/schema';
import { requireConfigInt } from '@/lib/platformConfig';
import { haversineKm } from '@/lib/shopDeliveryFee';
import { couriersOnDispatchHold } from '@/lib/deliverySettlement';
import { sendNotifications, type NotificationRequest } from '@/lib/notify';
import { logger } from '@/lib/logger';

type RideStatus = (typeof rides.status.enumValues)[number];
type DeliveryLegStatus = (typeof deliveries.status.enumValues)[number];

/** Ride states where the driver is carrying a rider (mutual exclusion). */
const DRIVER_BUSY_RIDE_STATES: RideStatus[] = ['matched', 'driver_arriving', 'driver_arrived', 'in_progress'];

/** Leg states that count as an active job for one-active-job exclusion. */
const ACTIVE_LEG_STATES: DeliveryLegStatus[] = ['accepted', 'picked_up'];

export interface DispatchCandidate {
  user_id: string;
  kind: 'courier' | 'driver';
  dist_km: number;
  rating: number; // 5.00 default when never rated (couriers without users.rating)
  subscription_active: boolean; // couriers: true (no per-courier sub storage — divergence recorded)
}

function numericOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ranked candidate pool for a leg. Excludes: tried candidates (persisted),
 * one-active-job holders (both roles), busy drivers, dispatch-held debtors,
 * and anyone without a position (cannot rank nearest-first).
 */
export async function rankedDeliveryCandidates(
  leg: {
    id: string;
    pickup_lat: string;
    pickup_lng: string;
    tried_claimer_ids: string[] | null;
  },
): Promise<DispatchCandidate[]> {
  const pickupLat = Number(leg.pickup_lat);
  const pickupLng = Number(leg.pickup_lng);
  const tried = new Set(leg.tried_claimer_ids ?? []);

  // Delivery Men: active + online couriers rows (any courier_type — the
  // Delivery Man is universal, owner ruling #5).
  const courierRows = await db
    .select({
      user_id: couriers.user_id,
      last_lat: couriers.last_lat,
      last_lng: couriers.last_lng,
    })
    .from(couriers)
    .where(and(eq(couriers.status, 'active'), eq(couriers.is_online, true)));

  // Drivers: active + online AND Deliveries toggle ON (server-side gate #3).
  const driverRows = await db
    .select({
      user_id: drivers.user_id,
      last_lat: drivers.last_location_lat,
      last_lng: drivers.last_location_lng,
      rating: drivers.rating,
      driver_id: drivers.id,
    })
    .from(drivers)
    .where(
      and(
        eq(drivers.status, 'active'),
        eq(drivers.is_online, true),
        eq(drivers.deliveries_enabled, true),
      ),
    );

  const courierUserIds = courierRows.map((r) => r.user_id);
  const driverUserIds = driverRows.map((r) => r.user_id);
  const allUserIds = [...courierUserIds, ...driverUserIds];
  if (allUserIds.length === 0) return [];

  // One-active-job exclusion (both roles share the constraint; the partial
  // unique index enforces it at claim time, this is the pool-side guard).
  const activeClaimRows = await db
    .select({ claimer: deliveries.delivery_man_user_id })
    .from(deliveries)
    .where(
      and(
        inArray(deliveries.status, ACTIVE_LEG_STATES),
        sql`${deliveries.delivery_man_user_id} IS NOT NULL`,
      ),
    );
  const busyClaimers = new Set(
    activeClaimRows.map((r) => r.claimer).filter((v): v is string => !!v),
  );

  // Drivers carrying a rider are excluded (mutual exclusion, Amendment 2).
  const busyRideDrivers = new Set(
    (
      await db
        .select({ driver_id: rides.driver_id })
        .from(rides)
        .where(and(inArray(rides.driver_id, driverRows.map((r) => r.driver_id)), inArray(rides.status, DRIVER_BUSY_RIDE_STATES)))
    )
      .map((r) => r.driver_id)
      .filter((v): v is string => !!v),
  );
  const busyRideUserIds = new Set(
    driverRows.filter((r) => busyRideDrivers.has(r.driver_id)).map((r) => r.user_id),
  );

  // COD dispatch hold (F-33): overdue remittance debtors are skipped.
  const held = await couriersOnDispatchHold(allUserIds);

  // Delivery-man ratings live on users (F-15 feeds ranking; delivery-rating
  // storage is a deferred surface — D-defers, §11). Never-rated → 5.00.
  const userRatings = new Map<string, number>();
  for (const row of await db
    .select({ user_id: users.id, rating: users.rating })
    .from(users)
    .where(inArray(users.id, allUserIds))) {
    userRatings.set(row.user_id, numericOrNull(row.rating) ?? 5);
  }

  // Subscription-active tiebreak: driver package subscriptions (couriers have
  // no subscription storage — recorded divergence, they rank as active).
  const subActive = new Set<string>();
  const poolDriverIds = driverRows.map((r) => r.driver_id);
  if (poolDriverIds.length > 0) {
    for (const row of await db
      .select({ driver_id: subscriptions.driver_id })
      .from(subscriptions)
      .where(
        and(
          inArray(subscriptions.driver_id, poolDriverIds),
          eq(subscriptions.status, 'active'),
          sql`${subscriptions.expires_at} > now()`,
        ),
      )) {
      subActive.add(row.driver_id);
    }
  }
  const driverUserByDriverId = new Map(driverRows.map((r) => [r.driver_id, r.user_id]));

  const inputs: RankableCandidate[] = [];
  for (const row of courierRows) {
    inputs.push({
      user_id: row.user_id,
      kind: 'courier',
      lat: numericOrNull(row.last_lat),
      lng: numericOrNull(row.last_lng),
      rating: userRatings.get(row.user_id) ?? 5,
      subscription_active: true,
      tried: tried.has(row.user_id),
      holds_active_job: busyClaimers.has(row.user_id),
      carrying_rider: false,
      dispatch_held: held.has(row.user_id),
    });
  }
  for (const row of driverRows) {
    inputs.push({
      user_id: row.user_id,
      kind: 'driver',
      lat: numericOrNull(row.last_lat),
      lng: numericOrNull(row.last_lng),
      rating: numericOrNull(row.rating) ?? 5,
      subscription_active: driverUserByDriverId.get(row.driver_id) === row.user_id && subActive.has(row.driver_id),
      tried: tried.has(row.user_id),
      holds_active_job: busyClaimers.has(row.user_id),
      carrying_rider: busyRideUserIds.has(row.user_id),
      dispatch_held: held.has(row.user_id),
    });
  }

  return rankDeliveryCandidates(inputs, { lat: pickupLat, lng: pickupLng });
}

/** One pool row + its exclusion flags — the pure ranking input. */
export interface RankableCandidate {
  user_id: string;
  kind: 'courier' | 'driver';
  lat: number | null;
  lng: number | null;
  rating: number;
  subscription_active: boolean;
  /** Tried earlier in THIS leg's chain (persisted tried set). */
  tried: boolean;
  /** Holds an active delivery already — one active job at a time. */
  holds_active_job: boolean;
  /** Driver carrying a rider (mutual exclusion, Amendment 2). */
  carrying_rider: boolean;
  /** Courier with overdue COD dues beyond the config threshold (F-33). */
  dispatch_held: boolean;
}

/**
 * PURE §6.1 ranking (unit-tested): exclude every flagged candidate and anyone
 * without a position (cannot rank nearest-first), then sort
 * nearest → rating → subscription-active, stable by id.
 */
export function rankDeliveryCandidates(
  inputs: RankableCandidate[],
  pickup: { lat: number; lng: number },
): DispatchCandidate[] {
  const ranked: DispatchCandidate[] = [];
  for (const c of inputs) {
    if (c.tried || c.holds_active_job || c.carrying_rider || c.dispatch_held) continue;
    if (c.lat === null || c.lng === null) continue; // cannot rank nearest-first
    ranked.push({
      user_id: c.user_id,
      kind: c.kind,
      dist_km: haversineKm(pickup.lat, pickup.lng, c.lat, c.lng),
      rating: c.rating,
      subscription_active: c.subscription_active,
    });
  }
  ranked.sort((a, b) => {
    if (a.dist_km !== b.dist_km) return a.dist_km - b.dist_km;
    if (a.rating !== b.rating) return b.rating - a.rating;
    if (a.subscription_active !== b.subscription_active) return a.subscription_active ? -1 : 1;
    return a.user_id < b.user_id ? -1 : 1;
  });
  return ranked;
}

/** Fire-and-forget offer push to the ranked candidate. */
async function notifyOffer(
  legId: string,
  candidate: DispatchCandidate,
  expiresAt: Date,
): Promise<void> {
  await sendNotifications([
    {
      userId: candidate.user_id,
      type: 'delivery:offer',
      title: 'New delivery offer',
      body: 'A delivery job is waiting for you — accept within the offer window.',
      data: { leg_id: legId, expires_at: expiresAt.toISOString() },
      priority: 'high',
      idempotencyKey: `delivery_offer:${legId}:${candidate.user_id}:${expiresAt.getTime()}`,
    } satisfies NotificationRequest,
  ]).catch(() => {});
}

/**
 * Advance one leg's chain by one step: offer to the next ranked candidate,
 * or exhaust when the cap or the pool runs out.
 */
export async function advanceDeliveryChain(legId: string): Promise<'offered' | 'exhausted' | 'noop'> {
  const [leg] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, legId))
    .limit(1)
    .for('update');
  if (!leg || leg.status !== 'created') return 'noop';

  const [maxSuggestions, windowSeconds] = await Promise.all([
    requireConfigInt('delivery_max_suggestions'),
    requireConfigInt('delivery_offer_window_seconds'),
  ]);
  if (leg.offer_attempts >= maxSuggestions) {
    await exhaustDeliveryLeg(legId);
    return 'exhausted';
  }

  const candidates = await rankedDeliveryCandidates(leg);
  const next = candidates[0];
  if (!next) {
    await exhaustDeliveryLeg(legId);
    return 'exhausted';
  }

  const expiresAt = new Date(Date.now() + windowSeconds * 1000);
  const tried = [...new Set([...(leg.tried_claimer_ids ?? []), next.user_id])];
  const updated = await db
    .update(deliveries)
    .set({
      status: 'offered',
      offered_to_user_id: next.user_id,
      offer_expires_at: expiresAt,
      offer_attempts: leg.offer_attempts + 1,
      tried_claimer_ids: tried,
      updated_at: new Date(),
    })
    .where(and(eq(deliveries.id, legId), eq(deliveries.status, 'created')))
    .returning({ id: deliveries.id });
  if (updated.length === 0) return 'noop'; // raced with another writer

  logger.info('[deliveryDispatch] offer sent', {
    legId,
    candidate: next.user_id,
    kind: next.kind,
    distKm: Math.round(next.dist_km * 100) / 100,
    attempt: leg.offer_attempts + 1,
  });
  await notifyOffer(legId, next, expiresAt);
  return 'offered';
}

/**
 * Chain exhausted (F-12): reset the live-offer fields; for shop-order legs
 * the SHOP now chooses retry / self-deliver / cancel (both parties notified);
 * non-order legs fail with a sender notification.
 */
export async function exhaustDeliveryLeg(legId: string): Promise<void> {
  const [leg] = await db.select().from(deliveries).where(eq(deliveries.id, legId)).limit(1);
  if (!leg) return;

  await db
    .update(deliveries)
    .set({
      offered_to_user_id: null,
      offer_expires_at: null,
      updated_at: new Date(),
    })
    .where(eq(deliveries.id, legId));

  const [order] = await db
    .select({
      id: shopOrders.id,
      shop_id: shopOrders.shop_id,
      rider_user_id: shopOrders.rider_user_id,
      status: shopOrders.status,
    })
    .from(shopOrders)
    .where(eq(shopOrders.id, leg.order_id))
    .limit(1);

  const notifies: NotificationRequest[] = [];
  if (order) {
    // Shop-side F-12 fallback: the dashboard surfaces retry / self-deliver /
    // cancel for this order. Order status is NOT mutated here — the shop
    // chooses. Guard: only while the order is still awaiting pickup handover.
    if (['accepted', 'preparing', 'dispatched'].includes(order.status)) {
      const [shopRow, memberRows] = await Promise.all([
        db.select({ owner_user_id: shops.owner_user_id }).from(shops).where(eq(shops.id, order.shop_id)).limit(1),
        db
          .select({ user_id: shopMembers.user_id })
          .from(shopMembers)
          .where(and(eq(shopMembers.shop_id, order.shop_id), isNull(shopMembers.removed_at))),
      ]);
      const recipientSet = new Set<string>(memberRows.map((m) => m.user_id));
      if (shopRow[0]?.owner_user_id) recipientSet.add(shopRow[0].owner_user_id);
      for (const userId of recipientSet) {
        notifies.push({
          userId,
          type: 'shop:delivery_exhausted',
          title: 'No courier available',
          body: 'The delivery offer window ended without a courier. Retry, deliver it yourself, or cancel.',
          data: { order_id: order.id, leg_id: legId },
          priority: 'high',
          idempotencyKey: `shop_delivery_exhausted:${order.id}:${legId}`,
        });
      }
      notifies.push({
        userId: order.rider_user_id,
        type: 'shop:order_status',
        title: 'Delivery is taking longer',
        body: 'We could not assign a courier yet. The shop is arranging your delivery.',
        data: { order_id: order.id, status: 'delivery_exhausted' },
        priority: 'high',
        idempotencyKey: `shop_order_status:${order.id}:delivery_exhausted:${order.rider_user_id}`,
      });
    }
  } else {
    // P2P / non-shop leg: no shop to fall back to — fail the leg.
    await db
      .update(deliveries)
      .set({ status: 'failed', updated_at: new Date() })
      .where(eq(deliveries.id, legId));
    if (leg.dropoff_user_id) {
      notifies.push({
        userId: leg.dropoff_user_id,
        type: 'delivery:status',
        title: 'Delivery could not be assigned',
        body: 'No courier accepted your delivery request in time.',
        data: { leg_id: legId, status: 'failed' },
        priority: 'high',
        idempotencyKey: `delivery_status:${legId}:failed`,
      });
    }
  }
  if (notifies.length > 0) await sendNotifications(notifies).catch(() => {});
  logger.info('[deliveryDispatch] chain exhausted', { legId });
}

/** One scheduler tick: expire stale offers, then start/continue fresh chains. */
export async function deliveryDispatchTick(): Promise<{ advanced: number; exhausted: number }> {
  let advanced = 0;
  let exhausted = 0;
  const now = new Date();

  // Arm 1 — live offers whose window elapsed → advance the chain.
  const stale = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.status, 'offered'), sql`${deliveries.offer_expires_at} <= ${now}`))
    .limit(25);
  for (const row of stale) {
    const result = await advanceDeliveryChain(row.id);
    if (result === 'offered') advanced += 1;
    if (result === 'exhausted') exhausted += 1;
  }

  // Arm 2 — created legs whose shop order is dispatching (R-A1: search
  // triggers at prep start; the shop may also trigger earlier via the
  // 'dispatched' transition) and whose chain has attempts left.
  const [maxSuggestions] = await Promise.all([requireConfigInt('delivery_max_suggestions')]);
  const fresh = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(shopOrders, eq(deliveries.order_id, shopOrders.id))
    .where(
      and(
        eq(deliveries.status, 'created'),
        isNull(deliveries.delivery_man_user_id),
        inArray(shopOrders.status, ['preparing', 'dispatched']),
        inArray(shopOrders.fulfillment, ['delivery']),
        ne(shopOrders.order_kind, 'service_booking'),
        sql`${deliveries.offer_attempts} < ${maxSuggestions}`,
      ),
    )
    .limit(25);
  for (const row of fresh) {
    const result = await advanceDeliveryChain(row.id);
    if (result === 'offered') advanced += 1;
    if (result === 'exhausted') exhausted += 1;
  }

  return { advanced, exhausted };
}

/**
 * Shop F-12 retry: reset the exhausted chain (attempts + tried set) so the
 * next tick re-ranks from scratch. Guarded by the caller (shop member).
 */
export async function retryDeliveryDispatch(orderId: string): Promise<boolean> {
  const [order] = await db
    .select({ id: shopOrders.id, status: shopOrders.status })
    .from(shopOrders)
    .where(eq(shopOrders.id, orderId))
    .limit(1);
  if (!order || !['accepted', 'preparing', 'dispatched'].includes(order.status)) return false;
  const updated = await db
    .update(deliveries)
    .set({
      status: 'created',
      offer_attempts: 0,
      tried_claimer_ids: [],
      offered_to_user_id: null,
      offer_expires_at: null,
      updated_at: new Date(),
    })
    .where(and(eq(deliveries.order_id, orderId), inArray(deliveries.status, ['created', 'offered'])))
    .returning({ id: deliveries.id });
  return updated.length > 0;
}
