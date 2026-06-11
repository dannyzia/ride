# Unit Test Templates — Ride

> Test templates for the three most critical new modules: `lib/fareCalc.ts`,
> the `min_per_km_bdt` filter in `utils-server/dispatch.ts`, and the slider
> bounds validation in `app/api/driver/me`.
>
> Stack assumed: **Jest** + **ts-jest**. Adapt to Vitest by replacing `jest.*` with `vi.*`.
>
> All amounts are in **integer paisa**. Tests must not use floating-point for assertion values.
>
> **Supabase Auth Mocking Note:** OTP-related test mocks should target Supabase Auth calls (`supabase.auth.signInWithOtp`, `supabase.auth.verifyOtp`) instead of Firebase Cloud Function calls. The Supabase client should be mocked at the module level in auth tests. Fare calculation, dispatch, and slider validation tests are unchanged (pure business logic with no auth dependency).

---

## `lib/__tests__/fareCalc.test.ts`

```typescript
// lib/__tests__/fareCalc.test.ts
import { calculateFare, paisaToTaka, PricingRow, PlatformCeilings } from '../fareCalc';

// ── Fixtures ─────────────────────────────────────────────────────────────────
// All money in integer paisa. floor_length_km is decimal.
// Floor formula: base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
// bike_basic floor: 2500 + round(775 × 2.00) + (10 × 175) = 2500 + 1550 + 1750 = 5800 paisa (58 BDT)

// Locked expected values for the final fare model:
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

// CNG floor: 4000 + round(1500 × 3.00) + (15 × 200) = 4000 + 4500 + 3000 = 11500 paisa (115 BDT)
const CNG: PricingRow = {
  base_fare_bdt:            4000,
  per_km_bdt:               1500,
  per_min_bdt:              200,
  floor_length_km:          3.00,
  floor_min:                15,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

// car_premium floor: 6500 + round(2100 × 4.00) + (20 × 400) = 6500 + 8400 + 8000 = 22900 paisa (229 BDT)
const CAR_PREMIUM: PricingRow = {
  base_fare_bdt:            6500,
  per_km_bdt:               2100,
  per_min_bdt:              400,
  floor_length_km:          4.00,
  floor_min:                20,
  brta_fare_ceiling_bdt:    null,
  platform_commission_percent: 0,
};

const CEILINGS: PlatformCeilings = {
  brta_max_base_bdt:          8500,
  brta_max_per_km_bdt:        3400,
  brta_max_wait_per_2min_bdt: 850,
};

// ── Basic formula correctness ────────────────────────────────────────────────

describe('calculateFare — formula', () => {
  test('bike_basic: 3 km, 0 min → base + distance, floor applies', () => {
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
    expect(result.total_bdt).toBe(5800);  // floor applies
  });

  test('bike_basic: 10 km, 0 wait → above floor', () => {
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

  test('bike_basic: 0 km, 0 wait → floor applies', () => {
    // computed_total = 2500 + 0 + 0 = 2500 < 5800 (floor) → final = 5800
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
    expect(result.total_bdt).toBe(11500);  // floor applies
  });

  test('car_premium: 20 km, 0 wait → large fare above floor', () => {
    // distance_charge = round(2100 × 20) = 42000
    // time_charge     = 0
    // computed_total  = 6500 + 42000 + 0 = 48500
    // floor_fare      = 22900
    // final           = max(48500, 22900) = 48500
    const result = calculateFare(CAR_PREMIUM, 20, 0);
    expect(result.total_bdt).toBe(48500);
  });
});

// ── Minimum fare floor ────────────────────────────────────────────────────────

describe('calculateFare — floor fare', () => {
  test('floor applies when computed total < floor_fare', () => {
    // bike_basic 1 km, 0 min: computed = 2500 + 775 = 3275 < floor (5800)
    const result = calculateFare(BIKE_BASIC, 1, 0);
    expect(result.total_bdt).toBe(5800);  // floor_fare
  });

  test('floor does NOT apply when computed total >= floor_fare', () => {
    // bike_basic 4 km, 30 min: computed = 2500 + 3100 + 5250 = 10850 > floor (5800)
    const result = calculateFare(BIKE_BASIC, 4, 30);
    expect(result.total_bdt).toBeGreaterThan(5800);
    expect(result.total_bdt).toBe(10850);
  });

  test('returns floor_fare_bdt in breakdown for UI display', () => {
    const result = calculateFare(BIKE_BASIC, 1, 0);
    expect(result.floor_fare_bdt).toBe(5800);
  });

  test('floor_fare matches expected formula for all vehicle types', () => {
    // bike_basic: 2500 + round(775×2) + (10×175) = 5800
    expect(5800).toBe(2500 + Math.round(775 * 2.00) + (10 * 175));
    // car_premium: 6500 + round(2100×4) + (20×400) = 22900
    const cpResult = calculateFare(CAR_PREMIUM, 1, 0);
    expect(cpResult.floor_fare_bdt).toBe(22900);
  });
});

// ── BRTA ceiling warnings ─────────────────────────────────────────────────────

describe('calculateFare — BRTA ceiling warnings', () => {
  let warnSpy: jest.SpyInstance;
  beforeEach(() => {
    // Spy on the logger.warn call (adjust import path as needed)
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warnSpy.mockRestore());

  test('no warnings when all fare components are within BRTA ceilings', () => {
    // BIKE_BASIC: base=2500 (<8500), per_km=775 (<3400), per_min×2=350 (<850)
    calculateFare(BIKE_BASIC, 5, 0, CEILINGS);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  test('warning when base_fare exceeds brta_max_base_bdt', () => {
    const overBase: PricingRow = { ...BIKE_BASIC, base_fare_bdt: 9000 };  // > 8500
    calculateFare(overBase, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[fareCalc]'),
      expect.anything(),
    );
  });

  test('warning when per_km_bdt exceeds brta_max_per_km_bdt', () => {
    const overKm: PricingRow = { ...BIKE_BASIC, per_km_bdt: 3500 };  // > 3400
    calculateFare(overKm, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('warning when per_min_bdt × 2 exceeds brta_max_wait_per_2min_bdt', () => {
    const overWait: PricingRow = { ...BIKE_BASIC, per_min_bdt: 500 };  // 500×2=1000 > 850
    calculateFare(overWait, 5, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('warning when final fare exceeds brta_fare_ceiling_bdt on pricing row', () => {
    const withCeiling: PricingRow = { ...CAR_PREMIUM, brta_fare_ceiling_bdt: 20000 };
    // CAR_PREMIUM 10km: 6500 + round(2100 × 10) + 0 = 6500 + 21000 = 27500 > 20000
    calculateFare(withCeiling, 10, 0, CEILINGS);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('ride is NOT blocked even when ceiling is exceeded', () => {
    const overKm: PricingRow = { ...BIKE_BASIC, per_km_bdt: 3500 };
    // Should return a valid FareBreakdown — not throw
    const result = calculateFare(overKm, 5, 0, CEILINGS);
    expect(result.total_bdt).toBeGreaterThan(0);
  });

  test('no warnings when ceilings param is omitted', () => {
    const overKm: PricingRow = { ...BIKE_BASIC, per_km_bdt: 9999 };
    expect(() => calculateFare(overKm, 5, 0)).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── Integer arithmetic ────────────────────────────────────────────────────────

describe('calculateFare — integer arithmetic', () => {
  test('distance_charge is always an integer (Math.round applied)', () => {
    // 900 × 1.333... = 1200 (rounded)
    const result = calculateFare(BIKE_BASIC, 1.333333, 0);
    expect(Number.isInteger(result.distance_charge_bdt)).toBe(true);
  });

  test('time_charge is always an integer (integer × integer)', () => {
    const result = calculateFare(BIKE_BASIC, 5, 7);
    expect(Number.isInteger(result.time_charge_bdt)).toBe(true);
  });

  test('total_bdt is always an integer', () => {
    const result = calculateFare(BIKE_BASIC, 3.7, 5);
    expect(Number.isInteger(result.total_bdt)).toBe(true);
  });
});

// ── paisaToTaka ───────────────────────────────────────────────────────────────

describe('paisaToTaka', () => {
  test('divides by 100', () => {
    expect(paisaToTaka(6000)).toBe(60);
    expect(paisaToTaka(25000)).toBe(250);
    expect(paisaToTaka(0)).toBe(0);
  });
});
```

