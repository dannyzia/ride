// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/rental/security-fix.test.ts).
/**
 * ISSUE-13 (Z2) — rental WS-emit behavioral tests for the sites landed at e9bea6d.
 * Invokes the REAL handlers; only DB/auth/logger/platformConfig/wsNotify are mocked.
 *
 * The invariant under test: notifyWs fires exactly once per successful handler
 * run, AFTER the tx resolves, with the v1 §D event names / recipient kinds /
 * payload ids — and NEVER fires on a failed (409/403) transition.
 *
 * Covered emit sites (8 of 13; shop sites are outside this issue's dispatched
 * dirs, the sweep emit is covered by utils-server/__tests__/demoteWinner-fleet-emit.test.ts):
 *   1. accept-bid  → rental:bid_won + rental:bid_settled (superseded) + rental:status (awarded)
 *   2. withdraw plain → rental:bid_settled (withdrawn) + rental:status (post-tx status)
 *   3. withdraw force → rental:bid_settled (withdrawn/no_bidders) + rental:status (no_bidders)
 *   4. complete   → rental:status (completed, awarded_bid_id)
 *   5. pick       → rental:driver_assigned (owner + driver) + rental:status (fleet)
 *   6. confirm    → rental:status (confirmed) to owner + winning fleet
 *   7. fleet-ack  → rental:fleet_ack (owner) + rental:status (fleet)
 *   8. cancel     → rental:status (cancelled) to owner + distinct bidding fleets
 */

import { POST as cancelRequest } from "@/app/api/rental/requests/[id]+api";
import { POST as acceptBid } from "@/app/api/rental/requests/[id]/accept-bid+api";
import { POST as confirmRequest } from "@/app/api/rental/requests/[id]/confirm+api";
import { POST as fleetAck } from "@/app/api/rental/requests/[id]/fleet-ack+api";
import { POST as withdrawBid } from "@/app/api/rental/bids/[id]/withdraw+api";
import { POST as completeBid } from "@/app/api/rental/bids/[id]/complete+api";
import { POST as pickAssignment } from "@/app/api/rental/assignments/[id]/pick+api";
import { notifyWs } from "@/lib/wsNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const mockReqUuid = "00000000-0000-4000-8000-000000000001";
const mockUserUuid = "00000000-0000-4000-8000-000000000002";
const mockFleetUuid = "00000000-0000-4000-8000-000000000004";
const mockDriverUuid = "00000000-0000-4000-8000-000000000005";
const mockVehicleUuid = "00000000-0000-4000-8000-000000000006";
const mockBidUuid = "00000000-0000-4000-8000-000000000007";
const losingFleetUuid = "00000000-0000-4000-8000-00000000000a";
const losingBidUuid = "00000000-0000-4000-8000-00000000000b";
const assignUuid = "00000000-0000-4000-8000-00000000000c";

let mockReqRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockVehicleRows: Record<string, unknown>[] = [];
let mockFleetSubRows: Record<string, unknown>[] = [];
let mockAssignmentRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: Record<string, unknown>[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockAuthUser: { id: string; role: string } = { id: mockUserUuid, role: "rider" };
let mockFleetAuthOk = true;

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    req: schema.rentalRequests,
    bids: schema.rentalBids,
    drivers: schema.drivers,
    vehicles: schema.vehicles,
    fleetSubs: schema.fleetSubscriptions,
    assignments: schema.awardedBidAssignments,
  };

  // Chainable awaitable query result: supports .orderBy .limit .for .then.
  // limit/offset stay chainable (not promise-returning) so `.limit(1).for("update")`
  // composes; await resolves via `then`.
  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const fromQ = (t: unknown, isCount: boolean) => {
    const resolveRows = () => {
      if (isCount) {
        return [{ cnt: t === T.req ? 0 : 0 }];
      }
      if (t === T.req) return mockReqRows;
      if (t === T.bids) return mockBidRows;
      if (t === T.drivers) return mockDriverRows;
      if (t === T.vehicles) return mockVehicleRows;
      if (t === T.fleetSubs) return mockFleetSubRows;
      if (t === T.assignments) return mockAssignmentRows;
      return [];
    };
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows());
    return q;
  };

  const makeSelect = () => (...sargs: unknown[]) => {
    const isCount = !!(sargs[0] && typeof sargs[0] === "object" && "cnt" in (sargs[0] as object));
    return { from: (t: unknown) => fromQ(t, isCount) };
  };

  const makeInsert = () => () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return {
        returning: async () => [{ id: "generated-uuid" }],
      };
    },
  });

  const makeUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        return { returning: async () => mockUpdateRows };
      },
      returning: async () => mockUpdateRows,
    }),
  });

  const makeTx = () => ({
    insert: makeInsert(),
    update: makeUpdate(),
    select: makeSelect(),
  });

  return {
    db: {
      select: makeSelect(),
      // cancel emits to DISTINCT bidding fleets via db.selectDistinct
      selectDistinct: makeSelect(),
      insert: makeInsert(),
      update: makeUpdate(),
      transaction: async (fn: (tx: unknown) => unknown) => fn(makeTx()),
    },
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    (_roles: string[]) =>
    async () => {
      return {
        supabaseUser: { id: "auth-test" },
        dbUser: mockAuthUser,
      };
    },
  requireFleetMember:
    (_fleetId: string, _roles?: readonly string[]) =>
    async () => {
      if (!mockFleetAuthOk) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-test" },
        dbUser: mockAuthUser,
        membership: { id: "fm-1", fleet_id: _fleetId, role: "OWNER" },
      };
    },
}));

