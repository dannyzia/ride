/**
 * P2P parcel origination (plan 27 §6.1) — the SAME universal-legs flow,
 * originated by any role, never the retired bidding route.
 *
 * Pinned here:
 *   - POST /api/delivery/parcels: Zod boundary, sender binding
 *     (dropoff_user_id = caller), fee-tier snapshot passthrough, 201 shape,
 *     idempotent replay (same key → original outcome, one insert).
 *   - GET /api/delivery/parcels: sender-scoped parcel legs.
 *   - deliveryDispatchTick Arm 2b: a created parcel leg (no shop order to
 *     join) advances; with an empty pool it exhausts → failed + the SENDER
 *     gets the `delivery:status` push (exhaustDeliveryLeg non-shop branch).
 *   - Offer accept on a parcel leg notifies the sender (courier_assigned).
 *   - Courier pickup/deliver on a parcel leg: no F-11 code gate, photo +
 *     collection gates hold, sender notified, earnings settle without a
 *     remittance due.
 *
 * DB is queue-scripted (house pattern); the SUTs are the route logic and
 * the tick wiring, never the transports.
 */
import { jest } from "@jest/globals";
// SUT imports sit ABOVE the jest.mock block: babel hoists the mocks, so
// this order is runtime-safe and keeps import/first clean (house pattern).
import { POST as parcelsPost, GET as parcelsGet } from "@/app/api/delivery/parcels+api";
import { deliveryDispatchTick } from "@/lib/deliveryDispatch";
import { POST as respondPost } from "@/app/api/delivery/offers/[id]/respond+api";
import { POST as legActionPost } from "@/app/api/delivery/active/[id]/action+api";

// ─── Mock state (mock* prefix required for jest.mock factory access) ────────
let mockSelectQueue: (() => unknown[])[];
let mockInsertCalls: unknown[];
let mockAuthUser: { id: string; role: string } | null;
let mockAgentUserId: string;
let mockQuote: { fee_bdt: number; distance_km: number; tier: string };
let mockClaim: { kind: string; response?: Response };
let mockSent: unknown[];
let mockSettleDeliveryLegCalls: unknown[][];

function mockChainable(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const self = () => c;
  c.where = jest.fn(self);
  c.limit = jest.fn(self);
  c.offset = jest.fn(self);
  c.orderBy = jest.fn(self);
  c.for = jest.fn(self);
  c.innerJoin = jest.fn(self);
  c.leftJoin = jest.fn(self);
  c.returning = jest.fn(async () => rows);
  c.then = (resolve: (v: unknown) => unknown) => resolve(rows);
  return c;
}

jest.mock("@/src/db", () => {
  const select = jest.fn(() => ({
    from: jest.fn(() => {
      const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
      return mockChainable(rows);
    }),
  }));
  // The tick's shop-fresh arm joins shopOrders — same queue, scripted order.
  return {
    db: {
      select,
      update: jest.fn(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: "w-1" }]) })),
          returning: jest.fn(async () => [{ id: "w-1" }]),
        })),
      })),
      insert: jest.fn(() => ({
        values: jest.fn((vals: unknown) => {
          mockInsertCalls.push(vals);
          return { returning: jest.fn(async () => [{ id: "leg-1" }]) };
        }),
      })),
      transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
        fn({
          select,
          update: jest.fn(() => ({
            set: jest.fn(() => ({
              where: jest.fn(() => ({ returning: jest.fn(async () => [{ id: "w-1" }]) })),
              returning: jest.fn(async () => [{ id: "w-1" }]),
            })),
          })),
          insert: jest.fn(() => ({
            values: jest.fn((vals: unknown) => {
              mockInsertCalls.push(vals);
              return { returning: jest.fn(async () => [{ id: "leg-1" }]) };
            }),
          })),
        }),
      ),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireAnyRole: jest.fn(() => async () => {
    if (!mockAuthUser) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return { supabaseUser: {}, dbUser: mockAuthUser };
  }),
  requireMemberRoles: jest.fn(() => async () => {
    if (!mockAuthUser) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return { supabaseUser: {}, dbUser: mockAuthUser };
  }),
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireDeliveryAgent: jest.fn(async () => ({
    kind: "courier",
    courier: { id: "courier-1" },
    dbUser: { id: mockAgentUserId },
  })),
  requireShopMember: jest.fn(() => async () => {
    throw Object.assign(new Error("forbidden"), { status: 403 });
  }),
}));

