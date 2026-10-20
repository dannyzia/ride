/**
 * S8b-10 (plan §4.2/§4.6) — POST /api/admin/user/gender correction route.
 *   - staff.manage RBAC (401/403 propagation),
 *   - one transaction: users.gender update + drivers.gender dual-write (fires
 *     trg_drivers_gender_reset → admin re-verification path) + audit entry,
 *   - 'unspecified' is NOT an accepted correction value (Zod 400 — the enum
 *     is male/female/other only),
 *   - 404 on an unknown user, and the response reports driver_rows_updated
 *     so the operator sees the blast radius.
 */
/* eslint-disable import/first */
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), transaction: jest.fn() },
}));
jest.mock('@/lib/adminRbac', () => ({
  requireAdminPermission: jest.fn(),
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { db } from '@/src/db';
import { users, drivers, auditLogs } from '@/src/db/schema';
import { requireAdminPermission } from '@/lib/adminRbac';
import { POST } from '@/app/api/admin/user/gender+api';

type Row = Record<string, unknown>;

const USER_ID = '11111111-1111-4111-a111-111111111111';

function installDb(opts: { userRow: Row | null; driverRowsUpdated: number }): {
  txUpdates: { table: unknown; set: Row }[];
  auditInserts: Row[];
} {
  jest.clearAllMocks();
  // Default RBAC: an authorized staff.manage admin.
  (requireAdminPermission as jest.Mock).mockImplementation(
    () => jest.fn(async () => ({ dbUser: { id: 'admin-1' } })),
  );
  const txUpdates: { table: unknown; set: Row }[] = [];
  const auditInserts: Row[] = [];

  (db.select as jest.Mock).mockImplementation(() => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => (opts.userRow ? [opts.userRow] : []),
    };
    return chain;
  });

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: (table: unknown) => ({
          set: (values: Row) => ({
            where: () => {
              const chain = {
                returning: async () => {
                  txUpdates.push({ table, set: values });
                  return table === drivers
                    ? Array.from({ length: opts.driverRowsUpdated }, (_, i) => ({ id: `d${i}` }))
                    : [];
                },
                then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
                  txUpdates.push({ table, set: values });
                  return Promise.resolve([]).then(res, rej);
                },
              };
              return chain;
            },
          }),
        }),
        insert: (table: unknown) => ({
          values: async (vals: Row) => {
            auditInserts.push({ table, ...vals });
            return [];
          },
        }),
      };
      return cb(tx);
    },
  );

  return { txUpdates, auditInserts };
}

const jsonRequest = (body: unknown): Request =>
  new Request('http://localhost/api/admin/user/gender', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const VALID = { user_id: USER_ID, gender: 'female', reason: 'NID matches — self-declared wrong at signup' };

describe('POST /api/admin/user/gender — correction route (S8 §4.2)', () => {
  it('corrects in one tx: users + drivers dual-write + audit entry', async () => {
    const { txUpdates, auditInserts } = installDb({
      userRow: { id: USER_ID, gender: 'unspecified' },
      driverRowsUpdated: 1,
    });
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      user_id: USER_ID,
      gender: 'female',
      driver_rows_updated: 1,
    });
    expect(txUpdates).toHaveLength(2);
    expect(txUpdates[0].table).toBe(users);
    expect(txUpdates[0].set.gender).toBe('female');
    expect(txUpdates[1].table).toBe(drivers);
    expect(txUpdates[1].set.gender).toBe('female');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].table).toBe(auditLogs);
    expect(auditInserts[0].action).toBe('user_gender_corrected');
    expect(auditInserts[0].old_value).toEqual({ gender: 'unspecified' });
    expect(auditInserts[0].new_value).toMatchObject({ gender: 'female', driver_rows_updated: 1 });
  });

  it('reports driver_rows_updated=0 for a rider-only user (no drivers row)', async () => {
    const { txUpdates } = installDb({ userRow: { id: USER_ID, gender: 'male' }, driverRowsUpdated: 0 });
    const res = await POST(jsonRequest({ ...VALID, gender: 'other' }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ driver_rows_updated: 0 });
    // The drivers update still runs (a rider may gain a drivers row later) but
    // touches zero rows.
    expect(txUpdates.filter((u) => u.table === drivers)).toHaveLength(1);
  });

  it('404 user_not_found — no tx, no writes', async () => {
    const { txUpdates, auditInserts } = installDb({ userRow: null, driverRowsUpdated: 0 });
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: 'user_not_found' });
    expect(txUpdates).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects gender outside male/female/other (no unspecified self-reset through admin either)', async () => {
    installDb({ userRow: { id: USER_ID, gender: 'male' }, driverRowsUpdated: 0 });
    const res = await POST(jsonRequest({ ...VALID, gender: 'unspecified' }));
    expect(res.status).toBe(400);
  });

  it('requires a non-trivial audit rationale (min 5 chars)', async () => {
    installDb({ userRow: { id: USER_ID, gender: 'male' }, driverRowsUpdated: 0 });
    const res = await POST(jsonRequest({ ...VALID, reason: 'err' }));
    expect(res.status).toBe(400);
  });

  it('401/403 propagate from the RBAC guard', async () => {
    for (const status of [401, 403]) {
      (requireAdminPermission as jest.Mock).mockImplementation(() =>
        jest.fn(async () => {
          throw { status };
        }),
      );
      const res = await POST(jsonRequest(VALID));
      expect(res.status).toBe(status);
    }
  });
});
