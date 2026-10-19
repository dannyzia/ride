/* eslint-disable import/first */
/**
 * C3-5 (STAGE C3-FIX, F-05 cash handshake): rider notes change-making at
 * confirm (cash-note+api, in_progress only, driver fan-out); driver confirms
 * amount-received at complete; both sides round-trip into the receipt via
 * the shared buildCashHandshake builder. All amounts integer paisa.
 */
jest.mock('@/lib/auth', () => ({
  requireRole: () => async () => ({ dbUser: { id: 'rider-user-1' } }),
  verifySupabaseToken: async () => ({ id: 'auth-uid-1' }),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/notify', () => ({
  sendNotification: jest.fn(async () => undefined),
}));
jest.mock('@/lib/wsNotify', () => ({
  notifyWs: jest.fn(),
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));

import { db } from '@/src/db';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { POST as cashNote } from '@/app/api/ride/[id]/cash-note+api';
import { GET as getRide } from '@/app/api/ride/[id]/index+api';
import { buildCashHandshake } from '@/lib/cashHandshake';

const RIDE_ID = '11111111-1111-4111-a111-111111111111';
const DRIVER_ID = '33333333-3333-4333-a333-333333333333';
const RIDER_USER_ID = 'rider-user-1';
const DRIVER_USER_ID = 'driver-user-9';

function queuedSelects(rows: unknown[][]) {
  let i = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.innerJoin = () => c;
    c.where = () => c;
    c.limit = async () => rows[i++] ?? [];
    return c;
  });
}

function queuedUpdates(returningRows: unknown[][]) {
  let i = 0;
  const setFn = jest.fn((v: unknown) => ({
    where: () => ({
      returning: async () => returningRows[i++] ?? [],
    }),
    _setArg: v,
  }));
  (db.update as jest.Mock).mockImplementation(() => ({ set: setFn }));
  (globalThis as Record<string, unknown>).__cashNoteSetFn = setFn;
}

function postRequest(body: unknown): Request {
  return {
    json: async () => body,
    headers: { get: () => 'Bearer tok' },
    url: 'http://localhost/',
  } as unknown as Request;
}

function getRequest(): Request {
  return {
    headers: { get: () => 'Bearer tok' },
    url: 'http://localhost/',
  } as unknown as Request;
}

beforeEach(() => jest.clearAllMocks());

describe('buildCashHandshake (shared receipt entry)', () => {
  it('derives change_due and agreement when both sides present', () => {
    expect(buildCashHandshake(50000, 50000, 32000)).toEqual({
      rider_cash_tendered_bdt: 50000,
      driver_cash_received_bdt: 50000,
      change_due_bdt: 18000,
      amounts_match: true,
    });
  });

  it('flags disagreement between rider note and driver confirm', () => {
    const h = buildCashHandshake(50000, 45000, 32000);
    expect(h.change_due_bdt).toBe(18000);
    expect(h.amounts_match).toBe(false);
  });

  it('stays null-safe when either side is missing', () => {
    expect(buildCashHandshake(null, 50000, 32000)).toEqual({
      rider_cash_tendered_bdt: null,
      driver_cash_received_bdt: 50000,
      change_due_bdt: null,
      amounts_match: null,
    });
    expect(buildCashHandshake(50000, null, 32000).amounts_match).toBeNull();
    expect(buildCashHandshake(undefined, undefined, undefined)).toEqual({
      rider_cash_tendered_bdt: null,
      driver_cash_received_bdt: null,
      change_due_bdt: null,
      amounts_match: null,
    });
  });

  it('keeps every amount an integer (paisa, never float taka)', () => {
    const h = buildCashHandshake(100000, 100000, 65550);
    expect(Number.isInteger(h.change_due_bdt)).toBe(true);
    expect(h.change_due_bdt).toBe(34450);
  });
});

