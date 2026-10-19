// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * C5/C6-FIX — unified delivered-transition regression suite.
 *
 * The gate and the completion path are ONE change: delivered/out_for_delivery
 * join SHOP_ONLY_STATES (the ordering rider drives only cancel), and a live
 * courier leg 403s shop completion around it (courier_owns_completion) —
 * the courier's leg action owns delivered, the shop owns self_delivered for
 * pickup-fulfillment orders only.
 */
import { jest } from "@jest/globals";
import { PATCH as patchStatus } from "@/app/api/shop/orders/[id]/status+api";
import { GET as listOrders } from "@/app/api/shop/orders+api";

const orderId = "00000000-0000-4000-8000-0000000000b1";
const shopId = "00000000-0000-4000-8000-0000000000b2";
const riderId = "00000000-0000-4000-8000-0000000000b3";

let mockOrderRows: Record<string, unknown>[] = [];
let mockLegRows: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: orderId }];
let mockShopAuthOk = true;
let mockRiderAuthUser = { id: riderId, role: "rider" };
let mockSettleCalls: unknown[] = [];
let mockPartialCalls: unknown[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = { orders: schema.shopOrders, legs: schema.deliveries };

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

  // Count queries (`select({ total: count() })`) resolve through the same
  // chainable — the suite never asserts `total`, only row shaping.
  return {
    db: {
      select: () => ({
        from: (t: unknown) => ({
          where: () => chainable(t === T.legs ? mockLegRows : mockOrderRows),
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: (...whereArgs: unknown[]) => {
            mockUpdateCalls.push({ vals, whereArgs });
            return { returning: async () => mockUpdateRows };
          },
          returning: async () => mockUpdateRows,
        }),
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => [{ id: "generated-uuid", ...vals }],
        }),
      }),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          select: () => ({
            from: (t: unknown) => ({
              where: () => chainable(t === T.legs ? mockLegRows : mockOrderRows),
            }),
          }),
          update: () => ({
            set: (vals: Record<string, unknown>) => ({
              where: (...whereArgs: unknown[]) => {
                mockUpdateCalls.push({ vals, whereArgs });
                return { returning: async () => mockUpdateRows };
              },
              returning: async () => mockUpdateRows,
            }),
          }),
          insert: () => ({
            values: (vals: Record<string, unknown>) => ({
              returning: async () => [{ id: "generated-uuid", ...vals }],
            }),
          }),
        }),
      ),
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

jest.mock("@/lib/shopLedger", () => ({
  settleShopOrder: jest.fn(async (...args: unknown[]) => {
    mockSettleCalls.push(args);
  }),
  reverseShopOrder: jest.fn(),
}));

jest.mock("@/lib/shopNotify", () => ({
  notifyCustomerOrderStatus: jest.fn(),
  notifyCustomerPartialAccept: jest.fn(async (...args: unknown[]) => {
    mockPartialCalls.push(args);
  }),
  notifyShopNewOrder: jest.fn(),
}));

jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/test", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const baseOrder = {
  id: orderId,
  shop_id: shopId,
  rider_user_id: riderId,
  fulfillment: "delivery",
  delivery_fee_bdt: 8000,
  subtotal_bdt: 50000,
  total_bdt: 58000,
};

beforeEach(() => {
  mockOrderRows = [];
  mockLegRows = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: orderId }];
  mockShopAuthOk = true;
  mockRiderAuthUser = { id: riderId, role: "rider" };
  mockSettleCalls = [];
  mockPartialCalls = [];
});

test("rider PATCH delivered on their own order → 403 (rider drives only cancel)", async () => {
  mockShopAuthOk = false; // not a shop member → falls to rider auth
  mockOrderRows = [{ ...baseOrder, status: "out_for_delivery" }];
  mockLegRows = [];
  const res = await patchStatus(makeRequest({ status: "delivered" }), { id: orderId });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe("forbidden");
  expect(mockSettleCalls).toHaveLength(0);
});

