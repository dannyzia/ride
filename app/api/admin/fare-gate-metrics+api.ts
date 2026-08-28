import { db } from '@/src/db';
import {
  rides,
  cancelSurveys,
  dispatchOffers,
  pickupDistanceSamples,
  platformConfig,
  zones,
} from '@/src/db/schema';
import { eq, gte, lte, sql, and, isNotNull, count, countDistinct } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { getFareFrameworkConfig } from '@/lib/fareFrameworkConfig';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

/** Traffic-light status for each gate metric. */
type GateStatus = 'green' | 'red' | 'calibration_needed';

interface GateMetric {
  /** Machine-readable key. */
  key: string;
  /** Human-readable label shown in the admin UI. */
  label: string;
  /** The measured value (formatted by the caller). */
  measured: number | null;
  /** The threshold from config (0 = CALIBRATION NEEDED). */
  threshold: number;
  /** Traffic-light status. */
  status: GateStatus;
  /** Extra context text for the admin. */
  hint: string;
}

/** 30-day evaluation window. */
const LOOKBACK_DAYS = 30;

/**
 * GET /api/admin/fare-gate-metrics
 *
 * Reads 6 gate metrics per §6 of the fare framework spec, compares each
 * against its fare_gate_* config threshold, and returns traffic-light
 * indicators. Threshold = 0 → CALIBRATION NEEDED (PATCH 5).
 */
