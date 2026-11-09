// Batch-2 Item 6: the shared non-driver operator purchase core.
//
// Shop / delivery / fleet operators buy the same `packages` rows drivers buy,
// but on the generalized postpaid rail: the grant is possession
// (`operator_packages`, Item 3) and the receivable is the unified ledger
// (`operator_bills`, Item 2). The driver purchase path is NOT touched — it
// keeps its own subscriptions/enrollments lanes in
// app/api/package/purchase+api.ts.
//
// Write ownership: this module only ever writes through
// lib/monetizationMode.grantOperatorPackage (operator_packages) and
// lib/billsLedger.createOpenBill (operator_bills) — the single-writer modules
// for those tables. It never writes a balance or a payment event.
import type { OperatorRole } from '@/src/db/schema';
import { packages, couriers, fleets, shops } from '@/src/db/schema';
import { db } from '@/src/db';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  grantOperatorPackage,
  OperatorPackageActiveError,
} from '@/lib/monetizationMode';
import { createOpenBill, BillSlotConflictError } from '@/lib/billsLedger';
import { getOperatorUnpaidObligations } from '@/lib/commissionDues';
import { heldRoles, type LaunchRole } from '@/lib/launchRoles';
import { logger } from '@/lib/logger';

/** Roles this core serves. Drivers keep their own possession/billing lanes. */
export type NonDriverOperatorRole = Exclude<OperatorRole, 'driver'>;

/** ৳10 in integer paisa — the settlement minimum, i.e. the dust threshold (D1). */
export const DUST_DUES_PAISA = 1_000;

/** operator_role → the launch role that owns the capability. */
export const LAUNCH_ROLE_BY_OPERATOR_ROLE: Record<NonDriverOperatorRole, LaunchRole> = {
  shop: 'shop_owner',
  delivery: 'delivery_man',
  fleet: 'fleet_owner',
};

export type OperatorPurchaseErrorCode =
  | 'dues_outstanding_purchase_blocked'
  | 'package_not_applicable_to_role'
  | 'active_package_exists'
  | 'fleet_commission_unsupported';

/** Typed block reasons; routes map these straight onto their HTTP responses. */
export class OperatorPurchaseError extends Error {
  constructor(
    readonly code: OperatorPurchaseErrorCode,
    message: string,
    readonly details: Record<string, string | number | null> = {},
  ) {
    super(`${code}: ${message}`);
    this.name = 'OperatorPurchaseError';
  }
}

export interface OperatorPurchaseResult {
  operatorRole: NonDriverOperatorRole;
  operatorId: string;
  packageId: string;
  grant: { id: string; expires_at: string | null; status: string };
  /** null for a ৳0 package — a grant with no receivable (D4). */
  bill: { id: string; amount_bdt: number; due_at: string | null } | null;
}

/**
 * Does this account hold the operator capability ACTIVE? Mirrors the §14
 * eligibility rule the driver rail applies (`heldRoles` active-only): a
 * pending/suspended shop, courier, or fleet must not buy credit.
 */
export async function hasActiveOperatorRole(
  operatorRole: NonDriverOperatorRole,
  userId: string,
): Promise<boolean> {
  const wanted = LAUNCH_ROLE_BY_OPERATOR_ROLE[operatorRole];
  const roles = await heldRoles(userId);
  return roles.some((r) => r.role === wanted && r.status === 'active');
}

/**
 * Resolve the OPERATOR ENTITY (the id `operator_packages` / `operator_bills`
 * are keyed by) for a user — the ownership lookup is per role:
 *   - shop     → shops.id, where shops.owner_user_id = users.id, not deleted
 *                (owners only; MANAGER/STAFF members are not the payer)
 *   - delivery → couriers.id, where couriers.user_id = users.id and
 *                courier_type = 'food' (the launch Delivery-Man capability;
 *                matches the row lib/launchRoles.heldRoles reports the role's
 *                status from). Parcel couriers are driver-role vehicles.
 *   - fleet    → fleets.id, where fleets.owner_user_id = users.id (member
 *                staff are not the payer), BUSINESS fleets first because the
 *                fleet-owner role record mints BUSINESS (S2.1 D-2).
 * Returns null when the account holds the role but has no operator entity.
 */