jest.mock("@/lib/ambulanceCerts", () => ({
  fleetHasVerifiedCertPair: async () => true,
  isVerifiedCertPair: async () => true,
  serviceLevelSatisfies: () => true,
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => true,
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn(),
}));

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const calls = () => (notifyWs as jest.Mock).mock.calls;

beforeEach(() => {
  mockReqRows = [];
  mockBidRows = [];
  mockDriverRows = [];
  mockVehicleRows = [];
  mockFleetSubRows = [];
  mockAssignmentRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockAuthUser = { id: mockUserUuid, role: "rider" };
  mockFleetAuthOk = true;
  (notifyWs as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// 1 — accept-bid: bid_won + bid_settled (per-loser) + status (awarded)
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — accept-bid emits bid_won / bid_settled / status after the tx", () => {
  function seedHappyPath() {
    mockReqRows = [
      {
        id: mockReqUuid,
        status: "collecting",
        rider_user_id: mockUserUuid,
        tracking_required: false,
      },
    ];
    // The winning bid MUST be first — the tx bid select returns all fixture
    // rows and the handler takes [0] (M6 precedent in security-fix.test.ts).
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        status: "active",
        driver_user_id: null,
        vehicle_id: null,
        quoted_price_bdt: 50000,
      },
      {
        id: losingBidUuid,
        bid_id: losingBidUuid,
        fleet_id: losingFleetUuid,
        status: "superseded",
        driver_user_id: null,
        vehicle_id: null,
      },
    ];
    mockFleetSubRows = [
      {
        fleet_status: "ACTIVE",
        plan_features: { marketplace_bidding: true },
        current_period_end: new Date(Date.now() + 3_600_000),
      },
    ];
  }

  it("emits one batch: bid_won to winner, bid_settled to the losing fleet, status awarded to owner+winner", async () => {
    seedHappyPath();
    const res = await acceptBid(makeRequest("POST", { bid_id: mockBidUuid }), {
      id: mockReqUuid,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(3);

    const won = events.find((e: any) => e.event === "rental:bid_won");
    expect(won).toBeDefined();
    expect(won.to).toEqual([{ kind: "fleet", fleet_id: mockFleetUuid }]);
    expect(won.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        bid_id: mockBidUuid,
        status: "awarded",
      }),
    );

    // Losing fleet gets ITS OWN bid id, Ruling A status 'superseded'
    const settled = events.find((e: any) => e.event === "rental:bid_settled");
    expect(settled).toBeDefined();
    expect(settled.to).toEqual([{ kind: "fleet", fleet_id: losingFleetUuid }]);
    expect(settled.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        bid_id: losingBidUuid,
        reason: "lost_to_competitor",
        status: "superseded",
      }),
    );

    const status = events.find((e: any) => e.event === "rental:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
    ]);
    expect(status.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        status: "awarded",
        awarded_bid_id: mockBidUuid,
      }),
    );
  });

  it("does NOT emit when the transition fails (409, not collecting)", async () => {
    seedHappyPath();
    mockReqRows = [{ ...mockReqRows[0], status: "broadcasting" }];
    const res = await acceptBid(makeRequest("POST", { bid_id: mockBidUuid }), {
      id: mockReqUuid,
    });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2 — withdraw (plain): bid_settled (withdrawn) + status (post-tx status)
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — plain withdraw emits bid_settled + status with the POST-tx status", () => {
  function seedPlainPath() {
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        request_id: mockReqUuid,
        status: "active",
      },
    ];
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "collecting",
        reselect_deadline_at: null,
        awarded_at: null,
        bidding_window_seconds: 1200,
      },
    ];
  }

  it("emits bid_settled (withdrawn) to the fleet and status to owner+fleet after the tx", async () => {
    seedPlainPath();
    const res = await withdrawBid(makeRequest("POST", { force: false }), {
      id: mockBidUuid,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(2);

    const settled = events.find((e: any) => e.event === "rental:bid_settled");
    expect(settled).toBeDefined();
    expect(settled.to).toEqual([{ kind: "fleet", fleet_id: mockFleetUuid }]);
    expect(settled.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        bid_id: mockBidUuid,
        reason: "withdrawn",
        // M1: post-tx actual status (F35 reopen branch), not the stale pre-tx read
        status: "broadcasting",
      }),
    );

    const status = events.find((e: any) => e.event === "rental:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
    ]);
    expect(status.payload).toEqual({
      request_id: mockReqUuid,
      status: "broadcasting",
    });
  });

  it("does NOT emit when the bid is already settled (409)", async () => {
    seedPlainPath();
    mockBidRows = [{ ...mockBidRows[0], status: "lost" }];
    const res = await withdrawBid(makeRequest("POST", { force: false }), {
      id: mockBidUuid,
    });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3 — withdraw (force): bid_settled + status with the terminal no_bidders status
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — force withdraw emits with the no_bidders post-tx status", () => {
  it("emits bid_settled (withdrawn/no_bidders) + status (no_bidders) to owner+fleet", async () => {
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        request_id: mockReqUuid,
        status: "won",
      },
    ];
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "awarded",
        tracking_required: false,
        reselect_deadline_at: null,
        awarded_at: new Date(),
      },
    ];
    mockAssignmentRows = [
      {
        id: assignUuid,
        request_id: mockReqUuid,
        winning_bid_id: mockBidUuid,
        assigned_driver_user_id: null,
        released_at: null,
      },
    ];

    const res = await withdrawBid(makeRequest("POST", { force: true }), {
      id: mockBidUuid,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(2);

    const settled = events.find((e: any) => e.event === "rental:bid_settled");
    expect(settled).toBeDefined();
    expect(settled.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        bid_id: mockBidUuid,
        reason: "withdrawn",
        status: "no_bidders",
      }),
    );

    const status = events.find((e: any) => e.event === "rental:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
    ]);
    expect(status.payload).toEqual({
      request_id: mockReqUuid,
      status: "no_bidders",
    });
  });
});

