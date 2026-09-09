/**
 * A1 (2026-09-09 marketplace staleness audit) — scheduler job 51, Delivery TTL sweep.
 *
 * Job 51's body is inline in startScheduler (no exported runner), so the interval
 * callbacks are captured via a spied global setInterval and ALL of them are invoked
 * (no period filter — the stale-offer precedent filters ≤10s, but job 51 registers
 * at 60_000ms). Table-identity filtering isolates job 51: it is the ONLY scheduler
 * job that writes `delivery_requests` (grep-verified against every `db.update` in
 * scheduler.ts; job 50 writes shop_rfqs, job 49 shop_orders).
 *
 * Pins the contract the old placeholder concealed: expired pending requests are
 * CANCELLED (`status: 'cancelled'`, `cancel_reason: 'deadline_expired'`), NOT set
 * to a hypothetical 'expired' status — the delivery_status enum has no 'expired'
 * value. The WHERE predicate pins `status = 'pending' AND deadline_at < now`, so
 * assigned/in_transit/delivered/failed/cancelled rows are structurally excluded.
 *
 * Replaces the vacuous `expect(51).toBeDefined()` / `expect(true).toBe(true)`
 * placeholders that previously lived in tests/api/delivery/delivery.test.ts
 * ("Delivery TTL sweep (job 51)" describe — deleted in the same batch).
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
jest.mock("@/lib/platformConfig", () => ({
  getPlan05Int: jest.fn(async (_k: string, f: number) => f),
  getConfigValue: jest.fn(async (_k: string, f: string | null) => f),
  getConfigInt: jest.fn(async (_k: string, f: number) => f),
}));
jest.mock("../../lib/forecast", () => ({ upsertDemandForecasts: jest.fn() }));
jest.mock("../../lib/fareFrameworkConfig", () => ({
  getFareFrameworkConfig: jest.fn(async (keys: readonly string[]) => {
    const out: Record<string, string> = {};
    for (const k of keys) out[k] = "";
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
// Dynamic-import seams inside job bodies — inert so ALL ticks can run hermetically.
jest.mock("../../lib/zoneRecovery", () => ({ computeZoneRecoveries: jest.fn(async () => []) }));
jest.mock("../rentalDispatchChain", () => ({
  sweepDeadlines: jest.fn(async () => 0),
  sweepAssignmentSla: jest.fn(async () => 0),
  sweepConfirmationDeadlines: jest.fn(async () => 0),
}));
jest.mock("../deliveryHandler", () => ({ sweepStaleCouriers: jest.fn(async () => 0) }));
jest.mock("../activationJobs", () => ({
  activateRentalRequests: jest.fn(async () => ({ count: 0, notifyQueue: [] })),
  activateDeliveryRequests: jest.fn(async () => ({ count: 0, notifyQueue: [] })),
  dispatchNotifyQueue: jest.fn(async () => undefined),
}));
jest.mock("../emergencyChain", () => ({ sweepExpiredEmergencies: jest.fn(async () => 0) }));
jest.mock("../emergencyActivation", () => ({ activateEmergencyRequests: jest.fn(async () => 0) }));
jest.mock("../../lib/notifications/server", () => ({ sweepExpiredNotifications: jest.fn(async () => 0) }));

import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../src/db";
import { deliveryRequests } from "../../src/db/schema";
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
  const ticks: TickFn[] = [];
  const spy = jest
    .spyOn(global, "setInterval")
    .mockImplementation(((fn: TickFn, _ms: number) => {
      ticks.push(fn);
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval);
  try {
    startScheduler();
  } finally {
    spy.mockRestore();
  }
  // Sanity: the harness really captured the full registry (A8 counter says 58).
  expect(ticks.length).toBeGreaterThanOrEqual(50);
  return ticks;
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
      offset: async () => [],
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

describe("scheduler job 51 — delivery TTL sweep", () => {
  test("cancels pending requests past deadline: status='cancelled' + cancel_reason='deadline_expired'", async () => {
    const ticks = captureTicks();

    for (const tick of ticks) {
      await tick();
    }

    // Job 51 is the ONLY scheduler writer of delivery_requests — table identity
    // filters out every other job's updates.
    const sweeps = updates.filter((u) => u.table === deliveryRequests);
    expect(sweeps).toHaveLength(1);

    // The vocabulary the vacuous placeholder concealed: CANCELLED with reason,
    // not 'expired' (delivery_status enum has no 'expired' value).
    expect(sweeps[0].set.status).toBe("cancelled");
    expect(sweeps[0].set.cancel_reason).toBe("deadline_expired");
    expect(sweeps[0].set.cancelled_at).toBeInstanceOf(Date);

    // Row-safety predicates rendered at SQL level:
    const rendered = new PgDialect().sqlToQuery(sweeps[0].where as never);
    expect(rendered.sql).toContain('"delivery_requests"."status" = $');
    expect(rendered.params[0]).toBe("pending");
    expect(rendered.sql).toContain('"delivery_requests"."deadline_at" <');
    // PgDialect renders Date params as ISO strings — assert it parses to a real,
    // recent instant (the sweep's `now`).
    const sweepNow = new Date(rendered.params[1] as string | Date).getTime();
    expect(Number.isNaN(sweepNow)).toBe(false);
    expect(Math.abs(Date.now() - sweepNow)).toBeLessThan(60_000);
  });

  test("sweep predicate pins status='pending' — assigned/delivered/failed rows are structurally excluded", async () => {
    const ticks = captureTicks();

    for (const tick of ticks) {
      await tick();
    }

    const sweeps = updates.filter((u) => u.table === deliveryRequests);
    expect(sweeps).toHaveLength(1);

    const rendered = new PgDialect().sqlToQuery(sweeps[0].where as never);
    // The ONLY status the sweep can ever touch is 'pending' — the params array
    // carries exactly [status, deadline] with no other status values anywhere.
    expect(rendered.params).toHaveLength(2);
    expect(rendered.params[0]).toBe("pending");
    expect(Number.isNaN(new Date(rendered.params[1] as string).getTime())).toBe(false);
    // No IN-list, no OR over other statuses:
    expect(rendered.sql).not.toMatch(/in\s*\(/i);
  });

  test("exactly ONE registered tick writes delivery_requests (job-51 identity, not a hash-order accident)", async () => {
    const ticks = captureTicks();

    let writers = 0;
    for (const tick of ticks) {
      const before = updates.filter((u) => u.table === deliveryRequests).length;
      await tick();
      const after = updates.filter((u) => u.table === deliveryRequests).length;
      if (after > before) writers += 1;
    }

    // Guards against two jobs drifting into writing the same table (which would
    // break the table-identity isolation every other assertion here relies on).
    expect(writers).toBe(1);
  });
});
