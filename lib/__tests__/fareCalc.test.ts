import { calculateFare, paisaToTaka, PricingRow, PlatformCeilings } from '../fareCalc';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// All money in integer paisa. floor_length_km is decimal km.
// Floor formula: base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
//
// bike_basic floor: 2500 + round(775 × 2.00) + (10 × 175) = 2500 + 1550 + 1750 = 5800 paisa (58 BDT)
//
// Floor fares (BDT paisa):
// | vehicle_type     | floor_fare_bdt |
// |------------------|----------------|
// | bike_basic       | 5800           |
// | bike_standard    | 6200           |
// | bike_plus        | 6500           |
// | cng              | 11500          |
// | car_economy      | 17500          |
// | car_comfort      | 19700          |
// | car_premium      | 22900          |
// | car_xl           | 26500          |
//
// Sample trip totals (BDT paisa):
// | vehicle_type     | distance_km | ride_time_min | total_bdt |
// |------------------|-------------|---------------|-----------|
// | bike_basic       | 4           | 30            | 10850     |
// | bike_standard    | 4           | 30            | 11700     |
// | bike_plus        | 4           | 30            | 12400     |
// | cng              | 5           | 45            | 20500     |
// | car_economy      | 5           | 45            | 27750     |
// | car_comfort      | 8           | 60            | 41900     |
// | car_premium      | 8           | 60            | 47300     |
// | car_xl           | 8           | 60            | 53500     |

