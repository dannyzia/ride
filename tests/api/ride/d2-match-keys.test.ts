/**
 * D2-5 match-class keys (STAGE D2-FIX): the ride:matched / ride:completed /
 * driver:arrived convenience sends carry ride:{id}:{event} idempotency
 * keys, so a retried lifecycle transition can never double-push. Pinned
 * off the RECORDED notifications-gate rows (not the call args), plus a
 * replay: the second identical send is suppressed by the gate.
 */
/* eslint-disable import/first */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { users, userDevices, notifications } from '@/src/db/schema';
import {
  notifyRideMatched,
  notifyRideCompleted,
  notifyDriverArrived,
} from '@/lib/notify';

type Row = Record<string, unknown>;

const RIDER = '11111111-1111-4111-a111-111111111111';
const DRIVER = '22222222-2222-4222-8222-222222222222';
const RIDE = '33333333-3333-4333-8333-333333333333';

let gateKeys: Set<string>;
let gateInserts: Row[];

const expoFetch = jest.fn();
(global as unknown as { fetch: unknown }).fetch = expoFetch;

function chain(rows: Row[]) {
  const c: Record<string, unknown> = {
    from: jest.fn(() => c),
    where: jest.fn(() => c),
    limit: jest.fn(() => c),
    orderBy: jest.fn(() => c),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(res, rej),
  };
  return c;
}

function wireDb() {
  (db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn((t: unknown) => {
      if (t === users) return chain([{ id: RIDER, notification_prefs: {}, locale: 'en' }]);
      if (t === userDevices) return chain([{ user_id: RIDER, push_token: 'expo-t' }]);
      if (t === notifications)
        return chain([...gateKeys].map((k) => ({ idempotency_key: k })));
      return chain([]);
    }),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn((vals: Row | Row[]) => {
      const rows = Array.isArray(vals) ? vals : [vals];
      for (const r of rows) {
        if (r.idempotency_key) gateKeys.add(r.idempotency_key as string);
        gateInserts.push(r);
      }
      return {
        onConflictDoNothing: async () => [],
        returning: async () => rows,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(res, rej),
      };
    }),
  }));
}

const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  jest.clearAllMocks();
  gateKeys = new Set();
  gateInserts = [];
  wireDb();
  expoFetch.mockResolvedValue({ json: async () => ({ data: [{ status: 'ok' }] }) });
});

describe('D2-5 match-class idempotency keys', () => {
  it('each convenience send records ride:{id}:{event}', async () => {
    notifyRideMatched(RIDER, DRIVER, RIDE);
    notifyRideCompleted(RIDER, DRIVER, RIDE);
    notifyDriverArrived(RIDER, RIDE);
    await flush();

    const keys = gateInserts
      .map((r) => r.idempotency_key)
      .filter(Boolean)
      .sort();
    expect(keys).toEqual([
      `ride:${RIDE}:arrived`,
      `ride:${RIDE}:completed`,
      `ride:${RIDE}:matched`,
    ]);
    expect(expoFetch).toHaveBeenCalledTimes(3);
  });

  it('a replayed matched send is suppressed by the gate (one push total)', async () => {
    notifyRideMatched(RIDER, DRIVER, RIDE);
    await flush();
    expect(expoFetch).toHaveBeenCalledTimes(1);

    // Same (ride, event) again — the gate row now exists → suppressed.
    notifyRideMatched(RIDER, DRIVER, RIDE);
    await flush();
    expect(expoFetch).toHaveBeenCalledTimes(1);
  });
});
