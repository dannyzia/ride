/**
 * Phase G: cancel-survey endpoint contract tests.
 *
 * POST /api/ride/[id]/cancel-survey — rider-owned survey for
 * driver-cancelled rides. Verifies:
 * - UUID validation (400 invalid_uuid)
 * - auth (401)
 * - Zod body validation (400 validation_error)
 * - rider ownership (403 forbidden)
 * - driver-cancelled-only gate (422 ride_not_driver_cancelled)
 * - once-per-ride idempotency via cancel_surveys.ride_id unique (409)
 * - evidence APPEND to open off_platform_completion fraud flags
 *   (by flag.ride_id first, then evidence-contains fallback)
 * - completed=false records the survey but never touches fraud flags
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { cancelSurveys } from "@/src/db/schema";
import { POST } from "../[id]/cancel-survey+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";
const RIDE_ID = "22222222-2222-4222-8222-222222222222";
const DRIVER_ID = "33333333-3333-4333-8333-333333333333";
const FLAG_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_FLAG_ID = "45454545-4545-4545-8545-454545454545";
const SURVEY_ID = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown>;

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

/** Queue-based mock for db.select() outside the transaction. */
function mockSelectQueue(queue: Row[][]) {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
        })),
      })),
    };
  });
}

interface TxState {
  insertValues: Record<string, unknown> | null;
  updateSet: Record<string, unknown> | null;
  selectCalls: number;
}

interface TxMock {
  insert: jest.Mock;
  select: jest.Mock;
  update: jest.Mock;
}

/**
 * Mock db.transaction(cb) — invokes cb with a tx mock.
 * - insertRows: result of the survey insert's .returning()
 * - flagByRideId: first tx.select (flag lookup by ride_id, .limit(1))
 * - openFlags: second tx.select (evidence-scan fallback, awaited array)
 */
function mockTransaction(options: { insertRows: Row[]; flagByRideId?: Row[]; openFlags?: Row[] }): TxState {
  const state: TxState = { insertValues: null, updateSet: null, selectCalls: 0 };
  const tx: TxMock = {
    insert: jest.fn(() => ({
      values: jest.fn((v: Row) => {
        state.insertValues = v;
        return {
          onConflictDoNothing: jest.fn(() => ({
            returning: jest.fn(async () => options.insertRows),
          })),
        };
      }),
    })),
    select: jest.fn(() => {
      const call = state.selectCalls++;
      // call 0: .where().limit(1) → array; call 1: .where() awaited directly.
      const rows = call === 0 ? (options.flagByRideId ?? []) : (options.openFlags ?? []);
      const whereResult = call === 0 ? { limit: jest.fn(async () => rows) } : rows;
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => whereResult),
        })),
      };
    }),
    update: jest.fn(() => ({
      set: jest.fn((v: Row) => {
        state.updateSet = v;
        return { where: jest.fn(async () => []) };
      }),
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: TxMock) => Promise<void>) => cb(tx),
  );
  return state;
}

function driverCancelledRide(overrides: Row = {}): Row {
  return {
    id: RIDE_ID,
    user_id: USER_ID,
    status: "cancelled",
    cancelled_by: "driver",
    driver_id: DRIVER_ID,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-user-1" });
});

/* ── Validation & auth ─────────────────────────────────────────── */

describe("cancel-survey — validation", () => {
  test("rejects a non-UUID ride id with 400 invalid_uuid", async () => {
    const res = await POST(jsonRequest({ completed: true }), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "invalid_uuid" });
  });

  test("rejects an unauthenticated request with 401", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(401);
    expect(await getJson(res)).toMatchObject({ error: "unauthorized" });
  });

  test("rejects a body missing `completed` with 400 validation_error", async () => {
    const res = await POST(jsonRequest({}), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "validation_error" });
  });

  test("rejects a non-boolean `completed` with 400 validation_error", async () => {
    const res = await POST(jsonRequest({ completed: "yes" }), { id: RIDE_ID });
    expect(res.status).toBe(400);
    expect(await getJson(res)).toMatchObject({ error: "validation_error" });
  });
});

/* ── Ownership & eligibility ───────────────────────────────────── */

describe("cancel-survey — ownership & eligibility", () => {
  test("returns 404 for an unknown user", async () => {
    mockSelectQueue([[]]);
    mockTransaction({ insertRows: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect(await getJson(res)).toMatchObject({ error: "user_not_found" });
  });

  test("returns 404 when the ride does not exist", async () => {
    mockSelectQueue([[{ id: USER_ID, role: "rider" }], []]);
    mockTransaction({ insertRows: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect(await getJson(res)).toMatchObject({ error: "ride_not_found" });
  });

  test("returns 403 when the ride belongs to another user", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide({ user_id: "other-user" })],
    ]);
    mockTransaction({ insertRows: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect(await getJson(res)).toMatchObject({ error: "forbidden" });
  });

  test("returns 422 when the ride is not driver-cancelled (rider cancelled)", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide({ cancelled_by: "rider" })],
    ]);
    mockTransaction({ insertRows: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect(await getJson(res)).toMatchObject({ error: "ride_not_driver_cancelled" });
  });

  test("returns 422 when the ride is not cancelled at all", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide({ status: "completed", cancelled_by: null })],
    ]);
    mockTransaction({ insertRows: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(422);
    expect(await getJson(res)).toMatchObject({ error: "ride_not_driver_cancelled" });
  });
});

