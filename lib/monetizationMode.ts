// Monetization-mode possession = mode (DESIGN-POSTPAID-MONETIZATION.md §3.5):
// a driver's mode is derived from possession rows (usable subscription vs active
// commission enrollment), never from a pool-level constant. SOLE writer of
// commission_enrollments and subscriptions.frozen_at (Item 4, pinned per M-12).
// Every function takes the caller's tx handle — no module-level `db` writes.
import { db } from '@/src/db';
import * as schema from '@/src/db/schema';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { DuesExecutor, getDriverUnpaidObligations } from '@/lib/commissionDues';
import { logger } from './logger';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';

type Tx = PgTransaction<PostgresJsQueryResultHKT, typeof schema, any>;

const { commissionEnrollments, packages, subscriptions } = schema;

/** Midpoint of the [0, 1] balance-score scale; commission-mode drivers are pinned here (§3.5, disposition N-04). */
export const COMMISSION_MODE_BALANCE_SCORE = 0.5;

/** Usable-subscription predicate (§3.5): active, un-frozen, not expired, calls left. Shared with dispatch + leadBilling so the definition cannot drift. */
export function subscriptionUsable(driverId: string) {
  return and(
    eq(subscriptions.driver_id, driverId),
    eq(subscriptions.status, 'active'),
    isNull(subscriptions.frozen_at),
    sql`${subscriptions.expires_at} > now()`,
    sql`${subscriptions.calls_remaining} > 0 OR ${subscriptions.calls_remaining} = -1`,
  );
}

/** 'subscription' | 'commission' | 'none' — usable subscription wins; otherwise an active enrollment; otherwise none. */
export async function getDriverMonetizationMode(
  driverId: string,
  exec: DuesExecutor,
): Promise<'subscription' | 'commission' | 'none'> {
  const [sub] = await exec
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(subscriptionUsable(driverId))
    .limit(1);
  if (sub) return 'subscription';
  const [enr] = await exec
    .select({ id: commissionEnrollments.id })
    .from(commissionEnrollments)
    .where(
      and(
        eq(commissionEnrollments.driver_id, driverId),
        eq(commissionEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  return enr ? 'commission' : 'none';
}

/** Thrown by enrollCommission when an active enrollment already exists; the purchase route maps this to `409 already_enrolled_commission`. */
export class AlreadyEnrolledCommissionError extends Error {
  constructor() {
    super('commission_enrollments_one_active_uq: driver already holds an active commission enrollment');
    this.name = 'AlreadyEnrolledCommissionError';
  }
}

/** T6: enroll the driver in commission mode. Freezes any usable paid-up call subscription (D2 supersede). No bill row (price 0). */
export async function enrollCommission(
  tx: Tx,
  params: { driverId: string; packageId: string },
): Promise<{ enrollmentId: string }> {
  const [existing] = await tx
    .select({ id: commissionEnrollments.id })
    .from(commissionEnrollments)
    .where(
      and(
        eq(commissionEnrollments.driver_id, params.driverId),
        eq(commissionEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (existing) throw new AlreadyEnrolledCommissionError();

  await tx
    .update(subscriptions)
    .set({ frozen_at: new Date(), updated_at: new Date() })
    .where(subscriptionUsable(params.driverId));

  const [enr] = await tx
    .insert(commissionEnrollments)
    .values({ driver_id: params.driverId, package_id: params.packageId, status: 'active' })
    .returning({ id: commissionEnrollments.id });
  logger.info('[monetizationMode] commission enrollment created', {
    enrollmentId: enr.id,
    driverId: params.driverId,
    packageId: params.packageId,
  });
  return { enrollmentId: enr.id };
}

/** T6b: unfreeze a frozen paid-up call subscription when switching back from commission. Requires active enrollment + usable frozen subscription + dues settled-or-dust (< 1,000 paisa). */
export async function switchBackToCallPackage(
  tx: Tx,
  params: { driverId: string },
): Promise<{ unfrozenSubscriptionId: string }> {
  const [enr] = await tx
    .select({ id: commissionEnrollments.id })
    .from(commissionEnrollments)
    .where(
      and(
        eq(commissionEnrollments.driver_id, params.driverId),
        eq(commissionEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (!enr) throw new Error('no active commission enrollment to switch back from');

  const [sub] = await tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.driver_id, params.driverId),
        eq(subscriptions.status, 'active'),
        isNotNull(subscriptions.frozen_at),
        sql`${subscriptions.expires_at} > now()`,
        sql`${subscriptions.calls_remaining} > 0 OR ${subscriptions.calls_remaining} = -1`,
      ),
    )
    .limit(1);
  if (!sub) throw new Error('no usable frozen call subscription');

  const obligations = await getDriverUnpaidObligations(tx, params.driverId);
  if (obligations.totalUnpaidPaisa >= 1000) {
    throw new Error('dues_outstanding_switch_blocked');
  }

  await tx
    .update(subscriptions)
    .set({ frozen_at: null, updated_at: new Date() })
    .where(eq(subscriptions.id, sub.id));

  logger.info('[monetizationMode] call subscription unfrozen', {
    subscriptionId: sub.id,
    driverId: params.driverId,
  });
  return { unfrozenSubscriptionId: sub.id };
}

/** T6c: end the active commission enrollment so a call package can supersede it (one product active at a time — G1). */
export async function endActiveEnrollment(
  tx: Tx,
  params: { driverId: string },
): Promise<{ endedEnrollmentId: string } | null> {
  const [enr] = await tx
    .select({ id: commissionEnrollments.id })
    .from(commissionEnrollments)
    .where(
      and(
        eq(commissionEnrollments.driver_id, params.driverId),
        eq(commissionEnrollments.status, 'active'),
      ),
    )
    .limit(1);
  if (!enr) return null;

  await tx
    .update(commissionEnrollments)
    .set({ status: 'ended', ended_at: new Date(), updated_at: new Date() })
    .where(eq(commissionEnrollments.id, enr.id));

  logger.info('[monetizationMode] commission enrollment ended', {
    enrollmentId: enr.id,
    driverId: params.driverId,
  });
  return { endedEnrollmentId: enr.id };
}

/**
 * Idempotent seed of the canonical ৳0 commission package
 * (product_type='commission', price_bdt=0, is_trial=false, duration_days/expires_at NULL).
 * Mirrors the inline SQL in scripts/seed-platform-config.js (owner disposition M-20:
 * the CJS script cannot import the TS lib) and ensureLaunchFreePackage's
 * pg_advisory_xact_lock pattern — callers that race should wrap this in an
 * advisory lock on hashtext('ensure_commission_package'), with packages_code_live_uq
 * as the schema backstop. The helper remains the runtime consumer of record.
 */
export async function ensureCommissionPackage(exec: DuesExecutor): Promise<string> {
  const [existing] = await exec
    .select({ id: packages.id })
    .from(packages)
    .where(
      and(
        eq(packages.product_type, 'commission'),
        eq(packages.price_bdt, 0),
        eq(packages.is_trial, false),
        isNull(packages.duration_days),
        isNull(packages.deleted_at),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [row] = await exec
    .insert(packages)
    .values({
      name: 'Commission',
      code: 'commission',
      call_count: 0,
      duration_days: null,
      price_bdt: 0,
      is_trial: false,
      is_active: true,
      daily_cap: 0,
      vehicle_type: null,
      roles: ['driver'],
    })
    .returning({ id: packages.id });
  logger.info('[monetizationMode] commission package seeded', { packageId: row.id });
  return row.id;
}
