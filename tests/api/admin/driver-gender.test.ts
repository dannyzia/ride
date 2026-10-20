/**
 * S8b-10 (plan §4.6) — POST /api/admin/driver/gender correction route.
 *   - verification.write RBAC,
 *   - gender_verified stamps ONLY for female + explicit confirmation + an
 *     already APPROVED NID on file (else 422 nid_document_not_approved, and
 *     the NID gate fires BEFORE any write),
 *   - the tx is trigger-safe: the gender write (fires
 *     trg_drivers_gender_reset → flags false) and the verified stamp are two
 *     SEPARATE updates — combined, the trigger would clobber the stamp,
 *   - users.gender stays in sync and every correction is audited in-tx.
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
import { POST } from '@/app/api/admin/driver/gender+api';

type Row = Record<string, unknown>;

const DRIVER_ID = '33333333-3333-4333-8333-333333333333';
const DRIVER_USER_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Selects are consumed in call order:
 *   1 driver lookup, 2 NID lookup (only when the verify gate is reached).
 */
function installDb(opts: {
  driverRow: Row | null;
  nidRows: Row[];
}): { txUpdates: { table: unknown; set: Row }[]; auditInserts: Row[] } {
  jest.clearAllMocks();
  (requireAdminPermission as jest.Mock).mockImplementation(
    () => jest.fn(async () => ({ dbUser: { id: 'admin-1' } })),
  );
  const txUpdates: { table: unknown; set: Row }[] = [];
  const auditInserts: Row[] = [];
  const selectQueue: Row[][] = [
    opts.driverRow ? [opts.driverRow] : [],
    opts.nidRows,
  ];

  (db.select as jest.Mock).mockImplementation(() => {
    const rows = selectQueue.shift() ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  });

  (db.transaction as jest.Mock).mockImplementation(
    async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: (table: unknown) => ({
          set: (values: Row) => ({
            where: async () => {
              txUpdates.push({ table, set: values });
              return [];
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

const DRIVER: Row = {
  id: DRIVER_ID,
  user_id: DRIVER_USER_ID,
  gender: 'unspecified',
  gender_verified: false,
};

const jsonRequest = (body: unknown): Request =>
  new Request('http://localhost/api/admin/driver/gender', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const VALID = {
  driver_id: DRIVER_ID,
  gender: 'female',
  gender_confirmed: true,
  reason: 'NID verified at depot — declared male on signup by mistake',
};

describe('POST /api/admin/driver/gender — correction + verification stamp (S8 §4.6)', () => {
  it('female + confirmed + approved NID: corrects, stamps verified SEPARATELY, syncs users, audits', async () => {
    const { txUpdates, auditInserts } = installDb({
      driverRow: DRIVER,
      nidRows: [{ id: 'doc-1' }],
    });
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      driver_id: DRIVER_ID,
      gender: 'female',
      gender_verified: true,
    });
    // 3 updates + 1 audit insert: drivers.gender, drivers.gender_verified
    // (separate — the trigger from step 1 must not clobber it), users.gender.
    expect(txUpdates).toHaveLength(3);
    expect(txUpdates[0]).toMatchObject({ table: drivers, set: { gender: 'female' } });
    expect(txUpdates[0].set.gender_verified).toBeUndefined();
    expect(txUpdates[1]).toMatchObject({ table: drivers, set: { gender_verified: true } });
    expect(txUpdates[1].set.gender).toBeUndefined();
    expect(txUpdates[2]).toMatchObject({ table: users, set: { gender: 'female' } });
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].table).toBe(auditLogs);
    expect(auditInserts[0].action).toBe('driver_gender_corrected');
    expect(auditInserts[0].old_value).toEqual({ gender: 'unspecified', gender_verified: false });
    expect(auditInserts[0].new_value).toMatchObject({ gender: 'female', gender_verified: true });
  });

  it('422 nid_document_not_approved when verification is wanted without an approved NID — NO writes', async () => {
    const { txUpdates, auditInserts } = installDb({ driverRow: DRIVER, nidRows: [] });
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ error: 'nid_document_not_approved' });
    expect(txUpdates).toHaveLength(0);
    expect(auditInserts).toHaveLength(0);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('male correction with confirmation needs NO NID (verification is not stamped)', async () => {
    const { txUpdates } = installDb({ driverRow: DRIVER, nidRows: [] });
    const res = await POST(
      jsonRequest({ ...VALID, gender: 'male' }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      driver_id: DRIVER_ID,
      gender: 'male',
      gender_verified: false,
    });
    // No NID select consumed (queue still holds it), and no verified stamp.
    expect(txUpdates).toHaveLength(2);
    expect(txUpdates.filter((u) => 'gender_verified' in u.set)).toHaveLength(0);
  });

  it('female WITHOUT explicit confirmation never verifies and needs no NID', async () => {
    const { txUpdates } = installDb({ driverRow: DRIVER, nidRows: [] });
    const res = await POST(jsonRequest({ ...VALID, gender_confirmed: false }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ gender_verified: false });
    expect(txUpdates.filter((u) => 'gender_verified' in u.set)).toHaveLength(0);
  });

  it('404 driver_not_found — no tx', async () => {
    installDb({ driverRow: null, nidRows: [] });
    const res = await POST(jsonRequest(VALID));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: 'driver_not_found' });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('400s gender outside the enum / a short rationale', async () => {
    installDb({ driverRow: DRIVER, nidRows: [] });
    expect((await POST(jsonRequest({ ...VALID, gender: 'unspecified' }))).status).toBe(400);
    expect((await POST(jsonRequest({ ...VALID, reason: 'ok' }))).status).toBe(400);
  });

  it('401/403 propagate from the RBAC guard', async () => {
    for (const status of [401, 403]) {
      installDb({ driverRow: DRIVER, nidRows: [] });
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
