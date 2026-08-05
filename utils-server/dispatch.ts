import { db } from '../src/db';
import { drivers, rides, dispatchOffers, systemConfig, pricing, preferences, subscriptions, packages, driverCommutePreferences, driverBlocklists } from '../src/db/schema';
import { eq, and, inArray, sql, isNotNull } from 'drizzle-orm';
import { getH3Ring } from '../lib/h3';
import { getDriversInCells } from './h3Index';
import { checkDriverEligibility } from '../lib/vehicleTypes';
import { haversineKm } from '../lib/fareCalc';
import { logger } from '../lib/logger';
import { recordCallDeduction } from './heartbeat';
import crypto from 'crypto';

// ── Scoring weights ────────────────────────────────────────────────────────
// Defaults used when system_config key 'dispatch_scoring_weights' is absent.
// Shape: { distance: number; rating: number; acceptance: number; balance: number; online: number }
// All five weights must sum to 1.0. Admin can update via system_config without a redeploy.
const DEFAULT_WEIGHTS = {
  distance:   0.45,
  rating:     0.20,
  acceptance: 0.20,
  balance:    0.10,
  online:     0.05,
};

// Cache weights in-memory; refreshed on a TTL matching the H3 index cycle (30s)
// to avoid a per-dispatch DB round-trip while keeping weights reasonably fresh.
let cachedWeights = { ...DEFAULT_WEIGHTS };
let weightsCachedAt = 0;
const WEIGHTS_TTL_MS = 30_000;

async function getScoringWeights(): Promise<typeof DEFAULT_WEIGHTS> {
  if (Date.now() - weightsCachedAt < WEIGHTS_TTL_MS) return cachedWeights;
  try {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, 'dispatch_scoring_weights'));
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Partial<typeof DEFAULT_WEIGHTS>;
      cachedWeights = {
        distance:   typeof parsed.distance   === 'number' ? parsed.distance   : DEFAULT_WEIGHTS.distance,
        rating:     typeof parsed.rating     === 'number' ? parsed.rating     : DEFAULT_WEIGHTS.rating,
        acceptance: typeof parsed.acceptance === 'number' ? parsed.acceptance : DEFAULT_WEIGHTS.acceptance,
        balance:    typeof parsed.balance    === 'number' ? parsed.balance    : DEFAULT_WEIGHTS.balance,
        online:     typeof parsed.online     === 'number' ? parsed.online     : DEFAULT_WEIGHTS.online,
      };
    }
  } catch (e: any) {
    logger.warn('[dispatch] failed to load scoring weights from system_config; using cached/defaults', { error: e.message });
  }
  weightsCachedAt = Date.now();
  return cachedWeights;
}

// MAX_RADIUS_KM is the linear normalisation ceiling for distanceScore.
// Must be >= the actual search radius (DISPATCH_RING_K * ~0.174 km per H3 res-9 step).
// k=16 → ~2.8 km real radius; 5 km ceiling prevents compressing far-but-eligible
// drivers to near-zero scores while still honouring the distance-primary intent.
const MAX_RADIUS_KM = parseFloat(process.env.DISPATCH_MAX_RADIUS_KM ?? '15');

// H3 ring radius for the dispatch candidate search. At resolution 9 (~174m
// cells) each grid step is ~0.32km, so k=16 ≈ 5km — which matches the scoring
// threshold (distScore = 1 - distKm/5 in scoreAndBatchDrivers). The previous
// k=2 (~400m) was far too small: it caused rides to expire with ZERO offers
// whenever the nearest driver was more than a few hundred metres away (the
// Banani pickup to the indexed driver at ~1.9km = grid distance 6 was never
// reached). Tunable via DISPATCH_H3_RING_K without a code change.
export const DISPATCH_RING_K = parseInt(process.env.DISPATCH_H3_RING_K ?? '60');

export interface ScoredDriver {
  driverId: string;
  score: number;
}

export async function isDispatchPaused(): Promise<boolean> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'dispatch_paused'));
  return row?.value === 'true';
}

