import { logger } from "./logger";
import { percentOf } from "./money";

export interface PricingRow {
  base_fare_bdt: number;
  per_km_bdt: number;
  intercity_per_km_bdt?: number;
  per_min_bdt: number;
  floor_length_km: number;
  floor_min: number;
  brta_fare_ceiling_bdt?: number | null;
  platform_commission_percent?: number | null;
}

export interface PlatformCeilings {
  brta_max_base_bdt: number;
  brta_max_per_km_bdt: number;
  brta_max_per_min_bdt: number;
}

export interface FareBreakdown {
  base_fare_bdt: number;
  distance_charge_bdt: number;
  inside_charge_bdt: number;
  outside_charge_bdt: number;
  time_charge_bdt: number;
  floor_fare_bdt: number;
  total_bdt: number;
  platform_commission_percent: number;
  platform_commission_bdt: number;
  driver_net_bdt: number;
  distance_km: number;
  origin_city: string | null;
  is_intercity: boolean;
  inside_km: number;
  outside_km: number;
  ride_time_min: number;
  wait_fee_bdt: number;
  cancellation_fee_bdt?: number;
  pass_discount_bdt?: number;
  pass_name?: string;
}

/**
 * Calculate fare using the extended v2 formula with intercity split-rate:
 *
 *   effective_outside_rate = intercity_per_km_bdt > 0 ? intercity_per_km_bdt : per_km_bdt
 *   inside_charge  = round(per_km_bdt × inside_km)
 *   outside_charge = round(effective_outside_rate × outside_km)
 *   distance_charge = inside_charge + outside_charge
 *   time_charge      = ride_time_min × per_min_bdt
 *   computed_total   = base_fare_bdt + distance_charge + time_charge
 *   floor_fare       = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
 *   total_fare       = max(computed_total, floor_fare)
 *   platform_fee     = round(total_fare × platform_commission_percent / 100)
 *   driver_net       = total_fare − platform_fee
 *
 * For non-intercity rides: pass outsideKm = 0 (default). The formula collapses to normal v2.
 * For rural-origin rides: pass outsideKm = 0. origin_city and is_intercity are passed as parameters.
 *
 * @param pricing - Pricing row from DB
 * @param insideKm - Distance inside origin city (or total distance for non-intercity)
 * @param rideTimeMin - 0 at estimate time; actual ride_time_min at completion
 * @param ceilings - Optional BRTA ceiling values for warning checks
 * @param outsideKm - Distance outside origin city; 0 for non-intercity rides (default)
 * @param originCity - Name of the origin city, or null for rural pickup
 * @param isIntercity - Whether the ride is intercity (dropoff outside origin city)
 */
export function calculateFare(
  pricing: PricingRow,
  insideKm: number,
  rideTimeMin: number,
  ceilings?: PlatformCeilings,
  outsideKm: number = 0,
  originCity: string | null = null,
  isIntercity: boolean = false,
): FareBreakdown {
  // Intercity rate fallback: if intercity_per_km_bdt = 0, use normal per_km_bdt for outside km
  const intercityRate = pricing.intercity_per_km_bdt ?? 0;
  const effectiveOutsideRate = intercityRate > 0 ? intercityRate : pricing.per_km_bdt;

  // Distance charges (integer paisa, round after each multiplication)
  const insideCharge = Math.round(pricing.per_km_bdt * insideKm);
  const outsideCharge = Math.round(effectiveOutsideRate * outsideKm);
  const distanceCharge = insideCharge + outsideCharge;

  // Time charge (no free-wait subtraction — timer handles that)
  const timeCharge = rideTimeMin * pricing.per_min_bdt;

  // Computed total
  const computedTotal = pricing.base_fare_bdt + distanceCharge + timeCharge;

  // Floor fare
  const floorDistanceCharge = Math.round(
    pricing.per_km_bdt * pricing.floor_length_km,
  );
  const floorTimeCharge = pricing.floor_min * pricing.per_min_bdt;
  const floorFare =
    pricing.base_fare_bdt + floorDistanceCharge + floorTimeCharge;

  // Final fare is the higher of computed and floor
  const totalFare = Math.max(computedTotal, floorFare);

  // Platform commission (percentage of final fare, after floor)
  const commissionPct = pricing.platform_commission_percent ?? 0;
  const platformFee =
    commissionPct > 0 ? percentOf(totalFare, commissionPct) : 0;

  // Driver net
  const driverNet = totalFare - platformFee;

  const totalDistanceKm = insideKm + outsideKm;

  // BRTA ceiling warnings (logged, never block)
  if (ceilings) {
    if (pricing.base_fare_bdt > ceilings.brta_max_base_bdt) {
      logger.warn("[fareCalc] base_fare exceeds BRTA ceiling", {
        value: pricing.base_fare_bdt,
        ceiling: ceilings.brta_max_base_bdt,
      });
    }
    if (pricing.per_km_bdt > ceilings.brta_max_per_km_bdt) {
      logger.warn("[fareCalc] per_km_bdt exceeds BRTA ceiling", {
        value: pricing.per_km_bdt,
        ceiling: ceilings.brta_max_per_km_bdt,
      });
    }
    if (pricing.per_min_bdt > ceilings.brta_max_per_min_bdt) {
      logger.warn("[fareCalc] per_min_bdt exceeds BRTA ceiling", {
        value: pricing.per_min_bdt,
        ceiling: ceilings.brta_max_per_min_bdt,
      });
    }
    if (
      pricing.brta_fare_ceiling_bdt != null &&
      totalFare > pricing.brta_fare_ceiling_bdt
    ) {
      logger.warn("[fareCalc] final fare exceeds per-row BRTA ceiling", {
        totalFare,
        ceiling: pricing.brta_fare_ceiling_bdt,
      });
    }
  }

  return {
    base_fare_bdt: pricing.base_fare_bdt,
    distance_charge_bdt: distanceCharge,
    inside_charge_bdt: insideCharge,
    outside_charge_bdt: outsideCharge,
    time_charge_bdt: timeCharge,
    floor_fare_bdt: floorFare,
    total_bdt: totalFare,
    platform_commission_percent: commissionPct,
    platform_commission_bdt: platformFee,
    driver_net_bdt: driverNet,
    distance_km: totalDistanceKm,
    origin_city: originCity,
    is_intercity: isIntercity,
    inside_km: insideKm,
    outside_km: outsideKm,
    ride_time_min: rideTimeMin,
    wait_fee_bdt: 0,
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return (
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000
  );
}

export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}