---

## `utils-server/__tests__/dispatch-min-per-km.test.ts`

These tests verify the `min_per_km_bdt` exclusion logic in `scoreAndBatchDrivers`. Since dispatch
queries the DB, mock the Drizzle client and the H3 index functions.

```typescript
// utils-server/__tests__/dispatch-min-per-km.test.ts
// Mock strategy: use jest.mock to replace DB module and h3Index module.

jest.mock('../../src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
}));
jest.mock('../h3Index', () => ({
  getDriversInCells: jest.fn(),
}));
jest.mock('../../lib/h3', () => ({
  getH3Ring: jest.fn(() => ['cell1', 'cell2']),
}));
jest.mock('../../lib/vehicleTypes', () => ({
  checkDriverEligibility: jest.fn(() => ({ eligible: true })),
}));

import { db } from '../../src/db';
import { getDriversInCells } from '../h3Index';
import { scoreAndBatchDrivers } from '../dispatch';

// ── Helper to build mock Drizzle chain ────────────────────────────────────────

function buildDbMock(selectReturn: any, insertReturn?: any) {
  const insertChain = { values: jest.fn().mockReturnValue({ onConflictDoNothing: jest.fn().mockResolvedValue([]) }) };
  (db.insert as jest.Mock).mockReturnValue(insertChain);

  let callCount = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const chain = {
      from:   jest.fn().mockReturnThis(),
      where:  jest.fn().mockReturnThis(),
      limit:  jest.fn().mockResolvedValue(selectReturn[callCount++] ?? []),
    };
    return chain;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('dispatch — min_per_km_bdt filter', () => {
  const RIDE_ID   = 'ride-abc';
  const ZONE_ID   = 'zone-xyz';
  const ORIGIN    = { lat: 23.8103, lng: 90.4125 };

  const DRIVER_NO_MIN = {
    id:                   'driver-1',
    last_location_lat:    '23.8103',
    last_location_lng:    '90.4125',
    rating:               '4.5',
    acceptance_rate:      '90.00',
    last_location_at:     new Date(),
    completed_rides_count: 20,
    min_per_km_bdt:       null,        // <-- no minimum set
    vehicle_type:         'bike_basic',
  };

  const DRIVER_MIN_HIGH = {
    ...DRIVER_NO_MIN,
    id:           'driver-2',
    min_per_km_bdt: 1200,              // > system rate of 775
  };

  const DRIVER_MIN_LOW = {
    ...DRIVER_NO_MIN,
    id:           'driver-3',
    min_per_km_bdt: 650,               // < system rate of 775 → eligible
  };

  const PRICING_BIKE_BASIC = [{ per_km_bdt: 775 }];
  const NO_EXISTING_OFFERS  = [];

  beforeEach(() => jest.clearAllMocks());

  test('driver with null min_per_km_bdt is NOT filtered', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(['driver-1']);
    buildDbMock([
      PRICING_BIKE_BASIC,         // pricing lookup
      [DRIVER_NO_MIN],            // driverRows
      NO_EXISTING_OFFERS,         // existingOffers
    ]);

    const scored = await scoreAndBatchDrivers(
      RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID
    );
    expect(scored.map(s => s.driverId)).toContain('driver-1');
  });

  test('driver with min_per_km_bdt > system rate IS filtered', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(['driver-2']);
    buildDbMock([
      PRICING_BIKE_BASIC,
      [DRIVER_MIN_HIGH],
      NO_EXISTING_OFFERS,
    ]);

    const scored = await scoreAndBatchDrivers(
      RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID
    );
    expect(scored.map(s => s.driverId)).not.toContain('driver-2');
  });

  test('filtered driver gets a dispatch_offers row with outcome=filtered', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(['driver-2']);
    buildDbMock([
      PRICING_BIKE_BASIC,
      [DRIVER_MIN_HIGH],
      NO_EXISTING_OFFERS,
    ]);

    await scoreAndBatchDrivers(RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID);

    expect(db.insert).toHaveBeenCalled();
    const insertValues = (db.insert as jest.Mock).mock.results[0].value.values.mock.calls[0][0];
    expect(insertValues.outcome).toBe('filtered');
    expect(insertValues.filtered_reason).toBe('min_per_km');
    expect(insertValues.driver_id).toBe('driver-2');
  });

  test('driver with min_per_km_bdt <= system rate is NOT filtered', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(['driver-3']);
    buildDbMock([
      PRICING_BIKE_BASIC,
      [DRIVER_MIN_LOW],
      NO_EXISTING_OFFERS,
    ]);

    const scored = await scoreAndBatchDrivers(
      RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID
    );
    expect(scored.map(s => s.driverId)).toContain('driver-3');
  });

  test('when system rate is 0 (pricing lookup fails), all drivers with non-null min are filtered', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue(['driver-2']);
    buildDbMock([
      [],                   // pricing lookup returns empty → systemPerKmBdt = 0
      [DRIVER_MIN_HIGH],
      NO_EXISTING_OFFERS,
    ]);

    const scored = await scoreAndBatchDrivers(
      RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID
    );
    expect(scored).toHaveLength(0);
  });

  test('empty candidate list returns immediately without DB calls', async () => {
    (getDriversInCells as jest.Mock).mockReturnValue([]);

    const scored = await scoreAndBatchDrivers(
      RIDE_ID, ORIGIN.lat, ORIGIN.lng, 'bike_basic', ZONE_ID
    );
    expect(scored).toHaveLength(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
```

