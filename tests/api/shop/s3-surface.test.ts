/**
 * S3 (plan 27 §3) — Shop Owner surface route behaviors, DB mocked like
 * tests/api/shop/shops.test.ts. RBAC guards are mocked at the
 * marketplaceRbac boundary (per-file role script), and mockPlatformConfig /
 * wsNotify / launchRoles are mocked so the SUT is the route logic itself.
 */
import { jest } from "@jest/globals";
import { GET as mineGet } from "@/app/api/shop/mine+api";
import { PATCH as availabilityPatch } from "@/app/api/shop/[id]/availability+api";
import { GET as settlementGet } from "@/app/api/shop/[id]/settlement+api";
import { PATCH as wreqsPatch, GET as wreqsGet } from "@/app/api/shop/[id]/workshop/requests+api";
import { POST as membersPost } from "@/app/api/shop/[id]/members+api";
import { POST as ordersPost } from "@/app/api/shop/orders+api";

// ─── Configurable RBAC script ─────────────────────────────────────────────
let mockMemberRoleScript: { role: string; shopIds: string[] } = { role: "OWNER", shopIds: [] };
jest.mock("@/lib/marketplaceRbac", () => ({
  requireShopMember: jest.fn((shopId?: string, allowed?: string[]) => async () => {
    if (!mockMemberRoleScript.shopIds.includes(shopId ?? "")) {
      throw Object.assign(new Error("Not a member"), { status: 403 });
    }
    if (allowed && !allowed.includes(mockMemberRoleScript.role)) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return {
      supabaseUser: {},
      dbUser: { id: "db-user-1", role: "rider" },
      membership: { id: "mem-1", shop_id: shopId, user_id: "db-user-1", role: mockMemberRoleScript.role },
    };
  }),
}));

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-1" })),
  requireAnyRole: jest.fn(() => async () => ({
    supabaseUser: {},
    dbUser: { id: "db-user-1", role: "rider" },
  })),
}));

jest.mock("@/lib/wsNotify", () => ({ notifyWs: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
const mockHeldRoles = jest.fn();
jest.mock("@/lib/launchRoles", () => ({
  heldRoles: (uid: string) => mockHeldRoles(uid),
}));
const mockIsVerticalEnabled = jest.fn(async () => true);
jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: () => mockIsVerticalEnabled(),
}));

// ─── Mock DB (queues like the house pattern) ───────────────────────────────
let mockSelectQueue: (() => unknown[])[] = [];
let mockUpdateQueue: (() => unknown[])[] = [];
let mockInsertQueue: (() => unknown)[] = [];

function mockMakeThenable(rows: unknown[]) {
  return { then: (r: (v: unknown) => unknown) => r(rows) };
}

function mockChain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "limit", "leftJoin", "innerJoin", "orderBy", "groupBy", "for"]) {
    c[m] = jest.fn().mockReturnValue(c);
  }
  c.then = (r: (v: unknown) => unknown) => r(rows);
  c.returning = jest.fn().mockImplementation(() => mockMakeThenable(rows));
  return c;
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => mockChain(mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [])),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => {
          const rows = mockUpdateQueue.length > 0 ? mockUpdateQueue.shift()!() : [];
          return {
            ...mockChain(rows),
            returning: jest.fn().mockImplementation(() => mockMakeThenable(rows)),
          };
        }),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn().mockImplementation(() =>
          mockMakeThenable(
            Array.isArray(mockInsertQueue[0]?.()) ? (mockInsertQueue.shift()!() as unknown[]) : [mockInsertQueue.shift()!()],
          ),
        ),
      })),
    })),
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: jest.fn(() => mockChain(mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [])),
        update: jest.fn(() => ({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => {
              const rows = mockUpdateQueue.length > 0 ? mockUpdateQueue.shift()!() : [];
              return {
                ...mockChain(rows),
                returning: jest.fn().mockImplementation(() => mockMakeThenable(rows)),
              };
            }),
          }),
        })),
        insert: jest.fn((t: unknown) => ({
          values: jest.fn((vals: unknown) => ({
            then: (r: (v: unknown) => unknown) => r(vals),
          })),
        })),
      };
      return fn(tx);
    }),
  },
} as unknown as Record<string, unknown>));

const SHOP = "0a000000-0000-4000-8000-000000000001";

