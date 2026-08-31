/**
 * Marketplace RBAC guards.
 * Phase 1: requireShopMember (shops).
 * Phase 2+: requireFleetMarketplaceAccess, requireCourier, requireAmbulanceCertified.
 */
import type { User } from '@supabase/supabase-js';
import { verifySupabaseToken } from './auth';
import { supabaseAdmin } from './supabaseServer';
import { db } from '@/src/db';
import { shops, shopMembers } from '@/src/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from './logger';

export type ShopMemberRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface ShopAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  membership: {
    id: string;
    shop_id: string;
    user_id: string;
    role: ShopMemberRole;
  };
}

/**
 * Curried guard: requireShopMember(shopId, allowedRoles?) ensures:
 * 1. Valid Supabase token
 * 2. Active shop_members row for (user, shopId)
 * 3. Role is one of allowedRoles (if constrained)
 * 4. Shop is active (F15 — suspended shop staff cannot operate)
 *
 * Usage: await requireShopMember(shopId, ['OWNER', 'MANAGER'])(request)
 */
export function requireShopMember(
  shopId: string,
  allowedRoles?: ShopMemberRole[],
) {
  return async (request: Request): Promise<ShopAuthResult> => {
    const supabaseUser = await verifySupabaseToken(request);

    // Look up users row by auth_uid
    const { data: dbUser, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();

    if (userErr || !dbUser) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    // Check active membership
    const rows = await db
      .select()
      .from(shopMembers)
      .where(
        and(
          eq(shopMembers.shop_id, shopId),
          eq(shopMembers.user_id, dbUser.id),
          isNull(shopMembers.removed_at),
        ),
      )
      .limit(1);

    const membership = rows[0];
    if (!membership) {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: 'Not a member of this shop',
      });
    }

    if (membership.status !== 'active') {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: 'Shop membership is not active',
      });
    }

    // Role check
    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: `Requires one of: ${allowedRoles.join(', ')}`,
      });
    }

    // F15: shop must be active
    const shopRows = await db
      .select({ status: shops.status })
      .from(shops)
      .where(eq(shops.id, shopId))
      .limit(1);

    const shop = shopRows[0];
    if (!shop || shop.status !== 'active') {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: 'Shop is not active',
      });
    }

    return { supabaseUser, dbUser, membership };
  };
}

// ══════════════════════════════════════════════════════════════════════
// Fleet marketplace access guard (Phase 2+)
// ══════════════════════════════════════════════════════════════════════

export interface FleetMarketplaceAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  memberships: Array<{ fleet_id: string; role: string }>;
}

/**
 * Curried guard: requireFleetMarketplaceAccess() verifies:
 * 1. Valid Supabase token
 * 2. User has at least one active fleet_members row
 * 3. That fleet has ACTIVE status + ACTIVE subscription on a marketplace-enabled plan
 *
 * Returns ALL qualifying memberships (multi-fleet users — F30).
 * Caller passes fleet_id in body when ambiguous (409 fleet_ambiguous).
 *
 * Usage: const { memberships } = await requireFleetMarketplaceAccess()(request)
 */
export function requireFleetMarketplaceAccess() {
  return async (request: Request): Promise<FleetMarketplaceAuthResult> => {
    const supabaseUser = await verifySupabaseToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();

    if (!dbUser) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }

    // ALL active fleet_members rows
    const { data: members } = await supabaseAdmin
      .from('fleet_members')
      .select('id, role, fleet_id')
      .eq('user_id', dbUser.id)
      .eq('status', 'active')
      .is('removed_at', null);

    if (!members || members.length === 0) {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: 'fleet_member_required',
      });
    }

    // Keep only memberships whose fleet is ACTIVE with a marketplace-enabled plan
    const fleetIds = members.map((m: { fleet_id: string }) => m.fleet_id);
    const { data: subs } = await supabaseAdmin
      .from('fleet_subscriptions')
      .select('fleet_id, current_period_end, fleet: fleets!inner(id, status), plan: fleet_subscription_plans!inner(id, active, features)')
      .in('fleet_id', fleetIds)
      .eq('status', 'ACTIVE')
      .eq('plan.active', true);

    const qualifying = members.filter((m: { fleet_id: string; role: string }) =>
      subs?.some((s: Record<string, unknown>) => {
        const fleet = s.fleet as { id: string; status: string } | null;
        const plan = s.plan as { id: string; active: boolean; features: Record<string, unknown> | null } | null;
        return (
          s.fleet_id === m.fleet_id &&
          fleet?.status === 'ACTIVE' &&
          plan?.features?.marketplace_bidding === true &&
          (!s.current_period_end || new Date(s.current_period_end as string) >= new Date())
        );
      }),
    );

    if (qualifying.length === 0) {
      throw Object.assign(new Error('Forbidden'), {
        status: 403,
        message: 'marketplace_subscription_required',
      });
    }

    return {
      supabaseUser,
      dbUser,
      memberships: qualifying.map((m: { fleet_id: string; role: string }) => ({
        fleet_id: m.fleet_id,
        role: m.role,
      })),
    };
  };
}

// ══════════════════════════════════════════════════════════════
// requireCourier (Phase 3 — E.5b, F29)
// ══════════════════════════════════════════════════════════════

export interface CourierAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  courier: { id: string; courier_type: string; status: string };
  driver: { id: string; vehicle_type: string } | null;
}

/**
 * Curried guard: requireCourier(type) ensures:
 * 1. Valid Supabase token
 * 2. Active couriers row for (user, type)
 * 3. For 'parcel': user ALSO has an active drivers row with vehicle
 * 4. For 'food': any account, no vehicle check
 */
export function requireCourier(type: 'parcel' | 'food') {
  return async (request: Request): Promise<CourierAuthResult> => {
    const supabaseUser = await verifySupabaseToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) throw Object.assign(new Error('Forbidden'), { status: 403 });

    const { data: courier } = await supabaseAdmin
      .from('couriers')
      .select('id, courier_type, status')
      .eq('user_id', dbUser.id)
      .eq('courier_type', type)
      .maybeSingle();
    if (!courier || courier.status !== 'active') throw Object.assign(new Error('Forbidden'), { status: 403, message: 'courier_required' });

    let driver: { id: string; vehicle_type: string } | null = null;
    if (type === 'parcel') {
      // Pathao model: parcel couriers must be drivers with a vehicle
      const { data: d } = await supabaseAdmin
        .from('drivers')
        .select('id, vehicle_type, status')
        .eq('user_id', dbUser.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!d) throw Object.assign(new Error('Forbidden'), { status: 403, message: 'driver_required_for_parcel' });
      driver = d as { id: string; vehicle_type: string };
    }

    return { supabaseUser, dbUser, courier, driver };
  };
}
