/**
 * Lead Billing — single owner of offer-time debit (Phase D, debit-on-offer).
 *
 * Called by the sequential dispatch pipeline in index.ts. Inserts
 * dispatch_offers + call_ledger deduction in ONE transaction (atomicity
 * guarantee the billing model depends on): the offer row and the debit
 * commit or roll back together — a skipped driver never leaves an orphan
 * 'delivered' row, and a ledger conflict rolls the offer row back.
 *
 * Write ownership: ONLY this file writes new dispatch_offers rows
 * (outcome='delivered') and call_ledger 'deduction' rows. heartbeat.ts is
 * deleted; dispatch.ts and index.ts no longer write dispatch_offers.
 *
 * Guard ordering note: the daily-cap and balance guards run BEFORE the
 * dispatch_offers insert so their skip paths return with ZERO writes. The
 * only post-insert failure path (call_ledger 23505) throws SkipBillingError,
 * which debitLeadForOfferTx translates into a rollback + billed=false.
 */

import { db } from '../src/db';
import {
  subscriptions,
  packages,
  dispatchOffers,
  callLedger,
  drivers,
  rides,
} from '../src/db/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { driverErrorCode } from '../lib/idempotency';
import { isDriverEligibleForRideGender } from '../lib/womenOnlyEligibility';
import { type VehicleTypeEnum } from '../lib/vehicleTypes';

export interface DebitResult {
  billed: boolean;
  balanceAfter: number | null;
}

