/**
 * P1-23 (gap ledger): public rider map markers. Markers are public info —
 * auth is attempted but its failure is swallowed (asserted). The online +
 * active + non-null-coords gate is SQL-level, asserted via PgDialect;
 * vehicle_type filter is conditionally appended only when provided.
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
  getH3Ring: jest.fn(() => ["m1", "m2"]),
}));

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { verifySupabaseToken } from "@/lib/auth";
import { db } from "@/src/db";
import { getH3Ring } from "@/lib/h3";
import { POST } from "@/app/api/ride/nearby-markers+api";

const BODY = { lat: 23.8103, lng: 90.4125 };

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

let capturedWhere: SQL | undefined;

function mockMarkerRows(rows: Row[]): void {
  capturedWhere = undefined;
  (db.select as jest.Mock).mockImplementation(() => {
    const chain: any = {
      from: () => chain,
      where: (w: SQL) => {
        capturedWhere = w;
        return chain;
      },
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

type Row = Record<string, unknown>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("POST /api/ride/nearby-markers", () => {
  test("400 validation_error before anything else", async () => {
    const res = await POST(jsonRequest({ lat: 999 }));
    expect(res.status).toBe(400);
  });

  test("markers are public: a rejected token does not block the response", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue(new Error("no token"));
    mockMarkerRows([{ id: "d1", lat: "23.82", lng: "90.42", vehicle_type: "bike_basic" }]);

    const res = await POST(jsonRequest(BODY));
    expect(res.status).toBe(200);
    // zone_tier is the additive hotspot tier (null when the marker is
    // outside every zone with a fresh heat reading).
    expect((await getJson(res)).markers).toEqual([
      { id: "d1", lat: 23.82, lng: 90.42, vehicle_type: "bike_basic", zone_tier: null },
    ]);
  });

  test("gate is SQL-level: online + active + coords present, K=30 ring", async () => {
    mockMarkerRows([]);
    await POST(jsonRequest(BODY));

    expect(getH3Ring).toHaveBeenCalledWith(BODY.lat, BODY.lng, 30);
    expect(capturedWhere).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(capturedWhere as SQL);
    expect(rendered.params).toContain(true);
    expect(rendered.params).toContain("active");
    expect(rendered.sql).toContain('"drivers"."h3_cell_res9" in (');
    expect(rendered.sql).toContain("last_location_lat IS NOT NULL");
    expect(rendered.sql).toContain("last_location_lng IS NOT NULL");
    // no vehicle filter without vehicle_type in the body
    expect(rendered.sql).not.toContain('"drivers"."vehicle_type" = ');
  });

  test("vehicle_type filter appended only when provided", async () => {
    mockMarkerRows([]);
    await POST(jsonRequest({ ...BODY, vehicle_type: "car_economy" }));

    const rendered = new PgDialect().sqlToQuery(capturedWhere as SQL);
    expect(rendered.sql).toContain('"drivers"."vehicle_type" = $');
    expect(rendered.params).toContain("car_economy");
  });

  test("null-coordinate rows are dropped client-side of the boundary", async () => {
    mockMarkerRows([
      { id: "d1", lat: "23.82", lng: "90.42", vehicle_type: "bike_basic" },
      { id: "d2", lat: null, lng: null, vehicle_type: "bike_basic" },
    ]);
    const res = await POST(jsonRequest(BODY));
    const markers = (await getJson(res)).markers as unknown[];
    expect(markers).toHaveLength(1);
  });
});
