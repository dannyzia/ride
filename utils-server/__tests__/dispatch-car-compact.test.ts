/**
 * Verify car_compact integration in the dispatch candidate pool and
 * the pricing release gate.
 */
import { VEHICLE_TYPE_ZOD_ENUM, classifyVehicle, checkDriverEligibility } from '../../lib/vehicleTypes';
import { isOfferablePricing } from '../../lib/pricingGate';

describe('car_compact — pricing release gate (real filter)', () => {
  test('zero-sentinel row (base=0, perkm=0) → not offerable', () => {
    expect(isOfferablePricing({ base_fare_bdt: 0, per_km_bdt: 0 })).toBe(false);
  });

  test('real pricing row (base=4000, perkm=1400) → offerable', () => {
    expect(isOfferablePricing({ base_fare_bdt: 4000, per_km_bdt: 1400 })).toBe(true);
  });

  test('partial zero (base=0, perkm=1400) → offerable (at least one nonzero)', () => {
    expect(isOfferablePricing({ base_fare_bdt: 0, per_km_bdt: 1400 })).toBe(true);
  });

  test('partial zero (base=4000, perkm=0) → offerable (at least one nonzero)', () => {
    expect(isOfferablePricing({ base_fare_bdt: 4000, per_km_bdt: 0 })).toBe(true);
  });

  test('browse-mode filter removes zero-sentinel rows from list', () => {
    const rows = [
      { vehicle_type: 'bike_basic', base_fare_bdt: 2500, per_km_bdt: 775 },
      { vehicle_type: 'car_compact', base_fare_bdt: 0, per_km_bdt: 0 },
      { vehicle_type: 'car_economy', base_fare_bdt: 4500, per_km_bdt: 1500 },
    ];
    const offerable = rows.filter(isOfferablePricing);
    expect(offerable).toHaveLength(2);
    expect(offerable.map((r) => r.vehicle_type)).toContain('bike_basic');
    expect(offerable.map((r) => r.vehicle_type)).toContain('car_economy');
    expect(offerable.map((r) => r.vehicle_type)).not.toContain('car_compact');
  });
});

describe('car_compact — dispatch candidate visibility', () => {
  test('car_compact passes Zod validation (would not be rejected at API boundary)', () => {
    const result = VEHICLE_TYPE_ZOD_ENUM.safeParse('car_compact');
    expect(result.success).toBe(true);
  });

  test('car_compact can be used in pricing lookup query', () => {
    const vt = 'car_compact' as const;
    expect(VEHICLE_TYPE_ZOD_ENUM.parse(vt)).toBe('car_compact');
  });

  test('car_compact classifier produces valid type for dispatch', () => {
    const result = classifyVehicle({ body_type: 'hatchback', engine_cc: 800 });
    expect(result.vehicle_type).toBe('car_compact');
    const zodResult = VEHICLE_TYPE_ZOD_ENUM.safeParse(result.vehicle_type);
    expect(zodResult.success).toBe(true);
  });

  test('car_compact has no eligibility restrictions → all drivers pass', () => {
    const eligibility = checkDriverEligibility('car_compact', { completed_rides_count: 0, rating: 0 });
    expect(eligibility.eligible).toBe(true);
  });

  test('car_compact is in the upgrade/downgrade tier order between cng and car_economy', () => {
    const { VEHICLE_TIER_ORDER } = require('../../lib/vehicleTypes');
    expect(VEHICLE_TIER_ORDER.cng).toBeLessThan(VEHICLE_TIER_ORDER.car_compact);
    expect(VEHICLE_TIER_ORDER.car_compact).toBeLessThan(VEHICLE_TIER_ORDER.car_economy);
  });

});
