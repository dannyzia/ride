// @ts-nocheck — jest mock factories produce untyped chains; runtime behavior is
// what is under test (house pattern, same as c1-auth-chain.test.ts).
/**
 * verify-token role resolution — a slow lookup must never be answered as
 * "single role".
 *
 * SPEC (regression pin, measured 2026-11-10). `respond()` raced heldRoles()
 * against a 2.5s timer and, on timeout, returned `[row.role]`. The auth gate
 * (app/_layout.tsx) routes the chooser only when `active_roles.length > 1`, so
 * that fabricated single-role answer silently skipped the Login-as chooser —
 * and for a fleet_owner who also drives, `enterFleet()` never ran, making the
 * whole fleet portal unreachable on a real device. 2.5s is inside a cold
 * serverless invocation's six sequential queries, so this was a coin flip, not
 * an edge case.
 *
 * Pinned here:
 *  1. a role lookup that takes LONGER than the old 2.5s budget still returns
 *     every active role (the old code fails this test by construction);
 *  2. a lookup that fails/times out reports `roles_unknown: true` with
 *     `active_roles: null` — never a one-element guess;
 *  3. a resolved single-role account is still a single role (the chooser is not
 *     forced on accounts that genuinely hold one role);
 *  4. the gate routes `roles_unknown` to the chooser, so the client half cannot
 *     be dropped later without failing here.
 *
 * Related (concrete paths):
 *   - app/api/auth/verify-token+api.ts — respond(), roles_unknown
 *   - app/_layout.tsx — the auth gate branch (source contract, test 4)
 *   - lib/launchRoles.ts — heldRoles(), the source of truth for role state
 */
import { jest } from "@jest/globals";
import fs from "fs";
import path from "path";

jest.mock("@/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {} },
}));

jest.mock("@/lib/launchRoles", () => ({
  heldRoles: jest.fn(),
}));

// The route reads the boot flag through platformConfig, which imports src/db
// and throws at module load when DATABASE_URL is absent (jest lane has none).
jest.mock("@/lib/platformConfig", () => ({
  isRideVerticalEnabled: jest.fn(async () => true),
}));

const PRIMARY_USER = {
  id: "u-1",
  role: "driver",
  phone: "+8801700000001",
  name: "Fixture",
  account_status: "active",
  suspension_reason: null,
  deleted_at: null,
};

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    auth: {
      getUser: async () => ({ data: { user: { id: "auth-1" } }, error: null }),
    },
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: PRIMARY_USER, error: null }),
            }),
          }),
        };
      }
      // drivers (suspension probe) — no drivers row, so the check passes.
      if (table === "drivers") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        };
      }
      // shop_members staff probe — no active membership for this fixture.
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: null }) }),
            }),
          }),
        }),
      };
    },
  },
}));

import { heldRoles } from "@/lib/launchRoles";
import { POST } from "../../../app/api/auth/verify-token+api";

const mockedHeldRoles = heldRoles as unknown as jest.Mock;

const ROOT = path.join(__dirname, "..", "..", "..");

function callVerifyToken() {
  return POST(
    new Request("http://localhost/api/auth/verify-token", {
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    }),
  );
}

beforeEach(() => {
  mockedHeldRoles.mockReset();
});

describe("verify-token — role set resolution", () => {
  test("a lookup slower than the old 2.5s budget still reports every active role", async () => {
    // 2.6s: just past the removed timer. Under the old code this resolved too
    // late and the response carried `["driver"]`, skipping the chooser.
    mockedHeldRoles.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve([
                { role: "driver", status: "active" },
                { role: "fleet_owner", status: "active" },
              ]),
            2600,
          ),
        ),
    );

    const res = await callVerifyToken();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.roles_unknown).toBe(false);
    expect(body.active_roles).toEqual(["driver", "fleet_owner"]);
  }, 15000);

  test("a failed lookup reports roles_unknown instead of guessing the primary role", async () => {
    mockedHeldRoles.mockImplementation(() => Promise.reject(new Error("db down")));

    const res = await callVerifyToken();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.roles_unknown).toBe(true);
    // null, NOT ["driver"] — the distinction the gate depends on.
    expect(body.active_roles).toBeNull();
    expect(body.role).toBe("driver");
  });

  test("a genuinely single-role account stays single (chooser not forced)", async () => {
    mockedHeldRoles.mockImplementation(async () => [
      { role: "driver", status: "active" },
      { role: "fleet_owner", status: "pending" },
    ]);

    const res = await callVerifyToken();
    const body = await res.json();

    expect(body.roles_unknown).toBe(false);
    // Pending roles are not "active"; the gate sees one entry and lands directly.
    expect(body.active_roles).toEqual(["driver"]);
  });

  test("an empty but RESOLVED answer still falls back to the primary role", async () => {
    mockedHeldRoles.mockImplementation(async () => []);

    const res = await callVerifyToken();
    const body = await res.json();

    expect(body.roles_unknown).toBe(false);
    expect(body.active_roles).toEqual(["driver"]);
  });
});

describe("auth gate — roles_unknown routes to the chooser", () => {
  const gate = fs.readFileSync(path.join(ROOT, "app/_layout.tsx"), "utf8");

  test("the gate sends unresolved role sets to login-as", () => {
    expect(gate).toContain("data.roles_unknown === true");
    // The branch must land on the chooser, not on a role surface.
    const branch = gate.slice(gate.indexOf("data.roles_unknown === true"));
    const chooserPush = branch.slice(0, branch.indexOf("} else if"));
    expect(chooserPush).toContain("/(auth)/login-as?phone=");
    expect(chooserPush).not.toContain("/(main)/(rider)");
  });

  test("the cold-boot splash forwarder applies the same rule", () => {
    const splash = fs.readFileSync(path.join(ROOT, "app/index.tsx"), "utf8");
    const branch = splash.slice(splash.indexOf("} else if (", splash.indexOf("data.exists")));
    // Both authorities must treat an unresolved set like a multi-role account.
    expect(splash).toContain("data.roles_unknown === true");
    expect(branch).toContain("/(auth)/login-as?phone=");
  });

  test("the old 2.5s role budget is gone from verify-token", () => {
    const route = fs.readFileSync(
      path.join(ROOT, "app/api/auth/verify-token+api.ts"),
      "utf8",
    );
    expect(route).not.toContain("), 2500)");
    expect(route).toContain("ROLES_BUDGET_MS");
  });
});
