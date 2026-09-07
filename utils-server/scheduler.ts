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
  zones,
  riderSubscriptions,
  dispatchOffers,
  rateLimits,
  creditVouchers,
  ownerConsents,
  paymentEvents,
  incentiveDefinitions,
  driverIncentives,
  systemConfig,
  platformConfig,
  promoCodes,
  driverWalletTransactions,
  weatherConditions,
  sosAlerts,
  zoneHeat,
  zoneHeatHistory,
  fraudFlags,
  zoneRecalibrationQueue,
  pickupDistanceSamples,
  zoneRecoverySamples,
  tripTimeSamples,
} from "../src/db/schema";
import { and, eq, lt, lte, isNull, isNotNull, sql, or, gte, inArray } from "drizzle-orm";
import { detectStationaryAnomaly } from "../lib/safety";
import { logger } from "../lib/logger";
import { nextBdtMidnightUtc } from "../lib/time";
import { resetAllBudgets } from "../lib/zoneBudget";
import { evaluateGraduation } from "../lib/zoneLifecycle";
import { expireCredits, expireRiderFeeDeductions } from "../lib/walletCashback";
import { runFraudDetection } from "../lib/fraudDetection";
import { expireCancellationCredits } from "../lib/cancellationCompensation";
import { sendNotification } from "../lib/notify";
import { getPlan05Int, getConfigValue } from "@/lib/platformConfig";
import { upsertDemandForecasts } from "@/lib/forecast";
import {
  getFareFrameworkConfig,
  parseConfigNumber,
} from "../lib/fareFrameworkConfig";
import {
  ewmaUpdate,
  ewmaAlpha,
  percentileRank,
  blendScore,
  heatTag,
  median,
  quantile,
} from "./heat";

// ═══════════════════════════════════════════════════════════════════════════
// ADR Phase 0 (Z4) — marketplace tick instrumentation + pooler-safe budgets.
// PROVISIONAL: every budget in this block is provisional and WILL be
// re-derived at the Phase 2 gate. Session-level `SET statement_timeout` is
// FORBIDDEN until the Phase 1 coupled change — only transaction-scoped
// `SET LOCAL` is used here (it survives Supavisor transaction mode).
// ═══════════════════════════════════════════════════════════════════════════

import type { PgTx } from "./tx";

type JobTx = PgTx;

/** PG 57014 query_canceled — statement_timeout fired (server-side cancel). */
export function isQueryCanceled(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === "57014"
  );
}

// PROVISIONAL budget derivation (Phase 0 record):
// - Formula per execution order: budget = max(2000, 10 × observed median),
//   capped at 30000.
// - Local idle-tick measurement was NOT possible at Phase 0 (no live
//   DB/pooler), so no median was observed. The only measured data available:
//   healthy remote round-trips ~1.5s, cold connects ~5.8s, and the global
//   per-connection statement_timeout of 30s (all in src/db/index.ts).
// - 10_000 = 10 × a 1_000ms PROVISIONAL median estimate for a LIMIT-bounded
//   watermark scan — 3.3× headroom below the 30s global ceiling so a wedged
//   tick cannot hold a pooler slot for the full global budget.
// Budget derived from the A8 local rig POST-BATCHING (2026-09-06, commit
// measured on the ac046b1 lineage; script: scripts/load-gen-marketplace.ts,
// report: .kilo/plans/2026-09-06-a8-local-rig-report.md + v2 section).
// Scan SQL p99 after batching: job 46 = 1.9s, job 54 SQL = sub-second (4
// statements), jobs 55/56/47/48 = 0.3-0.9s. 10_000ms keeps ≥5x headroom over
// the worst scan (job 46) under the 30s global ceiling.
// KNOWN RESIDUAL (not budget-governed): job 54 wall-clock p99 = 14.2s from
// per-push expo HTTP + serialized sendNotification dedup queries inside
// lib/notify (single postgres-js connection) — a lib/notify concern, flagged
// for a follow-up round; statement_timeout cannot bound external HTTP.
// Re-derive on the hosted load test.
const MARKETPLACE_TICK_BUDGET_MS = 10_000;

// Pool occupancy (spec part 3): node-postgres Pool exposes totalCount/
// idleCount/waitingCount. This project's pool is postgres-js
// (postgres package — src/db/index.ts) which does NOT expose live occupancy
// counters. Finding logged once per process; occupancy fields are appended to
// tick lines ONLY if a compatible pool is ever reachable. No plumbing is
// invented through drizzle internals.
const poolOccupancy = (): Record<string, number> => {
  const client = (
    db as unknown as {
      $client?: { totalCount?: unknown; idleCount?: unknown; waitingCount?: unknown };
    }
  ).$client;
  if (
    typeof client?.totalCount === "number" &&
    typeof client?.idleCount === "number" &&
    typeof client?.waitingCount === "number"
  ) {
    return {
      pool_total: client.totalCount,
      pool_idle: client.idleCount,
      pool_waiting: client.waitingCount,
    };
  }
  return {};
};

let poolOccupancyFindingLogged = false;

/**
 * Run one scheduler tick inside a transaction whose FIRST statement is
 * `SET LOCAL statement_timeout = <budget>` (transaction-scoped; pooler-safe).
 * fn receives the transaction handle. PG 57014 (query_canceled) is swallowed
 * and logged as outcome 'timeout'; any other error is logged as outcome
 * 'error' and rethrown to the job's own catch. EVERY run logs exactly one
 * structured '[scheduler] job N tick' line (outcome ok|error|timeout).
 */
