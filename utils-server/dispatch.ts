import { db } from '../src/db';
import { drivers, rides, dispatchOffers, systemConfig, pricing, preferences, subscriptions, packages, driverCommutePreferences, driverBlocklists, callLedger } from '../src/db/schema';
import { eq, and, inArray, sql, gte } from 'drizzle-orm';
import { getH3Ring } from '../lib/h3';
import { getDriversInCells } from './h3Index';
import { checkDriverEligibility } from '../lib/vehicleTypes';
import { haversineKm } from '../lib/fareCalc';
import { logger } from '../lib/logger';
import { getColdDropInfos } from './coldDrop';
import {
  getFareFrameworkConfig,
  parseConfigNumber,
} from '../lib/fareFrameworkConfig';

// Phase D: dispatch.ts NO LONGER WRITES dispatch_offers (no 'filtered' rows,
// no auto-accept 'accepted' row). Filtering audit info is not persisted —
// leadBilling.ts is the sole writer of new offer rows. This file only reads
// dispatch_offers for chain exclusion and acceptance-rate recomputation.

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
// threshold (distScore = 1 - distKm/5 in buildCandidateList). The previous
// k=2 (~400m) was far too small: it caused rides to expire with ZERO offers
// whenever the nearest driver was more than a few hundred metres away (the
// Banani pickup to the indexed driver at ~1.9km = grid distance 6 was never
// reached). Tunable via DISPATCH_H3_RING_K without a code change.
export const DISPATCH_RING_K = parseInt(process.env.DISPATCH_H3_RING_K ?? '60');

/**
 * Phase G cancellation-cooldown window for a repeat proximity-canceler:
 * base window × 2^(offense_count − 1), capped at 4× base (the ladder cap —
 * offense_count beyond 3 no longer grows the window).
 */
export function proximityCooldownWindowMinutes(baseMinutes: number, offenseCount: number): number {
  if (baseMinutes <= 0 || offenseCount <= 1) return baseMinutes;
  const exponent = Math.min(offenseCount - 1, 2); // cap at 4× (2^2)
  return baseMinutes * Math.pow(2, exponent);
}

export interface ScoredDriver {
  driverId: string;
  score: number;
  /**
   * Same semantics as the pre-Phase-D in-scoring auto-accept: rating ≥ 4.8,
   * auto_accept_enabled, and inside the driver's auto-accept radius. The
   * sequential pipeline consumes this at the offer step (billing the lead
   * first, then matching directly). No longer matched inside scoring.
   */
  auto_accept_eligible: boolean;
}

export async function isDispatchPaused(): Promise<boolean> {
  const [row] = await db.select().from(systemConfig).where(eq(systemConfig.key, 'dispatch_paused'));
  return row?.value === 'true';
}

