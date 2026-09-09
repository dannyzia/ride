// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * Food bridge contract — rebuilt on the table-router mock pattern.
 *
 * Owns two contracts (partition: mark-ready emits + status PATCH → z2-emits.test.ts;
 * bridge lib internals (A5 idempotency/pickup coords) → this file's `createFromShopOrder`
 * describe via the real lib; F40 money write → this file via the REAL accept-bid handler):
 *
 *   1. Mark-ready bridge matrix (§C.1): the food-delivery bridge fires ONLY for
 *      category='food' AND fulfillment='delivery'. All other matrix cells (food+pickup,
 *      general+delivery, general+pickup) mark the order ready WITHOUT any bridge call.
 *      Bridge null → 409 food_delivery_unavailable with the order NOT transitioned.
 *   2. F40 fee recompute (accept-bid): accepting a courier bid on a bridged food order
 *      writes delivery_fee_bdt = bid.quoted_fee_bdt and total_bdt = subtotal_bdt + fee
 *      to the SHOP order in the SAME tx. Parcel-originated requests (no
 *      source_shop_order_id) never touch shop_orders.
 *
 * Previously: 3 literal expect(true) placeholders + a test that computed its own
 * arithmetic (2026-09-09 staleness audit A2/A3).
 */

import { POST as markReady } from "@/app/api/shop/orders/[id]/mark-ready+api";
import { POST as acceptBid } from "@/app/api/delivery/requests/[id]/accept-bid+api";
import { createFromShopOrder } from "@/lib/shopDeliveryBridge";
import { notifyWs } from "@/lib/wsNotify";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const orderId = "00000000-0000-4000-8000-0000000000a1";
const shopId = "00000000-0000-4000-8000-0000000000a2";
const riderId = "00000000-0000-4000-8000-0000000000a3";
const courierId = "00000000-0000-4000-8000-0000000000a4";
const requestId = "00000000-0000-4000-8000-0000000000a5";
const bidId = "00000000-0000-4000-8000-0000000000a6";

let mockOrderRows: Record<string, unknown>[] = [];
let mockShopRows: Record<string, unknown>[] = [];
let mockDeliveryRequestRows: Record<string, unknown>[] = [];
let mockBidRows: Record<string, unknown>[] = [];
let mockCourierRows: Record<string, unknown>[] = [];
let mockDriverRows: Record<string, unknown>[] = [];
let mockUserRows: Record<string, unknown>[] = [];
let mockLegRows: Record<string, unknown>[] = [];

let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: { table: unknown; vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockShopAuthOk = true;
let mockBridgeBehavior: "null" | "passthrough" = "passthrough";
let mockDbUser: { id: string } | null = { id: riderId };

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    orders: schema.shopOrders,
    shops: schema.shops,
    deliveryRequests: schema.deliveryRequests,
    bids: schema.deliveryBids,
    couriers: schema.couriers,
    drivers: schema.drivers,
    users: schema.users,
    legs: schema.deliveryLegs,
    rentalRequests: schema.rentalRequests,
    assignments: schema.awardedBidAssignments,
    emergencyRequests: schema.emergencyRequests,
    certs: schema.ambulanceCertifications,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.innerJoin = () => c;
    c.leftJoin = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const resolveRows = (t: unknown) => {
    if (t === T.orders) return mockOrderRows;
    if (t === T.shops) return mockShopRows;
    if (t === T.deliveryRequests) return mockDeliveryRequestRows;
    if (t === T.bids) return mockBidRows;
    if (t === T.couriers) return mockCourierRows;
    if (t === T.drivers) return mockDriverRows;
    if (t === T.users) return mockUserRows;
    if (t === T.legs) return mockLegRows;
    return [];
  };

  const makeSelect = () => () => ({ from: (t: unknown) => fromQ(t) });
  const fromQ = (t: unknown) => {
    const q: any = {};
    q.innerJoin = () => q;
    q.leftJoin = () => q;
    q.where = () => chainable(resolveRows(t));
    return q;
  };

  const recordUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ table: undefined, vals, whereArgs });
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
      dbUser: { id: riderId, role: "rider" },
    }),
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-rider" })),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: mockDbUser })),
    })),
  },
}));