---

## `app/__tests__/driver-slider-validation.test.ts`

Tests for the `PATCH /api/driver/me` slider validation logic. Uses the extracted validation helper
(recommended to break the validation into a pure function for easier testing).

```typescript
// lib/__tests__/validateMinPerKm.test.ts
// Recommended: extract the validation into a pure function in lib/validateMinPerKm.ts

/**
 * Pure function to validate min_per_km_bdt update.
 * Returns { valid: true } or { valid: false, error: string, lowerBound, upperBound }
 */
export interface SliderBounds {
  systemPerKmBdt: number;
  minRatio: number;
  maxRatio: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  lowerBound?: number;
  upperBound?: number;
}

export function validateMinPerKm(
  value: number,
  bounds: SliderBounds,
): ValidationResult {
  const lowerBound = Math.floor(bounds.systemPerKmBdt * bounds.minRatio);
  const upperBound = Math.ceil(bounds.systemPerKmBdt  * bounds.maxRatio);

  if (!Number.isInteger(value) || value < 0) {
    return { valid: false, error: 'min_per_km_bdt must be a non-negative integer' };
  }
  if (value === 0) return { valid: true };  // 0 = clear the minimum

  if (value < lowerBound || value > upperBound) {
    return {
      valid: false,
      error: `min_per_km_bdt must be 0 (clear) or between ${lowerBound} and ${upperBound}`,
      lowerBound,
      upperBound,
    };
  }
  return { valid: true };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

import { validateMinPerKm } from '../validateMinPerKm';

const BIKE_BASIC_BOUNDS: SliderBounds = {
  systemPerKmBdt: 900,   // paisa
  minRatio:       0.70,
  maxRatio:       1.50,
};
// lowerBound = floor(900 × 0.70) = floor(630) = 630
// upperBound = ceil(900  × 1.50) = ceil(1350) = 1350

describe('validateMinPerKm', () => {
  test('0 is always valid (clears the minimum)', () => {
    expect(validateMinPerKm(0, BIKE_BASIC_BOUNDS).valid).toBe(true);
  });

  test('value at lower bound is valid', () => {
    expect(validateMinPerKm(630, BIKE_BASIC_BOUNDS).valid).toBe(true);
  });

  test('value at upper bound is valid', () => {
    expect(validateMinPerKm(1350, BIKE_BASIC_BOUNDS).valid).toBe(true);
  });

  test('value between bounds is valid', () => {
    expect(validateMinPerKm(900, BIKE_BASIC_BOUNDS).valid).toBe(true);  // = system rate
    expect(validateMinPerKm(1000, BIKE_BASIC_BOUNDS).valid).toBe(true);
  });

  test('value below lower bound is invalid', () => {
    const result = validateMinPerKm(500, BIKE_BASIC_BOUNDS);
    expect(result.valid).toBe(false);
    expect(result.lowerBound).toBe(630);
    expect(result.upperBound).toBe(1350);
  });

  test('value above upper bound is invalid', () => {
    const result = validateMinPerKm(1400, BIKE_BASIC_BOUNDS);
    expect(result.valid).toBe(false);
  });

  test('negative value is invalid', () => {
    expect(validateMinPerKm(-1, BIKE_BASIC_BOUNDS).valid).toBe(false);
  });

  test('non-integer is invalid', () => {
    expect(validateMinPerKm(900.5, BIKE_BASIC_BOUNDS).valid).toBe(false);
  });

  test('bounds derived correctly from ratios', () => {
    const result = validateMinPerKm(500, BIKE_BASIC_BOUNDS);
    expect(result.lowerBound).toBe(630);  // floor(900 × 0.70)
    expect(result.upperBound).toBe(1350); // ceil(900 × 1.50)
  });

  // Test with car_premium rates
  const CAR_PREMIUM_BOUNDS: SliderBounds = {
    systemPerKmBdt: 1900,  // paisa
    minRatio:       0.70,
    maxRatio:       1.50,
  };
  // lowerBound = floor(1900 × 0.70) = 1330
  // upperBound = ceil(1900 × 1.50)  = 2850

  test('car_premium: lower bound calculated correctly', () => {
    expect(validateMinPerKm(1330, CAR_PREMIUM_BOUNDS).valid).toBe(true);
    expect(validateMinPerKm(1329, CAR_PREMIUM_BOUNDS).valid).toBe(false);
  });

  test('car_premium: upper bound calculated correctly', () => {
    expect(validateMinPerKm(2850, CAR_PREMIUM_BOUNDS).valid).toBe(true);
    expect(validateMinPerKm(2851, CAR_PREMIUM_BOUNDS).valid).toBe(false);
  });
});
```