export async function resolveOperatorIdentity(
  operatorRole: NonDriverOperatorRole,
  userId: string,
): Promise<string | null> {
  if (operatorRole === 'shop') {
    const [row] = await db
      .select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.owner_user_id, userId), isNull(shops.deleted_at)))
      .orderBy(asc(shops.created_at))
      .limit(1);
    return row?.id ?? null;
  }

  if (operatorRole === 'delivery') {
    const [row] = await db
      .select({ id: couriers.id })
      .from(couriers)
      .where(and(eq(couriers.user_id, userId), eq(couriers.courier_type, 'food')))
      .limit(1);
    return row?.id ?? null;
  }

  const [row] = await db
    .select({ id: fleets.id })
    .from(fleets)
    .where(eq(fleets.owner_user_id, userId))
    .orderBy(
      sql`CASE WHEN ${fleets.fleet_type} = 'BUSINESS' THEN 0 ELSE 1 END`,
      asc(fleets.created_at),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * List the packages a non-driver operator role can buy: live rows whose
 * applicable_roles CONTAINS the role. Containment is what makes visibility
 * "role + shared": a shop sees shop-only plans AND plans shared with other
 * roles (e.g. `{shop,fleet}`), and never a driver-only plan. Ordered by price
 * so the cheapest plan leads, matching the driver list.
 */
export async function listOperatorPackages(operatorRole: NonDriverOperatorRole) {
  return db
    .select({
      id: packages.id,
      name: packages.name,
      product_type: packages.product_type,
      call_count: packages.call_count,
      duration_days: packages.duration_days,
      price_bdt: packages.price_bdt,
      daily_cap: packages.daily_cap,
      is_trial: packages.is_trial,
      commission_percent: packages.commission_percent,
      applicable_roles: packages.applicable_roles,
    })
    .from(packages)
    .where(
      and(
        isNull(packages.deleted_at),
        eq(packages.is_active, true),
        sql`${packages.applicable_roles} @> ARRAY[${operatorRole}]::text[]`,
      ),
    )
    .orderBy(asc(packages.price_bdt));
}

/**
 * Buy one package for a non-driver operator. tx-independent: it opens the ONE
 * transaction the grant + bill must share.
 *
 * Order (pinned):
 *   1. settle-first pre-check — unpaid >= ৳10 blocks; dust passes (D1);
 *   2. applicability — the package's applicable_roles must include the role;
 *   3. one transaction under pg_advisory_xact_lock over
 *      'purchase_bill_<role>:<operatorId>' (per-operator serialization);
 *   4. GRANT first, then the bill — the bill's due_at comes from the grant's
 *      expires_at (Gate-3 ordering discipline). A ৳0 package grants with NO
 *      bill (D4); a 23505 from the one-open-bill index rolls the grant back.
 */
export async function purchaseOperatorPackage(params: {
  operatorRole: NonDriverOperatorRole;
  operatorId: string;
  pkg: typeof packages.$inferSelect;
}): Promise<OperatorPurchaseResult> {
  const { operatorRole, operatorId, pkg } = params;

  // (a) settle-first pre-check (fresh read, never cached).
  const obligations = await getOperatorUnpaidObligations(operatorRole, operatorId, db);
  if (obligations.totalUnpaidPaisa >= DUST_DUES_PAISA) {
    throw new OperatorPurchaseError(
      'dues_outstanding_purchase_blocked',
      'Outstanding dues must be settled before purchasing a new package',
      { total_unpaid_paisa: obligations.totalUnpaidPaisa },
    );
  }

  // (b) operator applicability.
  if (!(pkg.applicable_roles ?? []).includes(operatorRole)) {
    throw new OperatorPurchaseError(
      'package_not_applicable_to_role',
      'This package is not available for your operator type',
      { operator_role: operatorRole },
    );
  }

  // (b2) Batch-2 Item 10 §3 — FLEET PACKAGES IGNORE commission_percent in v1:
  // no fleet billing event consumes it (fleet money is the package price on
  // operator_bills; there is no per-trip commission for a fleet). Leaving a
  // non-zero rate on a fleet package would be a config-ignored hazard — the
  // admin sets 5%, nothing ever charges it, and the fleet later disputes a bill
  // that does not exist — so the purchase is rejected instead. Fleet-shared
  // packages ({shop,fleet}) are rejected on the fleet rail for the same reason;
  // the same package remains purchasable on the roles whose leg reads the rate.
  //
  // FOLLOW-UP (documented, not built here): allow a non-zero rate once a fleet
  // billing event exists to consume it.
  if (
    operatorRole === 'fleet' &&
    pkg.commission_percent != null &&
    Number(pkg.commission_percent) > 0
  ) {
    throw new OperatorPurchaseError(
      'fleet_commission_unsupported',
      'Fleet packages cannot carry a commission rate',
      { commission_percent: String(pkg.commission_percent) },
    );
  }

  // (c) one transaction: lock → re-check → grant → bill.
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`purchase_bill_${operatorRole}:${operatorId}`}))`,
      );

      // Race-safe re-check under the lock (the pre-check ran on the pool).
      const fresh = await getOperatorUnpaidObligations(operatorRole, operatorId, tx);
      if (fresh.totalUnpaidPaisa >= DUST_DUES_PAISA) {
        throw new OperatorPurchaseError(
          'dues_outstanding_purchase_blocked',
          'Outstanding dues must be settled before purchasing a new package',
          { total_unpaid_paisa: fresh.totalUnpaidPaisa },
        );
      }

      const granted = await grantOperatorPackage(tx, {
        operatorRole,
        operatorId,
        package: pkg,
      });

      // (d) $0 packages grant with no bill (D4): nothing is owed for a free pack.
      if (pkg.price_bdt <= 0) {
        return {
          operatorRole,
          operatorId,
          packageId: pkg.id,
          grant: {
            id: granted.id,
            expires_at: granted.expires_at?.toISOString() ?? null,
            status: granted.status,
          },
          bill: null,
        } satisfies OperatorPurchaseResult;
      }

      const bill = await createOpenBill(tx, {
        operatorRole,
        operatorId,
        packageId: pkg.id,
        // No subscriptions row backs a non-driver possession (operator_packages
        // carries the package link instead).
        subscriptionId: null,
        amountBdt: pkg.price_bdt,
        // The receivable is due when the granted term ends (NULL = unlimited).
        dueAt: granted.expires_at ?? null,
      });

      logger.info('[operatorPurchase] package purchased on credit', {
        operatorRole,
        operatorId,
        packageId: pkg.id,
        billId: bill.id,
        amountBdt: pkg.price_bdt,
      });

      return {
        operatorRole,
        operatorId,
        packageId: pkg.id,
        grant: {
          id: granted.id,
          expires_at: granted.expires_at?.toISOString() ?? null,
          status: granted.status,
        },
        bill: { id: bill.id, amount_bdt: bill.amount_bdt, due_at: bill.due_at?.toISOString() ?? null },
      } satisfies OperatorPurchaseResult;
    });
  } catch (e: unknown) {
    // The database's one-open-bill barrier is authoritative (B4/IR-A15).
    if (e instanceof BillSlotConflictError) {
      throw new OperatorPurchaseError(
        'dues_outstanding_purchase_blocked',
        'Operator already holds an open subscription bill',
      );
    }
    // operator_packages_one_active_uq — the operator already holds a package.
    if (e instanceof OperatorPackageActiveError) {
      throw new OperatorPurchaseError(
        'active_package_exists',
        'This operator already holds an active package',
      );
    }
    throw e;
  }
}
