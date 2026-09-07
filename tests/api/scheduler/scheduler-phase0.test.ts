// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/rental/security-fix.test.ts).
/**
 * A8 — Scheduler ADR Phase 0 tests.
 * Covers: honest job counter (logged N === actual registered timers),
 * withJobBudget (ok / 57014-timeout swallow / non-timeout propagation /
 * SET LOCAL as first tx statement).
 */
import { jest } from '@jest/globals';

import { db } from '@/src/db';
import { logger } from '@/lib/logger';
import { readFileSync } from 'fs';
import { join } from 'path';
import { startScheduler, withJobBudget } from '@/utils-server/scheduler';
import { activateRentalRequests, activateDeliveryRequests } from '@/utils-server/activationJobs';
import { sweepExpiredEmergencies } from '@/utils-server/emergencyChain';
import { activateEmergencyRequests } from '@/utils-server/emergencyActivation';

let mockPendingConfigKeys: Set<string> = new Set();

jest.mock('@/src/db', () => {
  const chain = () => {
    const c: any = {};
    c.from = jest.fn(() => c);
    c.where = jest.fn(() => c);
    c.innerJoin = jest.fn(() => c);
    c.leftJoin = jest.fn(() => c);
    c.orderBy = jest.fn(() => c);
    c.groupBy = jest.fn(() => c);
    c.limit = jest.fn(async () => []);
    c.offset = jest.fn(async () => []);
    c.for = jest.fn(async () => []);
    c.returning = jest.fn(async () => [{ id: 'mock-id' }]);
    c.then = (res?: unknown, rej?: unknown) => Promise.resolve([]).then(res, rej);
    return c;
  };
  const inertDb = () => ({
    select: jest.fn(() => chain()),
    update: jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => [{ id: 'mock-id' }]),
          then: (res?: unknown) => Promise.resolve([{ id: 'mock-id' }]).then(res),
        })),
        returning: jest.fn(async () => [{ id: 'mock-id' }]),
        then: (res?: unknown) => Promise.resolve([{ id: 'mock-id' }]).then(res),
      })),
    })),
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        returning: jest.fn(async () => [{ id: 'mock-id' }]),
        then: (res?: unknown) => Promise.resolve([{ id: 'mock-id' }]).then(res),
      })),
    })),
    execute: jest.fn(async () => []),
  });
  return {
    db: {
      ...inertDb(),
      transaction: jest.fn(async (fn: any) => fn(inertDb())),
    },
  };
});

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockGetConfigValue = jest.fn(
  async (key: string, fallback: string) =>
    mockPendingConfigKeys.has(key)
      ? new Promise<string>(() => {}) // never resolves — holds the tick open
      : fallback,
);

jest.mock('@/lib/platformConfig', () => ({
  getConfigValue: (...a: unknown[]) => mockGetConfigValue(...(a as [string, string])),
  getConfigInt: async (_key: string, fallback: number) => fallback,
  getPlan05Int: async (_key: string, fallback: number) => fallback,
}));

jest.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(async () => ({ data: null })),
    })),
  },
}));

jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn(async () => ({ id: 'n' })),
  sendNotifications: jest.fn(async () => []),
}));

jest.mock('@/lib/safety', () => ({
  detectStationaryAnomaly: jest.fn(() => false),
}));

jest.mock('@/lib/forecast', () => ({
  upsertDemandForecasts: jest.fn(async () => 0),
}));

// activationJobs imports ./index -> dispatch -> lib/h3 (h3-js crashes on the
// jest TextDecoder shim) — mock the h3 seam before those imports load.
jest.mock('@/lib/h3', () => ({
  latLngToCell: jest.fn(() => '882a1072ffffffff'),
  gridDisk: jest.fn(() => []),
  cellToBoundary: jest.fn(() => []),
}));

// activationJobs imports sendToUser from ./index, whose import-time env
// validation (lib/env.ts) throws under jest — mock the WS-server module.
jest.mock('@/utils-server/index', () => ({
  sendToUser: jest.fn(),
}));

const mockLoggerInfo = logger.info as jest.Mock;

let siSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingConfigKeys = new Set();
  jest.useFakeTimers();
  siSpy = jest.spyOn(global, 'setInterval');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  siSpy.mockRestore();
});

describe('A8 — honest job counter', () => {
  it('logged job count equals the number of registered interval timers', () => {
    startScheduler();

    const startedCall = mockLoggerInfo.mock.calls.find((c) =>
      String(c[0]).includes('started ('),
    );
    expect(startedCall).toBeDefined();
    const logged = Number(/started \((\d+) jobs\)/.exec(String(startedCall![0]))![1]);

    // The counter must equal the ACTUAL number of registered timers — never
    // a hardcoded string again.
    expect(logged).toBe(jest.getTimerCount());
    // And the current registration count is 58 (57 + job 57 notification
    // retention sweep).
    expect(logged).toBe(58);
  });
});

