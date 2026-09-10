/**
 * Phase F pin-edit rules — contract tests.
 *
 * POST /api/ride/[id]/pickup-move:
 * - UUID validation (400 invalid_uuid)
 * - auth (401) + Zod body validation (400 validation_error)
 * - rider ownership (403 forbidden)
 * - state gate pending|dispatching (409 invalid_state)
 * - block check FIRST: pickup_requote_count > pickup_max_forced_requotes
 *   (409 pickup_move_blocked, zone never validated)
 * - out-of-zone pin (422 outside_zone, same code as ride/request)
 * - silent re-quote within the 250 m tolerance (no increment, no WS notify)
 * - forced re-quote beyond tolerance (increment + pickup_requoted_at +
 *   fire-and-forget POST /internal/ride/pickup-moved, non-fatal on failure)
 * - conditional-update race (409 invalid_state when the claim misses)
 * - pickup fee range refresh only when pickup_fee_enabled
 *
 * Grace window (Phase F: forced requote resets the free-cancel window):
 * - cancel-preview: free_until anchors on GREATEST(created_at,
 *   pickup_requoted_at); evaluateCancellation receives the same anchor
 * - cancel: evaluateCancellation snapshot created_at = the same anchor
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/zone", () => ({
  validatePickupZone: jest.fn(),
}));
jest.mock("@/lib/barikoi", () => ({
  getRouteDistance: jest.fn(),
}));
jest.mock("@/lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(),
  parseConfigBool: (value: string) => value === "true",
  parseConfigNumber: (value: string, fallback: number) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback,
  parseConfigCsv: (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean),
  isStage1Plus: jest.fn(async () => false),
}));
jest.mock("@/lib/pickupQuote", () => ({
  pickupQuoteRange: jest.fn(),
  PICKUP_QUOTE_CONFIG_KEYS: [
    "pickup_fee_enabled",
    "pickup_free_radius_km_bike",
    "pickup_free_radius_km_cng",
    "pickup_free_radius_km_car",
    "pickup_cap_billable_km_bike",
    "pickup_cap_billable_km_cng",
    "pickup_cap_billable_km_car",
    "pickup_cap_pct_of_fare",
    "pickup_reference_pool_size",
    "pickup_reference_quantile",
    "pickup_no_driver_fallback_km",
    "pickup_low_confidence_zone_ids",
  ],
}));
jest.mock("@/lib/cityBoundary", () => ({
  detectOriginCity: jest.fn(),
  isIntercity: jest.fn(() => false),
}));
jest.mock("@/lib/routeSplit", () => ({
  splitRoute: jest.fn(),
}));
jest.mock("@/lib/fareCalc", () => ({
  ...jest.requireActual("@/lib/fareCalc"),
  calculateFare: jest.fn(),
}));
jest.mock("@/lib/cancellation", () => ({
  evaluateCancellation: jest.fn(),
}));
jest.mock("@/lib/accounting", () => ({
  recordCancellationFee: jest.fn(),
}));
jest.mock("@/lib/cancellationCompensation", () => ({
  createCancellationCreditInTx: jest.fn(),
}));
jest.mock("@/lib/paymentEvents", () => ({
  createCancellationFeeEventInTx: jest.fn(),
}));
jest.mock("@/lib/hotspots", () => ({
  haversineKm: jest.fn(() => 5),
}));
jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(),
  // R3.3 re-land: the cancel route now consults auto_redispatch_enabled
  // (gated on !canRedispatch for the fee block) — the shared mock must
  // provide it. Default fallback 'false' keeps legacy behavior in these tests.
  getConfigValue: jest.fn(),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { validatePickupZone } from "@/lib/zone";
import { getRouteDistance } from "@/lib/barikoi";
import { getFareFrameworkConfig } from "@/lib/fareFrameworkConfig";
import { pickupQuoteRange } from "@/lib/pickupQuote";
import { detectOriginCity } from "@/lib/cityBoundary";
import { calculateFare } from "@/lib/fareCalc";
import { evaluateCancellation } from "@/lib/cancellation";
import { getPlan05Int } from "@/lib/platformConfig";
import { POST as pickupMove } from "@/app/api/ride/[id]/pickup-move+api";
import { GET as cancelPreview } from "@/app/api/ride/[id]/cancel-preview+api";
import { POST as cancelRide } from "@/app/api/ride/[id]/cancel+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";
const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const ZONE_ID = "33333333-3333-4333-8333-333333333333";
const PRICING_ID = "44444444-4444-4444-8444-444444444444";
const WS_SECRET = "test-secret-min-32-characters-long!!";
const WS_PORT = "3999";

// Previous pin (23.7808, 90.4000). Silent move ≈ 133 m north; forced move
// ≈ 1.0 km north (real haversineKm from lib/fareCalc via requireActual).
const PREV = { lat: 23.7808, lng: 90.4 };
const SILENT_PIN = { lat: 23.782, lng: 90.4 };
const FORCED_PIN = { lat: 23.79, lng: 90.4 };

const T0 = new Date("2026-08-25T02:00:00.000Z");
const T1 = new Date("2026-08-25T03:00:00.000Z"); // after T0
const T_EARLY = new Date("2026-08-25T01:00:00.000Z"); // before T0

const FARE = {
  base_fare_bdt: 2000,
  distance_charge_bdt: 45000,
  inside_charge_bdt: 45000,
  outside_charge_bdt: 0,
  time_charge_bdt: 0,
  floor_fare_bdt: 2000,
  total_bdt: 50000,
  platform_commission_percent: 10,
  platform_commission_bdt: 5000,
  driver_net_bdt: 45000,
  distance_km: 5.2,
  origin_city: null,
  is_intercity: false,
  inside_km: 5.2,
  outside_km: 0,
  ride_time_min: 0,
  wait_fee_bdt: 0,
};

type Row = Record<string, unknown>;

function jsonRequest(body: unknown, auth = "bearer token"): Request {
  return {
    json: async () => body,
    headers: { get: () => auth },
  } as unknown as Request;
}

function getJson(res: Response): Promise<Row> {
  return res.json() as Promise<Row>;
}

/** Queue-based mock for db.select() outside transactions (cancel-survey convention). */
function mockSelectQueue(queue: Row[][]) {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    };
  });
}

