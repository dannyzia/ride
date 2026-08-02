import { db } from "@/src/db";
import { zones, zoneBudgets, zoneGraduationRules, rides, dispatchOffers, drivers } from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { nextBdtMidnightUtc } from "@/lib/time";

type LifecycleStage = "candidate" | "pilot" | "active" | "growth" | "mature" | "expansion" | "paused" | "closed";

export async function evaluateGraduation(): Promise<void> {
  try {
    const activeZones = await db
      .select({ id: zones.id, lifecycle_stage: zones.lifecycle_stage })
      .from(zones)
      .where(eq(zones.is_active, true));

    for (const zone of activeZones) {
      const currentStage = zone.lifecycle_stage as LifecycleStage;

      const rules = await db
        .select({
          to_stage: zoneGraduationRules.to_stage,
          min_rides_per_day: zoneGraduationRules.min_rides_per_day,
          max_eta_seconds: zoneGraduationRules.max_eta_seconds,
          min_acceptance_rate_pct: zoneGraduationRules.min_acceptance_rate_pct,
          min_driver_utilization_pct: zoneGraduationRules.min_driver_utilization_pct,
          evaluation_window_days: zoneGraduationRules.evaluation_window_days,
        })
        .from(zoneGraduationRules)
        .where(
          and(
            eq(zoneGraduationRules.zone_id, zone.id),
            eq(zoneGraduationRules.from_stage, currentStage as any),
            eq(zoneGraduationRules.is_active, true),
          ),
        );

      for (const rule of rules) {
        const windowDays = Number(rule.evaluation_window_days ?? 7);
        const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

        const [{ cnt }] = await db
          .select({ cnt: sql<number>`COUNT(*)` })
          .from(rides)
          .where(
            and(
              eq(rides.zone_id, zone.id),
              sql`${rides.created_at} >= ${since}`,
            ),
          )
          .limit(1);

        const ridesPerDay = windowDays > 0 ? Number(cnt ?? 0) / windowDays : 0;
        const meetsRides =
          rule.min_rides_per_day != null &&
          ridesPerDay >= (rule.min_rides_per_day ?? 0);

        if (!meetsRides) continue;

        // Avg ETA check
        if (rule.max_eta_seconds != null) {
          const [{ avgEtaSeconds }] = await db
            .select({ avgEtaSeconds: sql<number>`COALESCE(AVG(${rides.eta_minutes}) * 60, 0)` })
            .from(rides)
            .where(
              and(
                eq(rides.zone_id, zone.id),
                eq(rides.status, "completed"),
                sql`${rides.completed_at} >= ${since}`,
                sql`${rides.completed_at} < ${new Date()}>`,
              ),
            )
            .limit(1);
          const avgEta = Number(avgEtaSeconds ?? 0);
          if (avgEta > rule.max_eta_seconds) continue;
        }

        // Acceptance rate check
        if (rule.min_acceptance_rate_pct != null) {
          const [{ accepted, total }] = await db
            .select({
              accepted: sql<number>`COUNT(*) FILTER (WHERE ${dispatchOffers.outcome} = 'accepted')`,
              total: sql<number>`COUNT(*) FILTER (WHERE ${dispatchOffers.outcome} IN ('accepted', 'rejected', 'expired'))`,
            })
            .from(dispatchOffers)
            .innerJoin(rides, eq(dispatchOffers.ride_id, rides.id))
            .where(
              and(
                eq(rides.zone_id, zone.id),
                sql`${dispatchOffers.sent_at} >= ${since}`,
                sql`${dispatchOffers.sent_at} < ${new Date()}>`,
              ),
            )
            .limit(1);
          const totalOffers = Number(total ?? 0);
          const acceptanceRate = totalOffers > 0 ? (Number(accepted ?? 0) / totalOffers) * 100 : 0;
          if (acceptanceRate < rule.min_acceptance_rate_pct) continue;
        }

        // Driver utilization check
        if (rule.min_driver_utilization_pct != null && windowDays > 0) {
          const [{ completedCount }] = await db
            .select({ completedCount: sql<number>`COUNT(*)` })
            .from(rides)
            .where(
              and(
                eq(rides.zone_id, zone.id),
                eq(rides.status, "completed"),
                sql`${rides.completed_at} >= ${since}`,
                sql`${rides.completed_at} < ${new Date()}>`,
              ),
            )
            .limit(1);
          const completedRides = Number(completedCount ?? 0);

          const [{ activeDriverCount }] = await db
            .select({ activeDriverCount: sql<number>`COUNT(DISTINCT ${drivers.id})` })
            .from(drivers)
            .where(
              and(
                eq(drivers.zone_id, zone.id),
                eq(drivers.is_online, true),
              ),
            )
            .limit(1);
          const activeDrivers = Number(activeDriverCount ?? 0);

          const dailyRidesPerDriver = activeDrivers > 0 ? completedRides / (activeDrivers * windowDays) : 0;
          const utilizationPct = dailyRidesPerDriver * 100;
          if (utilizationPct < rule.min_driver_utilization_pct) continue;
        }

        await promoteZone(zone.id, currentStage, rule.to_stage as LifecycleStage);
        logger.info("[zoneLifecycle] zone graduated", {
          zoneId: zone.id,
          fromStage: currentStage,
          toStage: rule.to_stage,
          ridesPerDay,
        });
      }
    }
  } catch (e) {
    logger.error("[zoneLifecycle] evaluateGraduation failed", e);
  }
}

export async function promoteZone(
  zoneId: string,
  _fromStage: LifecycleStage,
  toStage: LifecycleStage,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(zones)
      .set({ lifecycle_stage: toStage, updated_at: new Date() })
      .where(eq(zones.id, zoneId));

    const existing = await tx
      .select({ id: zoneBudgets.id })
      .from(zoneBudgets)
      .where(eq(zoneBudgets.zone_id, zoneId))
      .limit(1);

    if (!existing) {
      await tx.insert(zoneBudgets).values({
        zone_id: zoneId,
        daily_budget_bdt: 0,
        spent_today_bdt: 0,
        auto_pause_threshold_pct: 100,
        is_paused: false,
        reset_at: nextBdtMidnightUtc(),
      });
    }
  });
}
