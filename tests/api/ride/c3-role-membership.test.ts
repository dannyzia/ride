/* eslint-disable import/first */
/**
 * C3-8 (STAGE C3-FIX): booking/schedule/active routes check rider-role
 * MEMBERSHIP (user_roles ∪ legacy users.role), not users.role === 'rider'.
 * A shop_owner-primary account holding the rider role books, schedules,
 * overlap-checks, and polls active exactly like a legacy rider.
 */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "supabase-uid-1" })),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/zone", () => ({
  validatePickupZone: jest.fn(async () => ({ valid: false, error: "outside_zone" })),
  getZoneForLocation: jest.fn(async () => ({ zone: null })),
}));
// request+api's import chain reaches h3-js, whose wasm loader crashes
// under jest-expo's TextDecoder. The gate path under test never calls h3
// (zone check is mocked above), so a call-shape stub is enough for import.
jest.mock("h3-js", () => new Proxy({}, { get: () => () => "mock-cell" }));

import { db } from "@/src/db";
import { holdsRiderRole } from "@/lib/riderRole";
import { POST as requestRide } from "@/app/api/ride/request+api";
import { GET as overlap } from "@/app/api/ride/schedule/overlap+api";
import { GET as activeRide } from "@/app/api/rider/ride/active+api";

const USER_ID = "22222222-2222-4222-8222-222222222222";

// Select order per route: route user row (its role rides into the gate,
// so legacy riders cost zero extra queries) → membership row only for
// non-rider primaries → route data selects.
function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const next = () => rows[i++] ?? [];
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => ({
      limit: async () => next(),
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(next()).then(res, rej),
    });
    c.orderBy = () => ({ limit: async () => next() });
    return c;
  });
}

function postRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => "Bearer tok" },
    url: "http://localhost/",
  } as unknown as Request;
}

function getRequest(params = ""): Request {
  return {
    headers: { get: () => "Bearer tok" },
    url: `http://localhost/${params}`,
  } as unknown as Request;
}

const RIDE_BODY = {
  pickup_lat: 23.8103,
  pickup_lng: 90.4125,
  pickup_address: "Banani 11",
  dropoff_lat: 23.8203,
  dropoff_lng: 90.4225,
  dropoff_address: "Gulshan 2",
  vehicle_type: "cng",
};

beforeEach(() => jest.clearAllMocks());

describe("holdsRiderRole (membership helper)", () => {
  it("legacy rider-primary accounts pass without a membership row", async () => {
    queuedSelects([[{ role: "rider" }]]);
    await expect(holdsRiderRole(db, USER_ID)).resolves.toBe(true);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("shop_owner primary + rider membership passes", async () => {
    queuedSelects([[{ role: "shop_owner" }], [{ id: "membership-1" }]]);
    await expect(holdsRiderRole(db, USER_ID)).resolves.toBe(true);
  });

  it("shop_owner without rider membership fails", async () => {
    queuedSelects([[{ role: "shop_owner" }], []]);
    await expect(holdsRiderRole(db, USER_ID)).resolves.toBe(false);
  });

  it("unknown user fails", async () => {
    queuedSelects([[]]);
    await expect(holdsRiderRole(db, USER_ID)).resolves.toBe(false);
  });
});

describe("booking/schedule/active gates (C3-8)", () => {
  it("POST /api/ride/request: shop_owner+rider passes the role gate (fails later at zone, not 403)", async () => {
    queuedSelects([
      [{ id: USER_ID, role: "shop_owner", total_rides: 0, phone: "+880170000000" }],
      [{ id: "membership-1" }],
    ]);
    const res = await requestRide(postRequest(RIDE_BODY));
    // Pre-fix this was 403 forbidden; now the gate passes and the mocked
    // zone check rejects with 422 — the booking pipeline is reached.
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("outside_zone");
  });

  it("POST /api/ride/request: shop_owner WITHOUT rider membership is still blocked", async () => {
    queuedSelects([
      [{ id: USER_ID, role: "shop_owner", total_rides: 0, phone: "+880170000000" }],
      [],
    ]);
    const res = await requestRide(postRequest(RIDE_BODY));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  it("GET /api/ride/schedule/overlap: shop_owner+rider checks overlap successfully", async () => {
    queuedSelects([
      [{ id: USER_ID, role: "shop_owner" }],
      [{ id: "membership-1" }],
      [],
    ]);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const res = await overlap(getRequest(`?scheduled_at=${encodeURIComponent(future)}`));
    expect(res.status).toBe(200);
    expect((await res.json()).conflict).toBe(false);
  });

  it("GET /api/rider/ride/active: shop_owner+rider polls active (200, no active ride)", async () => {
    queuedSelects([
      [{ id: USER_ID, role: "shop_owner" }],
      [{ id: "membership-1" }],
      [],
    ]);
    const res = await activeRide(getRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).ride).toBeNull();
  });

  it("GET /api/rider/ride/active: non-rider is still blocked", async () => {
    queuedSelects([
      [{ id: USER_ID, role: "shop_owner" }],
      [],
    ]);
    const res = await activeRide(getRequest());
    expect(res.status).toBe(403);
  });
});
