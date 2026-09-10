/**
 * Phase F quote state 3 (true-up + charge at completion) — route tests for
 * app/api/ride/[id]/complete+api.ts.
 *
 * Verifies (rulings 1/14/16/18):
 * - charged path: fare.total/driver_net/rider_payable/driver_fare/cash_to_
 *   collect carry the FINAL pickup fee; commission (platform_commission_bdt)
 *   and the recordRideCompletion input EXCLUDE it (trip fare only)
 * - fee-off (Stage 0): nothing charged, but pickup_fee_state='trued' +
 *   pickup_fee_final_bdt=null persisted; fare untouched
 * - low-confidence freeze at firm (< pickup_origin_confidence_min)
 * - realized null → final = firm
 * - backstop re-check binds against the completion-recalculated trip fare
 * - pickup_distance_samples row inserted with the charged flag correct in
 *   both modes; no sample + no state write for non-'firm' rides
 *
 * Determinism: per_min_bdt = 0 so ride time never affects totals; distance
 * is fixed. Base case: 5000 + round(775 × 10) = 12750 paisa trip fare,
 * commission 10% = 1275.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  requireRole: jest.fn(() =>
    jest.fn(async () => ({
      dbUser: { id: "11111111-1111-4111-a111-111111111111", role: "driver" },
    })),
  ),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/accounting", () => ({
  recordRideCompletion: jest.fn(async () => {}),
  recordTip: jest.fn(async () => {}),
}));
jest.mock("@/lib/gamification", () => ({ evaluateStreaks: jest.fn(async () => {}) }));
jest.mock("@/lib/walletCashback", () => ({ earnCashback: jest.fn(async () => {}) }));
jest.mock("@/lib/zoneBudget", () => ({ spendZoneBudget: jest.fn(async () => {}) }));
jest.mock("@/lib/notify", () => ({ sendNotification: jest.fn(() => Promise.resolve()) }));
jest.mock("@/lib/fareFrameworkConfig", () => {
  const actual = jest.requireActual("@/lib/fareFrameworkConfig");
  return { ...actual, isStage1Plus: jest.fn(async () => false) };
});

import { db } from "@/src/db";
import { recordRideCompletion } from "@/lib/accounting";
import { rides, pickupDistanceSamples } from "@/src/db/schema";
import { POST } from "@/app/api/ride/[id]/complete+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";
const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const ZONE_ID = "66666666-6666-4666-8666-666666666666";
const PRICING_ID = "77777777-7777-4777-8777-777777777777";

type Row = Record<string, unknown>;

const ORIGINAL_WS_SECRET = process.env.WEBSOCKET_INTERNAL_SECRET;

function apiRequest(): Request {
  return {
    url: `http://localhost:8081/api/ride/${RIDE_ID}/complete`,
    headers: { get: () => null },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function pricingRow(overrides: Row = {}): Row {
  return {
    id: PRICING_ID,
    base_fare_bdt: 5000,
    per_km_bdt: 775,
    intercity_per_km_bdt: null,
    per_min_bdt: 0,
    floor_length_km: null,
    floor_min: null,
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
    zone_id: ZONE_ID,
    pricing_id: PRICING_ID,
    vehicle_type: "bike_standard",
    status: "in_progress",
    distance_km: "10.000",
    started_at: new Date(Date.now() - 60_000),
    arrived_at: null,
    completed_at: null,
    wait_fee_bdt: 0,
    fare_breakdown: {},
    upfront_tip_bdt: 0,
    applied_discount_bdt: 0,
    applied_discount_type: "none",
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

/** Fee-enabled platform_config rows (others fall back to defaults). */
const FEE_ON_CONFIG: Row[] = [
  { key: "pickup_fee_enabled", value: "true" },
  { key: "pickup_free_radius_km_bike", value: "0.5" },
];

/**
 * Queue-based mock for db.select(). Supports both chain shapes the route
 * uses: `.from().where().limit(1)` (row lookups) and awaiting the
 * `.where()` result directly (extra charges, platform_config).
 */
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
    return { from: jest.fn(() => ({ where: jest.fn(() => whereChain) })) };
  });
}

