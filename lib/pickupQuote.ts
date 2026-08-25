/**
 * Ride Fare Framework v1 — rider-visible pickup fee RANGE at
 * estimate/request (plan §7 Phase F, quote state 1).
 *
 * DB-touching module used by estimate + request. Candidate pool mirrors
 * app/api/ride/nearby-drivers+api.ts EXACTLY (same filters, dispatch ring K)
 * but returns the nearest N driver positions for the p75 reference quote
 * (§3a/§6 — passive distance lookup, NOT a paid broadcast).
 *
 * Route-call budget (ruling 5): AT MOST 2 route calls per quote — nearest
 * driver position + p75-reference driver position. The multi-vehicle
 * estimate path passes haversineOnly: true (0 route calls, ×1.4 distances).
 *
 * All money values are INTEGER PAISA (AGENTS.md).
 */

import { db } from '@/src/db';
import { drivers, pricing } from '@/src/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getH3Ring } from './h3';
import {
  parseConfigBool,
  parseConfigCsv,
  parseConfigNumber,
} from './fareFrameworkConfig';
import {
  applyBackstop,
  computeFeeKm,
  haversineKm,
  pickupFeePaisa,
  ratePerKmPaisa,
  referenceKm,
} from './pickupFee';
import { getRouteDistance } from './barikoi';
import { PICKUP_CATEGORY, type VehicleTypeEnum } from './vehicleTypes';

/**
 * Dispatch ring K — deliberately the same constant utils-server/dispatch.ts
 * uses (DISPATCH_H3_RING_K, default 60) so the quote pool sees exactly the
 * drivers the dispatch pool can find. Index-backed by drivers_h3_cell_idx.
 */
const QUOTE_RING_K = parseInt(process.env.DISPATCH_H3_RING_K ?? '60', 10);

/** Routing-failure distance factor (ruling 5 / Stage 3 Problem B). */
const ROUTE_FAILURE_FACTOR = 1.4;

/** Low-confidence range widening: low −10%, high +25%, clamped ≥ 0. */
function widenRange(low: number, high: number): { low: number; high: number } {
  return {
    low: Math.max(0, Math.round(low * 0.9)),
    high: Math.max(0, Math.round(high * 1.25)),
  };
}

/** Config keys pickupQuoteRange reads — pass getFareFrameworkConfig(keys). */
export const PICKUP_QUOTE_CONFIG_KEYS = [
  'pickup_fee_enabled',
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',
  'pickup_cap_billable_km_bike',
  'pickup_cap_billable_km_cng',
  'pickup_cap_billable_km_car',
  'pickup_cap_pct_of_fare',
  'pickup_reference_pool_size',
  'pickup_reference_quantile',
  'pickup_no_driver_fallback_km',
  'pickup_low_confidence_zone_ids',
] as const;

export type PickupQuoteConfig = Record<(typeof PICKUP_QUOTE_CONFIG_KEYS)[number], string>;

export interface PickupQuoteRangeInput {
  zoneId: string;
  vehicleType: VehicleTypeEnum;
  pickupLat: number;
  pickupLng: number;
  /** Trip fare BEFORE pickup fee, integer paisa (backstop basis). */
  fareBeforePickupPaisa: number;
  cfg: PickupQuoteConfig;
  /**
   * Multi-vehicle estimate path: distances via haversine × 1.4 ONLY
   * (0 route calls — ruling 5 cost bound holds literally).
   */
  haversineOnly?: boolean;
}

export interface PickupQuoteRange {
  lowPaisa: number;
  highPaisa: number;
  lowConfidence: boolean;
}

interface PoolDriver {
  lat: number;
  lng: number;
  km: number;
}

/**
 * Road distance driver-position → pickup pin. Routing failure (throw or
 * haversine_fallback provider) → haversine × 1.4 for that position and the
 * caller widens the range + flags low-confidence (ruling 5).
 */
async function routePositionKm(
  driverLat: number,
  driverLng: number,
  pickupLat: number,
  pickupLng: number,
): Promise<{ km: number; routingFailed: boolean }> {
  try {
    const r = await getRouteDistance(driverLat, driverLng, pickupLat, pickupLng);
    if (r && r.provider !== 'haversine_fallback') {
      return { km: r.distanceKm, routingFailed: false };
    }
  } catch {
    // fall through to the haversine × 1.4 fallback
  }
  return {
    km: haversineKm(driverLat, driverLng, pickupLat, pickupLng) * ROUTE_FAILURE_FACTOR,
    routingFailed: true,
  };
}

/**
 * Rider-visible pickup fee range. Returns null when the feature is off for
 * this vehicle's category (fee disabled, or free radius unset/0 — Stage 0
 * default), or when no active zone pricing row exists (no rate to compute
 * against). Callers MUST treat the range as ADVISORY: totals exclude it.
 */
