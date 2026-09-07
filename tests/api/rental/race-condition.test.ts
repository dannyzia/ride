// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 5 precedent, tests/api/rental/security-fix.test.ts).
/**
 * Race-condition regression tests for pick handler + sweep jobs.
 *
 * These tests verify that conditional UPDATE WHERE clauses include ALL
 * read-time conditions, preventing:
 *   - Double-assignment (two concurrent picks overwriting each other)
 *   - Double-release  (sweep releasing an already-picked assignment)
 *   - Stale-condition UPDATEs (sweep acting on rows whose time conditions
 *     no longer hold after a concurrent re-award)
 *
 * Fix shape (findings 1-4): make the read-time and write-time conditions match.
 */

import { POST as pickAssignment } from "@/app/api/rental/assignments/[id]/pick+api";
import { POST as withdrawBid } from "@/app/api/rental/bids/[id]/withdraw+api";
import { POST as acceptBid } from "@/app/api/rental/requests/[id]/accept-bid+api";
import { POST as cancelRequest } from "@/app/api/rental/requests/[id]+api";
import {
  demoteWinner,
  sweepDeadlines,
  sweepConfirmationDeadlines,
} from "@/utils-server/rentalDispatchChain";

// ── UUIDs ──────────────────────────────────────────────────────────
const ASSIGN_ID = "11111111-1111-4111-1111-111111111111";
const REQ_ID = "22222222-2222-4222-2222-222222222222";
const FLEET_ID = "33333333-3333-4333-3333-333333333333";
const DRIVER_ID = "44444444-4444-4444-4444-444444444444";
const VEHICLE_ID = "55555555-5555-4555-5555-555555555555";
const BID_ID = "66666666-6666-4666-6666-666666666666";

// ── Mock state ─────────────────────────────────────────────────────
let mockAssignmentRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockVehicleRows: Record<string, unknown>[] = [];
let mockReqRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockReturningRows: unknown[][] = [[]];
let mockTxReturningRows: unknown[][] = [[]];
let mockBidCount = 0;
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockTxUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
// F2 re-point (2026-09-06): sweepDeadlines' expired/no_bidders branches were
// rewritten set-based in ac046b1 as a raw CTE via tx.execute(sql`...`), so they
// no longer flow through db.update().set().where(). Capture the executed SQL
// and assert on THAT — the race invariant (soft_deadline_at < now re-checked
// inside the WITH due claim, under FOR UPDATE SKIP LOCKED) is unchanged.
let mockExecCalls: { sql: string; values: unknown[] }[] = [];
// R3-completion: tx-time override for assignment reads — lets a test simulate
// a pick committing BETWEEN the unlocked pre-tx read and the tx (the race
// window) without mutating the shared pre-tx fixture.
let mockTxAssignmentRows: Record<string, unknown>[] | null = null;
// Same mechanism for request reads (confirm/cancel racing the force-withdraw tx).
let mockTxReqRows: Record<string, unknown>[] | null = null;
// R3 round-2 fixtures: subscription gate rows (accept) + emergency rows (§B.7).
let mockSubRows: Record<string, unknown>[] = [];
let mockEmergencyRows: Record<string, unknown>[] = [];

