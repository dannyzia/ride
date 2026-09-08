// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * ISSUE-13 follow-up (Z2) — shop WS-emit behavioral tests for the two remaining
 * e9bea6d emit sites (mark-ready + status PATCH). Invokes the REAL handlers;
 * only DB/auth/logger/marketplaceRbac/wsNotify are mocked.
 *
 * Emit contract (v1 §D.4.1): after the tx commits, ONE notifyWs batch carrying
 * a single shop:order_status event to the order's rider ({kind:"user"}) plus
 * the shop's staff ({kind:"shop_staff"}), payload { order_id, shop_id, status }.
 * Failure paths (409/403) emit NOTHING.
 */

import { POST as markReady } from "@/app/api/shop/orders/[id]/mark-ready+api";
import { PATCH as patchStatus } from "@/app/api/shop/orders/[id]/status+api";
import { notifyWs } from "@/lib/wsNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const orderId = "00000000-0000-4000-8000-0000000000a1";
const shopId = "00000000-0000-4000-8000-0000000000a2";
const riderId = "00000000-0000-4000-8000-0000000000a3";

let mockOrderRows: Record<string, unknown>[] = [];
let mockShopRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockShopAuthOk = true;
let mockRiderAuthUser: { id: string; role: string } = { id: riderId, role: "rider" };

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    orders: schema.shopOrders,
    shops: schema.shops,
    deliveryRequests: schema.deliveryRequests,
  };

  // Chainable awaitable query result: .limit/.for compose; await resolves via then.
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
    if (t === T.orders) return mockOrderRows;
    if (t === T.shops) return mockShopRows;
    if (t === T.deliveryRequests) return [];
    return [];
  };

  const fromQ = (t: unknown) => ({
    where: () => chainable(resolveRows(t)),
  });

  const makeSelect = () => () => ({ from: (t: unknown) => fromQ(t) });

  const recordUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        return { returning: async () => mockUpdateRows };
      },
      returning: async () => mockUpdateRows,
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

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    (_roles: string[]) =>
    async () => ({
      supabaseUser: { id: "auth-rider" },
      dbUser: mockRiderAuthUser,
    }),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireShopMember:
    (_shopId: string, _roles?: readonly string[]) =>
    async () => {
      if (!mockShopAuthOk) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-test" },
        dbUser: { id: "db-staff-1", role: "driver" },
        membership: { id: "sm-1", shop_id: _shopId, user_id: "db-staff-1", role: "OWNER" },
      };
    },
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

const pickupOrder = (status: string) => ({
  id: orderId,
  shop_id: shopId,
  rider_user_id: riderId,
  status,
  category: "food",
  fulfillment: "pickup", // bridge path not exercised here — the emit contract is bridge-independent
  delivery_address: null,
  delivery_lat: null,
  delivery_lng: null,
  rider_notes: null,
  subtotal_bdt: 50000,
  total_bdt: 50000,
});

beforeEach(() => {
  mockOrderRows = [];
  mockShopRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockShopAuthOk = true;
  mockRiderAuthUser = { id: riderId, role: "rider" };
  (notifyWs as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// mark-ready: shop:order_status (ready_for_pickup) after the tx
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — mark-ready emits shop:order_status (ready_for_pickup) after the tx", () => {
  it("emits ONE shop:order_status to rider{user} + shop_staff with the target status", async () => {
    mockOrderRows = [pickupOrder("preparing")];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("shop:order_status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: riderId },
      { kind: "shop_staff", shop_id: shopId },
    ]);
    expect(events[0].payload).toEqual({
      order_id: orderId,
      shop_id: shopId,
      status: "ready_for_pickup",
    });
  });

  it("does NOT emit when the order is not preparing (409)", async () => {
    mockOrderRows = [pickupOrder("accepted")];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// status PATCH: shop:order_status (target transition) after the tx
// ══════════════════════════════════════════════════════════════════════
describe("Z2 — status PATCH emits shop:order_status with the TARGET status after the tx", () => {
  it("emits ONE shop:order_status to rider{user} + shop_staff; payload mirrors the target, not the source", async () => {
    mockOrderRows = [pickupOrder("pending")]; // pending → accepted is a valid transition

    const res = await patchStatus(makeRequest("PATCH", { status: "accepted" }), {
      id: orderId,
    });
    expect(res.status).toBe(200);
    expect(calls()).toHaveLength(1);

    const events = calls()[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("shop:order_status");
    expect(events[0].to).toEqual([
      { kind: "user", user_id: riderId },
      { kind: "shop_staff", shop_id: shopId },
    ]);
    expect(events[0].payload).toEqual({
      order_id: orderId,
      shop_id: shopId,
      status: "accepted", // target status, not the source 'pending'
    });
  });

  it("does NOT emit on an invalid transition (409 guard)", async () => {
    mockOrderRows = [pickupOrder("pending")]; // pending allows only accepted/cancelled

    const res = await patchStatus(makeRequest("PATCH", { status: "delivered" }), {
      id: orderId,
    });
    expect(res.status).toBe(409);
    expect(calls()).toHaveLength(0);
  });
});
