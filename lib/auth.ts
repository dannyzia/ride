import { supabaseAdmin } from './supabaseServer';
import { membershipForbidden, assertMemberRole } from './membershipGate';
import type { User } from '@supabase/supabase-js';
import type { AdminRole } from './adminRoles';
export type { AdminRole } from './adminRoles';

/** Token-only resolution (no account gate) — for flows that must stay usable
 * on suspended/deleted accounts (e.g. account deletion idempotency). */
export async function resolveToken(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return user;
}

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Returns the Supabase Auth User object.
 */
export async function verifyAuth(request: Request) {
  const supabaseUser = await resolveToken(request);
  // C2-1: every authenticated route enforces suspension/deletion here.
  await assertAccountActive(supabaseUser.id);
  return supabaseUser;
}

/** Alias used by checklist verification — same as verifyAuth. */
export const verifySupabaseToken = verifyAuth;

type DbUser = { id: string; role: string };

// ── C2-1 (STAGE C2-FIX): suspension / deletion enforcement ──────────────
// account_status='suspended' → 403 {error:"account_suspended"} with the
// stored reason surfaced; deleted_at != null → 401 {error:"account_deleted"}.
// Driver status rejected|suspended joins the same gate at REST (WS already
// checks on auth:hello). The thrown shape carries `code` (+ `reason`) so
// routes can surface the machine code via errors.getErrorCode / authErrorBody.
export interface AccountStateRow {
  id: string;
  role: string;
  account_status: string | null;
  suspension_reason: string | null;
  deleted_at: string | null;
}

export function enforceAccountState(
  row: AccountStateRow,
  driverStatus?: string | null,
): void {
  if (row.deleted_at != null) {
    throw Object.assign(new Error("account_deleted"), {
      status: 401,
      code: "account_deleted",
    });
  }
  if (row.account_status === "suspended") {
    throw Object.assign(new Error("account_suspended"), {
      status: 403,
      code: "account_suspended",
      reason: row.suspension_reason ?? null,
    });
  }
  if (driverStatus === "suspended" || driverStatus === "rejected") {
    throw Object.assign(new Error("account_suspended"), {
      status: 403,
      code: "account_suspended",
      reason: row.suspension_reason ?? `driver_${driverStatus}`,
    });
  }
}

/** Shared DB gate: load the users row and enforce C2-1. Returns the row. */
async function assertAccountActive(supabaseUid: string): Promise<AccountStateRow> {
  const { data: row } = await supabaseAdmin
    .from("users")
    .select("id, role, account_status, suspension_reason, deleted_at")
    .eq("auth_uid", supabaseUid)
    .maybeSingle();
  if (!row) throw Object.assign(new Error("Forbidden"), { status: 403 });
  enforceAccountState(row as AccountStateRow);
  // Driver lifecycle joins the same gate at REST.
  if ((row as AccountStateRow).role === "driver") {
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("status")
      .eq("user_id", (row as AccountStateRow).id)
      .maybeSingle();
    const status = (driver as { status?: string } | null)?.status ?? null;
    enforceAccountState(row as AccountStateRow, status);
  }
  return row as AccountStateRow;
}

export type AnyRole = 'rider' | 'driver' | AdminRole;

/**
 * Shared DB gate: resolve the users row by auth_uid and enforce C2-1
 * (suspension/deletion + driver lifecycle). Throws 403/401 on any miss.
 * Every role guard below funnels through here so the account gate cannot
 * drift between guards — the suspension/deletion check always runs BEFORE
 * any role check, so a suspended account gets account_suspended, never a
 * role 403.
 */
async function loadActiveDbUser(supabaseUser: User): Promise<DbUser> {
  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id, role, account_status, suspension_reason, deleted_at')
    .eq('auth_uid', supabaseUser.id)
    .single();

  if (!dbUser) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
  enforceAccountState(dbUser as AccountStateRow);
  if ((dbUser as AccountStateRow).role === 'driver') {
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('status')
      .eq('user_id', (dbUser as AccountStateRow).id)
      .maybeSingle();
    enforceAccountState(
      dbUser as AccountStateRow,
      (driver as { status?: string } | null)?.status ?? null,
    );
  }
  return dbUser as DbUser;
}

/**
 * Curried factory: requireAnyRole(roles) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 * Passes if dbUser.role is one of `roles`.
 *
 * Usage: await requireAnyRole(['admin', 'owner'])(request)
 */
export function requireAnyRole(roles: ('rider' | 'driver' | 'admin' | AdminRole)[]) {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: DbUser }> => {
    const supabaseUser = await resolveToken(request);
    const dbUser = await loadActiveDbUser(supabaseUser);

    if (!roles.includes(dbUser.role as AnyRole)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return { supabaseUser, dbUser };
  };
}

/**
 * Curried factory: requireMemberRoles(roles) returns a middleware function.
 * Same shape as requireAnyRole ({ supabaseUser, dbUser }) and the same C2-1
 * account gate — but the role check is a MEMBERSHIP union (C3-8/C5-3):
 *
 *   1. the legacy primary users.role matches, OR
 *   2. a user_roles row exists for (user, one of roles).
 *
 * A shop_owner-primary account that added the rider role (add-a-role path)
 * books rides and orders like any rider; an account holding NEITHER still
 * gets 403. The 0062 backfill + the auth writers keep users.role and
 * user_roles in sync, so for single-role accounts this behaves EXACTLY like
 * requireAnyRole — the union only ever widens multi-role members.
 *
 * Usage: await requireMemberRoles(['rider', 'driver'])(request)
 */