describe('POST /api/ride/[id]/cash-note (rider confirm)', () => {
  it('400 invalid_uuid without touching the db', async () => {
    const res = await cashNote(postRequest({ cash_tendered_bdt: 50000 }), { id: 'nope' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_uuid');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('404 ride_not_found for an unknown ride', async () => {
    queuedSelects([[]]);
    const res = await cashNote(postRequest({ cash_tendered_bdt: 50000 }), { id: RIDE_ID });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('ride_not_found');
  });

  it("403 not_your_ride when the caller doesn't own the ride", async () => {
    queuedSelects([[{ id: RIDE_ID, user_id: 'someone-else', status: 'in_progress' }]]);
    const res = await cashNote(postRequest({ cash_tendered_bdt: 50000 }), { id: RIDE_ID });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('not_your_ride');
  });

  it('400 on non-paisa input (negative / float / missing)', async () => {
    queuedSelects([[{ id: RIDE_ID, user_id: RIDER_USER_ID, status: 'in_progress' }]]);
    for (const body of [
      { cash_tendered_bdt: -100 },
      { cash_tendered_bdt: 12.5 },
      {},
    ]) {
      const res = await cashNote(postRequest(body), { id: RIDE_ID });
      expect(res.status).toBe(400);
    }
    expect(db.update).not.toHaveBeenCalled();
  });

  it('409 when the ride is no longer in_progress (complete won the race)', async () => {
    queuedSelects([[{ id: RIDE_ID, user_id: RIDER_USER_ID, status: 'completed' }]]);
    queuedUpdates([[]]);
    const res = await cashNote(postRequest({ cash_tendered_bdt: 50000 }), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('invalid_status');
    expect(notifyWs).not.toHaveBeenCalled();
  });

  it('persists the note and fans out to exactly the driver', async () => {
    queuedSelects([
      [{ id: RIDE_ID, user_id: RIDER_USER_ID, status: 'in_progress', driver_id: DRIVER_ID }],
      [{ user_id: DRIVER_USER_ID }],
    ]);
    queuedUpdates([[{ id: RIDE_ID, driver_id: DRIVER_ID }]]);

    const res = await cashNote(postRequest({ cash_tendered_bdt: 50000 }), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ride_id: RIDE_ID, cash_tendered_bdt: 50000 });
    expect(typeof body.noted_at).toBe('string');

    // The atomic write carried the tendered amount.
    expect(db.update).toHaveBeenCalled();
    const setFn = (globalThis as Record<string, unknown>).__cashNoteSetFn as jest.Mock;
    const setArg = setFn.mock.calls[0][0] as Record<string, unknown>;
    expect(setArg.rider_cash_tendered_bdt).toBe(50000);
    expect(setArg.rider_cash_noted_at).toBeInstanceOf(Date);

    // Fan-out reaches exactly the driver: one WS event + one push.
    expect(notifyWs).toHaveBeenCalledTimes(1);
    const events = (notifyWs as jest.Mock).mock.calls[0][0];
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('ride:cash_noted');
    expect(events[0].to).toEqual([{ kind: 'user', user_id: DRIVER_USER_ID }]);
    expect(events[0].payload).toMatchObject({ ride_id: RIDE_ID, cash_tendered_bdt: 50000 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect((sendNotification as jest.Mock).mock.calls[0][0]).toBe(DRIVER_USER_ID);
  });
});

describe('GET /api/ride/[id] receipt carries the handshake', () => {
  const RIDE_ROW = {
    id: RIDE_ID,
    user_id: RIDER_USER_ID,
    driver_id: null,
    origin_latitude: '23.8103',
    origin_longitude: '90.4125',
    destination_latitude: '23.8203',
    destination_longitude: '90.4225',
    distance_km: '5.500',
    fare_breakdown: { total_bdt: 32000 },
    start_pin: '1234',
    rider_payable_bdt: 32000,
    rider_cash_tendered_bdt: 50000,
    driver_cash_received_bdt: 50000,
  };

  it('round-trips rider note + driver confirm into cash_handshake', async () => {
    queuedSelects([[{ id: RIDER_USER_ID }], [RIDE_ROW]]);
    const res = await getRide(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cash_handshake).toEqual({
      rider_cash_tendered_bdt: 50000,
      driver_cash_received_bdt: 50000,
      change_due_bdt: 18000,
      amounts_match: true,
    });
  });

  it('receipt stays null-safe before the handshake happens', async () => {
    queuedSelects([[{ id: RIDER_USER_ID }], [{
      ...RIDE_ROW,
      rider_cash_tendered_bdt: null,
      driver_cash_received_bdt: null,
    }]]);
    const res = await getRide(getRequest(), { id: RIDE_ID });
    expect(res.status).toBe(200);
    expect((await res.json()).cash_handshake).toEqual({
      rider_cash_tendered_bdt: null,
      driver_cash_received_bdt: null,
      change_due_bdt: null,
      amounts_match: null,
    });
  });
});
