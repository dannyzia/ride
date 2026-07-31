// Auth: verifySupabaseToken via requireRole
import { db } from "@/src/db";
import { rides, pricing, drivers, driverWalletTransactions, riderSubscriptions, rideExtraCharges, riderWalletTransactions, users } from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { calculateFare } from "@/lib/fareCalc";
import { applySurge } from "@/lib/surge";
import { logger } from "@/lib/logger";
import { sendNotification } from "@/lib/notify";
import { recordRideCompletion, recordTip } from '@/lib/accounting';
import { evaluateStreaks } from '@/lib/gamification';

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split("/");
    const rideId = segments[segments.indexOf("ride") + 1];
    if (!rideId)
      return Response.json({ error: "missing_ride_id" }, { status: 400 });

    const { dbUser: user } = await requireRole("driver")(request);

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: "driver_not_found" }, { status: 404 });

    const [ride] = await db
      .select()
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    if (!ride)
      return Response.json({ error: "ride_not_found" }, { status: 404 });
    if (ride.driver_id !== driver.id) {
      return Response.json({ error: "not_your_ride" }, { status: 403 });
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
      return Response.json({ error: "pricing_not_found" }, { status: 500 });
    }

    // Compute ride time using the timer rule:
    //   timer_start = min(arrived_at + max_free_wait_seconds, started_at)
    //   If arrived_at IS NULL, timer_start = started_at
    //   ride_time_min = CEIL((completed_at - timer_start) / 60000)
    const MAX_FREE_WAIT_MS = 60_000; // system_config.max_free_wait_seconds (default 60)
    const completedAt = new Date();
    const startedAt = ride.started_at ? new Date(ride.started_at) : completedAt;
    const arrivedAt = ride.arrived_at ? new Date(ride.arrived_at) : null;

    let timerStart: Date;
    if (arrivedAt) {
      const freeWaitExpiry = new Date(arrivedAt.getTime() + MAX_FREE_WAIT_MS);
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

    // ── Surge pricing — use the ride's stored surge_multiplier (snapshotted at request) ──
    const rideSurgeMul = Number(ride.surge_multiplier ?? 1.0);
    if (rideSurgeMul > 1.0) {
      const surge = applySurge(Number(fare.total_bdt), rideSurgeMul);
      fare.total_bdt = surge.totalWithSurge;
      fare.surge_multiplier = surge.multiplier;
      fare.surge_fee_bdt = surge.surgeFeeBdt;
      const commPct = Number(pricingRow.platform_commission_percent ?? 0);
      if (commPct > 0) {
        fare.platform_commission_bdt = Math.floor(fare.total_bdt * commPct / 100);
        fare.driver_net_bdt = fare.total_bdt - fare.platform_commission_bdt;
      }
    }

    // ── Waiting time fee ────────────────────────────────────────────────
    const waitFee = Number(ride.wait_fee_bdt ?? 0);
    if (waitFee > 0) {
      fare.total_bdt += waitFee;
      fare.surge_fee_bdt = (fare.surge_fee_bdt ?? 0) + waitFee;
      const commPct = Number(pricingRow.platform_commission_percent ?? 0);
      if (commPct > 0) {
        fare.platform_commission_bdt = Math.floor(fare.total_bdt * commPct / 100);
        fare.driver_net_bdt = fare.total_bdt - fare.platform_commission_bdt;
      }
    }

    // ── P1-2: Re-apply stored rider pass discount (from fare_breakdown at request) ──
    const storedBreakdown = ride.fare_breakdown as Record<string, unknown> | null;
    const storedPassDiscount = Number(storedBreakdown?.pass_discount_bdt ?? 0);
    if (storedPassDiscount > 0) {
      fare.total_bdt -= storedPassDiscount;
      fare.pass_discount_bdt = storedPassDiscount;
      fare.pass_name = (storedBreakdown?.pass_name as string) ?? undefined;
      const commPct = Number(pricingRow.platform_commission_percent ?? 0);
      if (commPct > 0) {
        fare.platform_commission_bdt = Math.floor(fare.total_bdt * commPct / 100);
        fare.driver_net_bdt = fare.total_bdt - fare.platform_commission_bdt;
      }
    }

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

    // ── P1-2: Re-apply stored preference surcharge and promo discount ──
    const storedPrefSurcharge = Number(ride.preference_surcharge_bdt ?? 0);
    const storedPromoDiscount = Number(ride.promo_discount_bdt ?? 0);

    await db.transaction(async (tx) => {
      const upfrontTip = Number(ride.upfront_tip_bdt ?? 0);
      let tipApplied = false;
      if (upfrontTip > 0) {
        const [rider] = await tx.select({ wallet: users.rider_wallet_balance_bdt })
          .from(users).where(eq(users.id, ride.user_id)).limit(1);
        if (rider.wallet < upfrontTip) {
          logger.warn('[complete] rider insufficient balance for upfront tip', { rideId, tip: upfrontTip, balance: rider.wallet });
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
          rider_payable_bdt: fare.total_bdt + storedPrefSurcharge - storedPromoDiscount + (tipApplied ? upfrontTip : 0),
          driver_fare_bdt: fare.driver_net_bdt + storedPrefSurcharge + (fare.platform_commission_bdt ?? 0),
        })
        .where(and(eq(rides.id, rideId), eq(rides.status, "in_progress")))
        .returning();

      if (!updatedRide) {
        throw new Error("TOCTOU: ride not in progress or already completed");
      }

      await tx.insert(driverWalletTransactions).values({
        driver_id: driver.id,
        transaction_type: "adjustment",
        amount_bdt: fare.driver_net_bdt,
        balance_after: sql`(SELECT driver_wallet_balance_bdt FROM drivers WHERE id = ${driver.id}) + ${fare.driver_net_bdt}`,
      });

      await tx
        .update(drivers)
        .set({
          driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${fare.driver_net_bdt}`,
          updated_at: new Date(),
        })
        .where(eq(drivers.id, driver.id));
    });

    // ── Rider pass usage increment (non-blocking) ──────────────────────
    try {
      await db.update(riderSubscriptions)
        .set({ rides_used: sql`${riderSubscriptions.rides_used} + 1` })
        .where(and(eq(riderSubscriptions.rider_id, ride.user_id), eq(riderSubscriptions.status, 'active')));
    } catch { /* non-blocking */ }

    // ── Accounting entries (non-blocking) ──────────────────────────────
    try {
      await recordRideCompletion({
        id: rideId, finalFarePaisa: fare.total_bdt,
        commissionPct: Number(pricingRow.platform_commission_percent ?? 0),
        driverId: driver.id, riderId: ride.user_id,
      });
    } catch (e) { logger.warn('[accounting] ride completion failed', e); }
    if (ride.tip_bdt && ride.tip_bdt > 0) {
      try { await recordTip({ id: rideId, tipPaisa: ride.tip_bdt ?? 0, driverId: driver.id }); }
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
        logger.warn("[ride/complete] WS emit failed", { error: e.message }),
      );
    }

    return Response.json({
      ok: true,
      status: "completed",
      completed_at: completedAt.toISOString(),
      fare_breakdown: fare,
    });
  } catch (err: any) {
    if (err.status === 401 || err.status === 403) {
      return Response.json({ error: "unauthorized" }, { status: err.status });
    }
    logger.error("[ride/complete] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
