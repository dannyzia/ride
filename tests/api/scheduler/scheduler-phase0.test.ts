// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior
// is what's under test (house pattern: tests/api/rental/security-fix.test.ts).
/**
 * A8 — Scheduler ADR Phase 0 tests.
 * Covers: honest job counter (logged N === actual registered timers),
 * withJobBudget (ok / 57014-timeout swallow / non-timeout propagation /
 * SET LOCAL as first tx statement), R3.3 running-flag overlap guard.
 */
import { jest } from '@jest/globals';

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
}));

jest.mock('@/lib/safety', () => ({
  detectStationaryAnomaly: jest.fn(() => false),
}));

jest.mock('@/lib/forecast', () => ({
  upsertDemandForecasts: jest.fn(async () => 0),
}));

import { db } from '@/src/db';
import { logger } from '@/lib/logger';
import { startScheduler, withJobBudget } from '@/utils-server/scheduler';

const mockLoggerInfo = logger.info as jest.Mock;

const flushMicrotasks = async () => {
  for (let i = 0; i < 10; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const runSafely = (fn: () => unknown) => {
  try {
    const p = (fn as () => unknown)();
    if (p instanceof Promise) p.catch(() => {});
  } catch {
    // inert
  }
};

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
    // And the current registration count is 58 (57 jobs + the R3.3 check-in).
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

describe('A8 — R3.3 running-flag overlap guard', () => {
  it('second concurrent tick no-ops while the first is running', async () => {
    startScheduler();

    // Hold the R3.3 tick open at its first config read
    mockPendingConfigKeys = new Set(['auto_redispatch_checkin_minutes']);

    const registrations = siSpy.mock.calls.filter((c) => c[1] === 60_000);
    expect(registrations.length).toBeGreaterThan(0);

    let r33: (() => void) | undefined;
    for (const [fn] of registrations) {
      mockGetConfigValue.mockClear();
      runSafely(fn as () => void);
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
      const hit = mockGetConfigValue.mock.calls.some(
        (c) => c[0] === 'auto_redispatch_checkin_minutes',
      );
      if (hit) {
        r33 = fn as () => void;
        break;
      }
    }

    expect(r33).toBeDefined();

    // The first tick is still pending on the config read. A second fire must
    // no-op behind the running flag — no second config read, no DB work.
    mockGetConfigValue.mockClear();
    runSafely(r33!);
    await flushMicrotasks();

    const reentered = mockGetConfigValue.mock.calls.filter(
      (c) => c[0] === 'auto_redispatch_checkin_minutes',
    );
    expect(reentered).toHaveLength(0);
  });
});
