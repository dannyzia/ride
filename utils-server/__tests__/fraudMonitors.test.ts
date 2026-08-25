/**
 * Fare Framework monitors (Phase E/F/G) — unit + runner tests.
 *
 * Covers:
 *  - dawdle ratio math + zone-relative breach (evaluateDawdle / dawdleRatio)
 *  - escalation ladder (ladderAdvancement): one step per run, window-gated,
 *    offense_count increments, terminal statuses untouched
 *  - runDawdleGuard: fresh-breach insert, existing-flag evidence refresh,
 *    recovery flips still_breaching off, sub-rolling-N drivers skipped
 *  - zone recalibration: deviation math, CSV idempotency, min-sample off
 *    switch, queue insert + platform_config CSV write in one transaction
 *  - runResponseLadder: dawdle requires still_breaching, warned sends the
 *    push warning (idempotent), escalated records cooldown_days
 *  - decline monitoring: 2× hot-median rule, ≥20 cold offers, monitor-only
 *
 * The DB is mocked; scheduler.ts imports ../src/db (root src/db module),
 * so jest.mock('../../src/db') replaces it.
 */
/* eslint-disable import/first */
jest.mock("../../src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn(), execute: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../lib/safety", () => ({ detectStationaryAnomaly: jest.fn() }));
jest.mock("../../lib/time", () => ({ nextBdtMidnightUtc: jest.fn(() => new Date()) }));
jest.mock("../../lib/zoneBudget", () => ({ resetAllBudgets: jest.fn() }));
jest.mock("../../lib/zoneLifecycle", () => ({ evaluateGraduation: jest.fn() }));
jest.mock("../../lib/walletCashback", () => ({ expireCredits: jest.fn(), expireRiderFeeDeductions: jest.fn() }));
jest.mock("../../lib/fraudDetection", () => ({ runFraudDetection: jest.fn() }));
jest.mock("../../lib/cancellationCompensation", () => ({ expireCancellationCredits: jest.fn() }));
jest.mock("../../lib/notify", () => ({
  sendNotification: jest.fn(async () => ({ sent: 1, failed: 0 })),
}));
jest.mock("@/lib/platformConfig", () => ({ getPlan05Int: jest.fn(async () => 0) }));
jest.mock("@/lib/forecast", () => ({ upsertDemandForecasts: jest.fn() }));

const mockFwConfig: Record<string, string> = {};
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: async (keys: readonly string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = mockFwConfig[k] ?? "";
    return out;
  },
  parseConfigNumber: (value: string, fallback: number) => {
    // Mirror the real module's contract: unset keys fall back (the real
    // getFareFrameworkConfig returns the DEFAULTS strings, never '').
    if (value == null || String(value).trim() === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
  parseConfigBool: (value: string) => value === "true",
  parseConfigCsv: (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean),
}));

import { db } from "../../src/db";
import { sendNotification } from "../../lib/notify";
import {
  fraudFlags,
  zoneRecalibrationQueue,
  platformConfig,
} from "../../src/db/schema";
import {
  parseEscalationWindows,
  dawdleRatio,
  evaluateDawdle,
  ladderAdvancement,
  zoneDeviation,
  mergeZoneCsv,
  isDeclineAnomaly,
  runDawdleGuard,
  runZoneRecalibration,
  runResponseLadder,
  runDeclineMonitoring,
} from "../scheduler";

type Row = Record<string, unknown>;

const DAY_MS = 86_400_000;
const DEFAULT_THRESHOLDS = { medianThreshold: 1.15, p90Threshold: 1.35, zoneMargin: 0.1 };

/* ── db mock helpers ────────────────────────────────────────────── */

const inserts: { table: unknown; values: Row }[] = [];
const updates: { table: unknown; set: Row }[] = [];

