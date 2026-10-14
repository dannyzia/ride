// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * S4 (plan 27 §5, F-11/F-29) — customer order flow:
 *   - POST /api/shop/orders/[id]/cancel — state-dependent fee (config-fresh),
 *     stock restock, placement-leg failure, post-pickup closure
 *   - POST /api/shop/orders/[id]/confirm-partial — out-of-stock partial confirm
 *   - GET /api/shop/my-orders — caller-scoped list (tracking entry)
 *   - GET /api/shop/orders/[id] — cancellable + config-fresh fee + leg + shop
 *   - lib/shopNotify — F-29 single high-priority keyed sends (never batched)
 */
import { jest } from "@jest/globals";
import { POST as cancelPost } from "@/app/api/shop/orders/[id]/cancel+api";
import { POST as confirmPartialPost } from "@/app/api/shop/orders/[id]/confirm-partial+api";
import { GET as myOrdersGet } from "@/app/api/shop/my-orders+api";
import { GET as orderGet } from "@/app/api/shop/orders/[id]+api";
import { notifyShopNewOrder, notifyCustomerOrderStatus } from "@/lib/shopNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const orderId = "00000000-0000-4000-8000-0000000000c1";
const shopId = "00000000-0000-4000-8000-0000000000c2";
const riderId = "00000000-0000-4000-8000-0000000000c3";
const productId = "00000000-0000-4000-8000-0000000000c4";

let mockOrderRows: Record<string, unknown>[] = [];
let mockItemRows: Record<string, unknown>[] = [];
let mockShopRows: Record<string, unknown>[] = [];
let mockMemberRows: Record<string, unknown>[] = [];
let mockLegRows: Record<string, unknown>[] = [];
let mockMyOrderRows: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockSelectWheres: { table: unknown; args: unknown[] }[] = [];