interface TxState {
  rideUpdateSet: Row | null;
  sampleInsertValues: Row | null;
  insertTables: unknown[];
  updateTables: unknown[];
}

/** Mock db.transaction(cb) with just the tx surface these fixtures hit. */
function mockTransaction(rideReturning: Row[]): TxState {
  const state: TxState = {
    rideUpdateSet: null,
    sampleInsertValues: null,
    insertTables: [],
    updateTables: [],
  };
  const tx = {
    select: jest.fn(),
    update: jest.fn((table: unknown) => {
      state.updateTables.push(table);
      return {
        set: jest.fn((v: Row) => {
          if (table === rides) state.rideUpdateSet = v;
          return { where: jest.fn(() => ({ returning: jest.fn(async () => rideReturning) })) };
        }),
      };
    }),
    insert: jest.fn((table: unknown) => {
      state.insertTables.push(table);
      return {
        values: jest.fn((v: Row) => {
          if (table === pickupDistanceSamples) state.sampleInsertValues = v;
          return Promise.resolve({});
        }),
      };
    }),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: typeof tx) => Promise<void>) => cb(tx),
  );
  return state;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WEBSOCKET_INTERNAL_SECRET = "";
});

afterAll(() => {
  process.env.WEBSOCKET_INTERNAL_SECRET = ORIGINAL_WS_SECRET;
});

/* ── Charged path (fee enabled, high confidence) ────────────────── */

describe("complete — pickup fee charged path", () => {
  // bike rate = round(775 × 0.75) = 581; realized 4 km − 0.5 free → capped
  // 2 km → 1162; backstop 5100 not binding; trueUp(900, 1162, 1.25) → 1125.
  const FINAL_FEE = 1125;
  const TRIP_TOTAL = 12750;

  function setup(rideOverrides: Row = {}): TxState {
    mockSelectQueue([
      [{ id: DRIVER_ID }],          // [0] driver lookup
      [rideRow(rideOverrides)],       // [1] ride lookup
      [pricingRow()],                 // [2] pricing lookup
      [],                             // [3] approved extra charges
      FEE_ON_CONFIG,                  // [4] v6 shadow getFareFrameworkConfig (12 keys)
      [],                             // [5] lookupZoneFee getFareFrameworkConfig → zone_fee_enabled=false → returns 0 early
      FEE_ON_CONFIG,                  // [6] true-up getFareFrameworkConfig
    ]);
    return mockTransaction([{ id: RIDE_ID, rider_payable_bdt: TRIP_TOTAL + FINAL_FEE }]);
  }

  test("final fee lands on every receipt total but never on commission", async () => {
    const state = setup({
      pickup_fee_state: "firm",
      pickup_fee_firm_bdt: 900,
      pickup_firm_km: "3.000",
      pickup_realized_km: "4.000",
      pickup_realized_confidence: "0.950",
    });
    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    expect(state.rideUpdateSet).toMatchObject({
      status: "completed",
      pickup_fee_state: "trued",
      pickup_fee_final_bdt: FINAL_FEE,
      pickup_trueup_delta_bdt: FINAL_FEE - 900,
      // Commission stays 10% of the TRIP fare (12750), not 13875.
      platform_commission_bdt: 1275,
      rider_payable_bdt: TRIP_TOTAL + FINAL_FEE,
      driver_fare_bdt: 11475 + FINAL_FEE + 1275,
      fare_breakdown: {
        total_bdt: TRIP_TOTAL + FINAL_FEE,
        driver_net_bdt: 11475 + FINAL_FEE,
        platform_commission_bdt: 1275,
      },
    });

    // Ruling 14: accounting input excludes the pickup fee entirely.
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ id: RIDE_ID, finalFarePaisa: TRIP_TOTAL }),
    );

    const body = await getJson(res);
    expect(body.cash_to_collect_bdt).toBe(TRIP_TOTAL + FINAL_FEE);
    expect(body.rider_payable_bdt).toBe(TRIP_TOTAL + FINAL_FEE);
    expect((body.fare_breakdown as Row).total_bdt).toBe(TRIP_TOTAL + FINAL_FEE);
  });

  test("pickup_distance_samples row inserted with charged=true", async () => {
    const state = setup({
      pickup_fee_state: "firm",
      pickup_fee_firm_bdt: 900,
      pickup_firm_km: "3.000",
      pickup_realized_km: "4.000",
      pickup_realized_confidence: "0.950",
    });
    const res = await POST(apiRequest());
    expect(res.status).toBe(200);
    expect(state.insertTables).toContain(pickupDistanceSamples);
    expect(state.sampleInsertValues).toEqual({
      ride_id: RIDE_ID,
      zone_id: ZONE_ID,
      vehicle_type: "bike_standard",
      category: "bike",
      quote_km: null, // request-time reference km is not persisted on rides
      firm_km: "3",
      realized_km: "4",
      charged: true,
      cap_was_binding: true,  // chargeable 3.5 km > cap 2.0 km
      backstop_was_binding: false, // uncapped fee 2034 < backstop limit 5100
    });
  });
});