export async function pickupQuoteRange(
  input: PickupQuoteRangeInput,
): Promise<PickupQuoteRange | null> {
  const category = PICKUP_CATEGORY[input.vehicleType];
  const freeRadiusKm = parseConfigNumber(
    input.cfg[`pickup_free_radius_km_${category}`],
    0,
  );
  if (!parseConfigBool(input.cfg.pickup_fee_enabled) || freeRadiusKm <= 0) {
    return null;
  }

  // Zone pricing per_km_bdt (integer paisa) — same table the fare calc
  // resolves for (zone, vehicleType) in estimate/request.
  const [pricingRow] = await db
    .select({ per_km_bdt: pricing.per_km_bdt })
    .from(pricing)
    .where(
      and(
        eq(pricing.vehicle_type, input.vehicleType as any),
        eq(pricing.zone_id, input.zoneId),
        eq(pricing.is_active, true),
      ),
    )
    .limit(1);
  if (!pricingRow) return null;

  const ratePaisa = ratePerKmPaisa(pricingRow.per_km_bdt, category);
  const capKm = parseConfigNumber(
    input.cfg[`pickup_cap_billable_km_${category}`],
    2.0,
  );
  const capPct = parseConfigNumber(input.cfg.pickup_cap_pct_of_fare, 40);
  const poolSize = Math.max(1, Math.floor(parseConfigNumber(input.cfg.pickup_reference_pool_size, 5)));
  const quantile = parseConfigNumber(input.cfg.pickup_reference_quantile, 0.75);
  const fallbackKm = parseConfigNumber(input.cfg.pickup_no_driver_fallback_km, 3.0);

  const feeFor = (km: number): number =>
    applyBackstop(
      pickupFeePaisa(computeFeeKm(km, freeRadiusKm), ratePaisa, capKm),
      input.fareBeforePickupPaisa,
      capPct,
    );

  // Candidate pool — mirrors nearby-drivers+api.ts EXACTLY (same filters:
  // is_online, status='active', vehicle_type match, h3_cell_res9 ring via
  // lib/h3 getH3Ring with the DISPATCH ring K, busy NOT-EXISTS including
  // 'driver_arriving': en route to pickup is busy).
  const cells = getH3Ring(input.pickupLat, input.pickupLng, QUOTE_RING_K);
  const rows = await db
    .select({ id: drivers.id, lat: drivers.last_location_lat, lng: drivers.last_location_lng })
    .from(drivers)
    .where(
      and(
        eq(drivers.is_online, true),
        eq(drivers.status, 'active'),
        eq(drivers.vehicle_type, input.vehicleType as any),
        inArray(drivers.h3_cell_res9, cells),
        sql`NOT EXISTS (SELECT 1 FROM rides WHERE rides.driver_id = drivers.id AND rides.status IN ('matched','driver_arriving','driver_arrived','in_progress') AND rides.updated_at > now() - interval '3 hours')`,
      ),
    );

  const pool: PoolDriver[] = rows
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => {
      const lat = Number(r.lat);
      const lng = Number(r.lng);
      return { lat, lng, km: haversineKm(lat, lng, input.pickupLat, input.pickupLng) };
    })
    .sort((a, b) => a.km - b.km)
    .slice(0, poolSize);

  let lowKm: number;
  let highKm: number;
  let routingFailed = false;
  let zeroPool = false;

  if (pool.length === 0) {
    // Zero pool → fallback distance, low-confidence flag (no widening —
    // the fallback distance IS the estimate for both ends).
    zeroPool = true;
    lowKm = fallbackKm;
    highKm = fallbackKm;
  } else if (input.haversineOnly) {
    // Multi-vehicle estimate path: haversine × 1.4 exclusively (ruling 5).
    lowKm = pool[0].km * ROUTE_FAILURE_FACTOR;
    highKm = referenceKm(pool.map((p) => p.km), quantile) * ROUTE_FAILURE_FACTOR;
  } else {
    // Ruling 5 budget: route the NEAREST position and the p75-REFERENCE
    // position only. The reference driver is the pool member at-or-above
    // the quantile index (ceil of q×(n−1)); with n=5, q=0.75 that is
    // exactly the 4th-nearest driver.
    const nearest = pool[0];
    const refIdx = Math.min(
      Math.ceil(quantile * (pool.length - 1)),
      pool.length - 1,
    );
    const near = await routePositionKm(nearest.lat, nearest.lng, input.pickupLat, input.pickupLng);
    routingFailed = near.routingFailed;
    lowKm = near.km;

    if (refIdx === 0) {
      // Single-driver pool: nearest IS the reference — one route call total.
      highKm = near.km;
    } else {
      const ref = pool[refIdx];
      const refRoute = await routePositionKm(ref.lat, ref.lng, input.pickupLat, input.pickupLng);
      routingFailed = routingFailed || refRoute.routingFailed;
      highKm = refRoute.km;
    }
  }

  // Zone-listed low confidence (recalibration queue writes this CSV).
  const zoneListed = parseConfigCsv(input.cfg.pickup_low_confidence_zone_ids).includes(
    input.zoneId,
  );

  let lowPaisa = feeFor(lowKm);
  let highPaisa = feeFor(Math.max(highKm, lowKm));
  if (routingFailed || zoneListed) {
    const widened = widenRange(lowPaisa, highPaisa);
    lowPaisa = widened.low;
    highPaisa = widened.high;
  }

  return {
    lowPaisa,
    highPaisa: Math.max(lowPaisa, highPaisa),
    lowConfidence: zeroPool || routingFailed || zoneListed,
  };
}
