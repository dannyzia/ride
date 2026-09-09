// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/fleet/fleet-add-flows.test.ts).
/**
 * P1-1 (primitive audit 2026-09-09; Bug Survey consensus theme 7) — the promo
 * budget (max_uses global cap + max_uses_per_rider) was checked only at redeem
 * time, outside any transaction; the ride tx inserted the promoRedemptions row
 * without re-validating. N concurrent riders on a near-exhausted promo all
 * passed. Fix: the ride tx takes a per-promo advisory xact lock
 * ('promo_' || promo_code_id), re-reads the promo row, and re-runs both cap
 * counts ON THE TX SNAPSHOT before inserting the redemption row — the X-1
 * pattern (ride request's own advisory-locked in-tx re-check) applied to promos.
 *
 * Breach ⇒ throw { status: 409, errorCode: 'promo_no_longer_valid' } ⇒ the tx
 * aborts with NOTHING written (no ride, no stops, no redemption) ⇒ the outer
 * handler maps it to a typed 409.
 *
 * These tests invoke the REAL POST handler from app/api/ride/request+api.ts;
 * only @/src/db, @/lib/auth, @/lib/zone, @/lib/discountEngine, @/lib/barikoi
 * and @/lib/fareFrameworkConfig are mocked. The real promoCache (stage →
 * consume), fareCalc, bookForOther, parseBody and Zod schema run for real.
 * The tx mock records a call log so lock → re-read → counts → insert ordering
 * is asserted explicitly (the audit's P1-2 lock-call-order precedent).
 */
import { POST } from "../../../app/api/ride/request+api";
import { stagePromo } from "@/lib/promoCache";

// Deterministic ids (literals reused inline in the @/src/db factory below).
const PROMO_ID = "11111111-1111-1111-1111-111111111111";

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: async () => ({ id: "auth-1" }),
}));

jest.mock("@/src/db", () => {
  // Queue-driven mock: each test seeds __dbQueue (route-level selects, in
  // call order) and __txQueue (in-tx selects, in call order). The tx call log
  // captures execute/select/insert sequence for order assertions.
  const callLog: string[] = [];
  const mkQb = (result: unknown) => {
    // Drizzle query builders are thenable at EVERY chain point (some route
    // queries await .where(...) without .limit()), so the qb itself must be
    // a promise-like resolving to the queued result.
    const qb: Record<string, unknown> = {
      from: jest.fn(() => qb),
      where: jest.fn(() => qb),
      limit: jest.fn(() => qb),
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    };
    return qb;
  };
  const state: {
    dbQueue: { result: unknown }[];
    txQueue: { result: unknown; label: string }[];
    callLog: string[];
    insertCount: number;
    consumed: unknown[];
  } = { dbQueue: [], txQueue: [], callLog, insertCount: 0, consumed: [] };
  const tx: Record<string, unknown> = {
    execute: jest.fn(async () => {
      callLog.push("execute");
    }),
    select: jest.fn(() => {
      const entry = state.txQueue.shift() ?? { result: [], label: "unknown" };
      callLog.push(`select:${entry.label}`);
      return mkQb(entry.result);
    }),
    insert: jest.fn(() => {
      state.insertCount += 1;
      callLog.push(state.insertCount === 1 ? "insert-rides" : "insert-redemption");
      // Drizzle inserts are thenable AND expose .returning() — both shapes
      // must resolve (rides uses .values().returning(); promoRedemptions
      // uses .values() directly).
      const insertQb: Record<string, unknown> = {
        values: jest.fn(() => insertQb),
        returning: jest.fn(
          async () => (state.insertCount === 1 ? [{ id: "ride-1" }] : []),
        ),
        then: (
          onFulfilled: (v: unknown) => unknown,
          onRejected?: (e: unknown) => unknown,
        ) =>
          Promise.resolve(state.insertCount === 1 ? [{ id: "ride-1" }] : undefined).then(
            onFulfilled,
            onRejected,
          ),
      };
      return insertQb;
    }),
  };
  const db: Record<string, unknown> = {
    select: jest.fn(() => {
      const entry = (state.dbQueue.shift() ?? { result: [] }).result;
      state.consumed.push(entry);
      return mkQb(entry);
    }),
    execute: jest.fn(async () => undefined),
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
    __state: state,
  };
  return { db };
});