describe('A8 — withJobBudget', () => {
  it('ok path passes the result through, logs outcome ok, SET LOCAL is the first tx statement', async () => {
    const executed: unknown[] = [];
    (db as any).transaction = jest.fn(async (fn: any) =>
      fn({
        execute: jest.fn(async (s: unknown) => {
          executed.push(s);
          return [];
        }),
      }),
    );

    const result = await withJobBudget(54, 10_000, async () => 42);

    expect(result).toBe(42);
    expect(executed).toHaveLength(1);
    expect(JSON.stringify(executed[0])).toContain('SET LOCAL statement_timeout = 10000');

    const tick = mockLoggerInfo.mock.calls.find((c) => String(c[0]).includes('job 54 tick'));
    expect(tick).toBeDefined();
    expect(tick![1]).toMatchObject({ job: 54, outcome: 'ok' });
    expect(typeof tick![1].duration_ms).toBe('number');
  });

  it('PG 57014 (query_canceled) is swallowed and logged as outcome timeout', async () => {
    (db as any).transaction = jest.fn(async (fn: any) =>
      fn({ execute: jest.fn(async () => []) }),
    );

    const result = await withJobBudget(55, 10_000, async () => {
      throw Object.assign(new Error('canceling statement due to statement timeout'), {
        code: '57014',
      });
    });

    expect(result).toBeUndefined();
    const tick = mockLoggerInfo.mock.calls.find((c) => String(c[0]).includes('job 55 tick'));
    expect(tick).toBeDefined();
    expect(tick![1]).toMatchObject({ job: 55, outcome: 'timeout' });
  });

  it('non-timeout errors log outcome error and propagate to the job catch', async () => {
    (db as any).transaction = jest.fn(async (fn: any) =>
      fn({ execute: jest.fn(async () => []) }),
    );

    await expect(
      withJobBudget(56, 10_000, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const tick = mockLoggerInfo.mock.calls.find((c) => String(c[0]).includes('job 56 tick'));
    expect(tick).toBeDefined();
    expect(tick![1]).toMatchObject({ job: 56, outcome: 'error' });
  });
});


// ══════════════════════════════════════════════════════════════════════
// ADR Phase 1 — tx-threading for the four marketplace scans
// ══════════════════════════════════════════════════════════════════════

const SCHEDULER_SRC = readFileSync(
  join(__dirname, "..", "..", "..", "utils-server", "scheduler.ts"),
  "utf8",
);

describe("ADR Phase 1 — scheduler call sites pass tx", () => {
  it("all four marketplace blocks thread the tx handle into the scan fn", () => {
    expect(SCHEDULER_SRC).toContain("(tx) => activateRentalRequests(tx)");
    expect(SCHEDULER_SRC).toContain("(tx) => activateDeliveryRequests(tx)");
    expect(SCHEDULER_SRC).toContain("(tx) => sweepExpiredEmergencies(tx)");
    expect(SCHEDULER_SRC).toContain("(tx) => activateEmergencyRequests(tx)");
    // and the old ignored-tx form is gone
    expect(SCHEDULER_SRC).not.toContain("(_tx) =>");
  });

  it("the four scan signatures accept a DbClient defaulting to db", () => {
    const files = [
      join(__dirname, "..", "..", "..", "utils-server", "activationJobs.ts"),
      join(__dirname, "..", "..", "..", "utils-server", "emergencyChain.ts"),
      join(__dirname, "..", "..", "..", "utils-server", "emergencyActivation.ts"),
    ];
    const combined = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(combined).toContain("activateRentalRequests(tx: DbClient = db)");
    expect(combined).toContain("activateDeliveryRequests(tx: DbClient = db)");
    expect(combined).toContain("sweepExpiredEmergencies(tx: DbClient = db)");
    expect(combined).toContain("activateEmergencyRequests(tx: DbClient = db)");
  });
});

describe("ADR Phase 1 — scans route queries through the tx handle", () => {
  function mockTxHandle() {
    const txSelect = jest.fn(() => {
      const c: any = {};
      c.from = jest.fn(() => c);
      c.where = jest.fn(() => c);
      c.innerJoin = jest.fn(() => c);
      c.orderBy = jest.fn(() => c);
      c.limit = jest.fn(() => c);
      c.for = jest.fn(() => c);
      c.then = (res?: unknown) => Promise.resolve([]).then(res);
      return c;
    });
    const txUpdate = jest.fn(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => []),
        })),
        returning: jest.fn(async () => []),
      })),
    }));
    return { tx: { select: txSelect, update: txUpdate }, txSelect, txUpdate };
  }

  beforeEach(() => {
    (db.select as jest.Mock).mockClear();
    (db.update as jest.Mock).mockClear();
  });

  it("activateRentalRequests(tx) queries the tx, not global db", async () => {
    const { tx, txSelect } = mockTxHandle();
    const { count } = await activateRentalRequests(tx as never);
    expect(count).toBe(0);
    expect(txSelect).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("activateDeliveryRequests(tx) queries the tx, not global db", async () => {
    const { tx, txSelect } = mockTxHandle();
    const { count } = await activateDeliveryRequests(tx as never);
    expect(count).toBe(0);
    expect(txSelect).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("sweepExpiredEmergencies(tx) updates via the tx, not global db", async () => {
    const { tx, txUpdate } = mockTxHandle();
    const count = await sweepExpiredEmergencies(tx as never);
    expect(count).toBe(0);
    expect(txUpdate).toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("activateEmergencyRequests(tx) queries the tx, not global db", async () => {
    const { tx, txSelect } = mockTxHandle();
    const { count } = await activateEmergencyRequests(tx as never);
    expect(count).toBe(0);
    expect(txSelect).toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });
});
