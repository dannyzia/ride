import {
  VEHICLE_TYPE_VALUES,
  VEHICLE_TYPES,
  VEHICLE_TIER_ORDER,
  VEHICLE_TYPE_ZOD_ENUM,
  BODY_TYPE_VALUES,
  BODY_TYPE_ZOD_ENUM,
  type VehicleTypeEnum,
  type BodyTypeEnum,
  classifyVehicle,
  getVehicleType,
  checkDriverEligibility,
  type ClassifyVehicleInput,
} from '../vehicleTypes';

// ── Canonical registry tests ───────────────────────────────────────────────

describe('Vehicle Type Registry', () => {
  test('exactly 9 vehicle types defined', () => {
    expect(VEHICLE_TYPE_VALUES).toHaveLength(9);
  });

  test('all 9 expected values present in order', () => {
    expect(VEHICLE_TYPE_VALUES).toEqual([
      'bike_basic',
      'bike_standard',
      'bike_plus',
      'cng',
      'car_compact',
      'car_economy',
      'car_comfort',
      'car_premium',
      'car_xl',
    ]);
  });

  test('VEHICLE_TYPES array matches VEHICLE_TYPE_VALUES keys', () => {
    const registryKeys = VEHICLE_TYPES.map((v) => v.key);
    expect(registryKeys).toEqual([...VEHICLE_TYPE_VALUES]);
  });

  test('every VEHICLE_TYPES entry has required fields', () => {
    for (const vt of VEHICLE_TYPES) {
      expect(vt.display_en).toBeTruthy();
      expect(vt.display_bn).toBeTruthy();
      expect(typeof vt.seats).toBe('number');
      expect(typeof vt.min_age_years).toBe('number');
      expect(['bike', 'cng', 'car', 'large_car']).toContain(vt.category);
    }
  });

  test('car_compact sits between cng and car_economy in tier order', () => {
    expect(VEHICLE_TIER_ORDER.cng).toBeLessThan(VEHICLE_TIER_ORDER.car_compact);
    expect(VEHICLE_TIER_ORDER.car_compact).toBeLessThan(VEHICLE_TIER_ORDER.car_economy);
  });

  test('tier order is strictly ascending from bike_basic to car_xl', () => {
    const ordered: VehicleTypeEnum[] = [
      'bike_basic', 'bike_standard', 'bike_plus', 'cng', 'car_compact',
      'car_economy', 'car_comfort', 'car_premium', 'car_xl',
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(VEHICLE_TIER_ORDER[ordered[i]]).toBeGreaterThan(
        VEHICLE_TIER_ORDER[ordered[i - 1]],
      );
    }
  });

  test('getVehicleType returns correct definition for car_compact', () => {
    const def = getVehicleType('car_compact');
    expect(def.key).toBe('car_compact');
    expect(def.category).toBe('car');
    expect(def.seats).toBe(4);
  });

  test('getVehicleType throws for unknown type', () => {
    expect(() => getVehicleType('fake_type' as VehicleTypeEnum)).toThrow();
  });
});

// ── Zod consistency ────────────────────────────────────────────────────────

describe('Zod enum consistency', () => {
  test('VEHICLE_TYPE_ZOD_ENUM accepts all 9 values', () => {
    for (const v of VEHICLE_TYPE_VALUES) {
      const result = VEHICLE_TYPE_ZOD_ENUM.safeParse(v);
      expect(result.success).toBe(true);
    }
  });

  test('VEHICLE_TYPE_ZOD_ENUM rejects invalid value', () => {
    const result = VEHICLE_TYPE_ZOD_ENUM.safeParse('car_compact_old');
    expect(result.success).toBe(false);
  });

  test('BODY_TYPE_ZOD_ENUM accepts all 11 values', () => {
    expect(BODY_TYPE_VALUES).toHaveLength(11);
    for (const v of BODY_TYPE_VALUES) {
      const result = BODY_TYPE_ZOD_ENUM.safeParse(v);
      expect(result.success).toBe(true);
    }
  });

  test('BODY_TYPE_ZOD_ENUM rejects invalid value', () => {
    const result = BODY_TYPE_ZOD_ENUM.safeParse('pickup_truck');
    expect(result.success).toBe(false);
  });
});

// ── Classifier tests ───────────────────────────────────────────────────────

describe('classifyVehicle — auto-rickshaw', () => {
  test('auto_rickshaw body → cng', () => {
    const result = classifyVehicle({ body_type: 'auto_rickshaw' });
    expect(result.vehicle_type).toBe('cng');
    expect(result.rule).toBe('auto_rickshaw');
  });
});