jest.mock("@/lib/zone", () => ({
  getZoneForLocation: async () => ({ zone: null }),
  validatePickupZone: async () => ({ valid: true, zone: { id: "zone-1" } }),
}));

jest.mock("@/lib/discountEngine", () => ({
  getAvailableDiscounts: async () => [
    { type: "intro", amount_bdt: 500, subscription_id: null },
    { type: "promo", amount_bdt: 500, subscription_id: null },
  ],
}));

jest.mock("@/lib/barikoi", () => ({
  getRouteDistance: async () => ({ distance_km: 5, polyline: "abc" }),
}));

// City/route libs: real signatures (detectOriginCity takes an object, returns
// { origin_city, origin_city_polygon }; isIntercity/splitRoute take the
// polygon form). Simplest correct shape: no polygon → no split, insideKm =
// total distance.
jest.mock("@/lib/cityBoundary", () => ({
  detectOriginCity: async () => ({ origin_city: "DHAKA", origin_city_polygon: null }),
  isIntercity: () => false,
}));
jest.mock("@/lib/routeSplit", () => ({
  splitRoute: jest.fn(async () => ({ inside_km: 5, outside_km: 0 })),
}));

jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: async () => ({ pickup_fee_enabled: "false" }),
  parseConfigBool: () => false,
}));

// request+api.ts imports pickupQuote (which pulls h3-js → expo TextDecoder
// polyfill that breaks under Jest) — house convention: stub the module
// (pickup-move.test.ts does the same). Never called: pickup_fee_enabled=false.
jest.mock("@/lib/pickupQuote", () => ({
  PICKUP_QUOTE_CONFIG_KEYS: [],
  pickupQuoteRange: jest.fn(async () => null),
}));

// eslint-disable-next-line import/first -- import the mocked db after the factory so we can drive the queues
import { db } from "@/src/db";

const state = () => (db as any).__state;

const userRow = { id: "rider-1", role: "rider", total_rides: 0, phone: "01700000000" };
const pricingRow = {
  vehicle_type: "car_economy",
  base_fare_bdt: 2500,
  base_km: 2,
  per_km_bdt: 5500,
  intercity_per_km_bdt: 0,
  per_min_bdt: 60,
  initiation_minutes: 4,
  free_wait_minutes: 3,
  floor_length_km: 0,
  floor_min: 0,
  brta_fare_ceiling_bdt: null,
  platform_commission_percent: 25,
};
const promoRow = (over: Partial<Record<string, unknown>> = {}) => ({
  is_active: true,
  expires_at: new Date(Date.now() + 86_400_000),
  max_uses: 100,
  max_uses_per_rider: 1,
  ...over,
});

const body = () => ({
  pickup_lat: 23.8,
  pickup_lng: 90.4,
  pickup_address: "Gulshan 1",
  dropoff_lat: 23.9,
  dropoff_lng: 90.5,
  dropoff_address: "Banani",
  vehicle_type: "car_economy",
  selected_discount_type: "promo",
  selected_discount_amount_bdt: 500,
  promo_code: "SAVE10",
});

const post = async (payload: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/ride/request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  );

// Seed the route-level select queue (users → rate-limit → pricing → promo
// match → staged-promo accept).
const seedDbQueue = () => {
  state().dbQueue = [
    { result: [userRow] },
    { result: [{ count: 0 }] },
    { result: [pricingRow] },
    { result: [{ id: PROMO_ID, code: "SAVE10" }] },
    { result: [{ id: PROMO_ID }] },
  ];
};

beforeEach(() => {
  state().dbQueue = [];
  state().txQueue = [];
  state().callLog.length = 0;
  state().insertCount = 0;
  state().consumed = [];
  stagePromo(userRow.id, {
    promoCodeId: PROMO_ID,
    riderId: userRow.id,
    discountType: "percent",
    discountValue: 10,
    maxDiscountBdt: null,
    minSpendBdt: null,
  });
});

