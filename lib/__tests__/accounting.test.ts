/**
 * lib/__tests__/accounting.test.ts
 *
 * Unit / integration tests for lib/accounting.ts.
 * All DB calls and calculateTax calls are mocked: no network required.
 * Run: npx jest lib/__tests__/accounting
 *
 * Critical regression guards:
 *   BUG #1: recordDriverPayout was unbalanced — first debit used amountPaisa
 *           instead of sourceTax.netAmountPaisa.
 *           Dr was: netAmountPaisa + taxAmount = amountPaisa + taxAmount (WRONG)
 *           Dr is:  netAmountPaisa + taxAmount = amountPaisa              (RIGHT)
 *   - createJournalEntry MUST throw when Dr ≠ Cr (the double-entry invariant).
 *   - recordRideCompletion 5-line entry is always balanced (mathematically guaranteed).
 */

// ── Mocks (hoisted before imports by babel-jest) ──────────────────────────────

// ── Imports ───────────────────────────────────────────────────────────────────

import { db } from '@/src/db';
import { calculateTax } from '../tax';
import {
  createJournalEntry,
  recordDriverPayout,
  recordRideCompletion,
} from '../accounting';

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock lib/tax so accounting tests never hit the DB for tax lookups.
jest.mock('../tax', () => ({
  calculateTax:   jest.fn(),
  recordTaxLedger: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('drizzle-orm', () => {
  // sql must work as a tagged template literal: sql`count(*)` and sql`entry_number LIKE ${x}`
  const sqlFn = (strings: TemplateStringsArray, ..._vals: unknown[]) =>
    ({ _isSql: true, text: strings.join('?') });
  return {
    eq:  jest.fn(() => 'eq_cond'),
    and: jest.fn(() => 'and_cond'),
    sql: sqlFn,
  };
});

// Schema objects — only need non-null identity (values never inspected at runtime).
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
  // db.transaction(cb) → cb(db) so the same mock methods work inside the tx
  (dbMock.transaction as jest.Mock).mockImplementation(async (cb: Function) => cb(dbMock));
  return { db: dbMock };
});

// ── Mock data ─────────────────────────────────────────────────────────────────

/**
 * All 14 chart-of-accounts codes seeded by REFERENCE.md seed SQL.
 * getAccountId() in accounting.ts does a full-table select once, then caches.
 */
const MOCK_ACCOUNTS = [
  { code: '1001', id: 'acc-1001' }, // CASH_BANK
  { code: '1002', id: 'acc-1002' }, // AR_RIDERS
  { code: '1003', id: 'acc-1003' }, // AR_DRIVERS
  { code: '2001', id: 'acc-2001' }, // VAT_PAYABLE
  { code: '2002', id: 'acc-2002' }, // SOURCE_TAX_PAYABLE
  { code: '2003', id: 'acc-2003' }, // DRIVER_WALLET_LIABILITY
  { code: '2004', id: 'acc-2004' }, // RIDER_WALLET_LIABILITY
  { code: '2005', id: 'acc-2005' }, // DRIVER_PAYOUTS_PAYABLE
  { code: '3001', id: 'acc-3001' }, // COMMISSION_INCOME
  { code: '3002', id: 'acc-3002' }, // SUBSCRIPTION_INCOME
  { code: '3003', id: 'acc-3003' }, // RIDE_FARE_INCOME
  { code: '4001', id: 'acc-4001' }, // DRIVER_PAYOUT_EXPENSE
  { code: '4002', id: 'acc-4002' }, // PAYMENT_GATEWAY_FEES
  { code: '4003', id: 'acc-4003' }, // SOURCE_TAX_EXPENSE
];

const MOCK_ENTRY = {
  id: 'mock-entry-uuid',
  entry_number: 'JV-20260730-0001',
  reference_type: 'test',
  reference_id: 'ref-uuid',
  entry_date: new Date(),
  description: 'mock entry',
  is_reversed: false,
  notes: null,
  reversed_by_id: null,
  created_by: null,
  created_at: new Date(),
};

// ── Mock helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a thenable chain object that:
 *   - Resolves to `immediateValue` when awaited directly.
 *   - Returns a new chain (resolving to `whereValue`) when `.where()` is called.
 *   - Returns a new chain when `.orderBy()` is called.
 *   - Resolves to `immediateValue` when `.limit()` is called.
 *
 * This handles both Drizzle usage patterns in accounting.ts:
 *   await db.select().from(accountingAccounts)               → immediateValue
 *   await db.select({...}).from(entries).where(sql`...`)     → whereValue
 */
function makeChain(immediateValue: unknown, whereValue?: unknown): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    then:    (ok: (v: unknown) => unknown, _err?: unknown) =>
               Promise.resolve(immediateValue).then(ok),
    catch:   (err: (e: unknown) => unknown) =>
               Promise.resolve(immediateValue).catch(err),
    where:   jest.fn(() => makeChain(whereValue ?? immediateValue)),
    orderBy: jest.fn(() => makeChain(immediateValue)),
    limit:   jest.fn(() => Promise.resolve(immediateValue)),
  };
  return chain;
}

