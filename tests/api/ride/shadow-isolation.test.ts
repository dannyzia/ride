/**
 * T-A11: Shadow write isolation (PATCH 1).
 *
 * Verifies that the v6 shadow computation NEVER mutates:
 * - fare.total_bdt (in fare_breakdown JSONB)
 * - driver_net_bdt
 * - rider_payable_bdt
 * - driver_fare_bdt
 * - platform_commission_bdt
 * - recordRideCompletion input (finalFarePaisa)
 *
 * Shadow columns (fare_v6_shadow, fare_v6_shadow_computed_at) are
 * write-only during Stage 0 — never read by payout or accounting paths.
 */
/* eslint-disable import/first */
jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(() =>
    jest.fn(async () => ({
      dbUser: { id: '11111111-1111-4111-a111-111111111111', role: 'driver' },
    })),
  ),
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), transaction: jest.fn(), update: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/accounting', () => ({
  recordRideCompletion: jest.fn(async () => {}),
  recordTip: jest.fn(async () => {}),
}));
jest.mock('@/lib/gamification', () => ({ evaluateStreaks: jest.fn(async () => {}) }));
jest.mock('@/lib/walletCashback', () => ({ earnCashback: jest.fn(async () => {}) }));
jest.mock('@/lib/zoneBudget', () => ({ spendZoneBudget: jest.fn(async () => {}) }));
jest.mock('@/lib/notify', () => ({ sendNotification: jest.fn(() => Promise.resolve()) }));

import { db } from '@/src/db';
import { recordRideCompletion } from '@/lib/accounting';
import { rides } from '@/src/db/schema';
import { POST } from '@/app/api/ride/[id]/complete+api';
import { calculateV6Fare, type V6FareInput, type V6PricingRow } from '@/lib/fareCalc';

const USER_ID = '11111111-1111-4111-a111-111111111111';
const RIDE_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';

type Row = Record<string, unknown>;

const ORIGINAL_WS_SECRET = process.env.WEBSOCKET_INTERNAL_SECRET;

function apiRequest(): Request {
  return {
    url: `http://localhost:8081/api/ride/${RIDE_ID}/complete`,
    headers: { get: () => null },
  } as unknown as Request;
}

function pricingRow(overrides: Row = {}): Row {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    base_fare_bdt: 5000,
    base_km: 2.0,
    initiation_minutes: 4,
    per_km_bdt: 775,
    intercity_per_km_bdt: null,
    per_min_bdt: 50,
    floor_length_km: 3,
    floor_min: 5,
    brta_fare_ceiling_bdt: null,
    platform_commission_percent: 10,
    wait_fee_per_minute_bdt: null,
    ...overrides,
  };
}

function rideRow(overrides: Row = {}): Row {
  return {
    id: RIDE_ID,
    user_id: USER_ID,
    driver_id: DRIVER_ID,
    zone_id: '66666666-6666-4666-8666-666666666666',
    pricing_id: '77777777-7777-4777-8777-777777777777',
    vehicle_type: 'bike_standard',
    status: 'in_progress',
    distance_km: '10.000',
    started_at: new Date(Date.now() - 60_000),
    arrived_at: null,
    completed_at: null,
    wait_fee_bdt: 0,
    fare_breakdown: {},
    upfront_tip_bdt: 0,
    applied_discount_bdt: 0,
    applied_discount_type: 'none',
    preference_surcharge_bdt: 0,
    tip_bdt: 0,
    pass_subscription_id: null,
    promo_code_id: null,
    platform_subsidy_bdt: null,
    pickup_fee_state: null,
    pickup_fee_firm_bdt: null,
    pickup_firm_km: null,
    pickup_realized_km: null,
    pickup_realized_confidence: null,
    ...overrides,
  };
}

function mockSelectQueue(queue: Row[][]) {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const promise = Promise.resolve(rows);
    const whereChain = {
      limit: jest.fn(() => promise),
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    };
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => whereChain),
      })),
    };
  });
}

let rideUpdateSet: Row | null = null;

