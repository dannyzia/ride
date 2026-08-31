import { supabaseAdmin } from './supabaseServer';
import type { User } from '@supabase/supabase-js';
import type { AdminRole } from './adminRoles';
export type { AdminRole } from './adminRoles';

async function resolveToken(request: Request) {
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
  return resolveToken(request);
}

/** Alias used by checklist verification — same as verifyAuth. */
export const verifySupabaseToken = verifyAuth;

type DbUser = { id: string; role: string };

export type AnyRole = 'rider' | 'driver' | AdminRole;

/**
 * Curried factory: requireAnyRole(roles) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 * Passes if dbUser.role is one of `roles`.
 *
 * Usage: await requireAnyRole(['admin', 'owner'])(request)
 */
export function requireAnyRole(roles: Array<'rider' | 'driver' | 'admin' | AdminRole>) {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: DbUser }> => {
    const supabaseUser = await resolveToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .single();

    if (!dbUser || !roles.includes(dbUser.role as AnyRole)) {
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
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

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
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    // Inactive or vacated member → 403.
    if (member.status !== FLEET_MEMBER_ACTIVE_STATUS || member.removed_at !== null) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    // Role gate (when constrained) → 403.
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(member.role as FleetRole)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    return { supabaseUser, dbUser, fleetMember: member };
  };
}

/** Convenience: only the OWNER of a fleet passes. */
export function requireFleetOwner(fleetId: string) {
  return requireFleetMember(fleetId, ['OWNER']);
}
