// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * Shop-order → delivery-leg contract (plan 27 §6.1 — S4 rework).
 *
 * Owns three contracts (partition: mark-ready emits + status PATCH → z2-emits.test.ts;
 * mark-ready transition matrix → tests/api/shop/order-transitions.test.ts):
 *
 *   1. Placement leg matrix (§6.1 step 1 + R8): the universal `deliveries`
 *      leg is created in the SAME tx as `POST /api/shop/orders` for every
 *      DELIVERY order — any category (food_order / shop_order / workshop_product).
 *      Pickup orders carry no leg and no fee. Leg unavailable → 409
 *      delivery_leg_unavailable (full rollback, never an order without its leg).
 *   2. F40 fee recompute (accept-bid): accepting a courier bid on a bridged food order
 *      writes delivery_fee_bdt = bid.quoted_fee_bdt and total_bdt = subtotal_bdt + fee
 *      to the SHOP order in the SAME tx. Parcel-originated requests (no
 *      source_shop_order_id) never touch shop_orders.
 *   3. Bridge lib internals: the REAL createDeliveryLegFromOrder against the
 *      router-mock DB — idempotent on order_id, dropoff/pickup coord guards,
 *      §1 source_vertical mapping, §12 fee snapshot.
 *
 * RETIRED (S4): the RFQ bridge (delivery_requests insert fired at mark-ready
 * with a bidding window) died with the courier-bidding marketplace — the
 * trigger moved to order placement, the storage moved to `deliveries`.
 */

import { POST as ordersPost } from "@/app/api/shop/orders+api";
import { POST as acceptBid } from "@/app/api/delivery/requests/[id]/accept-bid+api";
import { createDeliveryLegFromOrder } from "@/lib/shopDeliveryBridge";
import { db } from "@/src/db";
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
let mockShopTypeRows: Record<string, unknown>[] = [];
let mockProductRows: Record<string, unknown>[] = [];
let mockDeliveryLegRows: Record<string, unknown>[] = [];
let mockVerticalEnabled = true;
let mockFeeQuote = { fee_bdt: 8000, distance_km: 1.2, tier: "within" };

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
    shopTypes: schema.shopTypes,
    products: schema.shopProducts,
    deliveries: schema.deliveries,
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
    if (t === T.shopTypes) return mockShopTypeRows;
    if (t === T.products) return mockProductRows;
    if (t === T.deliveries) return mockDeliveryLegRows;
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
  requireMemberRoles:
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

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => mockVerticalEnabled),
}));

// §12 seeds-not-constants: the quote lib is mocked here (its own real-lib
// coverage lives with the config seeds); the ORDER snapshots whatever this
// returns — that snapshot contract is what these tests pin.
jest.mock("@/lib/shopDeliveryFee", () => ({
  quoteDeliveryFee: jest.fn(async () => mockFeeQuote),
}));