export interface DebitLeadParams {
  rideId: string;
  driverId: string;
  /** Position of this offer in the sequential chain (dispatch_offers.batch_index). Default 0. */
  chainIndex?: number;
  /**
   * REQUIRED: kill-switch state supplied by the caller (buildCandidateList /
   * dispatchChain), read ONCE per dispatch from platform_config. Zero DB
   * queries for config run before or inside the debit transaction
   * (APP_POOL_SIZE = 5 — a per-offer config read would starve the pool on
   * long sequential chains).
   */
  womenOnlyFeatureEnabled: boolean;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Module-private sentinel: thrown when billing must be skipped AFTER the
 * offer row was inserted (call_ledger 23505 duplicate). The transaction
 * wrapper catches it, rolls the transaction back (removing the offer row),
 * and reports billed=false. Callers passing their own tx must treat this as
 * a rollback-and-skip, not a hard failure.
 */
class SkipBillingError extends Error {
  constructor() {
    super('skip-billing');
  }
}

/**
 * Debit one lead for an offer, inside a caller-owned DB transaction.
 *
 * Steps:
 * 1. Resolve driver's active subscription (latest expiry first)
 * 2. SELECT ... FOR UPDATE on subscription (Z-4 serialization)
 * 3. Daily-cap guard (defense-in-depth behind the pool filter)
 * 4. Balance guard (-1 = unlimited sentinel)
 * 4b. Account-status guard (F-9.1, theme9 stale-eligibility audit) — the pool
 *     filtered drivers.status='active' at build time, but the chain holds an
 *     in-memory ID snapshot; a driver suspended after pool build must not be
 *     debited or offered. Reads the live drivers row (plain read — the pool
 *     query never mutates drivers; skip-on-drift is cheap and idempotent).
 * 5. Insert dispatch_offers row (onConflictDoNothing + returning — zero rows
 *    returned means a (ride_id, driver_id) conflict → skip driver entirely)
 * 6. Insert call_ledger deduction row (reason='offer_sent'); a 23505 unique
 *    violation throws SkipBillingError so the whole tx rolls back
 * 7. Update subscription: calls_remaining -1, daily_calls_used +1, total_deductions +1
 */
export async function debitLeadForOffer(
  tx: DbTx,
  params: DebitLeadParams,
): Promise<DebitResult> {
  const { rideId, driverId, chainIndex = 0 } = params;

  // 1. Resolve active subscription
  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.driver_id, driverId),
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.expires_at} > now()`,
      ),
    )
    .orderBy(desc(subscriptions.expires_at))
    .limit(1);

  if (!sub) {
    // No active subscription — skip driver, no bill, no writes
    return { billed: false, balanceAfter: null };
  }

  // 2. FOR UPDATE on subscription row
  const [lockedSub] = await tx
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, sub.id))
    .for('update');

  if (!lockedSub) {
    return { billed: false, balanceAfter: null };
  }

  // 3. Daily-cap guard (daily_cap lives on packages, not subscriptions)
  const [pkg] = await tx
    .select({ daily_cap: packages.daily_cap })
    .from(packages)
    .where(eq(packages.id, lockedSub.package_id))
    .limit(1);
  const dailyCap = pkg?.daily_cap ?? 200;
  const dailyUsed = lockedSub.daily_calls_used ?? 0;
  if (dailyUsed >= dailyCap) {
    return { billed: false, balanceAfter: null };
  }

  // 4. Balance guard (-1 = unlimited)
  const callsRemaining = lockedSub.calls_remaining;
  if (callsRemaining !== -1 && callsRemaining <= 0) {
    return { billed: false, balanceAfter: null };
  }

  // 4b. Account-status + mid-chain drift guard (F-9.1, S8): re-read the live
  // drivers row AND the ride row INSIDE the debit tx. The candidate pool
  // checked status='active' + is_online at build time, but pool build and
  // this debit can be minutes apart on a long chain — a driver suspended
  // (or gone offline) in between must not be debited or offered. Not FOR
  // UPDATE: nothing else writes status online-path; a stale read here only
  // costs one skipped candidate, never a wrong charge.
  const [driverRow] = await tx
    .select({
      status: drivers.status,
      is_online: drivers.is_online,
      gender: drivers.gender,
      gender_verified: drivers.gender_verified,
      women_only_enabled: drivers.women_only_enabled,
      vehicle_type: drivers.vehicle_type,
    })
    .from(drivers)
    .where(eq(drivers.id, driverId))
    .limit(1);

  const [rideRow] = await tx
    .select({ women_only: rides.women_only, vehicle_type: rides.vehicle_type })
    .from(rides)
    .where(eq(rides.id, rideId))
    .limit(1);

  // Fail closed if driver or ride missing
  if (!driverRow || !rideRow || driverRow.status !== 'active' || driverRow.is_online !== true) {
    return { billed: false, balanceAfter: null };
  }

  // Require vehicle type equality (guards against mid-chain vehicle switch)
  if (driverRow.vehicle_type !== rideRow.vehicle_type) {
    logger.info('[leadBilling] driver vehicle_type drifted mid-chain — skipping debit', { rideId, driverId });
    return { billed: false, balanceAfter: null };
  }

  // Pass womenOnlyFeatureEnabled directly from params (zero additional DB queries inside tx)
  const isStillEligible = isDriverEligibleForRideGender({
    driverGender: driverRow.gender,
    driverGenderVerified: driverRow.gender_verified,
    driverWomenOnlyEnabled: Boolean(driverRow.women_only_enabled),
    rideWomenOnly: Boolean(rideRow.women_only),
    vehicleType: rideRow.vehicle_type as VehicleTypeEnum,
    womenOnlyFeatureEnabled: params.womenOnlyFeatureEnabled ?? false,
  });

  if (!isStillEligible) {
    logger.info('[leadBilling] driver drifted ineligible mid-chain — skipping debit', { rideId, driverId });
    return { billed: false, balanceAfter: null };
  }

  // 5. Insert dispatch_offers row. onConflictDoNothing NEVER throws, so the
  //    conflict must be detected via the empty returning() set: zero rows
  //    returned = the (ride_id, driver_id) unique index matched an existing
  //    row → this driver was already offered/billed for this ride → skip
  //    WITHOUT inserting call_ledger (exactly-once per driver per ride).
  const insertedOffer = await tx
    .insert(dispatchOffers)
    .values({
      ride_id: rideId,
      driver_id: driverId,
      batch_index: chainIndex,
      sent_at: new Date(),
      outcome: 'delivered',
    })
    .onConflictDoNothing()
    .returning({ id: dispatchOffers.id });

  if (insertedOffer.length === 0) {
    logger.debug('[leadBilling] offer row already exists — skipping driver', {
      rideId,
      driverId,
    });
    return { billed: false, balanceAfter: null };
  }

  // 6. Insert call_ledger deduction. A 23505 here means a deduction row
  //    already exists for (ride_id, driver_id) (e.g. a pre-Phase-D leftover)
  //    — throw the sentinel so the WHOLE tx rolls back (no orphan offer row)
  //    and the driver is reported as not billed.
  const newBalance = callsRemaining === -1 ? -1 : callsRemaining - 1;
  try {
    await tx.insert(callLedger).values({
      subscription_id: lockedSub.id,
      driver_id: driverId,
      ride_id: rideId,
      event_type: 'deduction',
      delta: -1,
      balance_after: newBalance,
      reason: 'offer_sent',
    });
  } catch (e: unknown) {
    // S6 fix: drizzle wraps driver errors in DrizzleQueryError — the 23505
    // lives on the cause chain, so the bare `e.code` check NEVER matched a
    // real DB and this graceful skip degraded to a thrown error (tx still
    // rolled back — no double-billing — but the chain aborted). Shared
    // cause-chain unwrap from lib/idempotency.ts (the S4 fix), reused here.
    if (driverErrorCode(e) === '23505') {
      throw new SkipBillingError();
    }
    throw e;
  }

  // 7. Update subscription
  await tx
    .update(subscriptions)
    .set({
      calls_remaining: newBalance,
      daily_calls_used: dailyUsed + 1,
      total_deductions: (lockedSub.total_deductions ?? 0) + 1,
      updated_at: new Date(),
    })
    .where(eq(subscriptions.id, lockedSub.id));

  logger.info('[leadBilling] debited lead', {
    rideId,
    driverId,
    subscriptionId: lockedSub.id,
    balanceAfter: newBalance,
  });

  return { billed: true, balanceAfter: newBalance };
}

/**
 * Thin wrapper: open one transaction per offer so the dispatch_offers row
 * and the call_ledger debit commit or roll back together. The sequential
 * dispatch pipeline calls this — one offer per transaction. SkipBillingError
 * from inside the tx surfaces as billed=false (with a full rollback).
 *
 * Zero DB queries run here for config: womenOnlyFeatureEnabled arrives on
 * params, read once per dispatch by the caller (APP_POOL_SIZE = 5 safety).
 */
export async function debitLeadForOfferTx(
  params: DebitLeadParams,
): Promise<DebitResult> {
  try {
    return await db.transaction(async (tx) => debitLeadForOffer(tx, params));
  } catch (e) {
    if (e instanceof SkipBillingError) {
      return { billed: false, balanceAfter: null };
    }
    throw e;
  }
}
