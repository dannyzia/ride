/**
 * Firm quote at accept tests (Phase F quote state 2). Pure decision module —
 * all money in INTEGER PAISA.
 */

import { computeFirmQuote, ESTIMATE_ROAD_FACTOR } from "../firmQuote";
import { haversineKm } from "../../lib/fareCalc";

const PICKUP = { lat: 23.0, lng: 90.0 };
const NOW = 1_000_000_000_000;

/** Driver 1 km north of the pickup, fix 5 s old (fresh). */
function freshFix(offsetLat = 0.009) {
  return { lat: PICKUP.lat + offsetLat, lng: PICKUP.lng, at: NOW - 5_000 };
}

function baseInput(overrides: Partial<Parameters<typeof computeFirmQuote>[0]> = {}) {
  return {
    measurementEnabled: true,
    feeEnabled: false,
    driverFix: freshFix(),
    nowMs: NOW,
    pickupLat: PICKUP.lat,
    pickupLng: PICKUP.lng,
    quotedHighPaisa: null,
    freeRadiusKm: 0.5,
    capBillableKm: 2.0,
    ratePerKmPaisa: 1_200, // ৳12/km
    capPct: 40,
    tripFareAtRequestPaisa: 50_000, // ৳500
    routeKm: null,
    ...overrides,
  };
}

describe("computeFirmQuote", () => {
  test("measurement off → skipped entirely (both flags off → skip)", () => {
    const res = computeFirmQuote(baseInput({ measurementEnabled: false, feeEnabled: false }));
    expect(res.skipped).toBe(true);
  });

  test("fee off but measurement on → still computes and persists (ruling 16)", () => {
    const res = computeFirmQuote(baseInput({ feeEnabled: false, routeKm: 3.0 }));
    expect(res.skipped).toBe(false);
    expect(res.lowConfidence).toBe(false);
    // chargeable = 3.0 − 0.5 = 2.5 → capped at 2.0 → 1200 × 2.0 = 2400 paisa;
    // backstop 40% × 50000 = 20000 → not binding.
    expect(res.firmFeePaisa).toBe(2_400);
    expect(res.firmKm).toBe(3.0);
    expect(res.acceptLat).toBeCloseTo(freshFix().lat, 6);
  });

  test("fresh fix + road route → fee from route km with free radius and cap", () => {
    const res = computeFirmQuote(baseInput({ routeKm: 1.5 }));
    expect(res.lowConfidence).toBe(false);
    // chargeable = 1.0 → 1200 × 1.0 = 1200 paisa
    expect(res.firmFeePaisa).toBe(1_200);
  });

  test("%-of-fare backstop binds (ruling 18: request-time fare basis)", () => {
    const res = computeFirmQuote(
      baseInput({ routeKm: 5.0, tripFareAtRequestPaisa: 3_000 }),
    );
    // raw fee = 1200 × 2.0 = 2400; backstop = 40% × 3000 = 1200 → binds
    expect(res.firmFeePaisa).toBe(1_200);
  });

  test("stale fix (> 60 s) → low confidence → fee = quoted range high", () => {
    const stale = { ...freshFix(), at: NOW - 61_000 };
    const res = computeFirmQuote(
      baseInput({ driverFix: stale, quotedHighPaisa: 3_500, routeKm: null }),
    );
    expect(res.lowConfidence).toBe(true);
    expect(res.firmFeePaisa).toBe(3_500);
    // km = haversine × 1.4 estimate from the stale-but-present fix
    const estKm = haversineKm(stale.lat, stale.lng, PICKUP.lat, PICKUP.lng) * ESTIMATE_ROAD_FACTOR;
    expect(res.firmKm).toBeCloseTo(estKm, 8);
    expect(res.acceptLat).toBeCloseTo(stale.lat, 6);
  });

  test("null route (fresh fix) → low confidence → quoted high when present", () => {
    const res = computeFirmQuote(
      baseInput({ routeKm: null, quotedHighPaisa: 9_999 }),
    );
    expect(res.lowConfidence).toBe(true);
    expect(res.firmFeePaisa).toBe(9_999);
  });

  test("null route, no quoted range (Stage 0 fee-off) → haversine×1.4 estimate fee", () => {
    const res = computeFirmQuote(baseInput({ routeKm: null, quotedHighPaisa: null }));
    const estKm =
      haversineKm(freshFix().lat, freshFix().lng, PICKUP.lat, PICKUP.lng) * ESTIMATE_ROAD_FACTOR;
    // fee on estimate km with the same formula incl. backstop
    const chargeable = Math.max(0, estKm - 0.5);
    const expected = Math.min(
      Math.round(1_200 * Math.min(chargeable, 2.0)),
      Math.round(50_000 * 0.4),
    );
    expect(res.lowConfidence).toBe(true);
    expect(res.firmFeePaisa).toBe(expected);
    expect(res.firmKm).toBeCloseTo(estKm, 8);
  });

  test("missing fix entirely → low confidence, km 0, fee = quoted high or 0", () => {
    const withHigh = computeFirmQuote(
      baseInput({ driverFix: null, quotedHighPaisa: 2_000 }),
    );
    expect(withHigh.lowConfidence).toBe(true);
    expect(withHigh.firmFeePaisa).toBe(2_000);
    expect(withHigh.firmKm).toBe(0);
    expect(withHigh.acceptLat).toBeNull();
    expect(withHigh.acceptLng).toBeNull();

    const noHigh = computeFirmQuote(
      baseInput({ driverFix: null, quotedHighPaisa: null }),
    );
    expect(noHigh.firmFeePaisa).toBe(0);
  });

  test("fix exactly 60 s old is still fresh (boundary)", () => {
    const res = computeFirmQuote(
      baseInput({ driverFix: { ...freshFix(), at: NOW - 60_000 }, routeKm: 2.0 }),
    );
    expect(res.lowConfidence).toBe(false);
    // chargeable = 1.5 → 1800
    expect(res.firmFeePaisa).toBe(1_800);
  });
});
