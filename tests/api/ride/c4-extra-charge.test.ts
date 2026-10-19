/**
 * C4-4 + C4-7 (STAGE C4-FIX): extra-charge lifecycle.
 *
 * POST (propose):
 *  - active ride (matched … in_progress) → charge created + rider notified
 *    via push (ride:extra_charge_proposed) + WS (discovery is not
 *    poller-dependent).
 *  - completed / pending ride → 409 invalid_status, zero writes.
 *
 * PATCH (approve / dispute):
 *  - C4-4 FK: the dispute ticket carries users.id (resolved from auth_uid),
 *    never the Supabase auth UUID (which 500s on the FK).
 *  - C4-4 single-tx: the disputed flip and the ticket insert go through the
 *    SAME tx object — db.update / db.insert are never touched directly. A
 *    revert to split writes flips these tests red.
 *  - Rollback: a ticket-insert failure → 500 with the flip uncommitted (the
 *    throw aborts the tx callback, so production rolls the claim back and
 *    the charge stays pending/undisputed).
 *  - Race: a concurrently-resolved charge (conditional UPDATE matches zero
 *    rows) → 409 already_resolved, no ticket.
 *  - C4-7: approving on a completed ride records a fare_reconciliation note
 *    (the completion fold is the fare truth); approving mid-ride writes no
 *    ticket at all.
 */
/* eslint-disable import/first */
jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn(), transaction: jest.fn() },
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
import { verifySupabaseToken } from '@/lib/auth';
import { sendNotification } from '@/lib/notify';
import { notifyWs } from '@/lib/wsNotify';
import { POST, PATCH } from '@/app/api/ride/[id]/extra-charge+api';

const SUPABASE_UID = '11111111-1111-4111-a111-111111111111';
const RIDER_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_USER_ID = '66666666-6666-4666-8666-666666666666';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';
const RIDE_ID = '44444444-4444-4444-8444-444444444444';
const CHARGE_ID = '55555555-5555-4555-8555-555555555555';
const TICKET_ID = '77777777-7777-4777-8777-777777777777';

type Row = Record<string, unknown>;

function jsonRequest(body: unknown): Request {
  return { json: async () => body } as unknown as Request;
}

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
      orderBy: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
}

interface TxState {
  updates: Row[];
  inserts: Row[];
  failInsert: boolean;
}

function mockTransaction(state: TxState, claimRows: Row[] = [{ id: CHARGE_ID }]): void {
  const tx = {
    update: jest.fn(() => ({
      set: (vals: Row) => {
        state.updates.push(vals);
        return {
          where: () => ({
            returning: async () => claimRows,
          }),
        };
      },
    })),
    insert: jest.fn(() => ({
      values: (vals: Row) => {
        if (state.failInsert) throw new Error('insert boom');
        state.inserts.push(vals);
        return {
          returning: async () => [{ id: TICKET_ID }],
        };
      },
    })),
  };
  (db.transaction as jest.Mock).mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    await cb(tx);
    return undefined;
  });
}

function mockDirectInsert(returning: Row[] = [{ id: CHARGE_ID }]): Row[] {
  const calls: Row[] = [];
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: (vals: Row) => {
      calls.push(vals);
      return { returning: async () => returning };
    },
  }));
  return calls;
}

const ACTIVE_RIDE: Row = {
  id: RIDE_ID,
  driver_id: DRIVER_ID,
  user_id: RIDER_ID,
  status: 'in_progress',
};

const PENDING_CHARGE: Row = {
  id: CHARGE_ID,
  ride_id: RIDE_ID,
  type: 'toll',
  amount_bdt: 500,
  description: 'bridge toll',
  status: 'pending',
};

