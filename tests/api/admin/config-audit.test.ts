/**
 * T-A9: Config audit log on every admin PATCH.
 *
 * Verifies that app/api/admin/config+api.ts inserts a row into
 * config_audit_log before updating platform_config. This ensures
 * every admin config change is auditable with before/after values.
 *
 * The audit log records: config_key, old_value, new_value, admin_id.
 */
/* eslint-disable import/first */
jest.mock('@/lib/adminRbac', () => ({
  requireAdminPermission: jest.fn(() =>
    jest.fn(async () => ({
      supabaseUser: { id: 'admin-uuid-1111' },
      dbUser: { id: 'admin-uuid-1111', role: 'admin' },
    })),
  ),
  isOwner: (u: { role: string }) => u.role === 'owner',
  OWNER_ONLY_CONFIG_KEYS: new Set(['fare_framework_stage']),
  GUARDRAIL_KM_KEYS: new Set(['pickup_free_radius_km_bike']),
  guardrailViolation: () => false,
}));
jest.mock('@/src/db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
}));
jest.mock('@/lib/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/parseBody', () => ({
  parseJsonBody: jest.fn(),
}));

import { db } from '@/src/db';
import { configAuditLog, platformConfig } from '@/src/db/schema';
import { PATCH } from '@/app/api/admin/config+api';
import { parseJsonBody } from '@/lib/parseBody';

let auditInsertValues: Record<string, unknown> | null = null;
let auditInsertCalled = false;

function mockSelect(existingRows: Array<{ key: string; value: string | null }> = []) {
  (db.select as jest.Mock).mockImplementation(() => {
    const promise = Promise.resolve(existingRows);
    return {
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn(() => promise),
          then: promise.then.bind(promise),
          catch: promise.catch.bind(promise),
        })),
      })),
    };
  });
}

function mockInsertAndAudit() {
  auditInsertValues = null;
  auditInsertCalled = false;
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn(async (v: Record<string, unknown>) => {
      if (table === configAuditLog) {
        auditInsertCalled = true;
        auditInsertValues = v;
      }
      return {};
    }),
  }));
  (db.update as jest.Mock).mockImplementation(() => ({
    set: jest.fn(() => ({
      where: jest.fn(() => ({
        returning: jest.fn(async () => [{ key: 'pickup_fee_enabled' }]),
      })),
    })),
  }));
}

function apiRequest(): Request {
  return {
    url: 'http://localhost:8081/api/admin/config',
    headers: { get: () => null },
  } as unknown as Request;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Use keys that exist in ALLOWED_KEYS so the audit path is exercised
const TEST_KEY = 'pickup_fee_enabled';

describe('T-A9 — config audit log on PATCH', () => {
  test('INSERT into config_audit_log happens when updating an allowed key', async () => {
    mockSelect([{ key: TEST_KEY, value: 'false' }]);
    mockInsertAndAudit();
    (parseJsonBody as jest.Mock).mockResolvedValue({
      ok: true,
      data: { updates: [{ key: TEST_KEY, value: 'true' }] },
    });

    await PATCH(apiRequest());

    expect(auditInsertCalled).toBe(true);
    expect(auditInsertValues).toMatchObject({
      config_key: TEST_KEY,
      old_value: 'false',
      new_value: 'true',
      admin_id: 'admin-uuid-1111',
      actor_role: 'admin',
    });
  });

  test('audit log captures old_value=null for new keys', async () => {
    mockSelect([]);
    mockInsertAndAudit();
    // Use a key that's in ALLOWED_KEYS but won't exist in DB
    (parseJsonBody as jest.Mock).mockResolvedValue({
      ok: true,
      data: { updates: [{ key: TEST_KEY, value: 'true' }] },
    });

    await PATCH(apiRequest());

    expect(auditInsertValues).toMatchObject({
      config_key: TEST_KEY,
      old_value: null,
      new_value: 'true',
      actor_role: 'admin',
    });
  });

  test('audit INSERT is called before the UPDATE', async () => {
    const callOrder: string[] = [];
    mockSelect([{ key: TEST_KEY, value: 'old' }]);

    (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
      values: jest.fn(async () => {
        callOrder.push('insert');
        return {};
      }),
    }));

    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => {
        callOrder.push('update');
        return {
          where: jest.fn(() => ({
            returning: jest.fn(async () => [{ key: TEST_KEY }]),
          })),
        };
      }),
    }));

    (parseJsonBody as jest.Mock).mockResolvedValue({
      ok: true,
      data: { updates: [{ key: TEST_KEY, value: 'true' }] },
    });

    await PATCH(apiRequest());

    expect(callOrder).toEqual(['insert', 'update']);
  });

  test('batch PATCH: each key gets its own audit row', async () => {
    const keys = ['pickup_free_radius_km_bike', 'pickup_free_radius_km_cng', 'pickup_free_radius_km_car'];
    const selectCalls: string[] = [];

    (db.select as jest.Mock).mockImplementation(() => {
      const idx = selectCalls.length;
      selectCalls.push(keys[idx] ?? 'unknown');
      const key = keys[idx] ?? keys[0];
      const promise = Promise.resolve([{ key, value: `old_${key}` }]);
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn(() => promise),
            then: promise.then.bind(promise),
            catch: promise.catch.bind(promise),
          })),
        })),
      };
    });

    const insertCalls: Array<{ config_key: string; old_value: string | null; new_value: string | null }> = [];
    (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
      values: jest.fn(async (v: Record<string, unknown>) => {
        if (table === configAuditLog) {
          insertCalls.push(v as typeof insertCalls[number]);
        }
        return {};
      }),
    }));

    (db.update as jest.Mock).mockImplementation(() => ({
      set: jest.fn(() => ({
        where: jest.fn(() => ({
          returning: jest.fn(async () => [{ key: 'some_key' }]),
        })),
      })),
    }));

    (parseJsonBody as jest.Mock).mockResolvedValue({
      ok: true,
      data: { updates: keys.map((k) => ({ key: k, value: '1.5' })) },
    });

    await PATCH(apiRequest());

    expect(insertCalls.length).toBe(3);
    expect(insertCalls.map((c) => c.config_key)).toEqual(keys);
  });
});
