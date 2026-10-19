/**
 * C3-8/C5-3 — requireMemberRoles (lib/auth.ts): the user_roles-based
 * membership union behind every rider/driver marketplace + booking route.
 *
 * Contract:
 *  - the legacy primary users.role still passes WITHOUT touching
 *    user_roles (single-role accounts behave exactly like requireAnyRole);
 *  - a primary miss PLUS a user_roles membership row passes (multi-role
 *    accounts are no longer 403'd by their default role);
 *  - primary miss with NO membership row → 403;
 *  - the C2-1 account gate still runs first (a suspended member gets
 *    account_suspended, never a role 403, and never a pass).
 */
 /* eslint-disable import/first */
jest.mock("@/lib/supabaseServer", () => {
  const state = {
    usersRow: null as Record<string, unknown> | null,
    driverRow: null as Record<string, unknown> | null,
    membershipRow: null as Record<string, unknown> | null,
    tablesQueried: [] as string[],
  };
  const chainFor = (table: string) => {
    state.tablesQueried.push(table);
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.in = jest.fn(() => chain);
    chain.single = jest.fn(async () => ({ data: table === "users" ? state.usersRow : null }));
    chain.maybeSingle = jest.fn(async () => ({
      data: table === "drivers" ? state.driverRow : table === "user_roles" ? state.membershipRow : null,
    }));
    return chain;
  };
  return {
    supabaseAdmin: {
      auth: { getUser: jest.fn(async () => ({ data: { user: { id: "supabase-1" } }, error: null })) },
      from: jest.fn((table: string) => chainFor(table)),
    },
    __state: state,
  };
});
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { requireMemberRoles } from "@/lib/auth";

const mockServer = jest.requireMock("@/lib/supabaseServer") as unknown as { __state: {
  usersRow: Record<string, unknown> | null;
  driverRow: Record<string, unknown> | null;
  membershipRow: Record<string, unknown> | null;
  tablesQueried: string[];
} };
const state = mockServer.__state;

const ACTIVE_RIDER = {
  id: "user-1", role: "rider", account_status: "active", suspension_reason: null, deleted_at: null,
};
const ACTIVE_SHOP_OWNER = {
  id: "user-2", role: "shop_owner", account_status: "active", suspension_reason: null, deleted_at: null,
};

function request(): Request {
  return new Request("http://localhost/api/shop/orders", {
    headers: { authorization: "Bearer test-token" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  state.usersRow = null;
  state.driverRow = null;
  state.membershipRow = null;
  state.tablesQueried = [];
});

describe("requireMemberRoles(['rider', 'driver'])", () => {
  test("legacy primary passes without touching user_roles", async () => {
    state.usersRow = { ...ACTIVE_RIDER };

    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request());

    expect(dbUser.id).toBe("user-1");
    expect(state.tablesQueried).not.toContain("user_roles");
  });

  test("primary miss plus a user_roles membership passes (multi-role union)", async () => {
    state.usersRow = { ...ACTIVE_SHOP_OWNER };
    state.membershipRow = { role: "rider" };

    const { dbUser } = await requireMemberRoles(["rider", "driver"])(request());

    expect(dbUser.id).toBe("user-2");
    expect(state.tablesQueried).toContain("user_roles");
  });

  test("primary miss with no membership row → 403", async () => {
    state.usersRow = { ...ACTIVE_SHOP_OWNER };
    state.membershipRow = null;

    await expect(requireMemberRoles(["rider", "driver"])(request())).rejects.toMatchObject({
      status: 403,
    });
  });

  test("suspended member gets account_suspended even with a membership row (C2-1 first)", async () => {
    state.usersRow = { ...ACTIVE_SHOP_OWNER, account_status: "suspended", suspension_reason: "fraud_review" };
    state.membershipRow = { role: "rider" };

    await expect(requireMemberRoles(["rider", "driver"])(request())).rejects.toMatchObject({
      status: 403,
      code: "account_suspended",
    });
  });

  test("unknown account → 403 without touching user_roles", async () => {
    state.usersRow = null;

    await expect(requireMemberRoles(["rider", "driver"])(request())).rejects.toMatchObject({
      status: 403,
    });
    expect(state.tablesQueried).not.toContain("user_roles");
  });
});
