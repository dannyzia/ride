/**
 * Admin RBAC — 4-role admin family (owner ruling REV-4).
 *
 * Roles: owner (superuser, every check passes), admin, ops_manager, moderator.
 * This module is the single source of truth for the permission map used by
 * admin API routes. Server-enforced; the admin UI mirrors it for display only.
 *
 * Owner-only config keys and the pickup-allowance guardrails (±0.25km / ±1min)
 * are enforced per-key in app/api/admin/config+api.ts.
 *
 * ## Owner seeding
 *
 * There is NO self-escalation endpoint. The first owner account is created
 * via direct SQL against the live database:
 *
 * ```sql
 * -- Step 1: Ensure the user exists (via phone OTP registration)
 * -- Step 2: Promote to owner
 * UPDATE users SET role = 'owner' WHERE phone = '+880XXXXXXXXXX';
 * ```
 *
 * Subsequent owner accounts: promote existing admin via the same SQL or via
 * a staff-management endpoint (not yet built — deferred to Stage-1).
 */
import { requireAnyRole, type AdminRole } from './auth';
import type { User } from '@supabase/supabase-js';

/** All members of the admin family. */
export const ADMIN_ROLES: AdminRole[] = ['owner', 'admin', 'ops_manager', 'moderator'];

/** True if the user holds the superuser role. */
export function isOwner(dbUser: { role: string }): boolean {
  return dbUser.role === 'owner';
}

/**
 * Permission map for admin routes. Owner is always permitted (superuser) and
 * is therefore listed in — and implied by — every entry.
 */
export type AdminPermission =
  | 'admin.read' // GET metrics/dashboards/lists — all four roles
  | 'safety.write' // driver suspend/close-account, rider suspend, SOS ack — owner, ops_manager, moderator
  | 'review.write' // dawdle/fraud-flags review, fare disputes, zone-fee schedule approval, driver package review — owner, ops_manager
  | 'verification.write' // driver verification & lifecycle (approve/reject/activate/upgrade/documents) — owner, admin, ops_manager
  | 'config.write' // non-owner-only platform/system config keys — owner, admin
  | 'catalog.write' // zones, vehicle models, preferences, promos, incentives, etc. — owner, admin
  | 'price.write' // pricing rows, packages (launch prices/base_km/package prices) — owner only
  | 'finance.write' // refunds, payment recovery, tax reports — owner, admin
  | 'support.write' // tickets, lost-items, broadcast, events — owner, admin, ops_manager
  | 'staff.manage'; // user management, RBAC assignment — owner, admin

const PERMISSION_ROLES: Record<AdminPermission, AdminRole[]> = {
  'admin.read': ['owner', 'admin', 'ops_manager', 'moderator'],
  'safety.write': ['owner', 'ops_manager', 'moderator'],
  'review.write': ['owner', 'ops_manager'],
  'verification.write': ['owner', 'admin', 'ops_manager'],
  'config.write': ['owner', 'admin'],
  'catalog.write': ['owner', 'admin'],
  'price.write': ['owner'],
  'finance.write': ['owner', 'admin'],
  'support.write': ['owner', 'admin', 'ops_manager'],
  'staff.manage': ['owner', 'admin'],
};

/** True if `role` holds `permission`. Owner passes every check (superuser). */
export function roleHasPermission(role: string, permission: AdminPermission): boolean {
  if (role === 'owner') return true;
  return PERMISSION_ROLES[permission].includes(role as AdminRole);
}

/**
 * Curried guard like requireRole: resolves the Supabase token, loads
 * users.role, and throws { status: 403 } unless the role holds `permission`.
 * Only admin-family roles are admitted (requireAnyRole(ADMIN_ROLES) first).
 *
 * Usage: const { supabaseUser, dbUser } = await requireAdminPermission('staff.manage')(request)
 */
export function requireAdminPermission(permission: AdminPermission) {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: { id: string; role: string } }> => {
    const { supabaseUser, dbUser } = await requireAnyRole(ADMIN_ROLES)(request);
    if (!roleHasPermission(dbUser.role, permission)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return { supabaseUser, dbUser };
  };
}

/**
 * platform_config keys only the Owner may write (REV-4):
 * fare engine flip, zone-fee enablement, night multiplier, pickup backstop %.
 * Key names mirror lib/fareFrameworkConfig.ts FARE_FRAMEWORK_DEFAULTS.
 */
export const OWNER_ONLY_CONFIG_KEYS: ReadonlySet<string> = new Set([
  'fare_framework_stage',
  'zone_fee_enabled',
  'pickup_cap_pct_of_fare',
  'pickup_cap_pct_of_fare_v6',
  'night_mult_value',
  'night_schedule',
]);

/** Pickup free-radius keys guardrailed to ±0.25 km per change (ops_manager scope). */
export const GUARDRAIL_KM_KEYS = new Set([
  'pickup_free_radius_km_bike',
  'pickup_free_radius_km_cng',
  'pickup_free_radius_km_car',
]);

/** Pickup free-time keys guardrailed to ±1 min per change (ops_manager scope). */
export const GUARDRAIL_MIN_KEYS = new Set([
  'pickup_free_time_min_bike',
  'pickup_free_time_min_cng',
  'pickup_free_time_min_car',
]);

export const GUARDRAIL_KM_DELTA = 0.25;
export const GUARDRAIL_MIN_DELTA = 1;

/**
 * True if changing `key` from `currentVal` to `newVal` exceeds the guardrail
 * delta for that key's set. A null currentVal (key not yet set in
 * platform_config) allows any value within the route's range validation.
 * Non-guardrail keys never violate.
 */
export function guardrailViolation(key: string, currentVal: number | null, newVal: number): boolean {
  if (currentVal === null) return false;
  if (GUARDRAIL_KM_KEYS.has(key)) {
    return Math.abs(newVal - currentVal) > GUARDRAIL_KM_DELTA + 1e-9;
  }
  if (GUARDRAIL_MIN_KEYS.has(key)) {
    return Math.abs(newVal - currentVal) > GUARDRAIL_MIN_DELTA + 1e-9;
  }
  return false;
}