function resetDbMock(): void {
  inserts.length = 0;
  updates.length = 0;
  (db.select as jest.Mock).mockReset();
  (db.insert as jest.Mock).mockReset().mockImplementation((table: unknown) => ({
    values: (v: Row) => {
      inserts.push({ table, values: v });
      return Promise.resolve([]);
    },
  }));
  (db.update as jest.Mock).mockReset().mockImplementation((table: unknown) => ({
    set: (s: Row) => {
      updates.push({ table, set: s });
      return { where: jest.fn(async () => []) };
    },
  }));
  (db.transaction as jest.Mock).mockReset();
}

/** Queue-based select mock: each queued array is returned by one select(). */
function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });
}

interface TxRecorder {
  inserts: { table: unknown; values: Row }[];
  updates: { table: unknown; set: Row }[];
}

/** db.transaction mock for the zone-recalibration runner. */
function mockTransaction(platformCsvRow: Row[]): TxRecorder {
  const rec: TxRecorder = { inserts: [], updates: [] };
  const tx = {
    execute: jest.fn(async () => platformCsvRow),
    insert: jest.fn((table: unknown) => ({
      values: (v: Row) => {
        rec.inserts.push({ table, values: v });
        const thenable = {
          onConflictDoUpdate: () => Promise.resolve([]),
          then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
            Promise.resolve([]).then(resolve, reject),
        };
        return thenable;
      },
    })),
    update: jest.fn((table: unknown) => ({
      set: (s: Row) => {
        rec.updates.push({ table, set: s });
        return { where: jest.fn(async () => []) };
      },
    })),
    select: jest.fn(),
  };
  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (t: unknown) => Promise<void>) => cb(tx),
  );
  return rec;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetDbMock();
  for (const key of Object.keys(mockFwConfig)) delete mockFwConfig[key];
});

/* ── Pure helpers ───────────────────────────────────────────────── */

describe("parseEscalationWindows", () => {
  test("parses '1,2,4' into day counts", () => {
    expect(parseEscalationWindows("1,2,4")).toEqual([1, 2, 4]);
  });

  test("drops non-numeric and non-positive entries", () => {
    expect(parseEscalationWindows(" 2 , x, -1, 0, 4 ")).toEqual([2, 4]);
  });
});

describe("dawdleRatio", () => {
  test("realized/firm", () => {
    expect(dawdleRatio(2.4, 2.0)).toBe(1.2);
  });

  test("null on missing km or non-positive firm", () => {
    expect(dawdleRatio(null, 2.0)).toBeNull();
    expect(dawdleRatio(2.0, null)).toBeNull();
    expect(dawdleRatio(2.0, 0)).toBeNull();
  });
});

describe("evaluateDawdle — zone-relative breach", () => {
  test("driver far above zone baseline breaches on median", () => {
    // driver median 1.5 vs zone 1.0 → adjusted 1.5 > 1.15 + 0.10
    const evaluation = evaluateDawdle(
      new Array(30).fill(1.5),
      "zone-1",
      new Array(60).fill(1.0),
      DEFAULT_THRESHOLDS,
    );
    expect(evaluation.breached).toBe(true);
    expect(evaluation.median).toBeCloseTo(1.5, 6);
    expect(evaluation.zone_median).toBeCloseTo(1.0, 6);
  });

  test("elevated zone baseline absorbs the driver stat", () => {
    // driver 1.3 vs zone 1.25 → adjusted 1.05 → no breach
    const evaluation = evaluateDawdle(
      new Array(30).fill(1.3),
      "zone-1",
      new Array(60).fill(1.25),
      DEFAULT_THRESHOLDS,
    );
    expect(evaluation.breached).toBe(false);
  });

  test("p90 path: driver p90 spikes past the zone", () => {
    // driver p90 1.5 vs zone p90 1.0 → adjusted 1.5 > 1.35 + 0.10
    const driverRatios = [...new Array(25).fill(1.0), 1.4, 1.5, 1.6, 1.7, 1.8];
    const evaluation = evaluateDawdle(
      driverRatios,
      "zone-1",
      new Array(60).fill(1.0),
      DEFAULT_THRESHOLDS,
    );
    expect(evaluation.breached).toBe(true);
  });

  test("no zone baseline → absolute thresholds apply", () => {
    const breached = evaluateDawdle(new Array(30).fill(1.2), null, null, DEFAULT_THRESHOLDS);
    const clean = evaluateDawdle(new Array(30).fill(1.05), "zone-9", [], DEFAULT_THRESHOLDS);
    expect(breached.breached).toBe(true); // 1.2 > 1.15
    expect(clean.breached).toBe(false);
    expect(clean.zone_median).toBeNull();
  });

  test("boundary: adjusted median exactly at threshold+margin does not breach (strictly greater)", () => {
    // 1.0 + (1.25 − 1.0) = 1.25 == 1.15 + 0.10 → no breach
    const evaluation = evaluateDawdle(
      new Array(30).fill(1.25),
      "zone-1",
      new Array(60).fill(1.0),
      DEFAULT_THRESHOLDS,
    );
    expect(evaluation.breached).toBe(false);
  });
});