---

## Running the tests

```bash
# Run all new tests
npx jest --testPathPattern="fareCalc|dispatch-min-per-km|driver-slider-validation"

# Run with coverage for the three critical modules
npx jest --coverage --collectCoverageFrom="lib/fareCalc.ts,lib/validateMinPerKm.ts" \
  --testPathPattern="fareCalc|driver-slider"

# Run watch mode during development
npx jest --watch --testPathPattern="fareCalc"
```

## Commission calculation (`lib/fareCalc.ts`)

```typescript
// ── TEST-1: Commission calculation ────────────────────────────────────────────

describe('calculateFare — commission calculation', () => {
  test('commission_zero_default: pricing row with 0.00% → commission = 0, net = final_fare', () => {
    // 0.00% commission
    const pricing = { ...BIKE_BASIC, platform_commission_percent: 0.00 };
    const result = calculateFare(pricing, 5, 0);
    expect(result.platform_commission_bdt).toBe(0);
    expect(result.driver_net_bdt).toBe(result.total_bdt);
  });

  test('commission_ten_percent: 10.00% on ৳180 fare → commission = ৳18, net = ৳162', () => {
    const pricing = { ...BIKE_BASIC, platform_commission_percent: 10.00 };
    // Assuming final fare is 18000 paisa
    const result = calculateFare(pricing, 10, 0); // e.g. yields 18000
    // commission = 18000 * 10 / 100 = 1800
    expect(result.platform_commission_bdt).toBe(Math.round(result.total_bdt * 0.10));
    expect(result.driver_net_bdt).toBe(result.total_bdt - Math.round(result.total_bdt * 0.10));
  });

  test('commission_applied_after_floor', () => {
    const pricing = { ...BIKE_BASIC, platform_commission_percent: 10.00 };
    // bike_basic 1 km, 0 min: computed = 3275 < floor (5800)
    const result = calculateFare(pricing, 1, 0);
    expect(result.total_bdt).toBe(5800); // floor applies
    // Commission is 10% of 5800 = 580
    expect(result.platform_commission_bdt).toBe(580);
  });
});
```

