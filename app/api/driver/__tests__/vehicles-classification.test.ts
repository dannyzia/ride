/**
 * Integration test for the full vehicle registration + classification flow.
 *
 * Mocks DB, auth, and premium allowlist. Calls the real POST handler.
 * Verifies the classification response and the vehicle persisted to DB.
 *
 * Pattern: minimal jest.mock factories (mock* prefix allowed), configure in beforeEach.
 */

// ── Mock queue (prefixed "mock" → allowed in jest.mock factories) ──────────

const mockSelectQueue: (() => Record<string, jest.Mock>)[] = [];
const mockInsertQueue: (() => Record<string, jest.Mock>)[] = [];

function mockChainSelect(rows: unknown[]) {
  const c: Record<string, jest.Mock> = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  };
  return c;
}

function mockChainInsert(rows: unknown[]) {
  const c: Record<string, jest.Mock> = {
    values: jest.fn().mockReturnThis(),
    onConflictDoNothing: jest.fn().mockReturnThis(),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(rows),
  };
  return c;
}

function mockChainUpdate() {
  const c: Record<string, jest.Mock> = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
  return c;
}

function mockNextSelect() {
  if (mockSelectQueue.length > 0) return mockSelectQueue.shift()!();
  return mockChainSelect([]);
}

function mockNextInsert() {
  if (mockInsertQueue.length > 0) return mockInsertQueue.shift()!();
  return mockChainInsert([{ id: 'vehicle-new-1' }]);
}

function mockTxSelect() {
  if (mockSelectQueue.length > 0) return mockSelectQueue.shift()!();
  return mockChainSelect([]);
}

function mockTxInsert() {
  if (mockInsertQueue.length > 0) return mockInsertQueue.shift()!();
  return mockChainInsert([{ id: 'vehicle-new-1' }]);
}

// ── jest.mock (only references mock* prefixed functions) ─────────────────────

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(() => mockNextSelect()),
    insert: jest.fn(() => mockNextInsert()),
    update: jest.fn(() => mockChainUpdate()),
    transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: jest.fn(() => mockTxSelect()),
        insert: jest.fn(() => mockTxInsert()),
        update: jest.fn(() => mockChainUpdate()),
      };
      return cb(tx);
    }),
  },
}));

jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn(() => Promise.resolve({ id: 'auth-user-1' })),
}));

