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
  commissionEnrollments,
  callLedger,
  drivers,
  rides,
} from '../src/db/schema';
import { eq, and, isNull, sql, desc } from 'drizzle-orm';
import { logger } from '../lib/logger';
import { driverErrorCode } from '../lib/idempotency';
import { isDriverEligibleForRideGender } from '../lib/womenOnlyEligibility';
import { type VehicleTypeEnum } from '../lib/vehicleTypes';
import type { RevenueModel } from '../lib/platformConfig';

export interface DebitResult {
  billed: boolean;
  balanceAfter: number | null;
  /**
   * The durable monetization mode bound onto dispatch_offers.monetization_mode
   * (S7 / M-01): 'subscription' when the driver holds a usable call package
   * (the lead WAS debited), 'commission' when an active commission enrollment
   * governs (no lead debited — the offer row still commits), 'none' when the
   * driver holds neither product (skip). Derived from possession rows per
   * driver (§3.5) — never from the pool-level kill switch.
   */
  mode: 'subscription' | 'commission' | 'none';
}

export interface DebitLeadParams {
  rideId: string;
  driverId: string;
  /** Position of this offer in the sequential chain (dispatch_offers.batch_index). Default 0. */
  chainIndex?: number;
  womenOnlyFeatureEnabled: boolean;
  /**
   * Retained for interface stability. Classification is per-driver
   * possession (§3.5) — `revenue_model` no longer decides whether an offer
   * requires a subscription; it remains the fresh-read kill switch consumed
   * by dispatch.ts (ceiling gate) and index.ts. Omitted → 'subscription_only'.
   */
  revenueModel?: RevenueModel;
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
 * Item 12 — per-driver classification (§3.5): the driver's mode is derived
 * from possession rows, never from the pool-level kill switch:
 *   - usable active call subscription → mode='subscription', debited below
 *   - active commission enrollment       → mode='commission', offer row
 *     commits with NO call_ledger row (per-ride commission instead)
 *   - neither                            → mode='none', skipped, zero writes
 *
 * Steps (subscription mode only):
 *  1. Resolve driver's active subscription (latest expiry first)
 *  2. SELECT ... FOR UPDATE on subscription (Z-4 serialization)
 *  3. Daily-cap guard (defense-in-depth behind the pool filter)
 *  4. Balance guard (-1 = unlimited sentinel)
 *
 * Steps common to both billable modes:
 *  4b. Account-status + mid-chain drift guard (F-9.1, S8)
 *  5. Insert dispatch_offers row carrying monetization_mode (= mode); a
 *      (ride_id, driver_id) conflict → skip driver entirely (exactly-once)
 *  5b. Commission mode stops here: the offer row is the only write.
 *  6. Subscription mode: insert call_ledger deduction ('offer_sent'); a
 *      23505 throws SkipBillingError → full tx rollback.
 *  7. Subscription mode: update calls_remaining / daily_calls_used /
 *      total_deductions.
 */
export async function debitLeadForOffer(
  tx: DbTx,
  params: DebitLeadParams,
): Promise<DebitResult> {
  const { rideId, driverId, chainIndex = 0 } = params;

  // ── 1. Per-driver possession classification (§3.5) ─────────────────────
  // Usable call subscription wins (G1: one product active at a time);
  // otherwise an active commission enrollment governs; otherwise the driver
  // holds no product and is skipped.
  let lockedSub: typeof subscriptions.$inferSelect | undefined;
  let mode: 'subscription' | 'commission' | 'none' = 'none';
  let callsRemaining = -1;
  let dailyUsed = 0;

  const [sub] = await tx
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.driver_id, driverId),
        eq(subscriptions.status, 'active'),
        sql`${subscriptions.expires_at} > now()`,
        isNull(subscriptions.frozen_at),
      ),
    )
    .orderBy(desc(subscriptions.expires_at))
    .limit(1);

  if (sub) {
    // ── Subscription mode: draw one call lead ────────────────────────────
    mode = 'subscription';

    // 2. FOR UPDATE on subscription row (Z-4 serialization)
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, sub.id))
      .for('update');

    if (!row) return { billed: false, balanceAfter: null, mode: 'none' };
    lockedSub = row;

    // 3. Daily-cap guard (daily_cap lives on packages, not subscriptions)
    const [pkg] = await tx
      .select({ daily_cap: packages.daily_cap })
      .from(packages)
      .where(eq(packages.id, row.package_id))
      .limit(1);
    const dailyCap = pkg?.daily_cap ?? 200;
    dailyUsed = row.daily_calls_used ?? 0;
    if (dailyUsed >= dailyCap) {
      return { billed: false, balanceAfter: null, mode: 'none' };
    }

    // 4. Balance guard (-1 = unlimited)
    callsRemaining = row.calls_remaining;
    if (callsRemaining !== -1 && callsRemaining <= 0) {
      return { billed: false, balanceAfter: null, mode: 'none' };
    }
  } else {
    // ── 1b. Commission mode: active enrollment, no lead debit ────────────
    const [enr] = await tx
      .select()
      .from(commissionEnrollments)
      .where(
        and(
          eq(commissionEnrollments.driver_id, driverId),
          eq(commissionEnrollments.status, 'active'),
        ),
      )
      .limit(1);

    if (!enr) {
      // Neither product — skip driver, zero writes
      return { billed: false, balanceAfter: null, mode: 'none' };
    }
    mode = 'commission';
  }

  // ── 4b. Account-status + mid-chain drift guard (F-9.1, S8) ─────────────
  // Applies to both modes: the pool filtered status='active' + is_online at
  // build time; pool build and this debit can be minutes apart on a long
  // chain. A driver suspended (or offline) in between must not be debited or
  // offered. Plain reads — nothing else writes these rows on the online path.
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
    return { billed: false, balanceAfter: null, mode };
  }

  // Require vehicle type equality (guards against mid-chain vehicle switch)
  if (driverRow.vehicle_type !== rideRow.vehicle_type) {
    logger.info('[leadBilling] driver vehicle_type drifted mid-chain — skipping debit', { rideId, driverId });
    return { billed: false, balanceAfter: null, mode };
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
    return { billed: false, balanceAfter: null, mode };
  }

  // ── 5. Insert dispatch_offers row carrying monetization_mode ────────────
  const insertedOffer = await tx
    .insert(dispatchOffers)
    .values({
      ride_id: rideId,
      driver_id: driverId,
      batch_index: chainIndex,
      sent_at: new Date(),
      outcome: 'delivered',
      monetization_mode: mode,
    })
    .onConflictDoNothing()
    .returning({ id: dispatchOffers.id });

  if (insertedOffer.length === 0) {
    logger.debug('[leadBilling] offer row already exists — skipping driver', {
      rideId,
      driverId,
    });
    return { billed: false, balanceAfter: null, mode };
  }

  // ── 5b. Commission mode: the offer row is the only write ────────────────
  // No call_ledger row, no subscription counter update, balanceAfter is null
  // because no call balance is involved.
  if (mode === 'commission') {
    logger.info('[leadBilling] commission — offer delivered without lead debit', {
      rideId,
      driverId,
      chainIndex,
    });
    return { billed: true, balanceAfter: null, mode: 'commission' };
  }

  // Defensive: subscription mode always sets lockedSub before reaching here.
  if (!lockedSub) {
    return { billed: false, balanceAfter: null, mode: 'none' };
  }

  // ── 6. Insert call_ledger deduction ─────────────────────────────────────
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

  // ── 7. Update subscription ──────────────────────────────────────────────
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

  return { billed: true, balanceAfter: newBalance, mode: 'subscription' };
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
      return { billed: false, balanceAfter: null, mode: 'none' };
    }
    throw e;
  }
}
