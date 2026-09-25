/**
 * T3: driver promo auto-credit metric enum — the admin promos route accepts
 * ONLY scheduler-consumable metrics (utils-server/scheduler.ts job 23
 * metricConfig: rides_completed | earnings_bdt | trips_duration). A free
 * string here silently produced dead promos (job skips unknown metrics).
 *
 * Invariants:
 *  - POST/PATCH with an unknown metric → 400 validation_error, DB untouched
 *  - a valid metric persists through the R3.5 block
 *  - permission denied rejects with { status: 403 } (real requireAdminPermission shape)
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
import { POST, PATCH } from "@/app/api/admin/promos+api";

const PROMO_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const VALID = {
  code: "DRIVER10",
  discount_type: "percent",
  discount_value: 10,
  valid_from: "2026-09-01T00:00:00.000Z",
  expires_at: "2026-10-01T00:00:00.000Z",
  target_role: "driver",
  metric: "rides_completed",
  target_value: 25,
  validity_days: 14,
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
          throw { status: 403 };
        }),
  );
}

const inserts: Row[] = [];

beforeEach(() => {
  jest.clearAllMocks();
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

describe("admin promos — metric Zod enum (scheduler-consumable only)", () => {
  test.each(["completed_rides", "acceptance_rate", "bitcoin"])(
    "POST rejects unknown metric %s with 400 validation_error and no DB call",
    async (metric) => {
      const res = await POST(jsonRequest({ ...VALID, metric }));
      expect(res.status).toBe(400);
      expect(await getJson(res)).toMatchObject({ error: "validation_error" });
      expect(db.insert).not.toHaveBeenCalled();
    },
  );

  test("POST persists a scheduler-consumable metric", async () => {
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(201);
    expect(inserts[0]).toMatchObject({
      target_role: "driver",
      metric: "rides_completed",
      target_value: 25,
      validity_days: 14,
    });
  });

  test("PATCH rejects an unknown metric with 400 and no DB call", async () => {
    const res = await PATCH(
      jsonRequest({ metric: "completed_rides" }, `http://localhost/test?id=${PROMO_ID}`),
    );
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "validation_error" });
    expect(db.update).not.toHaveBeenCalled();
  });

  test("PATCH accepts each scheduler-consumable metric", async () => {
    (db.update as jest.Mock).mockImplementation((_table: unknown) => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: PROMO_ID }]) })),
      })),
    }));

    for (const metric of ["rides_completed", "earnings_bdt", "trips_duration"]) {
      const res = await PATCH(
        jsonRequest({ metric }, `http://localhost/test?id=${PROMO_ID}`),
      );
      expect(res.status).toBe(200);
    }
  });

  test("permission denied rejects with { status: 403 } (real RBAC shape)", async () => {
    grant("catalog.write", false);
    await expect(POST(jsonRequest(VALID))).rejects.toMatchObject({ status: 403 });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
