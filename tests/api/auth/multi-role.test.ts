/**
 * Launch surfaces (S2 §2, OWNER-DECISION #8/#9 + identity model) — multi-role
 * account API.
 *
 * - GET /api/user/roles: returns EXACTLY the roles an account holds, each with
 *   its verification state + reject reason (R6). This is the payload behind
 *   the post-OTP "Login as [Role]" chooser.
 * - POST /api/user/roles (add a role): rider is INSTANT (R9 role expansion,
 *   never a second account); a held role is 409; driver is not addable here
 *   (its gate is the existing onboarding wizard).
 * - GET /api/auth/check-user: carries the same role list for the pre-session
 *   chooser; only role LABELS + state cross that public boundary.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { GET as rolesGet, POST as rolesPost } from "@/app/api/user/roles+api";
import { POST as checkUserPost } from "@/app/api/auth/check-user+api";

const USER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

let mockSelectQueue: (() => unknown[])[] = [];
let mockInsertedPayloads: Record<string, unknown>[] = [];

function mockChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = { _rows: rows };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(chain._rows);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.and = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue({
    values: jest.fn((payload: Record<string, unknown>) => {
      mockInsertedPayloads.push(payload);
      return { then: (r: (v: unknown) => unknown) => r([]) };
    }),
  });
  return chain;
}

jest.mock("@/src/db", () => ({
  db: {
    select: jest.fn(() => {
      const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
      return mockChain(rows);
    }),
    insert: jest.fn(() => ({
      values: jest.fn((payload: Record<string, unknown>) => {
        mockInsertedPayloads.push(payload);
        return { then: (r: (v: unknown) => unknown) => r([]) };
      }),
    })),
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      select: () => {
        const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
        return mockChain(rows);
      },
      insert: () => ({
        values: jest.fn((payload: Record<string, unknown>) => {
          mockInsertedPayloads.push(payload);
          return { then: (r: (v: unknown) => unknown) => r([]) };
        }),
      }),
    })),
  },
}));

jest.mock("@/lib/supabaseServer", () => {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn(async () => ({ data: { id: USER, name: "Rahim" } }));
  return { supabaseAdmin: { auth: { getUser: jest.fn() }, from: jest.fn().mockReturnValue(chain) } };
});

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-uid" })),
  requireAnyRole: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

beforeEach(() => {
  mockSelectQueue = [];
  mockInsertedPayloads = [];
});

/** Queue the selects heldRoles() issues: user, user_roles, then the 4 lookups. */
function queueHeldRoles(params: {
  primary: string;
  heldRoles: { role: string }[];
  driver?: { status: string };
  shop?: { status: string; reason?: string | null };
  fleet?: { status: string; reason?: string | null };
  courier?: { status: string; reason?: string | null };
}) {
  mockSelectQueue.push(() => [{ role: params.primary }]); // users.role
  mockSelectQueue.push(() => params.heldRoles); // user_roles rows
  mockSelectQueue.push(() => (params.driver ? [params.driver] : []));
  mockSelectQueue.push(() => (params.shop ? [{ ...params.shop, reason: params.shop.reason ?? null }] : []));
  mockSelectQueue.push(() => (params.fleet ? [{ ...params.fleet, reason: params.fleet.reason ?? null }] : []));
  mockSelectQueue.push(() => (params.courier ? [{ ...params.courier, reason: params.courier.reason ?? null }] : []));
}

const authRequest = (path: string, init?: RequestInit) =>
  new Request(`http://test${path}`, { ...init, headers: { Authorization: "Bearer test", "Content-Type": "application/json", ...(init?.headers ?? {}) } });