describe('classifyVehicle — motorcycle/scooter bands', () => {
  test('motorcycle ≤110cc → bike_basic', () => {
    const result = classifyVehicle({ body_type: 'motorcycle', engine_cc: 80 });
    expect(result.vehicle_type).toBe('bike_basic');
    expect(result.rule).toBe('motorcycle_cc_bands');
  });

  test('motorcycle 111–150cc → bike_standard', () => {
    const result = classifyVehicle({ body_type: 'motorcycle', engine_cc: 150 });
    expect(result.vehicle_type).toBe('bike_standard');
    expect(result.rule).toBe('motorcycle_cc_bands');
  });

  test('motorcycle >150cc → bike_plus', () => {
    const result = classifyVehicle({ body_type: 'motorcycle', engine_cc: 200 });
    expect(result.vehicle_type).toBe('bike_plus');
    expect(result.rule).toBe('motorcycle_cc_bands');
  });

  test('scooter ≤110cc → bike_basic', () => {
    const result = classifyVehicle({ body_type: 'scooter', engine_cc: 100 });
    expect(result.vehicle_type).toBe('bike_basic');
  });

  test('scooter >150cc → bike_plus', () => {
    const result = classifyVehicle({ body_type: 'scooter', engine_cc: 160 });
    expect(result.vehicle_type).toBe('bike_plus');
  });
});

describe('classifyVehicle — XL', () => {
  test('van with 7 seats → car_xl', () => {
    const result = classifyVehicle({
      body_type: 'van',
      registered_seats: 7,
      engine_cc: 1500,
    });
    expect(result.vehicle_type).toBe('car_xl');
    expect(result.rule).toBe('seats_body_xl');
  });

  test('mpv with 6 seats → car_xl', () => {
    const result = classifyVehicle({
      body_type: 'mpv',
      registered_seats: 6,
      engine_cc: 1500,
    });
    expect(result.vehicle_type).toBe('car_xl');
    expect(result.rule).toBe('seats_body_xl');
  });

  test('minibus with 12 seats → car_xl', () => {
    const result = classifyVehicle({
      body_type: 'minibus',
      registered_seats: 12,
    });
    expect(result.vehicle_type).toBe('car_xl');
    expect(result.rule).toBe('seats_body_xl');
  });

  test('suv_large with 6 seats → car_xl', () => {
    const result = classifyVehicle({
      body_type: 'suv_large',
      registered_seats: 6,
    });
    expect(result.vehicle_type).toBe('car_xl');
  });

  // H1 audit test: Hiace (van, 2982cc, 10 seats) → car_xl, NOT car_premium
  test('Hiace van 2982cc 10 seats → car_xl (NOT car_premium)', () => {
    const result = classifyVehicle({
      body_type: 'van',
      engine_cc: 2982,
      registered_seats: 10,
    });
    expect(result.vehicle_type).toBe('car_xl');
    expect(result.rule).toBe('seats_body_xl');
    // XL rule fires BEFORE cc > 2000 rule — precedence verified
  });
});

describe('classifyVehicle — premium allowlist', () => {
  test('premium_match flag → car_premium', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1800,
      premium_match: true,
    });
    expect(result.vehicle_type).toBe('car_premium');
    expect(result.rule).toBe('premium_allowlist');
  });
});

describe('classifyVehicle — cc > 2000', () => {
  test('2500cc sedan → car_premium', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 2500,
    });
    expect(result.vehicle_type).toBe('car_premium');
    expect(result.rule).toBe('cc_over_2000');
  });

  test('2001cc hatchback → car_premium', () => {
    const result = classifyVehicle({
      body_type: 'hatchback',
      engine_cc: 2001,
    });
    expect(result.vehicle_type).toBe('car_premium');
  });
});

describe('classifyVehicle — SUV floor', () => {
  test('suv with 1500cc → car_comfort', () => {
    const result = classifyVehicle({
      body_type: 'suv',
      engine_cc: 1500,
    });
    expect(result.vehicle_type).toBe('car_comfort');
    expect(result.rule).toBe('suv_crossover_floor');
  });

  test('crossover with 1200cc → car_comfort', () => {
    const result = classifyVehicle({
      body_type: 'crossover',
      engine_cc: 1200,
    });
    expect(result.vehicle_type).toBe('car_comfort');
    expect(result.rule).toBe('suv_crossover_floor');
  });

  test('suv with 800cc → NOT comfort (below 1001 threshold)', () => {
    // 800cc → cc_compact_band
    const result = classifyVehicle({
      body_type: 'suv',
      engine_cc: 800,
    });
    expect(result.vehicle_type).toBe('car_compact');
    expect(result.rule).toBe('cc_compact_band');
  });
});

describe('classifyVehicle — car_compact', () => {
  test('hatchback with 800cc → car_compact', () => {
    const result = classifyVehicle({
      body_type: 'hatchback',
      engine_cc: 800,
    });
    expect(result.vehicle_type).toBe('car_compact');
    expect(result.rule).toBe('cc_compact_band');
  });

  test('sedan with 1000cc → car_compact', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1000,
    });
    expect(result.vehicle_type).toBe('car_compact');
    expect(result.rule).toBe('cc_compact_band');
  });

  test('hatchback with 1cc → car_compact (minimal cc)', () => {
    const result = classifyVehicle({
      body_type: 'hatchback',
      engine_cc: 1,
    });
    expect(result.vehicle_type).toBe('car_compact');
  });
});