jest.mock('@/lib/premiumAllowlist', () => ({
  isPremiumAllowlisted: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import { db } from '@/src/db';
import { isPremiumAllowlisted } from '@/lib/premiumAllowlist';
import { POST } from '@/app/api/driver/vehicles+api';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePost(body: Record<string, unknown>) {
  return new Request('http://localhost/api/driver/vehicles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Queue 4 selects: user → driver → model lookup → existing vehicle (tx) */
function queueNewVehicleSelects(model: Record<string, unknown> | null = null) {
  mockSelectQueue.push(
    () => mockChainSelect([{ id: 'user-1' }]),
    () => mockChainSelect([{ id: 'driver-1', completed_rides_count: 0, rating: '4.5' }]),
    () => mockChainSelect(model ? [model] : []),
    () => mockChainSelect([]),
  );
}

function queueLegacySelects() {
  mockSelectQueue.push(
    () => mockChainSelect([{ id: 'user-1' }]),
    () => mockChainSelect([{ id: 'driver-1', completed_rides_count: 10, rating: '4.8' }]),
    () => mockChainSelect([]),
    () => mockChainSelect([]),
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/driver/vehicles — classification integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectQueue.length = 0;
    mockInsertQueue.length = 0;
    (isPremiumAllowlisted as jest.Mock).mockResolvedValue(false);
  });

  // ── All 9 categories via new client path ──────────────────────────────────

  describe('New client: body_type + engine_cc + seats → all 9 categories', () => {
    test('auto_rickshaw 200cc → cng', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Bajaj', model: 'RE', registration_year: 2021,
        registration_plate: 'DHA-CNG01', body_type: 'auto_rickshaw',
        engine_cc: 200, number_of_seats: 3,
      }));
      const data = await res.json();
      expect(data.classification).toEqual({ outcome: 'classified', suggested_vehicle_type: 'cng' });
    });

    test('motorcycle 100cc 1 seat → bike_basic', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Bajaj', model: 'Platina', registration_year: 2023,
        registration_plate: 'DHK-BB01', body_type: 'motorcycle',
        engine_cc: 100, number_of_seats: 1,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('bike_basic');
    });

    test('motorcycle 125cc → bike_standard', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Honda', model: 'Shine', registration_year: 2023,
        registration_plate: 'DHK-BS01', body_type: 'motorcycle',
        engine_cc: 125, number_of_seats: 1,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('bike_standard');
    });

    test('motorcycle 200cc → bike_plus', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Bajaj', model: 'Pulsar', registration_year: 2023,
        registration_plate: 'DHK-BP01', body_type: 'motorcycle',
        engine_cc: 200, number_of_seats: 1,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('bike_plus');
    });

    test('scooter 110cc → bike_basic', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Honda', model: 'Dio', registration_year: 2023,
        registration_plate: 'DHK-SC01', body_type: 'scooter',
        engine_cc: 110, number_of_seats: 2,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('bike_basic');
    });

    test('van 2982cc 10 seats → car_xl', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Hiace', registration_year: 2019,
        registration_plate: 'DHK-XL01', body_type: 'van',
        engine_cc: 2982, number_of_seats: 10,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_xl');
    });

    test('mpv 7 seats → car_xl', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Mitsubishi', model: 'Xpander', registration_year: 2022,
        registration_plate: 'DHK-XL02', body_type: 'mpv',
        engine_cc: 1500, number_of_seats: 7,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_xl');
    });

    test('hatchback 996cc → car_compact', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Vitz', registration_year: 2015,
        registration_plate: 'DHA-CC01', body_type: 'hatchback',
        engine_cc: 996, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_compact');
    });

    test('sedan 1200cc → car_economy', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Axio', registration_year: 2018,
        registration_plate: 'DHA-EC01', body_type: 'sedan',
        engine_cc: 1200, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_economy');
    });

    test('suv 1500cc → car_comfort (SUV floor)', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'RAV4', registration_year: 2021,
        registration_plate: 'DHK-CF01', body_type: 'suv',
        engine_cc: 1500, number_of_seats: 5,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_comfort');
    });

    test('sedan 2500cc → car_premium (cc > 2000)', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Honda', model: 'Civic', registration_year: 2022,
        registration_plate: 'CHA-CP01', body_type: 'sedan',
        engine_cc: 2500, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_premium');
    });
  });

  // ── car_compact boundary tests ────────────────────────────────────────────

  describe('car_compact boundaries', () => {
    test('cc ≤ 1000 → car_compact', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Daihatsu', model: 'Mira', registration_year: 2016,
        registration_plate: 'DHA-CB01', body_type: 'hatchback',
        engine_cc: 1000, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_compact');
    });

    test('cc 1001 → car_economy', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Daihatsu', model: 'Mira', registration_year: 2016,
        registration_plate: 'DHA-CB02', body_type: 'hatchback',
        engine_cc: 1001, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_economy');
    });
  });

  // ── Model metadata merge (H2) ────────────────────────────────────────────

  describe('Model metadata merge (H2)', () => {
    test('client omits cc + model typical_cc_min=996 → car_compact via model', async () => {
      queueNewVehicleSelects({
        id: 'model-1', default_vehicle_type: null,
        typical_cc_min: 996, typical_cc_max: 996,
        body_type: null, passenger_seats: 4,
      });
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Vitz', registration_year: 2015,
        registration_plate: 'DHA-MD01', body_type: 'hatchback',
        engine_cc: null, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_compact');
    });

    test('client omits body_type + model body_type=van + seats=10 → car_xl', async () => {
      queueNewVehicleSelects({
        id: 'model-2', default_vehicle_type: null,
        typical_cc_min: 2982, typical_cc_max: 2982,
        body_type: 'van', passenger_seats: 10,
      });
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Hiace', registration_year: 2019,
        registration_plate: 'DHA-MD02', body_type: null,
        engine_cc: 2982, number_of_seats: 10,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_xl');
    });
  });

  // ── Premium allowlist ────────────────────────────────────────────────────

  describe('Premium allowlist', () => {
    test('Toyota Camry on allowlist → car_premium', async () => {
      (isPremiumAllowlisted as jest.Mock).mockResolvedValue(true);
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Camry', registration_year: 2022,
        registration_plate: 'DHK-PR01', body_type: 'sedan',
        engine_cc: 2500, number_of_seats: 4,
      }));
      expect((await res.json()).classification.suggested_vehicle_type).toBe('car_premium');
      expect(isPremiumAllowlisted).toHaveBeenCalledWith('Toyota', 'Camry');
    });
  });

  // ── Legacy client ────────────────────────────────────────────────────────

  describe('Legacy client (vehicle_type only)', () => {
    test('sends vehicle_type → no classification in response', async () => {
      queueLegacySelects();
      const res = await POST(makePost({
        brand: 'Toyota', model: 'Premio', vehicle_type: 'car_comfort',
        registration_year: 2018, registration_plate: 'DHA-LG01',
      }));
      const data = await res.json();
      expect(data.classification).toBeUndefined();
      expect(data.vehicle).toBeDefined();
    });
  });

  // ── Manual review (C1) ───────────────────────────────────────────────────

  describe('Manual review (C1)', () => {
    test('no body_type, no cc, no model default → 422 eligibility_not_met (Path 3)', async () => {
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Unknown', model: 'MysteryCar',
        registration_year: 2020, registration_plate: 'DHA-MR01',
      }));
      const data = await res.json();
      expect(res.status).toBe(422);
      expect(data.error).toBe('eligibility_not_met');
    });

    test('body_type sent but no cc + classifier null + no model default → 422 + draft model insert', async () => {
      // Path 1: body_type triggers classifier, but sedan with cc=undefined → manual_review.
      // No model default → ManualReviewRequiredError. §13.3: draft model row should be persisted.
      queueNewVehicleSelects();
      const res = await POST(makePost({
        brand: 'Unknown', model: 'MysteryCar',
        registration_year: 2020, registration_plate: 'DHA-MR02',
        body_type: 'sedan',
        number_of_seats: 4,
      }));
      const data = await res.json();
      expect(res.status).toBe(422);
      expect(data.error).toBe('manual_review_required');
      // Draft model row insert should have been attempted (§13.3)
      expect(db.insert).toHaveBeenCalled();
    });
  });
});
