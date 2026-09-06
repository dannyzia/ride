/**
 * P1-23 (gap ledger): rider nearby-driver poll. The H3 ring deliberately
 * mirrors DISPATCH_H3_RING_K, and the busy-status SQL must mirror
 * utils-server/dispatch.ts EXACTLY — asserted here via PgDialect
 * SQL-ification (same IN-list including 'driver_arriving').
 * Also asserts:
 *  - validation runs BEFORE auth (bad body → 400 without a token check)
 *  - wait estimate = max(2, round(nearestKm / 15 * 60)); null when no driver
 *    has coordinates
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/h3", () => ({
  getH3Ring: jest.fn(() => ["cell-1", "cell-2", "cell-3"]),
}));
jest.mock("@/utils/mapUtils", () => ({
  haversineDistance: jest.fn(),
}));

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { getH3Ring } from "@/lib/h3";
import { haversineDistance } from "@/utils/mapUtils";
import { drivers } from "@/src/db/schema";
import { POST } from "@/app/api/ride/nearby-drivers+api";

const BODY = { pickup_lat: 23.8103, pickup_lng: 90.4125, vehicle_type: "bike_basic" };

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

let capturedWhere: SQL | undefined;

function mockNearbyRows(rows: Row[]): void {
  capturedWhere = undefined;
  (db.select as jest.Mock).mockImplementation(() => {
    const chain: any = {
      from: (table: unknown) => {
        void table;
        return chain;
      },
      where: (w: SQL) => {
        capturedWhere = w;
        return chain;
      },
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "uid" });
});

describe("POST /api/ride/nearby-drivers", () => {
  test("400 validation_error BEFORE auth (bad vehicle_type, no token)", async () => {
    const res = await POST(jsonRequest({ ...BODY, vehicle_type: "hoverboard" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
    expect(verifySupabaseToken).not.toHaveBeenCalled();
  });

  test("401 unauthorized when the token is rejected", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue(new Error("bad token"));
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(401);
    expect((await getJson(res)).error).toBe("unauthorized");
  });

  test("poll query mirrors the dispatch pool SQL exactly", async () => {
    mockNearbyRows([]);
    (haversineDistance as jest.Mock).mockReturnValue(5);

    await POST(jsonRequest(BODY));

    // same H3 ring constant as dispatch
    expect(getH3Ring).toHaveBeenCalledWith(BODY.pickup_lat, BODY.pickup_lng, expect.any(Number));

    expect(capturedWhere).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(capturedWhere as SQL);
    expect(rendered.sql).toContain('"drivers"."is_online" = $');
    expect(rendered.params).toContain(true);
    expect(rendered.params).toContain("active");
    expect(rendered.params).toContain("bike_basic");
    expect(rendered.sql).toContain('"drivers"."h3_cell_res9" in (');
    // busy filter — the EXACT dispatch mirror, 'driver_arriving' included
    expect(rendered.sql).toContain("NOT EXISTS");
    expect(rendered.sql).toContain(
      "IN ('matched','driver_arriving','driver_arrived','in_progress')",
    );
    expect(rendered.sql).toContain("interval '3 hours'");
  });

  test("count + wait estimate from the nearest driver (floor 2 minutes)", async () => {
    const rows = [
      { id: "d1", lat: "23.82", lng: "90.42" },
      { id: "d2", lat: "23.83", lng: "90.43" },
    ];
    mockNearbyRows(rows);
    (haversineDistance as jest.Mock)
      .mockReturnValueOnce(1.5) // d1 — nearest
      .mockReturnValueOnce(4.0); // d2

    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.count).toBe(2);
    // 1.5 km / 15 km/h * 60 = 6 min
    expect(body.estimated_wait_minutes).toBe(6);
  });

  test("wait estimate floors at 2 minutes for very close drivers", async () => {
    mockNearbyRows([{ id: "d1", lat: "23.8104", lng: "90.4126" }]);
    (haversineDistance as jest.Mock).mockReturnValue(0.05);

    const res = await POST(jsonRequest(BODY));
    expect((await getJson(res)).estimated_wait_minutes).toBe(2);
  });

  test("drivers without coordinates don't break the estimate", async () => {
    mockNearbyRows([
      { id: "d1", lat: null, lng: null },
      { id: "d2", lat: "23.82", lng: "90.42" },
    ]);
    (haversineDistance as jest.Mock).mockReturnValue(3);

    const res = await POST(jsonRequest(BODY));
    const body = await getJson(res);
    expect(body.count).toBe(2); // null-coord driver still counted
    expect(body.estimated_wait_minutes).toBe(12); // from d2 only
  });

  test("all-null coordinates → count only, null estimate", async () => {
    mockNearbyRows([{ id: "d1", lat: null, lng: null }]);
    const res = await POST(jsonRequest(BODY));
    const body = await getJson(res);
    expect(body.count).toBe(1);
    expect(body.estimated_wait_minutes).toBeNull();
  });

  test("500 nearby_failed when the poll query throws", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(500);
    expect((await getJson(res)).error).toBe("nearby_failed");
  });
});