interface UpdateState {
  setValues: Row | null;
}

/** Mock db.transaction(cb) with a tx whose first update().set().where().returning() yields rows. */
function mockTransactionUpdate(returningRows: Row[]): UpdateState {
  const state: UpdateState = { setValues: null };
  const tx = {
    update: jest.fn(() => ({
      set: jest.fn((v: Row) => {
        state.setValues = v;
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => returningRows),
          })),
        };
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: unknown) => Promise<void>) => cb(tx),
  );
  return state;
}

function rideRow(overrides: Row = {}): Row {
  return {
    user_id: USER_ID,
    status: "pending",
    origin_latitude: String(PREV.lat),
    origin_longitude: String(PREV.lng),
    destination_latitude: "23.81",
    destination_longitude: "90.43",
    vehicle_type: "car_economy",
    zone_id: ZONE_ID,
    pricing_id: PRICING_ID,
    pickup_requote_count: 0,
    pickup_requoted_at: null,
    ...overrides,
  };
}

function pricingRow(): Row {
  return { id: PRICING_ID, per_km_bdt: 500, base_fare_bdt: 2000 };
}

const fetchMock = jest.fn(() => Promise.resolve({ ok: true } as Response));

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-user-1" });
  (validatePickupZone as jest.Mock).mockResolvedValue({
    valid: true,
    zone: { id: ZONE_ID },
  });
  (getRouteDistance as jest.Mock).mockResolvedValue({
    distanceKm: 5.2,
    durationMin: 14,
    provider: "barikoi",
    polyline: "poly~new",
  });
  (detectOriginCity as jest.Mock).mockResolvedValue({
    origin_city: null,
    origin_city_polygon: null,
  });
  (getFareFrameworkConfig as jest.Mock).mockResolvedValue({
    pickup_pin_tolerance_m: "250",
    pickup_max_forced_requotes: "2",
    pickup_fee_enabled: "false",
  });
  (calculateFare as jest.Mock).mockReturnValue({ ...FARE });
  (pickupQuoteRange as jest.Mock).mockResolvedValue(null);
  (evaluateCancellation as jest.Mock).mockResolvedValue({
    feeBdt: 0,
    reason: "within_grace_period",
  });
  (getPlan05Int as jest.Mock).mockResolvedValue(120);
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.WEBSOCKET_INTERNAL_SECRET = WS_SECRET;
  process.env.UTILS_SERVER_PORT = WS_PORT;
});