describe("GET /api/user/roles", () => {
  // callerUserId resolves through the mocked supabaseAdmin chain — NOT db —
  // so the db queue starts at heldRoles' own first select (users.role).
  it("single-role account holds exactly one role", async () => {
    queueHeldRoles({ primary: "rider", heldRoles: [{ role: "rider" }] });

    const res = await rolesGet(authRequest("/api/user/roles"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { roles: { role: string; status: string }[] };
    expect(body.roles).toHaveLength(1);
    expect(body.roles[0]).toMatchObject({ role: "rider", status: "active", is_primary: true });
  });

  it("a legacy account (no user_roles rows) still reports its users.role", async () => {
    queueHeldRoles({ primary: "driver", heldRoles: [], driver: { status: "active" } });

    const res = await rolesGet(authRequest("/api/user/roles"));
    const body = (await res.json()) as { roles: { role: string; status: string }[] };
    expect(body.roles.map((r) => r.role)).toEqual(["driver"]);
  });

  it("multi-role account reports each role's verification state and reason (R6)", async () => {
    queueHeldRoles({
      primary: "rider",
      heldRoles: [{ role: "rider" }, { role: "shop_owner" }],
      shop: { status: "pending", reason: null },
    });

    const res = await rolesGet(authRequest("/api/user/roles"));
    const body = (await res.json()) as {
      roles: { role: string; status: string; reason: string | null }[];
    };
    expect(body.roles.map((r) => r.role)).toEqual(["rider", "shop_owner"]);
    expect(body.roles[1]).toMatchObject({ status: "pending", reason: null, is_primary: false });
  });

  it("a rejected shop surfaces the admin reason to the applicant", async () => {
    queueHeldRoles({
      primary: "shop_owner",
      heldRoles: [{ role: "rider" }, { role: "shop_owner" }],
      shop: { status: "pending", reason: "License unreadable" },
    });

    const res = await rolesGet(authRequest("/api/user/roles"));
    const body = (await res.json()) as { roles: { role: string; reason: string | null }[] };
    const shop = body.roles.find((r) => r.role === "shop_owner")!;
    expect(shop.reason).toBe("License unreadable");
  });
});

describe("POST /api/user/roles (add a role)", () => {
  it("400 for driver — its gate is the driver onboarding wizard", async () => {
    const res = await rolesPost(
      authRequest("/api/user/roles", { method: "POST", body: JSON.stringify({ role: "driver" }) }),
    );
    expect(res.status).toBe(400);
  });

  it("rider is INSTANT: creates the membership row with no verification record", async () => {
    mockSelectQueue.push(() => []); // tx: no existing membership
    queueHeldRoles({ primary: "rider", heldRoles: [{ role: "rider" }] }); // post-write listing

    const res = await rolesPost(
      authRequest("/api/user/roles", { method: "POST", body: JSON.stringify({ role: "rider" }) }),
    );
    expect(res.status).toBe(201);
    expect(mockInsertedPayloads.some((p) => p.role === "rider" && p.user_id === USER)).toBe(true);
  });

  it("409 when the account already holds the role (no second account, R9)", async () => {
    mockSelectQueue.push(() => [{ id: "existing-membership" }]);

    const res = await rolesPost(
      authRequest("/api/user/roles", { method: "POST", body: JSON.stringify({ role: "rider" }) }),
    );
    expect(res.status).toBe(409);
  });

  it("400 when the wizard payload is missing for a gated role", async () => {
    const res = await rolesPost(
      authRequest("/api/user/roles", { method: "POST", body: JSON.stringify({ role: "shop_owner" }) }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/check-user (chooser payload)", () => {
  it("returns every held role for an existing account", async () => {
    mockSelectQueue.push(() => [{ id: USER, role: "rider" }]); // phone lookup
    queueHeldRoles({
      primary: "rider",
      heldRoles: [{ role: "rider" }, { role: "shop_owner" }],
      shop: { status: "pending" },
    });

    const res = await checkUserPost(
      new Request("http://test/api/auth/check-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+8801700000000" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exists: boolean; roles: { role: string; status: string }[] };
    expect(body.exists).toBe(true);
    expect(body.roles.map((r) => r.role)).toEqual(["rider", "shop_owner"]);
  });

  it("reports exists:false with an empty role list for a new number", async () => {
    mockSelectQueue.push(() => []);
    const res = await checkUserPost(
      new Request("http://test/api/auth/check-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "+8801700000000" }),
      }),
    );
    const body = (await res.json()) as { exists: boolean; roles: unknown[] };
    expect(body.exists).toBe(false);
    expect(body.roles).toEqual([]);
  });
});