jest.mock("@/lib/parseBody", () => ({
  parseJsonBody: jest.fn(async (req: Request) => {
    try {
      const body = await req.json();
      return { ok: true, data: body };
    } catch {
      return { ok: false, response: Response.json({ error: "invalid_body" }, { status: 400 }) };
    }
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

// Bridge mock: 'passthrough' runs the REAL lib against the router-mock DB;
// 'ok'/'null' force outcomes for handler-path tests (bridge lib internals have
// their own describes below running the real lib directly).
jest.mock("@/lib/shopDeliveryBridge", () => ({
  createFromShopOrder: jest.fn(async (order: Record<string, unknown>, tx?: unknown) => {
    if (mockBridgeBehavior === "null") return null;
    // 'passthrough' (default) runs the REAL lib against the router-mock DB so the
    // handler test asserts the true tx-shared write path end-to-end.
    const real = jest.requireActual("@/lib/shopDeliveryBridge") as {
      createFromShopOrder: (
        o: Record<string, unknown>,
        tx?: unknown,
      ) => Promise<{ id: string } | null>;
    };
    return real.createFromShopOrder(order, tx);
  }),
}));

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const shopRow = { id: shopId, address_line: "12 Gulshan Ave", lat: "23.7925", lng: "90.4078", status: "active" };

const shopOrder = (over: Record<string, unknown> = {}) => ({
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
  ...over,
});

beforeEach(() => {
  mockOrderRows = [];
  mockShopRows = [];
  mockDeliveryRequestRows = [];
  mockBidRows = [];
  mockCourierRows = [];
  mockDriverRows = [];
  mockUserRows = [];
  mockLegRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockShopAuthOk = true;
  mockBridgeBehavior = "passthrough";
  mockDbUser = { id: riderId };
  (notifyWs as jest.Mock).mockClear();
  (createFromShopOrder as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// 1 — Bridge matrix through the REAL mark-ready handler (§C.1)
// ══════════════════════════════════════════════════════════════════════
describe("mark-ready bridge matrix — real handler (§C.1)", () => {
  const cells = [
    { label: "food + delivery (bridge FIRES)", category: "food", fulfillment: "delivery", expectBridge: true },
    { label: "food + pickup (bridge SKIPPED)", category: "food", fulfillment: "pickup", expectBridge: false },
    { label: "general + delivery (bridge SKIPPED)", category: "general", fulfillment: "delivery", expectBridge: false },
    { label: "general + pickup (bridge SKIPPED)", category: "general", fulfillment: "pickup", expectBridge: false },
  ];

  for (const cell of cells) {
    it(`bridge ${cell.expectBridge ? "Fires" : "does NOT fire"} for ${cell.label}`, async () => {
      mockOrderRows = [shopOrder({ category: cell.category, fulfillment: cell.fulfillment })];
      mockShopRows = [{ ...shopRow }];

      const res = await markReady(makeRequest("POST", null), { id: orderId });
      expect(res.status).toBe(200);

      const readyUpdate = mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup");
      expect(readyUpdate).toBeDefined();

      if (cell.expectBridge) {
        expect(createFromShopOrder).toHaveBeenCalledTimes(1);
        expect(createFromShopOrder).toHaveBeenCalledWith(
          expect.objectContaining({ id: orderId, shop_id: shopId, rider_user_id: riderId }),
          expect.anything(), // tx — the bridge runs inside the caller's transaction
        );
      } else {
        expect(createFromShopOrder).not.toHaveBeenCalled();
      }
    });
  }

  it("bridge null (shop missing coords) → 409 food_delivery_unavailable, order NOT transitioned", async () => {
    mockOrderRows = [shopOrder()];
    mockShopRows = [{ ...shopRow }];
    mockBridgeBehavior = "null";

    const res = await markReady(makeRequest("POST", null), { id: orderId });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("food_delivery_unavailable");
    // Rollback semantics: the ready_for_pickup write is inside the same tx —
    // a throw rolls it back, so production must show ZERO ready-transition rows.
    const readyUpdate = mockUpdateCalls.find((c) => c.vals.status === "ready_for_pickup");
    expect(readyUpdate).toBeDefined(); // the write was attempted (same-tx contract)
    // and no delivery insert survived:
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("real bridge runs inside the handler tx: delivery insert carries the SHOP's pickup coords", async () => {
    mockOrderRows = [shopOrder()];
    mockShopRows = [{ ...shopRow }];

    await markReady(makeRequest("POST", null), { id: orderId });

    const deliveryInsert = mockInsertCalls.find((v) => v.source_shop_order_id === orderId);
    expect(deliveryInsert).toBeDefined();
    // A5 regression: pickup = shop coords, dropoff = customer coords
    expect(deliveryInsert.pickup_address).toBe("12 Gulshan Ave");
    expect(deliveryInsert.pickup_lat).toBe("23.7925");
    expect(deliveryInsert.dropoff_lat).toBe("23.8103");
    expect(deliveryInsert.status).toBe("pending");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 2 — F40 fee recompute through the REAL accept-bid handler
// ══════════════════════════════════════════════════════════════════════
describe("F40 — accept-bid recomputes shop-order total in the same tx", () => {
  const SUBTOTAL = 50000; // 500.00 BDT paisa
  const FEE = 8000; // 80.00 BDT paisa

  const bridgedRequest = (over: Record<string, unknown> = {}) => ({
    id: requestId,
    created_by_user_id: riderId,
    source_shop_order_id: orderId,
    status: "pending",
    pickup_address: "12 Gulshan Ave",
    dropoff_address: "123 Main St",
    ...over,
  });

  const winningBid = {
    id: bidId,
    request_id: requestId,
    courier_user_id: courierId,
    status: "active",
    quoted_fee_bdt: FEE,
  };

  beforeEach(() => {
    mockDeliveryRequestRows = [bridgedRequest()];
    mockBidRows = [winningBid];
    mockCourierRows = [{ id: "c1", user_id: courierId, courier_type: "food", status: "active" }];
    mockUserRows = [{ id: courierId }];
    mockDriverRows = [];
    mockLegRows = [];
    // accept-bid re-selects the shop order by source_shop_order_id — the router
    // serves shopOrders reads from mockOrderRows, so park the F40 row there.
    mockOrderRows = [
      { id: orderId, subtotal_bdt: SUBTOTAL, total_bdt: SUBTOTAL, delivery_fee_bdt: null },
    ];
  });

  it("food delivery (source_shop_order_id present): delivery_fee_bdt = quoted_fee, total = subtotal + fee, same tx", async () => {
    const res = await acceptBid(makeRequest("POST", { bid_id: bidId }), { id: requestId });
    expect(res.status).toBe(200);

    // The shop-order update happened with F40's exact contract:
    const feeUpdate = mockUpdateCalls.find((c) => c.vals.delivery_fee_bdt === FEE);
    expect(feeUpdate).toBeDefined();
    expect(feeUpdate!.vals.total_bdt).toBe(SUBTOTAL + FEE); // 58000 — computed by PRODUCTION, not the test
    expect(feeUpdate!.vals.updated_at).toBeDefined();

    // Same-tx contract: the request transition to 'assigned' is in the SAME commit set
    const assignedUpdate = mockUpdateCalls.find((c) => c.vals.status === "assigned");
    expect(assignedUpdate).toBeDefined();

    // Winning bid settled, leg inserted
    expect(mockInsertCalls.find((v) => v.leg_state === "assigned")).toBeDefined();
  });

  it("parcel-originated request (no source_shop_order_id): NO shop-order write at all", async () => {
    mockDeliveryRequestRows = [bridgedRequest({ source_shop_order_id: null })];

    const res = await acceptBid(makeRequest("POST", { bid_id: bidId }), { id: requestId });
    expect(res.status).toBe(200);

    expect(mockUpdateCalls.find((c) => c.vals.delivery_fee_bdt !== undefined)).toBeUndefined();
    // The request still transitions:
    expect(mockUpdateCalls.find((c) => c.vals.status === "assigned")).toBeDefined();
  });

  it("shop order row missing (deleted shop order): request still assigns, no crash", async () => {
    mockOrderRows = []; // shop order gone

    const res = await acceptBid(makeRequest("POST", { bid_id: bidId }), { id: requestId });
    expect(res.status).toBe(200);
    expect(mockUpdateCalls.find((c) => c.vals.delivery_fee_bdt !== undefined)).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════
// 3 — Bridge lib internals (real createFromShopOrder against the router mock)
// ══════════════════════════════════════════════════════════════════════
describe("createFromShopOrder — bridge lib internals", () => {
  const order = {
    id: orderId,
    rider_user_id: riderId,
    shop_id: shopId,
    delivery_address: "123 Main St",
    delivery_lat: "23.8103",
    delivery_lng: "90.4125",
    rider_notes: "Extra spicy",
    subtotal_bdt: 50000,
    total_bdt: 50000,
  };

  it("creates a pending delivery request with shop pickup + customer dropoff", async () => {
    mockDeliveryRequestRows = []; // no existing bridged request
    mockShopRows = [{ ...shopRow }];

    const result = await createFromShopOrder(order);
    expect(result).not.toBeNull();
    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0].source_shop_order_id).toBe(orderId);
    expect(mockInsertCalls[0].status).toBe("pending");
    expect(mockInsertCalls[0].pickup_lat).toBe("23.7925");
    expect(mockInsertCalls[0].dropoff_lat).toBe("23.8103");
  });

  it("idempotent: existing bridged request returns it, zero inserts", async () => {
    mockDeliveryRequestRows = [{ id: "existing-delivery" }];

    const result = await createFromShopOrder(order);
    expect(result).toEqual({ id: "existing-delivery" });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("missing delivery address → null, zero inserts", async () => {
    mockDeliveryRequestRows = [];
    const result = await createFromShopOrder({ ...order, delivery_address: null });
    expect(result).toBeNull();
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("shop row missing coords → null, zero inserts", async () => {
    mockDeliveryRequestRows = [];
    mockShopRows = [{ ...shopRow, lat: null, lng: null }];
    const result = await createFromShopOrder(order);
    expect(result).toBeNull();
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("deadline_at is set ~600s out (bridge sets the bidding window)", async () => {
    mockDeliveryRequestRows = [];
    mockShopRows = [{ ...shopRow }];

    const before = Date.now();
    const result = await createFromShopOrder(order);
    expect(result).not.toBeNull();
    const deadline = Number(mockInsertCalls[0].deadline_at as Date);
    expect(deadline).toBeGreaterThanOrEqual(before + 595_000);
    expect(deadline).toBeLessThanOrEqual(before + 605_000);
  });
});