// ── Mock DB ────────────────────────────────────────────────────────
// Shared factory so both root-level db and tx-level db use the same routing.
jest.mock("@/src/db", () => {
   
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const schema = require("@/src/db/schema");

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = () => c;
    c.innerJoin = () => c;
    c.leftJoin = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveTable = (table: any): unknown[] => {
    if (table === schema.awardedBidAssignments) return mockAssignmentRows;
    if (table === schema.drivers) return mockDriverRows;
    if (table === schema.vehicles) return mockVehicleRows;
    if (table === schema.rentalRequests) return mockReqRows;
    if (table === schema.rentalBids) return mockBidRows;
    if (table === schema.fleetSubscriptions) return mockSubRows;
    if (table === schema.emergencyRequests) return mockEmergencyRows;
    return [];
  };

  const fromQ = (table: any, isCount: boolean) => {
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = (...args: unknown[]) => {
      if (isCount) return chainable([{ cnt: mockBidCount }]);
      return chainable(resolveTable(table));
    };
    return q;
  };

  const makeSelect = () => (...sargs: unknown[]) => {
    const isCount = !!(
      sargs[0] && typeof sargs[0] === "object" && "cnt" in (sargs[0] as object)
    );
    return { from: (table: any) => fromQ(table, isCount) };
  };

  const makeUpdate = () => (table: any) => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        return { returning: async () => mockReturningRows.shift() ?? [] };
      },
    }),
  });

  const makeInsert = () => (_table: any) => ({
    values: (vals: Record<string, unknown>) => ({
      returning: async () => [{ id: "gen-uuid" }],
      onConflictDoUpdate: () => ({ returning: async () => [{}] }),
    }),
  });

  const makeTx = () => ({
    select: (..._sargs: unknown[]) => ({
      from: (table: any) => {
        const isCount = !!(
          _sargs[0] && typeof _sargs[0] === "object" && "cnt" in (_sargs[0] as object)
        );
        const q: any = {};
        q.innerJoin = () => q;
        q.leftJoin = () => q;
        q.limit = () => q;
        q.offset = () => q;
        q.orderBy = () => q;
        q.for = () => q;
        q.where = (...args: unknown[]) => {
          if (isCount) return chainable([{ cnt: mockBidCount }]);
          // tx-time overrides (race-window simulation)
          if (table === schema.awardedBidAssignments && mockTxAssignmentRows) {
            return chainable(mockTxAssignmentRows);
          }
          if (table === schema.rentalRequests && mockTxReqRows) {
            return chainable(mockTxReqRows);
          }
          return chainable(resolveTable(table));
        };
        return q;
      },
    }),
    update: (_table: any) => ({
      set: (vals: Record<string, unknown>) => ({
        where: (...whereArgs: unknown[]) => {
          mockTxUpdateCalls.push({ vals, whereArgs });
          return { returning: async () => mockTxReturningRows.shift() ?? [] };
        },
      }),
    }),
    insert: (_table: any) => ({
      values: (vals: Record<string, unknown>) => ({
        returning: async () => [{ id: "gen-uuid" }],
      }),
    }),
    execute: async (sqlArg: any, _values?: any) => {
      // sweepDeadlines' expired/no_bidders branches run as a raw CTE via
      // tx.execute (ac046b1), not db.update().set().where(). Capture and
      // render the SQL so the F2 predicate assertions have a target.
      try {
        const { PgDialect } = require("drizzle-orm/pg-core");
        const rendered = new PgDialect().sqlToQuery(sqlArg);
        mockExecCalls.push({ sql: rendered.sql, values: rendered.values ?? [] });
      } catch {
        mockExecCalls.push({ sql: String(sqlArg), values: [] });
      }
      return [{ cnt: 0 }];
    },
  });

  return {
    db: {
      select: makeSelect(),
      insert: makeInsert(),
      update: makeUpdate(),
      transaction: async (fn: any) => fn(makeTx()),
      execute: async () => [{ cnt: 0 }],
    },
  };
});

// ── Mock logger ────────────────────────────────────────────────────
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── Mock auth (pick handler needs requireFleetMember; withdraw needs both) ──
jest.mock("@/lib/auth", () => ({
  requireFleetMember:
    (_fleetId: string, _roles?: readonly string[]) =>
    async () => ({
      supabaseUser: { id: "auth-actor" },
      dbUser: { id: "auth-actor" },
      membership: { id: "fm-1", fleet_id: _fleetId, role: "OWNER" },
    }),
  requireAnyRole:
    (_roles: readonly string[]) =>
    async () => ({
      supabaseUser: { id: "auth-actor" },
      dbUser: { id: "auth-actor" },
    }),
}));

// ── Mock ambulanceCerts (pick handler checks cert for ambulance) ────
jest.mock("@/lib/ambulanceCerts", () => ({
  isVerifiedCertPair: async () => true,
}));

