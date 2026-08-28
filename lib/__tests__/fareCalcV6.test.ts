/**
 * T-A5 + T-A6: Fare Framework v6 formula tests.
 *
 * T-A5 — night_mult scoping: night_mult APPLIES to trip_minutes,
 *   initiation_minutes, and waiting terms (all time_rate terms).
 *   NEVER applies to: km_rate, zone_fee, pickup fee distance component.
 *
 * T-A6 — Formula correctness for 3 tiers (bike, cng, car):
 *   base_fare = base_km × km_rate + initiation_minutes × time_rate × night_mult
 *   distance  = km_rate × trip_km
 *   time      = time_rate × ride_time_min × night_mult
 *   waiting   = time_rate × max(0, wait_min − grace_min) × night_mult
 *   total     = base + distance + time + waiting + pickup + zone
 *   driver_net = total − commission (0% in v6)
 */
import { calculateV6Fare, type V6FareInput, type V6PricingRow } from '../fareCalc';

/** Standard v6 pricing row for tests (paisa units). */
function pricing(overrides: Partial<V6PricingRow> = {}): V6PricingRow {
  return {
    base_fare_bdt: 5000,
    base_km: 2.0,
    initiation_minutes: 4,
    per_km_bdt: 775,
    per_min_bdt: 50,
    floor_length_km: 3.0,
    floor_min: 5,
    platform_commission_percent: 0, // v6 = 0% commission
    ...overrides,
  };
}