// ══════════════════════════════════════════════════════════════════════
// Fare Framework v6 — shadow engine (Stage 0: compute only, never bill)
// ══════════════════════════════════════════════════════════════════════

/**
 * Extended pricing row for v6 — adds base_km and initiation_minutes.
 * Falls back to base_fare_bdt when base_km=0 and initiation_minutes=0
 * (backward compat with rows not yet migrated).
 */
export interface V6PricingRow {
  base_fare_bdt: number;
  base_km: number; // numeric(10,2)
  initiation_minutes: number; // integer, default 4
  per_km_bdt: number;
  intercity_per_km_bdt?: number;
  per_min_bdt: number;
  floor_length_km: number;
  floor_min: number;
  brta_fare_ceiling_bdt?: number | null;
  platform_commission_percent?: number | null;
}

/**
 * v6 fare input — all integer paisa, all rates in paisa-per-unit.
 * night_mult: 1.000 = disabled, e.g. 1.200 = 20% night surcharge.
 * grace_min: from pricing.free_wait_minutes (single source of truth).
 */
export interface V6FareInput {
  pricing: V6PricingRow;
  trip_km: number; // distance_km (total)
  ride_time_min: number; // effectiveRideTimeMin (after wait subtraction)
  night_mult: number; // default 1.000 = disabled
  grace_min: number; // from pricing.free_wait_minutes
  wait_min: number; // chargeable wait minutes (0 at estimate)
  pickup_fee_bdt: number; // 0 in Stage 0
  zone_fee_bdt: number; // 0 in Stage 0
  // Intercity split (same as v2)
  inside_km?: number;
  outside_km?: number;
  origin_city?: string | null;
  is_intercity?: boolean;
}

/**
 * v6 fare breakdown — all terms exposed for transparency.
 * Commission is 0% (subscription-only revenue); commission fields kept for
 * backward compat with FareBreakdown consumers.
 */
export interface V6FareBreakdown {
  // Base fare = base_km × km_rate + initiation_minutes × time_rate × night_mult
  base_km_charge: number;
  initiation_charge: number;
  base_fare_bdt: number;

  // Distance = km_rate × trip_km
  distance_charge_bdt: number;
  inside_charge_bdt: number;
  outside_charge_bdt: number;

  // Time = time_rate × trip_minutes × night_mult
  time_charge_bdt: number;

  // Waiting = waiting_rate × max(0, wait_min − grace_min) × night_mult
  // waiting_rate = time_rate (locked)
  waiting_charge_bdt: number;

  // Add-ons
  pickup_fee_bdt: number;
  zone_fee_bdt: number;

  // Totals
  floor_fare_bdt: number;
  total_bdt: number;

  // Commission (always 0 in v6 — subscription-only revenue)
  platform_commission_percent: number;
  platform_commission_bdt: number;
  driver_net_bdt: number;

  // Metadata
  night_mult_applied: number;
  distance_km: number;
  ride_time_min: number;
  wait_fee_bdt: number; // total waiting fee in paisa (for display compat)
  origin_city: string | null;
  is_intercity: boolean;
  inside_km: number;
  outside_km: number;
}

