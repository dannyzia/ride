/**
 * D2-1 revoke-on-logout (STAGE D2-FIX, ruled 🔴):
 * the device push-token delete lands in the server logout route (and the
 * client hits it via lib/pushRevoke before supabase signOut).
 *
 * Shared-device regression: user A logs out → user B logs in on the same
 * device_id → zero A-addressed pushes (device rows prove it: A's rows are
 * gone, so fetchTokensByUser finds no tokens), while B's sends work.
 */
/* eslint-disable import/first */
jest.mock('@/lib/supabaseServer', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(),
      admin: { signOut: jest.fn() },
    },
  },
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { userDevices, users, notifications } from '@/src/db/schema';
import { sendNotification } from '@/lib/notify';
import { POST as logout } from '@/app/api/auth/logout+api';

type Row = Record<string, unknown>;

const AUTH_A = 'auth-uid-a';
const USER_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const DEVICE_D = 'shared-device-d';
const TOKEN_A = 'token-a';

let deviceRows: Row[];
let userRows: Row[];
let notifyInserts: Row[];
const signOutCalls: string[] = [];

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
      if (t === users) return chain(userRows);
      if (t === userDevices) return chain(deviceRows);
      if (t === notifications) return chain([]);
      return chain([]);
    }),
  }));
  (db.delete as jest.Mock).mockImplementation(() => ({
    where: jest.fn(() => {
      // Server logout deletes ALL of the caller's device rows.
      deviceRows = deviceRows.filter((r) => r.user_id !== USER_A);
      return Promise.resolve([]);
    }),
  }));
  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn((s: Row) => {
      for (const u of userRows) {
        if (u.id === USER_A) Object.assign(u, s);
      }
      return { where: jest.fn(() => Promise.resolve([])) };
    }),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn((vals: Row | Row[]) => {
      const rows = Array.isArray(vals) ? vals : [vals];
      notifyInserts.push(...rows);
      return {
        onConflictDoNothing: async () => [],
        returning: async () => rows,
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
          Promise.resolve(rows).then(res, rej),
      };
    }),
  }));
}

const expoFetch = jest.fn();
(global as unknown as { fetch: unknown }).fetch = expoFetch;

function authed(token: string): Request {
  return { headers: new Headers({ Authorization: `Bearer ${token}` }) } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
  signOutCalls.length = 0;
  deviceRows = [{ id: 'dev-1', user_id: USER_A, push_token: 'expo-token-A', device_id: DEVICE_D }];
  userRows = [{ id: USER_A, device_id: DEVICE_D }];
  notifyInserts = [];
  wireDb();
  (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: AUTH_A } } });
  (supabaseAdmin.auth.admin.signOut as jest.Mock).mockImplementation(async (t: string) => {
    signOutCalls.push(t);
    return { error: null };
  });
  expoFetch.mockResolvedValue({ json: async () => ({ data: [{ status: 'ok' }] }) });
});

describe('D2-1 server logout revokes push tokens', () => {
  it('drops the caller device rows, clears the binding, then signs out', async () => {
    const res = await logout(authed(TOKEN_A));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });

    // A's device rows are gone…
    expect(deviceRows.filter((r) => r.user_id === USER_A)).toHaveLength(0);
    // …the binding is cleared…
    expect(userRows.find((u) => u.id === USER_A)?.device_id).toBeNull();
    // …and the token still signs out.
    expect(signOutCalls).toEqual([TOKEN_A]);
  });

  it('shared device: after A logs out, A-addressed pushes send zero; B works', async () => {
    await logout(authed(TOKEN_A));

    // A's pushes go nowhere (no rows → no tokens → no Expo call for A).
    const toA = await sendNotification(USER_A, 'ride:matched', 'Driver Found', 'Hi');
    expect(toA).toEqual({ sent: 0, failed: 0 });

    // B signs in on the same device_id and registers it.
    deviceRows.push({ id: 'dev-2', user_id: USER_B, push_token: 'expo-token-B', device_id: DEVICE_D });
    const toB = await sendNotification(USER_B, 'ride:matched', 'Driver Found', 'Hi');
    expect(toB).toEqual({ sent: 1, failed: 0 });

    // And A still receives nothing (exactly one Expo POST total, to B).
    expect(expoFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(expoFetch.mock.calls[0][1].body);
    expect(body.body.map((m: { to: string }) => m.to)).toEqual(['expo-token-B']);
  });

  it('unresolvable token still signs out (revoke never blocks logout)', async () => {
    (supabaseAdmin.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null } });
    const res = await logout(authed('dead-token'));
    expect(res.status).toBe(200);
    expect(signOutCalls).toEqual(['dead-token']);
  });
});
