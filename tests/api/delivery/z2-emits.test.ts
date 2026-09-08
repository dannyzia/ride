// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/delivery/leg-action.test.ts).
/**
 * ISSUE-13 (Z2) — delivery WS-emit behavioral tests for the sites landed at e9bea6d.
 * Invokes the REAL handlers; only DB/auth/logger/platformConfig/wsNotify are mocked.
 *
 * Invariant under test: notifyWs fires exactly once per successful handler run,
 * AFTER the tx resolves, with the v1 §D event names / recipient kinds / payload
 * ids — and NEVER fires on a failed (409) transition.
 *
 * Covered emit sites (2; the shop sites are outside this issue's dispatched dirs
 * and the sweep emit is covered by demoteWinner-fleet-emit.test.ts):
 *   1. delivery accept-bid → delivery:bid_won + delivery:bid_settled (per-loser) + delivery:status (assigned)
 *   2. delivery leg action → delivery:status (customer + courier)
 */

import { jest } from "@jest/globals";
import { POST as acceptDeliveryBid } from "@/app/api/delivery/requests/[id]/accept-bid+api";
import { POST as legAction } from "@/app/api/delivery/legs/[id]/action+api";
import { notifyWs } from "@/lib/wsNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const requestUuid = "00000000-0000-4000-8000-0000000000d1";
const legUuid = "00000000-0000-4000-8000-0000000000d2";
const customerUserId = "00000000-0000-4000-8000-0000000000d3";
const courierUserId = "00000000-0000-4000-8000-0000000000d4";
const otherCourierUserId = "00000000-0000-4000-8000-0000000000d5";
const winningBidUuid = "00000000-0000-4000-8000-0000000000d6";
const losingBidUuid = "00000000-0000-4000-8000-0000000000d7";

let mockDeliveryRequestRows: Record<string, unknown>[] = [];
let mockBidRequestRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockLegRows: Record<string, unknown>[] = [];
let mockCourierRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockUpdateRowsQueue: unknown[][] = [];
let mockCourierType: "food" | "parcel" = "food";

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    deliveryRequests: schema.deliveryRequests,
    deliveryBids: schema.deliveryBids,
    deliveryLegs: schema.deliveryLegs,
    couriers: schema.couriers,
    drivers: schema.drivers,
    users: schema.users,
    shopOrders: schema.shopOrders,
    awardedBidAssignments: schema.awardedBidAssignments,
    rentalRequests: schema.rentalRequests,
  };

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

  const resolveRows = (t: unknown) => {
    if (t === T.deliveryRequests) {
      // accept-bid reads the bid-target request; leg-action reads the same
      // table — both keyed mocks are merged by which queue the test populated.
      return [...mockDeliveryRequestRows, ...mockBidRequestRows];
    }
    if (t === T.deliveryBids) return mockBidRows;
    if (t === T.deliveryLegs) return mockLegRows;
    if (t === T.couriers) return mockCourierRows;
    if (t === T.drivers) return mockDriverRows;
    return [];
  };

  const fromQ = (t: unknown) => {
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows(t));
    return q;
  };

  const makeSelect = () => () => ({ from: (t: unknown) => fromQ(t) });

  const recordUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        const rows =
          mockUpdateRowsQueue.length > 0 ? mockUpdateRowsQueue.shift()! : mockUpdateRows;
        return { returning: async () => rows };
      },
      returning: async () =>
        mockUpdateRowsQueue.length > 0 ? mockUpdateRowsQueue.shift()! : mockUpdateRows,
    }),
  });

  const recordInsert = () => () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return { returning: async () => [{ id: "generated-uuid", ...vals }] };
    },
  });

  const makeDb = () => ({
    select: makeSelect(),
    update: recordUpdate(),
    insert: recordInsert(),
  });

  return {
    db: {
      ...makeDb(),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(makeDb())),
    },
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: async () => ({ id: "auth-courier" }),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: customerUserId } }),
        }),
      }),
    }),
  },
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireCourier:
    (_type: "food" | "parcel") =>
    async () => ({
      supabaseUser: { id: "auth-courier" },
      dbUser: { id: courierUserId, role: "driver" },
      courier: { id: "c1", courier_type: mockCourierType, status: "active" },
      driver: null,
    }),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => true,
}));

jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn().mockImplementation(async (req: Request) => {
    try {
      const body = await req.json();
      return { ok: true, data: body };
    } catch {
      return { ok: false, response: Response.json({ error: "invalid_body" }, { status: 400 }) };
    }
  }),
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
  mockDeliveryRequestRows = [];
  mockBidRequestRows = [];
  mockBidRows = [];
  mockLegRows = [];
  mockCourierRows = [];
  mockDriverRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockUpdateRowsQueue = [];
  mockCourierType = "food";
  (notifyWs as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// 1 — delivery accept-bid: bid_won + per-loser bid_settled + status (assigned)
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — delivery accept-bid emits bid_won / bid_settled / status after the tx", () => {
  function seedHappyPath() {
    mockBidRequestRows = [
      {
        id: requestUuid,
        created_by_user_id: customerUserId,
        status: "pending",
        source_shop_order_id: null,
      },
    ];
    mockCourierRows = [
      { user_id: courierUserId, courier_type: "food", status: "active" },
    ];
    mockBidRows = [
      {
        id: winningBidUuid,
        request_id: requestUuid,
        courier_user_id: courierUserId,
        status: "active",
        quoted_fee_bdt: 15000,
      },
      {
        id: losingBidUuid,
        bid_id: losingBidUuid,
        request_id: requestUuid,
        courier_user_id: otherCourierUserId,
        status: "lost",
        quoted_fee_bdt: 18000,
      },
    ];
  }

  it("emits one batch: bid_won to the winning courier, bid_settled to the loser, status to customer+courier", async () => {
    seedHappyPath();
    const res = await acceptDeliveryBid(makeRequest("POST", { bid_id: winningBidUuid }), {
      id: requestUuid,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(3);

    const won = events.find((e: any) => e.event === "delivery:bid_won");
    expect(won).toBeDefined();
    expect(won.to).toEqual([{ kind: "user", user_id: courierUserId }]);
    expect(won.payload).toEqual(
      expect.objectContaining({
        request_id: requestUuid,
        bid_id: winningBidUuid,
        courier_user_id: courierUserId,
        status: "assigned",
      }),
    );

    // Losing courier gets ITS OWN bid id + status 'lost' (M6 delivery mirror)
    const settled = events.find((e: any) => e.event === "delivery:bid_settled");
    expect(settled).toBeDefined();
    expect(settled.to).toEqual([{ kind: "user", user_id: otherCourierUserId }]);
    expect(settled.payload).toEqual(
      expect.objectContaining({
        request_id: requestUuid,
        bid_id: losingBidUuid,
        reason: "lost_to_competitor",
        status: "lost",
      }),
    );

    const status = events.find((e: any) => e.event === "delivery:status");
    expect(status).toBeDefined();
    expect(status.to).toEqual([
      { kind: "user", user_id: customerUserId },
      { kind: "user", user_id: courierUserId },
    ]);
    expect(status.payload).toEqual({
      request_id: requestUuid,
      status: "assigned",
    });
  });

  it("does NOT emit when the request is no longer pending (409)", async () => {
    seedHappyPath();
    mockBidRequestRows = [{ ...mockBidRequestRows[0], status: "assigned" }];
    const res = await acceptDeliveryBid(makeRequest("POST", { bid_id: winningBidUuid }), {
      id: requestUuid,
    });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2 — delivery leg action: status to customer + courier
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — delivery leg action emits status (customer + courier) after the tx", () => {
  function seedLegPath() {
    mockLegRows = [
      {
        id: legUuid,
        request_id: requestUuid,
        courier_user_id: courierUserId,
        leg_state: "picked_up",
      },
    ];
    mockCourierRows = [{ status: "active" }];
    mockDeliveryRequestRows = [
      { id: requestUuid, status: "picked_up", created_by_user_id: customerUserId },
    ];
  }

  it("emits delivery:status to the customer and the courier on a delivered leg", async () => {
    seedLegPath();
    const res = await legAction(
      makeRequest("POST", { action: "deliver", pod_url: "https://pod.example.com/x.jpg" }),
      { id: legUuid },
    );
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("delivery:status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: customerUserId },
      { kind: "user", user_id: courierUserId },
    ]);
    expect(events[0].payload).toEqual(
      expect.objectContaining({
        request_id: requestUuid,
        leg_id: legUuid,
        status: "delivered",
      }),
    );
  });

  it("does NOT emit when the leg transition is invalid (409)", async () => {
    seedLegPath();
    mockLegRows = [{ ...mockLegRows[0], leg_state: "delivered" }];
    const res = await legAction(
      makeRequest("POST", { action: "deliver", pod_url: "https://pod.example.com/x.jpg" }),
      { id: legUuid },
    );
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});
