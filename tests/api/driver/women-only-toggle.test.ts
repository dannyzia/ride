/**
 * S8b-10 (plan §4.4) — driver women-only toggle gates (R-2 preference).
 *   - GET reports own-state + can_enable (kill switch AND female AND verified
 *     AND bike-family) for the UI,
 *   - PATCH enable gated in ORDER: kill switch (women_only_disabled) →
 *     gender (women_only_not_eligible) → verification (women_only_not_verified)
 *     → vehicle family (women_only_bike_only); every rejection writes NOTHING,
 *   - disable is always allowed (no gates — mutual escape hatch stays open),
 *   - the persisted column is what the dispatch pool filters on directly, so a
 *     tampered client cannot widen its own eligibility.
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
jest.mock('@/lib/platformConfig', () => ({
  getPlan05Bool: jest.fn(),
}));

import { db } from '@/src/db';
import { drivers } from '@/src/db/schema';
import { getPlan05Bool } from '@/lib/platformConfig';
import { GET, PATCH } from '@/app/api/driver/women-only-toggle+api';

type Row = Record<string, unknown>;

interface Seed {
  driverRow: Row | null;
  featureEnabled: boolean;
}

function installDb(seed: Seed): { updates: { set: Row }[] } {
  const updates: { set: Row }[] = [];
  (getPlan05Bool as jest.Mock).mockResolvedValue(seed.featureEnabled);

  (db.select as jest.Mock).mockImplementation(() => ({
    from: (table: unknown) => {
      const chain = {
        where: () => chain,
        limit: async () => (table === drivers && seed.driverRow ? [seed.driverRow] : []),
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

/** Verified female bike driver — the fully-eligible row. */
const ELIGIBLE: Row = {
  id: 'd1',
  gender: 'female',
  gender_verified: true,
  vehicle_type: 'bike_standard',
  women_only_enabled: false,
  status: 'active',
};

const jsonRequest = (body: unknown): Request =>
  new Request('http://localhost/api/driver/women-only-toggle', {
    method: body === undefined ? 'GET' : 'PATCH',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

describe('GET /api/driver/women-only-toggle', () => {
  it('reports can_enable=true for a verified female bike driver with the feature on', async () => {
    installDb({ driverRow: ELIGIBLE, featureEnabled: true });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      enabled: false,
      can_enable: true,
      women_only_feature_enabled: true,
      gender: 'female',
      gender_verified: true,
      vehicle_type: 'bike_standard',
    });
  });

  it.each([
    ['kill switch off', { ...ELIGIBLE }, false],
    ['not female', { ...ELIGIBLE, gender: 'male' }, true],
    ['unverified', { ...ELIGIBLE, gender_verified: false }, true],
    ['outside bike family', { ...ELIGIBLE, vehicle_type: 'cng' }, true],
  ])('reports can_enable=false — %s', async (_label, row, featureEnabled) => {
    installDb({ driverRow: row, featureEnabled });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ can_enable: false });
  });

  it('404 driver_not_found without a drivers row', async () => {
    installDb({ driverRow: null, featureEnabled: true });
    const res = await GET(jsonRequest(undefined));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: 'driver_not_found' });
  });
});

describe('PATCH /api/driver/women-only-toggle', () => {
  it('enable succeeds for a verified female bike driver — writes women_only_enabled=true', async () => {
    const { updates } = installDb({ driverRow: ELIGIBLE, featureEnabled: true });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, enabled: true });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ women_only_enabled: true });
  });

  it('enable is REJECTED first by the kill switch (403 women_only_disabled) — no write', async () => {
    const { updates } = installDb({ driverRow: ELIGIBLE, featureEnabled: false });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'women_only_disabled' });
    expect(updates).toHaveLength(0);
  });

  it('enable is REJECTED for a non-female driver (403 women_only_not_eligible) — no write', async () => {
    const { updates } = installDb({
      driverRow: { ...ELIGIBLE, gender: 'male' },
      featureEnabled: true,
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'women_only_not_eligible' });
    expect(updates).toHaveLength(0);
  });

  it('enable is REJECTED without gender verification (403 women_only_not_verified) — no write', async () => {
    const { updates } = installDb({
      driverRow: { ...ELIGIBLE, gender_verified: false },
      featureEnabled: true,
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'women_only_not_verified' });
    expect(updates).toHaveLength(0);
  });

  it('enable is REJECTED outside the bike family (403 women_only_bike_only) — no write', async () => {
    const { updates } = installDb({
      driverRow: { ...ELIGIBLE, vehicle_type: 'cng' },
      featureEnabled: true,
    });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: 'women_only_bike_only' });
    expect(updates).toHaveLength(0);
  });

  it('disable is always allowed — no gates, writes women_only_enabled=false', async () => {
    const { updates } = installDb({
      driverRow: { ...ELIGIBLE, gender: 'male', women_only_enabled: true },
      featureEnabled: false,
    });
    const res = await PATCH(jsonRequest({ enabled: false }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, enabled: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].set).toMatchObject({ women_only_enabled: false });
  });

  it('400 validation_error for a non-boolean body', async () => {
    installDb({ driverRow: ELIGIBLE, featureEnabled: true });
    const res = await PATCH(jsonRequest({ enabled: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('404 driver_not_found without a drivers row — no write', async () => {
    const { updates } = installDb({ driverRow: null, featureEnabled: true });
    const res = await PATCH(jsonRequest({ enabled: true }));
    expect(res.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
