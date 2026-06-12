import { db } from "../src/db";
import {
  rides,
  subscriptions,
  vehicleTypeChanges,
  drivers,
  usedChallenges,
  documents,
  chatMessages,
  compensationQueue,
  rateLimits,
  creditVouchers,
  ownerConsents,
  paymentEvents,
  incentiveDefinitions,
  driverIncentives,
  systemConfig,
} from "../src/db/schema";
import { and, eq, lt, lte, isNull, isNotNull, sql, or, gte } from "drizzle-orm";
import { nextBdtMidnightUtc } from "../lib/time";
import { logger } from "../lib/logger";

export function startScheduler(): void {
  // ── (1) Scheduled ride dispatch — every 60s ─────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() + 120_000);
      const cutoffLo = new Date(now.getTime() + 60_000);
      const scheduled = await db
        .select()
        .from(rides)
        .where(
          and(
            eq(rides.status, "pending"),
            isNotNull(rides.scheduled_at),
            isNull(rides.scheduled_dispatched_at),
            lte(rides.scheduled_at, cutoff),
            sql`${rides.scheduled_at} >= ${cutoffLo.toISOString()}::timestamptz`,
          ),
        );
      for (const ride of scheduled) {
        await db
          .update(rides)
          .set({ scheduled_dispatched_at: now })
          .where(eq(rides.id, ride.id));
        // Trigger dispatch is handled by /internal/dispatch from ride/request+api.ts
        // Here we just mark as ready for dispatch
      }
    } catch (e) {
      logger.error("[scheduler] scheduled dispatch error", e);
    }
  }, 60_000);

  // ── (2) Daily call reset — every 60s (resets at BDT midnight) ───────
  setInterval(async () => {
    try {
      const midnight = nextBdtMidnightUtc();
      const now = new Date();
      // Run within 60s of midnight
      if (Math.abs(now.getTime() - midnight.getTime()) > 60_000) return;

      await db
        .update(subscriptions)
        .set({ daily_calls_used: 0, daily_reset_at: nextBdtMidnightUtc() })
        .where(eq(subscriptions.status, "active"));
      logger.info("[scheduler] daily call reset completed");
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
      await db
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
        );
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
  setInterval(async () => {
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
  setInterval(async () => {
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
    }
  }, 30_000);

  // ── (16) Stale driver_arrived auto-cancel — every 60s ─────────────────
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

  // ── (17) Incentive progress tracking — every 5 min ──────────────────
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
                [{ hours: string | null }]
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
                [{ maxStreak: string | null }]
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

  logger.info("[scheduler] started (18 jobs)");
}