const PROPOSE_BODY = { type: 'toll', amount_bdt: 500, description: 'bridge toll' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /extra-charge (C4-7 status guard, C4-3 rider notify)', () => {
  test('active ride → charge created + rider push + WS', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: DRIVER_USER_ID }], [{ id: DRIVER_ID }], [ACTIVE_RIDE]]);
    const inserts = mockDirectInsert();
    (sendNotification as jest.Mock).mockResolvedValue({ sent: 1, failed: 0 });

    const res = await POST(jsonRequest(PROPOSE_BODY), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].ride_id).toBe(RIDE_ID);
    expect(sendNotification as jest.Mock).toHaveBeenCalledWith(
      RIDER_ID,
      'ride:extra_charge_proposed',
      expect.stringContaining('Toll'),
      expect.stringContaining('৳5'),
      { ride_id: RIDE_ID, charge_id: CHARGE_ID },
      { priority: 'high' },
    );
    expect(notifyWs as jest.Mock).toHaveBeenCalledWith([
      {
        event: 'ride:extra_charge_proposed',
        to: [{ kind: 'user', user_id: RIDER_ID }],
        payload: expect.objectContaining({ ride_id: RIDE_ID, charge_id: CHARGE_ID, amount_bdt: 500 }),
      },
    ]);
  });

  test('completed ride → 409 invalid_status, zero writes, zero notifications', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: DRIVER_USER_ID }], [{ id: DRIVER_ID }], [{ ...ACTIVE_RIDE, status: 'completed' }]]);
    const inserts = mockDirectInsert();

    const res = await POST(jsonRequest(PROPOSE_BODY), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(409);
    expect(body.error).toBe('invalid_status');
    expect(inserts).toHaveLength(0);
    expect(sendNotification as jest.Mock).not.toHaveBeenCalled();
    expect(notifyWs as jest.Mock).not.toHaveBeenCalled();
  });

  test('pre-match ride (pending) → 409 invalid_status', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: DRIVER_USER_ID }], [{ id: DRIVER_ID }], [{ ...ACTIVE_RIDE, status: 'pending' }]]);
    const inserts = mockDirectInsert();

    const res = await POST(jsonRequest(PROPOSE_BODY), { id: RIDE_ID });
    expect(res.status).toBe(409);
    expect(inserts).toHaveLength(0);
  });
});

describe('PATCH /extra-charge (C4-4 single-tx dispute, C4-7 reconciliation)', () => {
  test('dispute round-trips: charge disputed + ticket carries users.id (FK fix), all inside ONE tx', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: RIDER_ID }], [PENDING_CHARGE], [ACTIVE_RIDE]]);
    const state: TxState = { updates: [], inserts: [], failInsert: false };
    mockTransaction(state);

    const res = await PATCH(jsonRequest({ charge_id: CHARGE_ID, action: 'dispute' }), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe('disputed');
    // The flip went through the tx, never a direct write.
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].status).toBe('disputed');
    expect(db.update as jest.Mock).not.toHaveBeenCalled();
    // The ticket is linked to the USERS row — the auth UUID would FK-500.
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].user_id).toBe(RIDER_ID);
    expect(state.inserts[0].user_id).not.toBe(SUPABASE_UID);
    expect(state.inserts[0].category).toBe('fare_dispute');
    expect(db.insert as jest.Mock).not.toHaveBeenCalled();
  });

  test('rollback: ticket-insert failure → 500, flip uncommitted (charge stays undisputed)', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: RIDER_ID }], [PENDING_CHARGE], [ACTIVE_RIDE]]);
    const state: TxState = { updates: [], inserts: [], failInsert: true };
    mockTransaction(state);

    const res = await PATCH(jsonRequest({ charge_id: CHARGE_ID, action: 'dispute' }), { id: RIDE_ID });

    // The throw aborts the tx callback: production rolls the claim UPDATE
    // back, so the charge is still pending — no half-commit, no 200.
    expect(res.status).toBe(500);
    expect(state.inserts).toHaveLength(0);
    expect(db.update as jest.Mock).not.toHaveBeenCalled();
    expect(db.insert as jest.Mock).not.toHaveBeenCalled();
  });

  test('concurrent resolution (claim matches zero rows) → 409, no ticket', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: RIDER_ID }], [PENDING_CHARGE], [ACTIVE_RIDE]]);
    const state: TxState = { updates: [], inserts: [], failInsert: false };
    mockTransaction(state, []);

    const res = await PATCH(jsonRequest({ charge_id: CHARGE_ID, action: 'dispute' }), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(409);
    expect(body.error).toBe('already_resolved');
    expect(state.inserts).toHaveLength(0);
  });

  test('mid-ride approve → approved, no ticket', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: RIDER_ID }], [PENDING_CHARGE], [ACTIVE_RIDE]]);
    const state: TxState = { updates: [], inserts: [], failInsert: false };
    mockTransaction(state);

    const res = await PATCH(jsonRequest({ charge_id: CHARGE_ID, action: 'approve' }), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe('approved');
    expect(state.updates[0].status).toBe('approved');
    expect(state.inserts).toHaveLength(0);
    expect(body.reconciliation_noted).toBeUndefined();
  });

  test('post-completion approve → approved + fare_reconciliation note (fare truth untouched)', async () => {
    (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
    mockSelectQueue([[{ id: RIDER_ID }], [PENDING_CHARGE], [{ ...ACTIVE_RIDE, status: 'completed' }]]);
    const state: TxState = { updates: [], inserts: [], failInsert: false };
    mockTransaction(state);

    const res = await PATCH(jsonRequest({ charge_id: CHARGE_ID, action: 'approve' }), { id: RIDE_ID });
    const body = await getJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe('approved');
    expect(body.reconciliation_noted).toBe(true);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0].category).toBe('fare_reconciliation');
    expect(state.inserts[0].user_id).toBe(RIDER_ID);
  });
});