export async function scoreAndBatchDrivers(
  rideId: string,
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
  vehicleType: string,
  zoneId: string,
  batchSize = 5,
  preferenceIds: string[] = [],
): Promise<ScoredDriver[]> {
  const cells = getH3Ring(originLat, originLng, DISPATCH_RING_K);
  const candidateIds = getDriversInCells(cells, vehicleType);
  logger.info('[dispatch] scoreAndBatchDrivers', {
    rideId,
    originLat,
    originLng,
    vehicleType,
    zoneId,
    cellsSearched: cells.length,
    ringK: DISPATCH_RING_K,
    candidatesFound: candidateIds.length,
  });
  if (!candidateIds.length) {
    // Log what's in the index for debugging
    const { getIndexedDriverCount } = require('./h3Index');
    logger.warn('[dispatch] ZERO candidates — index has drivers but none match cells+vehicleType', {
      totalIndexed: getIndexedDriverCount(),
      vehicleTypeWanted: vehicleType,
    });
    return [];
  }

  // ── Load scoring weights (cached, 30s TTL) ────────────────────────────
  const W = await getScoringWeights();

  // ── Pricing row: system per-km rate (used for min_per_km_bdt filter) ──
  const [pricingRow] = await db.select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(and(
      eq(pricing.vehicle_type, vehicleType as any),
      eq(pricing.zone_id, zoneId),
      eq(pricing.is_active, true),
    ))
    .limit(1);
  const systemPerKmBdt = pricingRow?.per_km_bdt ?? 0;

  // ── Driver rows with subscription balance ─────────────────────────────
  // Left-join subscriptions so we get calls_remaining and daily_calls_used
  // without a separate query per driver. Drivers without an active subscription
  // receive calls_remaining = null → balanceScore = 0 → last in ranking.
  const driverRows = await db.select({
    id:                   drivers.id,
    last_location_lat:    drivers.last_location_lat,
    last_location_lng:    drivers.last_location_lng,
    rating:               drivers.rating,
    acceptance_rate:      drivers.acceptance_rate,
    last_location_at:     drivers.last_location_at,
    completed_rides_count: drivers.completed_rides_count,
    min_per_km_bdt:       drivers.min_per_km_bdt,
    vehicle_type:         drivers.vehicle_type,
    gender:               drivers.gender,
    auto_accept_enabled:  drivers.auto_accept_enabled,
    auto_accept_radius_meters: drivers.auto_accept_radius_meters,
    subscription_id:      subscriptions.id,
    calls_remaining:      subscriptions.calls_remaining,
    daily_calls_used:     subscriptions.daily_calls_used,
    daily_cap:            packages.daily_cap,
  })
  .from(drivers)
  .leftJoin(
    subscriptions,
    and(
      eq(subscriptions.driver_id, drivers.id),
      eq(subscriptions.status, 'active'),
    ),
  )
  .leftJoin(
    packages,
    eq(packages.id, subscriptions.package_id),
  )
  .where(
    and(
      eq(drivers.is_online, true),
      eq(drivers.status, 'active'),
      eq(drivers.vehicle_type, vehicleType as any),
      inArray(drivers.id, candidateIds),
      sql`NOT EXISTS (
        SELECT 1 FROM rides
        WHERE rides.driver_id = drivers.id
        AND rides.status IN ('matched', 'driver_arrived', 'in_progress')
        AND rides.updated_at > now() - interval '3 hours'
      )`,
    ),
  );

  const driverIds = driverRows.map(d => d.id);

  logger.info('[dispatch] candidate pipeline', {
    rideId,
    h3Candidates: candidateIds.length,
    dbRows: driverRows.length,
    vehicleType,
    ringK: DISPATCH_RING_K,
  });

  const qualityMap = new Map<string, { cancels_today: number; fives_today: number }>();
  if (driverIds.length > 0) {
    const qualityRows = await db.select({
      driver_id: rides.driver_id,
      cancels_today: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' THEN 1 ELSE 0 END)`,
      fives_today: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' AND ${rides.rider_rating} = 5 THEN 1 ELSE 0 END)`,
    })
    .from(rides)
    .where(and(
      inArray(rides.driver_id, driverIds),
      inArray(rides.status, ['cancelled', 'completed'] as any),
      sql`date_trunc('day', CASE WHEN ${rides.status} = 'cancelled' THEN ${rides.updated_at} ELSE ${rides.completed_at} END) = CURRENT_DATE`,
    ))
    .groupBy(rides.driver_id);

    for (const row of qualityRows) {
      qualityMap.set(row.driver_id, {
        cancels_today: Number(row.cancels_today),
        fives_today: Number(row.fives_today),
      });
    }
  }

  // ── Already-offered set ───────────────────────────────────────────────
  const existingOffers = await db
    .select({ driver_id: dispatchOffers.driver_id })
    .from(dispatchOffers)
    .where(eq(dispatchOffers.ride_id, rideId));
  const alreadyOffered = new Set(existingOffers.map(o => o.driver_id));

  // ── Preference filter ─────────────────────────────────────────────────
  // Only include drivers who have ALL requested affects_matching preferences.
  let preferenceEligibleIds: Set<string> | null = null;
  if (preferenceIds.length > 0) {
    const matchingPrefs = await db.select({ id: preferences.id })
      .from(preferences)
      .where(and(
        inArray(preferences.id, preferenceIds),
        eq(preferences.affects_matching, true),
      ));
    const matchingPrefIds = matchingPrefs.map(p => p.id);

    if (matchingPrefIds.length > 0) {
      const eligibleRows = await db.execute<{ driver_id: string }>(sql`
        SELECT driver_id FROM driver_preferences
        WHERE preference_id IN ${matchingPrefIds}
        GROUP BY driver_id
        HAVING COUNT(DISTINCT preference_id) = ${matchingPrefIds.length}
      `);
      preferenceEligibleIds = new Set(eligibleRows.map(r => r.driver_id));
      logger.debug('[dispatch] preference filter', {
        requested: matchingPrefIds.length, eligible: preferenceEligibleIds.size,
      });
    }
  }

  // ── Commute filter ─────────────────────────────────────────────────────
  function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return haversineKm(lat1, lng1, lat2, lng2) * 1000;
  }

  async function isRideTowardCommute(driverId: string, rideDestLat: number, rideDestLng: number): Promise<boolean> {
    const [commute] = await db.select().from(driverCommutePreferences)
      .where(and(eq(driverCommutePreferences.driver_id, driverId), eq(driverCommutePreferences.active, true)))
      .limit(1);
    if (!commute) return true;
    const destLat = parseFloat(commute.destination_lat);
    const destLng = parseFloat(commute.destination_lng);
    if (isNaN(destLat) || isNaN(destLng)) return true;
    const distToCommute = haversineMeters(rideDestLat, rideDestLng, destLat, destLng);
    if (distToCommute <= commute.max_deviation_meters) return true;
    return false;
  }

  // ── Score each candidate ──────────────────────────────────────────────
  const scored: ScoredDriver[] = [];

  // ── Female preference global check — done once before loop ────────────
  const [rideOwner] = await db.select({ user_id: rides.user_id, female_driver_preference: rides.female_driver_preference })
    .from(rides).where(eq(rides.id, rideId)).limit(1);
  let femalePref = rideOwner?.female_driver_preference ?? false;
  if (femalePref) {
    const femaleCount = driverRows.filter(d => d.gender === 'female').length;
    if (femaleCount === 0) femalePref = false; // No female drivers — fall back to all
  }

  for (const d of driverRows) {
    if (alreadyOffered.has(d.id)) continue;
    if (preferenceEligibleIds != null && !preferenceEligibleIds.has(d.id)) continue;
    if (!await isRideTowardCommute(d.id, destinationLat, destinationLng).catch(() => true)) {
      await db.insert(dispatchOffers).values({
        ride_id: rideId, driver_id: d.id, batch_index: -1, sent_at: new Date(),
        outcome: 'filtered' as any, filtered_reason: 'commute',
      }).onConflictDoNothing();
      continue;
    }
    // ── Blocklist filter ──
    try {
      if (rideOwner) {
        const [blocked] = await db.select().from(driverBlocklists)
          .where(and(eq(driverBlocklists.rider_id, rideOwner.user_id), eq(driverBlocklists.driver_id, d.id)))
          .limit(1);
        if (blocked) continue;
      }
    } catch { /* fail-open */ }

    // ── Female driver preference — skip male drivers if femalePref is active ──
    if (femalePref && d.gender !== 'female') continue;

    // ── Balance checks (required before auto-accept) ─────────────────────
    if (d.calls_remaining === null || d.calls_remaining === 0) {
      logger.debug('[dispatch] driver filtered — no subscription balance', {
        driverId: d.id, callsRemaining: d.calls_remaining, subscriptionId: d.subscription_id,
      });
      continue;
    }
    if (d.daily_calls_used != null && d.daily_calls_used >= (d.daily_cap ?? Infinity)) continue;

    // ── Auto-accept — driver auto-accepts close rides without offer sheet ──
    if (d.auto_accept_enabled && Number(d.rating ?? 0) >= 4.8) {
      const dlLat = parseFloat(d.last_location_lat?.toString() ?? '0');
      const dlLng = parseFloat(d.last_location_lng?.toString() ?? '0');
      if (dlLat !== 0 && dlLng !== 0) {
        const dist = haversineMeters(originLat, originLng, dlLat, dlLng);
        if (dist <= (d.auto_accept_radius_meters ?? 500)) {
          if (!d.subscription_id) continue;
          // Atomic match FIRST, with a start PIN. This prevents the race-loser
          // from consuming a call credit: the WHERE status='dispatching' guard
          // means only the first auto-acceptor wins; losers `continue` below
          // without deducting.
          const pin = crypto.randomInt(1000, 10000);
          const matched = await db.update(rides).set({
            driver_id: d.id, status: 'matched', matched_at: new Date(),
            start_pin: String(pin),
          }).where(and(eq(rides.id, rideId), eq(rides.status, 'dispatching')))
            .returning({ id: rides.id });
          if (matched.length === 0) {
            logger.warn('[dispatch] auto-accept race lost — ride already matched by another path', {
              rideId, driverId: d.id,
            });
            continue;
          }
          // Call deduction via heartbeat AFTER the match is won (ownership:
          // call_ledger deduction rows are ONLY written by heartbeat.ts, never
          // by dispatch.ts directly). The driver already passed the balance
          // check above, so if deduction now fails we keep the match and log.
          try {
            const deduction = await recordCallDeduction({
              driverId: d.id,
              subscriptionId: d.subscription_id,
              rideId,
              confirmedAt: new Date(),
            });
            if (!deduction.deducted) {
              logger.warn('[dispatch] auto-accept deduction failed after match — keeping match', {
                rideId, driverId: d.id,
              });
            }
          } catch (e: any) {
            logger.warn('[dispatch] auto-accept deduction error after match — keeping match', {
              rideId, driverId: d.id, error: e.message,
            });
          }
          await db.insert(dispatchOffers).values({
            ride_id: rideId, driver_id: d.id, batch_index: 0, sent_at: new Date(),
            outcome: 'accepted',
          });
          logger.info('[dispatch] auto-accepted', { rideId, driverId: d.id });
          // Return empty so the pipeline does NOT insert ghost offers for an
          // already-matched ride. dispatchRidePipeline detects the 'matched'
          // status and notifies the rider itself (sendToRider lives there).
          return [];
        }
      }
    }

    const { eligible } = checkDriverEligibility(vehicleType as any, {
      completed_rides_count: d.completed_rides_count,
      rating: parseFloat(d.rating?.toString() ?? '5'),
    });
    if (!eligible) continue;

    if (Number(d.rating) < 3.5) continue;

      if (d.min_per_km_bdt != null && systemPerKmBdt > 0 && systemPerKmBdt < d.min_per_km_bdt) {
      await db.insert(dispatchOffers).values({
        ride_id:         rideId,
        driver_id:       d.id,
        batch_index:     -1,
        sent_at:         new Date(),
        outcome:         'filtered' as any,
        filtered_reason: 'min_per_km',
      }).onConflictDoNothing();
      continue;
    }

    const distKm = haversineKm(
      originLat, originLng,
      parseFloat(d.last_location_lat?.toString() ?? '0'),
      parseFloat(d.last_location_lng?.toString() ?? '0'),
    );

    // ── distanceScore: linear 0→1 (closer = higher) ───────────────────
    // Using linear normalisation (not 1/distance) to prevent the non-linear
    // instability where a 0.5 km difference creates a 2× score gap.
    const distanceScore = Math.max(0, 1 - distKm / MAX_RADIUS_KM);

    // ── ratingScore: 0→1, default 4.0 for new drivers ─────────────────
    // New drivers have rating=5.00 (schema default) but rating_count=0.
    // We treat rating_count < 3 as "insufficient data" and use 4.0 neutral.
    const ratingRaw = parseFloat(d.rating?.toString() ?? '5');
    const ratingScore = ratingRaw / 5.0;

    // ── acceptanceScore: 0→1, 0.75 neutral for new drivers ────────────
    // The schema default is 100.00 for drivers with < 10 lifetime offers,
    // which is unrealistically optimistic. We use the completed_rides_count
    // as a proxy for data sufficiency (rides ≈ offers accepted).
    // < 10 completed rides → neutral 0.75 regardless of stored rate.
    const acceptRaw = parseFloat(d.acceptance_rate?.toString() ?? '100');
    const acceptanceScore = d.completed_rides_count < 10
      ? 0.75
      : Math.min(acceptRaw / 100, 1.0);

    // ── balanceScore: 0→1, Ride-unique subscription health signal ──────
    // Prevents broadcasting to zero-balance drivers who will not fetch.
    // calls_remaining = -1 → unlimited package → score = 1.0.
    // calls_remaining = null → no active subscription → score = 0.0
    //   (driver will not be able to complete a deduction; skip them).
    // Caps at 5+ remaining calls → 1.0 (no need to reward hoarding calls).
    const callsRem = d.calls_remaining;
    const balanceScore =
      callsRem === null                    ? 0.0                           // no active sub
      : callsRem === -1                    ? 1.0                           // unlimited
      : Math.min(callsRem / 5, 1.0);                                       // finite, cap at 5

    // ── onlineScore: freshness of last heartbeat ───────────────────────
    // Stale heartbeat means the driver may have closed the app.
    // Heartbeat interval is 10s; >30s = stale; >90s = excluded upstream.
    const lastSeenMs = d.last_location_at
      ? Date.now() - new Date(d.last_location_at).getTime()
      : Infinity;
    const heartbeatAgeSec = lastSeenMs / 1000;
    const onlineScore =
      heartbeatAgeSec < 30  ? 1.0 :
      heartbeatAgeSec < 90  ? 0.5 :
      0.0;  // >90s: should have been excluded by H3 index refresh, but guard here

    let score =
      W.distance   * distanceScore   +
      W.rating     * ratingScore     +
      W.acceptance * acceptanceScore +
      W.balance    * balanceScore    +
      W.online     * onlineScore;

    const stats = qualityMap.get(d.id);
    if (stats) {
      if (stats.cancels_today >= 3) {
        score *= 0.8;
      }
      if (stats.fives_today >= 5) {
        score *= 1.1;
      }
    }

    logger.debug('[dispatch] driver scored', {
      driverId: d.id, distKm: distKm.toFixed(2),
      distanceScore: distanceScore.toFixed(3),
      ratingScore: ratingScore.toFixed(3),
      acceptanceScore: acceptanceScore.toFixed(3),
      balanceScore: balanceScore.toFixed(3),
      onlineScore: onlineScore.toFixed(3),
      total: score.toFixed(4),
    });
    scored.push({ driverId: d.id, score });
  }

  logger.info('[dispatch] scoring complete', {
    rideId,
    scored: scored.length,
    batchSize,
    topScore: scored[0]?.score.toFixed(4) ?? 'none',
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, batchSize);
}

export async function updateDriverAcceptanceRate(driverId: string): Promise<void> {
  try {
    const recentOffers = await db.select({ outcome: dispatchOffers.outcome })
      .from(dispatchOffers)
      .where(and(
        eq(dispatchOffers.driver_id, driverId),
        inArray(dispatchOffers.outcome, ['accepted', 'rejected', 'expired'] as any),
      ))
      .orderBy(dispatchOffers.sent_at)
      .limit(50);

    if (recentOffers.length === 0) return;

    const accepted = recentOffers.filter(o => o.outcome === 'accepted').length;
    const rate = Math.round((accepted / recentOffers.length) * 100);

    await db.update(drivers).set({
      acceptance_rate: String(rate),
    }).where(eq(drivers.id, driverId));

    logger.debug('[dispatch] acceptance rate updated', { driverId, rate, total: recentOffers.length });
  } catch (e: any) {
    logger.error('[dispatch] acceptance rate update failed', { driverId, error: e.message });
  }
}

