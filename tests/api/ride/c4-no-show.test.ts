/**
 * C4-1 (STAGE C4-FIX): rider no-show — arrival gate + minimum-wait gate +
 * rider notification. Invariants:
 *  - matched / driver_arriving (pre-arrival) → 409 no_show_requires_arrival,
 *    zero writes, zero notifications (the abuse path stays closed).
 *  - driver_arrived + wait_start_at older than free_wait_minutes → success
 *    exactly once (claim is driver_arrived-only; a second attempt 409s) and
 *    the rider is notified via push + WS with the fee reason.
 *  - driver_arrived + wait not met (or never started) → 409
 *    no_show_wait_not_met, zero writes.
 *  - ride owned by another driver → 403 not_your_ride (house pattern: the
 *    DRIVERS row is resolved from auth_uid → users.id, never the users id).
 *
 * Fault-injection pairing: neutralising the arrival gate (accepting
 * 'matched') flips test 1 from 409 to a claim attempt; neutralising the
 * wait gate flips tests 3/4 from 409 to success. A guard without its check
 * fails this suite.
 */
/* eslint-disable import/first */
jest.mock('@/lib/auth', () => ({
  requireRole: jest.fn(),
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}));
jest.mock('@/lib/cancellation', () => ({
  evaluateCancellation: jest.fn(),
}));
jest.mock('@/lib/cancellationCompensation', () => ({
  createCancellationCredit: jest.fn(),
}));
jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn(),
}));
jest.mock('@/lib/wsNotify', () => ({
  notifyWs: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { requireRole } from '@/lib/auth';
import { evaluateCancellation } from '@/lib/cancellation';
import { createCancellationCredit } from '@/lib/cancellationCompensation';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { POST as noShow } from '@/app/api/ride/[id]/no-show+api';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_DRIVER_ID = '99999999-9999-4999-8999-999999999999';
const RIDER_ID = '55555555-5555-4555-8555-555555555555';
const RIDE_ID = '44444444-4444-4444-8444-444444444444';

type Row = Record<string, unknown>;

const fakeRequest = {} as unknown as Request;

async function getJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex += 1;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
}

interface UpdateCall {
  set: Row;
}
let updateCalls: UpdateCall[];
let updateReturns: Row[][];
let insertCalls: Row[];

function mockUpdates(returns: Row[][]): void {
  updateCalls = [];
  updateReturns = returns;
  (db.update as jest.Mock).mockImplementation(() => ({
    set: (vals: Row) => {
      updateCalls.push({ set: vals });
      return {
        where: () => ({
          returning: async () => updateReturns.shift() ?? [],
        }),
      };
    },
  }));
  insertCalls = [];
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: async (vals: Row) => {
      insertCalls.push(vals);
      return [];
    },
  }));
}

function baseRide(overrides: Row = {}): Row {
  return {
    id: RIDE_ID,
    driver_id: DRIVER_ID,
    user_id: RIDER_ID,
    status: 'driver_arrived',
    created_at: new Date(Date.now() - 20 * 60_000),
    wait_start_at: new Date(Date.now() - 5 * 60_000),
    vehicle_type: 'bike_basic',
    zone_id: 'zone-1',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (requireRole as jest.Mock).mockImplementation(() => jest.fn().mockResolvedValue({ dbUser: { id: USER_ID } }));
  (evaluateCancellation as jest.Mock).mockResolvedValue({ feeBdt: 500, reason: 'cancellation_rider_policy' });
  (createCancellationCredit as jest.Mock).mockResolvedValue(undefined);
  (sendNotification as jest.Mock).mockResolvedValue({ sent: 1, failed: 0 });
});

test('pre-arrival claim (matched) → 409 no_show_requires_arrival, zero writes, zero notifications', async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ status: 'matched' })]]);
  mockUpdates([[]]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(409);
  expect(body.error).toBe('no_show_requires_arrival');
  expect(updateCalls).toHaveLength(0);
  expect(insertCalls).toHaveLength(0);
  expect(sendNotification as jest.Mock).not.toHaveBeenCalled();
  expect(notifyWs as jest.Mock).not.toHaveBeenCalled();
  expect(evaluateCancellation as jest.Mock).not.toHaveBeenCalled();
});

test('pre-arrival claim (driver_arriving) → 409 no_show_requires_arrival', async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ status: 'driver_arriving' })]]);
  mockUpdates([[]]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(409);
  expect(body.error).toBe('no_show_requires_arrival');
  expect(updateCalls).toHaveLength(0);
});

test('arrived + wait met → succeeds exactly once; rider notified via push + WS', async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide()], [{ free_wait_minutes: 3 }]]);
  mockUpdates([[{ id: RIDE_ID }], []]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.fee_bdt).toBe(500);
  // Claim stamps the genuine no-show transition.
  expect(updateCalls[0].set.status).toBe('cancelled');
  expect(updateCalls[0].set.cancel_reason).toBe('rider_no_show');
  expect(updateCalls[0].set.cancelled_by).toBe('driver');
  // Rider told why they were charged (push + WS).
  expect(sendNotification as jest.Mock).toHaveBeenCalledWith(
    RIDER_ID,
    'ride:cancelled',
    expect.stringContaining('no-show'),
    expect.stringContaining('৳5'),
    { ride_id: RIDE_ID },
    { priority: 'high' },
  );
  expect(notifyWs as jest.Mock).toHaveBeenCalledWith([
    {
      event: 'ride:cancelled',
      to: [{ kind: 'user', user_id: RIDER_ID }],
      payload: expect.objectContaining({ ride_id: RIDE_ID, cancel_reason: 'rider_no_show', fee_bdt: 500 }),
    },
  ]);

  // Exactly once: a second attempt now sees status cancelled → 409.
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ status: 'cancelled' })]]);
  mockUpdates([[]]);
  const res2 = await noShow(fakeRequest, { id: RIDE_ID });
  const body2 = await getJson(res2);
  expect(res2.status).toBe(409);
  expect(body2.error).toBe('no_show_requires_arrival');
  expect(updateCalls).toHaveLength(0);
});

test('arrived + wait not elapsed → 409 no_show_wait_not_met with remaining seconds', async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ wait_start_at: new Date(Date.now() - 60_000) })], [{ free_wait_minutes: 3 }]]);
  mockUpdates([[]]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(409);
  expect(body.error).toBe('no_show_wait_not_met');
  expect(typeof body.wait_remaining_seconds).toBe('number');
  expect(updateCalls).toHaveLength(0);
  expect(sendNotification as jest.Mock).not.toHaveBeenCalled();
});

test('arrived + wait never started → 409 no_show_wait_not_met', async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ wait_start_at: null })], [{ free_wait_minutes: 3 }]]);
  mockUpdates([[]]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(409);
  expect(body.error).toBe('no_show_wait_not_met');
  expect(updateCalls).toHaveLength(0);
});

test("another driver's ride → 403 not_your_ride", async () => {
  mockSelectQueue([[{ id: DRIVER_ID }], [baseRide({ driver_id: OTHER_DRIVER_ID })]]);
  mockUpdates([[]]);

  const res = await noShow(fakeRequest, { id: RIDE_ID });
  const body = await getJson(res);

  expect(res.status).toBe(403);
  expect(body.error).toBe('not_your_ride');
  expect(updateCalls).toHaveLength(0);
});
