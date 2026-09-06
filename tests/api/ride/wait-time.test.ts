/**
 * P1-16 (gap ledger): wait-time stamping — wait-start (M-5 status-gated
 * stamp) + wait-end (free-minutes allowance → per-minute paisa fee).
 * Invariants:
 *  - wait-start only claims a stamp while the ride is driver_arrived or
 *    in_progress (the WHERE is asserted at SQL level via PgDialect — a
 *    terminal/matched ride can never be stamped)
 *  - wait-end computes chargeable = max(0, minutes − free_wait_minutes) ×
 *    wait_fee_per_minute_bdt from the zone+vehicle pricing row, defaulting
 *    to 3 free minutes / 200 paisa per minute when pricing is missing
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

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { rides } from "@/src/db/schema";
import { POST as waitStart } from "@/app/api/ride/[id]/wait-start+api";
import { POST as waitEnd } from "@/app/api/ride/[id]/wait-end+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const RIDE_ID = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

function jsonRequest(): Request {
  return { json: undefined } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

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

function queueStandard(rideRow: Row, pricingRows: Row[] = []): void {
  mockSelectQueue([
    [{ id: USER_ID }],
    [{ id: DRIVER_ID }],
    [rideRow],
    pricingRows,
  ]);
}

const RIDE_BASE: Row = {
  id: RIDE_ID,
  driver_id: DRIVER_ID,
  status: "driver_arrived",
  vehicle_type: "bike_basic",
  zone_id: "zone-1",
  wait_start_at: null,
};

const updates: { table: unknown; set: Row; where: SQL | undefined }[] = [];

function wireUpdate(whereReturns: Row[][]): void {
  updates.length = 0;
  let callIndex = 0;
  (db.update as jest.Mock).mockImplementation((table: unknown) => ({
    set: jest.fn((setObj: Row) => ({
      where: jest.fn((w: SQL) => {
        const returningRows = whereReturns[callIndex] ?? [];
        callIndex++;
        updates.push({ table, set: setObj, where: w });
        return {
          returning: jest.fn(async () => returningRows),
        };
      }),
    })),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-05T10:00:00Z"));
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("POST /api/ride/[id]/wait-start", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await waitStart(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(401);
  });

  test("400 invalid_uuid", async () => {
    const res = await waitStart(jsonRequest(), { id: "nope" });
    expect(res.status).toBe(400);
  });

  test("404 user / driver / ride lookups", async () => {
    mockSelectQueue([[]]);
    expect((await waitStart(jsonRequest(), { id: RIDE_ID })).status).toBe(404);

    mockSelectQueue([[{ id: USER_ID }], []]);
    expect((await waitStart(jsonRequest(), { id: RIDE_ID })).status).toBe(404);

    mockSelectQueue([[{ id: USER_ID }], [{ id: DRIVER_ID }], []]);
    expect((await waitStart(jsonRequest(), { id: RIDE_ID })).status).toBe(404);
  });

  test("403 forbidden when the ride belongs to another driver", async () => {
    queueStandard({ ...RIDE_BASE, driver_id: "someone-else" });
    wireUpdate([[{ id: RIDE_ID }]]);
    const res = await waitStart(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(403);
  });

  test("success: stamps wait_start_at via a status-gated claim (SQL-level assert)", async () => {
    queueStandard(RIDE_BASE);
    wireUpdate([[{ id: RIDE_ID }]]);

    const res = await waitStart(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.success).toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(rides);
    expect(updates[0].set.wait_start_at).toBeInstanceOf(Date);

    // M-5: the claim WHERE must restrict to the waitable statuses
    const rendered = new PgDialect().sqlToQuery(updates[0].where as SQL);
    expect(rendered.sql).toContain('"rides"."status" in (');
    expect(rendered.params).toContain("driver_arrived");
    expect(rendered.params).toContain("in_progress");
  });

  test("409 invalid_status when the claim matches zero rows (non-waitable status)", async () => {
    queueStandard({ ...RIDE_BASE, status: "matched" });
    wireUpdate([[]]);

    const res = await waitStart(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect((await getJson(res)).error).toBe("invalid_status");
  });
});

describe("POST /api/ride/[id]/wait-end", () => {
  test("403 forbidden for a non-owning driver", async () => {
    queueStandard({ ...RIDE_BASE, driver_id: "someone-else" });
    wireUpdate([]);
    const res = await waitEnd(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(403);
  });

  test("400 wait_not_started when no stamp exists", async () => {
    queueStandard(RIDE_BASE);
    wireUpdate([]);
    const res = await waitEnd(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("wait_not_started");
  });

  test("fee math: 10 min wait, 3 free, 200 paisa/min → 1400 paisa for 7 chargeable", async () => {
    const now = new Date("2026-09-05T10:00:00Z");
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: DRIVER_ID }],
      [{ ...RIDE_BASE, wait_start_at: new Date(now.getTime() - 10 * 60_000) }],
      [{ free_wait_minutes: 3, wait_fee_per_minute_bdt: 200 }],
    ]);
    wireUpdate([[]]);

    const res = await waitEnd(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      success: true,
      total_wait_minutes: 10,
      free_minutes: 3,
      chargeable_minutes: 7,
      wait_fee_bdt: 1_400,
    });
    expect(updates[0].set).toMatchObject({ wait_fee_bdt: 1_400 });
  });

  test("missing pricing row → defaults 3 free minutes / 200 paisa per minute", async () => {
    const now = new Date("2026-09-05T10:00:00Z");
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: DRIVER_ID }],
      [{ ...RIDE_BASE, wait_start_at: new Date(now.getTime() - 5 * 60_000) }],
      [],
    ]);
    wireUpdate([[]]);

    const res = await waitEnd(jsonRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({
      success: true,
      total_wait_minutes: 5,
      free_minutes: 3,
      chargeable_minutes: 2,
      wait_fee_bdt: 400,
    });
  });

  test("wait under the free allowance → zero fee", async () => {
    const now = new Date("2026-09-05T10:00:00Z");
    mockSelectQueue([
      [{ id: USER_ID }],
      [{ id: DRIVER_ID }],
      [{ ...RIDE_BASE, wait_start_at: new Date(now.getTime() - 2 * 60_000) }],
      [{ free_wait_minutes: 3, wait_fee_per_minute_bdt: 200 }],
    ]);
    wireUpdate([[]]);

    const res = await waitEnd(jsonRequest(), { id: RIDE_ID });
    const body = await getJson(res);
    expect(body.chargeable_minutes).toBe(0);
    expect(body.wait_fee_bdt).toBe(0);
  });
});