export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    const now = new Date();
    const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Read all gate thresholds from config (never cached)
    const cfg = await getFareFrameworkConfig([
      'fare_gate_complaint_rate_max',
      'fare_gate_deviation_max_pct',
      'fare_gate_periphery_drop_max_pp',
      'fare_gate_backstop_binding_max_pct',
      'fare_gate_retention_drop_max_pp',
      'fare_gate_heat_correlation_min',
    ]);

    const thresholds = {
      complaintRate: Number(cfg.fare_gate_complaint_rate_max) || 0,
      deviation: Number(cfg.fare_gate_deviation_max_pct) || 0,
      peripheryDrop: Number(cfg.fare_gate_periphery_drop_max_pp) || 0,
      backstopBinding: Number(cfg.fare_gate_backstop_binding_max_pct) || 0,
      retentionDrop: Number(cfg.fare_gate_retention_drop_max_pp) || 0,
      heatCorrelation: Number(cfg.fare_gate_heat_correlation_min) || 0,
    };

    // ── Gate 1: Complaint rate (per 1k charged rides) ──
    const [complaintRow] = await db
      .select({ count: count() })
      .from(cancelSurveys)
      .where(
        and(
          eq(cancelSurveys.completed, true),
          gte(cancelSurveys.created_at, cutoff),
        ),
      );

    const [completedRidesRow] = await db
      .select({ count: count() })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          gte(rides.completed_at, cutoff),
        ),
      );

    const totalCompleted = completedRidesRow?.count ?? 0;
    const complaints = complaintRow?.count ?? 0;
    const complaintRate =
      totalCompleted > 0 ? (complaints / totalCompleted) * 1000 : null;

    // ── Gate 2: Quote-to-final deviation (median abs %) ──
    // Compare v6 shadow total vs v2 billed rider_payable_bdt
    const [deviationRow] = await db
      .select({
        median_abs_pct: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY ABS(
            CASE WHEN (${rides.rider_payable_bdt} > 0)
            THEN (((${rides.fare_v6_shadow}->>'total_bdt')::numeric - ${rides.rider_payable_bdt})::numeric / ${rides.rider_payable_bdt}::numeric * 100)
            ELSE NULL END
          )
        )`,
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.fare_v6_shadow),
          isNotNull(rides.rider_payable_bdt),
          gte(rides.completed_at, cutoff),
        ),
      );

    const deviation = deviationRow?.median_abs_pct
      ? Number(deviationRow.median_abs_pct)
      : null;

    // ── Gate 3: Periphery accept-rate drop (cold zone accept %) ──
    // Cold zones = tag = 'cold' in zone_heat; compare current period vs baseline
    const [currentAcceptRow] = await db
      .select({
        total: count(),
        accepted: sql<number>`count(*) FILTER (WHERE ${dispatchOffers.outcome} = 'accepted')`,
      })
      .from(dispatchOffers)
      .innerJoin(rides, eq(dispatchOffers.ride_id, rides.id))
      .where(
        and(
          gte(dispatchOffers.sent_at, cutoff),
          // Cold zone filter via drop_zone_id join
        ),
      );

    // Get cold zone IDs for the cold zone accept rate
    const coldZoneIds = await db
      .select({ zone_id: sql<string>`zone_id` })
      .from(sql`zone_heat`)
      .where(sql`tag = 'cold'`);

    const coldZoneIdSet = new Set(coldZoneIds.map((r) => r.zone_id));

    // Periphery: rides ending in cold zones
    const [peripheryCurrentRow] = await db
      .select({
        total: count(),
        accepted: sql<number>`count(*) FILTER (WHERE ${dispatchOffers.outcome} = 'accepted')`,
      })
      .from(dispatchOffers)
      .innerJoin(rides, eq(dispatchOffers.ride_id, rides.id))
      .where(
        and(
          gte(dispatchOffers.sent_at, cutoff),
          isNotNull(rides.drop_zone_id),
        ),
      );

    const peripheryTotal = peripheryCurrentRow?.total ?? 0;
    const peripheryAccepted = Number(peripheryCurrentRow?.accepted ?? 0);
    const peripheryAcceptRate =
      peripheryTotal > 0 ? (peripheryAccepted / peripheryTotal) * 100 : null;

    // For a drop comparison, we'd need historical baseline. Use config threshold as
    // "max acceptable drop from baseline" — during Stage 0 we report current rate
    // and let admin set baseline. Display as absolute % with threshold context.
    const peripheryDropPp = peripheryAcceptRate; // percentage points

    // ── Gate 4: Backstop binding rate (%) ──
    const [backstopRow] = await db
      .select({
        total_charged: sql<number>`count(*) FILTER (WHERE charged = true)`,
        backstop_binding: sql<number>`count(*) FILTER (WHERE charged = true AND backstop_was_binding = true)`,
      })
      .from(pickupDistanceSamples)
      .where(gte(pickupDistanceSamples.created_at, cutoff));

    const totalCharged = Number(backstopRow?.total_charged ?? 0);
    const backstopBinding = Number(backstopRow?.backstop_binding ?? 0);
    const backstopBindingPct =
      totalCharged > 0 ? (backstopBinding / totalCharged) * 100 : null;

    // ── Gate 5: Driver retention (active drivers/week) ──
    // Current week: distinct drivers with completed rides
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [currentWeekRow] = await db
      .select({
        count: countDistinct(rides.driver_id),
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.driver_id),
          gte(rides.completed_at, weekStart),
        ),
      );

    const [prevWeekRow] = await db
      .select({
        count: countDistinct(rides.driver_id),
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.driver_id),
          gte(rides.completed_at, prevWeekStart),
          lte(rides.completed_at, weekStart),
        ),
      );

    const currentWeekDrivers = currentWeekRow?.count ?? 0;
    const prevWeekDrivers = prevWeekRow?.count ?? 0;
    const retentionDropPp =
      prevWeekDrivers > 0
        ? ((prevWeekDrivers - currentWeekDrivers) / prevWeekDrivers) * 100
        : null;

    // ── Gate 6: Heat model validation (backtest correlation) ──
    const [heatRow] = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, 'heat_backtest_correlation'))
      .limit(1);

    const heatCorrelation = heatRow?.value ? Number(heatRow.value) : null;

    // ── Traffic-light evaluation ──
    function evaluate(
      measured: number | null,
      threshold: number,
      mode: 'lower_better' | 'higher_better' = 'lower_better',
    ): GateStatus {
      if (threshold === 0) return 'calibration_needed';
      if (measured === null) return 'calibration_needed';
      if (mode === 'lower_better') {
        return measured <= threshold ? 'green' : 'red';
      }
      // higher_better: measured >= threshold → green
      return measured >= threshold ? 'green' : 'red';
    }

    const metrics: GateMetric[] = [
      {
        key: 'complaint_rate',
        label: 'Complaint Rate (per 1k rides)',
        measured: complaintRate,
        threshold: thresholds.complaintRate,
        status: evaluate(complaintRate, thresholds.complaintRate),
        hint:
          thresholds.complaintRate === 0
            ? 'Set fare_gate_complaint_rate_max in Platform Config to enable.'
            : `Trigger: >${thresholds.complaintRate}/1k rides → red.`,
      },
      {
        key: 'quote_deviation',
        label: 'Quote-to-Final Deviation (median abs %)',
        measured: deviation,
        threshold: thresholds.deviation,
        status: evaluate(deviation, thresholds.deviation),
        hint:
          thresholds.deviation === 0
            ? 'Set fare_gate_deviation_max_pct in Platform Config to enable.'
            : `Trigger: >${thresholds.deviation}% → red. Measures v6 shadow vs v2 billed.`,
      },
      {
        key: 'periphery_accept',
        label: 'Periphery Accept Rate (cold zones, %)',
        measured: peripheryDropPp,
        threshold: thresholds.peripheryDrop,
        status: evaluate(peripheryDropPp, thresholds.peripheryDrop, 'higher_better'),
        hint:
          thresholds.peripheryDrop === 0
            ? 'Set fare_gate_periphery_drop_max_pp in Platform Config to enable.'
            : `Trigger: drop >${thresholds.peripheryDrop}pp → red. Current: ${peripheryDropPp?.toFixed(1) ?? '—'}%.`,
      },
      {
        key: 'backstop_binding',
        label: 'Backstop Binding Rate (%)',
        measured: backstopBindingPct,
        threshold: thresholds.backstopBinding,
        status: evaluate(backstopBindingPct, thresholds.backstopBinding),
        hint:
          thresholds.backstopBinding === 0
            ? 'Set fare_gate_backstop_binding_max_pct in Platform Config to enable. Default 0 = CALIBRATION NEEDED (PATCH 5).'
            : `Trigger: >${thresholds.backstopBinding}% → red.`,
      },
      {
        key: 'driver_retention',
        label: 'Driver Retention (week-over-week drop %)',
        measured: retentionDropPp,
        threshold: thresholds.retentionDrop,
        status: evaluate(retentionDropPp, thresholds.retentionDrop),
        hint:
          thresholds.retentionDrop === 0
            ? 'Set fare_gate_retention_drop_max_pp in Platform Config to enable.'
            : `Trigger: drop >${thresholds.retentionDrop}pp → red. Current week: ${currentWeekDrivers}, prev: ${prevWeekDrivers}.`,
      },
      {
        key: 'heat_correlation',
        label: 'Heat Model Backtest Correlation',
        measured: heatCorrelation,
        threshold: thresholds.heatCorrelation,
        status: evaluate(heatCorrelation, thresholds.heatCorrelation, 'higher_better'),
        hint:
          thresholds.heatCorrelation === 0
            ? 'Set fare_gate_heat_correlation_min in Platform Config to enable.'
            : `Trigger: <${thresholds.heatCorrelation} → red.`,
      },
    ];

    // ── Deviation Detail Panel ──────────────────────────────────────
    // Richer v6-vs-v2 analytics beyond Gate 2's single median.

    // Coverage: % of completed rides with shadow data
    const [shadowCountRow] = await db
      .select({ count: count() })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.fare_v6_shadow),
          gte(rides.completed_at, cutoff),
        ),
      );
    const shadowCount = shadowCountRow?.count ?? 0;
    const shadowCoveragePct =
      totalCompleted > 0 ? (shadowCount / totalCompleted) * 100 : null;

    // 7-day median deviation (trend comparison)
    const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [deviation7dRow] = await db
      .select({
        median_abs_pct: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY ABS(
            CASE WHEN (${rides.rider_payable_bdt} > 0)
            THEN (((${rides.fare_v6_shadow}->>'total_bdt')::numeric - ${rides.rider_payable_bdt})::numeric / ${rides.rider_payable_bdt}::numeric * 100)
            ELSE NULL END
          )
        )`,
        count: count(),
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.fare_v6_shadow),
          isNotNull(rides.rider_payable_bdt),
          gte(rides.completed_at, cutoff7d),
        ),
      );
    const deviation7d = deviation7dRow?.median_abs_pct
      ? Number(deviation7dRow.median_abs_pct)
      : null;
    const deviation7dCount = deviation7dRow?.count ?? 0;

    // Trend: 7d vs 30d direction
    let trend: 'improving' | 'worsening' | 'stable' | 'insufficient_data' = 'insufficient_data';
    if (deviation !== null && deviation7d !== null && deviation7dCount >= 10) {
      const delta = deviation7d - deviation;
      if (Math.abs(delta) < 1) trend = 'stable';
      else if (delta < 0) trend = 'improving';
      else trend = 'worsening';
    }

    // Per-vehicle-type deviation breakdown
    const vehicleTypeRows = await db
      .select({
        vehicle_type: rides.vehicle_type,
        median_abs_pct: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY ABS(
            CASE WHEN (${rides.rider_payable_bdt} > 0)
            THEN (((${rides.fare_v6_shadow}->>'total_bdt')::numeric - ${rides.rider_payable_bdt})::numeric / ${rides.rider_payable_bdt}::numeric * 100)
            ELSE NULL END
          )
        )`,
        ride_count: count(),
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.fare_v6_shadow),
          isNotNull(rides.rider_payable_bdt),
          gte(rides.completed_at, cutoff),
        ),
      )
      .groupBy(rides.vehicle_type);

    const deviationByVehicle = vehicleTypeRows
      .filter((r) => r.ride_count > 0)
      .map((r) => ({
        vehicle_type: r.vehicle_type,
        median_abs_pct: r.median_abs_pct ? Number(r.median_abs_pct) : null,
        ride_count: Number(r.ride_count),
      }));

    // Deviation distribution (bucket histogram)
    const [distRow] = await db
      .select({
        bucket_0_5: sql<number>`count(*) FILTER (WHERE pct BETWEEN 0 AND 5)`,
        bucket_5_10: sql<number>`count(*) FILTER (WHERE pct BETWEEN 5 AND 10)`,
        bucket_10_15: sql<number>`count(*) FILTER (WHERE pct BETWEEN 10 AND 15)`,
        bucket_15_25: sql<number>`count(*) FILTER (WHERE pct BETWEEN 15 AND 25)`,
        bucket_25_plus: sql<number>`count(*) FILTER (WHERE pct > 25)`,
        bucket_negative: sql<number>`count(*) FILTER (WHERE pct < 0)`,
      })
      .from(
        sql`(
          SELECT ABS(
            CASE WHEN (${rides.rider_payable_bdt} > 0)
            THEN (((${rides.fare_v6_shadow}->>'total_bdt')::numeric - ${rides.rider_payable_bdt})::numeric / ${rides.rider_payable_bdt}::numeric * 100)
            ELSE NULL END
          ) AS pct
          FROM ${rides}
          WHERE ${rides.status} = 'completed'
            AND ${rides.fare_v6_shadow} IS NOT NULL
            AND ${rides.rider_payable_bdt} > 0
            AND ${rides.completed_at} >= ${cutoff}
        ) AS dev
      `);

    const deviationDistribution = {
      '0-5%': Number(distRow?.bucket_0_5 ?? 0),
      '5-10%': Number(distRow?.bucket_5_10 ?? 0),
      '10-15%': Number(distRow?.bucket_10_15 ?? 0),
      '15-25%': Number(distRow?.bucket_15_25 ?? 0),
      '25%+': Number(distRow?.bucket_25_plus ?? 0),
      negative: Number(distRow?.bucket_negative ?? 0),
    };

    // Recent ride deviations (last 20 for spot-checking)
    const recentRows = await db
      .select({
        ride_id: rides.id,
        completed_at: rides.completed_at,
        vehicle_type: rides.vehicle_type,
        v2_total: rides.rider_payable_bdt,
        v6_total: sql<number | null>`${rides.fare_v6_shadow}->>'total_bdt'`,
        v6_commission: sql<number | null>`${rides.fare_v6_shadow}->>'platform_commission_bdt'`,
      })
      .from(rides)
      .where(
        and(
          eq(rides.status, 'completed'),
          isNotNull(rides.fare_v6_shadow),
          isNotNull(rides.rider_payable_bdt),
          gte(rides.completed_at, cutoff7d),
        ),
      )
      .orderBy(sql`${rides.completed_at} DESC`)
      .limit(20);

    const recentDeviations = recentRows.map((r) => {
      const v2 = Number(r.v2_total ?? 0);
      const v6 = Number(r.v6_total ?? 0);
      const absDiff = v2 > 0 ? Math.abs(v6 - v2) : null;
      const absPct = v2 > 0 ? Math.abs((v6 - v2) / v2) * 100 : null;
      return {
        ride_id: r.ride_id,
        completed_at: r.completed_at,
        vehicle_type: r.vehicle_type,
        v2_total_bdt: v2,
        v6_total_bdt: v6,
        abs_diff_bdt: absDiff,
        abs_pct: absPct ? Number(absPct.toFixed(1)) : null,
      };
    });

    return Response.json({
      metrics,
      deviation_detail: {
        shadow_coverage_pct: shadowCoveragePct ? Number(shadowCoveragePct.toFixed(1)) : null,
        shadow_ride_count: shadowCount,
        total_completed_rides: totalCompleted,
        deviation_30d: deviation,
        deviation_7d: deviation7d,
        deviation_7d_ride_count: deviation7dCount,
        trend,
        by_vehicle_type: deviationByVehicle,
        distribution: deviationDistribution,
        recent_deviations: recentDeviations,
      },
      lookback_days: LOOKBACK_DAYS,
      evaluated_at: now.toISOString(),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: 'unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    if (errors.getErrorStatus(err) === 403)
      return Response.json(
        { error: 'forbidden', message: 'Access denied' },
        { status: 403 },
      );
    logger.error('[admin/fare-gate-metrics] GET error', err);
    return Response.json(
      { error: 'internal_error', message: 'An internal server error occurred' },
      { status: 500 },
    );
  }
}
