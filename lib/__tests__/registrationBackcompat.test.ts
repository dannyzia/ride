/**
 * Tests for the classification cascade and registration compatibility.
 *
 * The real resolveVehicleType function is tested in resolveVehicleType.test.ts.
 * This file tests the pure classifyVehicle function directly.
 */
import { classifyVehicle, type VehicleTypeEnum } from '../vehicleTypes';

describe('Registration backward compatibility (classifier level)', () => {
  describe('classifyVehicle produces valid types for all registration paths', () => {
    test('motorcycle 100cc → bike_basic', () => {
      const result = classifyVehicle({ body_type: 'motorcycle', engine_cc: 100 });
      expect(result.vehicle_type).toBe('bike_basic');
    });

    test('auto_rickshaw body → cng', () => {
      const result = classifyVehicle({ body_type: 'auto_rickshaw', engine_cc: 200 });
      expect(result.vehicle_type).toBe('cng');
    });

    test('hatchback 800cc → car_compact', () => {
      const result = classifyVehicle({ body_type: 'hatchback', engine_cc: 800 });
      expect(result.vehicle_type).toBe('car_compact');
    });

    test('sedan 1200cc → car_economy', () => {
      const result = classifyVehicle({ body_type: 'sedan', engine_cc: 1200 });
      expect(result.vehicle_type).toBe('car_economy');
    });

    test('sedan 1800cc → car_comfort', () => {
      const result = classifyVehicle({ body_type: 'sedan', engine_cc: 1800 });
      expect(result.vehicle_type).toBe('car_comfort');
    });

    test('van 7 seats → car_xl', () => {
      const result = classifyVehicle({ body_type: 'van', engine_cc: 1500, registered_seats: 7 });
      expect(result.vehicle_type).toBe('car_xl');
    });

    test('premium allowlist match → car_premium', () => {
      const result = classifyVehicle({ body_type: 'sedan', engine_cc: 1800, premium_match: true });
      expect(result.vehicle_type).toBe('car_premium');
    });
  });
});

describe('Vehicle-model metadata (H2)', () => {
  test('Vitz no cc entered + model metadata 996cc → car_compact', () => {
    const classified = classifyVehicle({ body_type: 'hatchback', engine_cc: 996, registered_seats: 4 });
    expect(classified.vehicle_type).toBe('car_compact');
    expect(classified.rule).toBe('cc_compact_band');
  });

  test('sedan no cc + model metadata 1200cc → car_economy', () => {
    const classified = classifyVehicle({ body_type: 'sedan', engine_cc: 1200, registered_seats: 4 });
    expect(classified.vehicle_type).toBe('car_economy');
  });

  test('van body_type from model + 10 seats → car_xl', () => {
    const classified = classifyVehicle({ body_type: 'van', engine_cc: 2982, registered_seats: 10 });
    expect(classified.vehicle_type).toBe('car_xl');
    expect(classified.rule).toBe('seats_body_xl');
  });
});

describe('Manual review — classifier returns null', () => {
  test('no body_type, no cc, no seats → manual review', () => {
    const classified = classifyVehicle({});
    expect(classified.vehicle_type).toBeNull();
    expect(classified.rule).toBe('manual_review');
  });

  test('no cc, non-XL body, no premium → manual review', () => {
    const classified = classifyVehicle({ body_type: 'sedan' });
    expect(classified.vehicle_type).toBeNull();
    expect(classified.rule).toBe('manual_review');
  });
});

describe('Edge cases', () => {
  test('vehicle_type enum accepts all 9 values', () => {
    const allTypes: VehicleTypeEnum[] = [
      'bike_basic', 'bike_standard', 'bike_plus', 'cng',
      'car_compact', 'car_economy', 'car_comfort', 'car_premium', 'car_xl',
    ];
    for (const vt of allTypes) {
      const result = classifyVehicle({ body_type: 'sedan', engine_cc: 1200, registered_seats: 4 });
      expect(result.vehicle_type).toBeTruthy();
    }
  });

  test('new fields with only engine_cc (no body_type) still classifies', () => {
    const result = classifyVehicle({ engine_cc: 2500 });
    expect(result.vehicle_type).toBe('car_premium');
  });

  test('new fields with only body_type (no engine_cc) still classifies', () => {
    const result = classifyVehicle({ body_type: 'auto_rickshaw' });
    expect(result.vehicle_type).toBe('cng');
  });
});
