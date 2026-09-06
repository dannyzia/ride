/**
 * P1-17 (gap ledger): public /api/ride/[id]/track — the AUTH-EXEMPT
 * share-link endpoint (§10.2). Security invariants:
 *  - active rides expose pickup/dropoff coordinates + driver identity
 *  - TERMINAL rides (completed/cancelled/expired/no_drivers) must degrade to
 *    nothing: coordinates and driver fields nulled — a static share UUID must
 *    not leak home addresses forever
 *  - terminal responses carry no-store/no-cache + X-Robots-Tag noindex
 *  - dispatching rides (no driver yet) expose coords but null driver fields
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

const ACTIVE_RIDE: Row = {
  status: "in_progress",
  driver_id: "44444444-4444-4444-8444-444444444444",
  origin_latitude: "23.8103",
  origin_longitude: "90.4125",
  destination_latitude: "23.8203",
  destination_longitude: "90.4225",
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/ride/[id]/track (public)", () => {
  test("400 invalid_uuid without touching the db", async () => {
    const res = await GET(new Request("http://localhost/x"), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
    expect(db.select).not.toHaveBeenCalled();
  });

  test("404 for an unknown ride", async () => {
    mockSelectQueue([[]]);
    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("not_found");
  });

  test("active ride exposes coordinates and driver identity", async () => {
    mockSelectQueue([
      [ACTIVE_RIDE],
      [{ name: "Kamal", rating: "4.70", vehicle_type: "bike_basic" }],
    ]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({
      status: "in_progress",
      driver_name: "Kamal",
      driver_rating: "4.70",
      vehicle_type: "bike_basic",
      origin_lat: "23.8103",
      origin_lng: "90.4125",
      destination_lat: "23.8203",
      destination_lng: "90.4225",
    });
    // active rides get default caching, not the terminal no-store headers
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });

  test("completed ride degrades to status-only: coordinates and driver nulled", async () => {
    mockSelectQueue([[{ ...ACTIVE_RIDE, status: "completed" }], [{ name: "Kamal", rating: "4.70", vehicle_type: "bike_basic" }]]);

    const res = await GET(new Request("http://localhost/x"), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.status).toBe("completed");
    expect(body.driver_name).toBeNull();
    expect(body.origin_lat).toBeNull();
    expect(body.origin_lng).toBeNull();
    expect(body.destination_lat).toBeNull();
    expect(body.destination_lng).toBeNull();
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
    expect(body.origin_lat).toBe("23.8103");
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