// Bridge mock: 'passthrough' runs the REAL lib against the router-mock DB;
// 'null' forces the leg-unavailable outcome for handler-path tests (bridge lib
// internals have their own describe below running the real lib directly).
jest.mock("@/lib/shopDeliveryBridge", () => ({
  createDeliveryLegFromOrder: jest.fn(async (order: Record<string, unknown>, tx?: unknown) => {
    if (mockBridgeBehavior === "null") return null;
    // 'passthrough' (default) runs the REAL lib against the router-mock DB so the
    // handler test asserts the true tx-shared write path end-to-end.
    const real = jest.requireActual("@/lib/shopDeliveryBridge") as {
      createDeliveryLegFromOrder: (
        o: Record<string, unknown>,
        tx?: unknown,
      ) => Promise<{ id: string } | null>;
    };
    return real.createDeliveryLegFromOrder(order, tx);
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
  mockShopTypeRows = [];
  mockProductRows = [];
  mockDeliveryLegRows = [];
  mockVerticalEnabled = true;
  mockFeeQuote = { fee_bdt: 8000, distance_km: 1.2, tier: "within" };
  (notifyWs as jest.Mock).mockClear();
  (createDeliveryLegFromOrder as jest.Mock).mockClear();
});

// ══════════════════════════════════════════════════════════════════════
// 1 — Leg matrix at ORDER PLACEMENT through the REAL POST handler (§6.1 step 1)
// ══════════════════════════════════════════════════════════════════════
describe("orders POST leg matrix — real handler (§6.1 step 1)", () => {
  const typeUuid = "00000000-0000-4000-8000-0000000000b0";
  const product = {
    id: "00000000-0000-4000-8000-0000000000b1",
    shop_id: shopId,
    name: "Red rice 5kg",
    price_bdt: 25000,
    stock: 10,
    is_active: true,
    deleted_at: null,
  };
  const openShop = {
    id: shopId,
    is_open: true,
    address_line: "12 Gulshan Ave",
    lat: "23.7925",
    lng: "90.4078",
    shop_type_id: null,
  };

  const orderBody = (over: Record<string, unknown> = {}) => ({
    shop_id: shopId,
    items: [{ product_id: product.id, quantity: 2 }],
    fulfillment: "delivery",
    delivery_address: "123 Main St",
    delivery_lat: 23.8103,
    delivery_lng: 90.4125,
    ...over,
  });

  const post = (body: Record<string, unknown>) =>
    ordersPost(
      new Request("http://localhost/api/shop/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  /** The leg insert (the only insert carrying §1 source_vertical). */
  const legInsert = () => mockInsertCalls.find((v) => v.source_vertical !== undefined);
  /** The shop-order insert (the only one carrying subtotal_bdt). */
  const orderInsert = () => mockInsertCalls.find((v) => v.subtotal_bdt !== undefined);

  beforeEach(() => {
    mockShopRows = [{ ...openShop }];
    mockProductRows = [{ ...product }];
    mockShopTypeRows = [];
    mockDeliveryLegRows = [];
    mockOrderRows = [];
    mockVerticalEnabled = true;
    mockFeeQuote = { fee_bdt: 8000, distance_km: 1.2, tier: "within" };
  });

  it("delivery order → leg created in the placement tx: shop pickup + customer dropoff + fee snapshot", async () => {
    const res = await post(orderBody());
    expect(res.status).toBe(201);
    const json = await res.json();
    // §12: server-quoted fee + COD total are the response authority
    expect(json.delivery_fee_bdt).toBe(8000);
    expect(json.total_bdt).toBe(50000 + 8000); // subtotal 2×25000 + fee

    const leg = legInsert();
    expect(leg).toBeDefined();
    expect(leg.source_vertical).toBe("shop_order"); // shop_type_id null → non-restaurant
    expect(leg.order_id).toBe("generated-uuid"); // mock-generated order id
    // A5 regression: pickup = shop coords, dropoff = customer coords
    expect(leg.pickup_address).toBe("12 Gulshan Ave");
    expect(leg.pickup_lat).toBe("23.7925");
    expect(leg.pickup_lat).not.toBe("23.8103");
    expect(leg.dropoff_lat).toBe("23.8103");
    expect(leg.dropoff_user_id).toBe(riderId);
    expect(leg.delivery_fee_bdt).toBe(8000); // §12 snapshot carried to the leg
    expect(leg.status).toBe("created"); // §6.1: offers take it from there

    // the ORDER row carries the same snapshot (R-A9)
    const orderRowInsert = orderInsert();
    expect(orderRowInsert.delivery_fee_bdt).toBe(8000);
    expect(orderRowInsert.total_bdt).toBe(58000);
    expect(orderRowInsert.category).toBe("general");
  });

  it("restaurant shop → source_vertical food_order (data-driven from shop_types)", async () => {
    mockShopTypeRows = [{ is_restaurant: true }];
    mockShopRows = [{ ...openShop, shop_type_id: typeUuid }];

    const res = await post(orderBody());
    expect(res.status).toBe(201);
    expect(legInsert().source_vertical).toBe("food_order");
    expect(orderInsert().category).toBe("food");
  });

  it("pickup order → NO leg, NO fee (fee quote never runs)", async () => {
    const res = await post(orderBody({ fulfillment: "pickup" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.delivery_fee_bdt).toBeNull();
    expect(json.total_bdt).toBe(50000);
    expect(legInsert()).toBeUndefined();
    expect(orderInsert().delivery_fee_bdt).toBeNull();
  });

  it("leg unavailable (bridge returns null) → 409 delivery_leg_unavailable", async () => {
    mockBridgeBehavior = "null";

    const res = await post(orderBody());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("delivery_leg_unavailable");
  });

  it("shop closed → 409 BEFORE any insert (R5 server-side rejection)", async () => {
    mockShopRows = [{ ...openShop, is_open: false }];

    const res = await post(orderBody());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("shop_closed");
    expect(mockInsertCalls).toHaveLength(0);
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
// 3 — Bridge lib internals (real createDeliveryLegFromOrder against the router mock)
// ══════════════════════════════════════════════════════════════════════
describe("createDeliveryLegFromOrder — bridge lib internals", () => {
  const order = {
    id: orderId,
    rider_user_id: riderId,
    shop_id: shopId,
    order_kind: "catalog",
    category: "food",
    delivery_address: "123 Main St",
    delivery_lat: "23.8103",
    delivery_lng: "90.4125",
    delivery_fee_bdt: 8000,
  };

  beforeEach(() => {
    mockDeliveryLegRows = [];
    mockShopRows = [{ ...shopRow }];
  });

  // The bridge takes an EXPLICIT caller tx (no ambient db fallback) — the
  // mocked db shares the same table router, so it stands in as the tx.
  const asTx = db as never;

  it("creates a 'created' leg with shop pickup + customer dropoff + fee snapshot", async () => {
    const result = await createDeliveryLegFromOrder(order, asTx);
    expect(result).not.toBeNull();
    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0].source_vertical).toBe("food_order");
    expect(mockInsertCalls[0].status).toBe("created");
    expect(mockInsertCalls[0].pickup_address).toBe("12 Gulshan Ave");
    expect(mockInsertCalls[0].pickup_lat).toBe("23.7925");
    expect(mockInsertCalls[0].dropoff_lat).toBe("23.8103");
    expect(mockInsertCalls[0].dropoff_user_id).toBe(riderId);
    expect(mockInsertCalls[0].delivery_fee_bdt).toBe(8000);
  });

  it("idempotent on order_id: an existing leg returns it, zero inserts", async () => {
    mockDeliveryLegRows = [{ id: "existing-leg" }];

    const result = await createDeliveryLegFromOrder(order, asTx);
    expect(result).toEqual({ id: "existing-leg" });
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("missing dropoff coordinates → null, zero inserts", async () => {
    const result = await createDeliveryLegFromOrder({ ...order, delivery_lat: null }, asTx);
    expect(result).toBeNull();
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("shop row missing coords → null, zero inserts", async () => {
    mockShopRows = [{ ...shopRow, lat: null, lng: null }];
    const result = await createDeliveryLegFromOrder(order, asTx);
    expect(result).toBeNull();
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("workshop service job maps to source_vertical workshop_product (§1)", async () => {
    const result = await createDeliveryLegFromOrder(
      {
        ...order,
        order_kind: "service_booking",
        category: "general",
      },
      asTx,
    );
    expect(result).not.toBeNull();
    expect(mockInsertCalls[0].source_vertical).toBe("workshop_product");
  });
});