/* ── Fee-off path (Stage 0) ─────────────────────────────────────── */

describe("complete — pickup fee disabled (Stage 0)", () => {
  test("charges nothing but persists the trued state; sample charged=false", async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [
        rideRow({
          pickup_fee_state: "firm",
          pickup_fee_firm_bdt: 900,
          pickup_firm_km: "3.000",
          pickup_realized_km: "4.000",
          pickup_realized_confidence: "0.950",
        }),
      ],
      [pricingRow()],
      [], // extra charges
      [], // v6 shadow getFareFrameworkConfig → defaults
      [], // lookupZoneFee getFareFrameworkConfig → zone_fee_enabled=false → returns 0 early
      [], // true-up getFareFrameworkConfig → defaults → pickup_fee_enabled=false
    ]);
    const state = mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12750 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    expect(state.rideUpdateSet).toMatchObject({
      pickup_fee_state: "trued",
      pickup_fee_final_bdt: null, // no charge happened
      pickup_trueup_delta_bdt: null,
      platform_commission_bdt: 1275,
      rider_payable_bdt: 12750,
      driver_fare_bdt: 12750,
      fare_breakdown: { total_bdt: 12750, driver_net_bdt: 11475 },
    });
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ id: RIDE_ID, finalFarePaisa: 12750 }),
    );

    expect(state.sampleInsertValues).toEqual({
      ride_id: RIDE_ID,
      zone_id: ZONE_ID,
      vehicle_type: "bike_standard",
      category: "bike",
      quote_km: null,
      firm_km: "3",
      realized_km: "4",
      charged: false,
      cap_was_binding: false, // fee disabled → no binding computation
      backstop_was_binding: false, // fee disabled → no binding computation
    });

    const body = await getJson(res);
    expect(body.cash_to_collect_bdt).toBe(12750);
  });
});

/* ── Confidence freeze & missing realized ───────────────────────── */

