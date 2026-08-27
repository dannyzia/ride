// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { rides, pricing, drivers, driverWalletTransactions, riderSubscriptions, rideExtraCharges, riderWalletTransactions, users, pickupDistanceSamples, tripTimeSamples, zoneRecoverySamples } from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { calculateFare, calculateV6Fare, type V6PricingRow } from "@/lib/fareCalc";
import { logger } from "@/lib/logger";
import { sendNotification } from "@/lib/notify";
import { z } from "zod";
import { recordRideCompletion, recordTip } from '@/lib/accounting';
import { percentOf } from '@/lib/money';
import { evaluateStreaks } from '@/lib/gamification';
import { earnCashback } from '@/lib/walletCashback';
import { spendZoneBudget } from '@/lib/zoneBudget';
import { computeCompletionWalletReceivable } from '@/lib/rideCompletionWallet';
import { getFareFrameworkConfig, parseConfigBool, parseConfigNumber } from '@/lib/fareFrameworkConfig';
import { PICKUP_CATEGORY } from '@/lib/vehicleTypes';
import { PICKUP_TRUEUP_CONFIG_KEYS, computePickupTrueup, type PickupTrueupResult } from '@/lib/pickupTrueup';
import { pickupFeeV6 } from '@/lib/pickupFee';
import { lookupZoneFee } from '@/lib/zoneFee';
import * as errors from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/");
const rideId = segments[segments.indexOf("ride") + 1];
     if (!rideId)
       return Response.json({ error: 'missing_ride_id', message: 'Ride ID is required' }, { status: 400 });
     const uuidParam = z.string().uuid().safeParse(rideId);
     if (!uuidParam.success) {
       return Response.json({ error: 'invalid_uuid', message: 'Invalid UUID format' }, { status: 400 });
     }

     const { dbUser: user } = await requireRole("driver")(request);

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!ride)
      return Response.json({ error: 'ride_not_found', message: 'Ride not found' }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: 'not_your_ride', message: 'This ride does not belong to you' }, { status: 403 });
    }
    if (ride.status !== "in_progress") {
      return Response.json(
        {
          error: "invalid_status",
          message: `Cannot complete ride in status: ${ride.status}`,
        },
        { status: 409 },
      );
    }

    // Get pricing for fare calculation
    const [pricingRow] = await db
      .select()
      .from(pricing)
      .where(eq(pricing.id, ride.pricing_id))
      .limit(1);
    if (!pricingRow) {
      return Response.json({ error: 'pricing_not_found', message: 'Pricing configuration not found' }, { status: 500 });
    }

    // Compute ride time using the timer rule:
    //   timer_start = min(arrived_at + max_free_wait_seconds, started_at)
    //   If arrived_at IS NULL, timer_start = started_at
    //   ride_time_min = CEIL((completed_at - timer_start) / 60000)
    // Read grace from the pricing row — the single source of truth.
    // pricing.free_wait_minutes is per zone × vehicle_type (finer than per-category).
    const freeWaitMs = (pricingRow.free_wait_minutes ?? 3) * 60_000;
    const completedAt = new Date();
    const startedAt = ride.started_at ? new Date(ride.started_at) : completedAt;
    const arrivedAt = ride.arrived_at ? new Date(ride.arrived_at) : null;

    let timerStart: Date;
    if (arrivedAt) {
      const freeWaitExpiry = new Date(arrivedAt.getTime() + freeWaitMs);
      timerStart = new Date(
        Math.min(freeWaitExpiry.getTime(), startedAt.getTime()),
      );
    } else {
      timerStart = startedAt;
    }

    const rideTimeMin = Math.max(
      0,
      Math.ceil((completedAt.getTime() - timerStart.getTime()) / 60_000),
    );

    // P1-3: Subtract chargeable wait minutes from ride time to avoid double-billing.
    // wait_fee_bdt is added separately below; those minutes must not also be in the per-minute charge.
    const waitFeePaisa = Number(ride.wait_fee_bdt ?? 0);
    const waitFeePerMin = Number(pricingRow.wait_fee_per_minute_bdt ?? 0);
    const chargeableWaitMin = waitFeePerMin > 0 ? Math.floor(waitFeePaisa / waitFeePerMin) : 0;
    const effectiveRideTimeMin = Math.max(0, rideTimeMin - chargeableWaitMin);

    const distanceKm = parseFloat(ride.distance_km?.toString() ?? "0");

    // Preserve intercity split from the original fare_breakdown.
    // Scale inside/outside proportionally to actual distance.
    const existingBreakdown = ride.fare_breakdown as Record<string, unknown> | null;
    const origInsideKm = Number(existingBreakdown?.inside_km ?? 0);
    const origOutsideKm = Number(existingBreakdown?.outside_km ?? 0);
    const origTotalKm = origInsideKm + origOutsideKm;
    const originCity =
      (existingBreakdown?.origin_city as string | null) ?? null;
    const isIntercity = Boolean(existingBreakdown?.is_intercity ?? false);

    let insideKm = distanceKm;
    let outsideKm = 0;
    if (origTotalKm > 0 && origOutsideKm > 0) {
      const scale = distanceKm / origTotalKm;
      insideKm = Math.round(origInsideKm * scale * 1000) / 1000;
      outsideKm = Math.round(origOutsideKm * scale * 1000) / 1000;
    }

    // Recalculate fare with actual ride time
    const fare = calculateFare(
      {
        base_fare_bdt: pricingRow.base_fare_bdt,
        per_km_bdt: pricingRow.per_km_bdt,
        intercity_per_km_bdt: pricingRow.intercity_per_km_bdt ?? 0,
        per_min_bdt: pricingRow.per_min_bdt,
        floor_length_km: Number(pricingRow.floor_length_km ?? 0),
        floor_min: pricingRow.floor_min ?? 0,
        brta_fare_ceiling_bdt: pricingRow.brta_fare_ceiling_bdt,
        platform_commission_percent: Number(
          pricingRow.platform_commission_percent ?? 0,
        ),
      },
      insideKm,
      effectiveRideTimeMin,
      undefined,
      outsideKm,
      originCity,
      isIntercity,
    );

    // ── v6 shadow (PATCH 1): recompute with actual ride time, log to shadow ──
    // Commission is always 0% in v6 (subscription-only revenue). Shadow
    // models the FUTURE engine — pass 0, not the v2 commission rate.
    const v6NightMult = 1.0; // Stage 0: night_mult ships disabled

    // v6 pickup fee: compute from firm/realized data using the v6 formula
    // (flat 1.0×, two dimensions, pinned cap sequence — PATCH 3).
    let v6PickupFeeBdt = 0;
    if (ride.pickup_fee_state === 'firm' && ride.pickup_realized_km != null) {
      const pickupCategory = PICKUP_CATEGORY[ride.vehicle_type];
      const fwCfg = await getFareFrameworkConfig([
        'pickup_free_radius_km_bike', 'pickup_free_radius_km_cng', 'pickup_free_radius_km_car',
        'pickup_free_time_min_bike', 'pickup_free_time_min_cng', 'pickup_free_time_min_car',
        'pickup_cap_pct_of_fare',
        'pickup_cap_billable_km_bike', 'pickup_cap_billable_km_cng', 'pickup_cap_billable_km_car',
      ]);
      const freeRadiusKm = parseConfigNumber(
        fwCfg[`pickup_free_radius_km_${pickupCategory}`], 1.0,
      );
      const freePickupMin = parseConfigNumber(
        fwCfg[`pickup_free_time_min_${pickupCategory}`], 3,
      );
      const capPct = parseConfigNumber(fwCfg.pickup_cap_pct_of_fare, 25);
      const capBillableKm = parseConfigNumber(
        fwCfg[`pickup_cap_billable_km_${pickupCategory}`], 2.0,
      );

      const realizedKm = Number(ride.pickup_realized_km);
      // Pickup time: matched_at → arrived_at (time spent going to pickup)
      const matchedAt = ride.matched_at ? new Date(ride.matched_at) : null;
      const arrivedAt2 = ride.arrived_at ? new Date(ride.arrived_at) : null;
      const pickupMin = (matchedAt && arrivedAt2)
        ? Math.max(0, (arrivedAt2.getTime() - matchedAt.getTime()) / 60_000)
        : 0;

      // fareBeforePickup = v2 trip fare (base + distance + time)
      const fareBeforePickup = fare.total_bdt;

      v6PickupFeeBdt = pickupFeeV6({
        pickupKm: realizedKm,
        pickupMin,
        freeRadiusKm,
        freePickupMin,
        kmRate: pricingRow.per_km_bdt,
        timeRate: pricingRow.per_min_bdt,
        capBillableKm,
        capPct,
        fareBeforePickup,
      });
    }

    // v6 zone fee: look up from schedule (0 in Stage 0 when zone_fee_enabled=false)
    const v6ZoneFeeBdt = await lookupZoneFee(
      ride.zone_id,
      PICKUP_CATEGORY[ride.vehicle_type],
    );

    const v6FareBreakdown = calculateV6Fare({
      pricing: {
        base_fare_bdt: pricingRow.base_fare_bdt,
        base_km: Number(pricingRow.base_km ?? 0),
        initiation_minutes: pricingRow.initiation_minutes ?? 4,
        per_km_bdt: pricingRow.per_km_bdt,
        intercity_per_km_bdt: pricingRow.intercity_per_km_bdt ?? 0,
        per_min_bdt: pricingRow.per_min_bdt,
        floor_length_km: Number(pricingRow.floor_length_km ?? 0),
        floor_min: pricingRow.floor_min ?? 0,
        brta_fare_ceiling_bdt: pricingRow.brta_fare_ceiling_bdt,
        platform_commission_percent: 0, // v6 = 0% commission (subscription-only)
      } as V6PricingRow,
      trip_km: insideKm + outsideKm,
      ride_time_min: effectiveRideTimeMin,
      night_mult: v6NightMult,
      grace_min: pricingRow.free_wait_minutes ?? 3,
      wait_min: chargeableWaitMin, // real chargeable wait minutes (P1-3)
      pickup_fee_bdt: v6PickupFeeBdt,
      zone_fee_bdt: v6ZoneFeeBdt,
      inside_km: insideKm,
      outside_km: outsideKm,
      origin_city: originCity,
      is_intercity: isIntercity,
    });

    // Ruling 18: the true-up's %-of-fare backstop re-check basis — the
    // completion-recalculated TRIP fare (base + distance + time, post-floor),
    // snapshotted BEFORE the wait fee, extra charges, or pickup fee are
    // layered on.
    const recalculatedTripFarePaisa = fare.total_bdt;

    // ── Waiting time fee ────────────────────────────────────────────────
    // Kept in its own wait_fee_bdt field.
    const waitFee = Number(ride.wait_fee_bdt ?? 0);
    if (waitFee > 0) {
      fare.total_bdt += waitFee;
      fare.wait_fee_bdt = (fare.wait_fee_bdt ?? 0) + waitFee;
      const commPct = Number(pricingRow.platform_commission_percent ?? 0);
      if (commPct > 0) {
        fare.platform_commission_bdt = percentOf(fare.total_bdt, commPct);
        fare.driver_net_bdt = fare.total_bdt - fare.platform_commission_bdt;
      }
    }

    // ── Discount is locked at request time (applied_discount_bdt) ──────
    // Driver always gets FULL fare; discount applied to rider_payable only

    // ── P1-4: Approved extra charges (toll/parking) — NOT commissionable ──
    // Placed after commission recalc so extra charges don't inflate commission base.
    const extraCharges = await db.select({ amount_bdt: rideExtraCharges.amount_bdt })
      .from(rideExtraCharges)
      .where(and(eq(rideExtraCharges.ride_id, rideId), eq(rideExtraCharges.status, 'approved')));
    const extraChargeTotal = extraCharges.reduce((sum, c) => sum + Number(c.amount_bdt ?? 0), 0);
    if (extraChargeTotal > 0) {
      fare.total_bdt += extraChargeTotal;
      fare.driver_net_bdt = fare.total_bdt - (fare.platform_commission_bdt ?? 0);
    }

    // ── Phase F quote state 3: pickup fee true-up + charge ─────────────
    // Rulings 1/14: the pickup fee is DRIVER COMPENSATION, not platform
    // revenue — the final fee is added to the receipt totals below
    // (total/driver_net; rider_payable, driver_fare, cash_to_collect derive
    // from them) but NEVER to the commission base or the recordRideCompletion
    // input, which stay on the pre-pickup figure captured here.
    // Ruling 16: fee disabled (Stage 0) → charge nothing, persist 'trued'
    // state only; realized measurement is already on the ride row.
    const fareTotalBeforePickupPaisa = fare.total_bdt;
    let pickupTrueup: PickupTrueupResult | null = null;
    if (ride.pickup_fee_state === "firm") {
      const fwCfg = await getFareFrameworkConfig(PICKUP_TRUEUP_CONFIG_KEYS);
      const pickupCategory = PICKUP_CATEGORY[ride.vehicle_type];
      pickupTrueup = computePickupTrueup(
        {
          pickup_fee_state: ride.pickup_fee_state,
          pickup_fee_firm_bdt: ride.pickup_fee_firm_bdt ?? null,
          pickup_firm_km: ride.pickup_firm_km ?? null,
          pickup_realized_km: ride.pickup_realized_km ?? null,
          pickup_realized_confidence: ride.pickup_realized_confidence ?? null,
        },
        {
          feeEnabled: parseConfigBool(fwCfg.pickup_fee_enabled),
          freeRadiusKm: parseConfigNumber(
            fwCfg[`pickup_free_radius_km_${pickupCategory}`],
            0,
          ),
          capBillableKm: parseConfigNumber(
            fwCfg[`pickup_cap_billable_km_${pickupCategory}`],
            2.0,
          ),
          backstopPct: parseConfigNumber(fwCfg.pickup_cap_pct_of_fare, 40),
          minConfidence: parseConfigNumber(fwCfg.pickup_origin_confidence_min, 0.7),
          capMultiplier: parseConfigNumber(fwCfg.pickup_trueup_cap_multiplier, 1.25),
          zonePerKmBdt: pricingRow.per_km_bdt,
          category: pickupCategory,
          recalculatedTripFareBdt: recalculatedTripFarePaisa,
        },
      );
      if (pickupTrueup.finalFeeBdt != null) {
        // Receipt totals carry the fee; commission is NOT recomputed here —
        // the fee must never leak into the commission base (ruling 1).
        fare.total_bdt += pickupTrueup.finalFeeBdt;
        fare.driver_net_bdt += pickupTrueup.finalFeeBdt;
      }
    }

    // ── Zone fee (v6 §3): 100% to driver, not commission base ──────────
    // Stage 0: zone_fee_enabled=false → zoneFeeBdt=0 always. Computed but inert.
    const zoneFeeBdt = 0; // TODO(C-9): lookupZoneFee() when zone_fee_enabled=true
    if (zoneFeeBdt > 0) {
      fare.total_bdt += zoneFeeBdt;
      fare.driver_net_bdt += zoneFeeBdt;
    }

    // ── Locked discount from request time ──────────────────────────────
    const storedPrefSurcharge = Number(ride.preference_surcharge_bdt ?? 0);
    let appliedDiscountBdt = Number(ride.applied_discount_bdt ?? 0);

    // N3: an upfront tip promised at request must never vanish silently. If
    // the rider's wallet can't cover it at completion, record the forfeited
    // amount on the ride so the driver's UI can surface it.
    let upfrontTipForfeitedBdt = 0;
    // H-3: hoisted so the response can report the rider's real out-of-pocket
    // and what was already settled from the wallet.
    let finalRiderPayableBdt = 0;
    let walletDebitBdt = 0;

    await db.transaction(async (tx) => {
      const upfrontTip = Number(ride.upfront_tip_bdt ?? 0);
      let tipApplied = false;
      if (upfrontTip > 0) {
        const [rider] = await tx.select({ wallet: users.rider_wallet_balance_bdt })
          .from(users).where(eq(users.id, ride.user_id)).for("update").limit(1);
        if (rider.wallet < upfrontTip) {
          upfrontTipForfeitedBdt = upfrontTip;
          logger.warn('[complete] rider insufficient balance for upfront tip', { rideId, tip: upfrontTip, balance: rider.wallet, forfeited: true });
        } else {
          await tx.update(users).set({
            rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} - ${upfrontTip}`
          }).where(eq(users.id, ride.user_id));
          await tx.insert(riderWalletTransactions).values({
            rider_id: ride.user_id,
            amount_bdt: -upfrontTip,
            transaction_type: 'upfront_tip',
            reference_id: ride.id,
            balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${ride.user_id})`,
          });
          fare.driver_net_bdt += upfrontTip;
          tipApplied = true;
          walletDebitBdt += upfrontTip;
        }
       }

      if (ride.applied_discount_type === 'wallet' && appliedDiscountBdt > 0) {
        const [rider] = await tx.select({ wallet: users.rider_wallet_balance_bdt })
          .from(users).where(eq(users.id, ride.user_id)).for("update").limit(1);
        if (rider.wallet >= appliedDiscountBdt) {
          await tx.update(users).set({
            rider_wallet_balance_bdt: sql`${users.rider_wallet_balance_bdt} - ${appliedDiscountBdt}`
          }).where(eq(users.id, ride.user_id));
          await tx.insert(riderWalletTransactions).values({
            rider_id: ride.user_id,
            amount_bdt: -appliedDiscountBdt,
            transaction_type: 'cashback_redeem',
            reference_id: ride.id,
            balance_after: sql`(SELECT rider_wallet_balance_bdt FROM users WHERE id = ${ride.user_id})`,
          });
          walletDebitBdt += appliedDiscountBdt;
        } else {
          logger.warn('[complete] rider insufficient wallet for redemption', { rideId, amount: appliedDiscountBdt, balance: rider.wallet });
          appliedDiscountBdt = 0;
        }
      }

      const [updatedRide] = await tx
        .update(rides)
        .set({
          status: "completed",
          completed_at: completedAt,
          platform_commission_bdt: fare.platform_commission_bdt,
          fare_breakdown: fare as any,
          updated_at: completedAt,
          rider_payable_bdt: fare.total_bdt + storedPrefSurcharge - appliedDiscountBdt + (tipApplied ? upfrontTip : 0),
          driver_fare_bdt: fare.driver_net_bdt + storedPrefSurcharge + (fare.platform_commission_bdt ?? 0),
          upfront_tip_forfeited_bdt: upfrontTipForfeitedBdt,
          // Phase F quote state 3: one-time 'firm' → 'trued' transition.
          // Fee off (Stage 0) → final/delta stay null: nothing was charged.
          ...(pickupTrueup?.applies
            ? {
                pickup_fee_state: "trued" as const,
                pickup_fee_final_bdt: pickupTrueup.finalFeeBdt,
                pickup_trueup_delta_bdt: pickupTrueup.deltaBdt,
              }
            : {}),
          // v6 shadow (PATCH 1): recompute at completion with actual ride time
          fare_v6_shadow: v6FareBreakdown as any,
          fare_v6_shadow_computed_at: completedAt,
          // v6 zone fee — 100% to driver, no commission
          zone_fee_bdt: zoneFeeBdt,
        })
        .where(and(eq(rides.id, rideId), eq(rides.status, "in_progress")))
        .returning();

      if (!updatedRide) {
        throw new Error("TOCTOU: ride not in progress or already completed");
      }
      finalRiderPayableBdt = Number(updatedRide.rider_payable_bdt ?? 0);

      // Phase F Stage 0 harvester (ruling 16): one pickup_distance_samples
      // row per firmed ride — in BOTH measurement-only and charge mode.
      // charged=true only when a positive fee was actually charged.
      if (pickupTrueup?.insertSample) {
        await tx.insert(pickupDistanceSamples).values({
          ride_id: rideId,
          zone_id: ride.zone_id,
          vehicle_type: ride.vehicle_type,
          category: PICKUP_CATEGORY[ride.vehicle_type],
          // Request-time reference km is not persisted on the ride row.
          quote_km: null,
          firm_km: pickupTrueup.firmKm != null ? String(pickupTrueup.firmKm) : null,
          realized_km: pickupTrueup.realizedKm != null ? String(pickupTrueup.realizedKm) : null,
          charged: (pickupTrueup.finalFeeBdt ?? 0) > 0,
          cap_was_binding: pickupTrueup.capWasBinding,
          backstop_was_binding: pickupTrueup.backstopWasBinding,
        });
      }

      // ── v6 Telemetry E-2: trip_time_samples (time-rate calibration) ──
      const startHourBdt = (completedAt.getUTCHours() + 6) % 24; // Asia/Dhaka
      await tx.insert(tripTimeSamples).values({
        ride_id: rideId,
        zone_id: ride.zone_id,
        vehicle_type: ride.vehicle_type,
        trip_km: String(distanceKm),
        trip_minutes: String(rideTimeMin),
        billed_minutes: effectiveRideTimeMin,
        estimated_minutes: null, // TODO: capture from estimate response
        night_mult_applied: String(v6NightMult),
        start_hour_bdt: startHourBdt,
      }).catch((e) => logger.warn('[complete] trip_time_samples insert failed', { rideId, error: String(e) }));

      // ── v6 Telemetry E-3: zone_recovery_samples (zone fee derivation) ──
      // Only insert if driver is known (driver cancelled rides still have driver_id)
      if (ride.driver_id) {
        await tx.insert(zoneRecoverySamples).values({
          zone_id: ride.zone_id,
          driver_id: ride.driver_id,
          dropped_at: completedAt,
          next_accepted_at: null, // filled by future acceptance
          recovery_minutes: null, // filled by future acceptance or exit
        }).catch((e) => logger.warn('[complete] zone_recovery_samples insert failed', { rideId, error: String(e) }));
      }

      // Phase C: Earn cashback on the rider's payable (discounted) fare
      const riderPayableBdt = Number(updatedRide.rider_payable_bdt ?? 0);
      if (riderPayableBdt > 0) {
        await earnCashback(tx, ride.id, ride.user_id, riderPayableBdt);
      }

      // 06-API steps 9–10: the only completion-time driver-wallet receivable
      // is the platform-funded promo subsidy (snapshotted at request as
      // rides.promo_code_id + platform_subsidy_bdt) — never the cash fare.
      // The driver collects driver_net in cash (L13); crediting it here would
      // pay fares out of withdrawable top-up money on the first payout.
      // Referral receivables have no completion trigger in this schema (no
      // rides.referral_* columns) — they settle via /api/user/referral.
      const receivable = computeCompletionWalletReceivable(ride);
      if (receivable) {
        await tx.insert(driverWalletTransactions).values({
          driver_id: driver.id,
          transaction_type: receivable.transaction_type,
          amount_bdt: receivable.amount_bdt,
          reference_id: receivable.reference_id,
          balance_after: sql`(SELECT driver_wallet_balance_bdt FROM drivers WHERE id = ${driver.id}) + ${receivable.amount_bdt}`,
        });

        await tx
          .update(drivers)
          .set({
            driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${receivable.amount_bdt}`,
            updated_at: new Date(),
          })
          .where(eq(drivers.id, driver.id));
      }

      // Phase D: Deduct platform-funded discount from zone budget
      if (
        ride.applied_discount_type !== "wallet" &&
        appliedDiscountBdt > 0 &&
        ride.zone_id
      ) {
        await spendZoneBudget(tx, ride.zone_id, appliedDiscountBdt, ride.id);
      }

    });

    // ── Rider pass usage increment (only if pass discount was used) ─────
    // W-2: burn the quota of exactly the pass that supplied the discount
    // (snapshotted at request as rides.pass_subscription_id). The old code
    // incremented EVERY active subscription — with two stacked passes each
    // discounted ride burned quota on both. Legacy rides without the snapshot
    // fall back to the old behavior.
    if (ride.applied_discount_type === 'pass') {
      try {
        await db.update(riderSubscriptions)
          .set({ rides_used: sql`${riderSubscriptions.rides_used} + 1` })
          .where(
            ride.pass_subscription_id
              ? eq(riderSubscriptions.id, ride.pass_subscription_id)
              : and(
                  eq(riderSubscriptions.rider_id, ride.user_id),
                  eq(riderSubscriptions.status, 'active'),
                ),
          );
      } catch { /* non-blocking */ }
    }

    // ── Accounting entries (non-blocking) ──────────────────────────────
    // Ruling 14: accounting input is the TRIP-fare-only figure — the pickup
    // fee is a driver pass-through, never platform revenue, so it is excluded
    // from finalFarePaisa (and from the commission computed off it).
    try {
      await recordRideCompletion({
        id: rideId, finalFarePaisa: fareTotalBeforePickupPaisa,
        commissionPct: Number(pricingRow.platform_commission_percent ?? 0),
        driverId: driver.id, riderId: ride.user_id,
        zoneId: ride.zone_id,
      });
    } catch (e) { logger.warn('[accounting] ride completion failed', e); }
    if (ride.tip_bdt && ride.tip_bdt > 0) {
      try { await recordTip({ id: rideId, tipPaisa: ride.tip_bdt ?? 0, driverId: driver.id, zoneId: ride.zone_id }); }
      catch (e) { logger.warn('[accounting] tip entry failed', e); }
    }

    // ── Gamification: evaluate driver streaks (non-blocking) ──
    try {
      await evaluateStreaks(driver.id);
    } catch (e) { logger.warn('[gamification] evaluateStreaks failed', e); }

    logger.info("[ride/complete] ride completed", {
      rideId,
      driverId: driver.id,
      totalBdt: fare.total_bdt,
      driverNetBdt: fare.driver_net_bdt,
      rideTimeMin: effectiveRideTimeMin,
    });

    // Emit WebSocket event + push notification to rider
    if (ride.user_id) {
      sendNotification(ride.user_id, 'ride:completed', 'Ride Complete', 'Thanks for riding with us! Rate your driver.', { ride_id: rideId }).catch(() => {});
    }
    const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
    const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
    if (internalSecret && ride.user_id) {
      fetch(`http://127.0.0.1:${wsPort}/internal/ride/completed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalSecret}`,
        },
        signal: AbortSignal.timeout(3_000),
        body: JSON.stringify({
          ride_id: rideId,
          rider_user_id: ride.user_id,
          total_bdt: fare.total_bdt,
          driver_net_bdt: fare.driver_net_bdt,
          ride_time_min: rideTimeMin,
          fare_breakdown: fare,
        }),
      }).catch((e) =>
        logger.warn("[ride/complete] WS emit failed", { error: errors.getErrorMessage(e) }),
      );
    }

    return Response.json({
      ok: true,
      status: "completed",
      completed_at: completedAt.toISOString(),
      fare_breakdown: fare,
      upfront_tip_forfeited_bdt: upfrontTipForfeitedBdt,
      // H-3/H-B: the modal tells the driver how much cash to collect. The
      // gross fare overstates it whenever a wallet redemption or collected
      // tip settled part of the bill, so surface the rider's real
      // out-of-pocket (rider_payable_bdt), what the wallet covered
      // (wallet_debit_bdt), and the exact cash figure computed server-side.
      // cash_to_collect = total + surcharge − discount: the tip is never in
      // the cash amount (wallet-settled when collected, zero when forfeited),
      // and subtracting the discount once — NOT payable − debit, which would
      // subtract it twice (H-B).
      rider_payable_bdt: finalRiderPayableBdt,
      wallet_debit_bdt: walletDebitBdt,
      cash_to_collect_bdt: fare.total_bdt + storedPrefSurcharge - appliedDiscountBdt,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401 || errors.getErrorStatus(err) === 403) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: errors.getErrorStatus(err) ?? 500 });
    }
    logger.error("[ride/complete] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
