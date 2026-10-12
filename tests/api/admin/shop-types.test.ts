/**
 * Launch surfaces (S1) — shop-types admin API + public types read.
 *
 * - RBAC: shoptypes.manage (owner, admin) for writes; admin.read (all four
 *   roles) for the admin listing; the public read is unauthenticated.
 * - POST: slug validation surface (409 on duplicate), 201 on create.
 * - PATCH: flat Expo params, 400 invalid uuid, 404 unknown id, 200 on update.
 * - GET /api/shop/types: active rows only, display order.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { GET as adminGet, POST as adminPost } from "@/app/api/admin/shop-types+api";
import { PATCH as adminPatch } from "@/app/api/admin/shop-types/[id]+api";
import { GET as publicGet } from "@/app/api/shop/types+api";
import { roleHasPermission } from "@/lib/adminRbac";

// ─── Mock DB infrastructure (queue-based chain, mirrors marketplace-admin) ──
let mockSelectQueue: (() => unknown[])[] = [];
let mockInsertQueue: (() => unknown)[] = [];
let mockInsertedPayloads: Record<string, unknown>[] = [];

function mockChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = { _rows: rows };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(chain._rows);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      returning: jest.fn().mockImplementation(() => ({
        then: (r: (v: unknown) => unknown) => r(chain._rows),
      })),
    }),
  });
  chain.update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => ({
        returning: jest.fn().mockImplementation(() => ({
          then: (r: (v: unknown) => unknown) => r(chain._rows),
        })),
      })),
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
    insert: jest.fn(() => {
      const rows = mockInsertQueue.length > 0 ? mockInsertQueue.shift()!() : [{ id: "mock" }];
      return {
        values: jest.fn((payload: Record<string, unknown>) => {
          mockInsertedPayloads.push(payload);
          return {
            returning: jest.fn().mockImplementation(() => ({
              then: (r: (v: unknown) => unknown) => r(Array.isArray(rows) ? rows : [rows]),
            })),
          };
        }),
      };
    }),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => ({
          returning: jest.fn().mockImplementation(() => ({
            then: (r: (v: unknown) => unknown) => r([{ id: "type-1" }]),
          })),
        })),
      }),
    })),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/errors", () => ({
  getErrorStatus: jest.fn((err: unknown) => {
    if (err && typeof err === "object" && "status" in err) return (err as { status: number }).status;
    return 500;
  }),
  getErrorCode: jest.fn((err: unknown) => {
    if (err && typeof err === "object" && "code" in err) return (err as { code: string }).code;
    return undefined;
  }),
}));

// lib/auth + supabaseServer: required so jest.requireActual("@/lib/adminRbac")
// can load without SUPABASE_URL env (adminRbac imports ./auth at module load).
jest.mock("@/lib/supabaseServer", () => {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockReturnValue(Promise.resolve({ data: null }));
  return {
    supabaseAdmin: {
      auth: { getUser: jest.fn() },
      from: jest.fn().mockReturnValue(chain),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  requireAnyRole: jest.fn(() => async () => ({
    supabaseUser: { id: "test-user" },
    dbUser: { id: "test-user", role: "owner" },
  })),
  verifySupabaseToken: jest.fn(async () => ({ id: "test-user" })),
}));

// requireAdminPermission: role header drives the decision; roleHasPermission
// stays the REAL adminRbac implementation (asserted directly in RBAC tests).
jest.mock("@/lib/adminRbac", () => {
  const actual = jest.requireActual("@/lib/adminRbac") as typeof import("@/lib/adminRbac");
  const perms: Record<string, string[]> = {
    owner: ["admin.read", "shoptypes.manage", "marketplace.write"],
    admin: ["admin.read", "shoptypes.manage", "marketplace.write"],
    ops_manager: ["admin.read"],
    moderator: [],
  };
  return {
    ...actual,
    requireAdminPermission: jest.fn((permission: string) => {
      return async (request: Request) => {
        if (!request.headers.get("Authorization")) {
          throw Object.assign(new Error("Unauthorized"), { status: 401 });
        }
        const role = (request.headers.get("x-test-role") as string) || "owner";
        if (!(perms[role] ?? []).includes(permission)) {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
        return { supabaseUser: { id: "test-user" }, dbUser: { id: "test-user", role } };
      };
    }),
  };
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function pushSelectRows(...rows: unknown[][]) {
  for (const r of rows) mockSelectQueue.push(() => r);
}

function pushInsertRows(...rows: unknown[][]) {
  for (const r of rows) mockInsertQueue.push(() => r);
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function makeRequest(method = "GET", body?: Record<string, unknown>, role = "owner") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": "Bearer valid-token",
    "x-test-role": role,
  };
  return new Request("http://localhost", {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as Request;
}

beforeEach(() => {
  mockSelectQueue = [];
  mockInsertQueue = [];
  mockInsertedPayloads = [];
});

// ─── RBAC (real adminRbac permission map) ──────────────────────────────────

describe("shop-types RBAC", () => {
  it("owner has shoptypes.manage", () => {
    expect(roleHasPermission("owner", "shoptypes.manage")).toBe(true);
  });

  it("admin has shoptypes.manage", () => {
    expect(roleHasPermission("admin", "shoptypes.manage")).toBe(true);
  });

  it("ops_manager does NOT have shoptypes.manage", () => {
    expect(roleHasPermission("ops_manager", "shoptypes.manage")).toBe(false);
  });

  it("moderator does NOT have shoptypes.manage", () => {
    expect(roleHasPermission("moderator", "shoptypes.manage")).toBe(false);
  });

  it("ops_manager and moderator keep admin.read (read-only on the queue)", () => {
    expect(roleHasPermission("ops_manager", "admin.read")).toBe(true);
    expect(roleHasPermission("moderator", "admin.read")).toBe(true);
  });
});

// ─── Admin listing + create ────────────────────────────────────────────────

describe("GET /api/admin/shop-types", () => {
  it("returns the type list for an ops_manager (read-only role)", async () => {
    pushSelectRows([{ id: "t1", slug: "restaurant" }]);
    const res = await adminGet(makeRequest("GET", undefined, "ops_manager"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shop_types: unknown[] };
    expect(body.shop_types).toHaveLength(1);
  });

  it("403s for a moderator", async () => {
    const res = await adminGet(makeRequest("GET", undefined, "moderator"));
    expect(res.status).toBe(403);
  });

  it("401s when the Authorization header is missing", async () => {
    const res = await adminGet(
      new Request("http://localhost", { method: "GET", headers: { "x-test-role": "owner" } }),
    );
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/shop-types", () => {
  const validBody = {
    slug: "electronics",
    label_en: "Electronics",
    label_bn: "ইলেকট্রনিক্স",
  };

  it("creates a type with shoptypes.manage", async () => {
    pushSelectRows([]); // no duplicate
    pushInsertRows([{ id: "t9", slug: "electronics" }]);
    const res = await adminPost(makeRequest("POST", validBody, "admin"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { shop_type: { slug: string } };
    expect(body.shop_type.slug).toBe("electronics");
  });

  it("409s on a duplicate slug", async () => {
    pushSelectRows([{ id: "existing" }]);
    const res = await adminPost(makeRequest("POST", validBody, "owner"));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("slug_taken");
  });

  it("400s on an invalid body (bad slug)", async () => {
    const res = await adminPost(
      makeRequest("POST", { ...validBody, slug: "Bad Slug!" }, "owner"),
    );
    expect(res.status).toBe(400);
  });

  it("403s for a moderator", async () => {
    const res = await adminPost(makeRequest("POST", validBody, "moderator"));
    expect(res.status).toBe(403);
  });

  it("401s when the Authorization header is missing", async () => {
    const res = await adminPost(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("writes an audit_logs row on create (A5)", async () => {
    pushSelectRows([]);
    pushInsertRows([{ id: "t9", slug: "electronics" }], [{ id: "a1" }]);
    const res = await adminPost(makeRequest("POST", validBody, "admin"));
    expect(res.status).toBe(201);
    expect(mockInsertedPayloads).toHaveLength(2);
    const audit = mockInsertedPayloads[1];
    expect(audit.action).toBe("shop_type_create");
    expect(audit.entity_type).toBe("shop_type");
    expect(audit.entity_id).toBe("t9");
    expect(audit.actor_user_id).toBe("test-user");
    expect(audit.new_value).toMatchObject({ slug: "electronics" });
  });
});

// ─── Edit / deactivate ─────────────────────────────────────────────────────

describe("PATCH /api/admin/shop-types/[id]", () => {
  it("updates fields (flat Expo params) and writes an audit_logs row (A5)", async () => {
    pushSelectRows([{ id: VALID_UUID, slug: "restaurant", active: true }]);
    const res = await adminPatch(makeRequest("PATCH", { active: false }, "owner"), {
      id: VALID_UUID,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shop_type: { id: string } };
    expect(body.shop_type.id).toBe("type-1");
    expect(mockInsertedPayloads).toHaveLength(1);
    const audit = mockInsertedPayloads[0];
    expect(audit.action).toBe("shop_type_deactivate");
    expect(audit.entity_type).toBe("shop_type");
    expect(audit.entity_id).toBe(VALID_UUID);
    expect(audit.old_value).toMatchObject({ active: true });
    expect(audit.new_value).toMatchObject({ active: false });
  });

  it("labels a label-only edit as shop_type_update, not deactivate", async () => {
    pushSelectRows([{ id: VALID_UUID, slug: "restaurant" }]);
    const res = await adminPatch(makeRequest("PATCH", { label_en: "Restaurants" }, "owner"), {
      id: VALID_UUID,
    });
    expect(res.status).toBe(200);
    expect(mockInsertedPayloads[0].action).toBe("shop_type_update");
  });

  it("404s on an unknown id", async () => {
    pushSelectRows([]);
    const res = await adminPatch(makeRequest("PATCH", { active: false }, "owner"), {
      id: VALID_UUID,
    });
    expect(res.status).toBe(404);
  });

  it("400s on a non-uuid id", async () => {
    const res = await adminPatch(makeRequest("PATCH", { active: false }, "owner"), {
      id: "not-a-uuid",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_uuid");
  });

  it("400s when no field is present", async () => {
    const res = await adminPatch(makeRequest("PATCH", {}, "owner"), { id: VALID_UUID });
    expect(res.status).toBe(400);
  });

  it("403s for ops_manager (read-only on the queue)", async () => {
    const res = await adminPatch(makeRequest("PATCH", { active: false }, "ops_manager"), {
      id: VALID_UUID,
    });
    expect(res.status).toBe(403);
  });
});

// ─── Public read (good-morning categories) ────────────────────────────────

describe("GET /api/shop/types", () => {
  it("returns active types unauthenticated", async () => {
    pushSelectRows([
      { id: "t1", slug: "restaurant", label_en: "Restaurant", label_bn: "রেস্তোরাঁ", is_restaurant: true, sort_order: 10 },
      { id: "t2", slug: "grocery_general", label_en: "General & Grocery", label_bn: "জেনারেল ও গ্রোসারি", is_restaurant: false, sort_order: 30 },
    ]);
    const res = await publicGet(new Request("http://localhost"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { shop_types: { slug: string }[] };
    expect(body.shop_types.map((t) => t.slug)).toEqual(["restaurant", "grocery_general"]);
  });

  it("500s with the standard error shape on failure", async () => {
    mockSelectQueue.push(() => {
      throw new Error("boom");
    });
    const res = await publicGet(new Request("http://localhost"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("internal_error");
  });
});
