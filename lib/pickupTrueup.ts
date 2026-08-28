/**
 * Ride Fare Framework v1 — pickup fee TRUE-UP + charge at completion
 * (plan §7 Phase F, quote state 3).
 *
 * Pure orchestration helper (no DB) used by
 * app/api/ride/[id]/complete+api.ts. All money values are INTEGER PAISA
 * (AGENTS.md).
 *
 * Rulings applied:
 * - 1/14: the pickup fee is driver compensation, NOT platform revenue —
 *   the caller adds `finalFeeBdt` to the receipt/driver/rider totals but
 *   NEVER to the commission base or the recordRideCompletion input.
 * - 16: fee off (Stage 0) → charge NOTHING; the caller still persists the
 *   'trued' state transition. Realized km/confidence were already persisted
 *   on the ride row by utils-server at ride-start.
 * - 18: the %-of-fare backstop is re-checked against the
 *   completion-recalculated trip fare (actual time).
 * - Stage 3 invariant (low_confidence_never_bills_above_firm_quote): low
 *   confidence freezes the fee AT firm — enforced by finalPickupFeePaisa
 *   (never call trueUpFinal directly from the completion step).
 */

import {
  applyBackstop,
  computeFeeKm,
  finalPickupFeePaisa,
  pickupFeePaisa,
  ratePerKmPaisa,
} from './pickupFee';
import type { PickupCategory } from './vehicleTypes';

/** Config keys the completion true-up reads — pass to getFareFrameworkConfig. */
export const PICKUP_TRUEUP_CONFIG_KEYS = [
  'pickup_fee_enabled',
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',
  'pickup_cap_billable_km_bike',
  'pickup_cap_billable_km_cng',
  'pickup_cap_billable_km_car',
  'pickup_cap_pct_of_fare',
  'pickup_origin_confidence_min',
  'pickup_trueup_cap_multiplier',
] as const;

export type PickupTrueupConfigKey = (typeof PICKUP_TRUEUP_CONFIG_KEYS)[number];

/** Raw rides-row pickup columns (Drizzle numerics arrive as strings). */
export interface PickupTrueupRideColumns {
  pickup_fee_state: string | null;
  pickup_fee_firm_bdt: number | null;
  pickup_firm_km: string | null;
  pickup_realized_km: string | null;
  pickup_realized_confidence: string | null;
}

export interface PickupTrueupContext {
  feeEnabled: boolean;
  freeRadiusKm: number;
  capBillableKm: number;
  backstopPct: number;
  minConfidence: number;
  capMultiplier: number;
  /** Zone per-km trip rate in paisa — the ride's pricing row (zone+vehicle). */
  zonePerKmBdt: number;
  category: PickupCategory;
  /** Completion-recalculated trip fare in paisa (ruling 18 backstop basis). */
  recalculatedTripFareBdt: number;
}

export interface PickupTrueupResult {
  /** State was 'firm' → the caller persists the one-time 'trued' transition. */
  applies: boolean;
  /** firm_km exists → the caller inserts a pickup_distance_samples row. */
  insertSample: boolean;
  /** Final fee in paisa; null when nothing is charged (fee off / no firm fee). */
  finalFeeBdt: number | null;
  /** final − firm; null when not charging. */
  deltaBdt: number | null;
  firmKm: number | null;
  realizedKm: number | null;
  /** Whether the km cap was binding on the realized fee. */
  capWasBinding: boolean;
  /** Whether the %-of-fare backstop was binding on the realized fee. */
  backstopWasBinding: boolean;
}

function parseNumericOrNull(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function computePickupTrueup(
  ridePickup: PickupTrueupRideColumns,
  ctx: PickupTrueupContext,
): PickupTrueupResult {
  const firmKm = parseNumericOrNull(ridePickup.pickup_firm_km);
  const realizedKm = parseNumericOrNull(ridePickup.pickup_realized_km);

  // 'trued' = safety no-op (completion is TOCTOU-guarded to run once);
  // null/'range' = the feature never armed for this ride.
  if (ridePickup.pickup_fee_state !== 'firm') {
    return {
      applies: false,
      insertSample: false,
      finalFeeBdt: null,
      deltaBdt: null,
      firmKm,
      realizedKm,
      capWasBinding: false,
      backstopWasBinding: false,
    };
  }

  const result: PickupTrueupResult = {
    applies: true,
    insertSample: firmKm != null,
    finalFeeBdt: null,
    deltaBdt: null,
    firmKm,
    realizedKm,
    capWasBinding: false,
    backstopWasBinding: false,
  };

  const feeFirm = ridePickup.pickup_fee_firm_bdt;

  // Ruling 16: fee disabled (Stage 0) → charge nothing (final stays null).
  // Defensive: a 'firm' state without a firm fee also charges nothing.
  if (!ctx.feeEnabled || feeFirm == null) {
    return result;
  }

  let finalFee: number;
  if (realizedKm == null) {
    // No realized trace → freeze at firm.
    finalFee = feeFirm;
  } else {
    // Missing confidence → 0 (low) → the guard freezes at firm.
    const confidence =
      parseNumericOrNull(ridePickup.pickup_realized_confidence) ?? 0;
    const chargeableKm = computeFeeKm(realizedKm, ctx.freeRadiusKm);
    const ratePaisa = ratePerKmPaisa(ctx.zonePerKmBdt, ctx.category);
    const uncappedFee = pickupFeePaisa(chargeableKm, ratePaisa, ctx.capBillableKm);
    // Cap binding: the km cap reduced the fee (chargeableKm > capBillableKm).
    result.capWasBinding = chargeableKm > ctx.capBillableKm;
    // Ruling 18: backstop re-checked against the completion-recalculated
    // trip fare (actual time), not the request-time quote.
    const backstopLimit = Math.round((ctx.recalculatedTripFareBdt * ctx.backstopPct) / 100);
    const feeFromRealized = applyBackstop(uncappedFee, ctx.recalculatedTripFareBdt, ctx.backstopPct);
    // Backstop binding: the %-of-fare backstop reduced the fee.
    result.backstopWasBinding = uncappedFee > backstopLimit;
    finalFee = finalPickupFeePaisa({
      feeFirm,
      feeFromRealized,
      confidence,
      minConfidence: ctx.minConfidence,
      capMultiplier: ctx.capMultiplier,
    });
  }

  result.finalFeeBdt = finalFee;
  result.deltaBdt = finalFee - feeFirm;
  return result;
}
