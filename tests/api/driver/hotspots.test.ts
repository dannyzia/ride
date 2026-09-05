/**
 * P1-23 (gap ledger): driver hotspot suggestions (Fare Framework heat view).
 * Polygon geometry libs are mocked (own coverage in lib); the handler
 * contract asserted here:
 *  - centroid derived per zone; zones with unusable polygons drop out
 *  - suggest_score = score / (1 + idle_driver_count) — heat is discounted by
 *    idle supply already standing there
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
jest.mock("@/lib/polygon", () => ({
  normalizePolygon: jest.fn(),
  polygonCentroid: jest.fn(),
}));

import { verifySupabaseToken } from "@/lib/auth";
import { db } from "@/src/db";
import { normalizePolygon, polygonCentroid } from "@/lib/polygon";
import { GET } from "@/app/api/driver/hotspots+api";

type Row = Record<string, unknown>;

function request(): Request {
  return { json: undefined } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "uid" });
  (normalizePolygon as jest.Mock).mockImplementation((p: unknown) => p ?? null);
  (polygonCentroid as jest.Mock).mockImplementation((p: { lat: number; lng: number }[] | null) =>
    p ? { lat: 23.81, lng: 90.41 } : null,
  );
});

describe("GET /api/driver/hotspots", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  test("maps heat rows to centroid hotspots with supply-discounted suggest_score", async () => {
    const rows: Row[] = [
      { zone_id: "z1", score: "80.00", tag: "hot", idle_driver_count: 3, updated_at: new Date("2026-09-05T09:00:00Z"), name: "Banani", polygon: [{ lat: 1, lng: 1 }] },
      { zone_id: "z2", score: "50.00", tag: null, idle_driver_count: 0, updated_at: new Date("2026-09-05T09:00:00Z"), name: "Gulshan", polygon: [{ lat: 2, lng: 2 }] },
    ];
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    const hotspots = body.hotspots as Record<string, unknown>[];
    expect(hotspots).toHaveLength(2);
    expect(hotspots[0]).toMatchObject({
      zone_id: "z1",
      zone_name: "Banani",
      lat: 23.81,
      lng: 90.41,
      score: 80,
      idle_driver_count: 3,
      // 80 / (1 + 3) = 20 — heat discounted by standing idle supply
      suggest_score: 20,
    });
    expect(hotspots[1].suggest_score).toBe(50); // no idle supply → full heat
  });

  test("zones with unusable polygons are filtered out", async () => {
    const rows: Row[] = [
      { zone_id: "z1", score: "80", tag: "hot", idle_driver_count: 1, updated_at: new Date(), name: "Ok", polygon: [{ lat: 1, lng: 1 }] },
      { zone_id: "z2", score: "90", tag: "hot", idle_driver_count: 0, updated_at: new Date(), name: "Broken", polygon: null },
    ];
    (db.select as jest.Mock).mockImplementation(() => {
      const chain: any = {
        from: () => chain,
        innerJoin: () => chain,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });
    (normalizePolygon as jest.Mock).mockImplementation((p: unknown) => p ?? null);
    (polygonCentroid as jest.Mock).mockImplementation((p: unknown) => (p ? { lat: 1, lng: 1 } : null));

    const res = await GET(request());
    const hotspots = (await getJson(res)).hotspots as Record<string, unknown>[];
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].zone_id).toBe("z1");
  });

  test("500 on db failure", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      throw new Error("db down");
    });
    const res = await GET(request());
    expect(res.status).toBe(500);
  });
});