describe("complete — true-up guard paths", () => {
  test("low confidence (< 0.7) freezes the fee at firm", async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [
        rideRow({
          pickup_fee_state: "firm",
          pickup_fee_firm_bdt: 900,
          pickup_firm_km: "3.000",
          pickup_realized_km: "4.000",
          pickup_realized_confidence: "0.500",
        }),
      ],
      [pricingRow()],
      [],
      FEE_ON_CONFIG, // v6 shadow config
      [],             // lookupZoneFee config → returns 0 early
      FEE_ON_CONFIG,  // true-up config
    ]);
    const state = mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 13650 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);
    expect(state.rideUpdateSet).toMatchObject({
      pickup_fee_state: "trued",
      pickup_fee_final_bdt: 900,
      pickup_trueup_delta_bdt: 0,
      platform_commission_bdt: 1275, // still 10% of the trip fare only
      fare_breakdown: { total_bdt: 13650 },
    });
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ finalFarePaisa: 12750 }),
    );
  });

  test("realized null → final = firm (freeze; no realized data)", async () => {
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [
        rideRow({
          pickup_fee_state: "firm",
          pickup_fee_firm_bdt: 900,
          pickup_firm_km: "3.000",
          pickup_realized_km: null,
          pickup_realized_confidence: null,
        }),
      ],
      [pricingRow()],
      [],
      // v6 shadow config fetch is skipped (pickup_realized_km is null)
      FEE_ON_CONFIG, // lookupZoneFee config → zone_fee_enabled not set, returns 0
      FEE_ON_CONFIG,  // true-up config
    ]);
    const state = mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 13650 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);
    expect(state.rideUpdateSet).toMatchObject({
      pickup_fee_final_bdt: 900,
      pickup_trueup_delta_bdt: 0,
    });
    expect(state.sampleInsertValues).toMatchObject({ realized_km: null, charged: true });
  });
});

/* ── Backstop re-check against the recalculated fare (ruling 18) ── */

describe("complete — backstop re-check", () => {
  test("realized fee clamped to 40% of the recalculated trip fare", async () => {
    // Trip fare 1000 + round(775 × 2) = 2550 → backstop round(2550 × 0.4)
    // = 1020 < raw 1162 → feeFromRealized 1020; firm 900 → 1020 under the
    // 1125 upward cap → final 1020.
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [
        rideRow({
          distance_km: "2.000",
          pickup_fee_state: "firm",
          pickup_fee_firm_bdt: 900,
          pickup_firm_km: "3.000",
          pickup_realized_km: "4.000",
          pickup_realized_confidence: "0.950",
        }),
      ],
      [pricingRow({ base_fare_bdt: 1000 })],
      [],
      FEE_ON_CONFIG, // v6 shadow config
      [],             // lookupZoneFee config → returns 0 early
      FEE_ON_CONFIG,  // true-up config
    ]);
    const state = mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 3570 }]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);
    expect(state.rideUpdateSet).toMatchObject({
      pickup_fee_final_bdt: 1020,
      pickup_trueup_delta_bdt: 120,
      platform_commission_bdt: 255, // 10% of 2550, not of 3570
      fare_breakdown: { total_bdt: 3570 },
    });
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ finalFarePaisa: 2550 }),
    );
  });
});

/* ── Non-firm rides are untouched ───────────────────────────────── */

describe("complete — no pickup fee lifecycle", () => {
  test.each([null, "range", "trued"] as const)(
    "pickup_fee_state %p → no state write, no sample, no fee",
    async (pickupState) => {
      mockSelectQueue([
        [{ id: DRIVER_ID }],
        [rideRow({ pickup_fee_state: pickupState, pickup_fee_firm_bdt: pickupState ? 900 : null })],
        [pricingRow()],
        [], // extra charges
        [], // v6 shadow getFareFrameworkConfig → defaults
        [], // lookupZoneFee getFareFrameworkConfig → returns 0 early
        // NOTE: true-up skipped for non-firm states.
      ]);
      const state = mockTransaction([{ id: RIDE_ID, rider_payable_bdt: 12750 }]);

      const res = await POST(apiRequest());
      expect(res.status).toBe(200);
      expect(state.rideUpdateSet).toMatchObject({
        status: "completed",
        platform_commission_bdt: 1275,
        fare_breakdown: { total_bdt: 12750 },
      });
      expect(state.rideUpdateSet?.pickup_fee_state).toBeUndefined();
      expect(state.rideUpdateSet?.pickup_fee_final_bdt).toBeUndefined();
      expect(state.insertTables).not.toContain(pickupDistanceSamples);
      expect(recordRideCompletion).toHaveBeenCalledWith(
        expect.objectContaining({ finalFarePaisa: 12750 }),
      );
      const body = await getJson(res);
      expect(body.cash_to_collect_bdt).toBe(12750);
    },
  );
});
