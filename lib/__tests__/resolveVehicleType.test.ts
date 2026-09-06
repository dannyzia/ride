/**
 * Tests for the real resolveVehicleType function (R3).
 *
 * Uses the dependency-injected premium check seam — no module-level mocking.
 * Tests the actual H2 model-metadata merge and C1 manual-review rejection.
 */
// Mock premiumAllowlist to avoid DB import in test environment
import { resolveVehicleType, ManualReviewRequiredError, EligibilityError } from '../resolveVehicleType';

jest.mock('../premiumAllowlist', () => ({
  isPremiumAllowlisted: jest.fn(),
}));

/** Stub: premium check always returns false (not on allowlist). */
const notPremium = async () => false;

/** Stub: premium check always returns true (on allowlist). */
const isPremium = async () => true;

describe('resolveVehicleType — real function', () => {
  describe('Path 1: New client — classify server-side', () => {
    test('Vitz no cc entered + model typical_cc_min 996 → car_compact', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Vitz', body_type: 'hatchback', engine_cc: null, number_of_seats: 4 },
        { default_vehicle_type: null, typical_cc_min: 996, body_type: null, passenger_seats: 4 },
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_compact');
      expect(result.classification?.outcome).toBe('classified');
    });

    test('sedan 1200cc → car_economy', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Axio', body_type: 'sedan', engine_cc: 1200, number_of_seats: 4 },
        undefined,
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_economy');
      expect(result.classification?.outcome).toBe('classified');
    });

    test('van + no body_type + model body_type=van + seats=10 → car_xl', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Hiace', body_type: null, engine_cc: 2982, number_of_seats: 10 },
        { default_vehicle_type: null, typical_cc_min: 2982, body_type: 'van', passenger_seats: 10 },
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_xl');
      expect(result.classification?.outcome).toBe('classified');
    });

    test('premium allowlist match → car_premium', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Camry', body_type: 'sedan', engine_cc: 2500, number_of_seats: 4 },
        undefined,
        isPremium,
      );
      expect(result.vehicle_type).toBe('car_premium');
      expect(result.classification?.outcome).toBe('classified');
    });

    test('cc > 2000 → car_premium (not premium allowlist)', async () => {
      const result = await resolveVehicleType(
        { brand: 'Honda', model: 'Civic', body_type: 'sedan', engine_cc: 2500, number_of_seats: 4 },
        undefined,
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_premium');
    });

    test('suv 1500cc → car_comfort (SUV floor)', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'RAV4', body_type: 'suv', engine_cc: 1500, number_of_seats: 5 },
        undefined,
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_comfort');
    });
  });

  describe('Path 1: Manual review (C1)', () => {
    test('classifier returns null + no model default → throws ManualReviewRequiredError', async () => {
      // Send body_type (triggers Path 1) but no cc — classifier can't resolve sedan with cc=0.
      // No model default → ManualReviewRequiredError (C1).
      await expect(
        resolveVehicleType(
          { brand: 'Unknown', model: 'Mystery', body_type: 'sedan' },
          { default_vehicle_type: null, typical_cc_min: null, body_type: null, passenger_seats: null },
          notPremium,
        ),
      ).rejects.toThrow(ManualReviewRequiredError);
    });

    test('no new fields, no vehicle_type, no model default → throws EligibilityError', async () => {
      // Path 3 fallback — no vehicle_type, no new fields, no model default.
      await expect(
        resolveVehicleType(
          { brand: 'Unknown', model: 'Mystery' },
          undefined,
          notPremium,
        ),
      ).rejects.toThrow(EligibilityError);
    });

    test('classifier returns null + model default exists → manual_review with model default', async () => {
      // Send body_type (triggers Path 1 classifier) but no cc — classifier
      // returns null for sedan with cc=0. Model default is used as fallback.
      const result = await resolveVehicleType(
        { brand: 'Unknown', model: 'Mystery', body_type: 'sedan' },
        { default_vehicle_type: 'car_economy', typical_cc_min: null, body_type: null, passenger_seats: null },
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_economy');
      expect(result.classification?.outcome).toBe('manual_review');
    });
  });

  describe('Path 2: Legacy client', () => {
    test('sends vehicle_type → uses it directly, no classification', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Premio', vehicle_type: 'car_comfort' },
        undefined,
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_comfort');
      expect(result.classification).toBeNull();
    });

    test('legacy vehicle_type takes precedence over new fields', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Vitz', vehicle_type: 'car_xl', body_type: 'hatchback', engine_cc: 800 },
        undefined,
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_xl');
      expect(result.classification).toBeNull();
    });
  });

  describe('Path 3: Model default fallback', () => {
    test('no vehicle_type, no new fields, model has default → uses default', async () => {
      const result = await resolveVehicleType(
        { brand: 'Toyota', model: 'Vitz' },
        { default_vehicle_type: 'car_compact', typical_cc_min: 996, body_type: null, passenger_seats: 4 },
        notPremium,
      );
      expect(result.vehicle_type).toBe('car_compact');
      expect(result.classification).toBeNull();
    });
  });

  describe('Error paths', () => {
    test('no vehicle_type, no new fields, no model default → EligibilityError', async () => {
      await expect(
        resolveVehicleType(
          { brand: 'Toyota', model: 'Vitz' },
          undefined,
          notPremium,
        ),
      ).rejects.toThrow(EligibilityError);
    });
  });
});
