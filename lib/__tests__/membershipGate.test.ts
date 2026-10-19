/**
 * E — the ONE shared helper behind requireShopMember + requireFleetMember.
 * Pins the denial contract both families rely on: 403 status always, the
 * exact messages the routes surface today, and the constrained/unconstrained
 * role-gate semantics.
 */
import { membershipForbidden, assertMemberRole } from "@/lib/membershipGate";

function caught(fn: () => void): { status?: number; message?: string } {
  try {
    fn();
  } catch (e) {
    return e as { status?: number; message?: string };
  }
  throw new Error("expected a throw");
}

describe("membershipForbidden", () => {
  it("always throws 403 with the given message", () => {
    const err = caught(() => membershipForbidden("Not a member of this shop"));
    expect(err.status).toBe(403);
    expect(err.message).toBe("Not a member of this shop");
  });

  it("preserves the bare family denial (fleet shape)", () => {
    const err = caught(() => membershipForbidden("Forbidden"));
    expect(err).toMatchObject({ status: 403, message: "Forbidden" });
  });
});

describe("assertMemberRole", () => {
  it("passes silently when the gate is unconstrained", () => {
    expect(() => assertMemberRole({ role: "STAFF" })).not.toThrow();
    expect(() =>
      assertMemberRole({ role: "VIEWER", allowedRoles: undefined }),
    ).not.toThrow();
  });

  it("passes when the member holds an allowed role", () => {
    expect(() =>
      assertMemberRole({ role: "MANAGER", allowedRoles: ["OWNER", "MANAGER"] }),
    ).not.toThrow();
  });

  it("403s with the allowlist message on mismatch", () => {
    const err = caught(() =>
      assertMemberRole({ role: "STAFF", allowedRoles: ["OWNER"] }),
    );
    expect(err.status).toBe(403);
    expect(err.message).toBe("Requires one of: OWNER");
  });
});