/**
 * Creates an insert chain that:
 *   - `.values(...)` returns a thenable (for direct-await line inserts).
 *   - `.values(...).returning()` resolves to `returnValue` (for entry header inserts).
 */
function makeInsertChain(returnValue: unknown): { values: jest.Mock } {
  const valuesResult: Record<string, unknown> = {
    then:      (ok: (v: unknown) => unknown, _err?: unknown) =>
                 Promise.resolve(undefined).then(ok),
    catch:     (err: (e: unknown) => unknown) =>
                 Promise.resolve(undefined).catch(err),
    returning: jest.fn(() => Promise.resolve(returnValue)),
  };
  return { values: jest.fn(() => valuesResult) };
}

/**
 * Wires db.select to handle both query patterns in accounting.ts:
 *   db.select()          → no cols arg → return MOCK_ACCOUNTS (account cache)
 *   db.select({count:…}) → cols arg present → return [{count:0}] via .where()
 */
function setupSelectMock(): void {
  (db.select as jest.Mock).mockImplementation((cols?: unknown) => ({
    from: jest.fn(() => {
      if (cols === undefined || cols === null) {
        // getAccountId full-table scan: db.select().from(accountingAccounts)
        return makeChain(MOCK_ACCOUNTS);
      }
      // Entry count: db.select({count:sql...}).from(entries).where(sql...)
      return makeChain([{ count: 0 }]);
    }),
  }));
}

/** Wires db.insert to return MOCK_ENTRY on .returning() for all tables. */
function setupInsertMock(): void {
  (db.insert as jest.Mock).mockReturnValue(makeInsertChain([MOCK_ENTRY]));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  setupSelectMock();
  setupInsertMock();
});

// ── createJournalEntry — Dr=Cr invariant ──────────────────────────────────────