let mockRiderAuthUser: { id: string; role: string } = { id: riderId, role: "rider" };
let mockRequireConfigInt: jest.Mock<Promise<number>, [string]>;

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    orders: schema.shopOrders,
    items: schema.shopOrderItems,
    products: schema.shopProducts,
    shops: schema.shops,
    members: schema.shopMembers,
    deliveries: schema.deliveries,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = () => c;
    c.leftJoin = () => c;
    c.innerJoin = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveRows = (t: unknown) => {
    if (t === T.orders) return mockOrderRows;
    if (t === T.items) return mockItemRows;
    if (t === T.shops) return mockShopRows;
    if (t === T.members) return mockMemberRows;
    if (t === T.deliveries) return mockLegRows;
    return [];
  };

  // leftJoin/innerJoin return the SAME chainable so a join+where still
  // resolves the left table's rows and records the predicate.
  const fromQ = (t: unknown) => {
    const branch: any = {};
    const record = (...args: unknown[]) => {
      mockSelectWheres.push({ table: t, args });
      return chainable(resolveRows(t));
    };
    branch.where = record;
    branch.leftJoin = () => branch;
    branch.innerJoin = () => branch;
    branch.orderBy = () => chainable(resolveRows(t));
    branch.limit = () => chainable(resolveRows(t));
    return branch;
  };

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

  const makeDb = () => ({
    select: makeSelect(),
    update: recordUpdate(),
    insert: () => ({ values: (vals: Record<string, unknown>) => ({ returning: async () => [{ id: "generated-uuid", ...vals }] }) }),
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

jest.mock("@/lib/marketplaceRbac", () => ({
  // The tracking read's first gate — the customer path falls through to
  // requireAnyRole when this throws (the default here).
  requireShopMember: jest.fn(() => async () => {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: async () => true,
  requireConfigInt: (key: string) => mockRequireConfigInt(key),
}));

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
  sendNotifications: jest.fn(async () => undefined),
}));

jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Imported AFTER the mocks so the jest.mock hoisting applies to its deps.
import { sendNotification } from "@/lib/notify";

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const baseOrder = {
  id: orderId,
  shop_id: shopId,
  rider_user_id: riderId,
  status: "pending",
  order_kind: "catalog",
  fulfillment: "delivery",
  subtotal_bdt: 50000,
  total_bdt: 50000,
};

beforeEach(() => {
  mockOrderRows = [];
  mockItemRows = [];
  mockShopRows = [];
  mockMemberRows = [];
  mockLegRows = [];
  mockMyOrderRows = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockSelectWheres = [];
  mockRiderAuthUser = { id: riderId, role: "rider" };
  mockRequireConfigInt = jest.fn(async () => 0);
  (sendNotification as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// F-11 — POST /api/shop/orders/[id]/cancel
// ══════════════════════════════════════════════════════════════════════
describe("F-11 — customer cancel (pre-pickup)", () => {
  it("pending order cancels FREE: no config read, stock restored, placement leg failed", async () => {
    mockOrderRows = [{ ...baseOrder }];
    mockItemRows = [
      { order_id: orderId, product_id: productId, quantity: 2 },
    ];

    const res = await cancelPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ status: "cancelled", cancel_fee_bdt: 0 });

    // Free while pending — the config key is never touched.
    expect(mockRequireConfigInt).not.toHaveBeenCalled();

    // Order flipped with the state-dependent fee recorded.
    const flip = mockUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(flip).toBeDefined();
    expect(flip!.vals.cancel_fee_bdt).toBe(0);
    expect(flip!.vals.cancel_reason).toBe("customer_cancelled");
    expect(flip!.vals.cancelled_at).toBeDefined();

    // Restock (the placement tx deducted stock for these items).
    const restock = mockUpdateCalls.find((c) => "stock" in c.vals);
    expect(restock).toBeDefined();

    // The placement-created leg is failed — never a cancelled order with a live leg.
    const legFail = mockUpdateCalls.find((c) => c.vals.status === "failed");
    expect(legFail).toBeDefined();
    expect(legFail!.vals.status).toBe("failed");
  });

  it("accepted order: the fee is FRESH from platform_config (seeds-not-constants)", async () => {
    mockOrderRows = [{ ...baseOrder, status: "accepted" }];
    mockItemRows = [];
    mockRequireConfigInt = jest.fn(async () => 1500);

    const res = await cancelPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancel_fee_bdt).toBe(1500);
    expect(mockRequireConfigInt).toHaveBeenCalledWith(
      "shop_order_cancel_fee_after_accept_bdt",
    );

    const flip = mockUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(flip!.vals.cancel_fee_bdt).toBe(1500);
  });

  it("post-pickup (out_for_delivery): cancel path CLOSED → 409, zero writes", async () => {
    mockOrderRows = [{ ...baseOrder, status: "out_for_delivery" }];

    const res = await cancelPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("cancel_not_allowed");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("not the ordering rider → 403, zero writes", async () => {
    mockOrderRows = [{ ...baseOrder }];
    mockRiderAuthUser = { id: "00000000-0000-4000-8000-00000000dead", role: "rider" };

    const res = await cancelPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("already cancelled → 409 already_cancelled", async () => {
    mockOrderRows = [{ ...baseOrder, status: "cancelled" }];

    const res = await cancelPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("already_cancelled");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("invalid UUID → 400 before any DB access", async () => {
    const res = await cancelPost(makeRequest("POST"), { id: "not-a-uuid" });
    expect(res.status).toBe(400);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockSelectWheres).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-11 — POST /api/shop/orders/[id]/confirm-partial
// ══════════════════════════════════════════════════════════════════════
describe("F-11 — out-of-stock partial confirm", () => {
  it("stamps partial_confirmed_at for the ordering customer", async () => {
    mockOrderRows = [
      { ...baseOrder, status: "accepted", unavailable_item_ids: [productId], partial_confirmed_at: null },
    ];

    const res = await confirmPartialPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(200);
    const stamp = mockUpdateCalls.find((c) => "partial_confirmed_at" in c.vals);
    expect(stamp).toBeDefined();
    expect(stamp!.vals.partial_confirmed_at).toBeDefined();
  });

  it("duplicate confirm is an idempotent no-op (zero writes)", async () => {
    mockOrderRows = [
      {
        ...baseOrder,
        status: "accepted",
        unavailable_item_ids: [productId],
        partial_confirmed_at: "2026-10-14T10:00:00Z",
      },
    ];

    const res = await confirmPartialPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(200);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("order with no missing items → 409 not_partial", async () => {
    mockOrderRows = [{ ...baseOrder, status: "accepted", unavailable_item_ids: null }];

    const res = await confirmPartialPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("not_partial");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("not the ordering rider → 403, zero writes", async () => {
    mockOrderRows = [
      { ...baseOrder, status: "accepted", unavailable_item_ids: [productId] },
    ];
    mockRiderAuthUser = { id: "00000000-0000-4000-8000-00000000dead", role: "rider" };

    const res = await confirmPartialPost(makeRequest("POST"), { id: orderId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-11 — GET /api/shop/my-orders
// ══════════════════════════════════════════════════════════════════════
describe("F-11 — my-orders list", () => {
  it("returns the caller's rows with the filter bound to the caller id", async () => {
    mockMyOrderRows = [{ id: orderId, shop_name: "Test Shop", total_bdt: 50000 }];
    mockOrderRows = mockMyOrderRows;

    const res = await myOrdersGet(makeRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orders).toHaveLength(1);

    // The WHERE predicate pins rider_user_id = the authenticated caller.
    const { PgDialect } = require("drizzle-orm/pg-core");
    const where = mockSelectWheres.at(-1);
    const rendered = new PgDialect().sqlToQuery(where.args[0]);
    expect(rendered.params).toEqual(expect.arrayContaining([riderId]));
  });

  it("invalid shop_id → 400 before any DB access", async () => {
    const res = await myOrdersGet(
      new Request("http://localhost/api/shop/my-orders?shop_id=nope"),
    );
    expect(res.status).toBe(400);
    expect(mockSelectWheres).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-11 — GET /api/shop/orders/[id] (tracking read)
// ══════════════════════════════════════════════════════════════════════
describe("F-11 — order detail (tracking read)", () => {
  it("customer read: cancellable + config-fresh fee + leg + shop name", async () => {
    mockOrderRows = [{ ...baseOrder, status: "preparing", unavailable_item_ids: null, partial_confirmed_at: null }];
    mockItemRows = [{ id: "item-1", product_id: productId, quantity: 1, line_total_bdt: 50000, product_name: "Rice" }];
    mockShopRows = [{ name: "Test Shop" }];
    mockLegRows = [{ status: "created", delivery_man_user_id: null, accepted_at: null, delivery_fee_bdt: 8000 }];
    mockRequireConfigInt = jest.fn(async () => 700);

    const res = await orderGet(makeRequest("GET"), { id: orderId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancellable).toBe(true);
    expect(json.cancel_fee_bdt).toBe(700);
    expect(json.shop_name).toBe("Test Shop");
    expect(json.leg).toMatchObject({ status: "created", delivery_fee_bdt: 8000 });
    expect(json.items).toHaveLength(1);
    expect(mockRequireConfigInt).toHaveBeenCalledWith(
      "shop_order_cancel_fee_after_accept_bdt",
    );
  });

  it("terminal order: NOT cancellable, no config read, fee null", async () => {
    mockOrderRows = [{ ...baseOrder, status: "delivered" }];
    mockItemRows = [];
    mockShopRows = [{ name: "Test Shop" }];
    mockLegRows = [];

    const res = await orderGet(makeRequest("GET"), { id: orderId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.cancellable).toBe(false);
    expect(json.cancel_fee_bdt).toBeNull();
    expect(json.leg).toBeNull();
    expect(mockRequireConfigInt).not.toHaveBeenCalled();
  });

  it("neither shop member nor ordering rider → 403", async () => {
    mockOrderRows = [{ ...baseOrder }];
    mockRiderAuthUser = { id: "00000000-0000-4000-8000-00000000dead", role: "rider" };

    const res = await orderGet(makeRequest("GET"), { id: orderId });
    expect(res.status).toBe(403);
  });

  it("invalid UUID → 400 before any DB access", async () => {
    const res = await orderGet(makeRequest("GET"), { id: "nope" });
    expect(res.status).toBe(400);
    expect(mockSelectWheres).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F-29 — lib/shopNotify (delivery class: single, keyed, high priority)
// ══════════════════════════════════════════════════════════════════════
describe("F-29 — shop order notifications", () => {
  it("new order → active members + owner, deduped, high priority, keyed per recipient", async () => {
    mockMemberRows = [
      { user_id: "00000000-0000-4000-8000-0000000000m1" },
      { user_id: "00000000-0000-4000-8000-0000000000m2" },
    ];
    mockShopRows = [
      { owner_user_id: "00000000-0000-4000-8000-0000000000m1" }, // dup of a member
    ];

    await notifyShopNewOrder(orderId, shopId, 58000);

    expect(sendNotification).toHaveBeenCalledTimes(2); // m1 deduped
    for (const call of (sendNotification as jest.Mock).mock.calls) {
      const [userId, type, _title, _body, data, options] = call;
      expect(type).toBe("shop:new_order");
      expect(options.priority).toBe("high");
      expect(options.idempotencyKey).toBe(`shop_new_order:${orderId}:${userId}`);
      expect(data.order_id).toBe(orderId);
      expect(data.shop_id).toBe(shopId);
    }
  });

  it("delivered → the ordering customer, one keyed send", async () => {
    await notifyCustomerOrderStatus(orderId, riderId, "delivered");

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, type, , , data, options] = (sendNotification as jest.Mock).mock.calls[0];
    expect(userId).toBe(riderId);
    expect(type).toBe("shop:order_status");
    expect(data.status).toBe("delivered");
    expect(options.priority).toBe("high");
    expect(options.idempotencyKey).toBe(
      `shop_order_status:${orderId}:delivered:${riderId}`,
    );
  });

  it("unmapped status is silent (no invented copy)", async () => {
    await notifyCustomerOrderStatus(orderId, riderId, "pending");
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
