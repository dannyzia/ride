/**
 * Launch surfaces (S2 §7) — admin verification queue API.
 *
 * - RBAC: admin.read lists the queue (all four roles can look); approve and
 *   reject are marketplace.write (owner, admin) — ops_manager/moderator are
 *   READ-ONLY on the new queues (§7 A2).
 * - approve: 404 unknown id, 409 already decided, 200 makes the role live and
 *   writes audit_logs with actor/entity/old/new (§7 A3).
 * - reject: 400 short reason, 200 stores the reason the applicant sees (R6)
 *   and audits it; the operational status is untouched (never silently live).
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import { GET as pendingGet } from "@/app/api/admin/verification/pending+api";
import { POST as approvePost } from "@/app/api/admin/verification/[kind]/[id]/approve+api";
import { POST as rejectPost } from "@/app/api/admin/verification/[kind]/[id]/reject+api";

const UUID = "11111111-2222-3333-4444-555555555555";
const ADMIN = "99999999-8888-7777-6666-555555555555";

let mockSelectQueue: (() => unknown[])[] = [];
let mockInsertQueue: (() => unknown)[] = [];
let mockUpdateQueue: (() => unknown[])[] = [];
let mockInsertedPayloads: Record<string, unknown>[] = [];

function mockChain(rows: unknown[] = []) {
  const chain: Record<string, unknown> = { _rows: rows };
  chain.then = (resolve: (v: unknown) => unknown) => resolve(chain._rows);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.from = jest.fn().mockReturnValue(chain);
  chain.innerJoin = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.and = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue({
    set: jest.fn().mockReturnValue({
      where: jest.fn().mockImplementation(() => ({
        returning: jest.fn().mockImplementation(() => ({
          then: (r: (v: unknown) => unknown) => r(chain._rows),
        })),
      })),
    }),
  });
  chain.insert = jest.fn().mockReturnValue({
    values: jest.fn().mockReturnValue({
      then: (r: (v: unknown) => unknown) => r(chain._rows),
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
        const rows = mockInsertQueue.length > 0 ? mockInsertQueue.shift()!() : [{ id: "mock" }];
        return { then: (r: (v: unknown) => unknown) => r(rows) };
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockImplementation(() => ({
          returning: jest.fn().mockImplementation(() => {
            const rows = mockUpdateQueue.length > 0 ? mockUpdateQueue.shift()!() : [];
            return { then: (r: (v: unknown) => unknown) => r(rows) };
          }),
        })),
      }),
    })),
    // M-1 (§16): the fleet approve branch runs inside db.transaction — the tx
    // callback reuses the SAME select/update/insert queues (and the same
    // mockChain shape) so existing queue setups keep working unchanged.
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        select: jest.fn(() => {
          const rows = mockSelectQueue.length > 0 ? mockSelectQueue.shift()!() : [];
          return mockChain(rows);
        }),
        insert: jest.fn(() => ({
          values: jest.fn((payload: Record<string, unknown>) => {
            mockInsertedPayloads.push(payload);
            const rows = mockInsertQueue.length > 0 ? mockInsertQueue.shift()!() : [{ id: "mock" }];
            return { then: (r: (v: unknown) => unknown) => r(rows) };
          }),
        })),
        update: jest.fn(() => ({
          set: jest.fn().mockReturnValue({
            where: jest.fn().mockImplementation(() => ({
              returning: jest.fn().mockImplementation(() => {
                const rows = mockUpdateQueue.length > 0 ? mockUpdateQueue.shift()!() : [];
                return { then: (r: (v: unknown) => unknown) => r(rows) };
              }),
            })),
          }),
        })),
      }),
    ),
  },
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// adminRbac imports ./auth → ./supabaseServer at module load; both must be
// mocked so requireActual("@/lib/adminRbac") needs no SUPABASE_URL env.
jest.mock("@/lib/supabaseServer", () => {
  const chain: Record<string, unknown> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.maybeSingle = jest.fn(async () => ({ data: null }));
  return { supabaseAdmin: { auth: { getUser: jest.fn() }, from: jest.fn().mockReturnValue(chain) } };
});

jest.mock("@/lib/auth", () => ({
  requireAnyRole: jest.fn(() => async () => ({
    supabaseUser: { id: "test-user" },
    dbUser: { id: "test-user", role: "owner" },
  })),
  verifySupabaseToken: jest.fn(async () => ({ id: "test-user" })),
}));

jest.mock("@/lib/adminRbac", () => {
  const actual = jest.requireActual("@/lib/adminRbac") as typeof import("@/lib/adminRbac");
  const perms: Record<string, string[]> = {
    owner: ["admin.read", "marketplace.write"],
    admin: ["admin.read", "marketplace.write"],
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
        return { supabaseUser: { id: ADMIN }, dbUser: { id: ADMIN, role } };
      };
    }),
  };
});

beforeEach(() => {
  mockSelectQueue = [];
  mockInsertQueue = [];
  mockUpdateQueue = [];
  mockInsertedPayloads = [];
});

const authHeaders = (role = "owner"): Record<string, string> => ({
  Authorization: "Bearer test",
  "x-test-role": role,
  "Content-Type": "application/json",
});

function pendingShopRow() {
  return {
    id: UUID,
    name: "Karim Store",
    status: "pending",
    address_line: "Dhanmondi",
    license_url: "https://cdn.test/lic.jpg",
    food_safety_cert_url: null,
    created_at: new Date(),
    user_id: ADMIN,
    user_name: "Karim",
    phone: "+8801700000000",
  };
}

describe("GET /api/admin/verification/pending", () => {
  it("401 without auth", async () => {
    const res = await pendingGet(new Request("http://test/api/admin/verification/pending?kind=shop"));
    expect(res.status).toBe(401);
  });

  it("400 for an unknown kind", async () => {
    const res = await pendingGet(
      new Request("http://test/api/admin/verification/pending?kind=aliens", {
        headers: authHeaders(),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("invalid_kind");
  });

  it("returns the pending queue with applicant + documents", async () => {
    mockSelectQueue.push(() => [pendingShopRow()]);
    const res = await pendingGet(
      new Request("http://test/api/admin/verification/pending?kind=shop", {
        headers: authHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      pending: { applicant: { name: string }; documents: { label: string; url: string | null }[] }[];
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.pending[0].applicant.name).toBe("Karim");
    expect(body.pending[0].documents.map((d) => d.label)).toEqual([
      "Trade license",
      "Food safety certificate",
    ]);
  });
});

describe("POST /api/admin/verification/[kind]/[id]/approve", () => {
  it("403 for ops_manager (read-only on the new queues, §7 A2)", async () => {
    const res = await approvePost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/approve`, {
        method: "POST",
        headers: authHeaders("ops_manager"),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(403);
  });

  it("400 for a malformed id", async () => {
    const res = await approvePost(
      new Request("http://test/api/admin/verification/shop/not-a-uuid/approve", {
        method: "POST",
        headers: authHeaders(),
      }),
      { kind: "shop", id: "not-a-uuid" },
    );
    expect(res.status).toBe(400);
  });

  it("404 when the record does not exist", async () => {
    mockSelectQueue.push(() => []);
    const res = await approvePost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/approve`, {
        method: "POST",
        headers: authHeaders(),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(404);
  });

  it("409 when the record was already decided", async () => {
    mockSelectQueue.push(() => [{ status: "pending", verification_status: "approved", owner: ADMIN }]);
    const res = await approvePost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/approve`, {
        method: "POST",
        headers: authHeaders(),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(409);
  });

  it("200 approves and audits with actor, entity and old/new values", async () => {
    mockSelectQueue.push(() => [{ status: "pending", verification_status: "pending", owner: ADMIN }]);
    mockUpdateQueue.push(() => [{ id: UUID, owner: ADMIN }]);
    mockInsertQueue.push(() => [{ id: "audit" }]);

    const res = await approvePost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/approve`, {
        method: "POST",
        headers: authHeaders(),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification_status: string; user_id: string };
    expect(body.verification_status).toBe("approved");
    expect(body.user_id).toBe(ADMIN);

    const audit = mockInsertedPayloads.find((p) => p.action === "verification_shop_approved");
    expect(audit).toBeDefined();
    expect(audit!.actor_user_id).toBe(ADMIN);
    expect(audit!.entity_type).toBe("shop");
    expect(audit!.entity_id).toBe(UUID);
    expect(audit!.old_value).toMatchObject({ verification_status: "pending" });
    expect(audit!.new_value).toMatchObject({ verification_status: "approved" });
  });

  it("fleets get an OWNER membership minted on approval (§2d)", async () => {
    // before → member lookup (none) → then audit
    mockSelectQueue.push(() => [{ status: "PENDING", verification_status: "pending", owner: ADMIN }]);
    mockUpdateQueue.push(() => [{ id: UUID, owner: ADMIN }]);
    mockSelectQueue.push(() => []);
    mockInsertQueue.push(() => [{ id: "member" }]);
    mockInsertQueue.push(() => [{ id: "audit" }]);

    const res = await approvePost(
      new Request(`http://test/api/admin/verification/fleet/${UUID}/approve`, {
        method: "POST",
        headers: authHeaders(),
      }),
      { kind: "fleet", id: UUID },
    );
    expect(res.status).toBe(200);
    const member = mockInsertedPayloads.find((p) => p.role === "OWNER");
    expect(member).toMatchObject({ fleet_id: UUID, user_id: ADMIN, status: "active" });
  });
});

describe("POST /api/admin/verification/[kind]/[id]/reject", () => {
  it("400 when the reason is too short (R6: the applicant reads it)", async () => {
    const res = await rejectPost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/reject`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason: "no" }),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(400);
  });

  it("200 rejects, stores the reason and audits it, leaving the role non-live", async () => {
    mockSelectQueue.push(() => [{ status: "pending", verification_status: "pending", owner: ADMIN }]);
    mockUpdateQueue.push(() => [{ id: UUID, owner: ADMIN }]);
    mockInsertQueue.push(() => [{ id: "audit" }]);

    const reason = "Trade license photo is unreadable — please re-upload.";
    const res = await rejectPost(
      new Request(`http://test/api/admin/verification/shop/${UUID}/reject`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reason }),
      }),
      { kind: "shop", id: UUID },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verification_status: string; reason: string };
    expect(body.verification_status).toBe("rejected");
    expect(body.reason).toBe(reason);

    const audit = mockInsertedPayloads.find((p) => p.action === "verification_shop_rejected");
    expect(audit).toMatchObject({ actor_user_id: ADMIN, entity_type: "shop" });
    expect((audit!.new_value as { reason: string }).reason).toBe(reason);
  });
});
