// @ts-nocheck — Jest mock factories produce untyped chains; runtime tests verify correctness.
/**
 * Job 56 watermark tests — emergency activation (emergencyActivation.ts).
 *
 * Closes the gap from the 2026-09-08 test-overlap audit: job 56 had
 * tx-routing coverage (scheduler-phase0) and M5 key-shape coverage
 * (batch2-ws-and-activation) but NO watermark-semantics coverage. This
 * file owns job 56 watermark semantics only:
 *   - epoch initialization (new Date(0) — TD-15 restart recovery),
 *   - tick-N non-repeat after the watermark advances,
 *   - later-row pickup on subsequent ticks,
 *   - TTL sweep exclusion (job 53 owns expiry; the scan must not
 *     re-broadcast expired rows).
 *
 * broadcastEmergencyNewRequest is MOCKED here: its contract (M5 key
 * shape, §C.6 eligibility, emit-after-commit) is owned by
 * batch2-ws-and-activation.test.ts / ambulance.test.ts.
 *
 * HOW THE WATERMARK IS OBSERVED: the scan filters with
 * gt(created_at, watermark) AND gt(expires_at, now). The partial
 * drizzle-orm mock records every gt(col, bound); the router mock
 * applies recorded bounds as row filters. Deleting the watermark
 * advance in production makes the re-seeded row re-broadcast and these
 * tests FAIL.
 *
 * WATERMARK IS MODULE STATE: it persists across tests in this file, so
 * fixture created_at timestamps MUST strictly increase test over test.
 */
import { jest } from '@jest/globals';
import { db } from '@/src/db';
import { activateEmergencyRequests } from '@/utils-server/emergencyActivation';
import { broadcastEmergencyNewRequest } from '@/utils-server/emergencyChain';

/** gt(col, bound) calls recorded since the last where() consumption. */
const mockGtLog: Array<{ colName: string; bound: unknown }> = [];
/** Append-only history of every gt(col, bound) the scans ever evaluated. */
const mockGtBounds: Array<{ colName: string; bound: Date }> = [];

jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    ...actual,
    gt: (...args: unknown[]) => {
      const col = args[0] as { name?: string } | undefined;
      const entry = { colName: col?.name ?? String(args[0]), bound: args[1] as Date };
      mockGtLog.push(entry);
      mockGtBounds.push(entry);
      return actual.gt(...args);
    },
  };
});

jest.mock('@/src/db', () => {
  const schema = require('@/src/db/schema');
  const T = { emergency: schema.emergencyRequests };
  let rows: Record<string, unknown[]> = { emergency: [] };

  const tableRows = (t: unknown) => (t === T.emergency ? rows.emergency : []);

  // where() consumes the gt log: recorded bounds become row filters
  // (row[col] > bound). eq() is NOT simulated — fixtures carry the right
  // status values.
  const consumeGtFilters = () => {
    const filters = mockGtLog.splice(0, mockGtLog.length);
    void mockGtBounds; // bounds history is append-only; log is per-scan
    return (row: Record<string, unknown>) =>
      filters.every(
        (f) =>
          new Date(row[f.colName] as unknown as string) >
          new Date(f.bound as unknown as string),
      );
  };

  const chainable = (base: unknown[]) => {
    const c: any = {};
    c.limit = async (n: number) => base.slice(0, n);
    c.orderBy = () => c;
    c.groupBy = () => c;
    c.for = async () => base;
    c.then = (res: any, rej: any) => Promise.resolve(base).then(res, rej);
    return c;
  };

  const makeSelect = () => (..._args: unknown[]) => ({
    from: (t: unknown) => {
      const q: any = {};
      q.innerJoin = () => q;
      q.leftJoin = () => q;
      q.where = () => chainable(tableRows(t).filter(consumeGtFilters()));
      q.then = (res: any, rej: any) => Promise.resolve(tableRows(t)).then(res, rej);
      return q;
    },
  });

  const dbMock: any = { select: makeSelect() };
  dbMock.__setMockRows = (patch: Record<string, unknown[]>) => {
    for (const key of Object.keys(patch)) rows[key] = patch[key];
  };
  return { db: dbMock };
});

jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/utils-server/emergencyChain', () => ({
  // Simulate the real collaborator: pushes M5 tuples into the queue and
  // reports how many certified drivers were reached.
  broadcastEmergencyNewRequest: jest.fn(async (req: unknown, queue: unknown[]) => {
    (queue as unknown[]).push({ fake: true, req });
    return 2;
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

// Fixture created_at must strictly increase per test (watermark is module
// state). created_at is set in the FUTURE relative to the real clock so the
// default expires_at (created + 2 min) also stays ahead of the scan's
// gt(expires_at, new Date()) TTL gate — that gate compares against the real
// clock, not the watermark.
const E0 = Date.UTC(2026, 11, 1, 10, 0, 0);

const emergencyRow = (id: string, createdAt: Date, expiresAt?: Date) => ({
  id,
  pickup_address: 'Dhanmondi 27',
  pickup_lat: '23.8103',
  pickup_lng: '90.4125',
  service_level: 'basic',
  requires_paramedic: false,
  expires_at: expiresAt ?? new Date(createdAt.getTime() + 120000),
  created_at: createdAt,
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Job 56 — emergency activation watermark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGtLog.length = 0;
    db.__setMockRows({ emergency: [] });
  });

  it('epoch init + empty scan: first-ever tick filters gt(created_at, epoch) and returns 0', async () => {
    // MUST be the first test in this file: it captures the very first scan
    // the module registry performs, whose bound is the module-private
    // watermark's INITIAL value. Asserting it is `new Date(0)` pins TD-15
    // restart recovery. (isolateModules cannot produce a fresh registry in
    // this environment — verified: the mocked db instance is reused.)
    const boundsBefore = mockGtBounds.length;
    const { count, notifyQueue } = await activateEmergencyRequests();
    const createdBounds = mockGtBounds
      .slice(boundsBefore)
      .filter((b) => b.colName === 'created_at');
    expect(createdBounds).toHaveLength(1);
    expect(createdBounds[0].bound.getTime()).toBe(0);

    expect(count).toBe(0);
    expect(notifyQueue).toEqual([]);
    expect(broadcastEmergencyNewRequest).not.toHaveBeenCalled();
  });

  it('first tick relays the broadcasting row and advances the watermark', async () => {
    const row = emergencyRow('ereq-1', new Date(E0));
    db.__setMockRows({ emergency: [row] });

    const { count, notifyQueue } = await activateEmergencyRequests();

    expect(count).toBe(2); // from the mocked collaborator
    expect(broadcastEmergencyNewRequest).toHaveBeenCalledTimes(1);
    expect(broadcastEmergencyNewRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ereq-1' }),
      notifyQueue,
    );
    expect(notifyQueue).toHaveLength(1);
  });

  it('watermark advance: re-seeded row is NOT re-broadcast on the next tick', async () => {
    const row = emergencyRow('ereq-2', new Date(E0 + 5 * 60000));
    db.__setMockRows({ emergency: [row] });

    expect((await activateEmergencyRequests()).count).toBe(2);

    // Same row still broadcasting on the next tick — the watermark must
    // exclude it. (Deleting `emergencyWatermark = newest` fails this test.)
    db.__setMockRows({ emergency: [row] });
    const second = await activateEmergencyRequests();

    expect(second.count).toBe(0);
    expect(second.notifyQueue).toEqual([]);
    expect(broadcastEmergencyNewRequest).toHaveBeenCalledTimes(1);
  });

  it('rows created after the watermark ARE relayed on later ticks', async () => {
    db.__setMockRows({ emergency: [emergencyRow('ereq-3', new Date(E0 + 10 * 60000))] });
    expect((await activateEmergencyRequests()).count).toBe(2);

    db.__setMockRows({ emergency: [emergencyRow('ereq-4', new Date(E0 + 15 * 60000))] });
    const second = await activateEmergencyRequests();

    expect(second.count).toBe(2);
    expect(broadcastEmergencyNewRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'ereq-4' }),
      expect.anything(),
    );
  });

  it('expired rows are excluded by the TTL filter and never re-broadcast', async () => {
    // created_at ascending (keeps the shared watermark ascending) but
    // expires_at already in the past → the scan's gt(expires_at, now)
    // excludes it; job 53 owns the actual expiry flip.
    db.__setMockRows({
      emergency: [emergencyRow('ereq-5', new Date(E0 + 20 * 60000), new Date(Date.now() - 60000))],
    });

    const { count, notifyQueue } = await activateEmergencyRequests();

    expect(count).toBe(0);
    expect(notifyQueue).toEqual([]);
    expect(broadcastEmergencyNewRequest).not.toHaveBeenCalled();
  });
});
