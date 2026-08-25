/**
 * Firm pickup quote at accept — FARE FRAMEWORK Phase F, quote state 2.
 *
 * Pure decision module (no DB, no network): utils-server/index.ts gathers the
 * IO (config, live driver fix, zone rate, road-network route km) and this
 * module decides the figures. Money is INTEGER PAISA throughout.
 *
 * Confidence rules (ruling 11 + task spec):
 *  - driver fix missing OR stale > 60 s → low confidence
 *  - road-network route unavailable (null) → low confidence
 *  - low confidence → firm fee = quoted range high (pickup_fee_high_bdt)
 *    when present, else the haversine × 1.4 estimate fee; km = estimate
 *  - gated by pickup_measurement_enabled only (ruling 16 — measurement is
 *    decoupled from charging; the completion step decides whether to charge)
 */

import {
  applyBackstop,
  computeFeeKm,
  pickupFeePaisa,
} from '../lib/pickupFee';
import { haversineKm } from '../lib/fareCalc';
import type { TracePoint } from './trace';
import { DRIVER_FIX_STALE_MS } from './trace';

/** Ruling 5: the estimate fallback for road distance is haversine × 1.4. */
export const ESTIMATE_ROAD_FACTOR = 1.4;

export interface FirmQuoteInput {
  /** Measurement layer switch (default true). false → skip entirely. */
  measurementEnabled: boolean;
  /** Charge switch — NOT a gate here, only reported back for payload gating. */
  feeEnabled: boolean;
  /** Live last-known driver fix (ring buffer) or DB fallback; null = none. */
  driverFix: TracePoint | null;
  nowMs: number;
  pickupLat: number;
  pickupLng: number;
  /** Quoted range high from request (null in Stage 0 / fee-off rides). */
  quotedHighPaisa: number | null;
  /** Category free radius km (config; 0 = unset). */
  freeRadiusKm: number;
  /** Category cap billable km (locked 2.0). */
  capBillableKm: number;
  /** Category-adjusted pickup ৳/km rate in integer paisa. */
  ratePerKmPaisa: number;
  /** %-of-fare backstop (locked 40). */
  capPct: number;
  /** Request-time trip fare in integer paisa (ruling 18 basis). */
  tripFareAtRequestPaisa: number;
  /** Road-network km from Barikoi (null = call failed or was not attempted). */
  routeKm: number | null;
}

export interface FirmQuoteResult {
  /** true → measurement off; persist nothing. */
  skipped: boolean;
  lowConfidence: boolean;
  /** km the fee was computed on (route km, or the estimate fallback). */
  firmKm: number;
  /** Firm fee in integer paisa — persisted even in Stage 0 (ruling 16). */
  firmFeePaisa: number;
  /** Best-known driver accept position; null when no fix exists at all. */
  acceptLat: number | null;
  acceptLng: number | null;
}

/**
 * Compute the firm pickup fee figures. Pure — the caller persists
 * pickup_fee_state='firm', pickup_fee_firm_bdt, pickup_firm_km and
 * pickup_accept_lat/lng on the ride.
 */
export function computeFirmQuote(input: FirmQuoteInput): FirmQuoteResult {
  if (!input.measurementEnabled) {
    return {
      skipped: true,
      lowConfidence: true,
      firmKm: 0,
      firmFeePaisa: 0,
      acceptLat: null,
      acceptLng: null,
    };
  }

  const fix = input.driverFix;
  const fixPresent = fix != null;
  const fixFresh = fixPresent && input.nowMs - fix!.at <= DRIVER_FIX_STALE_MS;

  const estimateKm = fix
    ? haversineKm(fix.lat, fix.lng, input.pickupLat, input.pickupLng) *
      ESTIMATE_ROAD_FACTOR
    : 0;

  const feeForKm = (km: number): number =>
    applyBackstop(
      pickupFeePaisa(computeFeeKm(km, input.freeRadiusKm), input.ratePerKmPaisa, input.capBillableKm),
      input.tripFareAtRequestPaisa,
      input.capPct,
    );

  let lowConfidence: boolean;
  let firmKm: number;
  let firmFeePaisa: number;

  if (!fixPresent || !fixFresh || input.routeKm == null) {
    // Low confidence (ruling 11): fee = quoted range high when a range was
    // quoted, else the haversine × 1.4 estimate fee. km = the estimate.
    lowConfidence = true;
    firmKm = estimateKm;
    firmFeePaisa =
      input.quotedHighPaisa != null ? input.quotedHighPaisa : feeForKm(estimateKm);
  } else {
    lowConfidence = false;
    firmKm = input.routeKm;
    firmFeePaisa = feeForKm(input.routeKm);
  }

  return {
    skipped: false,
    lowConfidence,
    firmKm,
    firmFeePaisa,
    acceptLat: fix ? fix.lat : null,
    acceptLng: fix ? fix.lng : null,
  };
}
