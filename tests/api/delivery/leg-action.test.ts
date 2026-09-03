// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/rental/security-fix.test.ts).
/**
 * A4 (+B5) and B3 — Delivery marketplace remediation tests.
 * A4 (audit #4/#29/#16): leg action runs leg + completed_count + request
 * writes in ONE tx behind a FOR UPDATE lock with conditional WHEREs; suspended
 * couriers are rejected.
 * B3 (audit #14): courier type must match the request's derived category;
 * parcel requests with required_vehicle_type demand a matching vehicle_type.
 */
import { jest } from "@jest/globals";
import { POST as legAction } from "@/app/api/delivery/legs/[id]/action+api";
import { POST as submitBid } from "@/app/api/delivery/bids+api";

// ── Mock state (mock* prefix required for jest.mock factory access) ──────
const legUuid = "00000000-0000-4000-8000-0000000000b1";
const requestUuid = "00000000-0000-4000-8000-0000000000b2";
const courierUserId = "00000000-0000-4000-8000-0000000000b3";
const otherCourierUuid = "00000000-0000-4000-8000-0000000000b4";

let mockLegRows: Record<string, unknown>[] = [];
let mockCourierRows: Record<string, unknown>[] = [];
let mockDeliveryRequestRows: Record<string, unknown>[] = [];
let mockBidRequestRows: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockUpdateRowsQueue: unknown[][] = []; // per-update-call override (shifted in order)
let mockCourierType: "food" | "parcel" = "food";
let mockRequireCourierThrows = false;

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    legs: schema.deliveryLegs,
    couriers: schema.couriers,
    deliveryRequests: schema.deliveryRequests,
    deliveryBidsRequests: schema.deliveryRequests,
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
    if (t === T.legs) return mockLegRows;
    if (t === T.couriers) return mockCourierRows;
    if (t === T.deliveryRequests) {
      // legs/action reads the live request table; bids+api reads the bid
      // target request — same table object, so both keyed mocks are merged
      // by which queue the test populated.
      return [...mockDeliveryRequestRows, ...mockBidRequestRows];
    }
    return [];
  };

  const makeSelect = () => () => ({ from: (t: unknown) => ({ where: () => chainable(resolveRows(t)) }) });

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