const BIKE_BASIC: PricingRow = {
  base_fare_bdt:            2500,
  per_km_bdt:               775,
  per_min_bdt:              175,
  floor_length_km:          2.00,
  floor_min:                10,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const BIKE_STANDARD: PricingRow = {
  base_fare_bdt:            2500,
  per_km_bdt:               950,
  per_min_bdt:              180,
  floor_length_km:          2.00,
  floor_min:                10,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const BIKE_PLUS: PricingRow = {
  base_fare_bdt:            2500,
  per_km_bdt:               1050,
  per_min_bdt:              190,
  floor_length_km:          2.00,
  floor_min:                10,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CNG: PricingRow = {
  base_fare_bdt:            4000,
  per_km_bdt:               1500,
  per_min_bdt:              200,
  floor_length_km:          3.00,
  floor_min:                15,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CAR_ECONOMY: PricingRow = {
  base_fare_bdt:            4500,
  per_km_bdt:               1500,
  per_min_bdt:              350,
  floor_length_km:          4.00,
  floor_min:                20,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CAR_COMFORT: PricingRow = {
  base_fare_bdt:            5000,
  per_km_bdt:               1800,
  per_min_bdt:              375,
  floor_length_km:          4.00,
  floor_min:                20,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CAR_PREMIUM: PricingRow = {
  base_fare_bdt:            6500,
  per_km_bdt:               2100,
  per_min_bdt:              400,
  floor_length_km:          4.00,
  floor_min:                20,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CAR_XL: PricingRow = {
  base_fare_bdt:            8000,
  per_km_bdt:               2500,
  per_min_bdt:              425,
  floor_length_km:          4.00,
  floor_min:                20,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CEILINGS: PlatformCeilings = {
  brta_max_base_bdt:          8500,
  brta_max_per_km_bdt:        3400,
  brta_max_per_min_bdt:       425,  // per_min_bdt ceiling (max across all 8 types)
};

// ── Basic formula correctness ────────────────────────────────────────────────

describe('calculateFare — formula', () => {
  test('bike_basic: 3 km, 0 min → floor applies', () => {
    // distance_charge = round(775 × 3) = 2325
    // time_charge     = 0 × 175 = 0
    // computed_total  = 2500 + 2325 + 0 = 4825
    // floor_fare      = 2500 + round(775 × 2.00) + (10 × 175) = 2500 + 1550 + 1750 = 5800
    // final           = max(4825, 5800) = 5800  (floor applies)
    const result = calculateFare(BIKE_BASIC, 3, 0);
    expect(result.base_fare_bdt).toBe(2500);
    expect(result.distance_charge_bdt).toBe(2325);
    expect(result.time_charge_bdt).toBe(0);
    expect(result.floor_fare_bdt).toBe(5800);
    expect(result.total_bdt).toBe(5800);
  });

  test('bike_basic: 10 km, 0 min → above floor', () => {
    // distance_charge = round(775 × 10) = 7750
    // time_charge     = 0
    // computed_total  = 2500 + 7750 + 0 = 10250
    // floor_fare      = 5800
    // final           = max(10250, 5800) = 10250
    const result = calculateFare(BIKE_BASIC, 10, 0);
    expect(result.distance_charge_bdt).toBe(7750);
    expect(result.total_bdt).toBe(10250);
  });

  test('bike_basic: 5 km, 20 min → above floor', () => {
    // distance_charge = round(775 × 5) = 3875
    // time_charge     = 20 × 175 = 3500
    // computed_total  = 2500 + 3875 + 3500 = 9875
    // floor_fare      = 5800
    // final           = max(9875, 5800) = 9875
    const result = calculateFare(BIKE_BASIC, 5, 20);
    expect(result.distance_charge_bdt).toBe(3875);
    expect(result.time_charge_bdt).toBe(3500);
    expect(result.floor_fare_bdt).toBe(5800);
    expect(result.total_bdt).toBe(9875);
  });

  test('bike_basic: 0 km, 0 min → floor applies', () => {
    const result = calculateFare(BIKE_BASIC, 0, 0);
    expect(result.total_bdt).toBe(5800);
  });

  test('cng: 5 km, 45 min → above floor', () => {
    // distance_charge = round(1500 × 5) = 7500
    // time_charge     = 45 × 200 = 9000
    // computed_total  = 4000 + 7500 + 9000 = 20500
    // floor_fare      = 4000 + round(1500 × 3.00) + (15 × 200) = 4000 + 4500 + 3000 = 11500
    // final           = max(20500, 11500) = 20500
    const result = calculateFare(CNG, 5, 45);
    expect(result.time_charge_bdt).toBe(9000);
    expect(result.floor_fare_bdt).toBe(11500);
    expect(result.total_bdt).toBe(20500);
  });

  test('cng: 1 km, 0 min → floor applies', () => {
    // computed = 4000 + 1500 + 0 = 5500 < floor (11500)
    const result = calculateFare(CNG, 1, 0);
    expect(result.total_bdt).toBe(11500);
  });

  test('cng: 2 km, 3 min → floor applies', () => {
    // distance_charge = round(1500 × 2) = 3000
    // time_charge     = 3 × 200 = 600
    // computed_total  = 4000 + 3000 + 600 = 7600
    // floor_fare      = 11500  (> computed)
    const result = calculateFare(CNG, 2, 3);
    expect(result.time_charge_bdt).toBe(600);
    expect(result.floor_fare_bdt).toBe(11500);
    expect(result.total_bdt).toBe(11500);
  });

  test('car_premium: 20 km, 0 min → above floor', () => {
    // distance_charge = round(2100 × 20) = 42000
    // time_charge     = 0
    // computed_total  = 6500 + 42000 + 0 = 48500
    // floor_fare      = 22900
    // final           = max(48500, 22900) = 48500
    const result = calculateFare(CAR_PREMIUM, 20, 0);
    expect(result.total_bdt).toBe(48500);
  });
});

// ── All 8 vehicle type sample trips ──────────────────────────────────────────

describe('calculateFare — all 8 vehicle types sample trips', () => {
  test('bike_basic: 4 km, 30 min → total 10850', () => {
    // distance_charge = round(775 × 4) = 3100
    // time_charge     = 30 × 175 = 5250
    // computed_total  = 2500 + 3100 + 5250 = 10850
    // floor_fare      = 5800
    // final           = max(10850, 5800) = 10850
    const result = calculateFare(BIKE_BASIC, 4, 30);
    expect(result.total_bdt).toBe(10850);
    expect(result.floor_fare_bdt).toBe(5800);
  });

  test('bike_standard: 4 km, 30 min → total 11700', () => {
    // distance_charge = round(950 × 4) = 3800
    // time_charge     = 30 × 180 = 5400
    // computed_total  = 2500 + 3800 + 5400 = 11700
    // floor: 2500 + round(950×2.00) + (10×180) = 2500+1900+1800 = 6200
    const result = calculateFare(BIKE_STANDARD, 4, 30);
    expect(result.total_bdt).toBe(11700);
    expect(result.floor_fare_bdt).toBe(6200);
  });

  test('bike_plus: 4 km, 30 min → total 12400', () => {
    // distance_charge = round(1050 × 4) = 4200
    // time_charge     = 30 × 190 = 5700
    // computed_total  = 2500 + 4200 + 5700 = 12400
    // floor: 2500 + round(1050×2.00) + (10×190) = 2500+2100+1900 = 6500
    const result = calculateFare(BIKE_PLUS, 4, 30);
    expect(result.total_bdt).toBe(12400);
    expect(result.floor_fare_bdt).toBe(6500);
  });

  test('cng: 5 km, 45 min → total 20500', () => {
    // Already tested above, just confirm the fixture matches
    const result = calculateFare(CNG, 5, 45);
    expect(result.total_bdt).toBe(20500);
    expect(result.floor_fare_bdt).toBe(11500);
  });

  test('car_economy: 5 km, 45 min → total 27750', () => {
    // distance_charge = round(1500 × 5) = 7500
    // time_charge     = 45 × 350 = 15750
    // computed_total  = 4500 + 7500 + 15750 = 27750
    // floor: 4500 + round(1500×4.00) + (20×350) = 4500+6000+7000 = 17500
    const result = calculateFare(CAR_ECONOMY, 5, 45);
    expect(result.total_bdt).toBe(27750);
    expect(result.floor_fare_bdt).toBe(17500);
  });

  test('car_comfort: 8 km, 60 min → total 41900', () => {
    // distance_charge = round(1800 × 8) = 14400
    // time_charge     = 60 × 375 = 22500
    // computed_total  = 5000 + 14400 + 22500 = 41900
    // floor: 5000 + round(1800×4.00) + (20×375) = 5000+7200+7500 = 19700
    const result = calculateFare(CAR_COMFORT, 8, 60);
    expect(result.total_bdt).toBe(41900);
    expect(result.floor_fare_bdt).toBe(19700);
  });

  test('car_premium: 8 km, 60 min → total 47300', () => {
    // distance_charge = round(2100 × 8) = 16800
    // time_charge     = 60 × 400 = 24000
    // computed_total  = 6500 + 16800 + 24000 = 47300
    // floor: 6500 + round(2100×4.00) + (20×400) = 6500+8400+8000 = 22900
    const result = calculateFare(CAR_PREMIUM, 8, 60);
    expect(result.total_bdt).toBe(47300);
    expect(result.floor_fare_bdt).toBe(22900);
  });

  test('car_xl: 8 km, 60 min → total 53500', () => {
    // distance_charge = round(2500 × 8) = 20000
    // time_charge     = 60 × 425 = 25500
    // computed_total  = 8000 + 20000 + 25500 = 53500
    // floor: 8000 + round(2500×4.00) + (20×425) = 8000+10000+8500 = 26500
    const result = calculateFare(CAR_XL, 8, 60);
    expect(result.total_bdt).toBe(53500);
    expect(result.floor_fare_bdt).toBe(26500);
  });
});

// ── Floor fare ───────────────────────────────────────────────────────────────

describe('calculateFare — floor fare', () => {
  test('floor applies when computed total < floor_fare', () => {
    // bike_basic 1 km, 0 min: computed = 2500 + 775 = 3275 < floor (5800)
    const result = calculateFare(BIKE_BASIC, 1, 0);
    expect(result.total_bdt).toBe(5800);
  });

  test('floor does NOT apply when computed total >= floor_fare', () => {
    // bike_basic 4 km, 30 min: total 10850 > floor (5800)
    const result = calculateFare(BIKE_BASIC, 4, 30);
    expect(result.total_bdt).toBeGreaterThan(5800);
    expect(result.total_bdt).toBe(10850);
  });

  test('returns floor_fare_bdt in breakdown for UI display', () => {
    const result = calculateFare(BIKE_BASIC, 1, 0);
    expect(result.floor_fare_bdt).toBe(5800);
  });
});

// ── BRTA ceiling warnings ─────────────────────────────────────────────────────

describe('calculateFare — BRTA ceiling warnings', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  test('no warnings when within ceilings', () => {
    calculateFare(BIKE_BASIC, 5, 0, CEILINGS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('warning when base_fare exceeds ceiling', () => {
    const over: PricingRow = { ...BIKE_BASIC, base_fare_bdt: 9000 };
    calculateFare(over, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('warning when per_km_bdt exceeds ceiling', () => {
    const over: PricingRow = { ...BIKE_BASIC, per_km_bdt: 3500 };
    calculateFare(over, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('warning when per_min_bdt exceeds ceiling', () => {
    const over: PricingRow = { ...BIKE_BASIC, per_min_bdt: 500 };
    calculateFare(over, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('ride not blocked when ceiling exceeded', () => {
    const over: PricingRow = { ...BIKE_BASIC, per_km_bdt: 9999 };
    const result = calculateFare(over, 5, 0, CEILINGS);
    expect(result.total_bdt).toBeGreaterThan(0);
  });

  test('no warnings when ceilings param omitted', () => {
    const over: PricingRow = { ...BIKE_BASIC, per_km_bdt: 9999 };
    expect(() => calculateFare(over, 5, 0)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── Integer arithmetic ────────────────────────────────────────────────────────

describe('calculateFare — integer arithmetic', () => {
  test('distance_charge is always an integer', () => {
    // 775 × 1.333... = 1033 (rounded)
    const result = calculateFare(BIKE_BASIC, 1.333333, 0);
    expect(Number.isInteger(result.distance_charge_bdt)).toBe(true);
  });

  test('time_charge is always an integer', () => {
    const result = calculateFare(BIKE_BASIC, 5, 7);
    expect(Number.isInteger(result.time_charge_bdt)).toBe(true);
  });

  test('total_bdt is always an integer', () => {
    const result = calculateFare(BIKE_BASIC, 3.7, 5);
    expect(Number.isInteger(result.total_bdt)).toBe(true);
  });
});

// ── Commission calculation ────────────────────────────────────────────────────

describe('calculateFare — commission', () => {
  test('zero commission → driver_net = total_bdt', () => {
    const result = calculateFare(BIKE_BASIC, 5, 0);
    expect(result.driver_net_bdt).toBe(result.total_bdt);
  });

  test('10% commission on 5800 floor → commission 580, driver_net 5220', () => {
    const withCommission: PricingRow = { ...BIKE_BASIC, platform_commission_percent: 10 };
    // bike_basic 1km, 0min: total = floor(5800) because computed 3275 < 5800
    const result = calculateFare(withCommission, 1, 0);
    expect(result.total_bdt).toBe(5800);
    expect(result.platform_commission_bdt).toBe(580);
    expect(result.driver_net_bdt).toBe(5220);
  });

  test('10% commission on above-floor fare', () => {
    const withCommission: PricingRow = { ...BIKE_BASIC, platform_commission_percent: 10 };
    const result = calculateFare(withCommission, 10, 0);
    // total = 10250, commission = 1025, driver_net = 9225
    expect(result.total_bdt).toBe(10250);
    expect(result.platform_commission_bdt).toBe(1025);
    expect(result.driver_net_bdt).toBe(9225);
  });
});

// ── paisaToTaka ───────────────────────────────────────────────────────────────

describe('paisaToTaka', () => {
  test('divides by 100', () => {
    expect(paisaToTaka(5800)).toBe(58);
    expect(paisaToTaka(25000)).toBe(250);
    expect(paisaToTaka(0)).toBe(0);
  });
});