afterAll(() => {
  delete process.env.WEBSOCKET_INTERNAL_SECRET;
  delete process.env.UTILS_SERVER_PORT;
});

/* ── pickup-move — validation & auth ────────────────────────────── */

describe("pickup-move — validation & auth", () => {
  test("rejects a non-UUID ride id with 400 invalid_uuid", async () => {
    const res = await pickupMove(jsonRequest({ lat: 1, lng: 1, address: "x" }), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "invalid_uuid" });
  });

  test("rejects an unauthenticated request with 401", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await pickupMove(jsonRequest({ lat: 1, lng: 1, address: "x" }), { id: RIDE_ID });
    expect(res.status).toBe(401);
    expect(await getJson(res)).toMatchObject({ error: "unauthorized" });
  });

  test("rejects an out-of-range lat with 400 validation_error", async () => {
    const res = await pickupMove(jsonRequest({ lat: 91, lng: 0, address: "x" }), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "validation_error" });
  });

  test("rejects a body missing address with 400 validation_error", async () => {
    const res = await pickupMove(jsonRequest({ lat: 1, lng: 1 }), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "validation_error" });
    expect(db.select).not.toHaveBeenCalled();
  });
});

/* ── pickup-move — ownership, state, block ──────────────────────── */

describe("pickup-move — ownership, state & block", () => {
  test("returns 404 for an unknown user", async () => {
    mockSelectQueue([[]]);
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect(await getJson(res)).toMatchObject({ error: "user_not_found" });
  });

  test("returns 404 when the ride does not exist", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect(await getJson(res)).toMatchObject({ error: "ride_not_found" });
  });

  test("returns 403 when the ride belongs to another user", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow({ user_id: "other-user" })]]);
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect(await getJson(res)).toMatchObject({ error: "forbidden" });
  });

  test("returns 409 invalid_state for a matched ride (checked before the block)", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [rideRow({ status: "matched", pickup_requote_count: 3 })],
    ]);
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect(await getJson(res)).toMatchObject({ error: "invalid_state" });
  });

  test("returns 409 pickup_move_blocked when count exceeds max — before zone validation", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow({ pickup_requote_count: 3 })]]);
    (validatePickupZone as jest.Mock).mockResolvedValue({ valid: false, error: "outside_zone" });
    const res = await pickupMove(jsonRequest({ lat: FORCED_PIN.lat, lng: FORCED_PIN.lng, address: "a" }), { id: RIDE_ID });

    expect(res.status).toBe(409);
    const body = await getJson(res);
    expect(body).toMatchObject({ error: "pickup_move_blocked" });
    expect(body.message).toBe("Pickup location can no longer be changed. Please cancel the ride.");
    expect(validatePickupZone).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("allows a move at exactly the max count (2)", async () => {
    mockSelectQueue([
      [{ id: USER_ID }],
      [rideRow({ pickup_requote_count: 2 })],
      [pricingRow()],
    ]);
    const state = mockTransactionUpdate([{ pickup_requote_count: 2 }]);
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(state.setValues).not.toHaveProperty("pickup_requote_count");
  });

  test("returns 422 outside_zone when the new pin is out of the operational zone", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow()]]);
    (validatePickupZone as jest.Mock).mockResolvedValue({ valid: false, error: "outside_zone" });
    const res = await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect(await getJson(res)).toMatchObject({ error: "outside_zone" });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

/* ── pickup-move — silent & forced re-quote ─────────────────────── */