describe("ladderAdvancement", () => {
  const windows = [1, 2, 4];
  const now = new Date("2026-08-25T00:00:00Z");

  test("open past window[0] → warned, offense_count increments", () => {
    const step = ladderAdvancement("open", 1, new Date(now.getTime() - 1.5 * DAY_MS), now, windows);
    expect(step).toEqual({ nextStatus: "warned", offenseCount: 2, windowDays: 1 });
  });

  test("open before window[0] elapses → null (idempotent, no re-escalation)", () => {
    const step = ladderAdvancement("open", 1, new Date(now.getTime() - 0.5 * DAY_MS), now, windows);
    expect(step).toBeNull();
  });

  test("warned past window[1] → escalated (records 2× window as cooldown later)", () => {
    const step = ladderAdvancement("warned", 2, new Date(now.getTime() - 2 * DAY_MS), now, windows);
    expect(step).toEqual({ nextStatus: "escalated", offenseCount: 3, windowDays: 2 });
  });

  test("escalated past window[2] → blocked", () => {
    const step = ladderAdvancement("escalated", 3, new Date(now.getTime() - 4 * DAY_MS), now, windows);
    expect(step).toEqual({ nextStatus: "blocked", offenseCount: 4, windowDays: 4 });
  });

  test("blocked and resolved are terminal", () => {
    const old = new Date(now.getTime() - 100 * DAY_MS);
    expect(ladderAdvancement("blocked", 4, old, now, windows)).toBeNull();
    expect(ladderAdvancement("resolved", 4, old, now, windows)).toBeNull();
  });

  test("exact window boundary advances (elapsed ≥ window)", () => {
    const step = ladderAdvancement("open", 1, new Date(now.getTime() - DAY_MS), now, windows);
    expect(step?.nextStatus).toBe("warned");
  });

  test("missing window entry → null", () => {
    expect(ladderAdvancement("escalated", 3, new Date(now.getTime() - 99 * DAY_MS), now, [1, 2])).toBeNull();
  });
});

describe("zoneDeviation", () => {
  test("mean |quote−realized| / quote as percent", () => {
    const d = zoneDeviation([
      { quote_km: 2.0, realized_km: 3.0 }, // 0.5
      { quote_km: 2.0, realized_km: 2.0 }, // 0.0
    ]);
    expect(d).toEqual({ deviation_pct: 25, sample_count: 2 });
  });

  test("skips unusable samples (null km or quote ≤ 0)", () => {
    const d = zoneDeviation([
      { quote_km: 2.0, realized_km: 3.0 },
      { quote_km: null, realized_km: 3.0 },
      { quote_km: 0, realized_km: 3.0 },
      { quote_km: 2.0, realized_km: null },
    ]);
    expect(d).toEqual({ deviation_pct: 50, sample_count: 1 });
  });

  test("all-unusable → null", () => {
    expect(zoneDeviation([{ quote_km: null, realized_km: null }])).toBeNull();
  });
});

describe("mergeZoneCsv", () => {
  test("empty CSV → just the zone id", () => {
    expect(mergeZoneCsv("", "z1")).toBe("z1");
  });

  test("appends to existing CSV", () => {
    expect(mergeZoneCsv("z1, z2", "z3")).toBe("z1,z2,z3");
  });

  test("idempotent: already present → null (no write)", () => {
    expect(mergeZoneCsv("z1,z2", "z1")).toBeNull();
    expect(mergeZoneCsv("z1", " z1 ")).toBeNull();
  });
});

