/**
 * C2-1 (STAGE C2-FIX): suspension / deletion enforcement.
 *
 * Guard chain: lib/auth.ts enforceAccountState + assertAccountActive
 * (verifySupabaseToken / requireAnyRole / requireFleetMember), WS
 * auth:hello gate, verify-token + check-user, locked screen F-02 X/Y.
 *
 * - suspended rider 403s on a protected route (user/me) with the stored
 *   reason surfaced; deleted account 401s; active passes.
 * - fault-injection: a role-only guard without the C2-1 checks passes the
 *   suspended fixture (must flip vs the real guard).
 */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/src/db", () => ({ db: { select: jest.fn() } }));
jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: { auth: { getUser: jest.fn() }, from: jest.fn() },
}));

import { enforceAccountState } from "@/lib/auth";
import { authErrorBody } from "@/lib/errors";

const SUSPENDED_ROW = {
  id: "u1",
  role: "rider",
  account_status: "suspended",
  suspension_reason: "fare abuse",
  deleted_at: null,
};
const DELETED_ROW = {
  id: "u2",
  role: "rider",
  account_status: "active",
  suspension_reason: null,
  deleted_at: "2026-10-01T00:00:00.000Z",
};
const ACTIVE_ROW = {
  id: "u3",
  role: "rider",
  account_status: "active",
  suspension_reason: null,
  deleted_at: null,
};

// Role-only naive guard (pre-C2-1 shape): must NOT reject suspended rows.
function naiveGuard(row: { role: string }, roles: string[]): void {
  if (!roles.includes(row.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
}

describe("C2-1 enforceAccountState", () => {
  it("suspended → 403 account_suspended with the stored reason", () => {
    let err: unknown;
    try {
      enforceAccountState(SUSPENDED_ROW);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { status?: number }).status).toBe(403);
    expect(authErrorBody(err)).toEqual({
      status: 403,
      body: { error: "account_suspended", message: "Account suspended", reason: "fare abuse" },
    });
  });

  it("deleted → 401 account_deleted", () => {
    let err: unknown;
    try {
      enforceAccountState(DELETED_ROW);
    } catch (e) {
      err = e;
    }
    expect(authErrorBody(err)).toEqual({
      status: 401,
      body: { error: "account_deleted", message: "Account deleted" },
    });
  });

  it("suspended/rejected driver status joins the same gate", () => {
    for (const st of ["suspended", "rejected"]) {
      let err: unknown;
      try {
        enforceAccountState(ACTIVE_ROW, st);
      } catch (e) {
        err = e;
      }
      expect((err as { status?: number }).status).toBe(403);
      expect(authErrorBody(err)?.body.error).toBe("account_suspended");
    }
  });

  it("active passes (no throw)", () => {
    expect(() => enforceAccountState(ACTIVE_ROW, "active")).not.toThrow();
    expect(() => enforceAccountState(ACTIVE_ROW, null)).not.toThrow();
  });

  it("fault-injection: role-only guard passes the suspended fixture (flips vs real guard)", () => {
    // The real guard rejects…
    expect(() => enforceAccountState(SUSPENDED_ROW)).toThrow();
    // …while the pre-C2-1 role-only shape lets it through — the class this
    // stage deletes. If this expectation ever fails, the fixture is wrong.
    expect(() => naiveGuard(SUSPENDED_ROW, ["rider"])).not.toThrow();
  });
});

describe("C2-1 WS auth:hello gate (source pin — index.ts boots on import)", () => {
  const fs = require("fs");
  const path = require("path");
  const src: string = fs.readFileSync(
    path.join(__dirname, "../../../utils-server/index.ts"),
    "utf8",
  );
  it("users lookup selects suspension fields and gates before socket bind", () => {
    expect(src).toContain("suspension_reason");
    expect(src).toContain('message: "account_suspended"');
    expect(src).toContain('message: "account_deleted"');
    const gateIdx = src.indexOf('message: "account_suspended"');
    const bindIdx = src.indexOf("client.userId = user.id");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(bindIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(bindIdx);
  });
});

describe("C2-1 protected route surfaces the machine code (user/me mapping)", () => {
  it("suspended rider 403s with reason; deleted 401s; plain errors map to null", () => {
    // user/me's catch maps guard throws via authErrorBody (wired in me+api).
    const suspendedErr = (() => {
      try {
        enforceAccountState(SUSPENDED_ROW);
      } catch (e) {
        return e;
      }
    })();
    expect(authErrorBody(suspendedErr)).toEqual({
      status: 403,
      body: { error: "account_suspended", message: "Account suspended", reason: "fare abuse" },
    });
    const deletedErr = (() => {
      try {
        enforceAccountState(DELETED_ROW);
      } catch (e) {
        return e;
      }
    })();
    expect(authErrorBody(deletedErr)?.status).toBe(401);
    expect(authErrorBody(new Error("boom"))).toBeNull();
  });
});
