/**
 * P0-2/P0-3 (gap ledger): accounting journal entries for tips (V-4) and admin
 * refunds (U-3) — the two record* helpers the existing accounting.test.ts
 * predates. Regression guards:
 *  - V-4: a tip settles from the RIDER WALLET LIABILITY (2004), NOT the bank
 *    account — the tip+api route debits the rider wallet, so the journal must
 *    balance against the liability, not cash.
 *  - U-3: an admin refund credits the rider wallet liability with the
 *    balancing debit on ADMIN_ADJUSTMENT_EXPENSE (4004), not the bank.
 *  - zero/negative tips book nothing.
 * Same mock scaffolding as accounting.test.ts (account cache via the
 * no-cols select, entry header insert .returning(), line inserts thenable).
 */
/* eslint-disable import/first */

// ── Mocks (hoisted before imports by babel-jest) ──────────────────────────────

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../tax', () => ({
  calculateTax:    jest.fn(),
  recordTaxLedger: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('drizzle-orm', () => {
  const sqlFn = (strings: TemplateStringsArray, ..._vals: unknown[]) =>
    ({ _isSql: true, text: strings.join('?') });
  return {
    eq:  jest.fn(() => 'eq_cond'),
    and: jest.fn(() => 'and_cond'),
    sql: sqlFn,
  };
});

jest.mock('@/src/db/schema', () => ({
  accountingAccounts:   { __table: 'accounting_accounts' },
  accountingEntries:    { __table: 'accounting_entries' },
  accountingEntryLines: { __table: 'accounting_entry_lines' },
  riderSubscriptions:   { __table: 'rider_subscriptions' },
}));

jest.mock('@/src/db', () => {
  const dbMock = {
    select: jest.fn(),
    insert: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn(),
  };
  (dbMock.transaction as jest.Mock).mockImplementation(async (cb: Function) => cb(dbMock));
  return { db: dbMock };
});

import { db } from '@/src/db';
import { accountingEntries, accountingEntryLines } from '@/src/db/schema';
import { recordTip, recordAdminRefund } from '../accounting';

// Full chart of accounts including 4004 — the existing accounting.test.ts
// MOCK_ACCOUNTS predates the admin-refund account and omits it.
const MOCK_ACCOUNTS = [
  { code: '1001', id: 'acc-1001' }, // CASH_BANK
  { code: '2004', id: 'acc-2004' }, // RIDER_WALLET_LIABILITY
  { code: '2005', id: 'acc-2005' }, // DRIVER_PAYOUTS_PAYABLE
  { code: '4004', id: 'acc-4004' }, // ADMIN_ADJUSTMENT_EXPENSE
];

const MOCK_ENTRY = { id: 'mock-entry-uuid', entry_number: 'JV-20260905-0001' };

interface InsertRecord {
  table: unknown;
  values: unknown;
}

const inserts: InsertRecord[] = [];

function setupMocks(): void {
  inserts.length = 0;

  (db.select as jest.Mock).mockImplementation((cols?: unknown) => ({
    from: jest.fn(() => {
      const chain: Record<string, unknown> = {
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(cols === undefined || cols === null ? MOCK_ACCOUNTS : [{ count: 0 }]).then(ok),
        where: jest.fn(() => ({
          then: (ok: (v: unknown) => unknown) => Promise.resolve([{ count: 0 }]).then(ok),
          limit: jest.fn(() => Promise.resolve([{ count: 0 }])),
        })),
        limit: jest.fn(() => Promise.resolve(MOCK_ACCOUNTS)),
      };
      return chain;
    }),
  }));

  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: unknown) => {
      inserts.push({ table, values: v });
      return {
        returning: jest.fn(() => Promise.resolve([MOCK_ENTRY])),
        then: (ok: (v: unknown) => unknown) => Promise.resolve(undefined).then(ok),
        catch: (err: (e: unknown) => unknown) => Promise.resolve(undefined).catch(err),
      };
    }),
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMocks();
});

describe('recordTip (V-4 — tips settle from rider wallet liability)', () => {
  test('books Dr RIDER_WALLET_LIABILITY / Cr DRIVER_PAYOUTS_PAYABLE — never the bank', async () => {
    await recordTip({ id: 'ride-1', tipPaisa: 30_000, driverId: 'driver-1', zoneId: 'zone-1' });

    const lines = inserts.filter((i) => i.table === accountingEntryLines);
    expect(lines).toHaveLength(2);
    const byAccount = new Map(lines.map((l) => [(l.values as Record<string, unknown>).account_id, l.values]));

    expect(byAccount.get('acc-2004')).toMatchObject({ debit_bdt: 30_000, credit_bdt: 0 });
    expect(byAccount.get('acc-2005')).toMatchObject({ debit_bdt: 0, credit_bdt: 30_000 });
    // V-4 regression: NO line may touch the bank account for a tip
    expect(byAccount.has('acc-1001')).toBe(false);

    const entryInsert = inserts.find((i) => i.table === accountingEntries);
    expect(entryInsert).toBeDefined();
    expect(entryInsert!.values).toMatchObject({ reference_type: 'tip', reference_id: 'ride-1' });
  });

  test('zero-amount tip books nothing (early return)', async () => {
    await recordTip({ id: 'ride-1', tipPaisa: 0, driverId: 'driver-1' });
    expect(inserts).toHaveLength(0);
  });

  test('negative tip books nothing (defensive)', async () => {
    await recordTip({ id: 'ride-1', tipPaisa: -5, driverId: 'driver-1' });
    expect(inserts).toHaveLength(0);
  });
});

describe('recordAdminRefund (U-3 — refund credits wallet against expense)', () => {
  test('books Dr ADMIN_ADJUSTMENT_EXPENSE / Cr RIDER_WALLET_LIABILITY — never the bank', async () => {
    await recordAdminRefund({ riderId: 'rider-1', amountPaisa: 10_000, reason: 'Fare dispute' });

    const lines = inserts.filter((i) => i.table === accountingEntryLines);
    expect(lines).toHaveLength(2);
    const byAccount = new Map(lines.map((l) => [(l.values as Record<string, unknown>).account_id, l.values]));

    expect(byAccount.get('acc-4004')).toMatchObject({ debit_bdt: 10_000, credit_bdt: 0 });
    expect(byAccount.get('acc-2004')).toMatchObject({ debit_bdt: 0, credit_bdt: 10_000 });
    // U-3 regression: no cash movement on an admin wallet refund
    expect(byAccount.has('acc-1001')).toBe(false);

    const entryInsert = inserts.find((i) => i.table === accountingEntries);
    expect(entryInsert!.values).toMatchObject({
      reference_type: 'admin_refund',
      reference_id: 'rider-1',
    });
  });
});
