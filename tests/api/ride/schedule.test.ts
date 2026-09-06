/**
 * P1-15 (gap ledger): POST /api/ride/schedule — the scheduled-ride creation
 * handler (lib deps mocked; fare math has its own suites). Invariants:
 *  - lead-time bounds from platform_config (422 too_soon / too_far)
 *  - zone gates (422 outside_zone, 503 zones_not_configured)
 *  - R1.3 book-for-other hardening (400 self_booking / consent_required /
 *    consent_stale)
 *  - C-3: the advisory lock runs INSIDE the tx and BEFORE the overlap
 *    re-check (asserted via jest invocation order)
 *  - overlap → 409 with conflict id; 3-per-hour rate limit → 429
 *  - success: dispatch window is scheduled_at ± 15 min, upfront tip adds to
 *    BOTH driver and rider payable fares, stops insert with 1-based order
 *  - secondary-rider SMS is non-blocking and carries the tracking URL
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
jest.mock("@/lib/fareCalc", () => ({
  calculateFare: jest.fn(),
  calculateV6Fare: jest.fn(),
  haversineKm: jest.fn(() => 8.4),
}));
jest.mock("@/lib/cityBoundary", () => ({
  detectOriginCity: jest.fn(async () => ({ origin_city: "DHAKA_METRO", origin_city_polygon: null })),
  isIntercity: jest.fn(() => false),
}));
jest.mock("@/lib/routeSplit", () => ({
  splitRoute: jest.fn(),
}));
jest.mock("@/lib/barikoi", () => ({
  getRouteDistance: jest.fn(async () => ({ distanceKm: 9.1 })),
}));
jest.mock("@/lib/dprelay", () => ({
  sendSms: jest.fn(async () => undefined),
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(async (key: string) => (key === "schedule_min_lead_minutes" ? 30 : 7)),
}));
jest.mock("@/lib/scheduleUtils", () => ({
  computeEstimatedDurationMinutes: jest.fn(() => 20),
  checkRideOverlap: jest.fn(),
}));
jest.mock("@/lib/bookForOther", () => ({
  normalizeBdPhone: jest.fn((p: string) => p),
  isSamePhone: jest.fn((a: string, b: string) => a === b),
  isConsentFresh: jest.fn(() => true),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { validatePickupZone } from "@/lib/zone";
import { calculateFare, calculateV6Fare } from "@/lib/fareCalc";
import { checkRideOverlap } from "@/lib/scheduleUtils";
import { isSamePhone, isConsentFresh } from "@/lib/bookForOther";
import { sendSms } from "@/lib/dprelay";
import { rides, rideStops } from "@/src/db/schema";
import { POST } from "@/app/api/ride/schedule+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

// 2026-09-06T10:00Z, run under a frozen clock of 2026-09-05T10:00Z → +1 day
const SCHEDULED_AT = "2026-09-06T10:00:00.000Z";

const VALID_BODY = {
  pickup_lat: 23.8103,
  pickup_lng: 90.4125,
  pickup_address: "Banani",
  dropoff_lat: 23.8203,
  dropoff_lng: 90.4225,
  dropoff_address: "Gulshan",
  vehicle_type: "bike_basic",
  scheduled_at: SCHEDULED_AT,
};

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

const rideInserts: Row[] = [];
const stopInserts: Row[] = [];
let txExecute: jest.Mock;

function mockDb(opts: { userRow?: Row; pricingRow?: Row | null; scheduledCount?: number }): void {
  const userRow = opts.userRow ?? { id: USER_ID, role: "rider", phone: "01700000000" };
  const pricingRow = opts.pricingRow === undefined
    ? { id: "pricing-1", base_fare_bdt: 5_000, per_km_bdt: 1_500, per_min_bdt: 0 }
    : opts.pricingRow;
  let selectCalls = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    // call 0: users lookup · call 1: pricing · call 2+: post-tx SMS count
    const rows = selectCalls === 0 ? [userRow] : selectCalls === 1 ? (pricingRow ? [pricingRow] : []) : [];
    selectCalls++;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });

  rideInserts.length = 0;
  stopInserts.length = 0;
  txExecute = jest.fn(async () => []);

  const tx = {
    execute: txExecute,
    select: jest.fn(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([{ count: opts.scheduledCount ?? 0 }]).then(res, rej),
      };
      return chain;
    }),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((v: Row) => {
        if (table === rides) rideInserts.push(v);
        if (table === rideStops) stopInserts.push(v);
        return {
          returning: jest.fn(async () => [{ id: "new-ride-1", ...v }]),
        };
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(tx));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-05T10:00:00Z"));
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (validatePickupZone as jest.Mock).mockResolvedValue({ valid: true, zone: { id: "zone-1" } });
  (calculateFare as jest.Mock).mockReturnValue({ total_bdt: 20_000, distance_km: 9.1 });
  (calculateV6Fare as jest.Mock).mockReturnValue({ total_bdt: 20_500 });
  (checkRideOverlap as jest.Mock).mockResolvedValue({ overlap: false });
  mockDb({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("POST /api/ride/schedule — gates", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => [],
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  test("403 forbidden for non-riders", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => [{ id: USER_ID, role: "driver", phone: "+8801700000000" }],
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([{ id: USER_ID, role: "driver", phone: "+8801700000000" }]).then(res, rej),
      };
      return chain;
    });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  test("400 validation_error for missing pickup_address", async () => {
    mockDb({});
    const res = await POST(jsonRequest({ ...VALID_BODY, pickup_address: "" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("422 too_soon below the min-lead bound", async () => {
    mockDb({});
    const res = await POST(jsonRequest({ ...VALID_BODY, scheduled_at: "2026-09-05T10:10:00.000Z" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("too_soon");
  });

  test("422 too_far above the max-lead bound", async () => {
    mockDb({});
    const res = await POST(jsonRequest({ ...VALID_BODY, scheduled_at: "2026-09-20T10:00:00.000Z" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("too_far");
  });

  test("422 outside_zone", async () => {
    (validatePickupZone as jest.Mock).mockResolvedValue({ valid: false, error: "outside_zone" });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("outside_zone");
  });

  test("503 zones_not_configured", async () => {
    (validatePickupZone as jest.Mock).mockResolvedValue({ valid: false, error: "zones_not_configured" });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(503);
  });

  test("422 pricing_not_found when the zone has no active pricing", async () => {
    mockDb({ pricingRow: null });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("pricing_not_found");
  });
});

describe("POST /api/ride/schedule — book-for-other hardening (R1.3)", () => {
  const USER_ROW = { id: USER_ID, role: "rider", phone: "+8801700000000" };

  function queueUser(row: Row): void {
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => [row],
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([row]).then(res, rej),
      };
      return chain;
    });
  }

  test("400 self_booking when the secondary phone is the caller's own", async () => {
    queueUser({ id: USER_ID, role: "rider", phone: "01700000000" });
    mockDb({});
    const res = await POST(jsonRequest({
      ...VALID_BODY,
      secondary_rider_name: "Me",
      secondary_rider_phone: "01700000000",
      secondary_rider_consent: true,
    }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("self_booking");
    expect(isSamePhone).toHaveBeenCalled();
  });

  test("400 consent_required when consent is false", async () => {
    queueUser({ ...USER_ROW, phone: "01799999999" });
    mockDb({});
    const res = await POST(jsonRequest({
      ...VALID_BODY,
      secondary_rider_phone: "01711111111",
      secondary_rider_consent: false,
    }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("consent_required");
  });

  test("400 consent_stale when the consent timestamp is expired", async () => {
    queueUser({ ...USER_ROW, phone: "01799999999" });
    (isConsentFresh as jest.Mock).mockReturnValue(false);
    mockDb({});
    const res = await POST(jsonRequest({
      ...VALID_BODY,
      secondary_rider_phone: "01711111111",
      secondary_rider_consent: true,
      secondary_rider_consent_at: "2026-09-05T09:00:00.000Z",
    }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("consent_stale");
    (isConsentFresh as jest.Mock).mockReturnValue(true);
  });
});

describe("POST /api/ride/schedule — creation path", () => {
  test("409 ride_overlap carries the conflicting ride id", async () => {
    (checkRideOverlap as jest.Mock).mockResolvedValue({ overlap: true, conflict_ride_id: "conflict-1" });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(await getJson(res)).toEqual({
      error: "ride_overlap",
      message: "This time overlaps with another scheduled ride",
      conflict_ride_id: "conflict-1",
    });
    expect(rideInserts).toHaveLength(0);
  });

  test("429 rider_rate_limited at 3 scheduled rides in the trailing hour", async () => {
    mockDb({ scheduledCount: 3 });
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(429);
    expect((await getJson(res)).error).toBe("rider_rate_limited");
  });

  test("C-3: advisory lock executes inside the tx BEFORE the overlap re-check", async () => {
    await POST(jsonRequest(VALID_BODY));
    expect(txExecute).toHaveBeenCalled();
    expect(checkRideOverlap).toHaveBeenCalled();
    expect(txExecute.mock.invocationCallOrder[0]).toBeLessThan(
      (checkRideOverlap as jest.Mock).mock.invocationCallOrder[0],
    );
  });

  test("success: scheduled ride inserted with ±15min dispatch window and fare breakdown", async () => {
    const res = await POST(jsonRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.status).toBe("scheduled");
    expect(body.ride_id).toBe("new-ride-1");

    expect(rideInserts).toHaveLength(1);
    const v = rideInserts[0];
    expect(v.status).toBe("scheduled");
    expect(v.scheduled_at).toEqual(new Date(SCHEDULED_AT));
    expect(v.dispatch_window_start).toEqual(new Date(new Date(SCHEDULED_AT).getTime() - 15 * 60_000));
    expect(v.dispatch_window_end).toEqual(new Date(new Date(SCHEDULED_AT).getTime() + 15 * 60_000));
    expect(v.driver_fare_bdt).toBe(20_000);
    expect(v.rider_payable_bdt).toBe(20_000);
    expect(v.fare_v6_shadow).toBeDefined();
  });

  test("upfront tip adds to BOTH driver and rider payable (100% to driver)", async () => {
    const res = await POST(jsonRequest({ ...VALID_BODY, upfront_tip_bdt: 2_000 }));
    expect(res.status).toBe(200);
    expect(rideInserts[0].driver_fare_bdt).toBe(22_000);
    expect(rideInserts[0].rider_payable_bdt).toBe(22_000);
    expect(rideInserts[0].upfront_tip_bdt).toBe(2_000);
  });

  test("stops insert with 1-based stop_order in route sequence", async () => {
    const res = await POST(jsonRequest({
      ...VALID_BODY,
      stops: [
        { lat: 23.815, lng: 90.417, address: "Stop A" },
        { lat: 23.818, lng: 90.42, address: "Stop B" },
      ],
    }));
    expect(res.status).toBe(200);
    // route batch-inserts all stops in ONE values() call
    expect(stopInserts).toHaveLength(1);
    const stopRows = stopInserts[0] as unknown as Record<string, unknown>[];
    expect(stopRows).toHaveLength(2);
    expect(stopRows[0]).toMatchObject({ stop_order: 1, address: "Stop A", ride_id: "new-ride-1" });
    expect(stopRows[1]).toMatchObject({ stop_order: 2, address: "Stop B", ride_id: "new-ride-1" });
  });

  test("secondary rider: SMS sent with the tracking URL (non-blocking)", async () => {
    mockDb({ userRow: { id: USER_ID, role: "rider", phone: "+8801799999999" } });

    const res = await POST(jsonRequest({
      ...VALID_BODY,
      secondary_rider_name: "Abbu",
      secondary_rider_phone: "01711111111",
      secondary_rider_consent: true,
      secondary_rider_consent_at: "2026-09-05T09:59:00.000Z",
    }));
    expect(res.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "01711111111",
      expect.stringContaining("/track/new-ride-1"),
    );
    expect(rideInserts[0].is_booked_for_someone_else).toBe(true);
  });
});