describe("isDeclineAnomaly", () => {
  test("cold rate strictly above 2× hot median flags", () => {
    expect(isDeclineAnomaly(0.5, 0.2)).toBe(true);
    expect(isDeclineAnomaly(0.4, 0.2)).toBe(false); // exactly 2× → not flagged
    expect(isDeclineAnomaly(0.1, 0.2)).toBe(false);
  });
});

/* ── Dawdle guard runner ────────────────────────────────────────── */

function sample(driverId: string, zoneId: string, realized: string, firm: string): Row {
  return {
    driver_id: driverId,
    zone_id: zoneId,
    realized_km: realized,
    firm_km: firm,
    created_at: new Date(),
  };
}

describe("runDawdleGuard", () => {
  test("fresh breach inserts one dawdle flag; sub-rolling-N and clean drivers untouched", async () => {
    // zone-1 baseline: five clean drivers × 30 samples at 1.0
    const rows: Row[] = [];
    for (let i = 2; i <= 6; i++) {
      for (let j = 0; j < 30; j++) rows.push(sample(`driver-${i}`, "zone-1", "1.0", "1.0"));
    }
    // dawdler: 30 charged samples at ratio 1.5
    for (let j = 0; j < 30; j++) rows.push(sample("driver-1", "zone-1", "1.5", "1.0"));
    // driver-7: only 5 samples — skipped (< rolling 30)
    for (let j = 0; j < 5; j++) rows.push(sample("driver-7", "zone-1", "2.5", "1.0"));

    mockSelectQueue([rows, []]); // samples, existing flags
    await runDawdleGuard();

    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe(fraudFlags);
    expect(inserts[0].values).toMatchObject({
      driver_id: "driver-1",
      flag_type: "dawdle",
    });
    const evidence = inserts[0].values.evidence as Row;
    expect(evidence.median).toBeCloseTo(1.5, 3);
    expect(evidence.sample_count).toBe(30);
    expect(evidence.zone).toBe("zone-1");
    expect(evidence.still_breaching).toBe(true);
    expect(typeof evidence.last_breach_at).toBe("string");
  });

  test("existing non-resolved flag → no insert, evidence refreshed with still_breaching", async () => {
    const rows: Row[] = [];
    for (let i = 2; i <= 6; i++) {
      for (let j = 0; j < 30; j++) rows.push(sample(`driver-${i}`, "zone-1", "1.0", "1.0"));
    }
    for (let j = 0; j < 30; j++) rows.push(sample("driver-1", "zone-1", "1.5", "1.0"));

    mockSelectQueue([
      rows,
      [{ id: "flag-1", driver_id: "driver-1", evidence: { median: 1.4, note: "prior" } }],
    ]);
    await runDawdleGuard();

    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    const set = updates[0].set as Row;
    expect(set.evidence).toMatchObject({
      note: "prior", // merged, not overwritten
      still_breaching: true,
      median: 1.5,
    });
  });

  test("recovered driver (no longer breaching) flips still_breaching off", async () => {
    const rows: Row[] = [];
    for (let i = 1; i <= 6; i++) {
      for (let j = 0; j < 30; j++) rows.push(sample(`driver-${i}`, "zone-1", "1.0", "1.0"));
    }
    mockSelectQueue([
      rows,
      [{ id: "flag-1", driver_id: "driver-1", evidence: { still_breaching: true } }],
    ]);
    await runDawdleGuard();

    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect((updates[0].set.evidence as Row).still_breaching).toBe(false);
  });

  test("no charged samples at all → no-op", async () => {
    mockSelectQueue([[], []]);
    await runDawdleGuard();
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });
});

/* ── Zone recalibration runner ──────────────────────────────────── */

