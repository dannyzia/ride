/**
 * P1-21 (gap ledger, partial): driver break toggle — start/end.
 * Both directions stamp/clear on_break + break_started_at on the caller's
 * driver row; drivers are always the auth subject (users → drivers lookup).
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { drivers } from "@/src/db/schema";
import { POST as breakStart } from "@/app/api/driver/break/start+api";
import { POST as breakEnd } from "@/app/api/driver/break/end+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function jsonRequest(): Request {
  return { json: undefined } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** call 0: users · call 1: drivers */
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

describe("POST /api/driver/break/start", () => {
  const updates: { table: unknown; set: Row }[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    updates.length = 0;
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    (db.update as jest.Mock).mockImplementation((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          updates.push({ table, set: setObj });
          return [];
        }),
      })),
    }));
  });

  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await breakStart(jsonRequest());
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await breakStart(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await breakStart(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("stamps on_break with the break start time", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await breakStart(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.on_break).toBe(true);
    expect(typeof body.break_started_at).toBe("string");
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(drivers);
    expect(updates[0].set.on_break).toBe(true);
    expect(updates[0].set.break_started_at).toBeInstanceOf(Date);
  });
});

describe("POST /api/driver/break/end", () => {
  const updates: { table: unknown; set: Row }[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    updates.length = 0;
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    (db.update as jest.Mock).mockImplementation((table: unknown) => ({
      set: jest.fn((setObj: Row) => ({
        where: jest.fn(async () => {
          updates.push({ table, set: setObj });
          return [];
        }),
      })),
    }));
  });

  test("clears the break stamp", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }]]);
    const res = await breakEnd(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.on_break).toBe(false);
    expect(body.break_started_at).toBeNull();
    expect(updates[0].set).toMatchObject({ on_break: false, break_started_at: null });
  });

  test("404 driver_not_found", async () => {
    mockSelectQueue([[{ id: USER_ID }], []]);
    const res = await breakEnd(jsonRequest());
    expect(res.status).toBe(404);
  });
});