// ── Mock platformConfig (demoteWinner/sweep use getConfigInt) ──────
jest.mock("@/lib/platformConfig", () => ({
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

// ── Helpers ────────────────────────────────────────────────────────
function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Render a Drizzle WHERE arg to SQL string via PgDialect. */
function getWhereSql(whereArgs: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PgDialect } = require("drizzle-orm/pg-core");
  return new PgDialect().sqlToQuery(whereArgs[0]);
}

beforeEach(() => {
  mockAssignmentRows = [];
  mockDriverRows = [];
  mockVehicleRows = [];
  mockReqRows = [];
  mockBidRows = [];
  mockReturningRows = [[]];
  mockTxReturningRows = [[]];
  mockBidCount = 0;
  mockUpdateCalls = [];
  mockTxUpdateCalls = [];
  mockExecCalls = [];
  mockTxAssignmentRows = null;
  mockTxReqRows = null;
  mockSubRows = [];
  mockEmergencyRows = [];
});

// ══════════════════════════════════════════════════════════════════════
// Finding 1 — Pick handler
// The outer read checks `assigned_driver_user_id IS NULL` (line 49)
// before entering the tx. The conditional UPDATE inside the tx must
// re-check the same condition to close the TOCTOU window.
// ══════════════════════════════════════════════════════════════════════
describe("Race F1 — pick handler: conditional UPDATE includes assigned_driver_user_id IS NULL", () => {
  const pickBody = { driver_user_id: DRIVER_ID, vehicle_id: VEHICLE_ID };

  beforeEach(() => {
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        assigned_driver_user_id: null,
        released_at: null,
        assignment_deadline_at: new Date(Date.now() + 3_600_000),
      },
    ];
    mockDriverRows = [
      { id: "driver-row-uuid", user_id: DRIVER_ID, fleet_id: FLEET_ID, status: "active" },
    ];
    mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID }];
    mockReqRows = [{ category: "car_rental" }];
    // Transaction: the assignment UPDATE returns 1 row → success
    mockTxReturningRows = [[{ id: ASSIGN_ID }]];
  });

  it("assignment UPDATE WHERE includes IS NULL on assigned_driver_user_id", async () => {
    const res = await pickAssignment(makeRequest("POST", pickBody), { id: ASSIGN_ID });
    expect(res.status).toBe(200);

    // The conditional UPDATE that sets assigned_driver_user_id
    const assignUpdate = mockTxUpdateCalls.find(
      (c) => c.vals.assigned_driver_user_id === DRIVER_ID,
    );
    expect(assignUpdate).toBeDefined();

    const rendered = getWhereSql(assignUpdate!.whereArgs);
    // MUST check assigned_driver_user_id IS NULL — prevents concurrent pick overwrite
    expect(rendered.sql).toContain("assigned_driver_user_id");
    expect(rendered.sql.toLowerCase()).toContain("is null");
  });

  it("concurrent pick that races the first → 409 assignment_released (0 rows matched)", async () => {
    // Simulate: between outer read and tx, another pick already assigned
    // → conditional UPDATE returns 0 rows
    mockTxReturningRows = [[]];

    const res = await pickAssignment(makeRequest("POST", pickBody), { id: ASSIGN_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("assignment_released");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Finding 3 — demoteWinner (called by sweepAssignmentSla Job 47)
// RE-POINTED 2026-09-07 (audit-fix round, commit C1): the old predicate
// asserted the release UPDATE carries assigned_driver_user_id IS NULL. The
// code-skeptic audit proved that guard is the C1 bug — tracking assignments
// are BORN-FULFILLED (driver set at accept), so the guard matched 0 rows for
// every branch-(b) demote, stranding the live assignment and bricking re-award
// (23505 → 500). The guard against releasing a just-picked assignment now
// lives in the reason-aware EARLY-EXIT (sla_timeout only), not the WHERE.
// The corrected invariant: the release WHERE has released_at IS NULL and NO
// assigned_driver_user_id condition.
// ══════════════════════════════════════════════════════════════════════
describe("Race F3 (re-pointed C1) — demoteWinner: release fires for born-fulfilled tracking assignments", () => {
  beforeEach(() => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        awarded_bid_id: BID_ID,
      },
    ];
    // Has standing bids → demote goes to 'collecting'
    mockBidCount = 1;
  });

  it("assignment release UPDATE WHERE has released_at IS NULL and no assigned_driver_user_id guard", async () => {
    await demoteWinner(REQ_ID, "sla_timeout");

    const releaseUpdate = mockTxUpdateCalls.find(
      (c) =>
        c.vals.released_at !== undefined &&
        c.vals.release_reason !== undefined,
    );
    expect(releaseUpdate).toBeDefined();

    const rendered = getWhereSql(releaseUpdate!.whereArgs);
    // released_at IS NULL stays (idempotence — never double-release)
    expect(rendered.sql.toLowerCase()).toContain("released_at");
    expect(rendered.sql.toLowerCase()).toContain("is null");
    // C1: the assigned_driver_user_id IS NULL guard is REMOVED — born-fulfilled
    // tracking assignments (branch b) must be releasable. A picked-assignment
    // race is handled by the reason-aware early-exit above the release.
    expect(rendered.sql).not.toContain("assigned_driver_user_id");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Finding 2 — sweepDeadlines (Job 46)
// The outer SELECT checks `soft_deadline_at < now` but the per-row
// conditional UPDATEs only checked status + awarded_at. The deadline
// condition must also be present to guard against a concurrent re-award
// that extended the deadline.
// ══════════════════════════════════════════════════════════════════════
describe("Race F2 — sweepDeadlines: conditional UPDATEs include soft_deadline_at < now", () => {
  beforeEach(() => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "broadcasting",
        awarded_at: null,
        soft_deadline_at: new Date(Date.now() - 60_000),
      },
    ];
    mockBidCount = 1;
    // UPDATE returning() must yield ≥1 row so the sweep doesn't skip
    mockReturningRows = [[{ id: REQ_ID }]];
  });

  it("expired transition SQL re-checks soft_deadline_at < now (raw CTE)", async () => {
    await sweepDeadlines();

    // ac046b1 rewrote the expired branch as a raw CTE via tx.execute, so it
    // no longer flows through db.update().set().where() — assert on the
    // executed SQL instead. The predicate moved INTO the WITH due claim
    // (AND soft_deadline_at < now()), under FOR UPDATE SKIP LOCKED. The race
    // invariant is unchanged and enforced.
    const expiredSql = mockExecCalls.find((c) => c.sql.includes("expired"))?.sql;
    expect(expiredSql).toBeDefined();
    expect(expiredSql).toContain("soft_deadline_at");
    expect(expiredSql).toContain("<");
  });

  it("no_bidders transition SQL also re-checks soft_deadline_at < now", async () => {
    mockBidCount = 0;
    mockReturningRows = [[{ id: REQ_ID }]];

    await sweepDeadlines();

    const noBiddersSql = mockExecCalls.find((c) => c.sql.includes("no_bidders"))?.sql;
    expect(noBiddersSql).toBeDefined();
    expect(noBiddersSql).toContain("soft_deadline_at");
    expect(noBiddersSql).toContain("<");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Finding 4 — sweepConfirmationDeadlines (Job 48)
// Outer SELECT checks: status='awarded', confirmation_deadline_at < now,
// confirmation_deadline_at IS NOT NULL. The per-row tx must re-check all
// three on both the assignment release and the request cancel UPDATEs.
// ══════════════════════════════════════════════════════════════════════
describe("Race F4 — sweepConfirmationDeadlines: UPDATEs mirror outer read conditions", () => {
  beforeEach(() => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        confirmation_deadline_at: new Date(Date.now() - 60_000),
        awarded_bid_id: BID_ID,
      },
    ];
  });

  it("assignment release WHERE includes assigned_driver_user_id IS NULL", async () => {
    await sweepConfirmationDeadlines();

    const releaseUpdate = mockTxUpdateCalls.find(
      (c) => c.vals.release_reason === "customer_overslept",
    );
    expect(releaseUpdate).toBeDefined();

    const rendered = getWhereSql(releaseUpdate!.whereArgs);
    // Guards against racing pick handler
    expect(rendered.sql).toContain("assigned_driver_user_id");
    expect(rendered.sql.toLowerCase()).toContain("is null");
  });

  it("request cancel WHERE includes confirmation_deadline_at IS NOT NULL", async () => {
    await sweepConfirmationDeadlines();

    const cancelUpdate = mockTxUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(cancelUpdate).toBeDefined();

    const rendered = getWhereSql(cancelUpdate!.whereArgs);
    // Guards against a concurrent re-award that extended the deadline
    expect(rendered.sql).toContain("confirmation_deadline_at");
    expect(rendered.sql).toContain("IS NOT NULL");
  });

  it("request cancel WHERE also includes status='awarded' re-check", async () => {
    await sweepConfirmationDeadlines();

    const cancelUpdate = mockTxUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(cancelUpdate).toBeDefined();

    const rendered = getWhereSql(cancelUpdate!.whereArgs);
    // The request UPDATE must also re-check the status condition (rendered as $N param)
    expect(rendered.params).toContain("awarded");
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3-completion — early-exit behavior tests
// The WHERE-clause additions (F1-F4) are necessary but not sufficient: when
// the guarded UPDATE 0-rows, the surrounding function must NOT continue
// writing. These tests assert the early exits, not just the predicates.
// ══════════════════════════════════════════════════════════════════════

describe("R3-completion F3 — demoteWinner early-exits when the driver already picked", () => {
  beforeEach(() => {
    // Awarded request + a LIVE assignment that already has a driver: a pick
    // committed between the sweep's outer SELECT and demoteWinner's tx.
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        awarded_bid_id: BID_ID,
      },
    ];
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        assigned_driver_user_id: DRIVER_ID,
        released_at: null,
      },
    ];
    mockBidCount = 1;
  });

  it("returns { ok: false, reason: 'driver_picked' } and writes nothing", async () => {
    const result = await demoteWinner(REQ_ID, "sla_timeout");

    expect(result).toEqual({ ok: false, reason: "driver_picked" });

    // Zero writes: the winner bid must NOT be demoted, superseded bids must
    // NOT be re-activated, the request must NOT flip to collecting, and the
    // assignment must NOT be released.
    expect(mockTxUpdateCalls).toHaveLength(0);
    const collecting = mockTxUpdateCalls.find((c) => c.vals.status === "collecting");
    const noBidders = mockTxUpdateCalls.find((c) => c.vals.status === "no_bidders");
    const lostBid = mockTxUpdateCalls.find((c) => c.vals.status === "lost");
    expect(collecting).toBeUndefined();
    expect(noBidders).toBeUndefined();
    expect(lostBid).toBeUndefined();
  });

  it("still demotes normally when the live assignment has NO driver (regression guard)", async () => {
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        assigned_driver_user_id: null,
        released_at: null,
      },
    ];
    mockTxReturningRows = [[{ id: ASSIGN_ID }]];

    const result = await demoteWinner(REQ_ID, "sla_timeout");
    expect(result).toEqual({ ok: true, nextStatus: "collecting", standingBids: 1 });
    expect(mockTxUpdateCalls.find((c) => c.vals.status === "collecting")).toBeDefined();
  });
});

describe("R3-completion F4 — sweepConfirmationDeadlines early-exits on a just-confirmed request", () => {
  beforeEach(() => {
    // Stale outer read still reports the row (deadline passed), but the
    // locked re-read sees the customer ALREADY confirmed the ride.
    mockReqRows = [
      {
        id: REQ_ID,
        status: "confirmed",
        confirmation_deadline_at: new Date(Date.now() - 60_000),
        awarded_bid_id: BID_ID,
      },
    ];
  });

  it("writes no bid-to-lost updates (and no other writes) when status is no longer awarded", async () => {
    await sweepConfirmationDeadlines();

    expect(mockTxUpdateCalls).toHaveLength(0);
    const lostBid = mockTxUpdateCalls.find((c) => c.vals.status === "lost");
    const release = mockTxUpdateCalls.find((c) => c.vals.release_reason === "customer_overslept");
    const cancel = mockTxUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(lostBid).toBeUndefined();
    expect(release).toBeUndefined();
    expect(cancel).toBeUndefined();
  });

  it("still sweeps normally when the locked row is awarded (regression guard)", async () => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        confirmation_deadline_at: new Date(Date.now() - 60_000),
        awarded_bid_id: BID_ID,
      },
    ];
    mockTxReturningRows = [[{ id: REQ_ID }]];

    await sweepConfirmationDeadlines();

    expect(mockTxUpdateCalls.find((c) => c.vals.status === "lost")).toBeDefined();
    expect(mockTxUpdateCalls.find((c) => c.vals.status === "cancelled")).toBeDefined();
  });
});

