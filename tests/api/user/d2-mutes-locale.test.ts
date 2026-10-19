/**
 * D2-2 minimal mutes + D2-3 notify locale (STAGE D2-FIX), pinned through
 * the REAL dispatchBatch (sendNotifications) with a mocked db:
 *  - a muted live category sends nothing (no Expo POST, zero results);
 *  - an unmuted category sends;
 *  - unmapped (safety) types always send, even with every pref false;
 *  - a bn-locale recipient gets the bn body via copyKey;
 *  - a missing locale defaults to en.
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
import { sendNotifications, mutePrefKeyForType } from '@/lib/notify';

type Row = Record<string, unknown>;

const UID = '11111111-1111-4111-a111-111111111111';

// Controllable per-test server state.
let userRow: Row | null;
let expoInbox: { to: string; title: string; body: string }[];

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
      if (t === users) return chain(userRow ? [userRow] : []);
      if (t === userDevices)
        return chain([{ user_id: UID, push_token: 'expo-token-1' }]);
      if (t === notifications) return chain([]);
      return chain([]);
    }),
  }));
  (db.insert as jest.Mock).mockImplementation(() => ({
    values: jest.fn(() => ({
      onConflictDoNothing: async () => [],
      returning: async () => [],
    })),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  userRow = { id: UID, notification_prefs: {}, locale: 'en' };
  expoInbox = [];
  wireDb();
  expoFetch.mockImplementation(async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body).body;
    expoInbox.push(...body);
    return { json: async () => ({ data: body.map(() => ({ status: 'ok' })) }) };
  });
});

describe('D2-2 minimal mutes (server-enforced)', () => {
  it('muted order category sends nothing', async () => {
    userRow = { id: UID, notification_prefs: { order_updates: false }, locale: 'en' };
    await sendNotifications([
      { userId: UID, type: 'shop:order_status', title: 'T', body: 'B' },
    ]);
    expect(expoFetch).not.toHaveBeenCalled();
    expect(expoInbox).toHaveLength(0);
  });

  it('unmuted delivery category sends', async () => {
    userRow = { id: UID, notification_prefs: { delivery_updates: true }, locale: 'en' };
    await sendNotifications([
      { userId: UID, type: 'delivery:status', title: 'T', body: 'B' },
    ]);
    expect(expoFetch).toHaveBeenCalledTimes(1);
    expect(expoInbox).toHaveLength(1);
  });

  it('unmapped safety types always send, even with every pref false', async () => {
    userRow = {
      id: UID,
      notification_prefs: {
        ride_updates: false,
        order_updates: false,
        delivery_updates: false,
        shop_updates: false,
      },
      locale: 'en',
    };
    await sendNotifications([
      { userId: UID, type: 'sos:alert', title: 'SOS', body: 'Help' },
      { userId: UID, type: 'emergency:assigned', title: 'E', body: 'Amb' },
      { userId: UID, type: 'account:suspended', title: 'A', body: 'Susp' },
    ]);
    expect(expoInbox).toHaveLength(3);
  });

  it('type→category mapping covers the live classes', () => {
    expect(mutePrefKeyForType('ride:matched')).toBe('ride_updates');
    expect(mutePrefKeyForType('rental:bid_request')).toBe('order_updates');
    expect(mutePrefKeyForType('shop:order_status')).toBe('order_updates');
    expect(mutePrefKeyForType('delivery:status')).toBe('delivery_updates');
    expect(mutePrefKeyForType('shop:delivery_exhausted')).toBe('delivery_updates');
    expect(mutePrefKeyForType('shop:new_order')).toBe('shop_updates');
    expect(mutePrefKeyForType('shop:complaint_flagged')).toBe('shop_updates');
    expect(mutePrefKeyForType('sos:alert')).toBeNull();
    expect(mutePrefKeyForType('emergency:assigned')).toBeNull();
    expect(mutePrefKeyForType('account:suspended')).toBeNull();
    expect(mutePrefKeyForType('promo:available')).toBeNull();
  });
});

describe('D2-3 notify locale (copyKey resolution)', () => {
  it('bn-locale recipient gets the bn body', async () => {
    userRow = { id: UID, notification_prefs: {}, locale: 'bn' };
    await sendNotifications([
      {
        userId: UID,
        type: 'ride:matched',
        title: 'Driver Found',
        body: 'Your driver is on the way!',
        copyKey: 'ride_matched',
      },
    ]);
    expect(expoInbox).toHaveLength(1);
    expect(expoInbox[0].title).toBe('ড্রাইভার পাওয়া গেছে');
    expect(expoInbox[0].body).toBe('আপনার ড্রাইভার আসছেন!');
  });

  it('missing locale defaults to en', async () => {
    userRow = { id: UID, notification_prefs: {}, locale: null };
    await sendNotifications([
      {
        userId: UID,
        type: 'ride:completed',
        title: 'Ride Complete',
        body: 'Thanks for riding with us! Rate your driver.',
        copyKey: 'ride_completed',
      },
    ]);
    expect(expoInbox).toHaveLength(1);
    expect(expoInbox[0].title).toBe('Ride Complete');
  });

  it('unknown copyKey keeps the literal (never blank)', async () => {
    userRow = { id: UID, notification_prefs: {}, locale: 'bn' };
    await sendNotifications([
      {
        userId: UID,
        type: 'ride:matched',
        title: 'Driver Found',
        body: 'Your driver is on the way!',
        copyKey: 'no_such_key' as never,
      },
    ]);
    expect(expoInbox).toHaveLength(1);
    expect(expoInbox[0].title).toBe('Driver Found');
  });

  it('copyVars fill templates (fleet invite, en + bn)', async () => {
    userRow = { id: UID, notification_prefs: {}, locale: 'bn' };
    await sendNotifications([
      {
        userId: UID,
        type: 'fleet:staff_invite',
        title: "You've been added to a fleet team",
        body: 'Acme added you as a manager.',
        copyKey: 'fleet_staff_invite',
        copyVars: { fleet_name: 'Acme', role_label: 'a manager' },
      },
    ]);
    expect(expoInbox).toHaveLength(1);
    expect(expoInbox[0].body).toContain('Acme');
    expect(expoInbox[0].body).toContain('a manager');
    expect(expoInbox[0].title).toBe('আপনাকে একটি ফ্লিট টিমে যোগ করা হয়েছে');
  });
});
