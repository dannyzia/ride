/**
 * Integration test: lookupZoneFee in the complete-ride flow.
 *
 * When zone_fee_enabled=true and a zoneFeeSchedule row exists,
 * verify that:
 * 1. The v6 shadow total includes the zone fee
 * 2. The v6 shadow driver_net includes the zone fee (100% to driver)
 * 3. The v2 billing path still persists zone_fee_bdt=0 (Stage 0 hardcode)
 * 4. The v2 commission is NOT affected by the zone fee
 * 5. recordRideCompletion receives the v2 fare (zone fee excluded)
 * 6. The zone fee appears in the fare_v6_shadow JSONB
 *
 * Determinism: per_min_bdt=0, fixed distance=10km, base_km=0, initiation_minutes=0
 * → base_fare_bdt=5000, distance=round(775×10)=7750 → trip fare 12750.
 * Commission 10% of trip fare = 1275. Zone fee = 800 paisa (mocked).
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

// Mock lookupZoneFee to return a controlled zone fee
const mockLookupZoneFee = jest.fn((_zoneId?: string, _category?: string) => Promise.resolve(0));
jest.mock("@/lib/zoneFee", () => ({
  lookupZoneFee: (zoneId: string, category: string) => mockLookupZoneFee(zoneId, category),
}));

// Mock getFareFrameworkConfig to prevent it from consuming db.select queue entries.
// Returns defaults that keep the flow in Stage 0 (fee disabled, no pickup).
const mockGetConfig = jest.fn((_keys?: readonly string[]) => Promise.resolve({
  pickup_fee_enabled: "false",
  pickup_free_radius_km_bike: "0.5",
  pickup_free_radius_km_cng: "0.5",
  pickup_free_radius_km_car: "0.5",
  pickup_free_time_min_bike: "3",
  pickup_free_time_min_cng: "3",
  pickup_free_time_min_car: "3",
  pickup_cap_pct_of_fare: "40",
  pickup_cap_billable_km_bike: "2.0",
  pickup_cap_billable_km_cng: "2.0",
  pickup_cap_billable_km_car: "2.0",
  pickup_origin_confidence_min: "0.7",
  pickup_trueup_cap_multiplier: "1.25",
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: (keys: readonly string[]) => mockGetConfig(keys),
  parseConfigBool: (v: string) => v === "true",
  parseConfigNumber: (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  },
}));

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
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => Promise.resolve([])),
          then: Promise.resolve([]).then.bind(Promise.resolve([])),
        })),
        then: Promise.resolve([]).then.bind(Promise.resolve([])),
      })),
    })),
    update: jest.fn((table: unknown) => {
      state.updateTables.push(table);
      return {
        set: jest.fn((v: Row) => {
          if (table === rides) state.rideUpdateSet = v;
          return {
            where: jest.fn(() => ({
              returning: jest.fn(async () => rideReturning),
            })),
          };
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
  mockLookupZoneFee.mockResolvedValue(0);
});

afterAll(() => {
  process.env.WEBSOCKET_INTERNAL_SECRET = ORIGINAL_WS_SECRET;
});

// ══════════════════════════════════════════════════════════════════════
// Zone fee integration in complete flow
// ══════════════════════════════════════════════════════════════════════

describe("complete — zone fee integration", () => {
  // v6 with base_km=0, initiation_minutes=0 → fallback to base_fare_bdt=5000
  // 5000 + round(775 × 10) = 12750 trip fare
  const TRIP_FARE = 12750;
  const COMMISSION_10PCT = 1275; // 10% of trip fare
  const ZONE_FEE = 800; // mocked lookupZoneFee return value

  test("zone_fee_enabled=true → shadow total includes zone fee, billing stays at 0", async () => {
    mockLookupZoneFee.mockResolvedValue(ZONE_FEE);

    // 4 db.select calls: driver, ride, pricing, extraCharges
    // getFareFrameworkConfig is mocked separately
    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    const state = mockTransaction([
      { id: RIDE_ID, rider_payable_bdt: TRIP_FARE },
    ]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    // lookupZoneFee was called with the ride's zone_id and vehicle category
    expect(mockLookupZoneFee).toHaveBeenCalledWith(ZONE_ID, "bike");

    // ── v2 billing: zone_fee_bdt=0 (Stage 0 hardcode) ──
    expect(state.rideUpdateSet).toBeDefined();
    expect(state.rideUpdateSet!.zone_fee_bdt).toBe(0);

    // ── v2 commission: unaffected by zone fee (still 10% of trip fare only) ──
    expect(state.rideUpdateSet!.platform_commission_bdt).toBe(COMMISSION_10PCT);

    // ── recordRideCompletion: v2 fare, no zone fee ──
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ finalFarePaisa: TRIP_FARE }),
    );

    // ── v6 shadow: total includes zone fee ──
    const shadow = state.rideUpdateSet!.fare_v6_shadow as Record<string, unknown>;
    expect(shadow).toBeDefined();
    // v6 total = trip fare + zone fee (no pickup, no waiting, night_mult=1.0)
    expect(shadow.zone_fee_bdt).toBe(ZONE_FEE);
    // v6 driver_net = total (0% commission)
    expect(Number(shadow.driver_net_bdt)).toBe(Number(shadow.total_bdt));
    // v6 commission = 0 (subscription-only)
    expect(Number(shadow.platform_commission_bdt)).toBe(0);
  });

  test("zone_fee_enabled=false → shadow total has zone_fee_bdt=0", async () => {
    mockLookupZoneFee.mockResolvedValue(0);

    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    const state = mockTransaction([
      { id: RIDE_ID, rider_payable_bdt: TRIP_FARE },
    ]);

    const res = await POST(apiRequest());
    expect(res.status).toBe(200);

    // Zone fee was looked up (the function is always called)
    expect(mockLookupZoneFee).toHaveBeenCalled();

    // v6 shadow zone_fee_bdt = 0
    const shadow = state.rideUpdateSet!.fare_v6_shadow as Record<string, unknown>;
    expect(shadow.zone_fee_bdt).toBe(0);

    // v2 billing zone_fee_bdt = 0 (Stage 0 hardcode)
    expect(state.rideUpdateSet!.zone_fee_bdt).toBe(0);
  });

  test("zone fee does NOT leak into commission base (ruling 1/14)", async () => {
    mockLookupZoneFee.mockResolvedValue(ZONE_FEE);

    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    const state = mockTransaction([
      { id: RIDE_ID, rider_payable_bdt: TRIP_FARE },
    ]);

    await POST(apiRequest());

    // Commission is 10% of TRIP_FARE only — zone fee is excluded
    expect(state.rideUpdateSet!.platform_commission_bdt).toBe(COMMISSION_10PCT);

    // recordRideCompletion also receives trip fare only (not trip + zone)
    expect(recordRideCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ finalFarePaisa: TRIP_FARE }),
    );
  });

  test("zone fee 100% to driver (v6 driver_net = total)", async () => {
    mockLookupZoneFee.mockResolvedValue(ZONE_FEE);

    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    const state = mockTransaction([
      { id: RIDE_ID, rider_payable_bdt: TRIP_FARE },
    ]);

    await POST(apiRequest());

    const shadow = state.rideUpdateSet!.fare_v6_shadow as Record<string, unknown>;
    // driver_net = total (0% commission in v6) — zone fee goes 100% to driver
    expect(Number(shadow.driver_net_bdt)).toBe(Number(shadow.total_bdt));
    // total = base_trip_fare + zone_fee
    expect(Number(shadow.total_bdt)).toBe(TRIP_FARE + ZONE_FEE);
    expect(Number(shadow.driver_net_bdt)).toBe(TRIP_FARE + ZONE_FEE);
  });

  test("lookupZoneFee receives correct vehicle category from ride", async () => {
    mockLookupZoneFee.mockResolvedValue(0);

    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow({ vehicle_type: "car_economy" })],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    await POST(apiRequest());

    // car_economy → PICKUP_CATEGORY = "car"
    expect(mockLookupZoneFee).toHaveBeenCalledWith(ZONE_ID, "car");
  });

  test("large zone fee (5000 paisa) still does not affect commission", async () => {
    const LARGE_ZONE_FEE = 5000;
    mockLookupZoneFee.mockResolvedValue(LARGE_ZONE_FEE);

    mockSelectQueue([
      [{ id: DRIVER_ID }],
      [rideRow()],
      [pricingRow({ base_km: 0, initiation_minutes: 0 })],
      [],
    ]);

    const state = mockTransaction([
      { id: RIDE_ID, rider_payable_bdt: TRIP_FARE + LARGE_ZONE_FEE },
    ]);

    await POST(apiRequest());

    // Commission remains 10% of trip fare only — not trip + zone
    expect(state.rideUpdateSet!.platform_commission_bdt).toBe(COMMISSION_10PCT);

    const shadow = state.rideUpdateSet!.fare_v6_shadow as Record<string, unknown>;
    expect(Number(shadow.total_bdt)).toBe(TRIP_FARE + LARGE_ZONE_FEE);
    expect(Number(shadow.platform_commission_bdt)).toBe(0); // v6 always 0%
  });
});