/**
 * Fare Framework v6 engine — computes fare using the v6 formula.
 *
 * v6 formula:
 *   base_fare = base_km × km_rate + initiation_minutes × time_rate × night_mult
 *   trip_time_charge = time_rate × trip_minutes × night_mult
 *   waiting_charge = time_rate × max(0, wait_min − grace_min) × night_mult
 *   distance_charge = km_rate × trip_km
 *   total = base_fare + distance_charge + trip_time_charge + waiting_charge
 *         + pickup_fee + zone_fee
 *   driver_net = total − commission (0%)
 *
 * night_mult scope (PATCH 2 — applies to ALL time_rate terms):
 *   APPLIES: trip_minutes term, base initiation term, waiting term
 *   NEVER: km_rate, zone_fee, pickup fee distance component
 *
 * @deprecated during Stage 0 — v6 output goes to fare_v6_shadow only.
 * Will become the billed engine at Stage 1 cutover.
 */
export function calculateV6Fare(input: V6FareInput): V6FareBreakdown {
  const p = input.pricing;
  const nm = input.night_mult;
  const kmRate = p.per_km_bdt; // paisa/km
  const timeRate = p.per_min_bdt; // paisa/min
  const waitingRate = timeRate; // locked: same_as_time_rate

  // ── Base fare ──
  // If base_km=0 and initiation_minutes=0, fall back to legacy base_fare_bdt
  // (backward compat with rows not yet migrated)
  const baseKmCharge = Math.round(kmRate * p.base_km);
  const initiationCharge = Math.round(timeRate * p.initiation_minutes * nm);
  const baseFareBdt =
    p.base_km === 0 && p.initiation_minutes === 0
      ? p.base_fare_bdt
      : baseKmCharge + initiationCharge;

  // ── Distance ──
  const intercityRate = p.intercity_per_km_bdt ?? 0;
  const effectiveOutsideRate = intercityRate > 0 ? intercityRate : kmRate;
  const insideKm = input.inside_km ?? input.trip_km;
  const outsideKm = input.outside_km ?? 0;
  const insideCharge = Math.round(kmRate * insideKm);
  const outsideCharge = Math.round(effectiveOutsideRate * outsideKm);
  const distanceCharge = insideCharge + outsideCharge;

  // ── Time (PATCH 2: night_mult on trip_minutes) ──
  const timeCharge = Math.round(timeRate * input.ride_time_min * nm);

  // ── Waiting (PATCH 2: night_mult on waiting too) ──
  const billableWaitMin = Math.max(0, input.wait_min - input.grace_min);
  const waitingCharge = Math.round(waitingRate * billableWaitMin * nm);

  // ── Computed total ──
  const computedTotal =
    baseFareBdt + distanceCharge + timeCharge + waitingCharge +
    input.pickup_fee_bdt + input.zone_fee_bdt;

  // ── Floor fare (same structure as v2, using base_fare_bdt as floor base) ──
  const floorDistanceCharge = Math.round(kmRate * p.floor_length_km);
  const floorTimeCharge = Math.round(timeRate * p.floor_min * nm);
  const floorFare = baseFareBdt + floorDistanceCharge + floorTimeCharge;

  // ── Final fare ──
  const totalFare = Math.max(computedTotal, floorFare);

  // ── Commission (0% in v6 — subscription-only revenue) ──
  const commissionPct = p.platform_commission_percent ?? 0;
  const platformFee =
    commissionPct > 0 ? Math.round((totalFare * commissionPct) / 100) : 0;
  const driverNet = totalFare - platformFee;

  const totalDistanceKm = insideKm + outsideKm;

  return {
    base_km_charge: baseKmCharge,
    initiation_charge: initiationCharge,
    base_fare_bdt: baseFareBdt,
    distance_charge_bdt: distanceCharge,
    inside_charge_bdt: insideCharge,
    outside_charge_bdt: outsideCharge,
    time_charge_bdt: timeCharge,
    waiting_charge_bdt: waitingCharge,
    pickup_fee_bdt: input.pickup_fee_bdt,
    zone_fee_bdt: input.zone_fee_bdt,
    floor_fare_bdt: floorFare,
    total_bdt: totalFare,
    platform_commission_percent: commissionPct,
    platform_commission_bdt: platformFee,
    driver_net_bdt: driverNet,
    night_mult_applied: nm,
    distance_km: totalDistanceKm,
    ride_time_min: input.ride_time_min,
    wait_fee_bdt: waitingCharge,
    origin_city: input.origin_city ?? null,
    is_intercity: input.is_intercity ?? false,
    inside_km: insideKm,
    outside_km: outsideKm,
  };
}

/**
 * Backward-compat alias. During Stage 0, existing callers keep using this.
 * After Stage 1 gate, this function and its FareBreakdown type are removed (R8).
 * @deprecated Use calculateV6Fare for new code.
 */
export const calculateV2Fare = calculateFare;
