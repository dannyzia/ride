/**
 * Marketplace RBAC guards.
 * Phase 1: requireShopMember (shops).
 * Phase 2+: requireFleetMarketplaceAccess, requireCourier, requireAmbulanceCertified.
 */
import type { User } from '@supabase/supabase-js';
import { verifySupabaseToken } from './auth';
import { supabaseAdmin } from './supabaseServer';
import { db } from '@/src/db';
import {
  shops,
  shopMembers,
  ambulanceCertifications,
  drivers,
  fleets,
  fleetSubscriptionPlans,
  operatorPackages,
} from '@/src/db/schema';
import { eq, and, isNull, or, gt, inArray } from 'drizzle-orm';
import { isOperatorPackageActive } from '@/lib/monetizationMode';
import type { FleetTx } from '@/lib/fleetAssignment';
import { logger } from './logger';
import { serviceLevelSatisfies } from './ambulanceCerts';
import { membershipForbidden, assertMemberRole } from './membershipGate';

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
      membershipForbidden('Forbidden');
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
      membershipForbidden('Not a member of this shop');
    }

    if (membership.status !== 'active') {
      membershipForbidden('Shop membership is not active');
    }

    // Role check — shared family helper (message shape pinned there).
    assertMemberRole({ role: membership.role, allowedRoles });

    // F15: shop must be active
    const shopRows = await db
      .select({ status: shops.status })
      .from(shops)
      .where(eq(shops.id, shopId))
      .limit(1);

    const shop = shopRows[0];
    if (!shop || shop.status !== 'active') {
      membershipForbidden('Shop is not active');
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
  memberships: { fleet_id: string; role: string }[];
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
export interface FleetMarketplaceEntitlement {
  fleet_id: string;
  fleet_name: string;
  package_id: string;
  expires_at: Date | null;
}

/**
 * Batch-2 Item 10 — the fleet marketplace entitlement reads POSSESSION.
 *
 * Before the fold this guard joined `fleet_subscriptions` → `fleet_subscription_plans`
 * and required an ACTIVE subscription on a plan whose `features` carried
 * `marketplace_bidding: true`. Fleet possession now lives in `operator_packages`
 * (role='fleet', migration 0101), so the same question is asked of that table and
 * decided by the same predicate every other possession consumer uses
 * (`isOperatorPackageActive` — status active AND not expired).
 *
 * The FLAG itself still lives on the retained `fleet_subscription_plans` row: the
 * fold preserved the plan id as the package id, which is what makes the feature
 * lookup a plain left join instead of a join table. A fleet package with no
 * capacity-profile row therefore grants no marketplace access — no plan ever
 * granted it, so inventing access would be a silent entitlement widening.
 *
 * Returns one entry per qualifying fleet keyed by fleet id. Fleets are filtered
 * in SQL to the ids the caller asked about (never a global scan).
 */
export async function fleetMarketplaceEntitlements(
  fleetIds: string[],
  opts?: { conn?: typeof db | FleetTx },
): Promise<Map<string, FleetMarketplaceEntitlement>> {
  const out = new Map<string, FleetMarketplaceEntitlement>();
  if (fleetIds.length === 0) return out;

  const conn = opts?.conn ?? db;
  const rows = await conn
    .select({
      fleet_id: fleets.id,
      fleet_name: fleets.name,
      fleet_status: fleets.status,
      package_id: operatorPackages.package_id,
      possession_status: operatorPackages.status,
      expires_at: operatorPackages.expires_at,
      plan_active: fleetSubscriptionPlans.active,
      plan_features: fleetSubscriptionPlans.features,
    })
    .from(operatorPackages)
    .innerJoin(fleets, eq(fleets.id, operatorPackages.operator_id))
    .leftJoin(
      fleetSubscriptionPlans,
      eq(fleetSubscriptionPlans.id, operatorPackages.package_id),
    )
    .where(
      and(
        eq(operatorPackages.operator_role, 'fleet'),
        inArray(operatorPackages.operator_id, fleetIds),
      ),
    );

  for (const row of rows) {
    if (out.has(row.fleet_id)) continue;
    if (row.fleet_status !== 'ACTIVE') continue;
    if (
      !isOperatorPackageActive({
        status: row.possession_status,
        expires_at: row.expires_at,
      })
    ) {
      continue;
    }
    if (row.plan_active !== true) continue;
    const features = row.plan_features as Record<string, unknown> | null;
    if (features?.marketplace_bidding !== true) continue;

    out.set(row.fleet_id, {
      fleet_id: row.fleet_id,
      fleet_name: row.fleet_name,
      package_id: row.package_id,
      expires_at: row.expires_at ?? null,
    });
  }

  return out;
}

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

    // Keep only memberships whose fleet is ACTIVE and HOLDS a marketplace-
    // enabled package (Batch-2 Item 10: possession, not fleet_subscriptions).
    const fleetIds = members.map((m: { fleet_id: string }) => m.fleet_id);
    const entitlements = await fleetMarketplaceEntitlements(fleetIds);
    const qualifying = members.filter((m: { fleet_id: string; role: string }) =>
      entitlements.has(m.fleet_id),
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

/**
 * S6 (plan 27 §6.1, Amendment 2): the universal delivery-agent guard —
 * caller is EITHER an active Delivery Man (couriers row, any type) OR an
 * active driver with the Deliveries toggle ON (server-side gate; UI hiding
 * is not security). Used by the dispatched-offers inbox + leg actions.
 */
export interface DeliveryAgentAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  kind: 'courier' | 'driver';
  courier: { id: string; status: string; verification_status: string } | null;
  driver: { id: string; deliveries_enabled: boolean } | null;
}

export async function requireDeliveryAgent(
  request: Request,
): Promise<DeliveryAgentAuthResult> {
  const supabaseUser = await verifySupabaseToken(request);

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('auth_uid', supabaseUser.id)
    .maybeSingle();
  if (!dbUser) throw Object.assign(new Error('Forbidden'), { status: 403 });

  // C7-2: the dispatch pool consults verification_status = 'active' — the
  // agent gate must too. A courier whose admin verification is still
  // pending (including every row the retired self-signup created) 403s
  // here even though its operational status reads 'active'.
  const { data: courier } = await supabaseAdmin
    .from('couriers')
    .select('id, status, verification_status')
    .eq('user_id', dbUser.id)
    .in('status', ['active'])
    .limit(1)
    .maybeSingle();
  if (courier && (courier as { verification_status?: string }).verification_status === 'active') {
    return { supabaseUser, dbUser, kind: 'courier', courier: courier as DeliveryAgentAuthResult['courier'], driver: null };
  }

  const { data: driver } = await supabaseAdmin
    .from('drivers')
    .select('id, deliveries_enabled')
    .eq('user_id', dbUser.id)
    .eq('status', 'active')
    .maybeSingle();
  if (driver && driver.deliveries_enabled === true) {
    return { supabaseUser, dbUser, kind: 'driver', courier: null, driver };
  }

  throw Object.assign(new Error('Forbidden'), {
    status: 403,
    message: 'delivery_agent_required',
  });
}

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
      .select('id, courier_type, status, verification_status')
      .eq('user_id', dbUser.id)
      .eq('courier_type', type)
      .maybeSingle();
    // C7-2: unverified couriers are invisible (same rule as the agent gate).
    if (!courier || courier.status !== 'active' || (courier as { verification_status?: string }).verification_status !== 'active') {
      throw Object.assign(new Error('Forbidden'), { status: 403, message: 'courier_required' });
    }

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

// ══════════════════════════════════════════════════════════════
// requireAmbulanceCertified (Phase 6 — §E.3)
// ══════════════════════════════════════════════════════════════

export interface AmbulanceAuthResult {
  supabaseUser: User;
  dbUser: { id: string; role: string };
  driver: { id: string; fleet_id: string | null };
  cert: { id: string; service_level: string | null };
}

/**
 * Curried guard: requireAmbulanceCertified(minServiceLevel) ensures:
 * 1. Valid Supabase token
 * 2. Active drivers row (cert holders are drivers)
 * 3. ≥1 VERIFIED, unexpired ambulance_certifications row whose service_level
 *    satisfies the minimum (BLS ⊂ ALS — §E.3)
 */
export function requireAmbulanceCertified(minServiceLevel: 'BLS' | 'ALS') {
  return async (request: Request): Promise<AmbulanceAuthResult> => {
    const supabaseUser = await verifySupabaseToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .maybeSingle();
    if (!dbUser) throw Object.assign(new Error('Forbidden'), { status: 403 });

    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id, fleet_id, status')
      .eq('user_id', dbUser.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!driver) {
      throw Object.assign(new Error('ambulance_certification_required'), {
        status: 403,
        message: 'Active driver account required for ambulance duty',
      });
    }

    const certs = await db
      .select({
        id: ambulanceCertifications.id,
        service_level: ambulanceCertifications.service_level,
        expires_at: ambulanceCertifications.expires_at,
      })
      .from(ambulanceCertifications)
      .where(
        and(
          eq(ambulanceCertifications.user_id, dbUser.id),
          eq(ambulanceCertifications.certification_status, 'verified'),
          or(
            isNull(ambulanceCertifications.expires_at),
            gt(ambulanceCertifications.expires_at, new Date()),
          ),
        ),
      );

    const cert = certs.find((c) => serviceLevelSatisfies(c.service_level, minServiceLevel));
    if (!cert) {
      throw Object.assign(new Error('ambulance_certification_required'), {
        status: 403,
        message: `A verified ${minServiceLevel} ambulance certification is required`,
      });
    }

    return {
      supabaseUser,
      dbUser,
      driver: { id: driver.id, fleet_id: driver.fleet_id },
      cert: { id: cert.id, service_level: cert.service_level },
    };
  };
}
