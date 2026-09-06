/**
 * P2-24 (gap ledger): admin promo-code CRUD — including the R3.5 driver
 * auto-credit fields (commit 0713098: PATCH must edit them, not just POST).
 * Invariants:
 *  - POST persists created_by + the R3.5 block (target_role/metric/
 *    target_value/validity_days) with rider/7 defaults
 *  - duplicate code (pg 23505) → 409 promo_code_exists on BOTH create and
 *    code-changing PATCH
 *  - PATCH: missing_id / no_fields / 404 branches; auto-credit fields editable
 *  - DELETE: soft-delete (deleted_at + is_active)
 */
/* eslint-disable import/first */
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { requireAdminPermission } from "@/lib/adminRbac";
import { promoCodes } from "@/src/db/schema";
import { GET, POST, PATCH, DELETE } from "@/app/api/admin/promos+api";

const PROMO_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const VALID = {
  code: "WELCOME10",
  discount_type: "percent",
  discount_value: 10,
  valid_from: "2026-09-01T00:00:00.000Z",
  expires_at: "2026-10-01T00:00:00.000Z",
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

const updates: Row[] = [];
const inserts: Row[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  updates.length = 0;
  inserts.length = 0;
  grant("catalog.write", true);
  (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
    values: jest.fn((v: Row) => {
      inserts.push(v);
      return {
        returning: jest.fn(async () => [{ id: PROMO_ID, ...v }]),
      };
    }),
  }));
});

describe("POST /api/admin/promos", () => {
  test("401 when catalog.write is denied — guard sits OUTSIDE the route try/catch, so it rejects", async () => {
    grant("catalog.write", false);
    await expect(POST(jsonRequest(VALID))).rejects.toMatchObject({ status: 401 });
  });

  test("400 validation_error for a bad discount_type", async () => {
    const res = await POST(jsonRequest({ ...VALID, discount_type: "bitcoin" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("201 persists R3.5 auto-credit fields with defaults + created_by", async () => {
    const res = await POST(jsonRequest({
      ...VALID,
      target_role: "driver",
      metric: "completed_rides",
      target_value: 25,
      validity_days: 14,
    }));
    expect(res.status).toBe(201);
    expect(await getJson(res)).toEqual({ promo_id: PROMO_ID, code: "WELCOME10" });
    expect(inserts[0]).toMatchObject({
      code: "WELCOME10",
      created_by: ADMIN_ID,
      target_role: "driver",
      metric: "completed_rides",
      target_value: 25,
      validity_days: 14,
    });
  });

  test("409 promo_code_exists on a duplicate code (pg 23505)", async () => {
    (db.insert as jest.Mock).mockImplementation((_table: unknown) => ({
      values: jest.fn(() => {
        throw { code: "23505" };
      }),
    }));
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("promo_code_exists");
  });
});

describe("PATCH /api/admin/promos", () => {
  test("400 missing_id", async () => {
    const res = await PATCH(jsonRequest({ code: "X1" }));
    expect(res.status).toBe(400);
  });

  test("400 no_fields_to_update for an empty patch", async () => {
    const res = await PATCH(jsonRequest({}, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("no_fields_to_update");
  });

  test("404 promo_not_found", async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    }));
    const res = await PATCH(jsonRequest({ code: "X1" }, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(404);
  });

  test("edits the R3.5 auto-credit fields (0713098) and is_active", async () => {
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return {
          where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PROMO_ID }]) })),
        };
      }),
    }));

    const res = await PATCH(jsonRequest({
      target_role: "driver",
      metric: "acceptance_rate",
      target_value: 90,
      validity_days: 30,
      is_active: false,
    }, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      target_role: "driver",
      metric: "acceptance_rate",
      target_value: 90,
      validity_days: 30,
      is_active: false,
    });
  });

  test("409 promo_code_exists when a code-change collides", async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => {
          throw { code: "23505" };
        }),
      })),
    }));
    const res = await PATCH(jsonRequest({ code: "TAKEN" }, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(409);
  });
});

describe("DELETE /api/admin/promos", () => {
  test("400 missing_id", async () => {
    const res = await DELETE(jsonRequest());
    expect(res.status).toBe(400);
  });

  test("404 promo_not_found", async () => {
    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => []) })),
      })),
    }));
    const res = await DELETE(jsonRequest(undefined, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(404);
  });

  test("soft-deletes: deleted_at + is_active", async () => {
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn((setObj: Row) => {
        updates.push(setObj);
        return {
          where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PROMO_ID }]) })),
        };
      }),
    }));

    const res = await DELETE(jsonRequest(undefined, `http://localhost/test?id=${PROMO_ID}`));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ deleted: true });
    expect(updates[0].deleted_at).toBeInstanceOf(Date);
    expect(updates[0].is_active).toBe(false);
  });
});

describe("GET /api/admin/promos", () => {
  test("401 when catalog.write is denied", async () => {
    grant("catalog.write", false);
    const res = await GET(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("lists promos with usage stats", async () => {
    const rows = [{ id: PROMO_ID, code: "WELCOME10", times_used: 3 }];
    (db.select as jest.Mock).mockImplementation(() => ({
      from: jest.fn(() => {
        const chain: any = {
          leftJoin: () => chain,
          where: () => chain,
          groupBy: () => chain,
          orderBy: () => ({
            limit: () => ({
              offset: async () => rows,
            }),
          }),
          then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
            Promise.resolve(rows).then(res, rej),
        };
        return chain;
      }),
    }));

    const res = await GET(jsonRequest(undefined, "http://localhost/test?status=active"));
    expect(res.status).toBe(200);
    // route PROJECTS rows into the flat shape with the redemption count joined on
    const promos = (await getJson(res)).promos as Array<Record<string, unknown>>;
    expect(promos).toHaveLength(1);
    expect(promos[0]).toMatchObject({ promo_id: PROMO_ID, code: "WELCOME10", times_used: 0 });
  });
});
