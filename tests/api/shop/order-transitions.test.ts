// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/rental/security-fix.test.ts).
/**
 * A2 + B2 — Shop order transition tests.
 * A2 (audit #2/#11): mark-ready runs the food-delivery bridge INSIDE the same
 * tx behind a conditional status guard.
 * B2 (audit #10): PATCH status locks the row and uses a conditional UPDATE.
 */
import { jest } from "@jest/globals";
import { POST as markReady } from "@/app/api/shop/orders/[id]/mark-ready+api";
import { PATCH as patchStatus } from "@/app/api/shop/orders/[id]/status+api";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const orderId = "00000000-0000-4000-8000-0000000000a1";
const shopId = "00000000-0000-4000-8000-0000000000a2";
const riderId = "00000000-0000-4000-8000-0000000000a3";
const shopRowUuid = "00000000-0000-4000-8000-0000000000a4";

let mockOrderRows: Record<string, unknown>[] = [];
let mockShopRows: Record<string, unknown>[] = [];
let mockDeliveryRequestRows: Record<string, unknown>[] = [];
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

  const fromQ = (t: unknown) => ({
    where: () => chainable(resolveRows(t)),
  });
  const resolveRows = (t: unknown) => {
    if (t === T.orders) return mockOrderRows;
    if (t === T.shops) return mockShopRows;
    if (t === T.deliveryRequests) return mockDeliveryRequestRows;
    return [];
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

  const recordInsert = () => () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return {
        returning: async () => [{ id: "generated-uuid", ...vals }],
      };
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

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const foodDeliveryOrder = {
  id: orderId,
  shop_id: shopId,
  rider_user_id: riderId,
  status: "preparing",
  category: "food",
  fulfillment: "delivery",
  delivery_address: "123 Main St",
  delivery_lat: "23.8103",
  delivery_lng: "90.4125",
  rider_notes: null,
  subtotal_bdt: 50000,
  total_bdt: 50000,
};

const shopRow = { address_line: "12 Gulshan Ave", lat: "23.7925", lng: "90.4078" };

beforeEach(() => {
  mockOrderRows = [];
  mockShopRows = [];
  mockDeliveryRequestRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockShopAuthOk = true;
  mockRiderAuthUser = { id: riderId, role: "rider" };
});

// ══════════════════════════════════════════════════════════════════════
// A2 — POST mark-ready
// ══════════════════════════════════════════════════════════════════════
describe("A2 — POST /api/shop/orders/[id]/mark-ready", () => {
  it("food delivery: order ready + delivery row created in the same tx-run", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder }];
    mockShopRows = [{ id: shopRowUuid, ...shopRow }];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(200);

    // BOTH writes happened in the single mocked tx commit set
    const readyUpdate = mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup");
    expect(readyUpdate).toBeDefined();
    const deliveryInsert = mockInsertCalls.find((v) => v.source_shop_order_id === orderId);
    expect(deliveryInsert).toBeDefined();
    // A5 regression: pickup coords are the SHOP's, not the customer's
    expect(deliveryInsert.pickup_lat).toBe("23.7925");
    expect(deliveryInsert.pickup_lat).not.toBe("23.8103");
  });

  it("non-food pickup order: ready, NO bridge call, no delivery insert", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder, category: "general", fulfillment: "pickup" }];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(200);
    expect(mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup")).toBeDefined();
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("bridge returns null (shop coords missing) → 409 food_delivery_unavailable, zero delivery writes", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder }];
    mockShopRows = [{ id: shopRowUuid, ...shopRow, lat: null, lng: null }];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("food_delivery_unavailable");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("double mark-ready: non-preparing order → 409 invalid_transition, zero writes", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder, status: "ready_for_pickup" }];

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("concurrent-cancel race: conditional WHERE yields 0 rows → 409", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder }];
    mockShopRows = [{ id: shopRowUuid, ...shopRow }];
    mockUpdateRows = []; // racing transition/cancel won the row

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockInsertCalls).toHaveLength(0);

    // Predicate rendering: WHERE must pin status='preparing'
    const readyUpdate = mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup");
    expect(readyUpdate).toBeDefined();
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(readyUpdate!.whereArgs[0]);
    expect(rendered.params).toEqual(expect.arrayContaining([orderId, "preparing"]));
  });

  it("non-member staff is rejected with 403 before any write", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder }];
    mockShopAuthOk = false;

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("unauthorized rider (not the ordering rider) is rejected with 403, zero writes", async () => {
    mockOrderRows = [{ ...foodDeliveryOrder }];
    mockShopAuthOk = false;
    mockRiderAuthUser = { id: "someone-else", role: "rider" };

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// B2 — PATCH /api/shop/orders/[id]/status
// ══════════════════════════════════════════════════════════════════════
describe("B2 — PATCH /api/shop/orders/[id]/status", () => {
  beforeEach(() => {
    mockShopAuthOk = true;
  });

  it("shop staff transitions pending → accepted (200)", async () => {
    mockOrderRows = [
      { id: orderId, shop_id: shopId, rider_user_id: riderId, status: "pending" },
    ];
    const res = await patchStatus(makeRequest("PATCH", { status: "accepted" }), { id: orderId });
    expect(res.status).toBe(200);
    const update = mockUpdateCalls.find((c) => c.vals.status === "accepted");
    expect(update).toBeDefined();
    expect(update!.vals.accepted_at).toBeDefined();
  });

  it("rider may still cancel their own order (200, cancelled_at set)", async () => {
    mockOrderRows = [
      { id: orderId, shop_id: shopId, rider_user_id: riderId, status: "pending" },
    ];
    mockShopAuthOk = false; // not shop staff — ordering rider path

    const res = await patchStatus(
      makeRequest("PATCH", { status: "cancelled", cancel_reason: "changed mind" }),
      { id: orderId },
    );
    expect(res.status).toBe(200);
    const update = mockUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(update).toBeDefined();
    expect(update!.vals.cancel_reason).toBe("changed mind");
  });

  it("invalid transition pending → delivered: 409, zero writes", async () => {
    mockOrderRows = [
      { id: orderId, shop_id: shopId, rider_user_id: riderId, status: "pending" },
    ];
    const res = await patchStatus(makeRequest("PATCH", { status: "delivered" }), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("concurrent flip: locked status no longer matches → 409 via conditional WHERE", async () => {
    mockOrderRows = [
      { id: orderId, shop_id: shopId, rider_user_id: riderId, status: "preparing" },
    ];
    mockUpdateRows = []; // row moved between the locked read and the UPDATE

    const res = await patchStatus(
      makeRequest("PATCH", { status: "ready_for_pickup" }),
      { id: orderId },
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");

    // Predicate rendering: WHERE pins the LOCKED status ('preparing')
    const update = mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup");
    expect(update).toBeDefined();
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(update!.whereArgs[0]);
    expect(rendered.params).toEqual(expect.arrayContaining([orderId, "preparing"]));
  });

  it("unauthorized rider (not the ordering rider) is rejected with 403, zero writes", async () => {
    mockOrderRows = [
      { id: orderId, shop_id: shopId, rider_user_id: "someone-else", status: "pending" },
    ];
    mockShopAuthOk = false;

    const res = await patchStatus(makeRequest("PATCH", { status: "accepted" }), { id: orderId });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});
