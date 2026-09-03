/**
 * R3.5: Driver Promo Codes — Read-Only Dashboard API
 *
 * GET — returns active driver promos with the driver's current progress
 * toward each promo's metric threshold.
 *
 * Driver promos are auto-credited by scheduler job 23 based on metric
 * thresholds. This endpoint is read-only — drivers never enter codes.
 *
 * Metrics evaluated: rides_completed, earnings_bdt, trips_duration.
 */
import { db } from "@/src/db";
import { users, drivers, promoCodes, rides, driverWalletTransactions } from "@/src/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/** Metric config: maps promo.metric to the table + column to aggregate. */
const METRIC_CONFIG: Record<string, { table: typeof rides | typeof driverWalletTransactions; countCol: any }> = {
  rides_completed: { table: rides, countCol: rides.driver_fare_bdt },
  earnings_bdt: { table: driverWalletTransactions, countCol: driverWalletTransactions.amount_bdt },
  trips_duration: { table: rides, countCol: rides.distance_km },
};

/** Human-readable metric labels. */
const METRIC_LABELS: Record<string, string> = {
  rides_completed: "Rides completed",
  earnings_bdt: "Earnings (৳)",
  trips_duration: "Distance (km)",
};

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver) {
      return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });
    }

    // Fetch active driver promos (not expired, not deleted)
    const now = new Date();
    const activePromos = await db
      .select()
      .from(promoCodes)
      .where(
        and(
          eq(promoCodes.target_role, "driver"),
          eq(promoCodes.is_active, true),
          gte(promoCodes.expires_at, now),
          sql`${promoCodes.deleted_at} IS NULL`,
        ),
      );

    // For each promo, compute the driver's current metric value
    const promosWithProgress = await Promise.all(
      activePromos.map(async (promo) => {
        let currentValue = 0;
        if (promo.metric && promo.target_value) {
          const cfg = METRIC_CONFIG[promo.metric];
          if (cfg) {
            const validityDays = promo.validity_days ?? 7;
            const windowStart = new Date(Date.now() - 86_400_000 * validityDays);
            const [agg] = await db
              .select({ val: sql<number>`COALESCE(SUM(${cfg.countCol}), 0)` })
              .from(cfg.table)
              .where(
                and(
                  eq((cfg.table as typeof rides).driver_id, driver.id),
                  gte(cfg.table.created_at, windowStart),
                ),
              );
            currentValue = Number(agg?.val ?? 0);
          }
        }

        const target = promo.target_value ?? 0;
        const progress = target > 0 ? Math.min(100, Math.round((currentValue / target) * 100)) : 0;
        const reached = target > 0 && currentValue >= target;

        return {
          id: promo.id,
          code: promo.code,
          title: promo.title,
          description: promo.description,
          metric: promo.metric,
          metric_label: promo.metric ? METRIC_LABELS[promo.metric] ?? promo.metric : null,
          target_value: promo.target_value,
          current_value: currentValue,
          progress_percent: progress,
          reached,
          discount_type: promo.discount_type,
          discount_value: promo.discount_value,
          valid_from: promo.valid_from.toISOString(),
          expires_at: promo.expires_at.toISOString(),
          validity_days: promo.validity_days,
        };
      }),
    );

    // Separate into reached (eligible) and in-progress
    const eligible = promosWithProgress.filter((p) => p.reached);
    const inProgress = promosWithProgress.filter((p) => !p.reached);

    return Response.json({
      eligible,
      in_progress: inProgress,
      total_active: promosWithProgress.length,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/promos] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
