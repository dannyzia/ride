// @ts-nocheck — Jest mock factories produce untyped chains; runtime tests verify correctness.
/**
 * Activation seam WATERMARK tests — Jobs 54/55 (rental/delivery).
 *
 * Rebuilt on the batch2 router-mock pattern; supersedes the F46-era
 * shift-queue harness whose "watermark" tests passed for the wrong
 * reasons (tick 2 returned nothing because the mock queue ran dry, not
 * because the watermark excluded the row — deleting
 * `rentalWatermark = newest` kept every old test green).
 *
 * Contract partition (do not blur — owners only):
 *   - THIS file: watermark semantics for jobs 54/55 (tick-N non-repeat,
 *     later-row pickup, epoch restart TD-15) + the job 55 NO-shop
 *     broadcast branch (source_shop_order_id = null).
 *   - utils-server/__tests__/batch2-ws-and-activation.test.ts: N11 key
 *     shapes, M4 queue contract, job 55 shop branch.
 *   - tests/api/emergency/activation-watermark.test.ts: job 56 watermark.
 *   - tests/api/emergency/ambulance.test.ts: emergency state machine.
 *
 * HOW THE WATERMARK IS OBSERVED: production scans filter with
 * gt(created_at, watermark). The partial drizzle-orm mock records every
 * gt(col, bound); the router mock applies recorded bounds as row
 * filters. Deleting the watermark advance in production makes the
 * re-seeded row re-broadcast on tick 2 and these tests FAIL.
 *
 * WATERMARK IS MODULE STATE: it persists across tests in this file, so
 * fixture created_at timestamps MUST strictly increase test over test.
 */
import { jest } from '@jest/globals';
import { db } from '@/src/db';
import {
  activateRentalRequests,
  activateDeliveryRequests,
} from '@/utils-server/activationJobs';
import { getConnectedBidderIds, sendToBidder } from '@/utils-server/rentalHandler';
import { broadcastToCouriers } from '@/utils-server/deliveryHandler';
import { sendToUser } from '@/utils-server/index';
import { sendNotifications } from '@/lib/notify';

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
  const T = {
    rental: schema.rentalRequests,
    delivery: schema.deliveryRequests,
    zones: schema.fleetServiceZones,
    fleets: schema.fleets,
    members: schema.fleetMembers,
    shopOrders: schema.shopOrders,
  };
  let rows: Record<string, unknown[]> = {
    rental: [],
    delivery: [],
    zones: [],
    fleets: [],
    members: [],
    shopOrders: [],
  };

  const tableRows = (t: unknown) => {
    for (const key of Object.keys(T)) if (t === T[key]) return rows[key];
    return [];
  };

  // where() consumes the gt log: recorded bounds become row filters
  // (row[col] > bound). eq()/inArray() are NOT simulated — fixtures carry
  // the correct status values.
  const consumeGtFilters = () => {
    const filters = mockGtLog.splice(0, mockGtLog.length);
    void mockGtBounds; // bounds history is append-only; log is per-scan
    return (row: Record<string, unknown>) =>
      filters.every(
        (f) => new Date(row[f.colName] as unknown as string) > new Date(f.bound as unknown as string),
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

jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }),
  sendNotifications: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/utils-server/rentalHandler', () => ({
  getConnectedBidderIds: jest.fn((): string[] => []),
  sendToBidder: jest.fn(),
}));

jest.mock('@/utils-server/deliveryHandler', () => ({
  broadcastToCouriers: jest.fn(),
  sendToCourier: jest.fn(),
}));