export async function withJobBudget<T>(
  jobN: number,
  budgetMs: number,
  fn: (tx: JobTx) => Promise<T>,
): Promise<T | undefined> {
  const started = Date.now();
  const budget = Math.max(1, Math.floor(budgetMs));
  if (!poolOccupancyFindingLogged) {
    poolOccupancyFindingLogged = true;
    if (Object.keys(poolOccupancy()).length === 0) {
      logger.warn(
        "[scheduler] pool occupancy unavailable (postgres-js client exposes no totalCount/idleCount/waitingCount) — tick lines omit pool fields",
      );
    }
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = ${budget}`));
      return fn(tx);
    });
    logger.info(`[scheduler] job ${jobN} tick`, {
      job: jobN,
      duration_ms: Date.now() - started,
      outcome: "ok",
      ...poolOccupancy(),
    });
    return result;
  } catch (e) {
    if (isQueryCanceled(e)) {
      logger.info(`[scheduler] job ${jobN} tick`, {
        job: jobN,
        duration_ms: Date.now() - started,
        outcome: "timeout",
        ...poolOccupancy(),
      });
      // Swallowed — the job's running flag releases in its finally block.
      return undefined;
    }
    logger.info(`[scheduler] job ${jobN} tick`, {
      job: jobN,
      duration_ms: Date.now() - started,
      outcome: "error",
      ...poolOccupancy(),
    });
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Fare Framework monitors (Phase E/F/G) — pure helpers + job runners.
// Exported for unit tests; startScheduler wires them as jobs 38–41.
// ═══════════════════════════════════════════════════════════════════════════

/** Parse a '1,2,4'-style escalation-windows config value into day counts. */
export function parseEscalationWindows(csv: string): number[] {
  return csv
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// ── Dawdle guard (Phase F monitor) ─────────────────────────────────────────
//
// ratio = realized_km / firm_km per CHARGED pickup sample. The driver stat is
// compared ZONE-RELATIVELY: adjusted = 1 + (driverStat − zoneStat), i.e. the
// driver's ratio indexed against their zone's baseline (driver == zone → 1.0),
// then compared against the threshold + dawdle_zone_margin slack. Without a
// zone baseline the absolute thresholds apply.

export interface DawdleThresholds {
  medianThreshold: number;
  p90Threshold: number;
  zoneMargin: number;
}

export interface DawdleEvaluation {
  breached: boolean;
  median: number;
  p90: number;
  zone_id: string | null;
  zone_median: number | null;
  zone_p90: number | null;
  sample_count: number;
}

/** realized/firm ratio; null when the sample is unusable (null km or firm <= 0). */
export function dawdleRatio(realizedKm: number | null, firmKm: number | null): number | null {
  if (realizedKm == null || firmKm == null || firmKm <= 0) return null;
  return realizedKm / firmKm;
}

export function evaluateDawdle(
  ratios: number[],
  zoneId: string | null,
  zoneRatios: number[] | null,
  thresholds: DawdleThresholds,
): DawdleEvaluation {
  const driverMedian = median(ratios);
  const driverP90 = quantile(ratios, 0.9);
  let zoneMedian: number | null = null;
  let zoneP90: number | null = null;
  if (zoneId && zoneRatios && zoneRatios.length > 0) {
    zoneMedian = median(zoneRatios);
    zoneP90 = quantile(zoneRatios, 0.9);
  }

  let breached = false;
  if (zoneMedian != null && zoneP90 != null) {
    const adjustedMedian = 1 + (driverMedian - zoneMedian);
    const adjustedP90 = 1 + (driverP90 - zoneP90);
    breached =
      adjustedMedian > thresholds.medianThreshold + thresholds.zoneMargin ||
      adjustedP90 > thresholds.p90Threshold + thresholds.zoneMargin;
  } else {
    breached =
      driverMedian > thresholds.medianThreshold ||
      driverP90 > thresholds.p90Threshold;
  }

  return {
    breached,
    median: driverMedian,
    p90: driverP90,
    zone_id: zoneId,
    zone_median: zoneMedian,
    zone_p90: zoneP90,
    sample_count: ratios.length,
  };
}

// ── Response ladder (Phase G) — shared escalation routine ──────────────────
//
// Status advances open → warned → escalated → blocked, at most one step per
// run, gated by the escalation windows ([1,2,4] days by default) measured
// from the flag's updated_at (the last status change). offense_count
// increments on each advancement. 'blocked' and 'resolved' are terminal for
// this routine (admin owns un-blocking via resolution).

export type FraudFlagStatus = "open" | "warned" | "escalated" | "blocked" | "resolved";

const LADDER_NEXT: Record<"open" | "warned" | "escalated", "warned" | "escalated" | "blocked"> = {
  open: "warned",
  warned: "escalated",
  escalated: "blocked",
};

export interface LadderStep {
  nextStatus: "warned" | "escalated" | "blocked";
  offenseCount: number;
  /** The window (days) that had to elapse for this advancement. */
  windowDays: number;
}

export function ladderAdvancement(
  status: FraudFlagStatus,
  offenseCount: number,
  updatedAt: Date,
  now: Date,
  windows: number[],
): LadderStep | null {
  if (status !== "open" && status !== "warned" && status !== "escalated") return null;
  const windowDays = windows[status === "open" ? 0 : status === "warned" ? 1 : 2];
  if (!windowDays || windowDays <= 0) return null;
  const elapsedDays = (now.getTime() - updatedAt.getTime()) / 86_400_000;
  if (elapsedDays < windowDays) return null;
  return {
    nextStatus: LADDER_NEXT[status],
    offenseCount: offenseCount + 1,
    windowDays,
  };
}

// ── Zone recalibration (Phase F monitor) ───────────────────────────────────

export interface ZoneDeviation {
  deviation_pct: number;
  sample_count: number;
}

/** mean(|quote − realized| / quote) as a percentage, over usable samples. */
export function zoneDeviation(
  samples: { quote_km: number | null; realized_km: number | null }[],
): ZoneDeviation | null {
  const usable = samples.filter(
    (s) => s.quote_km != null && s.quote_km > 0 && s.realized_km != null,
  );
  if (usable.length === 0) return null;
  const sum = usable.reduce(
    (acc, s) => acc + Math.abs((s.quote_km as number) - (s.realized_km as number)) / (s.quote_km as number),
    0,
  );
  return { deviation_pct: (sum / usable.length) * 100, sample_count: usable.length };
}

/**
 * Idempotent CSV append for pickup_low_confidence_zone_ids.
 * Returns the new CSV string, or null when the zone id is already present.
 */
export function mergeZoneCsv(currentCsv: string, zoneId: string): string | null {
  const id = zoneId.trim();
  if (!id) return null;
  const parts = currentCsv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes(id)) return null;
  parts.push(id);
  return parts.join(",");
}

// ── Decline monitoring (Phase E, FC-4 adjacent) ────────────────────────────

export const DECLINE_MONITOR_MIN_OFFERS = 20;
export const DECLINE_MONITOR_WINDOW_DAYS = 30;

/** Flag when cold-tagged decline rate exceeds 2× the hot-tag median. */
export function isDeclineAnomaly(
  coldDeclineRate: number,
  hotMedianDeclineRate: number,
): boolean {
  return coldDeclineRate > 2 * hotMedianDeclineRate;
}

// ── Job runners (exported for tests; wired by startScheduler) ──────────────

interface DawdleSampleRow {
  driver_id: string | null;
  zone_id: string | null;
  realized_km: string | null;
  firm_km: string | null;
  created_at: Date;
}

function toEvidence(evaluation: DawdleEvaluation, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    median: Number(evaluation.median.toFixed(4)),
    p90: Number(evaluation.p90.toFixed(4)),
    zone: evaluation.zone_id,
    zone_median: evaluation.zone_median != null ? Number(evaluation.zone_median.toFixed(4)) : null,
    zone_p90: evaluation.zone_p90 != null ? Number(evaluation.zone_p90.toFixed(4)) : null,
    sample_count: evaluation.sample_count,
    ...extra,
  };
}

/**
 * Job 38 — Dawdle guard (daily 04:00 BDT). Fee-live mode only: charged
 * samples exist only when the pickup fee is charging. Per driver, the
 * rolling last dawdle_rolling_pickups charged samples within
 * dawdle_window_days; zone-relative median/p90 breach → new fraud_flags row
 * (status 'open'); existing non-resolved flag → still_breaching evidence
 * refresh (status changes are owned by the response-ladder job 40).
 */
export async function runDawdleGuard(): Promise<void> {
  const cfg = await getFareFrameworkConfig([
    "dawdle_rolling_pickups",
    "dawdle_median_threshold",
    "dawdle_p90_threshold",
    "dawdle_zone_margin",
    "dawdle_window_days",
  ]);
  const rollingN = parseConfigNumber(cfg.dawdle_rolling_pickups, 30);
  const thresholds: DawdleThresholds = {
    medianThreshold: parseConfigNumber(cfg.dawdle_median_threshold, 1.15),
    p90Threshold: parseConfigNumber(cfg.dawdle_p90_threshold, 1.35),
    zoneMargin: parseConfigNumber(cfg.dawdle_zone_margin, 0.1),
  };
  const windowDays = parseConfigNumber(cfg.dawdle_window_days, 14);
  const windowStart = new Date(Date.now() - windowDays * 86_400_000);
  const now = new Date();

  const sampleRows = (await db
    .select({
      driver_id: rides.driver_id,
      zone_id: pickupDistanceSamples.zone_id,
      realized_km: pickupDistanceSamples.realized_km,
      firm_km: pickupDistanceSamples.firm_km,
      created_at: pickupDistanceSamples.created_at,
    })
    .from(pickupDistanceSamples)
    .innerJoin(rides, eq(rides.id, pickupDistanceSamples.ride_id))
    .where(
      and(
        eq(pickupDistanceSamples.charged, true),
        gte(pickupDistanceSamples.created_at, windowStart),
      ),
    )) as DawdleSampleRow[];

  // Zone baselines: ALL charged samples in the window, per zone.
  const zoneRatioLists = new Map<string, number[]>();
  // Per driver: ratio/zone pairs in query order (ascending created_at — the
  // rolling window below takes the LAST rollingN, i.e. the newest).
  const driverSamples = new Map<string, { ratio: number; zone_id: string | null }[]>();
  for (const row of sampleRows) {
    const ratio = dawdleRatio(
      row.realized_km != null ? Number(row.realized_km) : null,
      row.firm_km != null ? Number(row.firm_km) : null,
    );
    if (ratio == null) continue;
    if (row.zone_id) {
      const list = zoneRatioLists.get(row.zone_id) ?? [];
      list.push(ratio);
      zoneRatioLists.set(row.zone_id, list);
    }
    if (row.driver_id) {
      const list = driverSamples.get(row.driver_id) ?? [];
      list.push({ ratio, zone_id: row.zone_id });
      driverSamples.set(row.driver_id, list);
    }
  }
  if (driverSamples.size === 0) return;

  // Existing non-resolved dawdle flags (open/warned/escalated — blocked is
  // admin territory, resolved is history).
  const existingFlags = await db
    .select({
      id: fraudFlags.id,
      driver_id: fraudFlags.driver_id,
      evidence: fraudFlags.evidence,
    })
    .from(fraudFlags)
    .where(
      and(
        eq(fraudFlags.flag_type, "dawdle"),
        inArray(fraudFlags.status, ["open", "warned", "escalated"]),
      ),
    );
  const flagsByDriver = new Map(existingFlags.map((f) => [f.driver_id, f]));

  let flagged = 0;
  for (const [driverId, samples] of driverSamples) {
    const window = samples.slice(-rollingN);
    if (window.length < rollingN) continue; // not enough charged pickups yet

    // Dominant zone = most frequent zone among the driver's rolling window.
    const zoneCounts = new Map<string, number>();
    for (const s of window) {
      if (s.zone_id) zoneCounts.set(s.zone_id, (zoneCounts.get(s.zone_id) ?? 0) + 1);
    }
    const dominantZone =
      [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const evaluation = evaluateDawdle(
      window.map((s) => s.ratio),
      dominantZone,
      dominantZone ? (zoneRatioLists.get(dominantZone) ?? null) : null,
      thresholds,
    );
    const existing = flagsByDriver.get(driverId);

    if (evaluation.breached) {
      const evidence = toEvidence(evaluation, {
        still_breaching: true,
        last_breach_at: now.toISOString(),
        window_days: windowDays,
      });
      if (!existing) {
        await db.insert(fraudFlags).values({
          driver_id: driverId,
          flag_type: "dawdle",
          evidence,
        });
        flagged++;
      } else {
        await db
          .update(fraudFlags)
          .set({
            evidence: { ...((existing.evidence as Record<string, unknown>) ?? {}), ...evidence },
            updated_at: now,
          })
          .where(eq(fraudFlags.id, existing.id));
      }
    } else if (existing) {
      const prev = (existing.evidence as Record<string, unknown>) ?? {};
      if (prev.still_breaching === true) {
        // Recovered driver — stop the ladder from advancing on stale evidence.
        await db
          .update(fraudFlags)
          .set({
            evidence: { ...prev, still_breaching: false },
            updated_at: now,
          })
          .where(eq(fraudFlags.id, existing.id));
      }
    }
  }
  if (flagged > 0) {
    logger.info("[scheduler] dawdle guard: new flags", { count: flagged });
  }
}

/**
 * Job 39 — Zone recalibration (daily 05:00 BDT). Exits early while
 * zone_recal_min_sample_rides = 0 (off until Stage 0 calibration). Per zone
 * over charged samples (trailing 28 days): mean |quote−realized|/quote
 * > zone_recal_deviation_pct with enough samples → queue row (unless an
 * open one exists) + idempotent pickup_low_confidence_zone_ids CSV append,
 * both inside one transaction.
 */
export async function runZoneRecalibration(): Promise<void> {
  const cfg = await getFareFrameworkConfig([
    "zone_recal_deviation_pct",
    "zone_recal_min_sample_rides",
    "zone_recal_review_sla_days",
  ]);
  const deviationThresholdPct = parseConfigNumber(cfg.zone_recal_deviation_pct, 20);
  const minSamples = parseConfigNumber(cfg.zone_recal_min_sample_rides, 0);
  if (minSamples <= 0) return; // 0 = off (Stage 0 default)
  const slaDays = parseConfigNumber(cfg.zone_recal_review_sla_days, 5);
  const windowStart = new Date(Date.now() - 28 * 86_400_000);

  const rows = await db
    .select({
      zone_id: pickupDistanceSamples.zone_id,
      quote_km: pickupDistanceSamples.quote_km,
      realized_km: pickupDistanceSamples.realized_km,
    })
    .from(pickupDistanceSamples)
    .where(
      and(
        eq(pickupDistanceSamples.charged, true),
        gte(pickupDistanceSamples.created_at, windowStart),
        isNotNull(pickupDistanceSamples.zone_id),
      ),
    );

  const byZone = new Map<string, { quote_km: number | null; realized_km: number | null }[]>();
  for (const row of rows) {
    if (!row.zone_id) continue;
    const list = byZone.get(row.zone_id) ?? [];
    list.push({
      quote_km: row.quote_km != null ? Number(row.quote_km) : null,
      realized_km: row.realized_km != null ? Number(row.realized_km) : null,
    });
    byZone.set(row.zone_id, list);
  }

  const qualified: { zoneId: string; deviation: ZoneDeviation }[] = [];
  for (const [zoneId, samples] of byZone) {
    const deviation = zoneDeviation(samples);
    if (!deviation) continue;
    if (deviation.sample_count >= minSamples && deviation.deviation_pct > deviationThresholdPct) {
      qualified.push({ zoneId, deviation });
    }
  }
  if (qualified.length === 0) return;

  const openRows = await db
    .select({ zone_id: zoneRecalibrationQueue.zone_id })
    .from(zoneRecalibrationQueue)
    .where(eq(zoneRecalibrationQueue.status, "open"));
  const openZones = new Set(openRows.map((r) => r.zone_id));

  for (const { zoneId, deviation } of qualified) {
    await db.transaction(async (tx) => {
      if (!openZones.has(zoneId)) {
        await tx.insert(zoneRecalibrationQueue).values({
          zone_id: zoneId,
          deviation_pct: deviation.deviation_pct.toFixed(2),
          sample_count: deviation.sample_count,
        });
      }
      // Read-modify-write the low-confidence CSV under a row lock.
      const cfgRows = await tx.execute<{ value: string | null }>(
        sql`SELECT value FROM platform_config WHERE key = 'pickup_low_confidence_zone_ids' FOR UPDATE`,
      );
      const currentCsv = cfgRows[0]?.value ?? "";
      const merged = mergeZoneCsv(currentCsv, zoneId);
      if (merged != null) {
        if (cfgRows.length > 0) {
          await tx
            .update(platformConfig)
            .set({ value: merged, updated_at: new Date() })
            .where(eq(platformConfig.key, "pickup_low_confidence_zone_ids"));
        } else {
          await tx
            .insert(platformConfig)
            .values({
              key: "pickup_low_confidence_zone_ids",
              value: merged,
              updated_at: new Date(),
            })
            .onConflictDoUpdate({
              target: platformConfig.key,
              set: { value: merged, updated_at: new Date() },
            });
        }
      }
    });
    logger.info("[scheduler] zone recalibration queued", {
      zone_id: zoneId,
      deviation_pct: Number(deviation.deviation_pct.toFixed(2)),
      sample_count: deviation.sample_count,
      review_sla_days: slaDays,
    });
  }
}

/**
 * Job 40 — Response ladder (daily 06:00 BDT). Advances non-resolved
 * fraud_flags of type dawdle / off_platform_completion / cancel_rate one
 * step at a time (open→warned→escalated→blocked) once the escalation
 * window has elapsed. Dawdle flags only advance while still breaching
 * (evidence set daily by job 38). The 'warned' step sends the driver an
 * in-app warning via the existing push-notification path (there is no
 * generic WS notification message type — see types.ts OutboundMessage);
 * evidence.warning_sent records it either way.
 */
export async function runResponseLadder(): Promise<void> {
  const cfg = await getFareFrameworkConfig(["dawdle_escalation_windows"]);
  const windows = parseEscalationWindows(cfg.dawdle_escalation_windows);
  const now = new Date();

  const flags = await db
    .select({
      id: fraudFlags.id,
      driver_id: fraudFlags.driver_id,
      flag_type: fraudFlags.flag_type,
      evidence: fraudFlags.evidence,
      status: fraudFlags.status,
      offense_count: fraudFlags.offense_count,
      updated_at: fraudFlags.updated_at,
      driver_user_id: drivers.user_id,
    })
    .from(fraudFlags)
    .innerJoin(drivers, eq(drivers.id, fraudFlags.driver_id))
    .where(
      and(
        inArray(fraudFlags.flag_type, [
          "dawdle",
          "off_platform_completion",
          "cancel_rate",
        ]),
        inArray(fraudFlags.status, ["open", "warned", "escalated"]),
      ),
    );

  for (const flag of flags) {
    const evidence = (flag.evidence as Record<string, unknown>) ?? {};
    // Dawdle advancement requires the guard to have observed a breach on its
    // latest daily run; the other flag types advance on window elapse alone.
    if (flag.flag_type === "dawdle" && evidence.still_breaching !== true) continue;

    const step = ladderAdvancement(
      flag.status as FraudFlagStatus,
      flag.offense_count,
      flag.updated_at,
      now,
      windows,
    );
    if (!step) continue;

    const nextEvidence: Record<string, unknown> = { ...evidence };
    if (step.nextStatus === "warned") {
      try {
        await sendNotification(
          flag.driver_user_id,
          "fraud:warning",
          "Warning from Ride",
          "Our system flagged unusual activity on your account. Continued issues may restrict package purchases. Contact support if you believe this is a mistake.",
          { flag_type: flag.flag_type },
          { idempotencyKey: `fraud:${flag.id}:warned` },
        );
      } catch (e) {
        logger.error("[scheduler] ladder warning push failed", {
          flagId: flag.id,
          error: e,
        });
      }
      nextEvidence.warning_sent = true;
    }
    if (step.nextStatus === "escalated") {
      nextEvidence.cooldown_days = 2 * step.windowDays;
    }

    await db
      .update(fraudFlags)
      .set({
        status: step.nextStatus,
        offense_count: step.offenseCount,
        evidence: nextEvidence,
        updated_at: now,
      })
      .where(eq(fraudFlags.id, flag.id));

    logger.info("[scheduler] response ladder advanced", {
      flagId: flag.id,
      driverId: flag.driver_id,
      flagType: flag.flag_type,
      from: flag.status,
      to: step.nextStatus,
      offenseCount: step.offenseCount,
    });
  }
}

/**
 * Job 41 — Decline monitoring (weekly, Phase E). Trailing 30 days of
 * dispatch_offers joined rides for drop_zone_heat: a driver with ≥ 20
 * cold-tagged offers whose cold decline rate exceeds 2× the hot-tag median
 * decline rate gets a heat_manipulation fraud flag. MONITOR ONLY — status
 * stays 'open'; no auto-action, and the response ladder never escalates
 * this flag type.
 */
export async function runDeclineMonitoring(): Promise<void> {
  const windowStart = new Date(Date.now() - DECLINE_MONITOR_WINDOW_DAYS * 86_400_000);

  const rows = await db
    .select({
      driver_id: dispatchOffers.driver_id,
      tag: rides.drop_zone_heat,
      total: sql<number>`count(*)`,
      rejected: sql<number>`SUM(CASE WHEN ${dispatchOffers.outcome} = 'rejected' THEN 1 ELSE 0 END)`,
    })
    .from(dispatchOffers)
    .innerJoin(rides, eq(rides.id, dispatchOffers.ride_id))
    .where(
      and(
        gte(dispatchOffers.sent_at, windowStart),
        isNotNull(rides.drop_zone_heat),
      ),
    )
    .groupBy(dispatchOffers.driver_id, rides.drop_zone_heat);

  interface TagStat {
    total: number;
    rejected: number;
    rate: number;
  }
  const byDriver = new Map<string, { hot: TagStat | null; cold: TagStat | null }>();
  for (const row of rows) {
    if (row.tag !== "hot" && row.tag !== "cold") continue;
    const total = Number(row.total);
    const rejected = Number(row.rejected);
    const stat: TagStat = { total, rejected, rate: total > 0 ? rejected / total : 0 };
    const entry = byDriver.get(row.driver_id) ?? { hot: null, cold: null };
    if (row.tag === "hot" && total >= DECLINE_MONITOR_MIN_OFFERS) entry.hot = stat;
    if (row.tag === "cold" && total >= DECLINE_MONITOR_MIN_OFFERS) entry.cold = stat;
    byDriver.set(row.driver_id, entry);
  }

  const hotRates: number[] = [];
  for (const entry of byDriver.values()) {
    if (entry.hot) hotRates.push(entry.hot.rate);
  }
  if (hotRates.length === 0) return;
  const hotMedian = median(hotRates);

  const candidates: { driverId: string; cold: TagStat }[] = [];
  for (const [driverId, entry] of byDriver) {
    if (entry.cold && isDeclineAnomaly(entry.cold.rate, hotMedian)) {
      candidates.push({ driverId, cold: entry.cold });
    }
  }
  if (candidates.length === 0) return;

  // Idempotency: skip drivers that already have a non-resolved flag.
  const existingFlags = await db
    .select({ driver_id: fraudFlags.driver_id })
    .from(fraudFlags)
    .where(
      and(
        eq(fraudFlags.flag_type, "heat_manipulation"),
        inArray(fraudFlags.status, ["open", "warned", "escalated", "blocked"]),
      ),
    );
  const alreadyFlagged = new Set(existingFlags.map((f) => f.driver_id));

  for (const { driverId, cold } of candidates) {
    if (alreadyFlagged.has(driverId)) continue;
    await db.insert(fraudFlags).values({
      driver_id: driverId,
      flag_type: "heat_manipulation",
      evidence: {
        cold_decline_rate: Number(cold.rate.toFixed(4)),
        hot_median: Number(hotMedian.toFixed(4)),
        window: `${DECLINE_MONITOR_WINDOW_DAYS}d`,
        window_days: DECLINE_MONITOR_WINDOW_DAYS,
        cold_offers: cold.total,
        cold_rejected: cold.rejected,
        monitor_only: true,
      },
    });
    logger.info("[scheduler] decline monitor flagged", {
      driverId,
      coldDeclineRate: Number(cold.rate.toFixed(4)),
      hotMedian: Number(hotMedian.toFixed(4)),
    });
  }
}

export function startScheduler(): void {
  // ADR Phase 0 — honest job count: the '[scheduler] started (N jobs)' line is
  // derived from a counter incremented at each registration. It can never lie
  // again.
  let registeredJobs = 0;
  const registerJob = (
    fn: (...args: unknown[]) => void,
    ms?: number,
  ): ReturnType<typeof setInterval> => {
    registeredJobs += 1;
    return setInterval(fn, ms);
  };

  // ── (1) Scheduled ride dispatch — every 30s ─────────────────────────
  // Overlap guard: a tick slower than 30s must not start a second dispatch
  // sweep on the same `scheduled_dispatched_at IS NULL` rows.
  let scheduledDispatchRunning = false;
  registerJob(async () => {
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
              .where(
                and(
                  eq(rides.id, ride.id),
                  eq(rides.status, "scheduled"),
                  isNull(rides.scheduled_dispatched_at),
                ),
              );
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
            .where(
              and(
                eq(vehicleTypeChanges.id, change.id),
                eq(vehicleTypeChanges.status, "cooling_off"),
                lte(vehicleTypeChanges.effective_at, new Date()),
              ),
            );
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
  registerJob(async () => {
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
  registerJob(async () => {
    try {
      const now = new Date();
      await db.delete(usedChallenges).where(lt(usedChallenges.expires_at, now));
    } catch (e) {
      logger.error("[scheduler] used_challenges cleanup error", e);
    }
  }, 300_000);

  // ── (9) RTDB cleanup — every 5 min ─────────────────────────────────
  registerJob(async () => {
    try {
      // Cleanup stale RTDB verification entries is handled by Cloud Functions TTL
      logger.debug("[scheduler] RTDB cleanup tick");
    } catch (e) {
      logger.error("[scheduler] RTDB cleanup error", e);
    }
  }, 300_000);

  // ── (10) Document purge — every 1h ─────────────────────────────────
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
      await db.delete(rateLimits).where(lt(rateLimits.window_start, cutoff));
    } catch (e) {
      logger.error("[scheduler] rate limits cleanup error", e);
    }
  }, 3600_000);

  // ── (14) Credit voucher expiry — every 5 min ────────────────────────
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
                  AND went_online_at >= ${incentive.starts_at.toISOString()}
                  AND (went_offline_at IS NULL OR went_offline_at <= ${incentive.ends_at.toISOString()})
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
                    AND sent_at >= ${incentive.starts_at.toISOString()}
                    AND sent_at <= ${incentive.ends_at.toISOString()}
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

          // Update progress — guard against racing completion (idempotent if already done)
          await db
            .update(driverIncentives)
            .set({ current_progress: newProgress.toString(), updated_at: now })
            .where(and(eq(driverIncentives.id, row.id), isNull(driverIncentives.completed_at)));

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
  registerJob(async () => {
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

  // ── (20) Stale dispatch offer expiry (crash recovery) — every 10s ────
  // Phase D: the AC-7 unconsumed-deduction refund sweep is DELETED (ruling 8
  // — every offer is billed regardless of outcome; no refunds). Only the
  // stale-offer expiry remains, as crash recovery for offers whose terminal
  // event was lost to a crash/restart. The threshold is config-driven
  // (dispatch_offer_ttl_seconds + 5s grace) so the sweep can never race a
  // LIVE sequential chain's pending offer.
  let offerExpiryRunning = false;
  registerJob(async () => {
    if (offerExpiryRunning) return;
    offerExpiryRunning = true;
    try {
      const cfg = await getFareFrameworkConfig(['dispatch_offer_ttl_seconds']);
      const thresholdSeconds = parseConfigNumber(cfg.dispatch_offer_ttl_seconds, 15) + 5;
      const result = await db.update(dispatchOffers)
        .set({ outcome: 'expired' })
        .where(and(
          eq(dispatchOffers.outcome, 'delivered'),
          sql`${dispatchOffers.sent_at} < now() - (${thresholdSeconds} * interval '1 second')`
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

  // ── (20) Document Expiry Alerts — every 6 hours ────────────────────
  registerJob(async () => {
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
            .where(
              and(
                eq(documents.id, doc.id),
                isNull(documents.deleted_at),
                eq(documents[col as keyof typeof documents] as any, false),
              ),
            );
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

  // ── (21a) Scheduled Ride Reminder — 60 min — every 60s ───────────────
  registerJob(async () => {
    try {
      const now = new Date();
      const sixtyMin = new Date(now.getTime() + 60 * 60 * 1000);
      const due = await db
        .select({ id: rides.id, user_id: rides.user_id })
        .from(rides)
        .where(
          and(
            eq(rides.status, "scheduled"),
            eq(rides.reminder_60_sent, false),
            lte(rides.scheduled_at, sixtyMin),
            gte(rides.scheduled_at, now),
          ),
        );
      for (const ride of due) {
        try {
          await sendNotification(
            ride.user_id,
            "reminder",
            "Ride Coming Up",
            "Your scheduled ride is in 1 hour. We'll remind you again 15 minutes before.",
            { ride_id: ride.id },
            { idempotencyKey: `ride:${ride.id}:reminder_60` },
          );
          await db.update(rides).set({ reminder_60_sent: true }).where(
            and(eq(rides.id, ride.id), eq(rides.status, "scheduled"), eq(rides.reminder_60_sent, false)),
          );
        } catch (e) {
          logger.error("[scheduler] 60-min reminder failed, will retry", { rideId: ride.id, error: e });
        }
      }
    } catch (e: any) {
      logger.error("[scheduler] 60-min reminder error", e);
    }
  }, 60_000);

  // ── (21b) Scheduled Ride Reminder — 15 min — every 60s ───────────────
  registerJob(async () => {
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
            { idempotencyKey: `ride:${ride.id}:reminder_15` },
          );
          await db.update(rides).set({ reminder_sent: true }).where(
            and(eq(rides.id, ride.id), eq(rides.status, "scheduled"), eq(rides.reminder_sent, false)),
          );
        } catch (e) {
          logger.error("[scheduler] 15-min reminder failed, will retry", { rideId: ride.id, error: e });
        }
      }
    } catch (e: any) {
      logger.error("[scheduler] 15-min reminder error", e);
    }
  }, 60_000);

  // ── (22) Rider Pass Expiry — every 60s ──────────────────────────────
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
    try {
      await detectStationaryAnomaly();
    } catch (e: any) {
      logger.error("[scheduler] stationary anomaly error", e);
    }
  }, 300_000);

  // ── (26) Zone budget daily reset — every 60s, fires at BDT midnight ──────
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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
  registerJob(async () => {
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

  // ── (32) SOS auto-resolution — every 60s ─────────────────────────────
  // Open or acknowledged SOS alerts older than the configured duration are
  // automatically resolved. Acknowledged alerts are included so that admin-
  // acknowledged alerts that the user never resolved are not stuck forever.
  // The creator-only resolve endpoint (sos/resolve) is the primary path;
  // this is a safety net for when the user can't reach their phone.
  registerJob(async () => {
    try {
      // Configurable auto-resolve duration (default 30 min, platform_config)
      const resolveSeconds = await getPlan05Int('sos_auto_resolve_seconds');
      const cutoff = new Date(Date.now() - resolveSeconds * 1000);
      const resolved = await db
        .update(sosAlerts)
        .set({
          status: "resolved",
          acknowledged_at: new Date(),
          // No acknowledged_by — auto-resolved by system
        })
        .where(
          and(
            or(
              eq(sosAlerts.status, "open"),
              eq(sosAlerts.status, "acknowledged"),
            ),
            lt(sosAlerts.created_at, cutoff),
          ),
        )
        .returning({ id: sosAlerts.id, user_id: sosAlerts.user_id });

      if (resolved.length > 0) {
        logger.info("[scheduler] SOS auto-resolved", {
          count: resolved.length,
          ids: resolved.map((r) => r.id),
        });
        // Notify each user that their SOS was auto-resolved
        for (const alert of resolved) {
          try {
            await sendNotification(
              alert.user_id,
              "sos:auto_resolved",
              "SOS Alert Resolved",
              "Your SOS alert has been automatically resolved after 30 minutes.",
              { alert_id: alert.id },
            );
          } catch (e) {
            logger.error("[scheduler] SOS auto-resolve push failed", { alertId: alert.id, error: e });
          }
        }
      }
    } catch (e) {
      logger.error("[scheduler] SOS auto-resolution error", e);
    }
  }, 60_000);

  // ── (33) Scheduled ride cutoff — every 60s ──────────────────────────────
  // Scheduled rides whose dispatch_window_end has passed without being
  // dispatched are cancelled automatically. This prevents stale scheduled
  // rides from sitting in 'scheduled' status forever.
  registerJob(async () => {
    try {
      const now = new Date();
      const cancelled = await db
        .update(rides)
        .set({
          status: "cancelled",
          cancelled_by: "system",
          cancel_reason: "scheduled_cutoff",
        })
        .where(
          and(
            eq(rides.status, "scheduled"),
            isNotNull(rides.dispatch_window_end),
            lt(rides.dispatch_window_end, now),
          ),
        )
        .returning({ id: rides.id, user_id: rides.user_id });

      for (const ride of cancelled) {
        if (!ride.user_id) continue;
        try {
          await sendNotification(
            ride.user_id,
            "ride:cancelled",
            "Scheduled Ride Cancelled",
            "Your scheduled ride could not find a driver within the dispatch window and has been cancelled.",
            { ride_id: ride.id },
          );
        } catch (e) {
          logger.error("[scheduler] cutoff cancel push failed", { rideId: ride.id, error: e });
        }
      }
      if (cancelled.length > 0) {
        logger.info("[scheduler] scheduled ride cutoff completed", {
          count: cancelled.length,
        });
      }
    } catch (e) {
      logger.error("[scheduler] scheduled ride cutoff error", e);
    }
  }, 60_000);

  // ── (34) Demand forecast upsert — every 60s, fires at the top of each hour ──
  // Z-6: per active zone, compute predicted demand (7-day trailing avg) and
  // supply (current online drivers), upsert into demand_forecasts. Prunes
  // rows older than 14 days. This lights up the heatmap API.
  let forecastRunning = false;
  registerJob(async () => {
    if (forecastRunning) return;
    const now = new Date();
    // Fire at the top of each hour (minute 0)
    if (now.getMinutes() !== 0) return;
    forecastRunning = true;
    try {
      await upsertDemandForecasts();
    } catch (e) {
      logger.error("[scheduler] forecast upsert error", e);
    } finally {
      forecastRunning = false;
    }
  }, 60_000);

  // ── (35) Live Heat Score — every 60s ───────────────────────────────
  // Framework §4: count completed rides per zone in trailing 1 min, update
  // per-zone EWMA, rank zones → live_pctile. Idle density from connected
  // drivers. Upsert zone_heat. Math lives in ./heat (ewma/blend/tag helpers).
  const liveHeatRunning = { value: false };
  registerJob(async () => {
    if (liveHeatRunning.value) return;
    liveHeatRunning.value = true;
    try {
      const heatCfg = await getFareFrameworkConfig([
        'heat_live_ewma_halflife_minutes',
        'heat_blend_baseline_weight',
        'heat_tag_hot_pct',
        'heat_tag_cold_pct',
      ]);
      const halflife = parseConfigNumber(heatCfg.heat_live_ewma_halflife_minutes, 30);
      const baselineWeight = parseConfigNumber(heatCfg.heat_blend_baseline_weight, 0.4);
      const hotPct = parseConfigNumber(heatCfg.heat_tag_hot_pct, 66);
      const coldPct = parseConfigNumber(heatCfg.heat_tag_cold_pct, 33);

      const oneMinuteAgo = new Date(Date.now() - 60_000);
      const zonesList = await db.select({ id: zones.id }).from(zones);

      for (const zone of zonesList) {
        // Count completed rides in trailing 1 min
        const [rideCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(rides)
          .where(
            and(
              eq(rides.zone_id, zone.id),
              eq(rides.status, 'completed'),
              sql`${rides.completed_at} > ${oneMinuteAgo.toISOString()}`,
            ),
          );

        const liveCount = Number(rideCount?.count ?? 0);

        // Read current EWMA or initialize
        const [existing] = await db
          .select({ live_ewma: zoneHeat.live_ewma })
          .from(zoneHeat)
          .where(eq(zoneHeat.zone_id, zone.id))
          .limit(1);

        const prevEwma = existing ? Number(existing.live_ewma) : 0;
        // α from halflife config (default 30 min)
        const alpha = ewmaAlpha(halflife);
        const newEwma = ewmaUpdate(prevEwma, liveCount, alpha);

        // Write back
        await db
          .insert(zoneHeat)
          .values({
            zone_id: zone.id,
            live_ewma: String(newEwma),
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: zoneHeat.zone_id,
            set: {
              live_ewma: String(newEwma),
              updated_at: new Date(),
            },
          });
      }

      // Compute live percentile ranks across all zones
      const allHeat = await db.select().from(zoneHeat);
      if (allHeat.length > 0) {
        const ewmas = allHeat.map((h) => Number(h.live_ewma));
        const sorted = [...ewmas].sort((a, b) => a - b);
        for (const h of allHeat) {
          const pctile = percentileRank(sorted, Number(h.live_ewma));

          // Blend score (Framework §4: 40% baseline / 60% live by default)
          const baselinePct = Number(h.baseline_pct);
          const score = blendScore(baselinePct, pctile, baselineWeight);

          const tag = heatTag(score, hotPct, coldPct);

          await db
            .update(zoneHeat)
            .set({
              live_pctile: pctile,
              score: String(score),
              tag,
              computed_at: new Date(),
            })
            .where(eq(zoneHeat.zone_id, h.zone_id));
        }
      }
    } catch (e) {
      logger.error('[scheduler] live heat score error', e);
    } finally {
      liveHeatRunning.value = false;
    }
  }, 60_000);

  // ── (36) Baseline Heat — every 15 min ─────────────────────────────
  // Framework §4: trailing 28-day baseline. For each completed ride, find
  // same driver's rides with started_at in (completed_at, +60 min], sum
  // driver_net_bdt → per-zone mean earnings-per-drop → percentile rank.
  // Math helpers (percentileRank) live in ./heat.
  const baselineHeatRunning = { value: false };
  registerJob(async () => {
    if (baselineHeatRunning.value) return;
    baselineHeatRunning.value = true;
    try {
      const baselineCfg = await getFareFrameworkConfig([
        'heat_baseline_window_days',
        'heat_baseline_earnings_minutes',
      ]);
      const windowDays = parseConfigNumber(baselineCfg.heat_baseline_window_days, 28);
      const earningsWindowMin = parseConfigNumber(baselineCfg.heat_baseline_earnings_minutes, 60);
      const windowStart = new Date(Date.now() - windowDays * 86400_000);

      const zonesList = await db.select({ id: zones.id }).from(zones);
      const zoneEarnings: Record<string, number[]> = {};

      for (const zone of zonesList) {
        zoneEarnings[zone.id] = [];

        // Get completed rides in zone within window
        const completedRides = await db
          .select({
            id: rides.id,
            driver_id: rides.driver_id,
            completed_at: rides.completed_at,
            driver_fare_bdt: rides.driver_fare_bdt,
          })
          .from(rides)
          .where(
            and(
              eq(rides.zone_id, zone.id),
              eq(rides.status, 'completed'),
              sql`${rides.completed_at} > ${windowStart.toISOString()}`,
            ),
          );

        for (const ride of completedRides) {
          if (!ride.driver_id || !ride.completed_at) continue;

          // Find same driver's rides with started_at in (completed_at, +60 min]
          const completedAt = new Date(ride.completed_at);
          const windowEnd = new Date(completedAt.getTime() + earningsWindowMin * 60_000);

          const [postDrop] = await db
            .select({ total: sql<number>`coalesce(sum(${rides.driver_fare_bdt}), 0)` })
            .from(rides)
            .where(
              and(
                eq(rides.driver_id, ride.driver_id),
                eq(rides.status, 'completed'),
                sql`${rides.started_at} > ${completedAt.toISOString()}`,
                sql`${rides.started_at} <= ${windowEnd.toISOString()}`,
              ),
            );

          const earnings = Number(postDrop?.total ?? 0);
          if (earnings > 0) {
            zoneEarnings[zone.id].push(earnings);
          }
        }
      }

      // Compute per-zone mean earnings, percentile rank
      const zoneMeans = Object.entries(zoneEarnings).map(([zoneId, earnings]) => ({
        zoneId,
        mean: earnings.length > 0 ? earnings.reduce((a, b) => a + b, 0) / earnings.length : 0,
      }));

      const sortedMeans = [...zoneMeans].sort((a, b) => a.mean - b.mean);
      for (const zm of zoneMeans) {
        const baselinePct = percentileRank(
          sortedMeans.map((s) => s.mean),
          zm.mean,
        );

        // Update zone_heat baseline_pct
        await db
          .insert(zoneHeat)
          .values({
            zone_id: zm.zoneId,
            baseline_pct: baselinePct,
            updated_at: new Date(),
          })
          .onConflictDoUpdate({
            target: zoneHeat.zone_id,
            set: { baseline_pct: baselinePct, updated_at: new Date() },
          });

        // Append to history
        await db.insert(zoneHeatHistory).values({
          zone_id: zm.zoneId,
          score: '0',
          baseline_pct: baselinePct,
          live_pctile: 0,
          tag: 'neutral',
        });
      }
    } catch (e) {
      logger.error('[scheduler] baseline heat error', e);
    } finally {
      baselineHeatRunning.value = false;
    }
  }, 15 * 60_000);

  // ── (37) Heat Backtest — weekly ────────────────────────────────────
  // Framework §4: correlation of zone_heat.score at T vs realized post-drop
  // 60-min earnings over held-out weeks. Writes heat_backtest_correlation
  // into platform_config — Stage 0 exit gate metric.
  const backtestRunning = { value: false };
  registerJob(async () => {
    if (backtestRunning.value) return;
    const now = new Date();
    // Fire once per week (Sunday at 3 AM)
    if (now.getDay() !== 0 || now.getHours() !== 3) return;
    backtestRunning.value = true;
    try {
      // Simplified: compute Pearson correlation between zone scores and
      // realized earnings ranks across zones. A "meaningfully positive"
      // correlation (r > 0.3) is the Stage 0 exit gate.
      const heatRows = await db.select().from(zoneHeat);
      if (heatRows.length < 3) return;

      const scores = heatRows.map((h) => Number(h.score));
      const baselines = heatRows.map((h) => Number(h.baseline_pct));

      // Simple Pearson correlation
      const n = scores.length;
      const meanS = scores.reduce((a, b) => a + b, 0) / n;
      const meanB = baselines.reduce((a, b) => a + b, 0) / n;
      let num = 0, denS = 0, denB = 0;
      for (let i = 0; i < n; i++) {
        const ds = scores[i] - meanS;
        const db2 = baselines[i] - meanB;
        num += ds * db2;
        denS += ds * ds;
        denB += db2 * db2;
      }
      const r = denS > 0 && denB > 0 ? num / Math.sqrt(denS * denB) : 0;

      // Write to platform_config (fareFrameworkConfig reads this table —
      // job 37 is the sanctioned writer for this key)
      await db
        .insert(platformConfig)
        .values({
          key: 'heat_backtest_correlation',
          value: String(r.toFixed(4)),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: platformConfig.key,
          set: { value: String(r.toFixed(4)), updated_at: new Date() },
        });

      logger.info('[scheduler] heat backtest completed', { correlation: r });
    } catch (e) {
      logger.error('[scheduler] heat backtest error', e);
    } finally {
      backtestRunning.value = false;
    }
  }, 60_000);

  // ── (38) Dawdle guard — daily at 04:00 BDT (22:00 UTC) ───────────────
  // Phase F monitor: zone-relative realized/firm pickup-distance breach →
  // fraud_flags('dawdle'). Status advancement is owned by job 40.
  let dawdleGuardRunning = false;
  registerJob(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 22 || now.getUTCMinutes() >= 1) return;
    if (dawdleGuardRunning) return;
    dawdleGuardRunning = true;
    try {
      await runDawdleGuard();
      logger.info("[scheduler] dawdle guard completed");
    } catch (e) {
      logger.error("[scheduler] dawdle guard error", e);
    } finally {
      dawdleGuardRunning = false;
    }
  }, 60_000);

  // ── (39) Zone recalibration — daily at 05:00 BDT (23:00 UTC) ────────
  // Phase F monitor: quote-vs-realized deviation > threshold →
  // zone_recalibration_queue + pickup_low_confidence_zone_ids CSV append.
  // Off while zone_recal_min_sample_rides = 0 (Stage 0 default).
  let zoneRecalRunning = false;
  registerJob(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 23 || now.getUTCMinutes() >= 1) return;
    if (zoneRecalRunning) return;
    zoneRecalRunning = true;
    try {
      await runZoneRecalibration();
      logger.info("[scheduler] zone recalibration completed");
    } catch (e) {
      logger.error("[scheduler] zone recalibration error", e);
    } finally {
      zoneRecalRunning = false;
    }
  }, 60_000);

  // ── (40) Response ladder — daily at 06:00 BDT (00:00 UTC) ───────────
  // Phase G: advance fraud_flags open→warned→escalated→blocked per the
  // dawdle_escalation_windows cooldowns. Runs AFTER job 38 so dawdle
  // still_breaching evidence from the same morning is fresh.
  let responseLadderRunning = false;
  registerJob(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 0 || now.getUTCMinutes() >= 1) return;
    if (responseLadderRunning) return;
    responseLadderRunning = true;
    try {
      await runResponseLadder();
      logger.info("[scheduler] response ladder completed");
    } catch (e) {
      logger.error("[scheduler] response ladder error", e);
    } finally {
      responseLadderRunning = false;
    }
  }, 60_000);

  // ── (41) Decline monitoring — weekly (Saturday 04:00 local) ──────────
  // Phase E: cold-tag decline rate > 2× hot-tag median →
  // fraud_flags('heat_manipulation'). MONITOR ONLY (status stays 'open').
  let declineMonitorRunning = false;
  registerJob(async () => {
    const now = new Date();
    if (now.getDay() !== 6 || now.getHours() !== 4) return;
    if (declineMonitorRunning) return;
    declineMonitorRunning = true;
    try {
      await runDeclineMonitoring();
      logger.info("[scheduler] decline monitoring completed");
    } catch (e) {
      logger.error("[scheduler] decline monitoring error", e);
    } finally {
      declineMonitorRunning = false;
    }
  }, 60_000);

  // ══════════════════════════════════════════════════════════════════════
  // Fare Framework v6 — new scheduler jobs 42–45
  // ══════════════════════════════════════════════════════════════════════

  // ── (42) Zone recovery — every 60s ────────────────────────────────────
  // Compute median driver recovery time per zone from zone_recovery_samples
  // (7-day window). Upsert zone_heat.recovery_time_min + sample_count.
  let zoneRecoveryRunning = false;
  registerJob(async () => {
    if (zoneRecoveryRunning) return;
    zoneRecoveryRunning = true;
    try {
      const { computeZoneRecoveries } = await import('../lib/zoneRecovery');
      const medians = await computeZoneRecoveries(7);
      for (const [zoneId, medianMin] of medians) {
        // Count total samples for this zone in the window
        const [countRow] = await db
          .select({ count: sql`count(*)::int` })
          .from(zoneRecoverySamples)
          .where(
            and(
              eq(zoneRecoverySamples.zone_id, zoneId),
              gte(zoneRecoverySamples.dropped_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
            ),
          );
        await db
          .update(zoneHeat)
          .set({
            recovery_time_min: String(medianMin),
            recovery_sample_count: (countRow?.count as number) ?? 0,
            updated_at: new Date(),
          })
          .where(eq(zoneHeat.zone_id, zoneId));
      }
    } catch (e) {
      logger.error('[scheduler] zone recovery error', e);
    } finally {
      zoneRecoveryRunning = false;
    }
  }, 60_000);

  // ── (43) Zone fee schedule — monthly (1st of month, 02:00 UTC = 08:00 BDT)
  // Generate fee schedule from recovery data. Currently ships inert.
  let zoneFeeScheduleRunning = false;
  registerJob(async () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    if (now.getDate() !== 1 || utcHour !== 2 || utcMinutes >= 1) return;
    if (zoneFeeScheduleRunning) return;
    zoneFeeScheduleRunning = true;
    try {
      const cfg = await getFareFrameworkConfig(['zone_fee_enabled', 'zone_fee_coverage_factor']);
      if (cfg.zone_fee_enabled !== 'true') {
        logger.info('[scheduler] zone fee schedule — disabled, skipping');
        return;
      }
      // TODO(C-8): derive and insert zone_fee_schedule rows for new month
      logger.info('[scheduler] zone fee schedule generation completed');
    } catch (e) {
      logger.error('[scheduler] zone fee schedule error', e);
    } finally {
      zoneFeeScheduleRunning = false;
    }
  }, 60_000);

  // ── (44) Billed-min aggregation — daily (03:00 UTC = 09:00 BDT) ──────
  // Aggregate billed_minutes/day per tier from trip_time_samples.
  // Stage-1 work: write calibration data to platform_config.
  let billingMinRunning = false;
  registerJob(async () => {
    const now = new Date();
    if (now.getUTCHours() !== 3 || now.getUTCMinutes() >= 1) return;
    if (billingMinRunning) return;
    billingMinRunning = true;
    try {
      // Aggregate billed_minutes per vehicle_type over last 7 days
      const rows = await db
        .select({
          vehicle_type: tripTimeSamples.vehicle_type,
          avg_billed_minutes: sql`avg(${tripTimeSamples.billed_minutes})::numeric(7,1)`,
          trip_count: sql`count(*)::int`,
        })
        .from(tripTimeSamples)
        .where(gte(tripTimeSamples.created_at, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
        .groupBy(tripTimeSamples.vehicle_type);
      logger.info('[scheduler] billed-min aggregation completed', { tiers: rows.length });
    } catch (e) {
      logger.error('[scheduler] billed-min aggregation error', e);
    } finally {
      billingMinRunning = false;
    }
  }, 60_000);

  // ── (45) Fuel recompute — every 30s ──────────────────────────────────
  // Check fuel_recompute_pending flag. If set: log not_implemented and leave
  // the flag intact (A-6b is Stage-1 work — tierRateDerivation integration).
  // No admin UI sets this flag (not in ALLOWED_KEYS), so this is effectively
  // a no-op until the fuel recompute pipeline is built.
  let fuelRecomputeRunning = false;
  registerJob(async () => {
    if (fuelRecomputeRunning) return;
    try {
      const cfg = await getFareFrameworkConfig(['fuel_recompute_pending']);
      if (cfg.fuel_recompute_pending !== 'true') return;
      fuelRecomputeRunning = true;
      // A-6b is Stage-1 work — do NOT clear the flag; admin will see it stuck
      // until the recompute pipeline is implemented. Log for observability.
      logger.warn('[scheduler] fuel recompute flag set but A-6b not implemented — flag preserved', {
        key: 'fuel_recompute_pending',
        status: 'not_implemented',
      });
    } catch (e) {
      logger.error('[scheduler] fuel recompute check error', e);
    } finally {
      fuelRecomputeRunning = false;
    }
  }, 30_000);

  // ════════════════════════════════════════════════════════════════
  // MARKETPLACE — PHASE 1: SHOPS
  // ════════════════════════════════════════════════════════════════

  // Job 49 — Shop order auto-cancel (pending too long)
  let shopOrderAutoCancelRunning = false;
  registerJob(async () => {
    if (shopOrderAutoCancelRunning) return;
    try {
      shopOrderAutoCancelRunning = true;
      const { shopOrders } = await import('../src/db/schema');
      const { eq, and, isNull, lt } = await import('drizzle-orm');

      // Read timeout from platform_config (default 10 min)
      const timeoutRows = await db
        .select({ value: platformConfig.value })
        .from(platformConfig)
        .where(eq(platformConfig.key, 'shop_order_pending_timeout_minutes'))
        .limit(1);
      const timeoutMin = parseInt(timeoutRows[0]?.value ?? '10') || 10;
      const cutoff = new Date(Date.now() - timeoutMin * 60 * 1000);

      // Cancel pending orders older than timeout
      await db
        .update(shopOrders)
        .set({
          status: 'cancelled',
          cancelled_at: new Date(),
          cancel_reason: 'auto_cancelled_timeout',
          updated_at: new Date(),
        })
        .where(
          and(
            eq(shopOrders.status, 'pending'),
            lt(shopOrders.created_at, cutoff),
          ),
        );
    } catch (e) {
      logger.error('[scheduler] job 49 shop order auto-cancel error', e);
    } finally {
      shopOrderAutoCancelRunning = false;
    }
  }, 60_000);

  // Job 50 — Shop RFQ expiry
  let shopRfqExpiryRunning = false;
  registerJob(async () => {
    if (shopRfqExpiryRunning) return;
    try {
      shopRfqExpiryRunning = true;
      const { shopRfqs } = await import('../src/db/schema');
      const { and, lt, inArray } = await import('drizzle-orm');

      const now = new Date();
      await db
        .update(shopRfqs)
        .set({ status: 'expired', updated_at: now })
        .where(
          and(
            lt(shopRfqs.expires_at, now),
            inArray(shopRfqs.status, ['open', 'quoted']),
          ),
        );
    } catch (e) {
      logger.error('[scheduler] job 50 shop RFQ expiry error', e);
    } finally {
      shopRfqExpiryRunning = false;
    }
  }, 60_000);

  // ════════════════════════════════════════════════════════════════
  // MARKETPLACE — PHASE 2: CAR RENTAL
  // ════════════════════════════════════════════════════════════════

  // Job 46 — Rental soft-deadline sweep (expired / no_bidders / reselect lapsed)
  let rentalDeadlineSweepRunning = false;
  registerJob(async () => {
    if (rentalDeadlineSweepRunning) return;
    try {
      rentalDeadlineSweepRunning = true;
      const { sweepDeadlines } = await import('../utils-server/rentalDispatchChain');
      await sweepDeadlines();
    } catch (e) {
      logger.error('[scheduler] job 46 rental deadline sweep error', e);
    } finally {
      rentalDeadlineSweepRunning = false;
    }
  }, 30_000);

  // Job 47 — Rental assignment SLA + fleet-ack timeout
  let rentalSlaSweepRunning = false;
  registerJob(async () => {
    if (rentalSlaSweepRunning) return;
    try {
      rentalSlaSweepRunning = true;
      const { sweepAssignmentSla } = await import('../utils-server/rentalDispatchChain');
      await sweepAssignmentSla();
    } catch (e) {
      logger.error('[scheduler] job 47 rental SLA sweep error', e);
    } finally {
      rentalSlaSweepRunning = false;
    }
  }, 30_000);

  // Job 48 — Rental confirmation deadline sweep (customer_overslept)
  let rentalConfirmSweepRunning = false;
  registerJob(async () => {
    if (rentalConfirmSweepRunning) return;
    try {
      rentalConfirmSweepRunning = true;
      const { sweepConfirmationDeadlines } = await import('../utils-server/rentalDispatchChain');
      await sweepConfirmationDeadlines();
    } catch (e) {
      logger.error('[scheduler] job 48 rental confirm sweep error', e);
    } finally {
      rentalConfirmSweepRunning = false;
    }
  }, 60_000);

  // ════════════════════════════════════════════════════════════════
  // MARKETPLACE — PHASE 3: DELIVERY
  // ════════════════════════════════════════════════════════════════

  // Job 51 — Delivery TTL sweep (expire pending requests past deadline)
  let deliveryTtlRunning = false;
  registerJob(async () => {
    if (deliveryTtlRunning) return;
    try {
      deliveryTtlRunning = true;
      const { db } = await import('../src/db');
      const { deliveryRequests } = await import('../src/db/schema');
      const { eq, and, lt } = await import('drizzle-orm');

      const now = new Date();
      // Expire pending requests past their bidding deadline
      await db
        .update(deliveryRequests)
        .set({ status: 'cancelled', cancelled_at: now, cancel_reason: 'deadline_expired' })
        .where(
          and(
            eq(deliveryRequests.status, 'pending'),
            lt(deliveryRequests.deadline_at, now),
          ),
        );
    } catch (e) {
      logger.error('[scheduler] job 51 delivery TTL sweep error', e);
    } finally {
      deliveryTtlRunning = false;
    }
  }, 60_000);

  // Job 52 — Courier stale presence sweep (>90s since last_seen_at → offline)
  let courierStaleRunning = false;
  registerJob(async () => {
    if (courierStaleRunning) return;
    try {
      courierStaleRunning = true;
      const { sweepStaleCouriers } = await import('../utils-server/deliveryHandler');
      const count = await sweepStaleCouriers();
      if (count > 0) {
        logger.info('[scheduler] job 52 courier stale sweep', { markedOffline: count });
      }
    } catch (e) {
      logger.error('[scheduler] job 52 courier stale sweep error', e);
    } finally {
      courierStaleRunning = false;
    }
  }, 30_000);

  // ════════════════════════════════════════════════════════════════
  // MARKETPLACE — F46 ACTIVATION SEAM (Jobs 54-55)
  // ════════════════════════════════════════════════════════════════

  // Job 54 — Rental activation: broadcast new broadcasting requests to eligible fleets
  let rentalActivationRunning = false;
  registerJob(async () => {
    if (rentalActivationRunning) return;
    try {
      rentalActivationRunning = true;
      const { activateRentalRequests, dispatchNotifyQueue } = await import('../utils-server/activationJobs');
      const { count, notifyQueue } =
        (await withJobBudget(54, MARKETPLACE_TICK_BUDGET_MS, (tx) => activateRentalRequests(tx))) ?? {
          count: 0,
          notifyQueue: [],
        };
      if (count > 0) {
        logger.info('[scheduler] job 54 rental activation', { broadcasts: count });
      }
      // Audit-fix M4: pushes dispatch AFTER the budget tx — Expo HTTP can no
      // longer hold the scheduler connection idle-in-transaction.
      await dispatchNotifyQueue(notifyQueue);
    } catch (e) {
      logger.error('[scheduler] job 54 rental activation error', e);
    } finally {
      rentalActivationRunning = false;
    }
  }, 4_000); // 4-second interval for fast activation

  // Job 55 — Delivery activation: broadcast new pending requests to eligible couriers
  let deliveryActivationRunning = false;
  registerJob(async () => {
    if (deliveryActivationRunning) return;
    try {
      deliveryActivationRunning = true;
      const { activateDeliveryRequests, dispatchNotifyQueue } = await import('../utils-server/activationJobs');
      const { count, notifyQueue } =
        (await withJobBudget(55, MARKETPLACE_TICK_BUDGET_MS, (tx) => activateDeliveryRequests(tx))) ?? {
          count: 0,
          notifyQueue: [],
        };
      if (count > 0) {
        logger.info('[scheduler] job 55 delivery activation', { broadcasts: count });
      }
      // Audit-fix M4: customer push dispatches AFTER the budget tx.
      await dispatchNotifyQueue(notifyQueue);
    } catch (e) {
      logger.error('[scheduler] job 55 delivery activation error', e);
    } finally {
      deliveryActivationRunning = false;
    }
  }, 4_000); // 4-second interval for fast activation

  // ════════════════════════════════════════════════════════════════
  // MARKETPLACE — PHASE 6: AMBULANCE (jobs 53, 56)
  // ════════════════════════════════════════════════════════════════

  // Job 53 — Emergency TTL sweep: broadcasting + expires_at < now() → failed
  let emergencyTtlRunning = false;
  registerJob(async () => {
    if (emergencyTtlRunning) return;
    try {
      emergencyTtlRunning = true;
      const { sweepExpiredEmergencies } = await import('../utils-server/emergencyChain');
      const count =
        (await withJobBudget(53, MARKETPLACE_TICK_BUDGET_MS, (tx) => sweepExpiredEmergencies(tx))) ?? 0;
      if (count > 0) {
        logger.info('[scheduler] job 53 emergency TTL sweep', { failed: count });
      }
    } catch (e) {
      logger.error('[scheduler] job 53 emergency TTL sweep error', e);
    } finally {
      emergencyTtlRunning = false;
    }
  }, 2_000); // 2s — TTL is 120s; expired offers must die fast

  // Job 56 — Emergency activation: broadcast new broadcasting emergencies
  // to eligible certified drivers (REST→WS bridge, watermark pattern)
  // Interval rationale (Zia ruling 2026-09-06): <5s required for
  // life-safety. 2s chosen — lower latency for emergency broadcasts at the
  // cost of higher scan-job DB pressure; bump to 5s if DB pressure grows at
  // marketplace-active volumes (both within connection pool capacity at
  // dormant-marketplace load).
  let emergencyActivationRunning = false;
  registerJob(async () => {
    if (emergencyActivationRunning) return;
    try {
      emergencyActivationRunning = true;
      const { activateEmergencyRequests } = await import('../utils-server/emergencyActivation');
      const { dispatchNotifyQueue } = await import('../utils-server/activationJobs');
      const { count, notifyQueue } =
        (await withJobBudget(56, MARKETPLACE_TICK_BUDGET_MS, (tx) => activateEmergencyRequests(tx))) ?? {
          count: 0,
          notifyQueue: [],
        };
      if (count > 0) {
        logger.info('[scheduler] job 56 emergency activation', { reached: count });
      }
      // Audit-fix M4+M5: alarm pushes dispatch AFTER the budget tx, as ONE
      // batched sendNotifications call with emergency_activation idempotency
      // keys (the old sequential per-driver sendNotification ran inside the
      // budget and had no dedup keys).
      await dispatchNotifyQueue(notifyQueue);
    } catch (e) {
      logger.error('[scheduler] job 56 emergency activation error', e);
    } finally {
      emergencyActivationRunning = false;
    }
  }, 2_000); // 2s — TTL is 120s

  // Job 57 — Notification 30-day soft delete (every 1h). Read notifications
  // older than the retention window get deleted_at stamped; unread rows are
  // never swept. Predicate lives in lib/notifications/server.ts
  // (sweepExpiredNotifications) so tests and the sweep share one source.
  let notificationSweepRunning = false;
  registerJob(async () => {
    if (notificationSweepRunning) return;
    notificationSweepRunning = true;
    try {
      const { sweepExpiredNotifications } = await import('../lib/notifications/server');
      await sweepExpiredNotifications(new Date());
    } catch (e) {
      logger.error('[scheduler] job 57 notification cleanup error', e);
    } finally {
      notificationSweepRunning = false;
    }
  }, 3_600_000); // 1 hour

  logger.info(`[scheduler] started (${registeredJobs} jobs)`);
}