describe("runZoneRecalibration", () => {
  test("exits early while zone_recal_min_sample_rides = 0 (Stage 0 default)", async () => {
    mockFwConfig.zone_recal_min_sample_rides = "0";
    await runZoneRecalibration();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test("deviation breach → queue insert + CSV append in one transaction", async () => {
    mockFwConfig.zone_recal_min_sample_rides = "10";
    mockFwConfig.zone_recal_deviation_pct = "20";

    const rows: Row[] = [];
    // zone-1: 12 samples at 50% deviation → qualifies
    for (let i = 0; i < 12; i++) rows.push({ zone_id: "zone-1", quote_km: "2.0", realized_km: "3.0" });
    // zone-2: 12 samples at 5% deviation → below threshold
    for (let i = 0; i < 12; i++) rows.push({ zone_id: "zone-2", quote_km: "2.0", realized_km: "2.1" });
    // zone-3: only 3 samples (≥ threshold but < min 10) → skipped
    for (let i = 0; i < 3; i++) rows.push({ zone_id: "zone-3", quote_km: "2.0", realized_km: "5.0" });

    mockSelectQueue([rows, []]); // samples, open queue rows
    const rec = mockTransaction([{ value: "" }]); // platform_config row exists, empty CSV
    await runZoneRecalibration();

    expect(db.transaction).toHaveBeenCalledTimes(1);
    const queueInsert = rec.inserts.find((i) => i.table === zoneRecalibrationQueue);
    expect(queueInsert?.values).toEqual({
      zone_id: "zone-1",
      deviation_pct: "50.00",
      sample_count: 12,
    });
    const csvUpdate = rec.updates.find((u) => u.table === platformConfig);
    expect(csvUpdate?.set).toMatchObject({ value: "zone-1" });
  });

  test("existing open queue row + zone already in CSV → no writes", async () => {
    mockFwConfig.zone_recal_min_sample_rides = "10";
    const rows: Row[] = [];
    for (let i = 0; i < 12; i++) rows.push({ zone_id: "zone-1", quote_km: "2.0", realized_km: "3.0" });

    mockSelectQueue([rows, [{ zone_id: "zone-1" }]]); // open row exists
    const rec = mockTransaction([{ value: "zone-1" }]); // already in CSV
    await runZoneRecalibration();

    expect(rec.inserts).toHaveLength(0);
    expect(rec.updates).toHaveLength(0);
  });

  test("missing platform_config row → insert path", async () => {
    mockFwConfig.zone_recal_min_sample_rides = "1";
    const rows = [{ zone_id: "zone-9", quote_km: "1.0", realized_km: "2.0" }];
    mockSelectQueue([rows, []]);
    const rec = mockTransaction([]); // no row → SELECT FOR UPDATE returns empty
    await runZoneRecalibration();

    const cfgInsert = rec.inserts.find((i) => i.table === platformConfig);
    expect(cfgInsert?.values).toMatchObject({
      key: "pickup_low_confidence_zone_ids",
      value: "zone-9",
    });
  });

  test("no qualifying zones → no transaction", async () => {
    mockFwConfig.zone_recal_min_sample_rides = "10";
    const rows = [{ zone_id: "zone-2", quote_km: "2.0", realized_km: "2.1" }];
    mockSelectQueue([rows, []]);
    await runZoneRecalibration();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

/* ── Response ladder runner ─────────────────────────────────────── */

function flagRow(overrides: Row = {}): Row {
  return {
    id: "flag-1",
    driver_id: "driver-1",
    flag_type: "off_platform_completion",
    evidence: {},
    status: "open",
    offense_count: 1,
    updated_at: new Date(Date.now() - 2 * DAY_MS),
    driver_user_id: "user-1",
    ...overrides,
  };
}

describe("runResponseLadder", () => {
  test("open flag past window → warned, push warning sent, evidence recorded", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow()]]);
    await runResponseLadder();

    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ status: "warned", offense_count: 2 });
    expect((updates[0].set.evidence as Row).warning_sent).toBe(true);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const args = (sendNotification as jest.Mock).mock.calls[0];
    expect(args[0]).toBe("user-1");
    expect(args[1]).toBe("fraud:warning");
    expect(args[5]).toEqual({ idempotencyKey: "fraud:flag-1:warned" });
  });

  test("dawdle flag without still_breaching evidence is never advanced", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow({ flag_type: "dawdle", evidence: { still_breaching: false } })]]);
    await runResponseLadder();
    expect(updates).toHaveLength(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  test("dawdle flag with still_breaching advances like any other type", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow({ flag_type: "dawdle", evidence: { still_breaching: true } })]]);
    await runResponseLadder();
    expect(updates[0].set).toMatchObject({ status: "warned" });
  });

  test("warned → escalated records cooldown_days = 2 × window, no warning push", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow({ status: "warned", offense_count: 2 })]]);
    await runResponseLadder();

    expect(updates[0].set).toMatchObject({ status: "escalated", offense_count: 3 });
    expect((updates[0].set.evidence as Row).cooldown_days).toBe(4); // 2 × window[1]=2
    expect(sendNotification).not.toHaveBeenCalled();
  });

  test("escalated → blocked", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow({ status: "escalated", offense_count: 3, updated_at: new Date(Date.now() - 5 * DAY_MS) })]]);
    await runResponseLadder();
    expect(updates[0].set).toMatchObject({ status: "blocked", offense_count: 4 });
  });

  test("window not elapsed → no update (idempotent)", async () => {
    mockFwConfig.dawdle_escalation_windows = "1,2,4";
    mockSelectQueue([[flagRow({ updated_at: new Date(Date.now() - 0.5 * DAY_MS) })]]);
    await runResponseLadder();
    expect(updates).toHaveLength(0);
  });
});

