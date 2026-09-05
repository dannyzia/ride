// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * Z1 — Shop RFQ action endpoints (spec v1 §B.6/§C.1 via the execution order
 * .kilo/plans/marketplace-finalize-round.md §1).
 *
 * Four actions over shop_rfq_status: quote (open/quoted→quoted), decline
 * (open/quoted→declined), accept (quoted→awarded — DB enum has no 'accepted';
 * divergence flagged to the orchestrator), cancel (open/quoted→cancelled).
 *
 * Every action: UUID guard, FOR UPDATE lock, pre-state re-check, conditional
 * UPDATE (0 rows ⇒ 409), R3 discipline carried forward.
 */
import { jest } from "@jest/globals";

let mockRfqRows: Record<string, unknown>[] = [];
let mockUpdateRows: Record<string, unknown>[] = [{ id: "generated-uuid" }];
let mockUpdateCalls: { vals: Record<string, unknown>; whereArgs: unknown[] }[] = [];
let mockShopAuthOk = true;
let mockRiderAuthUser: { id: string; role: string } = { id: "rfq-rider-1", role: "rider" };

const RFQ_ID = "00000000-0000-4000-8000-0000000000f1";
const SHOP_ID = "00000000-0000-4000-8000-0000000000f2";

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.offset = () => c;
    c.orderBy = () => c;
    c.for = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const makeSelect = () => () => ({
    from: (t: unknown) => ({
      where: () => chainable(t === schema.shopRfqs ? mockRfqRows : []),
    }),
  });

  const makeUpdate = () => () => ({
    set: (vals: Record<string, unknown>) => ({
      where: (...whereArgs: unknown[]) => {
        mockUpdateCalls.push({ vals, whereArgs });
        return { returning: async () => mockUpdateRows };
      },
    }),
  });

  const makeDb = () => ({
    select: makeSelect(),
    update: makeUpdate(),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({ returning: async () => [{ id: "gen-uuid" }] })),
    })),
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
  requireShopMember:
    (_shopId: string, _roles?: readonly string[]) =>
    async () => {
      if (!mockShopAuthOk) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-staff" },
        dbUser: { id: "db-staff-1", role: "driver" },
        membership: { id: "sm-1", shop_id: _shopId, role: "OWNER" },
      };
    },
}));

jest.mock("@/lib/auth", () => ({
  requireAnyRole:
    (_roles: readonly string[]) =>
    async () => ({
      supabaseUser: { id: "auth-rider" },
      dbUser: mockRiderAuthUser,
    }),
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => true),
  getConfigInt: async (_key: string, fallback: number) => fallback,
}));

function makeRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/test", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function rfqRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RFQ_ID,
    shop_id: SHOP_ID,
    rider_user_id: "rfq-rider-1",
    status: "open",
    title: "Cake for 40 people",
    quoted_price_bdt: null,
    quoted_notes: null,
    quoted_at: null,
    awarded_at: null,
    cancelled_at: null,
    cancel_reason: null,
    ...overrides,
  };
}

import { PATCH as quoteRfq } from "@/app/api/shop/rfq/[id]/quote+api";
import { POST as declineRfq } from "@/app/api/shop/rfq/[id]/decline+api";
import { POST as acceptRfq } from "@/app/api/shop/rfq/[id]/accept+api";
import { POST as cancelRfq } from "@/app/api/shop/rfq/[id]/cancel+api";

beforeEach(() => {
  mockRfqRows = [];
  mockUpdateRows = [{ id: "generated-uuid" }];
  mockUpdateCalls = [];
  mockShopAuthOk = true;
  mockRiderAuthUser = { id: "rfq-rider-1", role: "rider" };
});