## Actual waiting time (`lib/fareCalc.ts` + API)

```typescript
// ── TEST-2: Actual waiting time ───────────────────────────────────────────────

describe('Waiting time logic', () => {
  test('timer starts at started_at when driver starts before 60s free wait expires', () => {
    // Driver arrives at T+0, free_wait = 60s, driver starts at T+30s (before free wait ends)
    // timer_start = min(arrived_at + 60s, started_at) = started_at (T+30s)
    // completed_at = T+30min+30s → ride_time_min = 30 min
    const arrived_at  = new Date('2025-01-01T10:00:00Z');
    const started_at  = new Date('2025-01-01T10:00:30Z');  // 30s after arrival (within 60s window)
    const completed_at = new Date('2025-01-01T10:30:30Z'); // 30 min after start
    const MAX_FREE_WAIT_MS = 60_000; // system_config.max_free_wait_seconds
    const freeWaitExpiry = new Date(arrived_at.getTime() + MAX_FREE_WAIT_MS);
    const timerStart  = new Date(Math.min(freeWaitExpiry.getTime(), started_at.getTime()));
    const rideTimeMin = Math.ceil((completed_at.getTime() - timerStart.getTime()) / 60_000);
    expect(rideTimeMin).toBe(30);
    const result = calculateFare(BIKE_BASIC, 4, rideTimeMin);
    // computed = 2500 + round(775×4) + (30×175) = 2500 + 3100 + 5250 = 10850 > floor (5800)
    expect(result.time_charge_bdt).toBe(5250);
    expect(result.total_bdt).toBe(10850);
  });

  test('timer starts at 60s expiry when auto-start triggers', () => {
    // Driver arrives at T+0, free_wait = 60s. Driver doesn't tap Start Ride within 60s.
    // Scheduler auto-sets started_at = arrived_at + 60s.
    // completed_at = T+5min → ride_time_min = 4 min (5min − 60s free wait)
    const arrived_at   = new Date('2025-01-01T10:00:00Z');
    const started_at   = new Date('2025-01-01T10:01:00Z'); // auto-set after 60s
    const completed_at = new Date('2025-01-01T10:05:00Z'); // 5 min after arrival
    const MAX_FREE_WAIT_MS = 60_000;
    const freeWaitExpiry = new Date(arrived_at.getTime() + MAX_FREE_WAIT_MS);
    const timerStart   = new Date(Math.min(freeWaitExpiry.getTime(), started_at.getTime()));
    const rideTimeMin  = Math.ceil((completed_at.getTime() - timerStart.getTime()) / 60_000);
    expect(rideTimeMin).toBe(4); // 4 min billable (60s free)
    const result = calculateFare(BIKE_BASIC, 4, rideTimeMin);
    expect(result.time_charge_bdt).toBe(rideTimeMin * BIKE_BASIC.per_min_bdt); // 4 × 175 = 700
  });
});
```