/* ── Decline monitoring runner ──────────────────────────────────── */

describe("runDeclineMonitoring", () => {
  test("cold decline rate > 2× hot median → monitor-only heat_manipulation flag", async () => {
    const rows: Row[] = [];
    // Four drivers at ~10% hot decline → hot median 0.1
    for (let d = 1; d <= 4; d++) {
      rows.push({ driver_id: `driver-${d}`, tag: "hot", total: "20", rejected: "2" });
    }
    // driver-1 also declines 50% of cold leads → 0.5 > 2×0.1
    rows.push({ driver_id: "driver-1", tag: "cold", total: "20", rejected: "10" });
    // driver-2 declines 10% of cold leads → clean
    rows.push({ driver_id: "driver-2", tag: "cold", total: "20", rejected: "2" });
    // driver-5: 25% cold decline but only 10 cold offers (< 20) → skipped
    rows.push({ driver_id: "driver-5", tag: "cold", total: "10", rejected: "3" });

    mockSelectQueue([rows, []]); // offer aggregates, existing flags
    await runDeclineMonitoring();

    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      driver_id: "driver-1",
      flag_type: "heat_manipulation",
    });
    const evidence = inserts[0].values.evidence as Row;
    expect(evidence.cold_decline_rate).toBeCloseTo(0.5, 3);
    expect(evidence.hot_median).toBeCloseTo(0.1, 3);
    expect(evidence.monitor_only).toBe(true);
    expect(evidence.window_days).toBe(30);
    expect(inserts[0].values.status).toBeUndefined(); // schema default 'open' — monitor only
  });

  test("driver with an existing non-resolved flag is skipped", async () => {
    const rows: Row[] = [];
    for (let d = 1; d <= 4; d++) {
      rows.push({ driver_id: `driver-${d}`, tag: "hot", total: "20", rejected: "2" });
    }
    rows.push({ driver_id: "driver-1", tag: "cold", total: "20", rejected: "10" });

    mockSelectQueue([rows, [{ driver_id: "driver-1" }]]);
    await runDeclineMonitoring();
    expect(inserts).toHaveLength(0);
  });

  test("no hot-tagged baseline drivers → no-op", async () => {
    const rows = [{ driver_id: "driver-1", tag: "cold", total: "30", rejected: "30" }];
    mockSelectQueue([rows]);
    await runDeclineMonitoring();
    expect(inserts).toHaveLength(0);
    expect(db.select).toHaveBeenCalledTimes(1); // never queries existing flags
  });
});