// ══════════════════════════════════════════════════════════════════════
// 4 — complete: status (completed) to owner + winning fleet
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — complete emits status (completed) to owner + awarded fleet", () => {
  function seedCompletePath() {
    mockAuthUser = { id: mockDriverUuid, role: "driver" }; // assigned driver completes
    mockBidRows = [
      {
        id: mockBidUuid,
        fleet_id: mockFleetUuid,
        request_id: mockReqUuid,
        status: "won",
      },
    ];
    mockAssignmentRows = [
      {
        id: assignUuid,
        request_id: mockReqUuid,
        winning_bid_id: mockBidUuid,
        fleet_id: mockFleetUuid,
        assigned_driver_user_id: mockDriverUuid,
        released_at: null,
      },
    ];
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "confirmed",
      },
    ];
  }

  it("emits rental:status (completed, awarded_bid_id) to owner + fleet after the tx", async () => {
    seedCompletePath();
    const res = await completeBid(makeRequest("POST", null), { id: mockBidUuid });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("rental:status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
    ]);
    expect(events[0].payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        status: "completed",
        awarded_bid_id: mockBidUuid,
      }),
    );
  });

  it("does NOT emit when the request is not confirmed (409)", async () => {
    seedCompletePath();
    mockReqRows = [{ ...mockReqRows[0], status: "awarded" }];
    const res = await completeBid(makeRequest("POST", null), { id: mockBidUuid });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 5 — pick: driver_assigned (owner + driver) + status (fleet)
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — pick emits driver_assigned + status after the tx", () => {
  function seedPickPath() {
    mockAssignmentRows = [
      {
        id: assignUuid,
        request_id: mockReqUuid,
        fleet_id: mockFleetUuid,
        assigned_driver_user_id: null,
        released_at: null,
      },
    ];
    mockReqRows = [
      {
        id: mockReqUuid,
        category: "car_rental",
        service_level: null,
        rider_user_id: mockUserUuid,
        status: "awarded",
      },
    ];
    mockDriverRows = [
      { id: "driver-row-1", user_id: mockDriverUuid, fleet_id: mockFleetUuid, status: "active" },
    ];
    mockVehicleRows = [{ id: mockVehicleUuid, fleet_id: mockFleetUuid }];
  }

  it("emits driver_assigned to owner+driver and status (awarded) to the fleet", async () => {
    seedPickPath();
    const res = await pickAssignment(
      makeRequest("POST", { driver_user_id: mockDriverUuid, vehicle_id: mockVehicleUuid }),
      { id: assignUuid },
    );
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(2);

    const assigned = events.find((e: any) => e.event === "rental:driver_assigned");
    expect(assigned).toBeDefined();
    expect(assigned.to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "user", user_id: mockDriverUuid },
    ]);
    expect(assigned.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        assignment_id: assignUuid,
        driver_user_id: mockDriverUuid,
        vehicle_id: mockVehicleUuid,
      }),
    );

    const status = events.find((e: any) => e.event === "rental:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([{ kind: "fleet", fleet_id: mockFleetUuid }]);
    expect(status.payload).toEqual({
      request_id: mockReqUuid,
      status: "awarded",
    });
  });

  it("does NOT emit when the driver was already picked (409 already_assigned)", async () => {
    seedPickPath();
    mockAssignmentRows = [
      { ...mockAssignmentRows[0], assigned_driver_user_id: mockDriverUuid },
    ];
    const res = await pickAssignment(
      makeRequest("POST", { driver_user_id: mockDriverUuid, vehicle_id: mockVehicleUuid }),
      { id: assignUuid },
    );
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 6 — confirm: status (confirmed) to owner + winning fleet
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — confirm emits status (confirmed) to owner + winning fleet", () => {
  function seedConfirmPath() {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "awarded",
        tracking_required: false,
        confirmation_deadline_at: new Date(Date.now() + 3_600_000),
      },
    ];
    mockAssignmentRows = [
      {
        id: assignUuid,
        request_id: mockReqUuid,
        fleet_id: mockFleetUuid,
        assigned_driver_user_id: mockDriverUuid,
        released_at: null,
      },
    ];
  }

  it("emits rental:status (confirmed) to owner + fleet after the tx", async () => {
    seedConfirmPath();
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("rental:status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
    ]);
    expect(events[0].payload).toEqual({
      request_id: mockReqUuid,
      status: "confirmed",
    });
  });

  it("does NOT emit on the guard path (403 non-owner)", async () => {
    seedConfirmPath();
    mockAuthUser = { id: "00000000-0000-4000-8000-000000000003", role: "rider" };
    const res = await confirmRequest(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(403);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 7 — fleet-ack: fleet_ack (owner) + status (fleet)
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — fleet-ack emits fleet_ack to the owner + status to the fleet", () => {
  function seedFleetAckPath() {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "awarded",
        tracking_required: true,
        fleet_ack_at: null,
      },
    ];
    mockAssignmentRows = [{ fleet_id: mockFleetUuid }];
  }

  it("emits rental:fleet_ack to the owner and rental:status (awarded) to the fleet", async () => {
    seedFleetAckPath();
    const res = await fleetAck(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(2);

    const ack = events.find((e: any) => e.event === "rental:fleet_ack");
    expect(ack).toBeDefined();
    expect(ack.to).toEqual([{ kind: "user", user_id: mockUserUuid }]);
    expect(ack.payload).toEqual(
      expect.objectContaining({
        request_id: mockReqUuid,
        fleet_id: mockFleetUuid,
        status: "awarded",
      }),
    );

    const status = events.find((e: any) => e.event === "rental:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([{ kind: "fleet", fleet_id: mockFleetUuid }]);
    expect(status.payload).toEqual({
      request_id: mockReqUuid,
      status: "awarded",
    });
  });

  it("does NOT emit when the fleet already acknowledged (409)", async () => {
    seedFleetAckPath();
    mockReqRows = [{ ...mockReqRows[0], fleet_ack_at: new Date() }];
    const res = await fleetAck(makeRequest("POST", null), { id: mockReqUuid });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 8 — cancel: status (cancelled) to owner + DISTINCT bidding fleets
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — cancel emits status (cancelled) to owner + distinct bidding fleets", () => {
  function seedCancelPath() {
    mockReqRows = [
      {
        id: mockReqUuid,
        rider_user_id: mockUserUuid,
        status: "awarded",
      },
    ];
    // Post-tx selectDistinct reads these rows. The mock returns raw rows (no
    // SQL projection), so the fixture holds DISTINCT fleets — dedup is the
    // real query's job (handler uses db.selectDistinct, verified in-code).
    mockBidRows = [
      { fleet_id: mockFleetUuid },
      { fleet_id: losingFleetUuid },
    ];
  }

  it("emits one rental:status with the owner + each distinct bidding fleet", async () => {
    seedCancelPath();
    const res = await cancelRequest(makeRequest("POST", { cancel_reason: "plans changed" }), {
      id: mockReqUuid,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("rental:status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: mockUserUuid },
      { kind: "fleet", fleet_id: mockFleetUuid },
      { kind: "fleet", fleet_id: losingFleetUuid },
    ]);
    expect(events[0].payload).toEqual({
      request_id: mockReqUuid,
      status: "cancelled",
    });
  });

  it("does NOT emit when cancelling from a terminal state (409)", async () => {
    seedCancelPath();
    mockReqRows = [{ ...mockReqRows[0], status: "completed" }];
    const res = await cancelRequest(makeRequest("POST", {}), { id: mockReqUuid });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});
