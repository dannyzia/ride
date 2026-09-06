/**
 * P2-24 (gap ledger): admin catalog routes — packages, pricing,
 * city-boundaries, rider-intro-configs, cancellation-policies.
 * Invariants:
 *  - packages: soft-delete (deleted_at + is_active), PUT is the update verb
 *  - pricing: floor_length_km is numeric(10,2) — the PATCH layer must
 *    string-coerce it or drizzle rejects the write
 *  - city-boundaries: duplicate name 409, and EVERY write busts the in-process
 *    city boundary cache (stale polygons would misroute zone validation)
 *  - rider-intro-configs: GET maps the zone join into a flat shape; DELETE
 *    deactivates (soft) rather than removing
 *  - cancellation-policies: POST is catalog.write-gated, GET ungated
 */
/* eslint-disable import/first, @typescript-eslint/no-require-imports */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/cityBoundary", () => ({
  clearCityBoundaryCache: jest.fn(),
}));
jest.mock("@/lib/vehicleTypes", () => {
  const { z } = require("zod");
  return {
    VEHICLE_TYPE_ZOD_ENUM: z.enum(["bike_basic", "car_economy"]),
    BODY_TYPE_ZOD_ENUM: z.enum(["sedan", "microbus"]),
  };
});

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { clearCityBoundaryCache } from "@/lib/cityBoundary";
import { cityBoundaries, packages } from "@/src/db/schema";
import * as packagesRoute from "@/app/api/admin/packages+api";
import * as pricingRoute from "@/app/api/admin/pricing+api";
import * as cityRoute from "@/app/api/admin/city-boundaries+api";
import * as introRoute from "@/app/api/admin/rider-intro-configs+api";
import * as policiesRoute from "@/app/api/admin/cancellation-policies+api";

const PKG_ID = "22222222-2222-4222-8222-222222222222";
const CITY_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function jsonRequest(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

const allowedPerms = new Set<string>();
function setAllowed(perms: string[]): void {
  allowedPerms.clear();
  perms.forEach((p) => allowedPerms.add(p));
  (requireAdminPermission as jest.Mock).mockImplementation((perm: string) =>
    allowedPerms.has(perm)
      ? jest.fn(async () => ({ dbUser: { id: "admin-1", role: "admin" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

const updates: { table: unknown; set: Row }[] = [];
const inserts: { table: unknown; values: unknown }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  updates.length = 0;
  inserts.length = 0;
  setAllowed(["price.write", "catalog.write"]);
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => []),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      })),
      returning: jest.fn(async () => []),
    })),
  }));
});

function mockUpdateReturning(rows: Row[]): void {
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => {
      updates.push({ table, set: setObj });
      return {
        where: jest.fn(() => ({
          returning: jest.fn(async () => rows),
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(rows).then(res, rej),
        })),
        returning: jest.fn(async () => rows),
      };
    }),
  }));
}