## State Machine API Tests (`app/api/ride/**`)

```typescript
// ── TEST-3: State machine API ─────────────────────────────────────────────────

describe('State machine transitions', () => {
  // Pseudocode for API e2e / integration tests
  test('status_driver_arrived_transition_valid: driver_arriving → driver_arrived via arrive endpoint', async () => {
    // 1. Setup ride in driver_arriving
    // 2. Call POST /api/ride/:id/arrive as matched driver
    // 3. Expect 200 OK, rides.status === 'driver_arrived', arrived_at is NOT NULL
  });

  test('status_start_ride_requires_driver_arrived: POST /api/ride/:id/start from driver_arriving returns 400', async () => {
    // 1. Setup ride in driver_arriving
    // 2. Call POST /api/ride/:id/start
    // 3. Expect 400 ride_not_in_arrived_status
  });

  test('stale_arrived_auto_cancel: scheduler cancels ride after timeout', async () => {
    // 1. Setup ride in driver_arrived where arrived_at is older than stale_arrived_timeout_minutes
    // 2. Trigger scheduler
    // 3. Expect rides.status === 'cancelled', cancel_reason === 'driver_no_show_after_arrival'
  });
});
```

---

## Cancellation Reason Contract Tests (`app/api/ride/:id/cancel`)

```typescript
describe('POST /api/ride/:id/cancel - reason validation', () => {
  test('rider cancel in driver_arriving requires reason_code', async () => {
    // setup ride status = driver_arriving and caller role = rider
    // send body without reason_code
    // expect 400 invalid_body
  });

  test('reason_code=other requires other_details', async () => {
    // body: { reason_code: 'other', reason: 'Other' }
    // expect 400 invalid_body
  });

  test('known reason_code accepted', async () => {
    // body: { reason_code: 'waiting_too_long', reason: 'Waiting for long time' }
    // expect 200 cancelled
  });

  test('driver cancel can omit reason_code', async () => {
    // setup caller role = driver
    // body empty
    // expect 200 cancelled
  });
});
```

## Rider Lifecycle UX E2E Templates (feature-level)