describe("Z1 — quote (PATCH, shop staff)", () => {
  it("open → quoted with the quote stamped (200 + returned rfq)", async () => {
    mockRfqRows = [rfqRow({ status: "open" })];
    mockUpdateRows = [rfqRow({ status: "quoted", quoted_price_bdt: 450000, quoted_notes: "fondant included" })];

    const res = await quoteRfq(
      makeRequest("PATCH", { quoted_price_bdt: 450000, quoted_notes: "fondant included" }),
      { id: RFQ_ID },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rfq.status).toBe("quoted");
    expect(json.rfq.quoted_price_bdt).toBe(450000);

    const update = mockUpdateCalls.find((c) => c.vals.status === "quoted");
    expect(update).toBeDefined();
    expect(update!.vals.quoted_at).toEqual(expect.any(Date));
    // predicate: WHERE pins the quotable states (open/quoted)
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(update!.whereArgs[0]);
    expect(rendered.params).toEqual(expect.arrayContaining([RFQ_ID, "open", "quoted"]));
  });

  it("awarded RFQ cannot be quoted → 409 invalid_transition, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "awarded" })];

    const res = await quoteRfq(makeRequest("PATCH", { quoted_price_bdt: 1 }), { id: RFQ_ID });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("invalid_transition");
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("non-shop-member → 403 before any write", async () => {
    mockRfqRows = [rfqRow({ status: "open" })];
    mockShopAuthOk = false;

    const res = await quoteRfq(makeRequest("PATCH", { quoted_price_bdt: 1 }), { id: RFQ_ID });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("garbage id → 400 invalid_uuid", async () => {
    const res = await quoteRfq(makeRequest("PATCH", { quoted_price_bdt: 1 }), { id: "nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_uuid");
  });
});

describe("Z1 — decline (POST, shop staff)", () => {
  it("quoted → declined (200)", async () => {
    mockRfqRows = [rfqRow({ status: "quoted", quoted_price_bdt: 450000 })];
    mockUpdateRows = [rfqRow({ status: "declined" })];

    const res = await declineRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(200);
    expect((await res.json()).rfq.status).toBe("declined");
  });

  it("awarded RFQ cannot be declined → 409, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "awarded" })];

    const res = await declineRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(409);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

describe("Z1 — accept (POST, rfq owner)", () => {
  it("quoted → awarded with awarded_at stamped (200)", async () => {
    mockRfqRows = [rfqRow({ status: "quoted", quoted_price_bdt: 450000 })];
    mockUpdateRows = [rfqRow({ status: "awarded", awarded_at: new Date() })];

    const res = await acceptRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(200);
    const json = await res.json();
    // DB enum authority: the state is 'awarded' (divergence vs the order's
    // 'accepted' recorded — the enum has no 'accepted' and migrations are
    // out of scope this round)
    expect(json.rfq.status).toBe("awarded");

    const update = mockUpdateCalls.find((c) => c.vals.status === "awarded");
    expect(update).toBeDefined();
    expect(update!.vals.awarded_at).toEqual(expect.any(Date));
    // predicate: WHERE pins status='quoted'
    const { PgDialect } = require("drizzle-orm/pg-core");
    const rendered = new PgDialect().sqlToQuery(update!.whereArgs[0]);
    expect(rendered.params).toContain("quoted");
  });

  it("open RFQ cannot be accepted (no quote yet) → 409, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "open" })];

    const res = await acceptRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(409);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("non-owner rider → 403, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "quoted" })];
    mockRiderAuthUser = { id: "someone-else", role: "rider" };

    const res = await acceptRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});

describe("Z1 — cancel (POST, owner or shop staff)", () => {
  it("owner cancels an open RFQ → cancelled with reason", async () => {
    mockRfqRows = [rfqRow({ status: "open" })];
    mockUpdateRows = [rfqRow({ status: "cancelled", cancel_reason: "changed plans" })];

    const res = await cancelRfq(
      makeRequest("POST", { cancel_reason: "changed plans" }),
      { id: RFQ_ID },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).rfq.status).toBe("cancelled");

    const update = mockUpdateCalls.find((c) => c.vals.status === "cancelled");
    expect(update).toBeDefined();
    expect(update!.vals.cancel_reason).toBe("changed plans");
  });

  it("shop staff can cancel too (staff auth path)", async () => {
    mockRfqRows = [rfqRow({ status: "quoted" })];
    mockRiderAuthUser = { id: "not-the-owner", role: "driver" };

    const res = await cancelRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(200);
    expect(mockUpdateCalls.find((c) => c.vals.status === "cancelled")).toBeDefined();
  });

  it("awarded RFQ cannot be cancelled → 409, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "awarded" })];

    const res = await cancelRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(409);
    expect(mockUpdateCalls).toHaveLength(0);
  });

  it("outsider (neither owner nor staff) → 403, zero writes", async () => {
    mockRfqRows = [rfqRow({ status: "open" })];
    mockRiderAuthUser = { id: "outsider", role: "rider" };
    mockShopAuthOk = false;

    const res = await cancelRfq(makeRequest("POST", null), { id: RFQ_ID });
    expect(res.status).toBe(403);
    expect(mockUpdateCalls).toHaveLength(0);
  });
});
