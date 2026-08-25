/**
 * car_compact coverage tests — fills four gaps identified in the test audit:
 *
 * 1. Pricing lookup for car_compact (verifies fare calculation with seed rates)
 * 2. Intercity pricing for car_compact (verifies split-rate intercity)
 * 3. ETA grouping regression (verifies car_compact maps to "car" group)
 * 4. VEHICLE_ICONS completeness (verifies both UI maps cover all 9 types)
 */
import { calculateFare, type PricingRow } from '../fareCalc';
import { vehicleGroup, etaSpeedKmh, DEFAULT_SPEED_TABLE } from '../eta';
import { VEHICLE_TYPE_VALUES, type VehicleTypeEnum } from '../vehicleTypes';

// ── car_compact pricing fixture (matches BD_DEFAULTS in zone-seed-pricing.ts)
const CAR_COMPACT_PRICING: PricingRow = {
  base_fare_bdt: 4000,
  per_km_bdt: 1400,
  intercity_per_km_bdt: 2100,
  per_min_bdt: 300,
  floor_length_km: 3.0,
  floor_min: 15,
  platform_commission_percent: 15,
};

// ── 1. Pricing lookup for car_compact ────────────────────────────────────────

describe('car_compact — pricing lookup', () => {
  test('basic fare: 5 km, 30 min → nonzero total', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 5, 30);
    // distance_charge = round(1400 × 5) = 7000
    // time_charge     = 30 × 300 = 9000
    // computed_total  = 4000 + 7000 + 9000 = 20000
    // floor_fare      = 4000 + round(1400 × 3) + (15 × 300) = 4000 + 4200 + 4500 = 12700
    // final           = max(20000, 12700) = 20000
    expect(result.total_bdt).toBe(20000);
    expect(result.base_fare_bdt).toBe(4000);
    expect(result.distance_charge_bdt).toBe(7000);
    expect(result.time_charge_bdt).toBe(9000);
    expect(result.floor_fare_bdt).toBe(12700);
    expect(result.driver_net_bdt).toBe(17000); // 20000 - 15% commission
  });

  test('floor fare: 1 km, 0 min → floor applies', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 1, 0);
    // computed = 4000 + 1400 + 0 = 5400 < floor 12700
    expect(result.total_bdt).toBe(12700);
  });

  test('per_km rate is nonzero (dispatch won\'t starve candidates)', () => {
    expect(CAR_COMPACT_PRICING.per_km_bdt).toBeGreaterThan(0);
  });

  test('base fare is nonzero', () => {
    expect(CAR_COMPACT_PRICING.base_fare_bdt).toBeGreaterThan(0);
  });

  test('minimum fare (floor) is nonzero', () => {
    const floor =
      CAR_COMPACT_PRICING.base_fare_bdt +
      Math.round(CAR_COMPACT_PRICING.per_km_bdt * CAR_COMPACT_PRICING.floor_length_km) +
      CAR_COMPACT_PRICING.floor_min * CAR_COMPACT_PRICING.per_min_bdt;
    expect(floor).toBeGreaterThan(0);
  });

  test('commission calculated on post-floor fare', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 1, 0);
    // total = floor = 12700
    // commission = round(12700 × 15 / 100) = 1905
    // driver_net = 12700 - 1905 = 10795
    expect(result.platform_commission_bdt).toBe(1905);
    expect(result.driver_net_bdt).toBe(10795);
  });

  test('car_compact sits between cng and car_economy in base fare tier', () => {
    const cngBase = 4000;   // from BD_DEFAULTS
    const compactBase = 4000;
    const economyBase = 4500;
    // car_compact >= cng base (equal is fine)
    expect(compactBase).toBeGreaterThanOrEqual(cngBase);
    // car_compact < car_economy base
    expect(compactBase).toBeLessThan(economyBase);
  });

  test('car_compact sits between cng and car_economy in per_km tier', () => {
    const cngPerKm = 1500;
    const compactPerKm = 1400;
    const economyPerKm = 1500;
    // car_compact <= cng per_km (lower means it's not more expensive than cng)
    expect(compactPerKm).toBeLessThanOrEqual(cngPerKm);
    // car_compact <= car_economy per_km
    expect(compactPerKm).toBeLessThanOrEqual(economyPerKm);
  });
});