jest.mock("@/lib/marketplaceRbac", () => ({
  requireCourier:
    (_type: "food" | "parcel") =>
    async () => {
      if (mockRequireCourierThrows) {
        throw Object.assign(new Error("courier_required"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-courier" },
        dbUser: { id: courierUserId, role: "driver" },
        courier: { id: "c1", courier_type: mockCourierType, status: "active" },
        driver: null,
      };
    },
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

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  mockLegRows = [];
  mockCourierRows = [];
  mockDeliveryRequestRows = [];
  mockBidRequestRows = [];
  mockInsertCalls = [];
  mockUpdateCalls = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockUpdateRowsQueue = [];
  mockCourierType = "food";
  mockRequireCourierThrows = false;
});

// ══════════════════════════════════════════════════════════════════════
// A4 — POST /api/delivery/legs/[id]/action
// ══════════════════════════════════════════════════════════════════════
describe("A4 — POST /api/delivery/legs/[id]/action", () => {
  const deliverBody = { action: "deliver", pod_url: "https://pod.example.com/x.jpg" };

  it("deliver: leg + completed_count + request all written in the single tx-run", async () => {
    mockLegRows = [
      { id: legUuid, request_id: requestUuid, courier_user_id: courierUserId, leg_state: "picked_up" },
    ];
    mockCourierRows = [{ status: "active" }];
    mockDeliveryRequestRows = [{ id: requestUuid, status: "picked_up" }];

    const res = await legAction(makeRequest("POST", deliverBody), { id: legUuid });
    expect(res.status).toBe(200);

    const legUpdate = mockUpdateCalls.find((c) => c.vals.leg_state === "delivered");
    expect(legUpdate).toBeDefined();
    const counterUpdate = mockUpdateCalls.find((c) => typeof c.vals.completed_count === "object");
    expect(counterUpdate).toBeDefined();
    const requestUpdate = mockUpdateCalls.find((c) => c.vals.status === "delivered");
    expect(requestUpdate).toBeDefined();
    // All three writes share one mocked-tx commit set — 3 update calls total
    expect(mockUpdateCalls).toHaveLength(3);
  });

  it("request update matches 0 rows (racing transition) → 409 concurrent_transition", async () => {
    mockLegRows = [
      { id: legUuid, request_id: requestUuid, courier_user_id: courierUserId, leg_state: "picked_up" },
    ];
    mockCourierRows = [{ status: "active" }];
    mockDeliveryRequestRows = [{ id: requestUuid, status: "picked_up" }];
    mockUpdateRowsQueue = [[{ id: "leg" }], [{ id: "courier" }], []]; // leg ok, counter ok, request 0 rows — tx rolls back

    const res = await legAction(makeRequest("POST", deliverBody), { id: legUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("concurrent_transition");

    // The conditional request WHERE pins the valid source statuses
    const requestUpdate = mockUpdateCalls.find((c) => c.vals.status === "delivered");
    expect(requestUpdate).toBeDefined();
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(requestUpdate!.whereArgs[0]);
    expect(rendered.params).toEqual(
      expect.arrayContaining([requestUuid, "picked_up", "in_transit"]),
    );
  });

  it("action from a delivered leg → 409 invalid_transition, zero writes", async () => {
    mockLegRows = [
      { id: legUuid, request_id: requestUuid, courier_user_id: courierUserId, leg_state: "delivered" },
    ];
    mockCourierRows = [{ status: "active" }];

    const res = await legAction(makeRequest("POST", deliverBody), { id: legUuid });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockUpdateCalls).toHaveLength(0);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("suspended courier → 403 courier_suspended, zero writes", async () => {
    mockLegRows = [
      { id: legUuid, request_id: requestUuid, courier_user_id: courierUserId, leg_state: "picked_up" },
    ];
    mockCourierRows = [{ status: "suspended" }];

    const res = await legAction(makeRequest("POST", deliverBody), { id: legUuid });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("courier_suspended");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("non-assignee courier → 403 forbidden, zero writes (existing behavior preserved)", async () => {
    mockLegRows = [
      { id: legUuid, request_id: requestUuid, courier_user_id: otherCourierUuid, leg_state: "picked_up" },
    ];
    mockCourierRows = [{ status: "active" }];

    const res = await legAction(makeRequest("POST", deliverBody), { id: legUuid });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("forbidden");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("fail without failure_reason → 400, zero writes", async () => {
    mockCourierRows = [{ status: "active" }];
    const res = await legAction(makeRequest("POST", { action: "fail" }), { id: legUuid });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("failure_reason_required");
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// B3 — POST /api/delivery/bids (courier-type ↔ category, vehicle match)
// ══════════════════════════════════════════════════════════════════════
describe("B3 — POST /api/delivery/bids", () => {
  const bidBody = {
    request_id: requestUuid,
    quoted_fee_bdt: 12000,
  };

  it("food courier on a parcel request → 403, zero writes", async () => {
    mockBidRequestRows = [
      { id: requestUuid, status: "pending", deadline_at: new Date(Date.now() + 600_000), source_shop_order_id: null, required_vehicle_type: null },
    ];
    mockCourierType = "food"; // held capability: food only
    mockRequireCourierThrows = true; // requireCourier('parcel') rejects — no active parcel row

    const res = await submitBid(makeRequest("POST", bidBody));
    expect(res.status).toBe(403);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("parcel courier on a food-sourced request → 403, zero writes", async () => {
    mockBidRequestRows = [
      { id: requestUuid, status: "pending", deadline_at: new Date(Date.now() + 600_000), source_shop_order_id: orderIdLike(), required_vehicle_type: null },
    ];
    mockCourierType = "parcel";
    mockRequireCourierThrows = true; // requireCourier('food') rejects — no active food row

    const res = await submitBid(makeRequest("POST", bidBody));
    expect(res.status).toBe(403);
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("defense-in-depth: guard passing a mismatched courier row → 403 courier_type_mismatch", async () => {
    mockBidRequestRows = [
      { id: requestUuid, status: "pending", deadline_at: new Date(Date.now() + 600_000), source_shop_order_id: null, required_vehicle_type: null },
    ];
    mockCourierType = "food"; // guard mock returns a FOOD row for a parcel request
    mockRequireCourierThrows = false; // simulate the guard passing anyway

    const res = await submitBid(makeRequest("POST", bidBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("courier_type_mismatch");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("parcel-on-parcel with mismatched vehicle_type → 400 vehicle_type_mismatch", async () => {
    mockBidRequestRows = [
      {
        id: requestUuid,
        status: "pending",
        deadline_at: new Date(Date.now() + 600_000),
        source_shop_order_id: null,
        required_vehicle_type: "bike",
      },
    ];
    mockCourierType = "parcel";

    const res = await submitBid(
      makeRequest("POST", { ...bidBody, vehicle_type: "car" }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("vehicle_type_mismatch");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("parcel-on-parcel with omitted vehicle_type when required → 400", async () => {
    mockBidRequestRows = [
      {
        id: requestUuid,
        status: "pending",
        deadline_at: new Date(Date.now() + 600_000),
        source_shop_order_id: null,
        required_vehicle_type: "bike",
      },
    ];
    mockCourierType = "parcel";

    const res = await submitBid(makeRequest("POST", bidBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("vehicle_type_mismatch");
    expect(mockInsertCalls).toHaveLength(0);
  });

  it("matched submission → 201 (existing behavior preserved)", async () => {
    mockBidRequestRows = [
      {
        id: requestUuid,
        status: "pending",
        deadline_at: new Date(Date.now() + 600_000),
        source_shop_order_id: null,
        required_vehicle_type: "bike",
      },
    ];
    mockCourierType = "parcel";

    const res = await submitBid(
      makeRequest("POST", { ...bidBody, vehicle_type: "bike" }),
    );
    expect(res.status).toBe(201);
    expect(mockInsertCalls).toHaveLength(1);
    expect(mockInsertCalls[0].vehicle_type).toBe("bike");
  });
});

function orderIdLike() {
  return "00000000-0000-4000-8000-0000000000b5";
}