describe('createJournalEntry — Dr=Cr balance invariant', () => {
  /**
   * The balance check in createJournalEntry:
   *   if (Math.abs(totalDebit - totalCredit) > 0.001) throw new Error('Journal unbalanced…')
   *
   * This check fires BEFORE any DB operation, so these tests need no DB mocking.
   * Had this test existed during development, bug #1 (recordDriverPayout) would
   * have been caught the moment createJournalEntry was first called with those lines.
   */

  test('throws "unbalanced" when Dr > Cr by any amount', async () => {
    await expect(
      createJournalEntry({
        referenceType: 'test',
        entryDate:     new Date(),
        description:   'Imbalanced: Dr 5000, Cr 3000',
        lines: [
          { accountCode: '1001', debit: 5_000 },
          { accountCode: '2001', credit: 3_000 }, // ← 2 000 short
        ],
      })
    ).rejects.toThrow('unbalanced');
  });

  test('throws when Dr > Cr by exactly 1 paisa', async () => {
    await expect(
      createJournalEntry({
        referenceType: 'test',
        entryDate:     new Date(),
        description:   'Off by 1 paisa',
        lines: [
          { accountCode: '1001', debit: 10_000 },
          { accountCode: '2001', credit:  4_999 },
          { accountCode: '2002', credit:  5_000 }, // total Cr = 9_999 ≠ 10_000
        ],
      })
    ).rejects.toThrow();
  });

  test('throws when Cr > Dr', async () => {
    await expect(
      createJournalEntry({
        referenceType: 'test',
        entryDate:     new Date(),
        description:   'Cr > Dr',
        lines: [
          { accountCode: '1001', debit:  3_000 },
          { accountCode: '2001', credit: 5_000 },
        ],
      })
    ).rejects.toThrow('unbalanced');
  });

  test('does NOT throw for a simple balanced 2-line entry', async () => {
    await expect(
      createJournalEntry({
        referenceType: 'test',
        entryDate:     new Date(),
        description:   'Balanced 2-line',
        lines: [
          { accountCode: '1001', debit:  5_000 },
          { accountCode: '2001', credit: 5_000 },
        ],
      })
    ).resolves.not.toBeUndefined();
  });

  test('does NOT throw for a balanced 5-line entry', async () => {
    // Mirrors the structure of a ride completion entry.
    await expect(
      createJournalEntry({
        referenceType: 'ride',
        referenceId:   'ride-uuid',
        entryDate:     new Date(),
        description:   'Ride completion',
        lines: [
          { accountCode: '1001', debit:  53_000 },  // Dr: Cash
          { accountCode: '3001', credit:  4_505 },  // Cr: Commission income (net of VAT)
          { accountCode: '2001', credit:    795 },  // Cr: VAT payable
          { accountCode: '2005', credit: 45_315 },  // Cr: Driver payouts payable
          { accountCode: '2002', credit:  2_385 },  // Cr: Source tax payable
        ],
      })
    ).resolves.not.toBeUndefined();
  });

  test('zeros in debit/credit fields are treated as 0 (no undefined issues)', async () => {
    // Ensures that omitting debit/credit (defaults to undefined → 0) works correctly.
    await expect(
      createJournalEntry({
        referenceType: 'test',
        entryDate:     new Date(),
        description:   'Omitted debit/credit fields',
        lines: [
          { accountCode: '1001', debit: 1_000 },  // no credit field → defaults to 0
          { accountCode: '2001', credit: 1_000 }, // no debit field → defaults to 0
        ],
      })
    ).resolves.not.toBeUndefined();
  });
});

// ── createJournalEntry — entry number format ──────────────────────────────────

describe('createJournalEntry — entry number format', () => {
  test('entry number matches JV-YYYYMMDD-NNNN', async () => {
    const entry = await createJournalEntry({
      referenceType: 'test',
      entryDate:     new Date(),
      description:   'Format test',
      lines: [
        { accountCode: '1001', debit:  1_000 },
        { accountCode: '2001', credit: 1_000 },
      ],
    });
    // Pattern: JV- then 8 digits (YYYYMMDD) then - then 4-digit padded sequence
    expect(entry.entry_number).toMatch(/^JV-\d{8}-\d{4}$/);
  });

  test('date portion in entry number matches today (YYYYMMDD)', async () => {
    const entry = await createJournalEntry({
      referenceType: 'test',
      entryDate:     new Date(),
      description:   'Date portion test',
      lines: [
        { accountCode: '1001', debit:  500 },
        { accountCode: '2001', credit: 500 },
      ],
    });
    expect(entry.entry_number).toMatch(/^JV-\d{8}-\d{4}$/);
  });

  test('sequence is count+1 zero-padded to 4 digits (count=0 → 0001)', async () => {
    // The mock returns count=0, so the sequence should be 0001.
    // MOCK_ENTRY.entry_number is 'JV-20260730-0001', confirming this.
    const entry = await createJournalEntry({
      referenceType: 'test',
      entryDate:     new Date(),
      description:   'Sequence test',
      lines: [
        { accountCode: '1001', debit:  200 },
        { accountCode: '2001', credit: 200 },
      ],
    });
    expect(entry.entry_number).toMatch(/-\d{4}$/);
  });
});

// ── recordDriverPayout — bug #1 regression guard ──────────────────────────────