describe("R3-completion — force-withdraw mirrors the demoteWinner early-exit pattern", () => {
  beforeEach(() => {
    // Pre-tx state (unlocked reads): everything looks withdrawable.
    mockBidRows = [
      {
        id: BID_ID,
        fleet_id: FLEET_ID,
        request_id: REQ_ID,
        status: "won",
      },
    ];
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        tracking_required: false,
      },
    ];
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        winning_bid_id: BID_ID,
        assigned_driver_user_id: null,
        released_at: null,
      },
    ];
  });

  it("assignment release UPDATE WHERE includes assigned_driver_user_id IS NULL (belt-and-suspenders)", async () => {
    mockTxReturningRows = [[{ id: ASSIGN_ID }]];

    const res = await withdrawBid(makeRequest("POST", { force: true }), { id: BID_ID });
    expect(res.status).toBe(200);

    const releaseUpdate = mockTxUpdateCalls.find(
      (c) => c.vals.release_reason === "fleet_cancelled",
    );
    expect(releaseUpdate).toBeDefined();
    const rendered = getWhereSql(releaseUpdate!.whereArgs);
    expect(rendered.sql).toContain("assigned_driver_user_id");
    expect(rendered.sql.toLowerCase()).toContain("is null");
  });

  it("concurrent pick between the pre-tx read and the tx → 403 assignment_fulfilled, zero writes", async () => {
    // The pick handler commits between the unlocked pre-tx assignment read
    // (sees driver NULL) and the tx (tx-time override sees the driver set).
    mockTxAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        winning_bid_id: BID_ID,
        assigned_driver_user_id: DRIVER_ID,
        released_at: null,
      },
    ];

    const res = await withdrawBid(makeRequest("POST", { force: true }), { id: BID_ID });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("assignment_fulfilled");

    // Zero writes: no bid demotion, no re-activation, no release, no request flip
    expect(mockTxUpdateCalls).toHaveLength(0);
  });

  it("request no longer awarded at tx time → 409 invalid_transition, zero writes", async () => {
    // The customer confirmed between the pre-tx read and the tx.
    mockTxReqRows = [{ id: REQ_ID, status: "confirmed" }];

    const res = await withdrawBid(makeRequest("POST", { force: true }), { id: BID_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockTxUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 Item 2 #1 — REGRESSION: demoteWinner driver_picked must be
// reason-aware. Tracking assignments are born-fulfilled; a blanket
// driver_picked exit aborted every branch-(b) ack-timeout demote.
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 Item 2 #1 — demoteWinner driver_picked is reason-aware", () => {
  beforeEach(() => {
    mockReqRows = [
      { id: REQ_ID, status: "awarded", awarded_bid_id: BID_ID },
    ];
    // Born-fulfilled (tracking accept): driver assigned BEFORE any pick
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        assigned_driver_user_id: DRIVER_ID,
        released_at: null,
      },
    ];
    mockBidCount = 1;
    mockTxReturningRows = [[{ id: ASSIGN_ID }]];
  });

  it("fleet_ack_timeout with a born-fulfilled driver demotes normally (F45 regression)", async () => {
    const result = await demoteWinner(REQ_ID, "fleet_ack_timeout");
    expect(result).toEqual({ ok: true, nextStatus: "collecting", standingBids: 1 });
    // the driver is RELEASED, not orphaned
    const release = mockTxUpdateCalls.find((c) => c.vals.released_at !== undefined);
    expect(release).toBeDefined();
  });

  it("fleet_cancelled with a born-fulfilled driver demotes normally", async () => {
    const result = await demoteWinner(REQ_ID, "fleet_cancelled");
    expect(result).toEqual({ ok: true, nextStatus: "collecting", standingBids: 1 });
    expect(mockTxUpdateCalls.find((c) => c.vals.released_at !== undefined)).toBeDefined();
  });

  it("sla_timeout with a picked driver STILL early-exits driver_picked (F3 holds)", async () => {
    const result = await demoteWinner(REQ_ID, "sla_timeout");
    expect(result).toEqual({ ok: false, reason: "driver_picked" });
    expect(mockTxUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 Item 2 #2 — force-withdraw must mirror demoteWinner's §B.1
// branch: zero superseded bids ⇒ terminal no_bidders, never a bid-less
// collecting that only sweeps to expired.
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 Item 2 #2 — force-withdraw no_bidders branch", () => {
  beforeEach(() => {
    mockBidRows = [
      { id: BID_ID, fleet_id: FLEET_ID, request_id: REQ_ID, status: "won" },
    ];
    mockReqRows = [
      { id: REQ_ID, status: "awarded", tracking_required: false },
    ];
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        winning_bid_id: BID_ID,
        assigned_driver_user_id: null,
        released_at: null,
      },
    ];
    mockBidCount = 0; // zero superseded bids
  });

  it("zero superseded bids → request UPDATE sets no_bidders, not collecting", async () => {
    const res = await withdrawBid(makeRequest("POST", { force: true }), { id: BID_ID });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toContain("no_bidders");

    const noBidders = mockTxUpdateCalls.find((c) => c.vals.status === "no_bidders");
    expect(noBidders).toBeDefined();
    expect(mockTxUpdateCalls.find((c) => c.vals.status === "collecting")).toBeUndefined();
  });

  it("standing superseded bids → collecting branch still fires (regression guard)", async () => {
    mockBidCount = 1;
    const res = await withdrawBid(makeRequest("POST", { force: true }), { id: BID_ID });
    expect(res.status).toBe(200);

    const collecting = mockTxUpdateCalls.find((c) => c.vals.status === "collecting");
    expect(collecting).toBeDefined();
    expect(collecting!.vals.reselect_deadline_at).toEqual(expect.any(Date));
    expect(mockTxUpdateCalls.find((c) => c.vals.status === "no_bidders")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 1g — plain withdraw serializes on the request row lock
// before the COUNT / F35 branch UPDATEs.
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 1g — plain withdraw request-lock serialization", () => {
  beforeEach(() => {
    mockBidRows = [
      { id: BID_ID, fleet_id: FLEET_ID, request_id: REQ_ID, status: "active" },
    ];
    mockReqRows = [
      {
        id: REQ_ID,
        status: "collecting",
        rider_user_id: "auth-actor",
        awarded_at: null,
        bidding_window_seconds: 1200,
      },
    ];
    mockTxReturningRows = [[{ id: BID_ID }]];
  });

  it("request no longer collecting at tx time → 409 invalid_transition, zero writes", async () => {
    // e.g. a confirm/cancel committed between the pre-tx read and the tx
    mockTxReqRows = [{ id: REQ_ID, status: "confirmed" }];

    const res = await withdrawBid(makeRequest("POST", {}), { id: BID_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockTxUpdateCalls).toHaveLength(0);
  });

  it("F35 broadcasting UPDATE mirrors collecting + awarded_at IS NULL (predicate)", async () => {
    mockBidCount = 0; // no remaining active bids → broadcasting branch
    const res = await withdrawBid(makeRequest("POST", {}), { id: BID_ID });
    expect(res.status).toBe(200);

    const broadcast = mockTxUpdateCalls.find((c) => c.vals.status === "broadcasting");
    expect(broadcast).toBeDefined();
    const rendered = getWhereSql(broadcast!.whereArgs);
    expect(rendered.params).toContain("collecting");
    expect(rendered.sql).toContain("awarded_at");
    expect(rendered.sql.toLowerCase()).toContain("is null");
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 1b — accept's bid→won flip is conditional on status='active';
// a raced withdraw must 409 bid_no_longer_active instead of awarding a
// withdrawn bid.
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 1b — accept bid flip conditional on active", () => {
  beforeEach(() => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "collecting",
        rider_user_id: "auth-actor",
        tracking_required: false,
      },
    ];
    mockBidRows = [
      {
        id: BID_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        status: "active",
        driver_user_id: null,
        vehicle_id: null,
      },
    ];
    mockSubRows = [
      {
        fleet_status: "ACTIVE",
        plan_features: { marketplace_bidding: true },
        period_end: null,
      },
    ];
  });

  it("raced withdraw (flip 0-rows) → 409 bid_no_longer_active, no award write", async () => {
    mockTxReturningRows = [[]]; // the withdraw won the race

    const res = await acceptBid(makeRequest("POST", { bid_id: BID_ID }), { id: REQ_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("bid_no_longer_active");
    expect(mockTxUpdateCalls.find((c) => c.vals.status === "awarded")).toBeUndefined();
  });

  it("happy accept: flip WHERE pins status='active' (predicate)", async () => {
    mockTxReturningRows = [[{ id: BID_ID }]];

    const res = await acceptBid(makeRequest("POST", { bid_id: BID_ID }), { id: REQ_ID });
    expect(res.status).toBe(200);

    const flip = mockTxUpdateCalls.find((c) => c.vals.status === "won");
    expect(flip).toBeDefined();
    const rendered = getWhereSql(flip!.whereArgs);
    expect(rendered.params).toContain("active");
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 1i — tracking accept assigns the driver DIRECTLY, so §B.7
// cross-vertical checks must run at accept (they previously only ran at
// pick, which tracking skips).
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 1i — tracking accept runs §B.7 checks", () => {
  beforeEach(() => {
    mockReqRows = [
      {
        id: REQ_ID,
        status: "collecting",
        rider_user_id: "auth-actor",
        tracking_required: true,
      },
    ];
    mockBidRows = [
      {
        id: BID_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        status: "active",
        driver_user_id: DRIVER_ID,
        vehicle_id: null,
      },
    ];
    mockDriverRows = [{ id: "driver-row-1", user_id: DRIVER_ID, fleet_id: FLEET_ID, status: "active" }];
    mockAssignmentRows = []; // no prior rental commitments
    mockSubRows = [
      {
        fleet_status: "ACTIVE",
        plan_features: { marketplace_bidding: true },
        period_end: null,
      },
    ];
  });

  it("driver with an ACTIVE emergency → 409 driver_already_committed", async () => {
    mockEmergencyRows = [{ id: "emg-1" }];

    const res = await acceptBid(makeRequest("POST", { bid_id: BID_ID }), { id: REQ_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toBe("driver_already_committed");
  });

  it("clean driver → tracking accept proceeds to awarded (regression guard)", async () => {
    mockTxReturningRows = [[{ id: BID_ID }]];

    const res = await acceptBid(makeRequest("POST", { bid_id: BID_ID }), { id: REQ_ID });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("awarded");
    // the born-fulfilled assignment was inserted with the driver set
    expect(json.assignment_id).toBe("gen-uuid");
  });
});

// ══════════════════════════════════════════════════════════════════════
// R3 round-2 Extra — cancel handler must not stomp a terminal state: the
// request UPDATE is now locked + conditional (completed→cancelled race).
// ══════════════════════════════════════════════════════════════════════
describe("R3 round-2 Extra — cancel handler terminal-state guard", () => {
  it("confirmed→completed race: 409, request stays completed, zero writes", async () => {
    mockReqRows = [
      { id: REQ_ID, status: "confirmed", rider_user_id: "auth-actor" },
    ];
    mockTxReqRows = [{ id: REQ_ID, status: "completed" }];

    const res = await cancelRequest(makeRequest("POST", {}), { id: REQ_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.message).toContain("completed");
    expect(mockTxUpdateCalls).toHaveLength(0);
  });

  it("cancel still succeeds from confirmed when no race (regression guard)", async () => {
    mockReqRows = [
      { id: REQ_ID, status: "confirmed", rider_user_id: "auth-actor" },
    ];
    mockTxReturningRows = [[{ id: REQ_ID }]];

    const res = await cancelRequest(makeRequest("POST", {}), { id: REQ_ID });
    expect(res.ok).toBe(true);
    const cancel = mockTxUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(cancel).toBeDefined();
    // bid settlement still fires (active/won/superseded → lost)
    const settle = mockTxUpdateCalls.find((c) => c.vals.status === "lost");
    expect(settle).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// C1 close-out (.kilo/plans/test-agent-c1-m2-guards.md Test 1, 2026-09-07
// audit round) — branch-(b) demote releases the born-fulfilled assignment
// AND a subsequent accept-bid for a standing bid SUCCEEDS.
//
// Pre-cae5e53 the demote release UPDATE carried
// isNull(assigned_driver_user_id), matched 0 rows for every tracking demote
// (tracking assignments are born-fulfilled — driver set at accept), and the
// stranded live assignment made every re-award INSERT violate
// awarded_bid_assignments_live_idx (23505 → 500 on accept; accept-bid has no
// 23505 handler). The 200 below IS the regression guard.
// ══════════════════════════════════════════════════════════════════════
describe("C1 close-out — branch-(b) demote releases; re-award succeeds", () => {
  const OLD_BID_ID = "77777777-7777-4777-8777-777777777777";
  const STANDING_BID_ID = "88888888-8888-4888-8888-888888888888";

  it("tracking accept → no ack → fleet_ack_timeout demote → re-accept 200 (no 23505/500)", async () => {
    // ── Phase 1: awarded tracking request, born-fulfilled live assignment,
    // one standing superseded bid (the re-select candidate).
    mockReqRows = [
      {
        id: REQ_ID,
        status: "awarded",
        awarded_bid_id: OLD_BID_ID,
        rider_user_id: "auth-actor",
        tracking_required: true,
        urgency: "standard",
      },
    ];
    mockAssignmentRows = [
      {
        id: ASSIGN_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        winning_bid_id: OLD_BID_ID,
        assigned_driver_user_id: DRIVER_ID, // born-fulfilled (tracking accept)
        released_at: null,
      },
    ];
    // mockBidRows[0] doubles as demoteWinner's post-tx winning-bid fleet lookup
    mockBidRows = [
      { id: OLD_BID_ID, request_id: REQ_ID, fleet_id: FLEET_ID, status: "won" },
      { id: STANDING_BID_ID, request_id: REQ_ID, fleet_id: FLEET_ID, status: "superseded" },
    ];
    mockBidCount = 1; // one standing bid survives the demote

    const demote = await demoteWinner(REQ_ID, "fleet_ack_timeout");
    expect(demote).toEqual({ ok: true, nextStatus: "collecting", standingBids: 1 });

    // The release fired…
    const release = mockTxUpdateCalls.find((c) => c.vals.released_at !== undefined);
    expect(release).toBeDefined();
    expect(release!.vals.release_reason).toBe("sla_timeout");
    // …and its WHERE keys on request_id + released_at IS NULL ONLY. The
    // assigned_driver_user_id IS NULL over-guard WAS the C1 defect — a
    // born-fulfilled row can never match it.
    const rendered = getWhereSql(release!.whereArgs);
    expect(rendered.sql.toLowerCase()).toContain("released_at");
    expect(rendered.sql.toLowerCase()).toContain("is null");
    expect(rendered.sql).not.toContain("assigned_driver_user_id");

    // ── Phase 2: post-demote state. Request collecting; the old assignment
    // is released (§B.7 Check 1's released_at IS NULL filter excludes it, so
    // the WHERE-resolved rows are empty); the standing bid is active again
    // with driver+vehicle (tracking re-award).
    mockReqRows = [
      { id: REQ_ID, status: "collecting", rider_user_id: "auth-actor", tracking_required: true },
    ];
    mockAssignmentRows = []; // the released row no longer matches the live filter
    mockBidRows = [
      {
        id: STANDING_BID_ID,
        request_id: REQ_ID,
        fleet_id: FLEET_ID,
        status: "active",
        driver_user_id: DRIVER_ID,
        vehicle_id: VEHICLE_ID,
      },
    ];
    mockDriverRows = [
      { id: "driver-row-1", user_id: DRIVER_ID, fleet_id: FLEET_ID, status: "active" },
    ];
    mockVehicleRows = [{ id: VEHICLE_ID, fleet_id: FLEET_ID }];
    mockSubRows = [
      { fleet_status: "ACTIVE", plan_features: { marketplace_bidding: true }, period_end: null },
    ];
    mockEmergencyRows = [];
    mockTxReturningRows = [[{ id: STANDING_BID_ID }]]; // winning-bid flip matches

    const res = await acceptBid(makeRequest("POST", { bid_id: STANDING_BID_ID }), { id: REQ_ID });
    // Pre-C1 this 500'd: the assignment INSERT hit the live-idx unique
    // constraint because the old (never-released) row was still live.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("awarded");
    expect(json.assignment_id).toBe("gen-uuid"); // the new assignment row was written
    expect(json.bid_id).toBe(STANDING_BID_ID);

    // …and the award write-set targeted the standing bid.
    const award = mockTxUpdateCalls.find(
      (c) => c.vals.status === "awarded" && c.vals.awarded_bid_id === STANDING_BID_ID,
    );
    expect(award).toBeDefined();
  });
});