describe("admin packages", () => {
  test("401 when price.write is denied", async () => {
    setAllowed([]);
    const res = await packagesRoute.GET(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("POST creates a call package (defaults applied by schema)", async () => {
    (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
      values: jest.fn((v: unknown) => {
        inserts.push({ table, values: v });
        return { returning: jest.fn(async () => [{ id: PKG_ID, ...(v as Row) }]) };
      }),
    }));

    const res = await packagesRoute.POST(jsonRequest({
      name: "Starter 50",
      call_count: 50,
      duration_days: 30,
      price_bdt: 99_000,
    }));
    expect(res.status).toBe(201);
    const body = await getJson(res);
    expect(body.package).toMatchObject({ id: PKG_ID, name: "Starter 50" });
    expect(inserts[0].values).toMatchObject({
      is_trial: false,
      daily_cap: 200,
      is_active: true,
      vehicle_type: null, // NULL = universal by default
    });
  });

  test("PUT updates by id; 404 when the package is gone", async () => {
    mockUpdateReturning([{ id: PKG_ID, name: "Renamed" }]);
    const ok = await packagesRoute.PUT(jsonRequest({ id: PKG_ID, name: "Renamed" }));
    expect(ok.status).toBe(200);
    expect(updates[0].set.name).toBe("Renamed");
    expect(updates[0].set.updated_at).toBeInstanceOf(Date);

    mockUpdateReturning([]);
    const missing = await packagesRoute.PUT(jsonRequest({ id: PKG_ID, name: "X" }));
    expect(missing.status).toBe(404);
    expect((await getJson(missing)).error).toBe("package_not_found");
  });

  test("DELETE soft-deletes: deleted_at stamped + is_active dropped, never a hard delete", async () => {
    mockUpdateReturning([]);
    const res = await packagesRoute.DELETE(jsonRequest(undefined, `http://localhost/test?id=${PKG_ID}`));
    expect(res.status).toBe(200);
    expect(updates[0].set.deleted_at).toBeInstanceOf(Date);
    expect(updates[0].set.is_active).toBe(false);
  });

  test("400 missing_id on DELETE without an id", async () => {
    const res = await packagesRoute.DELETE(jsonRequest(undefined, "http://localhost/test"));
    expect(res.status).toBe(400);
  });
});

describe("admin pricing", () => {
  test("GET lists the fare table", async () => {
    const rows = [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", per_km_bdt: 1500 }];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        orderBy: jest.fn(async () => rows),
      })),
    }));
    const res = await pricingRoute.GET(jsonRequest());
    expect((await getJson(res)).pricing).toEqual(rows);
  });

  test("PATCH string-coerces floor_length_km for the numeric(10,2) column", async () => {
    mockUpdateReturning([{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1" }]);

    const res = await pricingRoute.PATCH(jsonRequest({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      per_km_bdt: 1500,
      floor_length_km: 1.5,
      is_active: true,
    }));
    expect(res.status).toBe(200);
    expect(updates[0].set).toMatchObject({
      per_km_bdt: 1500,
      floor_length_km: "1.5", // numeric col expects a string
      is_active: true,
    });
  });

  test("PATCH 404 pricing_not_found when the row is gone", async () => {
    mockUpdateReturning([]);
    const res = await pricingRoute.PATCH(jsonRequest({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", per_km_bdt: 1500 }));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("pricing_not_found");
  });
});

describe("admin city-boundaries", () => {
  test("401 when catalog.write is denied", async () => {
    setAllowed([]);
    const res = await cityRoute.GET(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("POST 409 city_already_exists for a duplicate name", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => [{ id: "existing" }]),
        })),
      })),
    }));
    const res = await cityRoute.POST(jsonRequest({
      name: "Dhaka",
      polygon: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
    }));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("city_already_exists");
  });

  test("POST success busts the city boundary cache", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => []),
        })),
      })),
    }));
    (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
      values: jest.fn(() => ({
        returning: jest.fn(async () => [{ id: CITY_ID }]),
      })),
    }));

    const res = await cityRoute.POST(jsonRequest({
      name: "Khulna",
      polygon: [{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }, { lat: 3, lng: 3 }],
    }));
    expect(res.status).toBe(201);
    expect(clearCityBoundaryCache).toHaveBeenCalled();
  });

  test("PATCH success also busts the cache; 404 on a missing row", async () => {
    mockUpdateReturning([{ id: CITY_ID }]);
    const ok = await cityRoute.PATCH(jsonRequest({ is_active: false }, `http://localhost/test?id=${CITY_ID}`));
    expect(ok.status).toBe(200);
    expect(clearCityBoundaryCache).toHaveBeenCalled();

    (clearCityBoundaryCache as jest.Mock).mockClear();
    mockUpdateReturning([]);
    const missing = await cityRoute.PATCH(jsonRequest({ is_active: false }, `http://localhost/test?id=${CITY_ID}`));
    expect(missing.status).toBe(404);
    // no cache bust when nothing changed
    expect(clearCityBoundaryCache).not.toHaveBeenCalled();
  });

  test("400 missing_id on DELETE without an id", async () => {
    const res = await cityRoute.DELETE(jsonRequest(undefined, "http://localhost/test"));
    expect(res.status).toBe(400);
  });
});

