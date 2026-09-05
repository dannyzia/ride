/**
 * P1-21 (gap ledger): POST /api/driver/session/force-end — zombie-session
 * recovery. Asserts:
 *  - every OPEN session (went_offline_at IS NULL) is closed with a computed
 *    duration_minutes
 *  - driver state resets (is_online false, break cleared) in the same pass
 *  - response honestly reports count/ended even when zero sessions were open
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
import { driverOnlineSessions, drivers } from "@/src/db/schema";
import { POST } from "@/app/api/driver/session/force-end+api";

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

const sessionUpdates: Array<Record<string, unknown>> = [];
const driverUpdates: Row[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  sessionUpdates.length = 0;
  driverUpdates.length = 0;
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-05T12:00:00Z"));
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn(async () => {
        if (table === driverOnlineSessions) sessionUpdates.push(setObj);
        if (table === drivers) driverUpdates.push(setObj);
        return [];
      }),
    })),
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("POST /api/driver/session/force-end", () => {
  test("404 user / driver lookups", async () => {
    (db.select as jest.Mock).mockImplementation(() => {
      let call = 0;
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => (call++ === 0 ? [] : []),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve([]).then(res, rej),
      };
      return chain;
    });
    const res = await POST(jsonRequest());
    expect(res.status).toBe(404);
  });

  test("closes each open session with computed duration and resets driver state", async () => {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const rows =
        call === 1
          ? [{ id: USER_ID }]
          : call === 2
            ? [{ id: DRIVER_ID }]
            : [
                { id: "s1", went_online_at: new Date("2026-09-05T10:00:00Z") }, // 120 min
                { id: "s2", went_online_at: new Date("2026-09-05T11:45:00Z") }, // 15 min
              ];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => rows,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const res = await POST(jsonRequest());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body).toEqual({ success: true, ended: true, count: 2 });

    expect(sessionUpdates).toHaveLength(2);
    expect(sessionUpdates[0]).toMatchObject({ duration_minutes: 120 });
    expect(sessionUpdates[0].went_offline_at).toBeInstanceOf(Date);
    expect(sessionUpdates[1].duration_minutes).toBe(15);

    expect(driverUpdates).toHaveLength(1);
    expect(driverUpdates[0]).toMatchObject({ is_online: false, on_break: false, break_started_at: null });
  });

  test("no open sessions → ended=false, driver state still reset", async () => {
    let call = 0;
    (db.select as jest.Mock).mockImplementation(() => {
      call++;
      const rows = call === 1 ? [{ id: USER_ID }] : call === 2 ? [{ id: DRIVER_ID }] : [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: async () => rows,
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
          Promise.resolve(rows).then(res, rej),
      };
      return chain;
    });

    const res = await POST(jsonRequest());
    const body = await getJson(res);
    expect(body).toEqual({ success: true, ended: false, count: 0 });
    expect(sessionUpdates).toHaveLength(0);
    expect(driverUpdates[0].is_online).toBe(false);
  });
});
