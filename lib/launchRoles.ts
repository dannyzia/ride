/**
 * launchRoles.ts — the five public launch signup paths (Plan 27 §2 + OWNER-DECISION #8/#9).
 *
 * Owner ruling (§0): a user SEES buttons to register as Customer · Driver ·
 * Shop Owner · Fleet Owner · Delivery Man; every path writes `user_roles`
 * (§1) plus `users.role` (first role = primary). Adding another role later
 * lives in Profile/Settings and goes through the same role's verification
 * gate — never a second account (R9).
 *
 * IDENTITY MODEL (binding, 2026-10-12):
 *   users.phone = the unique LOGIN identity (what OTP authenticates).
 *   users.id    = the system-assigned internal User ID — the key every
 *                 internal reference uses. Roles hang off the ACCOUNT id, so a
 *                 future phone-number change never orphans a role.
 *
 * WRITE OWNERSHIP: this module is the only writer of the three PENDING role
 * records (shops/fleets/couriers rows minted at signup). `user_roles` rows are
 * written here too, and nowhere else (migration 0062 backfills the past).
 * Approval/rejection is owned by the admin verification routes (§7).
 */
import { db } from '@/src/db';
import { users, userRoles, drivers, fleets, shops, couriers } from '@/src/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

/** The five public signup paths. users.role may also hold the platform-staff roles. */
export const LAUNCH_ROLES = ['rider', 'driver', 'shop_owner', 'fleet_owner', 'delivery_man'] as const;
export type LaunchRole = (typeof LAUNCH_ROLES)[number];

/**
 * Roles reachable from Settings → "Add a role" (§2). Rider is instant; the
 * other three are verification-gated. Driver is deliberately absent: its gate
 * is the existing driver onboarding wizard (documents → admin verify), which is
 * its own flow — the API answers 409 driver_onboarding_required so the client
 * routes the user there instead of duplicating the wizard.
 */
export const ADDABLE_ROLES = ['rider', 'shop_owner', 'fleet_owner', 'delivery_man'] as const;
export type AddableRole = (typeof ADDABLE_ROLES)[number];

/** Role-specific fields collected by the onboarding wizard for that role. */
export interface RoleRecordPayload {
  shop?: {
    shop_name: string;
    shop_type_id: string;
    address_line: string;
    license_url: string;
    food_safety_cert_url?: string;
  };
  fleet?: {
    fleet_name: string;
    business_name?: string;
    trade_license_number?: string;
    trade_license_url: string;
    tax_doc_url?: string;
  };
  delivery?: {
    nid_url: string;
    license_url: string;
    vehicle_note?: string;
  };
}