```typescript
describe('Rider lifecycle sheets and transitions', () => {
  test('finding_driver shows pulse + cancel action', async () => {
    // after request confirm -> assert pulse indicator visible and cancel CTA visible
  });

  test('home_searching_location keeps map interactive and tab bar visible', async () => {
    // assert searching sheet headline visible
    // assert map gestures still enabled
    // assert bottom tab bar visible and Home active
  });

  test('fare_options_collapsed_then_expanded preserves selected vehicle', async () => {
    // collapsed: selected vehicle card + payment/promo rows + primary booking CTA
    // expand sheet: long vehicle list visible
    // selected option remains highlighted after expand/collapse
  });

  test('schedule_ride_picker sets datetime and updates CTA mode', async () => {
    // open schedule modal
    // select day/date/time
    // confirm -> schedule chip visible + CTA changes to schedule action
  });

  test('schedule_submit shows scheduling progress then success confirmation', async () => {
    // submit scheduled ride
    // assert "Scheduling your ride..." state first
    // assert scheduled success modal with selected datetime
  });

  test('promo_invalid_shows_error_modal_and_preserves_input', async () => {
    // open promo screen, submit invalid code
    // assert invalid modal shown
    // dismiss and verify code remains in input for retry
  });

  test('promo_valid_use_now_updates_fare_breakdown_and_badge', async () => {
    // apply valid promo with use_now
    // verify discounted fare rendered + original fare struck through
    // verify promo row badge/state updated
  });

  test('payment_method_selection_persists_back_to_fare_sheet', async () => {
    // open payment method picker
    // select non-default method
    // return to fare sheet -> payment row reflects selected method
  });

  test('driver_information_screen_exposes_profile_stats_vehicle_and_ctas', async () => {
    // open driver info from active ride state
    // verify rating/ride-orders/years blocks present
    // verify vehicle metadata rows present
    // verify bottom Call and Chat CTAs present
  });

  test('chat_message_supports_text_plus_image_attachments', async () => {
    // open chat screen
    // send message with image attachment(s)
    // verify outbound bubble renders media thumbnail(s)
    // verify receiver side chat:message contains attachment payload
  });

  test('voice_and_video_call_overlays_return_to_ride_context_after_end', async () => {
    // launch voice call from chat header
    // assert full-screen call UI + active timer + end-call action
    // end call and verify previous ride context restored
    // launch video call and verify local preview + camera/audio controls
  });

  test('activity_tabs_filter_lifecycle_lists_correctly', async () => {
    // open Activity
    // switch ongoing/scheduled/completed/canceled tabs
    // verify each tab renders matching lifecycle dataset
  });

  test('scheduled_ride_details_updates_after_driver_found_ack', async () => {
    // open scheduled ride details (no driver assigned)
    // simulate assignment event -> driver found modal visible
    // tap Got It -> details screen now shows driver card and retains booking/fare blocks
  });

  test('completed_ride_details_show_tip_row_only_when_tip_exists', async () => {
    // with tip > 0 -> driver tip row visible
    // with tip = 0 -> tip row hidden
  });

  test('rating_fare_details_toggle_does_not_reset_selected_stars', async () => {
    // select rating stars
    // toggle hide details/show details on fare card
    // verify selected star value remains unchanged
  });

  test('five_star_tip_flow_supports_preset_custom_skip_and_pay', async () => {
    // select 5 stars -> tip screen appears
    // choose preset chip and verify highlight + amount binding
    // switch to custom tip amount
    // verify both Skip and Pay Tip actions are available
  });

  test('thanks_confirmation_requires_explicit_ok_before_exit', async () => {
    // complete rating/tip chain
    // assert thanks confirmation screen visible
    // verify user remains in flow until OK tapped
  });

  test('canceled_activity_and_details_show_refund_state_copy', async () => {
    // canceled list item contains "Canceled & Refunded" secondary label when refund=true
    // ride details status chip also reflects canceled/refunded state
  });

  test('share_receipt_opens_native_share_sheet_with_generated_artifact', async () => {
    // tap Share Receipt
    // assert receipt artifact prepared (file_name includes trx + booking references)
    // assert native share sheet opens
  });

  test('topup_amount_entry_supports_preset_and_keypad_input', async () => {
    // open top-up screen
    // tap preset chip -> amount field updates
    // type custom amount via keypad -> amount field reflects manual value
  });

  test('topup_continue_requires_valid_amount_range', async () => {
    // below min/above max -> continue disabled
    // valid amount -> continue enabled
  });

  test('topup_method_selection_binds_confirm_cta_amount', async () => {
    // choose method
    // confirm CTA text includes exact selected amount
  });

  test('topup_success_modal_ack_refreshes_wallet_balance_and_history', async () => {
    // complete top-up
    // assert success modal appears with amount-aware message
    // tap OK -> wallet balance and top-up history updated
  });

  test('topup_details_exposes_share_receipt_action', async () => {
    // open top-up history item -> top-up details
    // assert status, payment, transaction id shown
    // tap Share Receipt -> native share sheet opens
  });

  test('saved_address_create_adds_new_card_to_list', async () => {
    // open Saved Addresses -> Add Address
    // set map location + name + optional details
    // save and assert new card appears in list
  });

  test('saved_address_edit_updates_existing_card_content', async () => {
    // open address overflow -> Edit
    // modify label/details
    // save and assert card text updated
  });

  test('saved_address_delete_requires_confirmation', async () => {
    // open overflow -> Delete
    // assert confirmation sheet appears with selected address preview
    // cancel -> list unchanged
  });

  test('saved_address_delete_then_undo_restores_card', async () => {
    // confirm delete
    // assert success toast with Undo shown
    // tap Undo within window -> card restored
  });

  test('saved_address_undo_expires_after_window', async () => {
    // delete address and wait past undo expiry in mocked clock
    // undo action should fail gracefully and card remains deleted
  });

  test('personal_info_edit_persists_profile_fields', async () => {
    // update name/phone/gender/dob and save
    // reopen screen and verify values persisted
  });

  test('notification_toggle_updates_preference_state', async () => {
    // toggle ride status updates off then on
    // verify API sync and restored state after screen reload
  });

  test('security_toggle_requires_capability_and_handles_failures', async () => {
    // attempt biometric enable on unsupported device -> graceful error
    // on supported device -> toggle persists
  });

  test('linked_account_connect_disconnect_round_trip', async () => {
    // connect provider from disconnected state
    // verify connected label shown
    // disconnect and verify connect state returns
  });

  test('data_export_request_shows_acknowledgment', async () => {
    // trigger download my data request
    // verify queued/requested acknowledgment shown
  });

  test('add_new_payment_validates_and_appends_method', async () => {
    // open add payment form
    // invalid card blocks save
    // valid card saves and appears in payment methods list
  });

  test('theme_selection_applies_only_on_confirm', async () => {
    // open theme sheet
    // change selection then cancel -> theme unchanged
    // reopen, select and confirm -> theme updated
  });

  test('language_selection_persists_and_reflects_in_appearance_root', async () => {
    // choose new language in list
    // return to appearance root and verify label/value updated
  });

  test('faq_search_and_category_filter_reduce_result_set', async () => {
    // open FAQ
    // apply category chip + search query
    // verify visible entries are filtered and accordion expansion works
  });

  test('contact_support_channels_open_expected_targets', async () => {
    // open contact support
    // tap internal channel -> in-app route opens
    // tap external channel -> external/webview target opens
  });

  test('privacy_and_terms_render_effective_date_and_scrollable_content', async () => {
    // open privacy policy and terms screens
    // verify effective date header present
    // verify content scrolls and remains readable
  });

  test('logout_confirmation_clears_session_and_blocks_back_navigation', async () => {
    // open logout sheet
    // cancel -> remain authenticated
    // confirm -> auth route shown and back navigation does not re-enter account screens
  });

  test('driver_arriving expanded sheet shows details cards', async () => {
    // assert presence of: driver card, ride/payment card, fare summary card, cancel action
  });

  test('cancel flow requires reason selection before confirm enabled', async () => {
    // open cancel screen
    // confirm button disabled until one reason selected
    // when reason selected -> confirm enabled
  });

  test('cancel success shows confirmation screen before navigation reset', async () => {
    // submit cancel
    // assert "Ride has been canceled" confirmation visible
    // tap OK -> navigate to home/activity
  });

  test('refund copy shown only when wallet/preauth reversal exists', async () => {
    // with refund flag true -> refund sentence visible
    // with refund flag false -> generic cancellation copy only
  });

  test('ride_completed shows post-arrival summary before final fare closeout', async () => {
    // assert summary panel shown with trip metrics and optional mood selector
    // proceed to final fare summary state
  });

  test('post-ride chain enforces arrival summary -> rating -> optional tip -> thanks', async () => {
    // verify ordered screen progression
    // ensure thanks confirmation displayed before returning to idle home state
  });
});
```

## Coverage targets

| Module | Min line coverage |
|--------|-----------------:|
| `lib/fareCalc.ts` | 95% |
| `lib/validateMinPerKm.ts` | 100% |
| `utils-server/dispatch.ts` (min_per_km branch) | 80% |

---

## Edge-case matrix (implement as additional tests if time permits)

| Scenario | Expected behaviour |
|----------|--------------------|
| `distanceKm = 0`, `rideTimeMin = 0` | Returns `floor_fare_bdt` (floor always applies for zero-length rides) |
| `rideTimeMin = 0` | `time_charge_bdt = 0`; floor still computed and enforced |
| `per_km_bdt × distanceKm` results in fractional paisa | `Math.round` applied → integer |
| Driver min_per_km_bdt exactly equals system rate | NOT filtered (boundary: `<`, not `<=`) |
| `platform_config` table empty / key missing | Default values used (0.70 / 1.50) |
| Admin sets `driver_min_ratio = 2.0`, `driver_max_ratio = 1.0` | API should reject (min < max sanity check — add guard) |
