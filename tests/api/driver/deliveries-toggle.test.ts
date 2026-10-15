/**
 * S6 (plan 27 §6.1 + Amendment 2) — driver Deliveries toggle gates.
 *   - default OFF server-read (migration default; the route never enables
 *     without an explicit PATCH),
 *   - enable REJECTED while carrying a rider (409 active_ride — mutual
 *     exclusion), enable REJECTED on a non-active driver row,
 *   - disable always allowed,
 *   - GET reports carrying_rider + can_enable for the UI.
 */
/* eslint-disable import/first */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
  requireRole: () => async () => ({
    supabaseUser: { id: 'auth-1' },
    dbUser: { id: 'driver-user-1' },
  }),
}));

import { db } from '@/src/db';
import { drivers, rides } from '@/src/db/schema';
import { GET, PATCH } from '@/app/api/driver/deliveries-toggle+api';

type Row = Record<string, unknown>;

interface Seed {
  driverRow: Row | null;
  busyRides: Row[];
}

function installDb(seed: Seed): { updates: { set: Row }[] } {
  const updates: { set: Row }[] = [];

  const rowsFor = (table: unknown): Row[] => {
    if (table === drivers) return seed.driverRow ? [seed.driverRow] : [];
    if (table === rides) return seed.busyRides;
    return [];
  };

  // select().from(t).where().limit()  |  select().from(t).innerJoin().where().limit()
  (db.select as jest.Mock).mockImplementation(() => ({
    from: (table: unknown) => {
      const chain = {
        where: () => chain,
        innerJoin: () => chain,
        limit: async () => rowsFor(table),
      };
      return chain;
    },
  }));

  (db.update as jest.Mock).mockImplementation(() => ({
    set: (values: Row) => ({
      where: async () => {
        updates.push({ set: values });
        return {};
      },
    }),
  }));

  return { updates };
}

const jsonRequest = (body: unknown): Request =>
  new Request('http://localhost/api/driver/deliveries-toggle', {
    method: body === undefined ? 'GET' : 'PATCH',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('GET /api/driver/deliveries-toggle', () => {
  it('reads the toggle OFF by default and reports can_enable', async () => {
    installDb({
      driverRow: { id: 'd1', deliveries_enabled: false, status: 'active' },
      busyRides: [],
    });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      enabled: false,
      carrying_rider: false,
      can_enable: true,
    });
  });

  it('reports carrying_rider and can_enable=false mid-trip', async () => {
    installDb({
      driverRow: { id: 'd1', deliveries_enabled: false, status: 'active' },
      busyRides: [{ id: 'ride-1' }],
    });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      carrying_rider: true,
      can_enable: false,
    });
  });
});

describe('PATCH /api/driver/deliveries-toggle', () => {
  it('enable succeeds when active and not carrying — writes deliveries_enabled=true', async () => {
    const { updates } = installDb({
      driverRow: { id: 'd1', deliveries_enabled: false, status: 'active' },
      busyRides: [],
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ success: true, enabled: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ deliveries_enabled: true });
  });

  it('enable is REJECTED while carrying a rider (409 active_ride) — no write', async () => {
    const { updates } = installDb({
      driverRow: { id: 'd1', deliveries_enabled: false, status: 'active' },
      busyRides: [{ id: 'ride-1' }],
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'active_ride' });
    expect(updates).toHaveLength(0);
  });

  it('enable is REJECTED on a non-active driver row (409 driver_not_active)', async () => {
    const { updates } = installDb({
      driverRow: { id: 'd1', deliveries_enabled: false, status: 'suspended' },
      busyRides: [],
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: 'driver_not_active' });
    expect(updates).toHaveLength(0);
  });

  it('disable is always allowed — no ride gate, writes false', async () => {
    const { updates } = installDb({
      driverRow: { id: 'd1', deliveries_enabled: true, status: 'active' },
      busyRides: [{ id: 'ride-1' }],
    });
    const res = await PATCH(jsonRequest({ enabled: false }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ enabled: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ deliveries_enabled: false });
  });
});
