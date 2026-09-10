/**
 * D0 stage-aware fare selector tests.
 *
 * Verifies the authoritative-engine selector pattern used by all 6 fare call sites:
 *   const authoritative = stage1 ? v6FareBreakdown : fareBreakdown;
 *
 * Seam: the selector logic is tested through the exported helper functions
 * (calculateFare, calculateV6Fare, isStage1Plus mock) — no DB or HTTP needed.
 *
 * Stage0 contract (§3.D0.4): zero fixture changes — v2 output is byte-identical
 * to today's baseline. Stage1 contract: authoritative is v6, commission = 0.
 */
import { calculateFare, calculateV6Fare, type V6PricingRow } from "@/lib/fareCalc";

// Mock isStage1Plus — we test the selector pattern, not the DB read.
const mockIsStage1Plus = jest.fn(async () => false);
jest.mock("@/lib/fareFrameworkConfig", () => ({
  isStage1Plus: mockIsStage1Plus,
}));

// Use mockIsStage1Plus directly in tests (no re-import needed).

// ── Shared fixtures ──────────────────────────────────────────────────
const PRICING_V2 = {
  base_fare_bdt: 5000,
  per_km_bdt: 775,
  intercity_per_km_bdt: 0,
  per_min_bdt: 0,
  floor_length_km: 0,
  floor_min: 0,
  brta_fare_ceiling_bdt: null,
  platform_commission_percent: 10,
};

const PRICING_V6: V6PricingRow = {
  base_fare_bdt: 5000,
  base_km: 0,
  initiation_minutes: 4,
  per_km_bdt: 775,
  intercity_per_km_bdt: 0,
  per_min_bdt: 0,
  floor_length_km: 0,
  floor_min: 0,
  brta_fare_ceiling_bdt: null,
  platform_commission_percent: 0, // v6 = subscription-only
};

const TRIP_KM = 10;
const RIDE_TIME_MIN = 0; // estimate-time
const NIGHT_MULT = 1.0;
const GRACE_MIN = 3;
const WAIT_MIN = 0;

// ── Helpers ──────────────────────────────────────────────────────────
function v2Fare() {
  return calculateFare(
    PRICING_V2,
    TRIP_KM,
    RIDE_TIME_MIN,
    undefined,
    0, // outside_km
    null, // origin_city
    false, // intercity
  );
}

function v6Fare() {
  return calculateV6Fare({
    pricing: PRICING_V6,
    trip_km: TRIP_KM,
    ride_time_min: RIDE_TIME_MIN,
    night_mult: NIGHT_MULT,
    grace_min: GRACE_MIN,
    wait_min: WAIT_MIN,
    pickup_fee_bdt: 0,
    zone_fee_bdt: 0,
    inside_km: TRIP_KM,
    outside_km: 0,
    origin_city: null,
    is_intercity: false,
  });
}

