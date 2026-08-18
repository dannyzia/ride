import { db } from "../src/db";
import { DEFAULT_SURGE_THRESHOLDS, surgeRatio, pickSurgeMultiplier } from "../lib/hotspots";
import {
  rides,
  subscriptions,
  vehicleTypeChanges,
  drivers,
  usedChallenges,
  documents,
  chatMessages,
  compensationQueue,
  zones,
  surgeCurrent,
  surgeHistory,
  riderSubscriptions,
  dispatchOffers,
  callLedger,
  rateLimits,
  creditVouchers,
  ownerConsents,
  paymentEvents,
  incentiveDefinitions,
  driverIncentives,
  systemConfig,
  promoCodes,
  driverWalletTransactions,
  weatherConditions,
} from "../src/db/schema";
import { and, eq, lt, lte, isNull, isNotNull, sql, or, gte } from "drizzle-orm";
import { detectStationaryAnomaly } from "../lib/safety";
import { logger } from "../lib/logger";
import { recordCallRefund } from "./heartbeat";
import { nextBdtMidnightUtc } from "../lib/time";
import { resetAllBudgets } from "../lib/zoneBudget";
import { evaluateGraduation } from "../lib/zoneLifecycle";
import { expireCredits, expireRiderFeeDeductions } from "../lib/walletCashback";
import { runFraudDetection } from "../lib/fraudDetection";
import { expireCancellationCredits } from "../lib/cancellationCompensation";
import { sendNotification } from "../lib/notify";

