/**
 * membershipGate.ts — the ONE shared helper behind both membership-family
 * guards: requireShopMember (lib/marketplaceRbac.ts) and requireFleetMember
 * (lib/auth.ts).
 *
 * The families keep their own transports on purpose (auth.ts must stay
 * Drizzle-free so the auth/admin import chain survives a missing
 * DATABASE_URL; the shop guard reads membership + parent status via the
 * Drizzle pool, and the fleet guard reads via PostgREST) and their own
 * family extras (F15 shop-active check vs C2-1 account gate). What is
 * shared — and what used to drift as copy-paste — is the denial shape:
 * every miss is a 403 built by membershipForbidden, and every constrained
 * role check runs through assertMemberRole. Behavior (status codes AND
 * messages) is unchanged; only the construction is single-sourced.
 *
 * No drizzle, no schema imports — safe for lib/auth.ts.
 */

/** Every membership-gate miss: 403 with a stable machine-readable message. */
export function membershipForbidden(message: string): never {
  throw Object.assign(new Error("Forbidden"), { status: 403, message });
}

/**
 * Constrained role gate: when allowedRoles is given the member's stored
 * role must be one of them, else the family's 403. Unconstrained gates
 * (any active member passes) skip silently.
 */
export function assertMemberRole(args: {
  role: string;
  allowedRoles?: readonly string[];
}): void {
  if (args.allowedRoles && !args.allowedRoles.includes(args.role)) {
    membershipForbidden(`Requires one of: ${args.allowedRoles.join(", ")}`);
  }
}