/** Tx handle: whatever `db.transaction` hands its callback. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** shops.slug is UNIQUE — deterministic per user, so a retry re-reads cleanly. */
export function shopSlug(name: string, userId: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${base || 'shop'}-${userId.slice(0, 8)}`;
}

/**
 * Create the PENDING record for a launch role inside the caller's transaction.
 * `rider` needs no row (no verification); `driver` keeps the existing driver
 * onboarding path and is NOT handled here.
 */
export async function createRoleRecord(
  tx: Tx,
  params: { userId: string; role: LaunchRole; payload?: RoleRecordPayload },
): Promise<{ status: string }> {
  const { userId, role, payload } = params;

  if (role === 'rider') {
    return { status: 'active' }; // §2a: instant, no verification.
  }

  if (role === 'shop_owner') {
    const shop = payload?.shop;
    if (!shop) throw Object.assign(new Error('shop fields required'), { status: 400 });
    await tx.insert(shops).values({
      owner_user_id: userId,
      name: shop.shop_name,
      slug: shopSlug(shop.shop_name, userId),
      shop_type_id: shop.shop_type_id,
      address_line: shop.address_line,
      license_url: shop.license_url,
      food_safety_cert_url: shop.food_safety_cert_url ?? null,
      status: 'pending', // §2c: pending → admin verifies → live.
      is_verified: false,
      is_open: true,
    });
    return { status: 'pending' };
  }

  if (role === 'fleet_owner') {
    const fleet = payload?.fleet;
    if (!fleet) throw Object.assign(new Error('fleet fields required'), { status: 400 });
    await tx.insert(fleets).values({
      owner_user_id: userId,
      name: fleet.fleet_name,
      fleet_type: 'NATIVE',
      status: 'PENDING', // §2d: business profile + docs → pending → verified.
      business_name: fleet.business_name ?? null,
      trade_license_number: fleet.trade_license_number ?? null,
      trade_license_url: fleet.trade_license_url,
      tax_doc_url: fleet.tax_doc_url ?? null,
    });
    // OWNER membership is minted by the approval step (§2d: "→ admin verifies →
    // fleet + OWNER membership → dashboard"), so a pending applicant has no
    // fleet capability yet — only the role row their status screen reads.
    return { status: 'pending' };
  }

  if (role === 'delivery_man') {
    const delivery = payload?.delivery;
    if (!delivery) throw Object.assign(new Error('delivery-man fields required'), { status: 400 });
    await tx.insert(couriers).values({
      user_id: userId,
      courier_type: 'food', // see DIVERGENCE in the migration/STEP notes: the
      // pre-existing courier_type is parcel|food; 'food' is the no-vehicle
      // capability, so a standalone Delivery Man lands there. §6.1's
      // "every leg regardless of vertical" is dispatch-side work (S6).
      status: 'pending',
      nid_url: delivery.nid_url,
      license_url: delivery.license_url,
      vehicle_note: delivery.vehicle_note ?? null,
    });
    return { status: 'pending' };
  }

  throw Object.assign(new Error(`unhandled launch role: ${role}`), { status: 400 });
}

/** Verification state as the applicant and the Login-as chooser see it (R6). */
export type RoleStatus = 'active' | 'pending' | 'suspended';

export interface HeldRole {
  role: LaunchRole;
  status: RoleStatus;
  /** Populated when an admin REJECTED the role (R6: surfaces in-app). */
  reason: string | null;
  /** True for the account's primary (users.role) landing surface. */
  is_primary: boolean;
  /** F-03: when the current review round was submitted. */
  submitted_at: string | null;
  /** F-03: "Fix & resubmit — max 3, then admin unblock". */
  resubmit_count: number;
  /** F-30 structured reject, applicant-safe: internal_note is STRIPPED. */
  reject: { code: string | null; field: string | null; example: string | null } | null;
  /** F-03 "prefilled with prior answers" — the applicant's own text answers
   *  (never doc URLs; they re-upload documents on resubmit). */
  prefill: Record<string, string> | null;
}

/** Strip the admin-only internal note — the applicant must never see it. */
function applicantReject(raw: unknown): HeldRole['reject'] {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pick = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : null);
  const out = { code: pick('code'), field: pick('field'), example: pick('example') };
  return out.code || out.field || out.example ? out : null;
}

function shopStatus(status: string): RoleStatus {
  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  return 'suspended'; // suspended | closed
}

function fleetStatus(status: string): RoleStatus {
  if (status === 'ACTIVE') return 'active';
  if (status === 'PENDING') return 'pending';
  return 'suspended'; // SUSPENDED | BLOCKED | CLOSED
}

function courierStatus(status: string): RoleStatus {
  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  return 'suspended';
}

/**
 * The roles this account HOLDS, with each role's verification state — the
 * payload behind the post-OTP "Login as [Role]" chooser (§2, OWNER-DECISION
 * #9) and behind Settings → Add a role.
 *
 * The chooser shows EXACTLY this list: a single-role account never sees it
 * (the caller checks length), and a pending/rejected role is still held — the
 * UI shows its state + reason rather than hiding it.
 */
export async function heldRoles(userId: string): Promise<HeldRole[]> {
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return [];

  const rows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.user_id, userId));

  const held = new Set<string>(rows.map((r) => r.role as string));
  held.add(user.role); // legacy accounts predate user_roles; users.role is authoritative
  const wanted = LAUNCH_ROLES.filter((r) => held.has(r));

  const [driverRows, shopRows, fleetRows, courierRows] = await Promise.all([
    db.select({ status: drivers.status }).from(drivers).where(eq(drivers.user_id, userId)).limit(1),
    db
      .select({
        status: shops.status,
        reason: shops.verification_reason,
        reject: shops.verification_reject,
        n: shops.verification_resubmit_count,
        submitted: shops.created_at,
        shop_name: shops.name,
        shop_type_id: shops.shop_type_id,
        address_line: shops.address_line,
      })
      .from(shops)
      .where(and(eq(shops.owner_user_id, userId), isNull(shops.deleted_at)))
      .orderBy(shops.created_at)
      .limit(1),
    db
      .select({
        status: fleets.status,
        reason: fleets.verification_reason,
        reject: fleets.verification_reject,
        n: fleets.verification_resubmit_count,
        submitted: fleets.created_at,
        fleet_name: fleets.name,
        business_name: fleets.business_name,
        trade_license_number: fleets.trade_license_number,
      })
      .from(fleets)
      .where(eq(fleets.owner_user_id, userId))
      .orderBy(fleets.created_at)
      .limit(1),
    db
      .select({
        status: couriers.status,
        reason: couriers.verification_reason,
        reject: couriers.verification_reject,
        n: couriers.verification_resubmit_count,
        submitted: couriers.created_at,
        vehicle_note: couriers.vehicle_note,
      })
      .from(couriers)
      .where(and(eq(couriers.user_id, userId), eq(couriers.courier_type, 'food')))
      .limit(1),
  ]);

  return wanted.map((role): HeldRole => {
    if (role === 'rider')
      return { role, status: 'active', reason: null, is_primary: user.role === role, submitted_at: null, resubmit_count: 0, reject: null, prefill: null };
    if (role === 'driver') {
      const raw = driverRows[0]?.status ?? 'pending';
      return {
        role,
        status: raw === 'active' ? 'active' : raw === 'pending' ? 'pending' : 'suspended',
        reason: null,
        is_primary: user.role === role,
        submitted_at: null,
        resubmit_count: 0,
        reject: null,
        prefill: null,
      };
    }
    if (role === 'shop_owner') {
      const row = shopRows[0];
      return {
        role,
        status: row ? shopStatus(row.status) : 'pending',
        reason: row?.reason ?? null,
        is_primary: user.role === role,
        submitted_at: row?.submitted ? new Date(row.submitted).toISOString() : null,
        resubmit_count: row?.n ?? 0,
        reject: applicantReject(row?.reject),
        prefill: row
          ? { shop_name: row.shop_name ?? '', address_line: row.address_line ?? '', shop_type_id: row.shop_type_id ?? '' }
          : null,
      };
    }
    if (role === 'fleet_owner') {
      const row = fleetRows[0];
      return {
        role,
        status: row ? fleetStatus(row.status) : 'pending',
        reason: row?.reason ?? null,
        is_primary: user.role === role,
        submitted_at: row?.submitted ? new Date(row.submitted).toISOString() : null,
        resubmit_count: row?.n ?? 0,
        reject: applicantReject(row?.reject),
        prefill: row
          ? {
              fleet_name: row.fleet_name ?? '',
              business_name: row.business_name ?? '',
              trade_license_number: row.trade_license_number ?? '',
            }
          : null,
      };
    }
    const row = courierRows[0];
    return {
      role,
      status: row ? courierStatus(row.status) : 'pending',
      reason: row?.reason ?? null,
      is_primary: user.role === role,
      submitted_at: row?.submitted ? new Date(row.submitted).toISOString() : null,
      resubmit_count: row?.n ?? 0,
      reject: applicantReject(row?.reject),
      prefill: row ? { vehicle_note: row.vehicle_note ?? '' } : null,
    };
  });
}

/**
 * Add a role to an EXISTING account (R9: role expansion, never a second
 * account). Writes the user_roles row + the role's PENDING record inside the
 * caller's transaction. The primary `users.role` is untouched — it stays the
 * account's default landing surface.
 */
export async function addRoleRecord(
  tx: Tx,
  params: { userId: string; role: AddableRole; payload?: RoleRecordPayload },
): Promise<{ status: string }> {
  const existing = await tx
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.user_id, params.userId), eq(userRoles.role, params.role)))
    .limit(1);
  if (existing.length > 0) {
    throw Object.assign(new Error('Role already held'), { status: 409 });
  }

  const created = await createRoleRecord(tx, params);
  await tx
    .insert(userRoles)
    .values({ user_id: params.userId, role: params.role });
  return created;
}