describe("pickup-move — silent re-quote within tolerance", () => {
  test("moves the pin without incrementing the requote count and without a WS notify", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow()], [pricingRow()]]);
    const state = mockTransactionUpdate([{ pickup_requote_count: 0 }]);

    const res = await pickupMove(
      jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "New pin" }),
      { id: RIDE_ID },
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({
      ok: true,
      requote_forced: false,
      requote_count: 0,
      fare_breakdown: {
        total_bdt: 50000,
        distance_km: 5.2,
        duration_min: 14,
      },
    });

    expect(state.setValues).toMatchObject({
      origin_latitude: String(SILENT_PIN.lat),
      origin_longitude: String(SILENT_PIN.lng),
      origin_address: "New pin",
      distance_km: "5.2",
      route_polyline: "poly~new",
      fare_breakdown: { total_bdt: 50000 },
      updated_at: expect.any(Date),
    });
    expect(state.setValues).not.toHaveProperty("pickup_requote_count");
    expect(state.setValues).not.toHaveProperty("pickup_requoted_at");
    // Silent: the dispatch chain keeps running — no utils-server notify.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pickup-move — forced re-quote beyond tolerance", () => {
  test("increments the count, stamps pickup_requoted_at and notifies utils-server", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow()], [pricingRow()]]);
    const state = mockTransactionUpdate([{ pickup_requote_count: 1 }]);

    const res = await pickupMove(
      jsonRequest({ lat: FORCED_PIN.lat, lng: FORCED_PIN.lng, address: "Far pin" }),
      { id: RIDE_ID },
    );

    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toMatchObject({
      ok: true,
      requote_forced: true,
      requote_count: 1,
    });

    expect(state.setValues).toMatchObject({
      origin_latitude: String(FORCED_PIN.lat),
      origin_longitude: String(FORCED_PIN.lng),
      pickup_requote_count: 1, // 0 + 1
      pickup_requoted_at: expect.any(Date),
      route_polyline: "poly~new",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://127.0.0.1:${WS_PORT}/internal/ride/pickup-moved`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${WS_SECRET}`,
        }),
        body: JSON.stringify({ ride_id: RIDE_ID }),
      }),
    );
  });

  test("a failed chain-abort notify never fails the move (fire-and-forget)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow()], [pricingRow()]]);
    mockTransactionUpdate([{ pickup_requote_count: 1 }]);
    fetchMock.mockRejectedValueOnce(new Error("utils-server down"));

    const res = await pickupMove(
      jsonRequest({ lat: FORCED_PIN.lat, lng: FORCED_PIN.lng, address: "Far pin" }),
      { id: RIDE_ID },
    );
    expect(res.status).toBe(200);
    expect(await getJson(res)).toMatchObject({ ok: true, requote_forced: true });
  });

  test("returns 409 invalid_state when the conditional update misses (race)", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow({ status: "dispatching" })], [pricingRow()]]);
    mockTransactionUpdate([]); // claim UPDATE matched no row

    const res = await pickupMove(
      jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }),
      { id: RIDE_ID },
    );
    expect(res.status).toBe(409);
    expect(await getJson(res)).toMatchObject({ error: "invalid_state" });
  });
});

/* ── pickup-move — pickup fee range refresh ─────────────────────── */

describe("pickup-move — pickup fee range refresh", () => {
  test("refreshes low/high + state only when pickup_fee_enabled", async () => {
    (getFareFrameworkConfig as jest.Mock).mockResolvedValue({
      pickup_pin_tolerance_m: "250",
      pickup_max_forced_requotes: "2",
      pickup_fee_enabled: "true",
    });
    (pickupQuoteRange as jest.Mock).mockResolvedValue({
      lowPaisa: 1500,
      highPaisa: 4000,
      lowConfidence: false,
    });
    mockSelectQueue([[{ id: USER_ID }], [rideRow()], [pricingRow()]]);
    const state = mockTransactionUpdate([{ pickup_requote_count: 0 }]);

    const res = await pickupMove(
      jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }),
      { id: RIDE_ID },
    );

    expect(pickupQuoteRange).toHaveBeenCalledWith(
      expect.objectContaining({
        zoneId: ZONE_ID,
        vehicleType: "car_economy",
        pickupLat: SILENT_PIN.lat,
        pickupLng: SILENT_PIN.lng,
        fareBeforePickupPaisa: 50000,
      }),
    );

    expect(state.setValues).toMatchObject({
      pickup_fee_state: "range",
      pickup_fee_low_bdt: 1500,
      pickup_fee_high_bdt: 4000,
    });

    const body = await getJson(res);
    expect(body.fare_breakdown).toMatchObject({
      pickup_fee_low_bdt: 1500,
      pickup_fee_high_bdt: 4000,
    });
  });

  test("never queries the quote and never touches fee columns when disabled", async () => {
    mockSelectQueue([[{ id: USER_ID }], [rideRow()], [pricingRow()]]);
    const state = mockTransactionUpdate([{ pickup_requote_count: 0 }]);

    await pickupMove(jsonRequest({ lat: SILENT_PIN.lat, lng: SILENT_PIN.lng, address: "a" }), { id: RIDE_ID });

    expect(pickupQuoteRange).not.toHaveBeenCalled();
    expect(state.setValues).not.toHaveProperty("pickup_fee_state");
    expect(state.setValues).not.toHaveProperty("pickup_fee_low_bdt");
  });
});

