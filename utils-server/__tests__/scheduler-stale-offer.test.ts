/**
 * P0-9 (gap ledger): scheduler job 20 — stale dispatch-offer crash recovery.
 *
 * Job 20's body is inline in startScheduler (no exported runner), so the
 * interval callbacks are captured via a spied global setInterval and only the
 * short-period ticks (≤10s) are invoked against fully-mocked deps. Asserts
 * the sanctioned dispatch_offers writer's exact semantics (AGENTS.md write
 * ownership: terminal `expired` flips → scheduler job 20):
 *  - flips ONLY outcome='delivered' rows (never terminal outcomes)
 *  - threshold is config-driven: dispatch_offer_ttl_seconds + 5s grace, so
 *    the sweep can never race a live sequential chain's pending offer
 *  - the flip writes outcome='expired' with no other column touched
 *
 * SQL-ifies the captured drizzle where-predicate via PgDialect (same technique
 * as dispatch-pool-predicates.test.ts) so the row-safety predicates are
 * asserted at SQL level, not just against mock rows.
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
jest.mock("@/lib/platformConfig", () => ({ getPlan05Int: jest.fn(async () => 0), getConfigValue: jest.fn(async () => null) }));
jest.mock("@/lib/forecast", () => ({ upsertDemandForecasts: jest.fn() }));
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async (keys: readonly string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = "15"; // dispatch_offer_ttl_seconds = 15
    return out;
  }),
  parseConfigNumber: (value: string, fallback: number) => {
    if (value == null || String(value).trim() === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  },
  parseConfigBool: (value: string) => value === "true",
  parseConfigCsv: (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean),
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../src/db";
import { dispatchOffers } from "../../src/db/schema";
import { startScheduler } from "../scheduler";

type Row = Record<string, unknown>;
type TickFn = () => Promise<void>;

interface UpdateEntry {
  table: unknown;
  set: Row;
  where: unknown;
}

const updates: UpdateEntry[] = [];

/** Capture ALL interval callbacks startScheduler registers; schedule nothing. */
function captureTicks(): TickFn[] {
  const ticks: { fn: TickFn; ms: number }[] = [];
  const spy = jest
    .spyOn(global, "setInterval")
    .mockImplementation(((fn: TickFn, ms: number) => {
      ticks.push({ fn, ms: Number(ms) });
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval);
  try {
    startScheduler();
  } finally {
    spy.mockRestore();
  }
  expect(ticks.length).toBeGreaterThanOrEqual(50); // AGENTS.md: scheduler registers 57 jobs
  return ticks.filter((t) => t.ms <= 10_000).map((t) => t.fn);
}

function resetDbMock(): void {
  updates.length = 0;
  (db.select as jest.Mock).mockReset().mockImplementation(() => {
    const chain: Record<string, unknown> = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: () => chain,
      groupBy: () => chain,
      orderBy: () => chain,
      limit: async () => [],
      for: () => chain,
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve([]).then(resolve, reject),
    };
    return chain;
  });
  (db.insert as jest.Mock).mockReset().mockImplementation((_table: unknown) => ({
    values: () => ({
      returning: async () => [],
      onConflictDoNothing: () => Promise.resolve([]),
    }),
  }));
  (db.update as jest.Mock).mockReset().mockImplementation((table: unknown) => ({
    set: (setObj: Row) => {
      const entry: UpdateEntry = { table, set: setObj, where: undefined };
      updates.push(entry);
      return {
        where: (whereObj: unknown) => {
          entry.where = whereObj;
          return { returning: async () => [] };
        },
        returning: async () => [],
      };
    },
  }));
  (db.delete as jest.Mock).mockReset().mockImplementation(() => ({
    where: async () => [],
  }));
  (db.execute as jest.Mock).mockReset().mockResolvedValue([]);
  (db.transaction as jest.Mock).mockReset().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));
}

beforeEach(() => {
  resetDbMock();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("scheduler job 20 — stale dispatch-offer expiry (crash recovery)", () => {
  test("short-period ticks flip delivered offers to expired at ttl+5s, touching only delivered rows", async () => {
    const ticks = captureTicks();

    for (const tick of ticks) {
      await tick();
    }

    const offerExpiries = updates.filter((u) => u.table === dispatchOffers);
    expect(offerExpiries).toHaveLength(1);
    expect(offerExpiries[0].set).toEqual({ outcome: "expired" });

    const dialect = new PgDialect();
    const rendered = dialect.sqlToQuery(offerExpiries[0].where as never);
    // Row safety: ONLY delivered offers are eligible for the crash-recovery flip.
    expect(rendered.sql).toContain('"dispatch_offers"."outcome" = $');
    expect(rendered.params).toContain("delivered");
    // Age gate: sent_at older than (ttl 15 + 5 grace) = 20 seconds.
    expect(rendered.sql).toMatch(/now\(\) - \(\$\d+ \* interval '1 second'\)/);
    expect(rendered.params).toContain(20);
  });
});