export async function buildCandidateList(
  rideId: string,
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
  vehicleType: string,
  zoneId: string,
  preferenceIds: string[] = [],
): Promise<ScoredDriver[]> {
  const cells = getH3Ring(originLat, originLng, DISPATCH_RING_K);
  const candidateIds = getDriversInCells(cells, vehicleType);
  logger.info('[dispatch] buildCandidateList', {
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

  // ── Ordering-composition config (Phase D levers) — fresh read ──────────
  const leverCfg = await getFareFrameworkConfig([
    'new_driver_priority_days',
    'new_driver_priority_leads',
    'return_lead_affinity_multiplier',
    'proximity_cancel_cooldown_minutes',
  ]);
  const newDriverPriorityLeads = parseConfigNumber(leverCfg.new_driver_priority_leads, 0);
  const newDriverPriorityDays = parseConfigNumber(leverCfg.new_driver_priority_days, 7);
  const returnLeadAffinityMultiplier = parseConfigNumber(leverCfg.return_lead_affinity_multiplier, 1.1);
  const cooldownBaseMinutes = parseConfigNumber(leverCfg.proximity_cancel_cooldown_minutes, 15);

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
    created_at:           drivers.created_at,
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
      // Busy filter: a driver serving a ride is never a candidate. This must
      // cover EVERY in-ride status — including 'driver_arriving' (en route to
      // pickup). Nothing sets that status today (accept stamps 'matched'), but
      // the documented state machine (docs/Plan/06-API.md § state machine)
      // auto-advances matched → driver_arriving on match; the day that lands,
      // a missing status here would re-offer every en-route driver (double-ride
      // failure). Add it now, before the transition exists.
      sql`NOT EXISTS (
        SELECT 1 FROM rides
        WHERE rides.driver_id = drivers.id
        AND rides.status IN ('matched', 'driver_arriving', 'driver_arrived', 'in_progress')
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
      if (!row.driver_id) continue;
      qualityMap.set(row.driver_id, {
        cancels_today: Number(row.cancels_today),
        fives_today: Number(row.fives_today),
      });
    }
  }

  // ── Already-offered set (chain exclusion — reused batch-exclusion query).
  // Under sequential dispatch a re-entering pipeline skips every driver that
  // already has a dispatch_offers row for this ride (billed leads are never
  // re-offered or re-billed; the unique indexes back this up).
  const existingOffers = await db
    .select({ driver_id: dispatchOffers.driver_id })
    .from(dispatchOffers)
    .where(eq(dispatchOffers.ride_id, rideId));
  const alreadyOffered = new Set(existingOffers.map(o => o.driver_id));

  // ── Proximity-cancel cooldown (Phase G) — ONE grouped query, JS filter ──
  // rides has no dedicated cancelled_at column: `updated_at` carries the
  // cancel timestamp (same convention as the quality query above). The
  // lookback is the ladder cap (4× base) so repeat offenders' doubled
  // windows stay visible; the per-driver effective window is applied in JS.
  const cooldownDriverIds = new Set<string>();
  if (driverIds.length > 0 && cooldownBaseMinutes > 0) {
    const lookbackStart = new Date(Date.now() - 4 * cooldownBaseMinutes * 60_000);
    const cooldownRows = await db.select({
      driver_id: rides.driver_id,
      offense_count: sql<number>`count(*)`,
      last_cancel_at: sql<string>`max(${rides.updated_at})`,
    })
    .from(rides)
    .where(and(
      inArray(rides.driver_id, driverIds),
      eq(rides.status, 'cancelled'),
      eq(rides.cancelled_by, 'driver'),
      eq(rides.driver_cancel_within_200m, true),
      gte(rides.updated_at, lookbackStart),
    ))
    .groupBy(rides.driver_id);

    const nowMs = Date.now();
    for (const row of cooldownRows) {
      if (!row.driver_id || !row.last_cancel_at) continue;
      const offenses = Number(row.offense_count);
      const windowMinutes = proximityCooldownWindowMinutes(cooldownBaseMinutes, offenses);
      const lastCancelMs = new Date(row.last_cancel_at).getTime();
      if (nowMs - lastCancelMs < windowMinutes * 60_000) {
        cooldownDriverIds.add(row.driver_id);
      }
    }
  }

  // ── New-driver protection tier (Lever, §6) — ONE batched count query ──
  // leads-consumed = count of call_ledger deduction rows per driver
  // (indexed by call_ledger_driver_date_idx).
  const leadsConsumedMap = new Map<string, number>();
  if (newDriverPriorityLeads > 0 && driverIds.length > 0) {
    const leadRows = await db.select({
      driver_id: callLedger.driver_id,
      leads: sql<number>`count(*)`,
    })
    .from(callLedger)
    .where(and(
      inArray(callLedger.driver_id, driverIds),
      eq(callLedger.event_type, 'deduction'),
    ))
    .groupBy(callLedger.driver_id);
    for (const row of leadRows) {
      if (row.driver_id) leadsConsumedMap.set(row.driver_id, Number(row.leads));
    }
  }

  // ── Cold-drop boost + return-lead affinity (Levers 2/3) — batched ─────
  const coldDropInfos = await getColdDropInfos(driverIds);

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

  // ── Commute + blocklist filters — batched before the loop ─────────────
  // (the per-candidate SELECTs below were an N+1 in the hottest loop of the
  // dispatch tick; both preference sets are now fetched once in bulk)
  function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return haversineKm(lat1, lng1, lat2, lng2) * 1000;
  }

  type CommutePref = typeof driverCommutePreferences.$inferSelect;
  const commuteByDriver = new Map<string, CommutePref>();
  const blockedDriverIds = new Set<string>();

  // ── Female preference global check — done once before loop ────────────
  const [rideOwner] = await db.select({ user_id: rides.user_id, female_driver_preference: rides.female_driver_preference })
    .from(rides).where(eq(rides.id, rideId)).limit(1);
  let femalePref = rideOwner?.female_driver_preference ?? false;
  if (femalePref) {
    const femaleCount = driverRows.filter(d => d.gender === 'female').length;
    if (femaleCount === 0) femalePref = false; // No female drivers — fall back to all
  }

  if (driverIds.length > 0) {
    // Fail-open by design: a DB error leaves every driver eligible. These are
    // preferences, not correctness gates — same semantics as the old
    // per-driver `.catch(() => true)` on the commute check.
    try {
      const commuteRows = await db.select().from(driverCommutePreferences)
        .where(and(
          inArray(driverCommutePreferences.driver_id, driverIds),
          eq(driverCommutePreferences.active, true),
        ));
      for (const c of commuteRows) {
        if (!commuteByDriver.has(c.driver_id)) commuteByDriver.set(c.driver_id, c);
      }
      if (rideOwner) {
        const blockedRows = await db.select({ driver_id: driverBlocklists.driver_id })
          .from(driverBlocklists)
          .where(and(
            eq(driverBlocklists.rider_id, rideOwner.user_id),
            inArray(driverBlocklists.driver_id, driverIds),
          ));
        for (const b of blockedRows) blockedDriverIds.add(b.driver_id);
      }
    } catch (e: any) {
      logger.warn('[dispatch] commute/blocklist pref fetch failed — failing open', { error: e.message });
    }
  }

  // ── Score each candidate ──────────────────────────────────────────────
  // Local scored row carries the protected-tier flag for the final sort.
  interface ScoredRow extends ScoredDriver {
    protected_tier: boolean;
  }
  const scored: ScoredRow[] = [];
  const nowMs = Date.now();

  for (const d of driverRows) {
    if (alreadyOffered.has(d.id)) continue;
    if (preferenceEligibleIds != null && !preferenceEligibleIds.has(d.id)) continue;

    // ── Proximity-cancel cooldown (Phase G) ──
    if (cooldownDriverIds.has(d.id)) {
      logger.debug('[dispatch] driver filtered — proximity-cancel cooldown', {
        driverId: d.id,
        baseMinutes: cooldownBaseMinutes,
      });
      continue;
    }

    // ── Commute filter (batched; no audit row — dispatch.ts no longer writes) ──
    const commute = commuteByDriver.get(d.id);
    if (commute) {
      const destLat = parseFloat(commute.destination_lat);
      const destLng = parseFloat(commute.destination_lng);
      if (!isNaN(destLat) && !isNaN(destLng)) {
        const distToCommute = haversineMeters(destinationLat, destinationLng, destLat, destLng);
        if (distToCommute > commute.max_deviation_meters) {
          continue;
        }
      }
    }

    // ── Blocklist filter (batched) ──
    if (rideOwner && blockedDriverIds.has(d.id)) continue;

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

    // ── Auto-accept eligibility flag (match happens at the offer step in
    // the pipeline, after billing — auto-accept drivers are billed the same
    // 1 lead). Same semantics as before: rating ≥ 4.8 + radius gate. ──────
    let autoAcceptEligible = false;
    if (d.auto_accept_enabled && Number(d.rating ?? 0) >= 4.8) {
      const dlLat = parseFloat(d.last_location_lat?.toString() ?? '0');
      const dlLng = parseFloat(d.last_location_lng?.toString() ?? '0');
      if (dlLat !== 0 && dlLng !== 0) {
        const dist = haversineMeters(originLat, originLng, dlLat, dlLng);
        if (dist <= (d.auto_accept_radius_meters ?? 500)) {
          autoAcceptEligible = true;
        }
      }
    }

    const { eligible } = checkDriverEligibility(vehicleType as any, {
      completed_rides_count: d.completed_rides_count,
      rating: parseFloat(d.rating?.toString() ?? '5'),
    });
    if (!eligible) continue;

    if (Number(d.rating) < 3.5) continue;

    // ── min_per_km filter (no audit row — dispatch.ts no longer writes) ──
    if (d.min_per_km_bdt != null && systemPerKmBdt > 0 && systemPerKmBdt < d.min_per_km_bdt) {
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
    // Prevents offering to zero-balance drivers who cannot be billed.
    // calls_remaining = -1 → unlimited package → score = 1.0.
    // calls_remaining = null → no active subscription → score = 0.0
    //   (driver cannot be billed at offer time; skip them).
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

    // M2: hard-exclude drivers whose last heartbeat is so stale that the
    // socket may be alive but the app is effectively dead (iOS background
    // suspension, silent network partition — no close frame, so
    // is_online never flips and the H3 index never evicts them). Threshold
    // is 120s (not 90s) to give GPS-outage drivers (tunnels, dead zones)
    // one or two 10s heartbeat ticks of grace before exclusion; the 90s
    // onlineScore=0.0 boundary still applies below that.
    if (heartbeatAgeSec >= 120) {
      logger.debug('[dispatch] driver filtered — heartbeat stale beyond 120s (socket may be alive but app dead)', {
        driverId: d.id,
        heartbeatAgeSec: Math.round(heartbeatAgeSec),
      });
      continue;
    }

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

    // ── Lever 2: cold-drop rank boost (decaying, never below 1) ────────
    // ── Lever 3: return-lead affinity (pickup zone == recent cold drop) ─
    const cold = coldDropInfos.get(d.id);
    if (cold) {
      score *= cold.boostMultiplier;
      if (zoneId && cold.zoneId === zoneId) {
        score *= returnLeadAffinityMultiplier;
      }
    }

    // ── New-driver protection tier flag (§6): within priority days AND
    // leads-consumed < N. Tier is applied at the final sort, score order is
    // preserved within tiers. ─────────────────────────────────────────────
    let protectedTier = false;
    if (newDriverPriorityLeads > 0 && d.created_at) {
      const ageDays = (nowMs - new Date(d.created_at).getTime()) / 86_400_000;
      const leadsConsumed = leadsConsumedMap.get(d.id) ?? 0;
      protectedTier = ageDays < newDriverPriorityDays && leadsConsumed < newDriverPriorityLeads;
    }

    logger.debug('[dispatch] driver scored', {
      driverId: d.id, distKm: distKm.toFixed(2),
      distanceScore: distanceScore.toFixed(3),
      ratingScore: ratingScore.toFixed(3),
      acceptanceScore: acceptanceScore.toFixed(3),
      balanceScore: balanceScore.toFixed(3),
      onlineScore: onlineScore.toFixed(3),
      total: score.toFixed(4),
      autoAcceptEligible,
      protectedTier,
    });
    scored.push({
      driverId: d.id,
      score,
      auto_accept_eligible: autoAcceptEligible,
      protected_tier: protectedTier,
    });
  }

  logger.info('[dispatch] scoring complete', {
    rideId,
    scored: scored.length,
    topScore: scored[0]?.score.toFixed(4) ?? 'none',
  });

  // Ordering composition: protected new-driver tier sorts ahead of
  // unprotected (score order preserved within tiers — Array.sort is stable),
  // then stable sort by score desc.
  scored.sort((a, b) => (Number(b.protected_tier) - Number(a.protected_tier)) || (b.score - a.score));

  // Return full ordered list — the sequential pipeline consumes one at a time
  return scored.map(({ driverId, score, auto_accept_eligible }) => ({
    driverId,
    score,
    auto_accept_eligible,
  }));
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
