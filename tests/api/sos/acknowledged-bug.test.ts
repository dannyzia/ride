/**
 * SOS acknowledged-stuck bug regression tests.
 *
 * Bug: Once an admin acknowledges an SOS alert (status: 'acknowledged'),
 * the alert becomes stuck — user cannot resolve, scheduler cannot auto-resolve,
 * and the active endpoint does not return it.
 *
 * Fix: All three consumers now accept 'open' OR 'acknowledged'.
 * This file verifies each fix path.
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
  requireRole: jest.fn(() => async () => ({ id: "admin-uid", role: "admin" })),
}));
jest.mock("@/lib/adminRbac", () => ({
  requireAdminPermission: jest.fn(() => async () => ({
    supabaseUser: { id: "admin-uid" },
    dbUser: { id: "admin-uid", role: "admin" },
  })),
  isOwner: (u: { role: string }) => u.role === "owner",
  OWNER_ONLY_CONFIG_KEYS: new Set<string>(),
  GUARDRAIL_KM_KEYS: new Set<string>(),
  guardrailViolation: () => false,
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(async () => 1800),
}));

import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { POST as resolvePOST } from "@/app/api/sos/resolve+api";
import { GET as activeGET } from "@/app/api/sos/active+api";
import { GET as adminGET } from "@/app/api/admin/sos-alerts+api";

const USER_ID = "11111111-1111-4111-a111-111111111111";
const ADMIN_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ALERT_ID = "33333333-3333-4333-8333-333333333333";
const _CREATED_AT = new Date("2026-08-21T10:00:00Z");

/* ------------------------------------------------------------------ */
/*  Mock DB chain helpers                                              */
/* ------------------------------------------------------------------ */

type ChainResult = Record<string, unknown>;

/**
 * Queue-based mock for db.select(). Each call to db.select() dequeues the
 * next result set from the queue. This handles routes that make multiple
 * sequential queries (e.g. user lookup + alert lookup).
 */
function mockSelectQueue(queue: ChainResult[][]) {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(async () => rows),
          orderBy: jest.fn(() => ({
            limit: jest.fn(async () => rows),
          })),
        })),
      })),
    };
  });
}

/** Mock db.update() — records the last set() call for assertions. */
function mockUpdate(): { set: Record<string, unknown> | null } {
  const state: { set: Record<string, unknown> | null } = { set: null };
  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn((values: Record<string, unknown>) => {
      state.set = values;
      return {
        where: jest.fn(async () => []),
      };
    }),
  }));
  return state;
}

function jsonRequest(body: Record<string, unknown>): Request {
  return { json: async () => body } as unknown as Request;
}

function getJson(res: Response): Record<string, unknown> {
  return res.json() as unknown as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Shared setup                                                       */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  jest.clearAllMocks();
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: "supa-user-1" });
});

/* ================================================================== */
/*  Scenario 1: User resolves after admin acknowledges                  */
/* ================================================================== */

describe("resolve endpoint — acknowledged alerts", () => {
  test("user can resolve an alert with status 'acknowledged'", async () => {
    // Queue: 1st call = user lookup, 2nd call = alert lookup (acknowledged)
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ id: ALERT_ID, user_id: USER_ID, status: "acknowledged" }],
    ]);
    const lastUpdate = mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ ok: true });
    expect(lastUpdate.set).toMatchObject({ status: "resolved" });
  });

  test("user can still resolve an alert with status 'open'", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ id: ALERT_ID, user_id: USER_ID, status: "open" }],
    ]);
    const lastUpdate = mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(200);
    expect(lastUpdate.set).toMatchObject({ status: "resolved" });
  });

  test("rejects alert with status 'resolved' (already closed)", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ id: ALERT_ID, user_id: USER_ID, status: "resolved" }],
    ]);
    mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(409);
    expect(await getJson(res)).toMatchObject({ error: "alert_not_resolvable" });
  });

  test("rejects alert with status 'cancelled'", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ id: ALERT_ID, user_id: USER_ID, status: "cancelled" }],
    ]);
    mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(409);
    expect(await getJson(res)).toMatchObject({ error: "alert_not_resolvable" });
  });

  test("non-owner cannot resolve acknowledged alert", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{ id: ALERT_ID, user_id: "other-user-id", status: "acknowledged" }],
    ]);
    mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(403);
    expect(await getJson(res)).toMatchObject({ error: "forbidden" });
  });

  test("returns 404 when alert does not exist", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [], // no alert found
    ]);
    mockUpdate();

    const res = await resolvePOST(jsonRequest({ alert_id: ALERT_ID }));
    expect(res.status).toBe(404);
    expect(await getJson(res)).toMatchObject({ error: "alert_not_found" });
  });
});

/* ================================================================== */
/*  Scenario 2: Active endpoint returns acknowledged alerts            */
/* ================================================================== */

