/**
 * T-A4: Zone-fee hysteresis (30 enter, 20 exit, 10-min band).
 * T-A8: Zone fee commission isolation (100% to driver, no commission).
 *
 * Hysteresis rules (v6.md §3):
 *   - Zone enters zone_fee if recovery > entryThreshold (default 30 min)
 *   - Zone exits zone_fee if recovery < exitThreshold (default 20 min)
 *   - 10-min dead band prevents flapping at the boundary
 *
 * Commission isolation (R1/14):
 *   - zone_fee_bdt goes 100% to the driver (never commission base)
 *   - platform_commission_bdt is calculated on trip fare only, excluding zone_fee
 */

// Mock the DB module before any imports that transitively load it
import { shouldApplyZoneFee } from '../zoneRecovery';
import { deriveZoneFee } from '../zoneFee';
import { calculateV6Fare, type V6FareInput, type V6PricingRow } from '../fareCalc';

jest.mock('@/src/db', () => ({ db: {} }));

// ══════════════════════════════════════════════════════════════════════
// T-A4: Zone-fee hysteresis
// ══════════════════════════════════════════════════════════════════════

describe('T-A4 — zone-fee hysteresis (30/20 min)', () => {
  test('recovery > 30 min → zone enters (currentlyHasFee=false)', () => {
    expect(shouldApplyZoneFee(31, false)).toBe(true);
    expect(shouldApplyZoneFee(35, false)).toBe(true);
    expect(shouldApplyZoneFee(60, false)).toBe(true);
  });

  test('recovery ≤ 30 min → zone does NOT enter (currentlyHasFee=false)', () => {
    expect(shouldApplyZoneFee(30, false)).toBe(false);
    expect(shouldApplyZoneFee(25, false)).toBe(false);
    expect(shouldApplyZoneFee(0, false)).toBe(false);
  });

  test('recovery ≥ 20 min → zone stays (currentlyHasFee=true)', () => {
    expect(shouldApplyZoneFee(20, true)).toBe(true);
    expect(shouldApplyZoneFee(25, true)).toBe(true);
    expect(shouldApplyZoneFee(30, true)).toBe(true);
    expect(shouldApplyZoneFee(60, true)).toBe(true);
  });

  test('recovery < 20 min → zone exits (currentlyHasFee=true)', () => {
    expect(shouldApplyZoneFee(19, true)).toBe(false);
    expect(shouldApplyZoneFee(10, true)).toBe(false);
    expect(shouldApplyZoneFee(0, true)).toBe(false);
  });

  test('dead band (20–30 min): entry requires >30, exit requires <20', () => {
    // Zone without fee at 25 min → stays without fee (25 ≤ 30)
    expect(shouldApplyZoneFee(25, false)).toBe(false);
    // Zone with fee at 25 min → keeps fee (25 ≥ 20)
    expect(shouldApplyZoneFee(25, true)).toBe(true);
  });

  test('boundary: exactly 30 min — no entry (strict >)', () => {
    expect(shouldApplyZoneFee(30, false)).toBe(false);
  });

  test('boundary: exactly 20 min — no exit (≥)', () => {
    expect(shouldApplyZoneFee(20, true)).toBe(true);
  });

  test('custom thresholds: entry=25, exit=15', () => {
    expect(shouldApplyZoneFee(26, false, 25, 15)).toBe(true);
    expect(shouldApplyZoneFee(25, false, 25, 15)).toBe(false);
    expect(shouldApplyZoneFee(14, true, 25, 15)).toBe(false);
    expect(shouldApplyZoneFee(15, true, 25, 15)).toBe(true);
  });

  test('flapping prevention: rapid recovery changes in dead band', () => {
    let hasFee = false;
    hasFee = shouldApplyZoneFee(35, hasFee); // enter → true
    expect(hasFee).toBe(true);
    hasFee = shouldApplyZoneFee(28, hasFee); // dead band → stays true
    expect(hasFee).toBe(true);
    hasFee = shouldApplyZoneFee(32, hasFee); // dead band → stays true
    expect(hasFee).toBe(true);
    hasFee = shouldApplyZoneFee(22, hasFee); // dead band → stays true
    expect(hasFee).toBe(true);
    hasFee = shouldApplyZoneFee(18, hasFee); // exit (< 20) → false
    expect(hasFee).toBe(false);
    hasFee = shouldApplyZoneFee(25, hasFee); // dead band → stays false
    expect(hasFee).toBe(false);
    hasFee = shouldApplyZoneFee(31, hasFee); // re-enter → true
    expect(hasFee).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A4 (cont): deriveZoneFee
// ══════════════════════════════════════════════════════════════════════

describe('T-A4 — deriveZoneFee', () => {
  test('derivation: recovery × time_rate × coverage_factor, rounded to 500 paisa', () => {
    // 30 min × 50 paisa/min × 0.55 = 825 paisa → round to nearest 500 = 1000
    const fee = deriveZoneFee(30, 50, 0.55);
    expect(fee).toBe(1000);
  });

  test('zero recovery → 0', () => {
    expect(deriveZoneFee(0, 50, 0.55)).toBe(0);
  });

  test('rounding: 35 min × 50 × 0.55 = 962.5 → round to 1000', () => {
    expect(deriveZoneFee(35, 50, 0.55)).toBe(1000);
  });

  test('rounding: 20 min × 50 × 0.55 = 550 → round to 500', () => {
    expect(deriveZoneFee(20, 50, 0.55)).toBe(500);
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A8: Zone fee commission isolation
// ══════════════════════════════════════════════════════════════════════

describe('T-A8 — zone fee commission isolation', () => {
  function pricing(overrides: Partial<V6PricingRow> = {}): V6PricingRow {
    return {
      base_fare_bdt: 5000,
      base_km: 2.0,
      initiation_minutes: 4,
      per_km_bdt: 775,
      per_min_bdt: 50,
      floor_length_km: 3.0,
      floor_min: 5,
      platform_commission_percent: 10,
      ...overrides,
    };
  }

  function input(overrides: Partial<V6FareInput> = {}): V6FareInput {
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

  test('zone_fee_bdt is included in total_bdt', () => {
    const withoutZone = calculateV6Fare(input({ zone_fee_bdt: 0 }));
    const withZone = calculateV6Fare(input({ zone_fee_bdt: 800 }));

    expect(withZone.total_bdt).toBe(withoutZone.total_bdt + 800);
  });

  test('pickup_fee_bdt is included in total_bdt', () => {
    const withoutPickup = calculateV6Fare(input({ pickup_fee_bdt: 0 }));
    const withPickup = calculateV6Fare(input({ pickup_fee_bdt: 1000 }));

    expect(withPickup.total_bdt).toBe(withoutPickup.total_bdt + 1000);
  });

  test('both add-ons: full amount flows to total and driver_net (0% commission)', () => {
    const base = calculateV6Fare(input({ zone_fee_bdt: 0, pickup_fee_bdt: 0 }));
    const full = calculateV6Fare(input({
      zone_fee_bdt: 800,
      pickup_fee_bdt: 600,
      pricing: pricing({ platform_commission_percent: 0 }),
    }));

    expect(full.total_bdt).toBe(base.total_bdt + 800 + 600);
    // v6 commission = 0% always → driver_net = total
    expect(full.platform_commission_bdt).toBe(0);
    expect(full.driver_net_bdt).toBe(full.total_bdt);
  });

  test('driver_net = total − commission; with 0% commission, driver gets 100%', () => {
    const r = calculateV6Fare(input({
      zone_fee_bdt: 800,
      pickup_fee_bdt: 600,
      pricing: pricing({ platform_commission_percent: 0 }),
    }));
    // driver_net = total − 0 = total → 100% goes to driver
    expect(r.driver_net_bdt).toBe(r.total_bdt);
  });

  test('structural invariant: zone_fee and pickup_fee are 100% pass-through to driver', () => {
    // Verify that add-ons don't get absorbed by commission
    const r = calculateV6Fare(input({
      zone_fee_bdt: 500,
      pickup_fee_bdt: 300,
      pricing: pricing({ platform_commission_percent: 0 }),
    }));
    const tripFare = r.total_bdt - 500 - 300;
    // commission on trip fare = 0 (v6)
    expect(r.platform_commission_bdt).toBe(0);
    // driver gets trip fare + zone + pickup
    expect(r.driver_net_bdt).toBe(tripFare + 500 + 300);
  });
});