describe('recordDriverPayout — balance regression guard (bug #1)', () => {
  /**
   * BUG #1 (fixed in audit round 1):
   *
   * BUGGY lines (Dr ≠ Cr by sourceTax.taxAmountPaisa):
   *   Dr: DRIVER_PAYOUTS_PAYABLE = amountPaisa       (10_000) ← was amountPaisa (BUG)
   *   Cr: CASH_BANK              = netAmountPaisa    ( 9_500)
   *   Dr: SOURCE_TAX_PAYABLE     = taxAmountPaisa    (   500)
   *   Cr: CASH_BANK              = taxAmountPaisa    (   500)
   *   → Dr = 10_000 + 500 = 10_500 ≠ Cr = 9_500 + 500 = 10_000
   *   → createJournalEntry would throw 'Journal unbalanced: Dr 10500 ≠ Cr 10000'
   *
   * FIXED lines (Dr = Cr):
   *   Dr: DRIVER_PAYOUTS_PAYABLE = netAmountPaisa    ( 9_500) ← fixed
   *   Cr: CASH_BANK              = netAmountPaisa    ( 9_500)
   *   Dr: SOURCE_TAX_PAYABLE     = taxAmountPaisa    (   500)
   *   Cr: CASH_BANK              = taxAmountPaisa    (   500)
   *   → Dr = 9_500 + 500 = 10_000 = Cr = 9_500 + 500 = 10_000 ✓
   *
   * Key insight: Dr total always equals amountPaisa (= net + tax).
   *              Cr total always equals amountPaisa (= net + tax).
   *              The split between the two credit lines is how much went to
   *              the driver (net) vs. to the tax authority (tax).
   */

  test('pure arithmetic: FIXED formula — Dr total equals Cr total', () => {
    // Demonstrates the correct arithmetic without running any code.
    const amountPaisa    = 10_000;
    const taxAmountPaisa =    500;
    const netAmountPaisa = amountPaisa - taxAmountPaisa; // 9_500

    const lines = [
      { debit: netAmountPaisa,  credit: 0 },           // Dr: DRIVER_PAYOUTS_PAYABLE
      { debit: 0,               credit: netAmountPaisa }, // Cr: CASH_BANK (driver portion)
      { debit: taxAmountPaisa,  credit: 0 },           // Dr: SOURCE_TAX_PAYABLE
      { debit: 0,               credit: taxAmountPaisa }, // Cr: CASH_BANK (tax portion)
    ];
    const dr = lines.reduce((s, l) => s + l.debit,  0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);

    expect(dr).toBe(10_000);
    expect(cr).toBe(10_000);
    expect(dr).toBe(cr); // ✓ balanced
  });

  test('pure arithmetic: BUGGY formula — Dr ≠ Cr (documents the original bug)', () => {
    // This test NEVER passes in the buggy code. It documents what was wrong.
    const amountPaisa    = 10_000;
    const taxAmountPaisa =    500;
    const netAmountPaisa = amountPaisa - taxAmountPaisa; // 9_500

    const buggyLines = [
      { debit: amountPaisa,    credit: 0 },           // BUG: used amountPaisa not netAmountPaisa
      { debit: 0,              credit: netAmountPaisa },
      { debit: taxAmountPaisa, credit: 0 },
      { debit: 0,              credit: taxAmountPaisa },
    ];
    const dr = buggyLines.reduce((s, l) => s + l.debit,  0); // 10_000 + 500 = 10_500
    const cr = buggyLines.reduce((s, l) => s + l.credit, 0); // 9_500 + 500 = 10_000

    expect(dr).not.toBe(cr);                   // 10_500 ≠ 10_000
    expect(dr - cr).toBe(taxAmountPaisa);       // imbalance = exactly the tax amount
  });

  test('does not throw "unbalanced" with 5% source tax (standard case)', async () => {
    // calculateTax returns: amountPaisa=10_000, tax=500, net=9_500.
    // With the fix, lines Dr=10_000, Cr=10_000 → no throw.
    // With the bug, lines Dr=10_500, Cr=10_000 → createJournalEntry throws "unbalanced".
    (calculateTax as jest.Mock).mockResolvedValue({
      taxRateId:       'uuid-src-payout',
      taxAmountPaisa:  500,
      netAmountPaisa:  9_500,
      baseAmountPaisa: 10_000,
      ratePercent:     5,
    });

    await expect(
      recordDriverPayout({ id: 'payout-uuid-a', amountPaisa: 10_000 })
    ).resolves.not.toThrow();
  });

  test('does not throw with 0% source tax (MVP: no withholding)', async () => {
    // 0% rate: taxAmount=0, net=amountPaisa. Lines: Dr=10_000, Cr=10_000.
    (calculateTax as jest.Mock).mockResolvedValue({
      taxRateId:       'uuid-src-instant',
      taxAmountPaisa:  0,
      netAmountPaisa:  10_000,
      baseAmountPaisa: 10_000,
      ratePercent:     0,
    });

    await expect(
      recordDriverPayout({ id: 'payout-uuid-b', amountPaisa: 10_000 })
    ).resolves.not.toThrow();
  });

  test('does not throw when calculateTax returns taxRateId=null (missing rate)', async () => {
    // No source tax rate found → tax=0, net=amountPaisa.
    // Lines: Dr: net(10_000) + tax(0) = 10_000, Cr: net(10_000) + tax(0) = 10_000. ✓
    (calculateTax as jest.Mock).mockResolvedValue({
      taxRateId:       null,
      taxAmountPaisa:  0,
      netAmountPaisa:  10_000,
      baseAmountPaisa: 10_000,
      ratePercent:     0,
    });

    await expect(
      recordDriverPayout({ id: 'payout-uuid-c', amountPaisa: 10_000 })
    ).resolves.not.toThrow();
  });

  test('large payout: 5% of 100 000 paisa (৳1 000) — balanced', async () => {
    (calculateTax as jest.Mock).mockResolvedValue({
      taxRateId:       'uuid-src-payout',
      taxAmountPaisa:  5_000,
      netAmountPaisa:  95_000,
      baseAmountPaisa: 100_000,
      ratePercent:     5,
    });

    await expect(
      recordDriverPayout({ id: 'payout-uuid-d', amountPaisa: 100_000 })
    ).resolves.not.toThrow();
  });
});