jest.mock('@/utils-server/index', () => ({
  sendToUser: jest.fn(),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────

// 2026-09-01T10:00Z. Every test's created_at must be LATER than the last
// test's (see header: watermark is module state across tests).
const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);

const rentalRow = (id: string, createdAt: Date) => ({
  id,
  status: 'broadcasting',
  category: 'car_rental',
  urgency: 'standard',
  pickup_address: '123 Main St',
  pickup_lat: '23.8103',
  pickup_lng: '90.4125',
  dropoff_address: '456 Oak Ave',
  bidding_window_seconds: 1200,
  soft_deadline_at: new Date(createdAt.getTime() + 1200000),
  created_at: createdAt,
  cargo_tags: null,
  requested_vehicle_type: null,
  rental_options: null,
  scheduled_start_at: null,
  duration_hours: null,
});

const deliveryRow = (id: string, createdAt: Date, source_shop_order_id: string | null) => ({
  id,
  status: 'pending',
  pickup_address: 'Shop location',
  pickup_lat: '23.8103',
  pickup_lng: '90.4125',
  dropoff_address: 'Customer address',
  dropoff_lat: '23.8200',
  dropoff_lng: '90.4200',
  required_vehicle_type: null,
  declared_fee_bdt: 10000,
  deadline_at: new Date(createdAt.getTime() + 600000),
  package_description: 'Box',
  source_shop_order_id,
  created_at: createdAt,
});

const ELIGIBLE = { zones: [{ fleet_id: 'f1' }], members: [{ user_id: 'm1' }] };

// ─── Tests ────────────────────────────────────────────────────────────────

describe('Job 54 — rental activation watermark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGtLog.length = 0;
    db.__setMockRows({ rental: [], delivery: [], zones: [], fleets: [], members: [], shopOrders: [] });
  });

  it('epoch init + empty scan: first-ever tick filters gt(created_at, epoch) and returns 0', async () => {
    // MUST be the first job-54 test in this file: it captures the very first
    // scan the module registry performs, whose bound is the module-private
    // watermark's INITIAL value. Asserting it is `new Date(0)` pins TD-15
    // restart recovery (a fresh process re-broadcasts still-active rows).
    // (isolateModules cannot produce a fresh registry in this environment —
    // verified: the mocked db instance is reused, watermark included.)
    const boundsBefore = mockGtBounds.length;
    const { count, notifyQueue } = await activateRentalRequests();
    const createdBounds = mockGtBounds
      .slice(boundsBefore)
      .filter((b) => b.colName === 'created_at');
    expect(createdBounds).toHaveLength(1);
    expect(createdBounds[0].bound.getTime()).toBe(0);

    expect(count).toBe(0);
    expect(notifyQueue).toEqual([]);
    expect(sendToBidder).not.toHaveBeenCalled();
    expect(sendNotifications).not.toHaveBeenCalled(); // M4: pushes ride the queue, not direct calls
  });

  it('first tick broadcasts to the connected eligible member (WS + queued push)', async () => {
    (getConnectedBidderIds as jest.Mock).mockReturnValue(['m1']);
    db.__setMockRows({ rental: [rentalRow('req-1', new Date(T0))], ...ELIGIBLE });

    const { count, notifyQueue } = await activateRentalRequests();

    expect(count).toBe(1);
    expect(sendToBidder).toHaveBeenCalledTimes(1);
    expect(sendToBidder).toHaveBeenCalledWith(
      'm1',
      'rental:bid_request',
      expect.objectContaining({ request_id: 'req-1' }),
    );
    expect(notifyQueue).toHaveLength(1);
    expect(notifyQueue[0].userId).toBe('m1');
    // N11 key shape is owned by batch2-ws-and-activation.test.ts.
    expect(sendNotifications).not.toHaveBeenCalled();
  });

  it('watermark advance: re-seeded row is NOT re-broadcast on the next tick', async () => {
    (getConnectedBidderIds as jest.Mock).mockReturnValue(['m1']);
    const row = rentalRow('req-2', new Date(T0 + 5 * 60000));
    db.__setMockRows({ rental: [row], ...ELIGIBLE });

    const first = await activateRentalRequests();
    expect(first.count).toBe(1);

    // Same row still in the table on the next scheduler tick — the watermark
    // must exclude it. (Deleting `rentalWatermark = newest` fails this test.)
    db.__setMockRows({ rental: [row] });
    const second = await activateRentalRequests();

    expect(second.count).toBe(0);
    expect(second.notifyQueue).toEqual([]);
    expect(sendToBidder).toHaveBeenCalledTimes(1); // only the tick-1 send
  });

  it('rows created after the watermark ARE picked up on later ticks', async () => {
    (getConnectedBidderIds as jest.Mock).mockReturnValue(['m1']);
    db.__setMockRows({ rental: [rentalRow('req-3', new Date(T0 + 10 * 60000))], ...ELIGIBLE });
    expect((await activateRentalRequests()).count).toBe(1);

    db.__setMockRows({ rental: [rentalRow('req-4', new Date(T0 + 15 * 60000))] });
    const second = await activateRentalRequests();

    expect(second.count).toBe(1);
    expect(sendToBidder).toHaveBeenLastCalledWith(
      'm1',
      'rental:bid_request',
      expect.objectContaining({ request_id: 'req-4' }),
    );
  });

  // NOTE: the epoch RESTART re-broadcast itself (a fresh module registry
  // scanning from new Date(0)) is not directly assertable in-process —
  // isolateModules reuses the registry here. The contract is pinned by
  // composition: epoch INIT (first test of this describe) + watermark
  // ADVANCE (non-repeat test) + post-watermark pickup (later-rows test).
});

describe('Job 55 — delivery activation watermark', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGtLog.length = 0;
    db.__setMockRows({ rental: [], delivery: [], zones: [], fleets: [], members: [], shopOrders: [] });
  });

  it('epoch init + empty scan: first-ever tick filters gt(created_at, epoch) and returns 0', async () => {
    // MUST be the first job-55 test in this file — see the job-54 twin above.
    const boundsBefore = mockGtBounds.length;
    const { count, notifyQueue } = await activateDeliveryRequests();
    const createdBounds = mockGtBounds
      .slice(boundsBefore)
      .filter((b) => b.colName === 'created_at');
    expect(createdBounds).toHaveLength(1);
    expect(createdBounds[0].bound.getTime()).toBe(0);

    expect(count).toBe(0);
    expect(notifyQueue).toEqual([]);
    expect(broadcastToCouriers).not.toHaveBeenCalled();
  });

  it('no-shop branch: broadcasts to couriers with no shop WS/push side effects', async () => {
    db.__setMockRows({ delivery: [deliveryRow('del-1', new Date(T0 + 30 * 60000), null)] });

    const { count, notifyQueue } = await activateDeliveryRequests();

    expect(count).toBe(1);
    expect(broadcastToCouriers).toHaveBeenCalledTimes(1);
    expect(broadcastToCouriers).toHaveBeenCalledWith(
      'delivery:bid_request',
      expect.objectContaining({ request_id: 'del-1' }),
    );
    expect(notifyQueue).toEqual([]); // no shop order → no customer push
    expect(sendToUser).not.toHaveBeenCalled();
    // Shop branch (source_shop_order_id present) is owned by
    // batch2-ws-and-activation.test.ts — intentionally not duplicated here.
  });

  it('watermark advance: re-seeded pending row is not re-broadcast', async () => {
    const row = deliveryRow('del-2', new Date(T0 + 35 * 60000), null);
    db.__setMockRows({ delivery: [row] });

    expect((await activateDeliveryRequests()).count).toBe(1);

    db.__setMockRows({ delivery: [row] });
    const second = await activateDeliveryRequests();

    expect(second.count).toBe(0);
    expect(second.notifyQueue).toEqual([]);
    expect(broadcastToCouriers).toHaveBeenCalledTimes(1); // only the tick-1 broadcast
  });
});
