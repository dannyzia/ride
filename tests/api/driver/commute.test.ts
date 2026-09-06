/**
 * P1-22 (gap ledger): driver commute preference endpoint (d29) — the rider-
 * facing side (dispatch pool filter) is already covered by
 * dispatch-blocklist.test.ts; this covers the CRUD handler:
 *  - POST upserts (insert when no row, update-with-updated_at when one exists)
 *    with schema defaults (max_deviation_meters 2000, active true)
 *  - GET returns the preference or null
 *  - DELETE removes by driver id (scoped to the caller's driver row)
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { driverCommutePreferences } from "@/src/db/schema";
import { GET, POST, DELETE } from "@/app/api/driver/commute+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const VALID = {
  destination_lat: 23.8203,
  destination_lng: 90.4225,
  destination_address: "Gulshan 2",
};

function jsonRequest(body?: unknown): Request {
  return {
    json: body === undefined ? undefined : async () => body,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** call 0: users · call 1: drivers · call 2+: route-specific selects. */
function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

const inserted: { table: unknown; values: Row }[] = [];
const updated: { table: unknown; set: Row }[] = [];
let deleted = false;

beforeEach(() => {
  jest.clearAllMocks();
  inserted.length = 0;
  updated.length = 0;
  deleted = false;
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      inserted.push({ table, values: v });
      return Promise.resolve([]);
    }),
  }));
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        updated.push({ table, set: setObj });
        return [];
      }),
    })),
  }));
  (db.delete as jest.Mock).mockImplementation((_table: unknown) => ({
    where: jest.fn(async () => {
      deleted = true;
      return [];
    }),
  }));
});

describe("POST /api/driver/commute", () => {
  test("404 driver_not_found when the caller has no driver row", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(404);
    expect((await getJson(res)).error).toBe("driver_not_found");
  });

  test("400 validation_error for a missing destination_address", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await POST(jsonRequest({ destination_lat: 23.8, destination_lng: 90.4 }));
    expect(res.status).toBe(400);
  });

  test("INSERT path when no preference row exists; schema defaults applied", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);

    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(updated).toHaveLength(0);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe(driverCommutePreferences);
    expect(inserted[0].values).toMatchObject({
      driver_id: DRIVER_ID,
      destination_lat: "23.8203", // stored as string
      destination_lng: "90.4225",
      destination_address: "Gulshan 2",
      max_deviation_meters: 2000, // schema default
      active: true, // schema default
    });
  });

  test("UPDATE path when a preference row already exists", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [{ id: "pref-1" }]]);

    const res = await POST(jsonRequest({ ...VALID, max_deviation_meters: 5000, active: false }));
    expect(res.status).toBe(200);
    expect(inserted).toHaveLength(0);
    expect(updated).toHaveLength(1);
    expect(updated[0].table).toBe(driverCommutePreferences);
    expect(updated[0].set).toMatchObject({
      driver_id: DRIVER_ID,
      max_deviation_meters: 5000,
      active: false,
    });
    expect(updated[0].set.updated_at).toBeInstanceOf(Date);
  });
});

describe("GET /api/driver/commute", () => {
  test("returns the preference row", async () => {
    const pref = { id: "pref-1", driver_id: DRIVER_ID, destination_address: "Gulshan 2" };
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], [pref]]);

    const res = await GET(jsonRequest());
    expect(res.status).toBe(200);
    expect((await getJson(res)).commute).toEqual(pref);
  });

  test("returns null when no preference exists", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);
    const res = await GET(jsonRequest());
    expect((await getJson(res)).commute).toBeNull();
  });
});

describe("DELETE /api/driver/commute", () => {
  test("removes the caller's preference", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);

    const res = await DELETE(jsonRequest());
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });
    expect(deleted).toBe(true);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await DELETE(jsonRequest());
    expect(res.status).toBe(404);
  });
});