export function requireMemberRoles(roles: ('rider' | 'driver')[]) {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: DbUser }> => {
    const supabaseUser = await resolveToken(request);
    const dbUser = await loadActiveDbUser(supabaseUser);

    if ((roles as string[]).includes(dbUser.role)) {
      return { supabaseUser, dbUser };
    }
    // Supabase PostgREST — mirrors the fleet guard's lookup pattern, keeps
    // auth.ts free of the Drizzle DB pool (see requireFleetMember).
    const { data: membership } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', dbUser.id)
      .in('role', roles)
      .maybeSingle();
    if (!membership) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return { supabaseUser, dbUser };
  };
}

/**
 * Curried factory: requireRole(role) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 * Exact-match role check against users.role.
 *
 * Usage: await requireRole('admin')(request)
 *        const { user: admin } = await requireRole('admin')(request)
 */
export function requireRole(role: 'rider' | 'driver' | 'admin') {
  return requireAnyRole([role]);
}

// ══════════════════════════════════════════════════════════════════════
// Fleet staff roles & authorization (Phase 2 — universal fleet model)
//
// Fleet capabilities live EXCLUSIVELY in fleet_members — never users.role.
// users.role stays immutable and singular (rider|driver|admin|...); a user
// may ADDITIONALLY hold any number of fleet roles (OWNER/MANAGER/DISPATCHER/
// ACCOUNTANT/VIEWER) across any number of fleets without a second account or
// a duplicated profile. Capability = an active fleet_members row.
//
// requireFleetMember(fleetId, allowedRoles?) mirrors requireRole's shape:
//   - verify the Supabase token
//   - look up the users row by auth_uid
//   - assert an ACTIVE fleet_members row for (user, fleetId)
//   - if allowedRoles is given, assert the member's role is one of them
// Any miss → 403 Forbidden. Because fleetId is bound into the curried guard
// (not derived from the request), cross-fleet access via URL tampering is
// structurally impossible.
// ══════════════════════════════════════════════════════════════════════

export type FleetRole =
  | 'OWNER'
  | 'MANAGER'
  | 'DISPATCHER'
  | 'ACCOUNTANT'
  | 'VIEWER';

export const FLEET_ROLES: readonly FleetRole[] = [
  'OWNER',
  'MANAGER',
  'DISPATCHER',
  'ACCOUNTANT',
  'VIEWER',
];

/** Vacated members keep their row (audit) but must never pass a guard. */
export const FLEET_MEMBER_ACTIVE_STATUS = 'active';

export interface FleetMemberRecord {
  id: string;
  role: string;
  status: string;
}

export interface FleetMemberAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  fleetMember: FleetMemberRecord;
}

/**
 * Curried factory: requireFleetMember(fleetId, allowedRoles?) returns a
 * middleware that binds the caller to EXACTLY `fleetId`. Returns
 * { supabaseUser, dbUser, fleetMember } when the user is an active member
 * (with an allowed role, when constrained). Throws { status: 403 } otherwise.
 *
 * Usage:
 *   const { fleetMember } = await requireFleetMember(fleetId)(request);
 *   const { fleetMember } = await requireFleetMember(fleetId, ['OWNER'])(
 *     request,
 *   );
 */
export function requireFleetMember(
  fleetId: string,
  allowedRoles?: readonly FleetRole[],
): (request: Request) => Promise<FleetMemberAuthResult> {
  return async (request: Request): Promise<FleetMemberAuthResult> => {
    const supabaseUser = await resolveToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role, account_status, suspension_reason, deleted_at')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      membershipForbidden('Forbidden');
    }
    // C2-1: fleet surfaces honor the same account gate.
    enforceAccountState(dbUser as AccountStateRow);

    // Supabase PostgREST — mirrors the requireRole lookup pattern, keeps
    // auth.ts free of the Drizzle DB pool (which would throw on import when
    // DATABASE_URL is absent, breaking the auth/admin import chain).
    const { data: member } = await supabaseAdmin
      .from('fleet_members')
      .select('id, role, status, removed_at')
      .eq('user_id', dbUser.id)
      .eq('fleet_id', fleetId)
      .maybeSingle();

    // Not a member of this fleet → 403 (cross-fleet access blocked).
    if (!member) {
      membershipForbidden('Forbidden');
    }
    // Inactive or vacated member → 403.
    if (member.status !== FLEET_MEMBER_ACTIVE_STATUS || member.removed_at !== null) {
      membershipForbidden('Forbidden');
    }
    // Role gate (when constrained) — shared family helper.
    if (allowedRoles && allowedRoles.length > 0) {
      assertMemberRole({ role: member.role as FleetRole, allowedRoles });
    }

    return { supabaseUser, dbUser, fleetMember: member };
  };
}

/** Convenience: only the OWNER of a fleet passes. */
export function requireFleetOwner(fleetId: string) {
  return requireFleetMember(fleetId, ['OWNER']);
}
