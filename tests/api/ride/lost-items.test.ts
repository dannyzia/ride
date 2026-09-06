/**
 * P0-4 (gap ledger): lost-items chain across the three actors.
 *  - rider: POST report (24h window, ownership) + GET own reports
 *  - driver: GET inbox + PATCH respond (action→status mapping, photo/return
 *    extras, foreign-item 404)
 *  - admin: GET all + PATCH mediate (support.write guard, admin_mediation flag)
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
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
import { verifySupabaseToken } from "@/lib/auth";
import { requireAdminPermission } from "@/lib/adminRbac";
import { lostItems } from "@/src/db/schema";
import { POST, GET } from "@/app/api/rider/lost-items+api";
import { GET as driverGET, PATCH as driverPATCH } from "@/app/api/driver/lost-items+api";
import { GET as adminGET, PATCH as adminPATCH } from "@/app/api/admin/lost-items+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";
const RIDE_ID = "33333333-3333-4333-8333-333333333333";
const DRIVER_ID = "44444444-4444-4444-8444-444444444444";
const ITEM_ID = "55555555-5555-4555-8555-555555555555";

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

function recentRide(): Row {
  return {
    id: RIDE_ID,
    user_id: RIDER_ID,
    driver_id: DRIVER_ID,
    completed_at: new Date(Date.now() - 3_600_000), // 1h ago, inside 24h
  };
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
          orderBy: jest.fn(async () => rows),
        })),
        orderBy: jest.fn(async () => rows),
      })),
    };
  });
}

const inserts: { table: unknown; values: Row }[] = [];
const updates: { table: unknown; set: Row; where: unknown }[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  inserts.length = 0;
  updates.length = 0;
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (requireAdminPermission as jest.Mock).mockImplementation(() => jest.fn(async () => ({})));
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      inserts.push({ table, values: v });
      return Promise.resolve([]);
    }),
  }));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn((w: unknown) => {
        updates.push({ table, set: setObj, where: w });
        return Promise.resolve([]);
      }),
    })),
  }));
});

function grantAdmin(allowed: boolean): void {
  (requireAdminPermission as jest.Mock).mockImplementation(() =>
    allowed
      ? jest.fn(async () => ({ supabaseUser: { id: "admin-uid" } }))
      : jest.fn(async () => {
          throw { status: 401 };
        }),
  );
}

describe("rider POST /api/rider/lost-items", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(404);
  });

  test("400 validation_error for an empty item_description", async () => {
    mockSelectQueue([[{ id: RIDER_ID }]]);
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("404 ride_not_found", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], []]);
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(404);
  });

  test("403 forbidden when the ride belongs to another rider", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), user_id: "other" }]]);
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(403);
  });

  test("422 report_window_expired after 24 hours", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ ...recentRide(), completed_at: new Date(Date.now() - 25 * 3_600_000) }]]);
    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("report_window_expired");
  });

  test("success: lost_items row inserted with ride, rider, and driver ids", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [recentRide()]]);

    const res = await POST(jsonRequest({ ride_id: RIDE_ID, item_description: "umbrella" }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(lostItems);
    expect(inserts[0].values).toMatchObject({
      ride_id: RIDE_ID,
      rider_id: RIDER_ID,
      driver_id: DRIVER_ID,
      item_description: "umbrella",
    });
  });
});

describe("rider GET /api/rider/lost-items", () => {
  test("returns the rider's reports", async () => {
    const rows = [{ id: ITEM_ID, rider_id: RIDER_ID }];
    mockSelectQueue([[{ id: RIDER_ID }], rows]);

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    expect((await getJson(res)).items).toEqual(rows);
  });
});

describe("driver GET/PATCH /api/driver/lost-items", () => {
  test("GET returns the driver's inbox; 404 when the caller has no driver row", async () => {
    const rows = [{ id: ITEM_ID, driver_id: DRIVER_ID }];
    mockSelectQueue([[{ id: RIDER_ID }], [{ id: DRIVER_ID }], rows]);
    const ok = await driverGET(jsonRequest());
    expect(ok.status).toBe(200);
    expect((await getJson(ok)).items).toEqual(rows);

    mockSelectQueue([[{ id: RIDER_ID }], []]);
    const missing = await driverGET(jsonRequest());
    expect(missing.status).toBe(404);
    expect((await getJson(missing)).error).toBe("driver_not_found");
  });

  test("PATCH maps each action to its status and attaches extras", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ id: DRIVER_ID }], [{ id: ITEM_ID, driver_id: DRIVER_ID, status: "reported" }]]);

    const res = await driverPATCH(
      jsonRequest({
        item_id: ITEM_ID,
        action: "photo",
        driver_response: "found it",
        photo_url: "https://cdn/x.jpg",
        return_method: "driver_returns",
      }),
    );
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(lostItems);
    expect(updates[0].set).toMatchObject({
      status: "photo_provided",
      driver_response: "found it",
      driver_photo_url: "https://cdn/x.jpg",
      return_method: "driver_returns",
    });
  });

  test("PATCH action=not_found → status unresolved", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ id: DRIVER_ID }], [{ id: ITEM_ID, driver_id: DRIVER_ID, status: "reported" }]]);

    const res = await driverPATCH(jsonRequest({ item_id: ITEM_ID, action: "not_found" }));
    expect(res.status).toBe(200);
    expect(updates[0].set.status).toBe("unresolved");
  });

  test("PATCH 404 when the item belongs to another driver", async () => {
    mockSelectQueue([[{ id: RIDER_ID }], [{ id: DRIVER_ID }], []]);

    const res = await driverPATCH(jsonRequest({ item_id: ITEM_ID, action: "confirm" }));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("not_found");
  });
});

describe("admin GET/PATCH /api/admin/lost-items", () => {
  test("GET lists all reports; 401 when the guard rejects", async () => {
    grantAdmin(true);
    const rows = [{ id: ITEM_ID }];
    mockSelectQueue([rows]);
    const ok = await adminGET(jsonRequest());
    expect(ok.status).toBe(200);
    expect((await getJson(ok)).items).toEqual(rows);

    grantAdmin(false);
    const denied = await adminGET(jsonRequest());
    expect(denied.status).toBe(401);
  });

  test("PATCH mediation sets admin_mediation and return_method", async () => {
    grantAdmin(true);

    const res = await adminPATCH(
      jsonRequest({ item_id: ITEM_ID, admin_mediation: true, return_method: "drop_at_hub" }),
    );
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(updates[0].table).toBe(lostItems);
    expect(updates[0].set).toMatchObject({ admin_mediation: true, return_method: "drop_at_hub" });
  });

  test("PATCH 400 validation_error when admin_mediation literal is not true", async () => {
    grantAdmin(true);
    const res = await adminPATCH(jsonRequest({ item_id: ITEM_ID, admin_mediation: false }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });
});