describe("active endpoint — acknowledged alerts", () => {
  test("returns an alert with status 'acknowledged'", async () => {
    const now = new Date("2026-08-21T10:05:00Z");
    // Queue: 1st = user lookup, 2nd = alert lookup (acknowledged)
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{
        id: ALERT_ID,
        status: "acknowledged",
        ride_id: null,
        latitude: "23.8103",
        longitude: "90.4125",
        message: "SOS",
        contacts_notified: [],
        created_at: now,
        acknowledged_by: ADMIN_ID,
        acknowledged_at: now,
      }],
    ]);

    const res = await activeGET(new Request("http://localhost/api/sos/active"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.active).toBe(true);
    expect(body.alert).toMatchObject({
      id: ALERT_ID,
      status: "acknowledged",
      acknowledged_by: ADMIN_ID,
    });
  });

  test("returns an alert with status 'open'", async () => {
    const now = new Date("2026-08-21T10:05:00Z");
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [{
        id: ALERT_ID,
        status: "open",
        ride_id: null,
        latitude: "23.8103",
        longitude: "90.4125",
        message: "SOS",
        contacts_notified: [],
        created_at: now,
        acknowledged_by: null,
        acknowledged_at: null,
      }],
    ]);

    const res = await activeGET(new Request("http://localhost/api/sos/active"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.active).toBe(true);
    expect(body.alert).toMatchObject({ id: ALERT_ID, status: "open" });
  });

  test("does NOT return a resolved alert", async () => {
    mockSelectQueue([
      [{ id: USER_ID, role: "rider" }],
      [], // no matching open/acknowledged alert
    ]);

    const res = await activeGET(new Request("http://localhost/api/sos/active"));
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.active).toBe(false);
  });
});

/* ================================================================== */
/*  Scenario 3: Scheduler auto-resolves acknowledged alerts            */
/* ================================================================== */

/**
 * The scheduler runs in utils-server (separate tsconfig). We verify the
 * logical contract: the Drizzle condition includes both 'open' and
 * 'acknowledged' statuses by inspecting the source of scheduler.ts.
 */
describe("scheduler auto-resolve — acknowledged alerts", () => {
  test("scheduler source contains or(eq(status, 'open'), eq(status, 'acknowledged'))", () => {
    // The scheduler runs in utils-server (separate tsconfig/package).
    // We verify the fix is in place by reading the source and asserting
    // the WHERE clause contains the OR condition for both statuses.
    const fs = require("fs");
    const path = require("path");
    const schedulerPath = path.resolve(
      __dirname, "../../../utils-server/scheduler.ts",
    );
    const source = fs.readFileSync(schedulerPath, "utf-8");

    // Find the SOS auto-resolution block (job #32)
    const sosBlock = source.slice(
      source.indexOf("SOS auto-resolution"),
      source.indexOf("SOS auto-resolution") + 1500,
    );

    // The fix must contain BOTH status values in an OR condition
    expect(sosBlock).toContain('\"open\"');
    expect(sosBlock).toContain('\"acknowledged\"');
    // Verify the OR pattern exists (not two separate eq calls)
    expect(sosBlock).toMatch(/or\(/);
  });
});

/* ================================================================== */
/*  Scenario 4: Admin list shows status and acknowledgment metadata    */
/* ================================================================== */

describe("admin sos-alerts SELECT — includes status + ack columns", () => {
  test("admin select includes status, acknowledged_by, acknowledged_at", async () => {
    const capturedCols: Record<string, unknown> = {};
    // The admin endpoint makes two queries:
    //   1. db.select({total: count()}).from().where() — count query, where() resolves to array
    //   2. db.select({id, status, ...}).from().where().orderBy().limit().offset() — rows query
    // The admin endpoint makes two db.select() calls:
    //   1. db.select({total: count()}).from().where(conditions) → count query, await resolves here
    //   2. db.select({id, status, ...}).from().where().orderBy().limit().offset() → rows query
    (db.select as jest.Mock).mockImplementation((cols: Record<string, unknown>) => {
      Object.assign(capturedCols, cols);
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => {
            const chainResult: Record<string, unknown> = {
              orderBy: jest.fn(() => ({
                limit: jest.fn(() => ({
                  offset: jest.fn(async () => []),
                })),
              })),
            };
            // Make .where() result a thenable so the count query's
            // `const [totalRow] = await db.select().from().where()` resolves
            (chainResult as { then: (r: (v: unknown) => void) => void }).then = (
              resolve: (v: unknown) => void,
            ) => resolve([]);
            return chainResult;
          }),
        })),
      };
    });

    await adminGET(new Request("http://localhost/api/admin/sos-alerts"));

    expect(capturedCols).toHaveProperty("status");
    expect(capturedCols).toHaveProperty("acknowledged_by");
    expect(capturedCols).toHaveProperty("acknowledged_at");
  });
});