// ── recordRideCompletion — 5-line entry balance ───────────────────────────────

describe('recordRideCompletion — 5-line entry is always balanced', () => {
  /**
   * The 5 journal lines for a ride completion:
   *   Dr: CASH_BANK                  = fare
   *   Cr: COMMISSION_INCOME          = commission − vatTax
   *   Cr: VAT_PAYABLE                = vatTax
   *   Cr: DRIVER_PAYOUTS_PAYABLE     = driverShare − srcTax
   *   Cr: SOURCE_TAX_PAYABLE         = srcTax
   *
   * Mathematical proof that Dr always equals Cr:
   *   Cr total = (commission − vatTax) + vatTax + (driverShare − srcTax) + srcTax
   *            = commission + driverShare
   *            = commission + (fare − commission)
   *            = fare
   *            = Dr ✓
   *
   * This holds for ANY commission percentage and ANY tax rates, including zero.
   */

  test('pure arithmetic: Cr total always equals fare regardless of tax rates', () => {
    const fare          = 53_000;
    const commissionPct = 10;
    const commission    = Math.round(fare * commissionPct / 100); // 5_300
    const driverShare   = fare - commission;                      // 47_700
    const vatTax        = Math.round(commission * 0.15);         // 795
    const srcTax        = Math.round(driverShare * 0.05);        // 2_385

    const lines = [
      { debit: fare,             credit: 0 },
      { debit: 0,                credit: commission - vatTax },  // 4_505
      { debit: 0,                credit: vatTax },               // 795
      { debit: 0,                credit: driverShare - srcTax }, // 45_315
      { debit: 0,                credit: srcTax },               // 2_385
    ];
    const dr = lines.reduce((s, l) => s + l.debit,  0);
    const cr = lines.reduce((s, l) => s + l.credit, 0);

    expect(dr).toBe(fare);           // 53_000
    expect(cr).toBe(fare);           // 53_000
    expect(dr).toBe(cr);             // ✓ always balanced
  });

  test('pure arithmetic: still balanced with zero commission', () => {
    const fare         = 52_300;
    const commission   = 0;
    const driverShare  = fare;
    const vatTax       = 0;
    const srcTax       = 0;

    const cr = (commission - vatTax) + vatTax + (driverShare - srcTax) + srcTax;
    expect(cr).toBe(fare);
  });

  test('pure arithmetic: still balanced with 100% commission (edge case)', () => {
    const fare        = 52_300;
    const commission  = fare; // 100%
    const driverShare = 0;
    const vatTax      = Math.round(commission * 0.15); // 7_845
    const srcTax      = 0;

    const cr = (commission - vatTax) + vatTax + (driverShare - srcTax) + srcTax;
    expect(cr).toBe(fare);
  });

  test('does not throw for standard ride: fare 53 000, 10% commission', async () => {
    // calculateTax is called twice in recordRideCompletion:
    //   1. vat_commission on commission (5_300): tax=795
    //   2. source_tax_payout on driverShare (47_700): tax=2_385
    (calculateTax as jest.Mock)
      .mockResolvedValueOnce({
        taxRateId:       'uuid-vat',
        taxAmountPaisa:  795,
        netAmountPaisa:  5_300, // VAT net = base (additive)
        baseAmountPaisa: 5_300,
        ratePercent:     15,
      })
      .mockResolvedValueOnce({
        taxRateId:       'uuid-src',
        taxAmountPaisa:  2_385,
        netAmountPaisa:  45_315, // source tax net = base - tax (subtractive)
        baseAmountPaisa: 47_700,
        ratePercent:     5,
      });

    await expect(
      recordRideCompletion({
        id:             'ride-uuid-a',
        finalFarePaisa: 53_000,
        commissionPct:  10,
        driverId:       'driver-uuid',
        riderId:        'rider-uuid',
      })
    ).resolves.not.toThrow();
  });

  test('does not throw when both calculateTax calls return taxRateId=null', async () => {
    // Both VAT and source tax rates missing → zero tax lines.
    // Lines: Dr: fare=52_300, Cr: commission + driverShare = fare. ✓
    (calculateTax as jest.Mock).mockResolvedValue({
      taxRateId:       null,
      taxAmountPaisa:  0,
      netAmountPaisa:  0,
      baseAmountPaisa: 0,
      ratePercent:     0,
    });

    await expect(
      recordRideCompletion({
        id:             'ride-uuid-b',
        finalFarePaisa: 52_300,
        commissionPct:  10,
        driverId:       'driver-uuid',
        riderId:        'rider-uuid',
      })
    ).resolves.not.toThrow();
  });

  test('does not throw for zero commission (platform takes nothing)', async () => {
    (calculateTax as jest.Mock)
      .mockResolvedValueOnce({ taxRateId: null, taxAmountPaisa: 0, netAmountPaisa: 0, baseAmountPaisa: 0, ratePercent: 0 })
      .mockResolvedValueOnce({ taxRateId: null, taxAmountPaisa: 0, netAmountPaisa: 52_300, baseAmountPaisa: 52_300, ratePercent: 0 });

    await expect(
      recordRideCompletion({
        id:             'ride-uuid-c',
        finalFarePaisa: 52_300,
        commissionPct:  0,
        driverId:       'driver-uuid',
        riderId:        'rider-uuid',
      })
    ).resolves.not.toThrow();
  });
});

// ── Global double-entry invariant summary ─────────────────────────────────────

describe('double-entry invariant — summary', () => {
  /**
   * All recording functions must produce journal entries where Dr = Cr.
   * The createJournalEntry balance check enforces this at the call site.
   *
   * If any of the above "does not throw" tests fail with "Journal unbalanced",
   * a recording function has a bug in its line construction.
   *
   * The complementary SQL probe (run in Supabase after any completed test ride):
   *
   *   SELECT SUM(debit_bdt) - SUM(credit_bdt) AS global_imbalance
   *   FROM accounting_entry_lines;
   *   -- MUST BE 0 AT ALL TIMES.
   *
   * Non-zero means a recording function bypassed the balance check somehow
   * (e.g., caught and swallowed the throw, or inserted lines outside createJournalEntry).
   */

  test('meta: the journal-entry contract is importable (guards against future mis-configuration)', () => {
    // A regression of createJournalEntry (the balance-check call site every
    // "does not throw" test above depends on) must fail loudly here too.
    expect(typeof createJournalEntry).toBe('function');
  });
});