describe('classifyVehicle — car_economy', () => {
  test('sedan with 1200cc → car_economy', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1200,
    });
    expect(result.vehicle_type).toBe('car_economy');
    expect(result.rule).toBe('cc_economy_band');
  });

  test('hatchback with 1500cc → car_economy', () => {
    const result = classifyVehicle({
      body_type: 'hatchback',
      engine_cc: 1500,
    });
    expect(result.vehicle_type).toBe('car_economy');
  });
});

describe('classifyVehicle — car_comfort', () => {
  test('sedan with 1800cc → car_comfort', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1800,
    });
    expect(result.vehicle_type).toBe('car_comfort');
    expect(result.rule).toBe('cc_comfort_band');
  });

  test('sedan with 1501cc → car_comfort (lower bound)', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1501,
    });
    expect(result.vehicle_type).toBe('car_comfort');
  });

  test('sedan with 2000cc → car_comfort (upper bound)', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 2000,
    });
    expect(result.vehicle_type).toBe('car_comfort');
  });
});

describe('classifyVehicle — manual review', () => {
  test('no body_type, no engine_cc → manual review', () => {
    const result = classifyVehicle({});
    expect(result.vehicle_type).toBeNull();
    expect(result.rule).toBe('manual_review');
  });

  test('van with 4 seats, not matching XL body check → manual review (no cc)', () => {
    // van with 4 seats: seats < 6, so XL rule doesn't fire
    // no cc provided → manual review
    const result = classifyVehicle({
      body_type: 'van',
      registered_seats: 4,
    });
    expect(result.vehicle_type).toBeNull();
    expect(result.rule).toBe('manual_review');
  });
});

// ── Precedence ordering ────────────────────────────────────────────────────

describe('classifyVehicle — precedence ordering', () => {
  test('auto_rickshaw body overrides cc > 2000 (rule 1 before rule 5)', () => {
    const result = classifyVehicle({
      body_type: 'auto_rickshaw',
      engine_cc: 2500,
    });
    expect(result.vehicle_type).toBe('cng');
    expect(result.rule).toBe('auto_rickshaw');
  });

  test('motorcycle body overrides XL seats (rule 2 before rule 5)', () => {
    const result = classifyVehicle({
      body_type: 'motorcycle',
      engine_cc: 150,
      registered_seats: 7, // hypothetical
    });
    expect(result.vehicle_type).toBe('bike_standard');
  });

  test('premium allowlist overrides cc bands (rule 6 before rules 7-11)', () => {
    const result = classifyVehicle({
      body_type: 'sedan',
      engine_cc: 1800,
      premium_match: true,
    });
    expect(result.vehicle_type).toBe('car_premium');
    expect(result.rule).toBe('premium_allowlist');
  });

  test('cc > 2000 overrides SUV floor (rule 7 before rule 8)', () => {
    const result = classifyVehicle({
      body_type: 'suv',
      engine_cc: 2500,
    });
    expect(result.vehicle_type).toBe('car_premium');
    expect(result.rule).toBe('cc_over_2000');
  });

  test('SUV floor overrides CC bands (rule 8 before rules 9-11)', () => {
    const result = classifyVehicle({
      body_type: 'suv',
      engine_cc: 1200,
    });
    expect(result.vehicle_type).toBe('car_comfort');
    expect(result.rule).toBe('suv_crossover_floor');
  });
});

// ── Driver eligibility ─────────────────────────────────────────────────────

describe('checkDriverEligibility', () => {
  test('car_premium requires 50 rides and 4.5 rating', () => {
    const result = checkDriverEligibility('car_premium', {
      completed_rides_count: 30,
      rating: 4.8,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('50');
  });

  test('car_premium with insufficient rating', () => {
    const result = checkDriverEligibility('car_premium', {
      completed_rides_count: 60,
      rating: 4.0,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('4.5');
  });

  test('car_premium with sufficient metrics', () => {
    const result = checkDriverEligibility('car_premium', {
      completed_rides_count: 50,
      rating: 4.5,
    });
    expect(result.eligible).toBe(true);
  });

  test('car_compact has no driver requirements', () => {
    const result = checkDriverEligibility('car_compact', {
      completed_rides_count: 0,
      rating: 3.0,
    });
    expect(result.eligible).toBe(true);
  });

  test('bike_basic has no driver requirements', () => {
    const result = checkDriverEligibility('bike_basic', {
      completed_rides_count: 0,
      rating: 0,
    });
    expect(result.eligible).toBe(true);
  });

  test('car_xl requires 25 rides and 4.3 rating', () => {
    const result = checkDriverEligibility('car_xl', {
      completed_rides_count: 10,
      rating: 4.3,
    });
    expect(result.eligible).toBe(false);
  });
});

// ── Body type values ───────────────────────────────────────────────────────

describe('Body Type Registry', () => {
  test('exactly 11 body types', () => {
    expect(BODY_TYPE_VALUES).toHaveLength(11);
  });

  test('all expected values present', () => {
    expect(BODY_TYPE_VALUES).toEqual([
      'motorcycle', 'scooter', 'auto_rickshaw', 'hatchback', 'sedan',
      'crossover', 'suv', 'suv_large', 'mpv', 'van', 'minibus',
    ]);
  });
});
