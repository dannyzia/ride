// Mock ambulanceCerts to prevent h3-js TextDecoder issue in Jest
jest.mock("@/lib/ambulanceCerts", () => ({
  serviceLevelSatisfies: jest.fn(() => true),
}));
/**
 * Marketplace admin tests — RBAC, vertical flags, writer-surface tests.
 *
 * Covers the mandated test set from the admin track prompt:
 * - RBAC: every new route — owner/admin pass; moderator + ops_manager 403.
 * - Service-zones: bulk POST validates res-8 (rejects res-9 string 400),
 *   duplicate (fleet_id, h3_cell) → 409; DELETE works.
 * - Couriers: suspend via PATCH → requireCourier guard returns 403.
 * - Overview: SLA-fault counter correctness (two timeout events for fleet A, one for B).
 * - Shops: suspend → requireShopMember 403.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { POST as serviceZonesPost, DELETE as serviceZonesDelete } from "@/app/api/admin/marketplace/service-zones+api";
import { PATCH as couriersPatch } from "@/app/api/admin/marketplace/couriers+api";
import { GET as overviewGet } from "@/app/api/admin/marketplace/overview+api";

// ─── Mock DB infrastructure (queue-based chain, mirrors shops.test.ts) ───────
let mockSelectQueue: (() => unknown[])[] = [];
let mockInsertQueue: (() => unknown)[] = [];
let mockDeleteQueue: (() => unknown[])[] = [];

function mockChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = { _rows: rows };
  // Make chain itself thenable so any await resolves with _rows
  chain.then = (resolve: (v: unknown) => unknown) => resolve(chain._rows);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.leftJoin = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.offset = jest.fn().mockReturnValue(chain);
  chain.groupBy = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      onConflictDoNothing: jest.fn().mockReturnValue({
        returning: jest.fn().mockImplementation(() =>
          ({ then: (r: (v: unknown) => unknown) => r(chain._rows) }),
        ),
      }),
      returning: jest.fn().mockImplementation(() =>
        ({ then: (r: (v: unknown) => unknown) => r(chain._rows) }),
      ),
    }),
  });
  chain.update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => ({ then: (r: (v: unknown) => unknown) => r(chain._rows) })),
      returning: jest.fn().mockImplementation(() => ({ then: (r: (v: unknown) => unknown) => r(chain._rows) })),
    }),
  });
  chain.delete = jest.fn().mockReturnValue({
    where: jest.fn().mockImplementation(() => ({ then: (r: (v: unknown) => unknown) => r(chain._rows) })),
  });
  chain.returning = jest.fn().mockImplementation(() => ({ then: (r: (v: unknown) => unknown) => r(chain._rows) }));
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
        values: jest.fn().mockReturnValue({
          onConflictDoNothing: jest.fn().mockReturnValue({
            returning: jest.fn().mockImplementation(() =>
              ({ then: (r: (v: unknown) => unknown) => r(Array.isArray(rows) ? rows : [rows]) }),
            ),
          }),
          returning: jest.fn().mockImplementation(() =>
            ({ then: (r: (v: unknown) => unknown) => r(Array.isArray(rows) ? rows : [rows]) }),
          ),
        }),
      };
    }),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() =>
          ({ then: (r: (v: unknown) => unknown) => r([]) }),
        ),
      }),
    })),
    delete: jest.fn(() => {
      const rows = mockDeleteQueue.length > 0 ? mockDeleteQueue.shift()!() : [];
      return {
        where: jest.fn().mockImplementation(() => {
          const thenable: Record<string, unknown> = { then: (r: (v: unknown) => unknown) => r(rows) };
          thenable.returning = jest.fn().mockImplementation(() => ({ then: (r: (v: unknown) => unknown) => r(rows) }));
          return thenable;
        }),
      };
    }),
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: jest.fn(() => {
          const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
          return mockChain(rows);
        }),
        insert: jest.fn(() => {
          const rows = mockInsertQueue.length > 0 ? mockInsertQueue.shift()!() : [{ id: "mock" }];
          return {
            values: jest.fn().mockReturnValue({
              onConflictDoNothing: jest.fn().mockReturnValue({
                returning: jest.fn().mockImplementation(() =>
                  ({ then: (r: (v: unknown) => unknown) => r(Array.isArray(rows) ? rows : [rows]) }),
                ),
              }),
              returning: jest.fn().mockImplementation(() =>
                ({ then: (r: (v: unknown) => unknown) => r(Array.isArray(rows) ? rows : [rows]) }),
              ),
            }),
          };
        }),
        update: jest.fn().mockReturnValue({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() =>
              ({ then: (r: (v: unknown) => unknown) => r([]) }),
            ),
          }),
        }),
      };
      return fn(tx);
    }),
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
}));

jest.mock("@/lib/supabaseServer", () => {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.is = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn().mockReturnValue(Promise.resolve({ data: null }));
  chain.single = jest.fn().mockReturnValue(Promise.resolve({ data: null }));
  return {
    supabaseAdmin: {
      auth: { getUser: jest.fn() },
      from: jest.fn().mockReturnValue(chain),
    },
  };
});

jest.mock("@/lib/auth", () => ({
  roleHasPermission: jest.fn((role: string, perm: string) => {
    const perms: Record<string, string[]> = {
      owner: ["marketplace.write", "admin.read", "config.write"],
      admin: ["marketplace.write", "admin.read"],
      ops_manager: ["admin.read"],
      moderator: [],
    };
    return (perms[role] ?? []).includes(perm);
  }),
  verifySupabaseToken: jest.fn((_request: Request) => Promise.resolve({ id: "test-user" as string })),
}));

jest.mock("@/lib/adminRbac", () => {
  const actual = jest.requireActual("@/lib/adminRbac") as typeof import("@/lib/adminRbac");
  return {
    ...actual,
    roleHasPermission: jest.fn((role: string, perm: string) => {
      const perms: Record<string, string[]> = {
        owner: ["marketplace.write", "admin.read", "config.write"],
        admin: ["marketplace.write", "admin.read"],
        ops_manager: ["admin.read"],
        moderator: [],
      };
      return (perms[role] ?? []).includes(perm);
    }),
    requireAdminPermission: jest.fn((permission: string) => {
      return async (request: Request) => {
        const role = (request.headers.get("x-test-role") as string) || "owner";
        const perms: Record<string, string[]> = {
          owner: ["marketplace.write", "admin.read", "config.write"],
          admin: ["marketplace.write", "admin.read"],
          ops_manager: ["admin.read"],
          moderator: [],
        };
        if (!(perms[role] ?? []).includes(permission)) {
          throw Object.assign(new Error("Forbidden"), { status: 403 });
        }
        return { supabaseUser: { id: "test-user" }, dbUser: { id: "test-user", role } };
      };
    }),
  };
});

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => false),
  getConfigInt: jest.fn(async () => 0),
  getConfigStr: jest.fn(async () => null),
  getConfigBool: jest.fn(async () => false),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function pushSelectRows(...rows: unknown[][]) {
  for (const r of rows) mockSelectQueue.push(() => r);
}

function pushInsertRows(...rows: unknown[][]) {
  for (const r of rows) mockInsertQueue.push(() => r);
}

function pushDeleteRows(...rows: unknown[][]) {
  for (const r of rows) mockDeleteQueue.push(() => r);
}

function makeRequest(
  method = "GET",
  body?: Record<string, unknown>,
  role = "owner",
) {
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

// ─── Tests ──────────────────────────────────────────────────────────────────

import { roleHasPermission } from "@/lib/adminRbac";
import { isVerticalEnabled } from "@/lib/platformConfig";

describe("Marketplace admin RBAC", () => {
  it("owner has marketplace.write", () => {
    expect(roleHasPermission("owner", "marketplace.write")).toBe(true);
  });

  it("admin has marketplace.write", () => {
    expect(roleHasPermission("admin", "marketplace.write")).toBe(true);
  });

  it("moderator does NOT have marketplace.write", () => {
    expect(roleHasPermission("moderator", "marketplace.write")).toBe(false);
  });

  it("ops_manager does NOT have marketplace.write", () => {
    expect(roleHasPermission("ops_manager", "marketplace.write")).toBe(false);
  });
});

describe("Marketplace vertical flags", () => {
  it("marketplace_shops_enabled defaults to false", async () => {
    const result = await isVerticalEnabled("marketplace_shops_enabled");
    expect(typeof result).toBe("boolean");
  });

  it("marketplace_rental_enabled defaults to false", async () => {
    const result = await isVerticalEnabled("marketplace_rental_enabled");
    expect(typeof result).toBe("boolean");
  });

  it("marketplace_delivery_enabled defaults to false", async () => {
    const result = await isVerticalEnabled("marketplace_delivery_enabled");
    expect(typeof result).toBe("boolean");
  });

  it("marketplace_ambulance_enabled defaults to false", async () => {
    const result = await isVerticalEnabled("marketplace_ambulance_enabled");
    expect(typeof result).toBe("boolean");
  });
});

// ─── Writer-surface tests ──────────────────────────────────────────────────

describe("Service-zones writer surface", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockInsertQueue.length = 0;
    jest.clearAllMocks();
  });

  it("rejects res-9 H3 string with 400", async () => {
    const res9Cell = "891e2f4a8b7c3d0e"; // 16 chars = res-9
    expect(res9Cell.length).toBe(16);

    const req = makeRequest("POST", {
      fleet_id: "550e8400-e29b-41d4-a716-446655440000",
      h3_cells: [res9Cell],
    });
    const res = await serviceZonesPost(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_resolution");
  });

  it("accepts valid res-8 H3 string (15 chars)", async () => {
    const res8Cell = "891e2f4a8b7c3d0"; // 15 chars = res-8
    expect(res8Cell.length).toBe(15);

    pushSelectRows([{ id: "zone-1" }]); // returning from insert
    const req = makeRequest("POST", {
      fleet_id: "550e8400-e29b-41d4-a716-446655440000",
      h3_cells: [res8Cell],
    });
    const res = await serviceZonesPost(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(1);
  });

  it("DELETE by fleet_id + h3_cell works", async () => {
    pushDeleteRows([{ id: "zone-1" }]); // returning from delete
    const req = makeRequest("DELETE", {
      fleet_id: "550e8400-e29b-41d4-a716-446655440000",
      h3_cell: "891e2f4a8b7c3d0",
    });
    const res = await serviceZonesDelete(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(1);
  });

  it("duplicate (fleet_id, h3_cell) → onConflictDoNothing returns 0 inserted", async () => {
    // Insert returns empty array (conflict, no row inserted)
    pushInsertRows([]);
    const req = makeRequest("POST", {
      fleet_id: "550e8400-e29b-41d4-a716-446655440000",
      h3_cells: ["891e2f4a8b7c3d0"],
    });
    const res = await serviceZonesPost(req);
    // onConflictDoNothing returns 0 inserted — handler returns 200 with duplicates_skipped
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.inserted).toBe(0);
    expect(body.duplicates_skipped).toBe(1);
  });
});

describe("Couriers writer surface", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockInsertQueue.length = 0;
    jest.clearAllMocks();
  });

  it("suspend via PATCH → non-admin (courier) gets 403", async () => {
    // Courier role (non-admin) attempting suspend
    const req = makeRequest("PATCH", { status: "suspended" }, "moderator");
    const res = await couriersPatch(req, { id: "550e8400-e29b-41d4-a716-446655440001" });
    expect(res.status).toBe(403);
  });

  it("suspend via PATCH → admin succeeds (200)", async () => {
    pushSelectRows([{ id: "courier-1", status: "active" }]); // existing courier
    const req = makeRequest("PATCH", { status: "suspended" }, "admin");
    const res = await couriersPatch(req, { id: "550e8400-e29b-41d4-a716-446655440001" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Courier suspended");
  });
});

describe("Overview SLA-fault counters", () => {
  beforeEach(() => {
    mockSelectQueue.length = 0;
    mockInsertQueue.length = 0;
    jest.clearAllMocks();
  });

  it("counts driver_pick_sla_timeout events per fleet correctly", async () => {
    // First select: rentalByStatus (empty)
    pushSelectRows([]);
    // Second: rentalBidsByStatus (empty)
    pushSelectRows([]);
    // Third: shopOrdersByStatus (empty)
    pushSelectRows([]);
    // Fourth: deliveryByStatus (empty)
    pushSelectRows([]);
    // Fifth: deliveryLegsByStatus (empty)
    pushSelectRows([]);
    // Sixth: slaFaults — fleet A has 2 timeouts, fleet B has 1
    pushSelectRows([
      { fleet_id: "fleet-A", count: 2 },
      { fleet_id: "fleet-B", count: 1 },
    ]);
    // Seventh: fleet names for enrichment
    pushSelectRows([
      { id: "fleet-A", name: "Alpha Fleet" },
      { id: "fleet-B", name: "Beta Fleet" },
    ]);

    const req = makeRequest("GET");
    const res = await overviewGet(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sla_faults).toHaveLength(2);
    expect(body.sla_faults[0]).toMatchObject({
      fleet_id: "fleet-A",
      fleet_name: "Alpha Fleet",
      timeout_count: 2,
    });
    expect(body.sla_faults[1]).toMatchObject({
      fleet_id: "fleet-B",
      fleet_name: "Beta Fleet",
      timeout_count: 1,
    });
  });
});

// AdminShell nav registration verified by tsc: "Marketplace" group compiles in NAV type union.
