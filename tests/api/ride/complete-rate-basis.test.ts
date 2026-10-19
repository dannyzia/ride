/**
 * D1-1 rate-basis pin — completion prices from the PINNED row with actuals.
 *
 * Scenario: a ride pinned (rides.pricing_id) to rate-basis v1 completes
 * AFTER an admin edit minted v2. The charged fare must come from v1's rates
 * with actual distance/time — the mid-ride edit must not move the basis —
 * and completion must never rewrite the pricing table itself.
 *
 * The write side of this identity (edits mint successors, old rows are never
 * mutated) is pinned by tests/api/admin/pricing-versions.test.ts. What this
 * suite proves through the real route + real calculateFare: the completion
 * response fare equals v1-math on actuals, and no pricing UPDATE is issued.
 * (The mock serves the pinned row for the pricing lookup, as the queue
 * discipline of this repo's route tests does; the one-line
 * `eq(pricing.id, ride.pricing_id)` predicate itself is review-covered and
 * unchanged by D1-1.)
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  requireRole: (_role: string) => async () => ({ dbUser: { id: "user-1" } }),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => undefined),
}));
jest.mock("@/lib/accounting", () => ({
  recordRideCompletion: jest.fn(async () => undefined),
  recordTip: jest.fn(async () => undefined),
}));
jest.mock("@/lib/gamification", () => ({
  evaluateStreaks: jest.fn(async () => undefined),
}));
jest.mock("@/lib/walletCashback", () => ({
  earnCashback: jest.fn(async () => undefined),
}));
jest.mock("@/lib/zoneBudget", () => ({
  spendZoneBudget: jest.fn(async () => undefined),
}));
jest.mock("@/lib/rideCompletionWallet", () => ({
  computeCompletionWalletReceivable: jest.fn(() => null),
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async () => ({})),
  parseConfigNumber: jest.fn((_v: unknown, fb: number) => fb),
  parseConfigBool: jest.fn(() => false),
  isStage1Plus: jest.fn(async () => false),
}));
jest.mock("@/lib/zoneFee", () => ({
  lookupZoneFee: jest.fn(async () => 0),
}));

import { db } from "@/src/db";
import { pricing } from "@/src/db/schema";
import { POST } from "@/app/api/ride/[id]/complete+api";

type Row = Record<string, unknown>;

const RIDE_ID = "11111111-1111-4111-a111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const V1_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

// v1 rate basis (the pinned row): base 5000, 2000/km, 300/min,
// floor 2km + 5min, 0% commission.
const V1_ROW: Row = {
  id: V1_ID,
  zone_id: "99999999-9999-4999-8999-999999999999",
  vehicle_type: "bike_basic",
  base_fare_bdt: 5000,
  per_km_bdt: 2000,
  intercity_per_km_bdt: 0,
  per_min_bdt: 300,
  floor_length_km: "2",
  floor_min: 5,
  platform_commission_percent: "0",
  free_wait_minutes: 3,
  wait_fee_per_minute_bdt: 0,
  brta_fare_ceiling_bdt: null,
  base_km: "0",
  initiation_minutes: 4,
  is_active: true,
  supersedes_id: null,
};

// Started 10.5 min ago, no arrival stamp: timer starts at started_at, so
// ride_time_min = ceil(~630s / 60s) = 11 barring a >30s stall mid-test.
// distance 8 km, no intercity split (fare_breakdown null).
// v1 math: inside 8*2000 = 16000; time 11*300 = 3300;
// computed 5000+16000+3300 = 24300; floor 5000+4000+1500 = 10500.
// Charged total = 24300, commission 0, net 24300.
const EXPECTED_TOTAL = 24300;
const STARTED_AT = new Date(Date.now() - 630_000).toISOString();

const RIDE_ROW: Row = {
  id: RIDE_ID,
  driver_id: DRIVER_ID,
  user_id: "rider-1",
  zone_id: "99999999-9999-4999-8999-999999999999",
  vehicle_type: "bike_basic",
  status: "in_progress",
  pricing_id: V1_ID,
  distance_km: "8",
  started_at: STARTED_AT,
  arrived_at: null,
  matched_at: null,
  fare_breakdown: null,
  wait_fee_bdt: 0,
  upfront_tip_bdt: 0,
  applied_discount_bdt: 0,
  applied_discount_type: null,
  preference_surcharge_bdt: 0,
  pickup_fee_state: null,
  pickup_realized_km: null,
  tip_bdt: 0,
  promo_code_id: null,
  rider_cash_tendered_bdt: null,
};

const UPDATED_RIDE_ROW: Row = { ...RIDE_ROW, rider_payable_bdt: EXPECTED_TOTAL };

let selectQueue: Row[][];
let updated: { table: unknown; set: Row }[];

function chain(rows: Row[]) {
  const c: Record<string, unknown> = {
    from: jest.fn(() => c),
    where: jest.fn(() => c),
    limit: jest.fn(async () => rows),
    for: jest.fn(() => c),
    // selects awaited with no terminal (extra charges) resolve rows directly
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  };
  return c;
}

function txChain(rows: Row[]) {
  return chain(rows);
}

beforeEach(() => {
  jest.clearAllMocks();
  // Root selects in route order: driver, ride, pricing (pinned v1), extra charges.
  selectQueue = [[{ id: DRIVER_ID }], [{ ...RIDE_ROW }], [{ ...V1_ROW }], []];
  updated = [];
  (db.select as jest.Mock).mockImplementation(() => chain(selectQueue.length > 0 ? (selectQueue.shift() ?? []) : []));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updated.push({ table, set: setObj });
      return { where: jest.fn(() => ({ returning: jest.fn(async () => []) })) };
    }),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(async () => []),
  }));
  (db.transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      select: jest.fn(() => txChain([])),
      update: jest.fn((table: unknown) => ({
        set: jest.fn((setObj: Row) => {
          updated.push({ table, set: setObj });
          return { where: jest.fn(() => ({ returning: jest.fn(async () => [UPDATED_RIDE_ROW]) })) };
        }),
      })),
      insert: jest.fn(() => ({ values: jest.fn(async () => []) })),
    }),
  );
});

function completeRequest(): Request {
  return {
    url: `http://localhost/api/ride/${RIDE_ID}/complete`,
    text: async () => "",
  } as unknown as Request;
}

describe("POST /api/ride/[id]/complete — pinned rate basis (D1-1)", () => {
  it("charges v1 rates with actuals after an admin edit minted v2", async () => {
    const res = await POST(completeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fare_breakdown.total_bdt).toBe(EXPECTED_TOTAL);
    expect(body.fare_breakdown.driver_net_bdt).toBe(EXPECTED_TOTAL);
    expect(body.fare_breakdown.distance_charge_bdt).toBe(16000);
    expect(body.fare_breakdown.time_charge_bdt).toBe(3300);
    expect(body.fare_breakdown.platform_commission_bdt).toBe(0);
  });

  it("never rewrites the pricing table at completion", async () => {
    const res = await POST(completeRequest());
    expect(res.status).toBe(200);
    expect(updated.filter((u) => u.table === pricing)).toHaveLength(0);
  });
});