describe("P1-1 in-tx promo budget re-validation (POST /api/ride/request)", () => {
  it("within-cap promo inserts the redemption row and returns 200", async () => {
    seedDbQueue();
    state().txQueue = [
      { result: [], label: "activeRide" },
      { result: [promoRow()], label: "promoRow" },
      { result: [{ perRider: 0 }], label: "perRider" },
      { result: [{ globalUses: 5 }], label: "globalUses" },
    ];

    const res = await post(body());
    if (res.status !== 200)
      throw new Error(
        `status ${res.status}: ${JSON.stringify(await res.json())}; consumed: ${JSON.stringify(state().consumed)}`,
      );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ride_id).toBe("ride-1");
    expect(json.status).toBe("pending");
    expect(state().callLog).toContain("insert-redemption");
  });

  it("global cap exhausted in-tx → 409 promo_no_longer_valid, redemption NOT inserted", async () => {
    seedDbQueue();
    state().txQueue = [
      { result: [], label: "activeRide" },
      { result: [promoRow({ max_uses: 10 })], label: "promoRow" },
      { result: [{ perRider: 0 }], label: "perRider" },
      { result: [{ globalUses: 10 }], label: "globalUses" },
    ];

    const res = await post(body());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("promo_no_longer_valid");
    // Zero-writes-on-breach: the tx aborted before the redemption insert.
    expect(state().callLog).not.toContain("insert-redemption");
  });

  it("per-rider cap exhausted in-tx → 409 before the global count is even read", async () => {
    seedDbQueue();
    state().txQueue = [
      { result: [], label: "activeRide" },
      { result: [promoRow({ max_uses_per_rider: 1 })], label: "promoRow" },
      { result: [{ perRider: 1 }], label: "perRider" },
      { result: [{ globalUses: 0 }], label: "globalUses" },
    ];

    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("promo_no_longer_valid");
    expect(state().callLog).not.toContain("insert-redemption");
    expect(state().callLog).not.toContain("select:globalUses");
  });

  it("promo deactivated between redeem and request → 409, nothing written", async () => {
    seedDbQueue();
    state().txQueue = [
      { result: [], label: "activeRide" },
      { result: [promoRow({ is_active: false })], label: "promoRow" },
      { result: [{ perRider: 0 }], label: "perRider" },
      { result: [{ globalUses: 0 }], label: "globalUses" },
    ];

    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("promo_no_longer_valid");
    expect(state().callLog).not.toContain("insert-redemption");
    // Liveness breach short-circuits before any count query.
    expect(state().callLog).not.toContain("select:perRider");
  });

  it("call order: ride lock → active-ride re-check → ride insert → PROMO lock → promo re-read → counts → redemption insert", async () => {
    seedDbQueue();
    state().txQueue = [
      { result: [], label: "activeRide" },
      { result: [promoRow()], label: "promoRow" },
      { result: [{ perRider: 0 }], label: "perRider" },
      { result: [{ globalUses: 5 }], label: "globalUses" },
    ];

    await post(body());
    expect(state().callLog).toEqual([
      "execute", // ride_request advisory lock (X-1/M2)
      "select:activeRide", // in-tx active-ride re-check
      "insert-rides",
      "execute", // P1-1 per-promo advisory lock
      "select:promoRow", // in-tx promo re-read (liveness + caps)
      "select:perRider",
      "select:globalUses",
      "insert-redemption",
    ]);
  });

  it("no promo selected → single advisory lock, no promo reads or inserts", async () => {
    state().dbQueue = [
      { result: [userRow] },
      { result: [{ count: 0 }] },
      { result: [pricingRow] },
    ];
    state().txQueue = [{ result: [], label: "activeRide" }];

    const res = await post({
      pickup_lat: 23.8,
      pickup_lng: 90.4,
      pickup_address: "Gulshan 1",
      dropoff_lat: 23.9,
      dropoff_lng: 90.5,
      dropoff_address: "Banani",
      vehicle_type: "car_economy",
    });
    const json = await res.json();
    if (res.status !== 200) throw new Error(`status ${res.status}: ${JSON.stringify(json)}; log: ${JSON.stringify(state().callLog)}`);
    expect(res.status).toBe(200);
    expect(state().callLog).toEqual([
      "execute",
      "select:activeRide",
      "insert-rides",
    ]);
    expect(state().callLog).not.toContain("insert-redemption");
  });
});