function mockTransaction(rideReturning: Row[]) {
  rideUpdateSet = null;
  const tx = {
    select: jest.fn(),
    update: jest.fn((table: unknown) => ({
      set: jest.fn((v: Row) => {
        if (table === rides) rideUpdateSet = v;
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => rideReturning),
          })),
        };
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(async () => ({})),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => Promise<void>) => cb(tx),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WEBSOCKET_INTERNAL_SECRET = '';
});

afterAll(() => {
  process.env.WEBSOCKET_INTERNAL_SECRET = ORIGINAL_WS_SECRET;
});

// ══════════════════════════════════════════════════════════════════════
// T-A11: Shadow write isolation
// ══════════════════════════════════════════════════════════════════════

describe('T-A11 — shadow write isolation', () => {
  test('fare_v6_shadow is written but does NOT affect rider_payable_bdt', async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow()],
      [],
      [],
    ]);
    mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12850 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    // v6 shadow should be written
    expect(rideUpdateSet?.fare_v6_shadow).toBeDefined();
    expect(rideUpdateSet?.fare_v6_shadow_computed_at).toBeDefined();

    // rider_payable_bdt must come from the transaction return (v2-based),
    // NOT from any v6 computation
    expect(rideUpdateSet?.rider_payable_bdt).toBe(12850);
  });

  test('v6 shadow total_bdt is stored separately from v2 billing total', async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow()],
      [],
      [],
    ]);
    mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12800 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    // The shadow column records the v6 shadow value
    const shadow = rideUpdateSet?.fare_v6_shadow as Record<string, unknown>;
    expect(shadow).toBeDefined();
    expect(typeof shadow.total_bdt).toBe('number');

    // The billing total_bdt in fare_breakdown comes from v2
    const breakdown = rideUpdateSet?.fare_breakdown as Record<string, unknown>;
    expect(typeof breakdown.total_bdt).toBe('number');

    // Both are positive numbers (sanity)
    expect(shadow.total_bdt).toBeGreaterThan(0);
    expect(breakdown.total_bdt).toBeGreaterThan(0);
  });

  test('platform_commission_bdt is computed from v2 total (not v6 shadow)', async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow()],
      [],
      [],
    ]);
    mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12800 }]);

    await POST(apiRequest());

    const breakdown = rideUpdateSet?.fare_breakdown as Record<string, unknown>;
    const commission = breakdown.platform_commission_bdt as number;
    const total = breakdown.total_bdt as number;
    const shadow = rideUpdateSet?.fare_v6_shadow as Record<string, unknown>;

    // Commission is 10% of the v2 total (not the v6 shadow)
    expect(commission).toBe(Math.round(total * 10 / 100));
    // Commission is NOT 10% of v6 shadow
    expect(commission).not.toBe(Math.round((shadow.total_bdt as number) * 10 / 100));
  });

  test('recordRideCompletion receives v2 fare, never v6', async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow()],
      [],
      [],
    ]);
    mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12800 }]);

    await POST(apiRequest());

    const callArgs = (recordRideCompletion as jest.Mock).mock.calls[0][0];
    const breakdown = rideUpdateSet?.fare_breakdown as Record<string, unknown>;
    const shadow = rideUpdateSet?.fare_v6_shadow as Record<string, unknown>;

    // finalFarePaisa equals the v2 total, not the v6 shadow
    expect(callArgs.finalFarePaisa).toBe(breakdown.total_bdt);
    expect(callArgs.finalFarePaisa).not.toBe(shadow.total_bdt);
  });

  test('driver_fare_bdt is derived from v2 driver_net, not v6', async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow()],
      [],
      [],
    ]);
    mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12850 }]);

    await POST(apiRequest());

    // driver_fare_bdt = driver_net_bdt + pref_surcharge + commission
    // All derived from v2 values
    const driverFare = rideUpdateSet?.driver_fare_bdt as number;
    const driverNet = (rideUpdateSet?.fare_breakdown as Record<string, unknown>)
      .driver_net_bdt as number;
    const commission = (rideUpdateSet?.fare_breakdown as Record<string, unknown>)
      .platform_commission_bdt as number;

    expect(driverFare).toBe(driverNet + commission);
  });
});