/* ── Idempotency ───────────────────────────────────────────────── */

describe("cancel-survey — once-per-ride idempotency", () => {
  test("returns 409 survey_already_submitted when the insert conflicts", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({ insertRows: [] }); // onConflictDoNothing → []
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect(await getJson(res)).toMatchObject({ error: "survey_already_submitted" });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(state.selectCalls).toBe(0); // no flag work after a conflict
    expect(state.updateSet).toBeNull();
  });
});

/* ── Happy paths ───────────────────────────────────────────────── */

describe("cancel-survey — survey recording", () => {
  test("completed=false records the survey and never queries fraud flags", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({ insertRows: [{ id: SURVEY_ID }] });
    const res = await POST(jsonRequest({ completed: false }), { id: RIDE_ID });

    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, flag_updated: false });
    expect(state.insertValues).toEqual({
      ride_id: RIDE_ID,
      rider_id: USER_ID,
      completed: false,
    });
    expect(state.selectCalls).toBe(0);
    expect(state.updateSet).toBeNull();
  });

  test("completed=true with no open flag records the survey only", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({ insertRows: [{ id: SURVEY_ID }], flagByRideId: [], openFlags: [] });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });

    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, flag_updated: false });
    expect(state.selectCalls).toBe(2); // ride_id lookup + evidence scan
    expect(state.updateSet).toBeNull();
  });
});

/* ── Fraud-flag evidence append ────────────────────────────────── */

describe("cancel-survey — off_platform_completion evidence append", () => {
  test("appends evidence to the open flag matched by flag.ride_id, preserving existing evidence", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({
      insertRows: [{ id: SURVEY_ID }],
      flagByRideId: [{ id: FLAG_ID, ride_id: RIDE_ID, evidence: { overlap_pct: 0.72, sample_points: 40 } }],
    });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });

    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, flag_updated: true });
    expect(state.selectCalls).toBe(1); // matched on ride_id — no evidence scan
    expect(state.updateSet).toMatchObject({
      evidence: {
        overlap_pct: 0.72, // appended (merged), not overwritten
        sample_points: 40,
        cancel_survey_completed: true,
        survey_ride_id: RIDE_ID,
        surveyed_at: expect.any(String),
      },
      updated_at: expect.any(Date),
    });
  });

  test("falls back to the open flag whose evidence jsonb contains this ride_id", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({
      insertRows: [{ id: SURVEY_ID }],
      flagByRideId: [],
      openFlags: [
        { id: OTHER_FLAG_ID, ride_id: null, evidence: { overlap_pct: 0.9 } }, // no match
        { id: FLAG_ID, ride_id: null, evidence: { related_ride_ids: [RIDE_ID] } }, // match
      ],
    });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });

    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, flag_updated: true });
    expect(state.selectCalls).toBe(2);
    expect(state.updateSet).toMatchObject({
      evidence: {
        related_ride_ids: [RIDE_ID],
        cancel_survey_completed: true,
        survey_ride_id: RIDE_ID,
        surveyed_at: expect.any(String),
      },
      updated_at: expect.any(Date),
    });
  });

  test("ignores open flags for the same driver with unrelated evidence", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const state = mockTransaction({
      insertRows: [{ id: SURVEY_ID }],
      flagByRideId: [],
      openFlags: [{ id: OTHER_FLAG_ID, ride_id: null, evidence: { overlap_pct: 0.9 } }],
    });
    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });

    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true, flag_updated: false });
    expect(state.updateSet).toBeNull();
  });

  test("inserts into cancel_surveys (table identity)", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [driverCancelledRide()],
    ]);
    const insertMock = jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoNothing: jest.fn(() => ({
          returning: jest.fn(async () => [{ id: SURVEY_ID }]),
        })),
      })),
    }));
    let txSelectCalls = 0;
    const tx: TxMock = {
      insert: insertMock,
      select: jest.fn(() => {
        const call = txSelectCalls++;
        const whereResult = call === 0 ? { limit: jest.fn(async () => []) } : [];
        return {
          from: jest.fn(() => ({
            where: jest.fn(() => whereResult),
          })),
        };
      }),
      update: jest.fn(),
    };
    (db.transaction as jest.Mock).mockImplementation(
      async (cb: (t: TxMock) => Promise<void>) => cb(tx),
    );

    const res = await POST(jsonRequest({ completed: true }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect(insertMock).toHaveBeenCalledWith(cancelSurveys);
  });
});
