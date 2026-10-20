/**
 * S8b-10 (plan §4.2) — write-once gender on PATCH /api/user/me.
 *   - 'unspecified' is schema-accepted so it can 400 invalid_gender (explicit
 *     code, not a generic validation error),
 *   - the claim runs as one tx whose WHERE gender='unspecified' barrier makes
 *     concurrent claims race-safe: exactly one claimer updates, losers 400
 *     gender_already_set and never re-execute,
 *   - a successful claim dual-writes drivers.gender (fires
 *     trg_drivers_gender_reset → admin re-stamps verification).
 */
/* eslint-disable import/first */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), transaction: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: 'auth-1' })),
}));
jest.mock('@/lib/platformConfig', () => ({
  getPlan05Bool: jest.fn(async () => true),
}));

import { db } from '@/src/db';
import { users, drivers } from '@/src/db/schema';
import { PATCH, GET } from '@/app/api/user/me+api';

type Row = Record<string, unknown>;

const USER_ID = 'u1';

const FINAL_ROW: Row = {
  id: USER_ID,
  name: 'Rider',
  email: null,
  phone: '+8801700000001',
  role: 'rider',
  profile_image_url: null,
  rating: null,
  rating_count: 0,
  gender: 'female',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

/**
 * Root select call order is FIXED per handler path:
 *   PATCH: 1 auth lookup → 2 final read-back
 *   GET:   1 the single read
 * The tx mock serves the claim's .returning() from `claimSucceeds`.
 */
function installDb(opts: {
  claimSucceeds: boolean;
  finalRow?: Row;
  /** GET performs ONE root select (the read itself); PATCH performs TWO
   *  (auth lookup → final read-back). The caller states its path so the
   *  mock never guesses from queue length. */
  path: 'get' | 'patch';
}): { txUpdates: { table: unknown; set: Row }[] } {
  // Reset call history from prior tests BEFORE installing this test's
  // implementations (mocks are module-level singletons).
  jest.clearAllMocks();
  const txUpdates: { table: unknown; set: Row }[] = [];
  const finals = [opts.finalRow ?? FINAL_ROW];
  let rootSelects = 0;

  (db.select as jest.Mock).mockImplementation(() => {
    rootSelects += 1;
    const isAuthLookup = opts.path === 'patch' && rootSelects === 1;
    const chain = {
      from: () => chain,
      where: () => chain,
      // The route destructures the awaited value (`const [dbUser] = await
      // ...limit(1)`), so limit MUST resolve to an ARRAY.
      limit: async () => {
        if (isAuthLookup) return [{ id: USER_ID }];
        const row = finals.shift();
        return row ? [row] : [];
      },
    };
    return chain;
  });

  (db.update as jest.Mock).mockImplementation(() => ({
    set: (values: Row) => ({
      where: async () => {
        txUpdates.push({ table: null, set: values });
        return [];
      },
    }),
  }));

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: (table: unknown) => ({
          set: (values: Row) => ({
            where: () => ({
              returning: async () => {
                txUpdates.push({ table, set: values });
                return table === users && opts.claimSucceeds
                  ? [{ id: USER_ID }]
                  : [];
              },
              then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
                // Awaiting the where-chain directly (the drivers dual-write,
                // which has no .returning()).
                txUpdates.push({ table, set: values });
                return Promise.resolve([]).then(res, rej);
              },
            }),
          }),
        }),
      };
      return cb(tx);
    },
  );

  return { txUpdates };
}

const jsonRequest = (body: unknown): Request =>
  new Request('http://localhost/api/user/me', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

describe('PATCH /api/user/me — write-once gender (S8 §4.2)', () => {
  it("400 invalid_gender for gender:'unspecified' (explicit code, no write)", async () => {
    installDb({ claimSucceeds: false, path: 'patch' });
    const res = await PATCH(jsonRequest({ gender: 'unspecified' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'invalid_gender' });
  });

  it('a claim from unspecified succeeds: barrier row returned, drivers dual-written', async () => {
    const { txUpdates } = installDb({ claimSucceeds: true, path: 'patch' });
    const res = await PATCH(jsonRequest({ gender: 'female' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ user: { gender: 'female' } });
    // Exactly two tx updates: users (the barrier claim) + drivers (dual-write).
    expect(txUpdates).toHaveLength(2);
    expect(txUpdates[0].table).toBe(users);
    expect(txUpdates[0].set.gender).toBe('female');
    expect(txUpdates[1].table).toBe(drivers);
    expect(txUpdates[1].set.gender).toBe('female');
  });

  it('400 gender_already_set when the barrier matches no row (race loser) — no dual-write', async () => {
    const { txUpdates } = installDb({ claimSucceeds: false, path: 'patch' });
    const res = await PATCH(jsonRequest({ gender: 'female' }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: 'gender_already_set' });
    expect(txUpdates.filter((u) => u.table === drivers)).toHaveLength(0);
  });

  it('400 for a gender outside the enum', async () => {
    installDb({ claimSucceeds: false, path: 'patch' });
    const res = await PATCH(jsonRequest({ gender: 'robot' }));
    expect(res.status).toBe(400);
  });

  it('non-gender patches (name) bypass the gender barrier entirely', async () => {
    const { txUpdates } = installDb({ claimSucceeds: false, path: 'patch' });
    const res = await PATCH(jsonRequest({ name: 'New Name' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.name).toBe('Rider');
    expect(txUpdates.filter((u) => u.table === users)).toHaveLength(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('GET /api/user/me — self gender exposure (S8 §4.2)', () => {
  it("returns the caller's own gender plus the fresh-read feature flags", async () => {
    installDb({ claimSucceeds: false, path: 'get' });
    const res = await GET(new Request('http://localhost/api/user/me'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.gender).toBe('female');
    expect(body.women_only_rides_enabled).toBe(true);
    expect(body.scooter_vehicle_type_enabled).toBe(true);
  });
});