/** Standard v6 input with night_mult=1.0 (disabled). */
function baseInput(overrides: Partial<V6FareInput> = {}): V6FareInput {
  return {
    pricing: pricing(),
    trip_km: 10,
    ride_time_min: 20,
    night_mult: 1.0,
    grace_min: 2,
    wait_min: 0,
    pickup_fee_bdt: 0,
    zone_fee_bdt: 0,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// T-A6: Formula correctness (3 tiers)
// ══════════════════════════════════════════════════════════════════════

describe('T-A6 — v6 formula correctness', () => {
  test('bike tier: all terms computed correctly (night_mult=1.0)', () => {
    // Pricing: base_km=2, initiation=4min, km_rate=775, time_rate=50
    // Input: trip_km=10, ride_time=20min, wait=0, grace=2
    //
    // base_km_charge = round(775 × 2) = 1550
    // initiation_charge = round(50 × 4 × 1.0) = 200
    // base_fare = 1550 + 200 = 1750
    //
    // distance = round(775 × 10) = 7750
    // time = round(50 × 20 × 1.0) = 1000
    // waiting = round(50 × max(0, 0 − 2) × 1.0) = 0
    //
    // computed_total = 1750 + 7750 + 1000 + 0 = 10500
    // floor = 1750 + round(775 × 3) + round(50 × 5 × 1) = 1750 + 2325 + 250 = 4325
    // total = max(10500, 4325) = 10500
    const r = calculateV6Fare(baseInput());
    expect(r.base_km_charge).toBe(1550);
    expect(r.initiation_charge).toBe(200);
    expect(r.base_fare_bdt).toBe(1750);
    expect(r.distance_charge_bdt).toBe(7750);
    expect(r.time_charge_bdt).toBe(1000);
    expect(r.waiting_charge_bdt).toBe(0);
    expect(r.total_bdt).toBe(10500);
    expect(r.platform_commission_bdt).toBe(0);
    expect(r.driver_net_bdt).toBe(10500);
  });

  test('cng tier: different km_rate produces different distance charge', () => {
    // CNG: km_rate=620, time_rate=55, base_km=1.5, initiation=3
    const p = pricing({ per_km_bdt: 620, per_min_bdt: 55, base_km: 1.5, initiation_minutes: 3 });
    const r = calculateV6Fare(baseInput({ pricing: p, trip_km: 8, ride_time_min: 15 }));

    // base_km_charge = round(620 × 1.5) = 930
    // initiation_charge = round(55 × 3) = 165
    // base_fare = 930 + 165 = 1095
    // distance = round(620 × 8) = 4960
    // time = round(55 × 15) = 825
    expect(r.base_km_charge).toBe(930);
    expect(r.initiation_charge).toBe(165);
    expect(r.base_fare_bdt).toBe(1095);
    expect(r.distance_charge_bdt).toBe(4960);
    expect(r.time_charge_bdt).toBe(825);
    expect(r.total_bdt).toBe(1095 + 4960 + 825);
  });

  test('car tier with intercity split', () => {
    // Car: km_rate=1500, time_rate=65, intercity_per_km=900
    // trip: 15km total (10 inside, 5 outside)
    const p = pricing({
      per_km_bdt: 1500,
      per_min_bdt: 65,
      intercity_per_km_bdt: 900,
      base_km: 2,
      initiation_minutes: 5,
    });
    const r = calculateV6Fare(baseInput({
      pricing: p,
      trip_km: 15,
      ride_time_min: 30,
      inside_km: 10,
      outside_km: 5,
      is_intercity: true,
      origin_city: 'Dhaka',
    }));

    // base_km_charge = round(1500 × 2) = 3000
    // initiation_charge = round(65 × 5) = 325
    // base_fare = 3000 + 325 = 3325
    // inside = round(1500 × 10) = 15000
    // outside = round(900 × 5) = 4500
    // distance = 19500
    // time = round(65 × 30) = 1950
    expect(r.base_fare_bdt).toBe(3325);
    expect(r.inside_charge_bdt).toBe(15000);
    expect(r.outside_charge_bdt).toBe(4500);
    expect(r.distance_charge_bdt).toBe(19500);
    expect(r.time_charge_bdt).toBe(1950);
    expect(r.total_bdt).toBe(3325 + 19500 + 1950);
    expect(r.is_intercity).toBe(true);
    expect(r.origin_city).toBe('Dhaka');
  });

  test('floor fare applies when computed total is below floor', () => {
    // Very short ride: trip_km=1, ride_time=1min
    // computed = 1750 + 775 + 50 = 2575
    // floor = 1750 + round(775 × 3) + round(50 × 5) = 1750 + 2325 + 250 = 4325
    // total = max(2575, 4325) = 4325
    const r = calculateV6Fare(baseInput({ trip_km: 1, ride_time_min: 1 }));
    expect(r.total_bdt).toBe(4325);
    expect(r.floor_fare_bdt).toBe(4325);
  });

  test('backward compat: base_km=0 and initiation=0 falls back to base_fare_bdt', () => {
    // When base_km=0 and initiation_minutes=0, use legacy base_fare_bdt
    const p = pricing({ base_km: 0, initiation_minutes: 0, base_fare_bdt: 5000 });
    const r = calculateV6Fare(baseInput({ pricing: p }));
    expect(r.base_km_charge).toBe(0);
    expect(r.initiation_charge).toBe(0);
    expect(r.base_fare_bdt).toBe(5000); // legacy fallback
  });

  test('pickup_fee_bdt and zone_fee_bdt are added to total but NOT to base', () => {
    const r = calculateV6Fare(baseInput({ pickup_fee_bdt: 1000, zone_fee_bdt: 500 }));
    // base stays 1750, total includes add-ons
    expect(r.base_fare_bdt).toBe(1750);
    expect(r.pickup_fee_bdt).toBe(1000);
    expect(r.zone_fee_bdt).toBe(500);
    expect(r.total_bdt).toBe(1750 + 7750 + 1000 + 1000 + 500); // base + dist + time + pickup + zone
  });

  test('wait_min and grace_min: waiting charge subtracts grace from wait', () => {
    // wait_min=8, grace_min=3 → billable=5min
    const r = calculateV6Fare(baseInput({ wait_min: 8, grace_min: 3 }));
    // waiting = round(50 × 5 × 1.0) = 250
    expect(r.waiting_charge_bdt).toBe(250);
    expect(r.total_bdt).toBe(10500 + 250);
  });

  test('wait_min < grace_min → waiting charge = 0', () => {
    const r = calculateV6Fare(baseInput({ wait_min: 1, grace_min: 3 }));
    expect(r.waiting_charge_bdt).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A5: night_mult scoping (PATCH 2)
// ══════════════════════════════════════════════════════════════════════

describe('T-A5 — night_mult scoping (PATCH 2)', () => {
  const NM = 1.2; // 20% night surcharge

  test('night_mult APPLIES to initiation_minutes (base fare time term)', () => {
    // Without night: initiation = round(50 × 4 × 1.0) = 200
    // With night:    initiation = round(50 × 4 × 1.2) = 240
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM }));
    expect(withNight.initiation_charge).toBe(240);
    expect(withNight.initiation_charge).toBeGreaterThan(withoutNight.initiation_charge);
  });

  test('night_mult APPLIES to ride_time_min (trip time term)', () => {
    // Without night: time = round(50 × 20 × 1.0) = 1000
    // With night:    time = round(50 × 20 × 1.2) = 1200
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM }));
    expect(withNight.time_charge_bdt).toBe(1200);
    expect(withNight.time_charge_bdt).toBeGreaterThan(withoutNight.time_charge_bdt);
  });

  test('night_mult APPLIES to waiting term', () => {
    // Without night: waiting = round(50 × 6 × 1.0) = 300
    // With night:    waiting = round(50 × 6 × 1.2) = 360
    const input = baseInput({ wait_min: 8, grace_min: 2, night_mult: 1.0 });
    const inputNight = baseInput({ wait_min: 8, grace_min: 2, night_mult: NM });
    const withoutNight = calculateV6Fare(input);
    const withNight = calculateV6Fare(inputNight);
    expect(withNight.waiting_charge_bdt).toBe(360);
    expect(withNight.waiting_charge_bdt).toBeGreaterThan(withoutNight.waiting_charge_bdt);
  });

  test('night_mult NEVER applies to km_rate (distance charge unchanged)', () => {
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM }));
    // distance = round(775 × 10) = 7750 — same regardless of night_mult
    expect(withNight.distance_charge_bdt).toBe(withoutNight.distance_charge_bdt);
    expect(withNight.distance_charge_bdt).toBe(7750);
  });

  test('night_mult NEVER applies to base_km_charge', () => {
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM }));
    // base_km_charge = round(775 × 2) = 1550 — unchanged
    expect(withNight.base_km_charge).toBe(withoutNight.base_km_charge);
    expect(withNight.base_km_charge).toBe(1550);
  });

  test('night_mult NEVER applies to zone_fee_bdt', () => {
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0, zone_fee_bdt: 800 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM, zone_fee_bdt: 800 }));
    expect(withNight.zone_fee_bdt).toBe(800);
    expect(withNight.zone_fee_bdt).toBe(withoutNight.zone_fee_bdt);
  });

  test('night_mult NEVER applies to pickup_fee_bdt', () => {
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0, pickup_fee_bdt: 600 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM, pickup_fee_bdt: 600 }));
    expect(withNight.pickup_fee_bdt).toBe(600);
    expect(withNight.pickup_fee_bdt).toBe(withoutNight.pickup_fee_bdt);
  });

  test('night_mult=1.0 produces identical result to night_mult=1.0 (sanity)', () => {
    const a = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    const b = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    expect(a).toEqual(b);
  });

  test('total difference equals sum of individual night_mult deltas', () => {
    const withoutNight = calculateV6Fare(baseInput({ night_mult: 1.0, wait_min: 8, grace_min: 2 }));
    const withNight = calculateV6Fare(baseInput({ night_mult: NM, wait_min: 8, grace_min: 2 }));

    const deltaInit = withNight.initiation_charge - withoutNight.initiation_charge;
    const deltaTrip = withNight.time_charge_bdt - withoutNight.time_charge_bdt;
    const deltaWait = withNight.waiting_charge_bdt - withoutNight.waiting_charge_bdt;
    const totalDelta = withNight.total_bdt - withoutNight.total_bdt;

    expect(totalDelta).toBe(deltaInit + deltaTrip + deltaWait);
  });

  test('night_mult applied metadata is recorded', () => {
    const r = calculateV6Fare(baseInput({ night_mult: NM }));
    expect(r.night_mult_applied).toBe(NM);
  });

  test('night_mult=1.0 (disabled) records metadata correctly', () => {
    const r = calculateV6Fare(baseInput({ night_mult: 1.0 }));
    expect(r.night_mult_applied).toBe(1.0);
  });
});