describe("admin rider-intro-configs", () => {
  test("GET maps the zone join into the flat response shape", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        leftJoin: jest.fn(() => ({
          orderBy: jest.fn(async () => [
            {
              rider_intro_configs: {
                id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", zone_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", is_active: true, ride_number: 1,
                discount_percent: 20, max_discount_bdt: 5000, daily_cap_bdt: 100_000,
                effective_from: null, effective_to: null,
                created_at: new Date("2026-09-01T00:00:00Z"), updated_at: new Date("2026-09-01T00:00:00Z"),
              },
              zones: { name: "Banani" },
            },
          ]),
        })),
      })),
    }));

    const res = await introRoute.GET(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect((body.configs as Row[])[0]).toMatchObject({
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      zone_name: "Banani",
      discount_percent: 20,
    });
  });

  test("POST 201 with datetime conversion", async () => {
    (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
      values: jest.fn((v: unknown) => ({
        returning: jest.fn(async () => [{ id: "c2", ...(v as Row) }]),
      })),
    }));

    const res = await introRoute.POST(jsonRequest({
      zone_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      ride_number: 2,
      discount_percent: 15,
      daily_cap_bdt: 50_000,
      effective_from: "2026-09-06T00:00:00.000Z",
    }));
    expect(res.status).toBe(201);
    const call = (db.insert as jest.Mock).mock.calls[0];
    void call;
    const valuesArg = (db.insert as jest.Mock).mock.results[0].value.values.mock.calls[0][0] as Row;
    expect(valuesArg.effective_from).toBeInstanceOf(Date);
    expect(valuesArg.max_discount_bdt).toBeNull(); // optional → null default
  });

  test("PATCH 404 config_not_found", async () => {
    mockUpdateReturning([]);
    const res = await introRoute.PATCH(jsonRequest({ id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", is_active: false }));
    expect(res.status).toBe(404);
  });

  test("DELETE deactivates instead of removing", async () => {
    mockUpdateReturning([]);
    const res = await introRoute.DELETE(jsonRequest(undefined, `http://localhost/test?id=c1`));
    expect(res.status).toBe(200);
    expect(updates[0].set).toMatchObject({ is_active: false });
  });

  test("400 id_required on DELETE without an id", async () => {
    const res = await introRoute.DELETE(jsonRequest(undefined, "http://localhost/test"));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("id_required");
  });
});

describe("admin cancellation-policies", () => {
  test("GET lists policies ordered by priority (ungated read)", async () => {
    const rows = [{ id: "pol-1", priority: 10 }];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        orderBy: jest.fn(async () => rows),
      })),
    }));
    const res = await policiesRoute.GET();
    expect((await getJson(res as unknown as Response)).policies).toEqual(rows);
  });

  test("POST is catalog.write-gated", async () => {
    setAllowed([]);
    const res = await policiesRoute.POST(jsonRequest({
      name: "rider_early", canceller_role: "rider", ride_status: "matched",
      time_threshold_seconds: 120, fee_type: "flat", fee_amount_bdt: 2000, max_fee_bdt: 2000,
    }));
    expect(res.status).toBe(401);
  });

  test("POST inserts the policy and returns it", async () => {
    const policy = {
      name: "rider_early", canceller_role: "rider", ride_status: "matched",
      time_threshold_seconds: 120, fee_type: "flat", fee_amount_bdt: 2000, max_fee_bdt: 2000,
    };
    (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
      values: jest.fn(() => ({
        returning: jest.fn(async () => [{ id: "pol-2", ...policy }]),
      })),
    }));

    const res = await policiesRoute.POST(jsonRequest(policy));
    expect(res.status).toBe(200);
    expect((await getJson(res)).policy).toMatchObject({ id: "pol-2" });
  });
});