/* ── grace window anchor — cancel-preview ───────────────────────── */

describe("cancel-preview — grace window anchors on GREATEST(created_at, pickup_requoted_at)", () => {
  function previewRide(overrides: Row = {}): Row {
    return {
      user_id: USER_ID,
      status: "pending",
      created_at: T0,
      pickup_requoted_at: null,
      ...overrides,
    };
  }

  test("free_until restarts from pickup_requoted_at when it is later", async () => {
    mockSelectQueue([[{ id: USER_ID }], [previewRide({ pickup_requoted_at: T1 })]]);

    const res = await cancelPreview(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(new Date(String(body.free_until)).getTime()).toBe(T1.getTime() + 120_000);
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "pending", created_at: T1 },
      "rider",
    );
  });

  test("free_until stays on created_at when pickup_requoted_at is null", async () => {
    mockSelectQueue([[{ id: USER_ID }], [previewRide()]]);

    const res = await cancelPreview(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(new Date(String(body.free_until)).getTime()).toBe(T0.getTime() + 120_000);
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "pending", created_at: T0 },
      "rider",
    );
  });

  test("free_until stays on created_at when pickup_requoted_at is earlier", async () => {
    mockSelectQueue([[{ id: USER_ID }], [previewRide({ pickup_requoted_at: T_EARLY })]]);

    const res = await cancelPreview(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(new Date(String(body.free_until)).getTime()).toBe(T0.getTime() + 120_000);
  });
});

/* ── grace window anchor — cancel ───────────────────────────────── */

describe("cancel — grace window anchors on GREATEST(created_at, pickup_requoted_at)", () => {
  function cancelRideRow(overrides: Row = {}): Row {
    return {
      id: RIDE_ID,
      user_id: USER_ID,
      driver_id: null,
      status: "pending",
      created_at: T0,
      pickup_requoted_at: null,
      origin_latitude: String(PREV.lat),
      origin_longitude: String(PREV.lng),
      ...overrides,
    };
  }

  function mockClaim(rows: Row[]): UpdateState {
    return mockTransactionUpdate(rows);
  }

  test("evaluates the fee from pickup_requoted_at when it is later", async () => {
    delete process.env.WEBSOCKET_INTERNAL_SECRET; // skip the WS notify block
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [cancelRideRow({ pickup_requoted_at: T1 })],
    ]);
    mockClaim([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, status: "cancelled" });
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "pending", created_at: T1 },
      "rider",
    );
  });

  test("evaluates the fee from created_at when pickup_requoted_at is earlier", async () => {
    delete process.env.WEBSOCKET_INTERNAL_SECRET;
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [cancelRideRow({ pickup_requoted_at: T_EARLY })],
    ]);
    mockClaim([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "pending", created_at: T0 },
      "rider",
    );
  });

  test("evaluates the fee from created_at when pickup_requoted_at is null", async () => {
    delete process.env.WEBSOCKET_INTERNAL_SECRET;
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [cancelRideRow()],
    ]);
    mockClaim([{ id: RIDE_ID }]);

    const res = await cancelRide(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(evaluateCancellation).toHaveBeenCalledWith(
      { status: "pending", created_at: T0 },
      "rider",
    );
  });
});
