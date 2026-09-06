/**
 * P2-24 + P1-14 closeout (gap ledger): admin incentive-definition CRUD.
 * The POST fan-out is the risky part: creating a definition auto-enrolls
 * every ACTIVE+ONLINE driver (filtered by vehicle type when scoped), writing
 * one driver_incentives row per driver with ON CONFLICT DO NOTHING so
 * re-creation can never duplicate enrollments.
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
jest.mock("@/lib/vehicleTypes", () => {
  const { z } = require("zod");
  return {
    VEHICLE_TYPE_ZOD_ENUM: z.enum(["bike_basic", "bike_standard", "car_economy"]),
    checkDriverEligibility: jest.fn(() => ({ eligible: true })),
  };
});

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { driverIncentives, incentiveDefinitions } from "@/src/db/schema";
import { GET, POST, PATCH, DELETE } from "@/app/api/admin/incentives+api";

const INC_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const VALID = {
  name: "Weekend warrior",
  target_metric: "completed_rides",
  target_value: 20,
  reward_calls: 5,
  starts_at: "2026-09-01T00:00:00.000Z",
  ends_at: "2026-09-30T00:00:00.000Z",
};

function jsonRequest(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function grant(permission: string, allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation((perm: string) =>
    perm === permission && allowed
      ? jest.fn(async () => ({ dbUser: { id: ADMIN_ID, role: "admin" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

const enrollments: Row[] = [];
let incentiveReturning: Row[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  enrollments.length = 0;
  incentiveReturning = [{ id: INC_ID, name: VALID.name }];
  grant("catalog.write", true);
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      if (table === driverIncentives) enrollments.push(v);
      return {
        returning: jest.fn(async () => incentiveReturning),
        onConflictDoNothing: jest.fn(async () => []),
      };
    }),
  }));
});

describe("GET /api/admin/incentives", () => {
  test("401 when the catalog.write guard rejects", async () => {
    grant("catalog.write", false);
    const res = await GET(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("returns definitions (soft-deleted excluded by default)", async () => {
    const rows = [{ id: INC_ID, name: VALID.name }];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          orderBy: jest.fn(async () => rows),
        })),
        orderBy: jest.fn(async () => rows),
      })),
    }));

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    expect((await getJson(res)).incentives).toEqual(rows);
  });
});

describe("POST /api/admin/incentives", () => {
  test("400 validation_error for a bad target_metric", async () => {
    const res = await POST(jsonRequest({ ...VALID, target_metric: "vibes" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("400 validation_error for a non-positive target_value", async () => {
    const res = await POST(jsonRequest({ ...VALID, target_value: 0 }));
    expect(res.status).toBe(400);
  });

  test("universal incentive: definition inserted + every active online driver enrolled once", async () => {
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => ({
        where: jest.fn(async () => [{ id: "d1" }, { id: "d2" }, { id: "d3" }]),
      })),
    }));

    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(201);
    expect(await getJson(res)).toEqual({ incentive_id: INC_ID, name: VALID.name });

    // definition insert carries created_by and stringified target_value
    const defInsert = (db.insert as jest.Mock).mock.calls.findIndex(
      (c) => c[0] === incentiveDefinitions,
    );
    expect(defInsert).toBeGreaterThanOrEqual(0);
    const defValues = (db.insert as jest.Mock).mock.results[defInsert].value.values.mock.calls[0][0];
    expect(defValues).toMatchObject({ created_by: ADMIN_ID, target_value: "20" });

    // one enrollment per eligible driver, conflict-safe
    expect(enrollments).toHaveLength(3);
    expect(enrollments.every((e) => e.incentive_id === INC_ID && e.current_progress === "0")).toBe(true);
  });

  test("vehicle-type-scoped incentive only enrolls matching drivers", async () => {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const chain: any = {
        from: () => chain,
        where: () => chain,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(call === 1 ? [{ id: "d-bike" }] : []).then(res, rej),
      };
      return chain;
    });

    const res = await POST(jsonRequest({ ...VALID, vehicle_type_filter: "bike_basic" }));
    expect(res.status).toBe(201);
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].driver_id).toBe("d-bike");
  });
});

describe("PATCH /api/admin/incentives", () => {
  test("400 missing_id when no id query param", async () => {
    const res = await PATCH(jsonRequest({ name: "New" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("missing_id");
  });

  test("400 no_fields_to_update for an empty patch", async () => {
    const res = await PATCH(jsonRequest({}, `http://localhost/test?id=${INC_ID}`));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("no_fields_to_update");
  });

  test("404 incentive_not_found when the update matches nothing", async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    }));
    const res = await PATCH(jsonRequest({ name: "New" }, `http://localhost/test?id=${INC_ID}`));
    expect(res.status).toBe(404);
  });

  test("applies provided fields; target_value stringified; is_active supported", async () => {
    const updates: Row[] = [];
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return {
          where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: INC_ID }]) })),
        };
      }),
    }));

    const res = await PATCH(jsonRequest(
      { name: "Renamed", target_value: 30, is_active: false },
      `http://localhost/test?id=${INC_ID}`,
    ));
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      name: "Renamed",
      target_value: "30", // numeric col is string-typed in the schema
      is_active: false,
    });
    expect(updates[0].updated_at).toBeInstanceOf(Date);
  });
});

describe("DELETE /api/admin/incentives", () => {
  test("400 missing_id", async () => {
    const res = await DELETE(jsonRequest());
    expect(res.status).toBe(400);
  });

  test("404 incentive_not_found", async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    }));
    const res = await DELETE(jsonRequest(undefined, `http://localhost/test?id=${INC_ID}`));
    expect(res.status).toBe(404);
  });

  test("soft-deletes: deleted_at stamped and is_active dropped", async () => {
    const updates: Row[] = [];
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return {
          where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: INC_ID }]) })),
        };
      }),
    }));

    const res = await DELETE(jsonRequest(undefined, `http://localhost/test?id=${INC_ID}`));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ deleted: true });
    expect(updates[0].deleted_at).toBeInstanceOf(Date);
    expect(updates[0].is_active).toBe(false);
  });
});