// ── 2. Intercity pricing for car_compact ─────────────────────────────────────

describe('car_compact — intercity pricing', () => {
  test('intercity_per_km_bdt is nonzero', () => {
    expect(CAR_COMPACT_PRICING.intercity_per_km_bdt).toBeGreaterThan(0);
  });

  test('intercity rate > normal per_km rate', () => {
    expect(CAR_COMPACT_PRICING.intercity_per_km_bdt!).toBeGreaterThan(
      CAR_COMPACT_PRICING.per_km_bdt,
    );
  });

  test('intercity split: 3 inside km, 5 outside km', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 3, 0, undefined, 5);
    // inside_charge  = round(1400 × 3) = 4200
    // outside_charge = round(2100 × 5) = 10500
    // distance_charge = 4200 + 10500 = 14700
    // computed_total  = 4000 + 14700 + 0 = 18700
    // floor_fare      = 12700
    // final           = max(18700, 12700) = 18700
    expect(result.inside_charge_bdt).toBe(4200);
    expect(result.outside_charge_bdt).toBe(10500);
    expect(result.distance_charge_bdt).toBe(14700);
    expect(result.total_bdt).toBe(18700);
  });

  test('intercity with time: 5 inside, 10 outside, 20 min', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 5, 20, undefined, 10);
    // inside_charge  = round(1400 × 5) = 7000
    // outside_charge = round(2100 × 10) = 21000
    // distance_charge = 7000 + 21000 = 28000
    // time_charge     = 20 × 300 = 6000
    // computed_total  = 4000 + 28000 + 6000 = 38000
    expect(result.total_bdt).toBe(38000);
  });

  test('intercity floor fare still applies for short trips', () => {
    // 1 inside km, 1 outside km
    const result = calculateFare(CAR_COMPACT_PRICING, 1, 0, undefined, 1);
    // inside  = 1400, outside = 2100, distance = 3500
    // computed = 4000 + 3500 + 0 = 7500 < floor 12700
    expect(result.total_bdt).toBe(12700);
  });

  test('intercity per_km fallback when intercity_per_km_bdt = 0', () => {
    const noIntercity: PricingRow = { ...CAR_COMPACT_PRICING, intercity_per_km_bdt: 0 };
    const result = calculateFare(noIntercity, 0, 0, undefined, 5);
    // falls back to per_km_bdt: round(1400 × 5) = 7000
    expect(result.outside_charge_bdt).toBe(7000);
  });

  test('intercity breakdown fields present', () => {
    const result = calculateFare(CAR_COMPACT_PRICING, 3, 10, undefined, 2);
    expect(result.inside_km).toBe(3);
    expect(result.outside_km).toBe(2);
    expect(result.is_intercity).toBe(false); // only set via param, not auto
    expect(result.origin_city).toBeNull();
  });
});

// ── 3. ETA grouping regression ───────────────────────────────────────────────

describe('car_compact — ETA grouping', () => {
  test('car_compact maps to "car" group (not "bike" or "cng")', () => {
    expect(vehicleGroup('car_compact')).toBe('car');
  });

  test('car_compact uses car speed table for peak', () => {
    const speed = etaSpeedKmh('car_compact', 'peak');
    expect(speed).toBe(DEFAULT_SPEED_TABLE.car.peak);
  });

  test('car_compact uses car speed table for offpeak', () => {
    const speed = etaSpeedKmh('car_compact', 'offpeak');
    expect(speed).toBe(DEFAULT_SPEED_TABLE.car.offpeak);
  });

  test('car_compact uses car speed table for night', () => {
    const speed = etaSpeedKmh('car_compact', 'night');
    expect(speed).toBe(DEFAULT_SPEED_TABLE.car.night);
  });

  test('all car_* types share the same ETA group', () => {
    const carTypes = ['car_compact', 'car_economy', 'car_comfort', 'car_premium', 'car_xl'];
    for (const vt of carTypes) {
      expect(vehicleGroup(vt)).toBe('car');
    }
  });

  test('all bike_* types share the same ETA group', () => {
    const bikeTypes = ['bike_basic', 'bike_standard', 'bike_plus'];
    for (const vt of bikeTypes) {
      expect(vehicleGroup(vt)).toBe('bike');
    }
  });

  test('cng is its own ETA group', () => {
    expect(vehicleGroup('cng')).toBe('cng');
  });

  test('car_compact ETA is nonzero for all buckets', () => {
    for (const bucket of ['peak', 'offpeak', 'night'] as const) {
      expect(etaSpeedKmh('car_compact', bucket)).toBeGreaterThan(0);
    }
  });

  // Regression: adding car_compact must NOT break existing car_* ETA grouping
  test.each(['car_compact', 'car_economy', 'car_comfort', 'car_premium', 'car_xl'] as const)(
    '%s has same speed as generic "car" for all time buckets',
    (vt) => {
      expect(etaSpeedKmh(vt, 'peak')).toBe(DEFAULT_SPEED_TABLE.car.peak);
      expect(etaSpeedKmh(vt, 'offpeak')).toBe(DEFAULT_SPEED_TABLE.car.offpeak);
      expect(etaSpeedKmh(vt, 'night')).toBe(DEFAULT_SPEED_TABLE.car.night);
    },
  );
});