test("shop PATCH delivered with a live ACCEPTED leg → 403 courier_owns_completion", async () => {
  mockOrderRows = [{ ...baseOrder, status: "out_for_delivery" }];
  mockLegRows = [{ id: "leg-1", status: "accepted" }];
  const res = await patchStatus(makeRequest({ status: "delivered" }), { id: orderId });
  expect(res.status).toBe(403);
  const body = await res.json();
  expect(body.error).toBe("courier_owns_completion");
  expect(mockSettleCalls).toHaveLength(0);
});

test("shop PATCH self_delivered with a claimed (picked_up) leg → 403", async () => {
  mockOrderRows = [{ ...baseOrder, fulfillment: "pickup", status: "ready_for_pickup" }];
  mockLegRows = [{ id: "leg-1", status: "picked_up" }];
  const res = await patchStatus(makeRequest({ status: "self_delivered" }), { id: orderId });
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe("courier_owns_completion");
});

test("shop self_delivered on a pickup order with NO leg → settles in-tx", async () => {
  mockOrderRows = [{ ...baseOrder, fulfillment: "pickup", status: "ready_for_pickup" }];
  mockLegRows = [];
  const res = await patchStatus(makeRequest({ status: "self_delivered" }), { id: orderId });
  expect(res.status).toBe(200);
  expect(mockSettleCalls).toHaveLength(1);
});

test("shop self_delivered with an UNCLAIMED (offered) chain → fails the chain + settles", async () => {
  mockOrderRows = [{ ...baseOrder, fulfillment: "delivery", status: "dispatched" }];
  mockLegRows = [{ id: "leg-1", status: "offered" }];
  const res = await patchStatus(makeRequest({ status: "self_delivered" }), { id: orderId });
  expect(res.status).toBe(200);
  expect(mockSettleCalls).toHaveLength(1);
  const legKill = mockUpdateCalls.find((c) => c.vals.status === "failed");
  expect(legKill).toBeDefined();
});

test("cancel kills an ACCEPTED leg (unified leg-reconciliation, C7-3)", async () => {
  mockOrderRows = [{ ...baseOrder, status: "dispatched" }];
  mockLegRows = [{ id: "leg-1", status: "accepted" }];
  const res = await patchStatus(
    makeRequest({ status: "cancelled", cancel_reason: "no stock" }),
    { id: orderId },
  );
  expect(res.status).toBe(200);
  const legKill = mockUpdateCalls.find((c) => c.vals.status === "failed");
  expect(legKill).toBeDefined();
});

test("partial accept pushes the customer with the missing count (C5-4)", async () => {
  const missingId = "00000000-0000-4000-8000-0000000000c1";
  mockOrderRows = [{ ...baseOrder, status: "pending", unavailable_item_ids: null }];
  mockLegRows = [];
  // The accept branch reads order items for the subset check — the shared
  // mock resolves every table to the order rows; give the item row directly.
  mockOrderRows = [
    { ...baseOrder, status: "pending", product_id: missingId, line_total_bdt: 0 },
  ];
  const res = await patchStatus(
    makeRequest({ status: "accepted", unavailable_item_ids: [missingId] }),
    { id: orderId },
  );
  expect(res.status).toBe(200);
  expect(mockPartialCalls).toHaveLength(1);
  expect(mockPartialCalls[0]).toEqual([orderId, riderId, 1]);
});

test("orders list carries has_live_leg per row", async () => {
  mockOrderRows = [
    { ...baseOrder, status: "dispatched" },
    { ...baseOrder, id: "00000000-0000-4000-8000-0000000000b9", status: "preparing" },
  ];
  mockLegRows = [{ order_id: orderId }];
  const req = new Request(`http://localhost/api/shop/orders?shop_id=${shopId}&limit=50`);
  const res = await listOrders(req);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.orders).toHaveLength(2);
  expect(body.orders[0].has_live_leg).toBe(true);
  expect(body.orders[1].has_live_leg).toBe(false);
});
