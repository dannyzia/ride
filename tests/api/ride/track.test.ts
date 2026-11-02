/**
 * P1-17 (gap ledger): public /api/ride/[id]/track — the AUTH-EXEMPT
 * share-link endpoint (§10.2). Security invariants:
 *  - active rides expose pickup/dropoff coordinates + driver identity
 *  - TERMINAL rides (completed/cancelled/expired/no_drivers) must degrade to
 *    nothing: coordinates and driver fields nulled — a static share UUID must
 *    not leak home addresses forever
 *  - terminal responses carry no-store/no-cache + X-Robots-Tag noindex
 *  - dispatching rides (no driver yet) expose coords but null driver fields
 *  - Plan 28: active rides expose the live driver position fetched from the
 *    WebSocket server (live-coords RPC, 500ms budget) with a
 *    last_location_* DB fallback and a driver_location_age_seconds freshness
 *    signal; terminal/dispatching driver position fields stay null.
 */
/* eslint-disable import/first */
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { GET } from "@/app/api/ride/[id]/track+api";

const RIDE_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const LIVE_TS = 1_700_000_000_000;
const LIVE_POINT = { lat: 23.815, lng: 90.42, ts: LIVE_TS };

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

function mockLiveCoords(point: Row | null): jest.Mock {
  const fetchMock = jest.fn(async (url: string) =>
    point
      ? { ok: true, json: async () => point, url }
      : Promise.reject(new Error("ws down")),
  );
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  return fetchMock;
}

const ACTIVE_RIDE: Row = {
  id: RIDE_ID,
  status: "in_progress",
  driver_id: "44444444-4444-4444-8444-444444444444",
  origin_latitude: "23.8103",
  origin_longitude: "90.4125",
  destination_latitude: "23.8203",
  destination_longitude: "90.4225",
};

const DRIVER_ROW: Row = {
  name: "Kamal",
  rating: "4.70",
  vehicle_type: "bike_basic",
  last_location_lat: "23.8110",
  last_location_lng: "90.4130",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLiveCoords(null);
  jest.spyOn(Date, "now").mockReturnValue(LIVE_TS + 12_000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("GET /api/ride/[id]/track (public)", () => {
  test("400 invalid_uuid without touching the db", async () => {
    const res = await GET(new Request("http://localhost/x"), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
    expect(db.select).not.toHaveBeenCalled();
  });

  test("404 ride_not_found for an unknown ride", async () => {
    mockSelectQueue([[]]);
    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("ride_not_found");
  });

  test("active ride exposes coordinates and driver identity (ws down: last_location_* fallback)", async () => {
    mockSelectQueue([[ACTIVE_RIDE], [DRIVER_ROW]]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({
      status: "in_progress",
      driver_name: "Kamal",
      driver_rating: "4.70",
      vehicle_type: "bike_basic",
      driver_lat: 23.811,
      driver_lng: 90.413,
      driver_location_updated_at: null,
      driver_location_age_seconds: null,
      origin_lat: "23.8103",
      origin_lng: "90.4125",
      destination_lat: "23.8203",
      destination_lng: "90.4225",
    });
    // active rides get short-lived public caching, not the terminal no-store headers
    expect(res.headers.get("cache-control")).toContain("max-age=3");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  test("active ride uses the live-coords RPC and reports signal age", async () => {
    const fetchMock = mockLiveCoords({ ...LIVE_POINT });
    mockSelectQueue([[ACTIVE_RIDE], [DRIVER_ROW]]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.driver_lat).toBe(23.815);
    expect(body.driver_lng).toBe(90.42);
    expect(body.driver_location_updated_at).toBe(LIVE_TS);
    expect(body.driver_location_age_seconds).toBe(12);
    // live fix wins over the DB fallback
    expect(body.driver_lat).not.toBe(23.811);
    // RPC hits the internal live-coords route with the Bearer secret
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:3001/internal/ride/${RIDE_ID}/live-coords`);
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  test("completed ride degrades to status-only: coordinates and driver nulled", async () => {
    mockSelectQueue([[{ ...ACTIVE_RIDE, status: "completed" }], [DRIVER_ROW]]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({
      status: "completed",
      driver_name: null,
      driver_rating: null,
      vehicle_type: null,
      driver_lat: null,
      driver_lng: null,
      driver_location_updated_at: null,
      driver_location_age_seconds: null,
      origin_lat: null,
      origin_lng: null,
      destination_lat: null,
      destination_lng: null,
    });
  });

  test("terminal ride carries no-store + noindex headers", async () => {
    for (const status of ["completed", "cancelled", "expired", "no_drivers"]) {
      mockSelectQueue([[{ ...ACTIVE_RIDE, status: status }], []]);
      const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(res.headers.get("pragma")).toBe("no-cache");
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
  });

  test("dispatching ride (no driver yet): coords visible, driver fields null", async () => {
    mockSelectQueue([[{ ...ACTIVE_RIDE, status: "dispatching", driver_id: null }], []]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    const body = await getJson(res);
    expect(body.status).toBe("dispatching");
    expect(body.driver_name).toBeNull();
    expect(body.driver_lat).toBeNull();
    expect(body.driver_lng).toBeNull();
    expect(body.driver_location_updated_at).toBeNull();
    expect(body.driver_location_age_seconds).toBeNull();
    expect(body.origin_lat).toBe("23.8103");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  test("scheduled ride degrades to nulls until it is live", async () => {
    mockSelectQueue([[{ ...ACTIVE_RIDE, status: "scheduled" }], [DRIVER_ROW]]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    const body = await getJson(res);
    expect(res.status).toBe(200);
    expect(body.status).toBe("scheduled");
    expect(body.driver_name).toBeNull();
    expect(body.driver_rating).toBeNull();
    expect(body.vehicle_type).toBeNull();
    expect(body.driver_lat).toBeNull();
    expect(body.driver_lng).toBeNull();
    expect(body.driver_location_updated_at).toBeNull();
    expect(body.driver_location_age_seconds).toBeNull();
    expect(body.origin_lat).toBeNull();
    expect(body.origin_lng).toBeNull();
    expect(body.destination_lat).toBeNull();
    expect(body.destination_lng).toBeNull();
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  test("500 on db failure", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(500);
  });
});