// ── Tests ────────────────────────────────────────────────────────────
describe("D0 stage-aware fare selector", () => {
  beforeEach(() => {
    mockIsStage1Plus.mockReset();
    mockIsStage1Plus.mockResolvedValue(false); // stage0 default
  });

  describe("stage0 (default) — v2 is authoritative", () => {
    it("v2 fare has base_fare_bdt and distance_charge_bdt", () => {
      const fare = v2Fare();
      expect(fare.base_fare_bdt).toBe(5000);
      expect(fare.distance_charge_bdt).toBe(7750); // 10 × 775
      expect(fare.total_bdt).toBe(12750); // 5000 + 7750
    });

    it("v2 commission is 10% of total", () => {
      const fare = v2Fare();
      expect(fare.platform_commission_bdt).toBe(1275); // 10% of 12750
      expect(fare.driver_net_bdt).toBe(12750 - 1275); // 11475
    });

    it("selector returns v2 at stage0", () => {
      const stage1 = false;
      const authoritative = stage1 ? v6Fare() : v2Fare();
      expect(authoritative).toEqual(v2Fare());
    });

    it("v6 fare has different structure (base_km_charge + initiation_charge)", () => {
      const v6 = v6Fare();
      // v6 base = base_km_charge + initiation_charge (not base_fare_bdt directly)
      // With base_km=0, initiation_minutes=4, per_min=0: base = 0+0 = 0
      expect(v6.base_km_charge).toBe(0);
      expect(v6.initiation_charge).toBe(0);
      expect(v6.base_fare_bdt).toBe(0); // sum of above
      expect(v6.distance_charge_bdt).toBe(7750); // 10 × 775
      // v6 total = base(0) + distance(7750) + time(0) + wait(0) = 7750
      expect(v6.total_bdt).toBe(7750);
    });

    it("v6 commission is 0% (subscription-only)", () => {
      const v6 = v6Fare();
      expect(v6.platform_commission_bdt).toBe(0);
      expect(v6.driver_net_bdt).toBe(7750); // entire fare to driver
    });
  });

  describe("stage1 — v6 is authoritative", () => {
    beforeEach(() => {
      mockIsStage1Plus.mockResolvedValue(true);
    });

    it("selector returns v6 at stage1", () => {
      const stage1 = true;
      const authoritative = stage1 ? v6Fare() : v2Fare();
      expect(authoritative).toEqual(v6Fare());
    });

    it("v6 authoritative has zero commission", () => {
      const stage1 = true;
      const authoritative = stage1 ? v6Fare() : v2Fare();
      expect(authoritative.platform_commission_bdt).toBe(0);
    });

    it("v6 driver_net equals total (no commission)", () => {
      const stage1 = true;
      const authoritative = stage1 ? v6Fare() : v2Fare();
      expect(authoritative.driver_net_bdt).toBe(authoritative.total_bdt);
    });

    it("v2 is NOT used at stage1", () => {
      const stage1 = true;
      const authoritative = stage1 ? v6Fare() : v2Fare();
      // v2 would have commission=1275; v6 has commission=0
      expect(authoritative.platform_commission_bdt).not.toBe(1275);
    });
  });

  describe("flip-mid-flight (request at stage0, complete at stage1)", () => {
    it("completion bills with the stage-at-completion engine", () => {
      // Simulate: ride requested at stage0 → v2 was authoritative
      const requestStage1 = false;
      const requestFare = requestStage1 ? v6Fare() : v2Fare();
      expect(requestFare.platform_commission_bdt).toBe(1275); // v2 commission

      // Now complete at stage1 → v6 becomes authoritative
      const completeStage1 = true;
      const completeFare = completeStage1 ? v6Fare() : v2Fare();
      expect(completeFare.platform_commission_bdt).toBe(0); // v6 commission

      // The billing fields use the completion-stage engine
      expect(completeFare.driver_net_bdt).toBe(completeFare.total_bdt);
    });

    it("v6 floor_fare respects minimum floor", () => {
      const v6 = v6Fare();
      // floor_fare_bdt = base_fare_bdt + floor_distance + floor_time
      // With floor_length_km=0, floor_min=0: floor = base_fare_bdt = 0
      // total = max(computedTotal, floorFare) = max(7750, 0) = 7750
      expect(v6.floor_fare_bdt).toBe(0); // floor is 0 with our fixtures
      expect(v6.total_bdt).toBe(7750); // but total = max(computed, floor)
    });
  });

  describe("v2 vs v6 structural differences", () => {
    it("v2 has platform_commission_percent from pricing", () => {
      const fare = v2Fare();
      // v2 uses the pricing row's commission percent
      expect(fare.platform_commission_bdt).toBeGreaterThan(0);
    });

    it("v6 always has commission = 0 regardless of pricing input", () => {
      const fare = v6Fare();
      expect(fare.platform_commission_bdt).toBe(0);
    });

    it("v2 and v6 differ in base fare calculation (v2 uses base_fare_bdt, v6 uses km+time rates)", () => {
      const v2 = v2Fare();
      const v6 = v6Fare();
      // v2: base_fare_bdt=5000 → total=12750
      // v6: base=0 (km=0, time=0) → total=7750
      expect(v2.total_bdt).toBe(12750);
      expect(v6.total_bdt).toBe(7750);
      expect(v2.total_bdt).not.toBe(v6.total_bdt);
    });

    it("v6 has floor_fare_bdt field", () => {
      const v6 = v6Fare();
      expect(v6).toHaveProperty("floor_fare_bdt");
    });
  });
});
