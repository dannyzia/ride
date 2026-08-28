/**
 * Ride Fare Framework v1 — pickup fee pure math (plan §7 Phase F).
 *
 * Pure module: NO DB imports. All money values are INTEGER PAISA (AGENTS.md);
 * divide by 100 only at UI display. Rate multipliers are LOCKED constants
 * (Stage 3) and are never exposed to drivers — the display basis is absolute
 * ৳/km per category.
 */

import type { PickupCategory } from './vehicleTypes';

// Re-exported for convenience so consumers have one import point.
export { haversineKm } from './hotspots';

/** LOCKED (Stage 3): pickup ৳/km = trip per-km rate × category multiplier. */
export const PICKUP_RATE_MULTIPLIER: Record<PickupCategory, number> = {
  bike: 0.75,
  cng: 0.80,
  car: 0.90,
};

/**
 * Chargeable pickup km: everything beyond the category's free radius.
 * Inside the free radius → 0 (no chargeable distance, no fee).
 */
export function computeFeeKm(km: number, freeRadiusKm: number): number {
  return Math.max(0, km - freeRadiusKm);
}

/**
 * Pickup fee in integer paisa: rate × min(chargeableKm, capBillableKm).
 * The cap basis is km, not BDT (Stage 2 lock) — cap_billable_km = 2.0.
 */
export function pickupFeePaisa(
  chargeableKm: number,
  ratePerKmPaisa: number,
  capBillableKm: number,
): number {
  return Math.round(ratePerKmPaisa * Math.min(chargeableKm, capBillableKm));
}

/**
 * %-of-fare backstop (rarely binding, backstop only — not a second active
 * cap): fee = min(fee, round(fareBeforePickup × capPct / 100)).
 */
export function applyBackstop(
  feePaisa: number,
  fareBeforePickupPaisa: number,
  capPct: number,
): number {
  return Math.min(feePaisa, Math.round((fareBeforePickupPaisa * capPct) / 100));
}

/**
 * Pickup ৳/km rate for a category, in integer paisa:
 * round(trip per-km rate × locked multiplier). The multiplier itself is
 * NEVER exposed to drivers (Stage 3 — display basis is absolute ৳/km).
 */
export function ratePerKmPaisa(perKmBdt: number, category: PickupCategory): number {
  return Math.round(perKmBdt * PICKUP_RATE_MULTIPLIER[category]);
}

// ══════════════════════════════════════════════════════════════════════
// Fare Framework v6 — Pickup fee (PATCH 3: pinned cap sequence)
// ══════════════════════════════════════════════════════════════════════

/**
 * v6 pickup fee — flat 1.0× (no category multiplier), two dimensions.
 *
 * Pinned formula (PATCH 3 — non-negotiable ordering):
 *
 *   billable_km = min(max(0, pickup_km − free_radius_km), cap_billable_km)
 *   billable_min = max(0, pickup_min − free_pickup_min)
 *   uncapped_fee = billable_km × km_rate + billable_min × time_rate
 *   pickup_fee = min(uncapped_fee, round(fare_before_pickup × cap_pct / 100))
 *
 * Critical ordering constraints:
 *   1. km cap applies to distance component ONLY — time is NEVER dropped
 *   2. %-backstop applies to the WHOLE fee (km + time)
 *   3. min() at outer level = backstop is final ceiling
 *
 * All values integer paisa. km_rate and time_rate are the trip rates
 * (not modified — flat 1.0× basis).
 */
export function pickupFeeV6(p: {
  pickupKm: number;
  pickupMin: number;
  freeRadiusKm: number;
  freePickupMin: number;
  kmRate: number; // paisa/km — trip km_rate, flat 1.0×
  timeRate: number; // paisa/min — trip time_rate, flat 1.0×
  capBillableKm: number;
  capPct: number; // percent of fare_before_pickup, e.g. 25
  fareBeforePickup: number; // paisa
}): number {
  const billableKm = Math.min(
    Math.max(0, p.pickupKm - p.freeRadiusKm),
    p.capBillableKm,
  );
  const billableMin = Math.max(0, p.pickupMin - p.freePickupMin);

  // Distance term: km cap on distance ONLY — time never dropped
  const distanceFee = Math.round(p.kmRate * billableKm);
  // Time term: no dedicated cap beyond free allowance
  const timeFee = Math.round(p.timeRate * billableMin);

  // Whole fee = distance + time
  const uncappedFee = distanceFee + timeFee;

  // Single %-backstop on the whole fee (PATCH 3: not just distance)
  const backstopLimit = Math.round((p.fareBeforePickup * p.capPct) / 100);

  return Math.min(uncappedFee, backstopLimit);
}

/**
 * Reference distance over the sorted candidate-pool distances at the given
 * quantile (linear interpolation). Empty pool → 0. Used for the rider quote
 * p75 reference (§3a/§6 — passive lookup, NOT a paid broadcast).
 */
export function referenceKm(poolSortedKm: number[], quantile: number): number {
  if (poolSortedKm.length === 0) return 0;
  const q = Math.min(Math.max(quantile, 0), 1);
  const idx = q * (poolSortedKm.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return poolSortedKm[lo];
  const frac = idx - lo;
  return poolSortedKm[lo] + (poolSortedKm[hi] - poolSortedKm[lo]) * frac;
}

/**
 * Final true-up (§3b): downward adjustments are uncapped (rider-favorable);
 * upward adjustments are capped at round(feeFirm × capMultiplier)
 * (locked 1.25×). realized = 0 → final fee 0, not firm.
 *
 * Pure: the `low_confidence_never_bills_above_firm_quote` invariant (Stage 3)
 * is enforced by the guard helper below (`finalPickupFeePaisa`) — the COMPLETE
 * step (quote state 3) must call that helper, never trueUpFinal directly.
 */
export function trueUpFinal(
  feeFirm: number,
  feeFromRealized: number,
  capMultiplier: number,
): number {
  if (feeFromRealized > feeFirm) {
    return Math.min(feeFromRealized, Math.round(feeFirm * capMultiplier));
  }
  return feeFromRealized;
}

export interface FinalPickupFeeInput {
  feeFirm: number;
  feeFromRealized: number;
  confidence: number;
  minConfidence: number;
  capMultiplier: number;
}

/**
 * Guard helper for the COMPLETE step (quote state 3, Wave 3): applies the
 * Stage 3 protected invariant `low_confidence_never_bills_above_firm_quote`.
 *
 * confidence < minConfidence → the fee is FROZEN at feeFirm exactly — never
 * above it, never below it, regardless of what the realized trace computes
 * to (even a would-be downward adjustment). Otherwise → trueUpFinal.
 */
export function finalPickupFeePaisa({
  feeFirm,
  feeFromRealized,
  confidence,
  minConfidence,
  capMultiplier,
}: FinalPickupFeeInput): number {
  if (confidence < minConfidence) {
    return feeFirm;
  }
  return trueUpFinal(feeFirm, feeFromRealized, capMultiplier);
}