export function startScheduler(): void {

  // ── (1) Scheduled ride dispatch — every 30s ─────────────────────────
  // Overlap guard: a tick slower than 30s must not start a second dispatch
  // sweep on the same `scheduled_dispatched_at IS NULL` rows.
  let scheduledDispatchRunning = false;
  setInterval(async () => {
    if (scheduledDispatchRunning) return;
    scheduledDispatchRunning = true;
    try {
      const now = new Date();
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      const due = await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.status, "scheduled"),
            lte(rides.dispatch_window_start, now),
            gte(rides.dispatch_window_end, now),
            isNull(rides.scheduled_dispatched_at),
          ),
        );
      for (const ride of due) {
        if (internalSecret) {
          const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
          const ok = await fetch(dispatchUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${internalSecret}`,
            },
            signal: AbortSignal.timeout(5_000),
            body: JSON.stringify({
              ride_id: ride.id,
              vehicle_type: ride.vehicle_type,
              pickup_lat: Number(ride.origin_latitude),
              pickup_lng: Number(ride.origin_longitude),
              allow_downgrade: true,
            }),
          }).then((r) => r.ok).catch(() => false);

          // Only mark dispatched after a successful trigger so the next job
          // cycle retries on failure (the ride stays status='scheduled' with
          // scheduled_dispatched_at IS NULL). The /internal/dispatch handler
          // transitions the ride to 'dispatching' internally.
          if (ok) {
            await db
              .update(rides)
              .set({ scheduled_dispatched_at: now })
              .where(eq(rides.id, ride.id));
          } else {
            logger.warn("[scheduler] scheduled dispatch trigger failed, will retry", { ride_id: ride.id });
          }
        }
      }
    } catch (e) {
      logger.error("[scheduler] scheduled dispatch error", e);
    } finally {
      scheduledDispatchRunning = false;
    }
  }, 30_000);

  // ── (2) Daily call reset — every 60s (fires when the stored reset time has passed) ──
  setInterval(async () => {
    try {
      // Z-7: fire whenever daily_reset_at has passed, NOT only within 60s of
      // midnight. A missed tick (deploy restart, event-loop stall, server
      // down at 00:00 BDT) previously skipped an entire day's reset — drivers
      // hit caps early and the pool shrank for 24h. After each reset
      // daily_reset_at advances to the next BDT midnight, so this can't
      // double-fire within the same day.
      await db
        .update(subscriptions)
        .set({ daily_calls_used: 0, daily_reset_at: nextBdtMidnightUtc() })
        .where(and(
          eq(subscriptions.status, "active"),
          sql`${subscriptions.daily_reset_at} <= now()`,
        ));
      logger.info("[scheduler] daily call reset check completed");
    } catch (e) {
      logger.error("[scheduler] daily reset error", e);
    }
  }, 60_000);

  // ── (3) Temporary driver expiry — every 60s ─────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db
        .update(drivers)
        .set({ status: "suspended", is_online: false })
        .where(
          and(
            eq(drivers.status, "temporary"),
            lt(drivers.provisional_expires_at, now),
          ),
        );
    } catch (e) {
      logger.error("[scheduler] temp driver expiry error", e);
    }
  }, 60_000);

  // ── (4) Subscription expiry — every 60s ─────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db
        .update(subscriptions)
        .set({ status: "expired" })
        .where(
          and(
            eq(subscriptions.status, "active"),
            lt(subscriptions.expires_at, now),
          ),
        );
    } catch (e) {
      logger.error("[scheduler] expiry error", e);
    }
  }, 60_000);

  // ── (5) Stale matched rides — every 60s ─────────────────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 30 * 60_000);
      // W-5: returning() the affected rows so the riders get notified — the
      // old code cancelled silently and the rider watched "driver arriving"
      // forever.
      const cancelled = await db
        .update(rides)
        .set({
          status: "cancelled",
          cancelled_by: "system",
          cancel_reason: "driver_no_show",
        })
        .where(
          and(
            eq(rides.status, "matched"),
            lt(rides.matched_at, staleThreshold),
          ),
        )
        .returning({ id: rides.id, user_id: rides.user_id });

      for (const ride of cancelled) {
        if (!ride.user_id) continue;
        try {
          await sendNotification(
            ride.user_id,
            "ride:cancelled",
            "Ride Cancelled",
            "Your driver didn't arrive. We've cancelled the ride and are finding you a new driver.",
            { ride_id: ride.id },
          );
        } catch (e) {
          logger.error("[scheduler] stale-cancel push failed", { rideId: ride.id, error: e });
        }
      }
    } catch (e) {
      logger.error("[scheduler] stale rides error", e);
    }
  }, 60_000);

  // ── (6) Vehicle type cooling-off promotion — every 60s ──────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await db
        .select()
        .from(vehicleTypeChanges)
        .where(
          and(
            eq(vehicleTypeChanges.status, "cooling_off"),
            lte(vehicleTypeChanges.effective_at, now),
          ),
        );
      for (const change of due) {
        await db.transaction(async (tx) => {
          await tx
            .update(vehicleTypeChanges)
            .set({ status: "approved" })
            .where(eq(vehicleTypeChanges.id, change.id));
          await tx
            .update(drivers)
            .set({ vehicle_type: change.new_vehicle_type as any })
            .where(eq(drivers.id, change.driver_id));
        });
      }
    } catch (e) {
      logger.error("[scheduler] cooling-off error", e);
    }
  }, 60_000);

  // ── (7) Consent copy deadline check — every 60s ────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      await db
        .update(ownerConsents)
        .set({ status: "expired" })
        .where(
          and(
            eq(ownerConsents.status, "approved"),
            lt(ownerConsents.created_at, cutoff),
          ),
        );
    } catch (e) {
      logger.error("[scheduler] consent expiry error", e);
    }
  }, 60_000);

  // ── (8) Used challenges cleanup — every 5 min ───────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.delete(usedChallenges).where(lt(usedChallenges.expires_at, now));
    } catch (e) {
      logger.error("[scheduler] used_challenges cleanup error", e);
    }
  }, 300_000);

  // ── (9) RTDB cleanup — every 5 min ─────────────────────────────────
  setInterval(async () => {
    try {
      // Cleanup stale RTDB verification entries is handled by Cloud Functions TTL
      logger.debug("[scheduler] RTDB cleanup tick");
    } catch (e) {
      logger.error("[scheduler] RTDB cleanup error", e);
    }
  }, 300_000);

  // ── (10) Document purge — every 1h ─────────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db
        .update(documents)
        .set({ deleted_at: now })
        .where(
          and(
            or(isNotNull(documents.purge_at), eq(documents.status, "rejected")),
            isNull(documents.deleted_at),
            lt(
              documents.created_at,
              new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            ),
          ),
        );
    } catch (e) {
      logger.error("[scheduler] document purge error", e);
    }
  }, 3600_000);

  // ── (11) Chat retention cleanup — every 1h ─────────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      await db.delete(chatMessages).where(lt(chatMessages.created_at, cutoff));
    } catch (e) {
      logger.error("[scheduler] chat retention error", e);
    }
  }, 3600_000);

  // ── (12) Callback_pending recovery — every 30s ──────────────────────
  // Overlap guard: an enqueue must not run twice for the same orphaned event.
  let callbackRecoveryRunning = false;
  setInterval(async () => {
    if (callbackRecoveryRunning) return;
    callbackRecoveryRunning = true;
    try {
      const staleThreshold = new Date(Date.now() - 10 * 60_000); // 10 min
      const stalled = await db
        .select({ id: paymentEvents.id })
        .from(paymentEvents)
        .where(
          and(
            eq(paymentEvents.status, "callback_pending"),
            lt(paymentEvents.updated_at, staleThreshold),
            isNull(paymentEvents.subscription_id),
          ),
        );
      for (const evt of stalled) {
        await db
          .insert(compensationQueue)
          .values({
            payment_event_id: evt.id,
            status: "pending",
            next_retry_at: new Date(),
            attempt_count: 0,
          })
          .onConflictDoNothing();
        logger.info("[scheduler] orphaned callback recovered", {
          paymentEventId: evt.id,
        });
      }
    } catch (e) {
      logger.error("[scheduler] callback recovery error", e);
    } finally {
      callbackRecoveryRunning = false;
    }
  }, 30_000);

  // ── (13) Rate limits cleanup — every 1h ────────────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
      await db.delete(rateLimits).where(lt(rateLimits.window_start, cutoff));
    } catch (e) {
      logger.error("[scheduler] rate limits cleanup error", e);
    }
  }, 3600_000);

  // ── (14) Credit voucher expiry — every 5 min ────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db
        .update(creditVouchers)
        .set({ status: "expired" })
        .where(
          and(
            eq(creditVouchers.status, "active"),
            lt(creditVouchers.expires_at, now),
          ),
        );
    } catch (e) {
      logger.error("[scheduler] credit voucher expiry error", e);
    }
  }, 300_000);

  // ── (15) Stale pending ride recovery — every 30s ────────────────────
  // Overlap guard: re-dispatches must not double-fire for the same stalled ride.
  let stalePendingRunning = false;
  setInterval(async () => {
    if (stalePendingRunning) return;
    stalePendingRunning = true;
    try {
      const staleThreshold = new Date(Date.now() - 30_000);
      const stalled = await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.status, "pending"),
            isNull(rides.scheduled_at),
            isNull(rides.scheduled_dispatched_at),
            lt(rides.created_at, staleThreshold),
          ),
        );
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (!internalSecret) return;
      for (const ride of stalled) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        fetch(dispatchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${internalSecret}`,
          },
          signal: AbortSignal.timeout(5_000),
          body: JSON.stringify({
            ride_id: ride.id,
            vehicle_type: ride.vehicle_type,
            pickup_lat: Number(ride.origin_latitude),
            pickup_lng: Number(ride.origin_longitude),
            allow_downgrade: false,
          }),
        }).catch((e) =>
          logger.error("[scheduler] stale dispatch retry error", {
            ride_id: ride.id,
            error: e,
          }),
        );
      }
    } catch (e) {
      logger.error("[scheduler] stale pending recovery error", e);
    } finally {
      stalePendingRunning = false;
    }
  }, 30_000);

  // ── (16) Stale dispatching rides — every 30s ──────────────────────────
  setInterval(async () => {
    try {
      const stale = await db
        .update(rides)
        .set({ status: "expired" })
        .where(
          and(
            eq(rides.status, "dispatching"),
            isNull(rides.matched_at),
            sql`${rides.created_at} < now() - interval '90 seconds'`,
          ),
        )
        .returning({ id: rides.id });
      if (stale.length > 0) {
        logger.info("[scheduler] expired stale dispatching rides", {
          count: stale.length,
          ids: stale.map((r) => r.id),
        });
      }
    } catch (e) {
      logger.error("[scheduler] stale dispatching expiry error", e);
    }
  }, 30_000);

  // ── (17) Stale driver_arrived auto-cancel — every 60s ─────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 10 * 60_000);
      const stale = await db
        .update(rides)
        .set({
          status: "cancelled",
          cancelled_by: "system",
          cancel_reason: "driver_arrived_timeout",
        })
        .where(
          and(
            eq(rides.status, "driver_arrived"),
            lt(rides.arrived_at, staleThreshold),
          ),
        )
        .returning({ id: rides.id });
      if (stale.length > 0) {
        logger.info("[scheduler] stale driver_arrived auto-cancelled", {
          count: stale.length,
          ids: stale.map((r) => r.id),
        });
      }
    } catch (e) {
      logger.error("[scheduler] stale driver_arrived error", e);
    }
  }, 60_000);

  // ── (18) Incentive progress tracking — every 5 min ──────────────────
  setInterval(async () => {
    try {
      const now = new Date();

      // Fetch active, non-expired incentive definitions
      const activeIncentives = await db
        .select()
        .from(incentiveDefinitions)
        .where(
          and(
            eq(incentiveDefinitions.is_active, true),
            lte(incentiveDefinitions.starts_at, now),
            gte(incentiveDefinitions.ends_at, now),
            sql`incentive_definitions.deleted_at IS NULL`,
          ),
        );

      for (const incentive of activeIncentives) {
        // Fetch all driver_incentives for this incentive that aren't completed
        const progressRows = await db
          .select({
            id: driverIncentives.id,
            driverId: driverIncentives.driver_id,
            currentProgress: driverIncentives.current_progress,
          })
          .from(driverIncentives)
          .where(
            and(
              eq(driverIncentives.incentive_id, incentive.id),
              isNull(driverIncentives.completed_at),
            ),
          );

        for (const row of progressRows) {
          let newProgress: number;

          switch (incentive.target_metric) {
            case "completed_rides": {
              const [{ count: rideCount }] = await db
                .select({ count: sql<number>`count(*)` })
                .from(rides)
                .where(
                  and(
                    eq(rides.driver_id, row.driverId),
                    eq(rides.status, "completed"),
                    gte(rides.completed_at, incentive.starts_at),
                    lte(rides.completed_at, incentive.ends_at),
                  ),
                );
              newProgress = rideCount;
              break;
            }
            case "online_hours": {
              // Approximate from driver acceptance_rate as a proxy
              // For a real implementation, use driver_online_sessions
              const [{ hours }] = await db.execute<
                { hours: string | null }
              >(sql`
                SELECT COALESCE(SUM(duration_minutes), 0) / 60.0 as hours
                FROM driver_online_sessions
                WHERE driver_id = ${row.driverId}
                  AND went_online_at >= ${incentive.starts_at}
                  AND (went_offline_at IS NULL OR went_offline_at <= ${incentive.ends_at})
              `);
              newProgress = Number(hours ?? 0);
              break;
            }
            case "acceptance_rate": {
              const [driverRow] = await db
                .select({ rate: drivers.acceptance_rate })
                .from(drivers)
                .where(eq(drivers.id, row.driverId))
                .limit(1);
              newProgress =
                driverRow?.rate != null ? Number(driverRow.rate) : 0;
              break;
            }
            case "consecutive_accepts": {
              // Count consecutive accepted offers in the incentive period
              const [{ maxStreak }] = await db.execute<
                { maxStreak: string | null }
              >(sql`
                WITH ordered AS (
                  SELECT outcome,
                	ROW_NUMBER() OVER (ORDER BY sent_at) -
                	ROW_NUMBER() OVER (PARTITION BY outcome ORDER BY sent_at) as grp
                  FROM dispatch_offers
                  WHERE driver_id = ${row.driverId}
                    AND sent_at >= ${incentive.starts_at}
                    AND sent_at <= ${incentive.ends_at}
                )
                SELECT MAX(COUNT(*)) OVER (PARTITION BY grp) as "maxStreak"
                FROM ordered
                WHERE outcome = 'accepted'
                LIMIT 1
              `);
              newProgress = Number(maxStreak ?? 0);
              break;
            }
            default:
              continue;
          }

          // Update progress
          await db
            .update(driverIncentives)
            .set({ current_progress: newProgress.toString(), updated_at: now })
            .where(eq(driverIncentives.id, row.id));

          // Check if target met — then issue reward inside a serializable
          // transaction with row-level lock to prevent double-issuance.
          const targetValue = Number(incentive.target_value);
          if (newProgress >= targetValue) {
            await db
              .transaction(async (tx) => {
                // 1. Lock the driver_incentives row
                const [lockedRow] = await tx.execute<{
                  completed_at: Date | null;
                }>(sql`
                SELECT completed_at FROM driver_incentives
                WHERE id = ${row.id}
                FOR UPDATE
              `);

                // 2. Re-check idempotency — another scheduler tick may have
                //    already completed and issued the voucher
                if (lockedRow?.completed_at != null) {
                  logger.debug(
                    "[scheduler] incentive already completed, skipping",
                    {
                      driverIncentiveId: row.id,
                      driverId: row.driverId,
                    },
                  );
                  return; // tx commits (no-op)
                }

                // 3. Issue reward voucher
                const [voucher] = await tx
                  .insert(creditVouchers)
                  .values({
                    driver_id: row.driverId,
                    calls: incentive.reward_calls,
                    expires_at: new Date(Date.now() + 90 * 86400_000), // 90 days
                  })
                  .returning();

                // 4. Mark completed and link voucher
                await tx
                  .update(driverIncentives)
                  .set({
                    completed_at: now,
                    reward_voucher_id: voucher.id,
                    updated_at: now,
                  })
                  .where(eq(driverIncentives.id, row.id));

                logger.info("[scheduler] incentive completed", {
                  driverId: row.driverId,
                  incentiveId: incentive.id,
                  rewardCalls: incentive.reward_calls,
                });
              })
              .catch((txErr: any) => {
                // If the tx was rolled back (e.g. serialization failure),
                // log and skip — the next tick will retry
                if (txErr?.code === "40001" || txErr?.code === "4P000") {
                  logger.warn(
                    "[scheduler] incentive completion tx conflict, will retry",
                    {
                      driverIncentiveId: row.id,
                      error: txErr.message,
                    },
                  );
                } else {
                  throw txErr; // re-throw for the outer catch
                }
              });
          }
        }
      }
    } catch (e) {
      logger.error("[scheduler] incentive progress error", e);
    }
  }, 300_000);

  // ── (18) Auto-start timer for driver_arrived rides — every 10s ──────
  setInterval(async () => {
    try {
      // Read max_free_wait_seconds from system_config at runtime
      const [configRow] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, "max_free_wait_seconds"))
        .limit(1);
      const freeWaitMs = parseInt(configRow?.value ?? "60") * 1000;
      const cutoff = new Date(Date.now() - freeWaitMs);

      const stale = await db
        .update(rides)
        .set({
          status: "in_progress",
          started_at: sql`arrived_at + interval '1 second' * ${freeWaitMs / 1000}`,
          updated_at: new Date(),
        })
        .where(
          and(eq(rides.status, "driver_arrived"), lt(rides.arrived_at, cutoff)),
        )
        .returning({ id: rides.id, driver_id: rides.driver_id });

      if (stale.length > 0) {
        logger.info("[scheduler] auto-start timer triggered", {
          count: stale.length,
          ids: stale.map((r) => r.id),
          waitSeconds: freeWaitMs / 1000,
        });
      }
    } catch (e) {
      logger.error("[scheduler] auto-start timer error", e);
    }
  }, 10_000);

  // ── (20) Stale dispatch offer expiry + AC-7 refund — every 10s ────
  // Overlap guard: refund/deduction pairs must be processed by one tick at a
  // time (recordCallRefund is idempotent, but the read-then-act must not race).
  let offerExpiryRunning = false;
  setInterval(async () => {
    if (offerExpiryRunning) return;
    offerExpiryRunning = true;
    try {
      // AC-7 (01-PRD.md:313): a CONFIRMED offer the driver never responded to
      // within the offer window gets the call refunded (append-only refund row
      // via recordCallRefund) and the offer marked outcome='refunded'. Covers
      // both driver ignore and race loss (another driver accepted first — the
      // losing driver's offer was never flipped by the accept handler).
      const ignored = await db.select({
        id: dispatchOffers.id,
        ride_id: dispatchOffers.ride_id,
        driver_id: dispatchOffers.driver_id,
      })
        .from(dispatchOffers)
        .where(and(
          eq(dispatchOffers.outcome, "delivered"),
          isNotNull(dispatchOffers.fetch_confirmed_at),
          isNull(dispatchOffers.responded_at),
          sql`${dispatchOffers.fetch_confirmed_at} < now() - interval '15 seconds'`,
        ));
      for (const offer of ignored) {
        try {
          const [deductionRow] = await db
            .select({ subscription_id: callLedger.subscription_id })
            .from(callLedger)
            .where(and(
              eq(callLedger.ride_id, offer.ride_id),
              eq(callLedger.driver_id, offer.driver_id),
              eq(callLedger.event_type, "deduction"),
            ))
            .limit(1);
          if (!deductionRow) continue;
          const { refunded } = await recordCallRefund({
            driverId: offer.driver_id,
            subscriptionId: deductionRow.subscription_id,
            rideId: offer.ride_id,
          });
          if (refunded) {
            await db.update(dispatchOffers)
              .set({ outcome: "refunded", responded_at: new Date() })
              .where(eq(dispatchOffers.id, offer.id));
          }
        } catch (e: any) {
          logger.error("[scheduler] AC-7 refund failed", {
            offerId: offer.id,
            error: e.message,
          });
        }
      }
      if (ignored.length > 0) {
        logger.info(`[scheduler] refunded ${ignored.length} confirmed-but-ignored offers (AC-7)`);
      }

      // Unconfirmed offers nobody engaged with simply expire.
      const result = await db.update(dispatchOffers)
        .set({ outcome: "expired" })
        .where(and(
          eq(dispatchOffers.outcome, "delivered"),
          sql`${dispatchOffers.sent_at} < now() - interval '30 seconds'`
        ));
      if (result.length > 0) {
        logger.info(`[scheduler] expired ${result.length} stale dispatch offers`);
      }
    } catch (e) {
      logger.error("[scheduler] offer expiry error", e);
    } finally {
      offerExpiryRunning = false;
    }
  }, 10_000);

  // ── (19) Surge Pricing Calculator — every 60s ──────────────────────
  const prevMultipliers = new Map<string, number>();

  setInterval(async () => {
    try {
      // Read thresholds from system_config, seed defaults if missing
      const [cfg] = await db.select().from(systemConfig)
        .where(eq(systemConfig.key, "surge_thresholds")).limit(1);
      const thresholds = cfg
        ? JSON.parse(cfg.value)
        : DEFAULT_SURGE_THRESHOLDS;
      if (!cfg) {
        await db.insert(systemConfig).values({
          key: "surge_thresholds",
          value: JSON.stringify(thresholds),
          updated_at: new Date(),
        }).onConflictDoUpdate({
          target: systemConfig.key,
          set: { value: JSON.stringify(thresholds), updated_at: new Date() },
        });
      }

      const zns = await db.select({ id: zones.id }).from(zones);
      for (const zone of zns) {
        const [demand] = await db
          .select({ count: sql<number>`count(*)` })
          .from(rides)
          .where(and(eq(rides.zone_id, zone.id), eq(rides.status, "pending")));

        const [supply] = await db
          .select({ count: sql<number>`count(*)` })
          .from(drivers)
          .where(and(eq(drivers.zone_id, zone.id), eq(drivers.is_online, true)));

        const ratio = surgeRatio(demand?.count ?? 0, supply?.count ?? 0);
        const multiplier = pickSurgeMultiplier(ratio, thresholds);

        // Write audit row when multiplier changes
        const prev = prevMultipliers.get(zone.id) ?? 1.0;
        if (prev !== multiplier) {
          if (multiplier > 1.0) {
            await db.insert(surgeHistory).values({
              zone_id: zone.id,
              multiplier: multiplier.toString(),
              demand_count: demand?.count ?? 0,
              supply_count: supply?.count ?? 0,
            });
          } else if (prev > 1.0) {
            const [openRow] = await db.select({ id: surgeHistory.id }).from(surgeHistory)
              .where(and(eq(surgeHistory.zone_id, zone.id), isNull(surgeHistory.ended_at)))
              .orderBy(sql`triggered_at desc`).limit(1);
            if (openRow) {
              await db.update(surgeHistory).set({ ended_at: new Date() }).where(eq(surgeHistory.id, openRow.id));
            }
          }
          prevMultipliers.set(zone.id, multiplier);
        }

        await db.insert(surgeCurrent).values({
          zone_id: zone.id,
          multiplier: multiplier.toString(),
          demand_count: demand?.count ?? 0,
          supply_count: supply?.count ?? 0,
          updated_at: new Date(),
        }).onConflictDoUpdate({
          target: surgeCurrent.zone_id,
          set: {
            multiplier: multiplier.toString(),
            demand_count: demand?.count ?? 0,
            supply_count: supply?.count ?? 0,
            updated_at: new Date(),
          },
        });
      }
    } catch (e: any) {
      logger.error("[scheduler] surge pricing error", e);
    }
  }, 60_000);

  // ── (20) Document Expiry Alerts — every 6 hours ────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      for (const { label, daysBefore, col } of [
        { label: "30-day", daysBefore: 30, col: "alert_sent_30d" },
        { label: "7-day", daysBefore: 7, col: "alert_sent_7d" },
        { label: "1-day", daysBefore: 1, col: "alert_sent_1d" },
      ]) {
        const threshold = new Date(now.getTime() + daysBefore * 86400000);
        const due = await db
          .select({ id: documents.id, driver_id: documents.driver_id })
          .from(documents)
          .where(
            and(
              lte(documents.expiry_date, threshold),
              isNull(documents.deleted_at),
              eq(documents[col as keyof typeof documents] as any, false),
            ),
          );
        for (const doc of due) {
          await db.update(documents)
            .set({ [col]: true })
            .where(eq(documents.id, doc.id));
          logger.info("[scheduler] document expiry alert", { driver_id: doc.driver_id, alert: label });
        }
      }

      const expiredDocs = await db
        .select({ driver_id: documents.driver_id })
        .from(documents)
        .where(and(lte(documents.expiry_date, now), isNull(documents.deleted_at)));
      for (const driverId of [...new Set(expiredDocs.map((d) => d.driver_id))]) {
        await db.update(drivers)
          .set({ is_online: false, status: "suspended" })
          .where(eq(drivers.id, driverId));
      }
    } catch (e: any) {
      logger.error("[scheduler] document expiry error", e);
    }
  }, 6 * 3600_000);

  // ── (21) Scheduled Ride Reminder Push — every 60s ───────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const fifteenMin = new Date(now.getTime() + 15 * 60 * 1000);
      const due = await db
        .select({ id: rides.id, user_id: rides.user_id })
        .from(rides)
        .where(
            and(
              eq(rides.status, "scheduled"),
              eq(rides.reminder_sent, false),
            lte(rides.scheduled_at, fifteenMin),
            gte(rides.scheduled_at, now),
          ),
        );
      for (const ride of due) {
        try {
          await sendNotification(
            ride.user_id,
            "reminder",
            "Ride Coming Up",
            "Your scheduled ride is in 15 minutes. Please be ready.",
            { ride_id: ride.id },
          );
          await db.update(rides).set({ reminder_sent: true }).where(eq(rides.id, ride.id));
        } catch (e) {
          logger.error("[scheduler] reminder push failed, will retry", { rideId: ride.id, error: e });
        }
      }
    } catch (e: any) {
      logger.error("[scheduler] reminder push error", e);
    }
  }, 60_000);

  // ── (22) Rider Pass Expiry — every 60s ──────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.update(riderSubscriptions)
        .set({ status: "expired" })
        .where(and(eq(riderSubscriptions.status, "active"), lte(riderSubscriptions.valid_until, now)));
    } catch (e: any) {
      logger.error("[scheduler] rider pass expiry error", e);
    }
  }, 60_000);

  // ── (23) Driver Promo Rewards — every 10 min ──────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const activePromos = await db.select().from(promoCodes)
        .where(and(eq(promoCodes.target_role, 'driver'), eq(promoCodes.is_active, true), gte(promoCodes.expires_at, now)));

      const metricConfig: Record<string, { table: any; countCol: any }> = {
        rides_completed: { table: rides, countCol: rides.driver_fare_bdt },
        earnings_bdt:    { table: driverWalletTransactions, countCol: driverWalletTransactions.amount_bdt },
        trips_duration:  { table: rides, countCol: rides.distance_km },
      };

      const allDrivers = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.status, 'active'));
      const driverWalletUpdate = db.update(drivers);

      for (const promo of activePromos) {
        if (!promo.metric || !promo.target_value) continue;
        const cfg = metricConfig[promo.metric];
        if (!cfg) continue;

        for (const driver of allDrivers) {
          const [row] = await db.select({ val: sql<number>`COALESCE(SUM(${cfg.countCol}), 0)` }).from(cfg.table)
            .where(and(eq(cfg.table.driver_id, driver.id), gte(cfg.table.created_at, new Date(Date.now() - 86400000 * (promo.validity_days ?? 7)))));
          const currentVal = Number(row?.val ?? 0);
          if (currentVal >= promo.target_value) {
            const rewardBdt = promo.metric === 'rides_completed' ? 1000 : 500;
            await db.update(drivers)
              .set({ driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${rewardBdt}` })
              .where(eq(drivers.id, driver.id));
            logger.info('[scheduler] driver promo reward granted', { driverId: driver.id, promo: promo.code, reward: rewardBdt });
          }
        }
      }
    } catch (e: any) {
      logger.error("[scheduler] driver promo reward error", e);
    }
  }, 600_000);

  // ── (24) Safety: Stationary Anomaly Check — every 5 min ────────────
  setInterval(async () => {
    try {
      await detectStationaryAnomaly();
    } catch (e: any) {
      logger.error("[scheduler] stationary anomaly error", e);
    }
  }, 300_000);

  // ── (25) Weather Surge Override — every 15 min ──────────────────────
  setInterval(async () => {
    try {
      const zonesList = await db.select({ id: zones.id }).from(zones);
      for (const zone of zonesList) {
        const [weather] = await db.select().from(weatherConditions)
          .where(eq(weatherConditions.zone_id, zone.id)).orderBy(sql`fetched_at desc`).limit(1);
        if (weather && weather.is_severe && weather.surge_multiplier_override) {
          await db.insert(surgeCurrent).values({
            zone_id: zone.id, multiplier: weather.surge_multiplier_override.toString(),
            demand_count: 0, supply_count: 0, updated_at: new Date(),
          }).onConflictDoUpdate({
            target: surgeCurrent.zone_id,
            set: { multiplier: weather.surge_multiplier_override.toString(), updated_at: new Date() },
          });
        }
      }
    } catch (e: any) {
      logger.error("[scheduler] weather surge override error", e);
    }
  }, 900_000);

  // ── (26) Zone budget daily reset — every 60s, fires at BDT midnight ──────
  setInterval(async () => {
    try {
      const midnight = nextBdtMidnightUtc();
      const now = new Date();
      if (Math.abs(now.getTime() - midnight.getTime()) > 60_000) return;

      await resetAllBudgets();
      logger.info("[scheduler] zone-budget-daily-reset completed");
    } catch (e) {
      logger.error("[scheduler] zone budget daily reset error", e);
    }
  }, 60_000);

  // ── (27) Zone graduation evaluation — daily at 06:00 BDT ──────────────────
  setInterval(async () => {
    try {
      // Check if it's 06:00 BDT (UTC+6): hour 0 UTC
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      // 06:00 BDT = 00:00 UTC
      if (utcHour !== 0 || utcMinutes >= 1) return;

      await evaluateGraduation();
      logger.info("[scheduler] zone-graduation-eval completed");
    } catch (e) {
      logger.error("[scheduler] zone graduation eval error", e);
    }
  }, 60_000);

  // ── (28) Cashback expiry — daily at 01:00 BDT ─────────────────────────────
  setInterval(async () => {
    try {
      // 01:00 BDT = 19:00 UTC (previous day)
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      if (utcHour !== 19 || utcMinutes >= 1) return;

      await expireCredits();
      logger.info("[scheduler] cashback-expiry completed");
    } catch (e) {
      logger.error("[scheduler] cashback expiry error", e);
    }
  }, 60_000);

  // ── (29) Fraud detection — daily at 03:00 BDT (21:00 UTC) ─────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const utcHour = now.getUTCHours();
      const utcMinutes = now.getUTCMinutes();
      if (utcHour !== 21 || utcMinutes >= 1) return;

      await runFraudDetection();
      logger.info("[scheduler] fraud-detection completed");
    } catch (e: any) {
      logger.error("[scheduler] fraud detection error", e);
    }
  }, 60_000);

  // ── (30) Cancellation credit expiry — every 5 min ──────────────────────
  setInterval(async () => {
    try {
      const expired = await expireCancellationCredits();
      if (expired > 0) {
        logger.info("[scheduler] cancellation credit expiry completed", { count: expired });
      }
    } catch (e: any) {
      logger.error("[scheduler] cancellation credit expiry error", e);
    }
  }, 300_000);

  // ── (31) Rider fee deduction expiry — daily at 02:00 BDT ──────────────
  setInterval(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 20 || now.getUTCMinutes() !== 0) return;
    try {
      const expired = await expireRiderFeeDeductions();
      if (expired > 0) {
        logger.info("[scheduler] rider fee deduction expiry completed", { count: expired });
      }
    } catch (e: any) {
      logger.error("[scheduler] rider fee deduction expiry error", e);
    }
  }, 60_000);

  logger.info("[scheduler] started (31 jobs)");
}