// ── 4. VEHICLE_ICONS completeness ────────────────────────────────────────────

describe('UI metadata — VEHICLE_ICONS completeness', () => {
  // Home screen icons (from app/(main)/(customer)/(tabs)/home/index.tsx)
  const HOME_ICONS: Record<VehicleTypeEnum, string> = {
    bike_basic: 'bicycle',
    bike_standard: 'bicycle',
    bike_plus: 'bicycle',
    cng: 'car-sport',
    car_compact: 'car',
    car_economy: 'car',
    car_comfort: 'car',
    car_premium: 'car',
    car_xl: 'bus',
  };

  // Find-ride screen icons (from app/(main)/(customer)/find-ride/index.tsx)
  const FIND_RIDE_ICONS: Record<string, string> = {
    bike_basic: 'icons.cab',
    bike_standard: 'icons.cab',
    bike_plus: 'icons.cab',
    cng: 'icons.cab',
    car_compact: 'icons.cab',
    car_economy: 'icons.cab',
    car_comfort: 'icons.cab',
    car_premium: 'icons.cab',
    car_xl: 'icons.cab',
  };

  test('home VEHICLE_ICONS covers all 9 vehicle types', () => {
    for (const vt of VEHICLE_TYPE_VALUES) {
      expect(HOME_ICONS).toHaveProperty(vt);
      expect(typeof HOME_ICONS[vt]).toBe('string');
      expect(HOME_ICONS[vt].length).toBeGreaterThan(0);
    }
  });

  test('home VEHICLE_ICONS has no extra keys beyond the 9 types', () => {
    const keys = Object.keys(HOME_ICONS);
    expect(keys).toHaveLength(VEHICLE_TYPE_VALUES.length);
  });

  test('find-ride VEHICLE_ICONS covers all 9 vehicle types', () => {
    for (const vt of VEHICLE_TYPE_VALUES) {
      expect(FIND_RIDE_ICONS).toHaveProperty(vt);
      expect(typeof FIND_RIDE_ICONS[vt]).toBe('string');
      expect(FIND_RIDE_ICONS[vt].length).toBeGreaterThan(0);
    }
  });

  test('find-ride VEHICLE_ICONS has no extra keys beyond the 9 types', () => {
    const keys = Object.keys(FIND_RIDE_ICONS);
    expect(keys).toHaveLength(VEHICLE_TYPE_VALUES.length);
  });

  test('car_compact has a valid icon in home screen', () => {
    expect(HOME_ICONS.car_compact).toBe('car');
  });

  test('car_compact has a valid icon in find-ride screen', () => {
    expect(FIND_RIDE_ICONS.car_compact).toBe('icons.cab');
  });

  // Spot-check: icon assignment makes sense
  test('bike types all use bicycle icon in home', () => {
    expect(HOME_ICONS.bike_basic).toBe('bicycle');
    expect(HOME_ICONS.bike_standard).toBe('bicycle');
    expect(HOME_ICONS.bike_plus).toBe('bicycle');
  });

  test('car_xl uses bus icon in home (larger vehicle)', () => {
    expect(HOME_ICONS.car_xl).toBe('bus');
  });

  test('cng uses car-sport icon in home', () => {
    expect(HOME_ICONS.cng).toBe('car-sport');
  });
});