jest.mock("@/lib/shopDeliveryFee", () => {
  const actual = jest.requireActual("@/lib/shopDeliveryFee") as Record<string, unknown>;
  return { ...actual, quoteDeliveryFee: jest.fn(async () => mockQuote) };
});

jest.mock("@/lib/idempotency", () => ({
  IDEMPOTENCY_ROUTES: { parcelCreate: "/api/delivery/parcels" },
  extractIdempotencyKey: jest.fn((request: Request) => request.headers.get("Idempotency-Key")),
  sha256Fingerprint: jest.fn(() => "fp"),
  beginIdempotencyClaim: jest.fn(async () => mockClaim),
  storeIdempotencyOutcome: jest.fn(async () => undefined),
  driverErrorCode: jest.fn(() => undefined),
}));

jest.mock("@/lib/platformConfig", () => ({
  requireConfigInt: jest.fn(async (key: string) =>
    key === "delivery_max_suggestions" ? 3 : key === "delivery_offer_window_seconds" ? 45 : 0,
  ),
}));

jest.mock("@/lib/deliverySettlement", () => ({
  couriersOnDispatchHold: jest.fn(async () => new Set()),
  courierDebtHoldsDispatch: jest.fn(async () => false),
  settleDeliveryLeg: jest.fn(async (...args: unknown[]) => {
    mockSettleDeliveryLegCalls.push(args);
    return { earned_bdt: 8000, commission_bdt: 0, due_bdt: 0 };
  }),
}));

jest.mock("@/lib/shopLedger", () => ({
  settleShopOrder: jest.fn(async () => null),
  reverseShopOrder: jest.fn(async () => null),
}));

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
  sendNotifications: jest.fn(async (reqs: unknown[]) => {
    mockSent.push(...reqs);
    return reqs.map(() => ({ sent: 1, failed: 0 }));
  }),
}));

jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));
jest.mock("@/lib/shopNotify", () => ({
  notifyCustomerOrderStatus: jest.fn(),
  notifyCustomerPartialAccept: jest.fn(),
  notifyShopNewOrder: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const LEG = "00000000-0000-4000-8000-0000000000c1";

function parcelBody(over: Record<string, unknown> = {}) {
  return {
    pickup_address: "House 12, Road 5, Dhanmondi",
    pickup_lat: 23.81,
    pickup_lng: 90.41,
    dropoff_address: "House 3, Road 11, Banani",
    dropoff_lat: 23.79,
    dropoff_lng: 90.4,
    item_note: "Birthday cake — keep flat",
    receiver_phone: "+8801812345678",
    ...over,
  };
}

function postReq(body: unknown, key?: string) {
  return new Request("http://test/api/delivery/parcels", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer t",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSelectQueue = [];
  mockInsertCalls = [];
  mockAuthUser = { id: "sender-1", role: "rider" };
  mockAgentUserId = "courier-1";
  mockQuote = { fee_bdt: 8000, distance_km: 2.1, tier: "within" };
  mockClaim = { kind: "execute" };
  mockSent = [];
  mockSettleDeliveryLegCalls = [];
});

// ─── POST /api/delivery/parcels ─────────────────────────────────────────────
describe("POST /api/delivery/parcels (P2P origination)", () => {
  it("201 mints a parcel leg bound to the sender with the snapshot fee", async () => {
    const res = await parcelsPost(postReq(parcelBody()));
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("created");
    expect(body.delivery_fee_bdt).toBe(8000);
    expect(body.fee_tier).toBe("within");
    expect(typeof body.parcel_id).toBe("string");
    expect(typeof body.leg_id).toBe("string");
    expect(mockInsertCalls).toHaveLength(1);
    const vals = mockInsertCalls[0] as Record<string, unknown>;
    expect(vals).toMatchObject({
      source_vertical: "parcel",
      order_id: body.parcel_id,
      pickup_shop_id: null,
      dropoff_user_id: "sender-1",
      delivery_fee_bdt: 8000,
      status: "created",
      item_note: "Birthday cake — keep flat",
      receiver_phone: "+8801812345678",
    });
  });

  it("400 when the item note is missing (courier must know the cargo)", async () => {
    const res = await parcelsPost(postReq(parcelBody({ item_note: "" })));
    expect(res.status).toBe(400);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("400 when the receiver phone is missing (handover contact)", async () => {
    const res = await parcelsPost(postReq(parcelBody({ receiver_phone: "" })));
    expect(res.status).toBe(400);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("beyond-tier distance snapshots the beyond fee", async () => {
    mockQuote = { fee_bdt: 12000, distance_km: 8.4, tier: "beyond" };
    const res = await parcelsPost(postReq(parcelBody()));
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(201);
    expect(body.delivery_fee_bdt).toBe(12000);
    expect(body.fee_tier).toBe("beyond");
  });

  it("401 without a session — origination is authenticated, any customer role", async () => {
    mockAuthUser = null;
    const res = await parcelsPost(postReq(parcelBody()));
    expect(res.status).toBe(401);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("idempotent replay: same key returns the original outcome, one insert", async () => {
    const original = Response.json({ parcel_id: "p-1", leg_id: "l-1" }, { status: 201 });
    // First call executes…
    const first = await parcelsPost(postReq(parcelBody(), "key-9"));
    expect(first.status).toBe(201);
    expect(mockInsertCalls).toHaveLength(1);
    // …second call with the same key replays without re-entering.
    mockClaim = { kind: "replay", response: original };
    const second = await parcelsPost(postReq(parcelBody(), "key-9"));
    expect(second.status).toBe(201);
    expect(await second.json()).toEqual({ parcel_id: "p-1", leg_id: "l-1" });
    expect(mockInsertCalls).toHaveLength(1);
  });
});

// ─── GET /api/delivery/parcels ──────────────────────────────────────────────
describe("GET /api/delivery/parcels (sender history)", () => {
  it("returns the caller's parcel legs", async () => {
    mockSelectQueue.push(() => [
      { leg_id: "leg-1", parcel_id: "p-1", status: "accepted", delivery_fee_bdt: 8000 },
    ]);
    const res = await parcelsGet(
      new Request("http://test/api/delivery/parcels", {
        headers: { Authorization: "Bearer t" },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { parcels: unknown[] };
    expect(body.parcels).toHaveLength(1);
  });
});

// ─── Tick Arm 2b ────────────────────────────────────────────────────────────
describe("deliveryDispatchTick Arm 2b (parcel legs dispatch without a shop join)", () => {
  // Queue order issued by the tick + advance + exhaust for ONE parcel leg
  // with an empty candidate pool: stale, shop-fresh, parcel-fresh, leg row
  // (advance), couriers, drivers, leg row (exhaust), shopOrders miss.
  const legRow = {
    id: LEG,
    order_id: "parcel-uuid-1",
    status: "created",
    offer_attempts: 0,
    tried_claimer_ids: [],
    pickup_lat: "23.81",
    pickup_lng: "90.41",
    offer_expires_at: null,
    dropoff_user_id: "sender-1",
    delivery_man_user_id: null,
  };

  it("created parcel leg advances; empty pool exhausts → failed + sender push", async () => {
    mockSelectQueue.push(() => []); // Arm 1: no stale offers
    mockSelectQueue.push(() => []); // Arm 2: no shop fresh legs
    mockSelectQueue.push(() => [{ id: LEG }]); // Arm 2b: one parcel fresh leg
    mockSelectQueue.push(() => [legRow]); // advance: locked leg row
    mockSelectQueue.push(() => []); // rank: no couriers
    mockSelectQueue.push(() => []); // rank: no drivers → empty pool
    mockSelectQueue.push(() => [{ ...legRow, offer_attempts: 1 }]); // exhaust: re-read
    mockSelectQueue.push(() => []); // exhaust: no shop order (parcel uuid)

    const { advanced, exhausted } = await deliveryDispatchTick();
    expect(advanced).toBe(0);
    expect(exhausted).toBe(1);
    const failed = mockSent.filter(
      (n) => (n as { idempotencyKey?: string }).idempotencyKey === `delivery_status:${LEG}:failed`,
    );
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      userId: "sender-1",
      type: "delivery:status",
      title: "Delivery could not be assigned",
    });
  });

  it("no parcel legs → tick is quiet (no sender push, nothing exhausted)", async () => {
    mockSelectQueue.push(() => []);
    mockSelectQueue.push(() => []);
    mockSelectQueue.push(() => []);
    const { advanced, exhausted } = await deliveryDispatchTick();
    expect(advanced).toBe(0);
    expect(exhausted).toBe(0);
    expect(mockSent).toHaveLength(0);
  });
});

// ─── Offer accept on a parcel leg ───────────────────────────────────────────
describe("POST /api/delivery/offers/[id]/respond on a parcel leg", () => {
  const offeredLeg = {
    id: LEG,
    status: "offered",
    offered_to_user_id: "courier-1",
    offer_expires_at: new Date(Date.now() + 30_000),
    source_vertical: "parcel",
    order_id: "parcel-uuid-1",
    dropoff_user_id: "sender-1",
    delivery_man_user_id: null,
  };

  function acceptReq() {
    return new Request(`http://test/api/delivery/offers/${LEG}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ decision: "accept" }),
    });
  }

  it("accept notifies the SENDER (courier_assigned), no shop writes", async () => {
    mockSelectQueue.push(() => [offeredLeg]); // locked leg
    mockSelectQueue.push(() => []); // no shop order (parcel uuid)
    const res = await respondPost(acceptReq(), { id: LEG });
    expect(res.status).toBe(200);
    const assigned = mockSent.filter(
      (n) => (n as { idempotencyKey?: string }).idempotencyKey === `delivery_status:${LEG}:courier_assigned`,
    );
    expect(assigned).toHaveLength(1);
    expect(assigned[0]).toMatchObject({
      userId: "sender-1",
      type: "delivery:status",
      title: "Courier assigned",
    });
  });
});

// ─── Courier pickup/deliver on a parcel leg ─────────────────────────────────
describe("POST /api/delivery/active/[id]/action on a parcel leg", () => {
  const acceptedLeg = {
    id: LEG,
    status: "accepted",
    source_vertical: "parcel",
    order_id: "parcel-uuid-1",
    dropoff_user_id: "sender-1",
    delivery_man_user_id: "courier-1",
    pickup_code: null,
    delivery_otp: null,
    proof_photo_url: null,
    amount_collected_bdt: null,
  };

  function actionReq(action: string, extra: Record<string, unknown> = {}) {
    return new Request(`http://test/api/delivery/active/${LEG}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
      body: JSON.stringify({ action, ...extra }),
    });
  }

  it("pickup needs NO code on a parcel leg; sender gets picked_up", async () => {
    mockSelectQueue.push(() => [acceptedLeg]); // locked leg
    mockSelectQueue.push(() => []); // no shop order
    const res = await legActionPost(actionReq("pickup"), { id: LEG });
    expect(res.status).toBe(200);
    const pushed = mockSent.filter(
      (n) => (n as { idempotencyKey?: string }).idempotencyKey === `delivery_status:${LEG}:picked_up`,
    );
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ userId: "sender-1", type: "delivery:status" });
  });

  it("deliver requires a proof photo on a parcel leg (no OTP machinery)", async () => {
    mockSelectQueue.push(() => [{ ...acceptedLeg, status: "picked_up" }]);
    mockSelectQueue.push(() => []);
    const res = await legActionPost(
      actionReq("deliver", { amount_collected_bdt: 8000 }),
      { id: LEG },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "delivery_proof_required" });
  });

  it("deliver with photo + collection settles earnings (no due) + notifies sender", async () => {
    mockSelectQueue.push(() => [{ ...acceptedLeg, status: "picked_up" }]);
    mockSelectQueue.push(() => []);
    const res = await legActionPost(
      actionReq("deliver", {
        proof_photo_url: "https://cdn.example/p.jpg",
        amount_collected_bdt: 8000,
      }),
      { id: LEG },
    );
    expect(res.status).toBe(200);
    // Earnings settle with the parcel consignment uuid as orderId…
    expect(mockSettleDeliveryLegCalls).toHaveLength(1);
    expect(mockSettleDeliveryLegCalls[0][1]).toMatchObject({
      legId: LEG,
      orderId: "parcel-uuid-1",
      courierUserId: "courier-1",
    });
    // …and the sender closes the loop.
    const pushed = mockSent.filter(
      (n) => (n as { idempotencyKey?: string }).idempotencyKey === `delivery_status:${LEG}:delivered`,
    );
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ userId: "sender-1", title: "Parcel delivered" });
  });
});