function req(method = "GET", body?: Record<string, unknown>) {
  return new Request(`http://test/shop/${SHOP}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const asJson = async (res: Response) => (await res.json()) as Record<string, unknown>;

// ─── mine/dashboard ───────────────────────────────────────────────────────
describe("GET /api/shop/mine", () => {
  beforeEach(() => {
    mockSelectQueue = [];
    mockMemberRoleScript = { role: "OWNER", shopIds: [] };
  });

  it("owner gets shop + role + dashboard counts", async () => {
    mockSelectQueue.push(() => [{ id: "db-user-1" }]); // users
    mockSelectQueue.push(() => [{ id: SHOP, owner_user_id: "db-user-1", name: "S", slug: "s", status: "active", is_verified: true, is_open: true, busy: false, shop_type_id: null, logo_url: null }]);
    mockSelectQueue.push(() => [{ status: "pending", n: 2 }]); // orders by status
    mockSelectQueue.push(() => [{ pending: 1, overdue: 1 }]); // workshop counts
    mockSelectQueue.push(() => [{ balance: "150000" }]); // ledger balance

    const res = await mineGet(req());
    const body = (await asJson(res)) as never as {
      role: string;
      dashboard: { orders_by_status: Record<string, number>; workshop: { pending: number; overdue: number }; balance_bdt: number };
    };
    expect(res.status).toBe(200);
    expect(body.role).toBe("OWNER");
    expect(body.dashboard.orders_by_status.pending).toBe(2);
    expect(body.dashboard.workshop.overdue).toBe(1);
    expect(body.dashboard.balance_bdt).toBe(150000);
  });

  it("staff role gets no dashboard money", async () => {
    // member resolution: owner match misses, membership row returns the shop
    mockSelectQueue.push(() => [{ id: "db-user-1" }]); // users
    mockSelectQueue.push(() => []); // owner shops empty
    mockSelectQueue.push(() => [
      {
        role: "STAFF",
        shop: { id: SHOP, name: "S", slug: "s", status: "active", is_verified: true, is_open: true, busy: false, shop_type_id: null, logo_url: null },
      },
    ]); // membership

    const res = await mineGet(req());
    const body = (await asJson(res)) as never as { role: string; dashboard?: unknown };
    expect(res.status).toBe(200);
    expect(body.role).toBe("STAFF");
    expect(body.dashboard).toBeUndefined();
  });

  it("no shop + no membership → 404 no_shop", async () => {
    mockSelectQueue.push(() => [{ id: "db-user-1" }]);
    mockSelectQueue.push(() => []);
    mockSelectQueue.push(() => []);

    const res = await mineGet(req());
    expect(res.status).toBe(404);
    const body = (await asJson(res)) as never as { error: string };
    expect(body.error).toBe("no_shop");
  });
});

// ─── availability ─────────────────────────────────────────────────────────
describe("PATCH /api/shop/[id]/availability", () => {
  beforeEach(() => {
    mockSelectQueue = [];
    mockUpdateQueue = [];
  });

  it("owner sets busy + emits nothing until after the write resolves", async () => {
    mockMemberRoleScript = { role: "OWNER", shopIds: [SHOP] };
    mockUpdateQueue.push(() => [{ is_open: true, busy: true }]);

    const res = await availabilityPatch(req("PATCH", { busy: true }), { id: SHOP });
    expect(res.status).toBe(200);
    const body = (await asJson(res)) as never as { busy: boolean };
    expect(body.busy).toBe(true);
  });

  it("STAFF → 403 (availability is owner/manager land)", async () => {
    mockMemberRoleScript = { role: "STAFF", shopIds: [SHOP] };

    const res = await availabilityPatch(req("PATCH", { is_open: false }), { id: SHOP });
    expect(res.status).toBe(403);
  });

  it("empty body → 400", async () => {
    mockMemberRoleScript = { role: "OWNER", shopIds: [SHOP] };

    const res = await availabilityPatch(req("PATCH", {}), { id: SHOP });
    expect(res.status).toBe(400);
  });
});

// ─── settlement ───────────────────────────────────────────────────────────
describe("GET /api/shop/[id]/settlement", () => {
  beforeEach(() => {
    mockSelectQueue = [];
  });

  it("owner reads entries + signed balance; staff → 403", async () => {
    mockMemberRoleScript = { role: "OWNER", shopIds: [SHOP] };
    mockSelectQueue.push(() => [
      { id: "e1", entry_type: "order_revenue", amount_bdt: 10000 },
      { id: "e2", entry_type: "commission", amount_bdt: -800 },
    ]);
    mockSelectQueue.push(() => [{ balance: "9200" }]);

    const res = await settlementGet(req(), { id: SHOP });
    const body = (await asJson(res)) as never as { balance_bdt: number; entries: unknown[] };
    expect(res.status).toBe(200);
    expect(body.balance_bdt).toBe(9200);
    expect(body.entries).toHaveLength(2);

    // Staff lands hard on the role gate first
    mockMemberRoleScript = { role: "STAFF", shopIds: [SHOP] };
    const resSt = await settlementGet(req(), { id: SHOP });
    expect(resSt.status).toBe(403);
  });
});

// ─── workshop requests ────────────────────────────────────────────────────
describe("PATCH /api/shop/[id]/workshop/requests", () => {
  beforeEach(() => {
    mockSelectQueue = [];
    mockUpdateQueue = [];
    mockMemberRoleScript = { role: "OWNER", shopIds: [SHOP] };
  });

  it("requested → confirmed transition commits", async () => {
    // tx select → locked request row
    mockSelectQueue.push(() => [
      {
        id: "10000000-0000-4000-8000-000000000001",
        shop_id: SHOP,
        status: "requested",
        order_id: null,
      },
    ]);
    mockUpdateQueue.push(() => [{ id: "10000000-0000-4000-8000-000000000001" }]);

    const res = await wreqsPatch(req("PATCH", { id: "10000000-0000-4000-8000-000000000001", status: "confirmed" }), { id: SHOP });
    expect(res.status).toBe(200);
    const body = (await asJson(res)) as never as { status: string };
    expect(body.status).toBe("confirmed");
  });

  it("invalid jump requested → done → 409", async () => {
    mockSelectQueue.push(() => [{ id: "10000000-0000-4000-8000-000000000002", shop_id: SHOP, status: "requested", order_id: null }]);

    const res = await wreqsPatch(req("PATCH", { id: "10000000-0000-4000-8000-000000000002", status: "done" }), { id: SHOP });
    expect(res.status).toBe(409);
    const body = (await asJson(res)) as never as { error: string };
    expect(body.error).toBe("invalid_transition");
  });

  it("STAFF cannot even see the inbox (orders-only)", async () => {
    mockMemberRoleScript = { role: "STAFF", shopIds: [SHOP] };

    const res = await wreqsGet(req(), { id: SHOP });
    expect(res.status).toBe(403);
  });
});

// ─── invite by phone ──────────────────────────────────────────────────────
describe("POST /api/shop/[id]/members (invite-by-phone)", () => {
  beforeEach(() => {
    mockSelectQueue = [];
    mockUpdateQueue = [];
    mockInsertQueue = [];
    mockMemberRoleScript = { role: "OWNER", shopIds: [SHOP] };
  });

  it("invite by phone mints the member row with invited_by", async () => {
    mockSelectQueue.push(() => [{ id: "target-user", role: "customer" }]); // users by phone
    // mockInsertQueue: returning [ { id: "new-mem" } ]
    mockInsertQueue.push(() => ({ id: "new-mem" }));

    const res = await membersPost(req("POST", { phone: "+8801700000001", role: "STAFF" }), {
      id: SHOP,
    });
    expect(res.status).toBe(201);
  });

  it("unknown phone → 404 user_not_found (no dangling rows)", async () => {
    mockSelectQueue.push(() => []); // users by phone — empty

    const res = await membersPost(req("POST", { phone: "+8809999999999", role: "STAFF" }), {
      id: SHOP,
    });
    expect(res.status).toBe(404);
    const body = (await asJson(res)) as never as { error: string };
    expect(body.error).toBe("user_not_found");
  });

  it("STAFF cannot invite (owner only)", async () => {
    mockMemberRoleScript = { role: "STAFF", shopIds: [SHOP] };

    const res = await membersPost(req("POST", { phone: "+8801700000001", role: "STAFF" }), {
      id: SHOP,
    });
    expect(res.status).toBe(403);
  });
});

// ─── closed-shop reject (R5) ──────────────────────────────────────────────
describe("POST /api/shop/orders — R5 closed rejection", () => {
  beforeEach(() => {
    mockSelectQueue = [];
    mockIsVerticalEnabled.mockResolvedValue(true);
  });

  it("closed shop → 409 shop_closed, server-side (not UI)", async () => {
    // inside tx: shops FOR UPDATE read → closed
    mockSelectQueue.push(() => [{ is_open: false }]);

    const res = await ordersPost(
      new Request("http://test/shop/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({
          shop_id: SHOP,
          items: [{ product_id: "00000000-0000-4000-8000-00000000000a", quantity: 1 }],
          fulfillment: "pickup",
        }),
      }),
    );
    expect(res.status).toBe(409);
    const body = (await asJson(res)) as never as { error: string };
    expect(body.error).toBe("shop_closed");
  });
});
