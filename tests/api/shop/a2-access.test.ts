// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/shop/order-transitions.test.ts).
/**
 * A2-3: canonical UUID checks plus RFQ read authorization.
 *
 * GET /api/shop/[id] remains the public catalog detail, so it validates the
 * UUID canonically before any database access. GET /api/shop/rfq/[id] is
 * bidirectional private data: the requesting rider or an active shop member
 * may read it; malformed IDs are 400, missing credentials are 401, and
 * non-parties are 403.
 */
/* eslint-disable import/first */
let mockVerifyBehavior: "ok" | "unauthorized" = "ok";
let mockRfqRows: Record<string, unknown>[] = [];
let mockDbUserResult: { data: { id: string } | null; error: unknown } = {
  data: { id: "db-user-1" },
  error: null,
};
let mockShopAuthOk = true;
let mockShopDetailRows: Record<string, unknown>[] | null = null;
let mockDbSelectCalls = 0;

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => {
    if (mockVerifyBehavior === "unauthorized") {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    return { id: "auth-user-1" };
  }),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => mockDbUserResult),
        })),
      })),
    })),
  },
}));

jest.mock("@/lib/marketplaceRbac", () => ({
  requireShopMember:
    (shopId: string, roles?: readonly string[]) =>
    async () => {
      if (!mockShopAuthOk) {
        throw Object.assign(new Error("Forbidden"), { status: 403 });
      }
      return {
        supabaseUser: { id: "auth-user-1" },
        dbUser: { id: "db-user-1", role: "driver" },
        membership: { id: "membership-1", shop_id: shopId, role: "OWNER" },
      };
    },
}));

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  return {
    db: {
      select: jest.fn(() => {
        mockDbSelectCalls += 1;
        return {
          from: (table: unknown) => ({
            where: () => ({
              limit: async () => {
                if (table === schema.shopRfqs) return mockRfqRows;
                if (table === schema.shops && mockShopDetailRows !== null) {
                  return mockShopDetailRows;
                }
                return [{ id: "unused", status: "active" }];
              },
            }),
          }),
        };
      }),
    },
  };
});

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { GET as shopDetail } from "@/app/api/shop/[id]+api";
import { GET as rfqDetail } from "@/app/api/shop/rfq/[id]+api";

const SHOP_ID = "00000000-0000-4000-8000-0000000000a1";
const RFQ_ID = "00000000-0000-4000-8000-0000000000a2";
const OTHER_SHOP_ID = "00000000-0000-4000-8000-0000000000a3";

function authedRequest() {
  return new Request("http://localhost/api/test", {
    headers: { Authorization: "Bearer token" },
  });
}

beforeEach(() => {
  mockVerifyBehavior = "ok";
  mockRfqRows = [];
  mockDbUserResult = { data: { id: "db-user-1" }, error: null };
  mockShopAuthOk = true;
  mockShopDetailRows = null;
  mockDbSelectCalls = 0;
});

describe("GET /api/shop/[id]", () => {
  test("malformed shop id is 400 invalid_uuid before any database access", async () => {
    const res = await shopDetail(new Request("http://localhost/api/test"), { id: "not-a-uuid" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_uuid");
    expect(mockDbSelectCalls).toBe(0);
  });

  test("an unknown shop is 404 shop_not_found", async () => {
    mockShopDetailRows = [];

    const res = await shopDetail(new Request("http://localhost/api/test"), { id: SHOP_ID });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("shop_not_found");
  });
});

describe("GET /api/shop/rfq/[id]", () => {
  test("malformed RFQ id is 400 invalid_uuid before authentication or database access", async () => {
    mockVerifyBehavior = "unauthorized";

    const res = await rfqDetail(new Request("http://localhost/api/test"), { id: "not-a-uuid" });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_uuid");
    expect(mockDbSelectCalls).toBe(0);
  });

  test("missing credentials are 401 before any database access", async () => {
    mockVerifyBehavior = "unauthorized";

    const res = await rfqDetail(new Request("http://localhost/api/test"), { id: RFQ_ID });

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("unauthorized");
    expect(mockDbSelectCalls).toBe(0);
  });

  test("an authenticated non-party is 403", async () => {
    mockRfqRows = [{ id: RFQ_ID, shop_id: OTHER_SHOP_ID, rider_user_id: "someone-else" }];
    mockShopAuthOk = false;

    const res = await rfqDetail(authedRequest(), { id: RFQ_ID });

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("forbidden");
  });

  test("the requesting rider can read their RFQ", async () => {
    const rfq = { id: RFQ_ID, shop_id: OTHER_SHOP_ID, rider_user_id: "db-user-1" };
    mockRfqRows = [rfq];

    const res = await rfqDetail(authedRequest(), { id: RFQ_ID });

    expect(res.status).toBe(200);
    expect((await res.json()).rfq).toEqual(rfq);
  });

  test("an active shop member can read the other party's RFQ", async () => {
    const rfq = { id: RFQ_ID, shop_id: OTHER_SHOP_ID, rider_user_id: "someone-else" };
    mockRfqRows = [rfq];
    mockShopAuthOk = true;

    const res = await rfqDetail(authedRequest(), { id: RFQ_ID });

    expect(res.status).toBe(200);
    expect((await res.json()).rfq).toEqual(rfq);
  });
});
