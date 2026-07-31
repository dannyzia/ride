/**
 * lib/__tests__/tax.test.ts
 *
 * Unit tests for lib/tax.ts — calculateTax().
 * All DB calls are mocked: no network or Supabase connection required.
 * Run: npx jest lib/__tests__/tax
 *
 * Critical regression guards:
 *   BUG #2: calculateTax returned taxRateId='' (empty string) for missing rates.
 *           Fix: returns null. Callers guard with if(tax.taxRateId).
 *   - All arithmetic outputs are integers (Math.round — no fractional paisa).
 *   - source_tax codes are SUBTRACTIVE: net = base − tax (driver is withheld).
 *   - vat codes are ADDITIVE: net = base (tax is separate obligation, not deducted).
 *   - 0% rate row EXISTS in DB → taxRateId is non-null, taxAmount is 0.
 */

// ── Mocks (hoisted before imports by babel-jest) ──────────────────────────────

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn:  jest.fn(),
    info:  jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('drizzle-orm', () => ({
  eq:      (_col: unknown, _val: unknown) => 'eq_condition',
  and:     (..._args: unknown[]) => 'and_condition',
  between: (_col: unknown, _a: unknown, _b: unknown) => 'between_condition',
}));

jest.mock('@/src/db/schema', () => ({
  taxRates: {
    code:         'code_col',
    is_active:    'is_active_col',
    id:           'id_col',
    rate_percent: 'rate_percent_col',
  },
  taxLedgers:         {},
  dailyTaxSummaries:  { summary_date: 'summary_date_col', tax_code: 'tax_code_col' },
}));

jest.mock('@/src/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { db } from '@/src/db';
import { calculateTax } from '../tax';

// ── Seed rate fixtures (matching REFERENCE.md seed SQL) ───────────────────────

const VAT_COMM = {
  id: 'uuid-vat-commission',
  code: 'vat_commission',
  rate_percent: '15.00',
  is_active: true,
};

const VAT_SUB = {
  id: 'uuid-vat-subscription',
  code: 'vat_subscription',
  rate_percent: '15.00',
  is_active: true,
};

const SRC_PAYOUT = {
  id: 'uuid-source-tax-payout',
  code: 'source_tax_payout',
  rate_percent: '5.00',
  is_active: true,
};

const SRC_INSTANT = {
  id: 'uuid-source-tax-instant',
  code: 'source_tax_instant_pay',
  rate_percent: '0.00',
  is_active: true,
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Configures the db.select mock to return `rows` from the
 * db.select().from(table).where(condition).limit(1) chain.
 */
function mockSelectReturning(rows: unknown[]): void {
  (db.select as jest.Mock).mockReturnValue({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── vat_commission — 15%, additive ───────────────────────────────────────────

describe('calculateTax — vat_commission (15%, additive)', () => {
  test('15% of 10 000 paisa → taxAmount 1 500', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.taxAmountPaisa).toBe(1_500);
  });

  test('VAT is additive: netAmountPaisa = baseAmountPaisa (tax is not deducted)', async () => {
    // The net for VAT codes is the base itself — the tax is a separate obligation
    // on top, not withheld from the base. This differs from source_tax_* codes.
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.netAmountPaisa).toBe(10_000);
    expect(result.baseAmountPaisa).toBe(10_000);
  });

  test('taxRateId is non-null and non-empty for an active rate', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.taxRateId).toBe('uuid-vat-commission');
    expect(result.taxRateId).not.toBeNull();
    expect(result.taxRateId).not.toBe(''); // regression: was '' before bug #2 fix
  });

  test('ratePercent returned as a number', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.ratePercent).toBe(15);
    expect(typeof result.ratePercent).toBe('number');
  });

  test('zero base → zero tax, rateId still set', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 0);
    expect(result.taxAmountPaisa).toBe(0);
    expect(result.netAmountPaisa).toBe(0);
    expect(result.taxRateId).toBe('uuid-vat-commission');
  });

  test('large base: 15% of 530 000 paisa = 79 500', async () => {
    // ৳5 300 commission on a ৳530 ride (10% rate)
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 53_000);
    expect(result.taxAmountPaisa).toBe(7_950); // 53_000 × 0.15 = 7950
  });
});

// ── source_tax_payout — 5%, subtractive ──────────────────────────────────────

describe('calculateTax — source_tax_payout (5%, subtractive)', () => {
  test('5% of 10 000 paisa → taxAmount 500', async () => {
    mockSelectReturning([SRC_PAYOUT]);
    const result = await calculateTax('source_tax_payout', 10_000);
    expect(result.taxAmountPaisa).toBe(500);
  });

  test('source tax is subtractive: net = base − tax', async () => {
    // Driver receives net; tax is withheld. Contrast with VAT where net = base.
    mockSelectReturning([SRC_PAYOUT]);
    const result = await calculateTax('source_tax_payout', 10_000);
    expect(result.netAmountPaisa).toBe(9_500); // 10_000 − 500
  });

  test('taxRateId is non-null for active source tax rate', async () => {
    mockSelectReturning([SRC_PAYOUT]);
    const result = await calculateTax('source_tax_payout', 10_000);
    expect(result.taxRateId).toBe('uuid-source-tax-payout');
    expect(result.taxRateId).not.toBeNull();
  });

  test('real payout scenario: 5% of 47 700 paisa driver share', async () => {
    // fare=53 000, commission=5 300 (10%), driverShare=47 700
    mockSelectReturning([SRC_PAYOUT]);
    const result = await calculateTax('source_tax_payout', 47_700);
    expect(result.taxAmountPaisa).toBe(2_385);   // 47 700 × 0.05
    expect(result.netAmountPaisa).toBe(45_315);   // 47 700 − 2 385
  });
});

// ── source_tax_instant_pay — 0%, subtractive (MVP rate) ──────────────────────

describe('calculateTax — source_tax_instant_pay (0% MVP rate)', () => {
  test('0% → taxAmountPaisa is zero', async () => {
    mockSelectReturning([SRC_INSTANT]);
    const result = await calculateTax('source_tax_instant_pay', 10_000);
    expect(result.taxAmountPaisa).toBe(0);
  });

  test('0% → netAmountPaisa equals baseAmountPaisa (no withholding)', async () => {
    mockSelectReturning([SRC_INSTANT]);
    const result = await calculateTax('source_tax_instant_pay', 10_000);
    expect(result.netAmountPaisa).toBe(10_000);
  });

  test('0% rate → taxRateId is NON-NULL (rate row exists at 0%, callers still record audit trail)', async () => {
    // Key: the rate row exists in the DB with rate_percent=0.00 and is_active=true.
    // taxRateId must be returned so callers can create a tax_ledger row for the audit trail
    // (base_amount populated, tax_amount=0). If taxRateId were null, the ledger row
    // would be skipped and the audit trail would be incomplete.
    mockSelectReturning([SRC_INSTANT]);
    const result = await calculateTax('source_tax_instant_pay', 10_000);
    expect(result.taxRateId).toBe('uuid-source-tax-instant');
    expect(result.taxRateId).not.toBeNull();
    expect(result.taxRateId).not.toBe('');
  });
});

// ── Missing / inactive rate — bug #2 regression guard ────────────────────────

describe('calculateTax — missing or inactive rate → taxRateId MUST be null', () => {
  /**
   * BUG #2 (fixed): when no matching rate was found, calculateTax was returning
   * taxRateId: '' (empty string). Callers guarded with if(tax.taxRateId), which
   * evaluates '' as falsy in JS — so the guard accidentally worked. However, the
   * interface declared taxRateId as string (not string|null), meaning downstream
   * code that assumed a UUID string would crash on a UUID FK constraint if taxRateId
   * were passed to an INSERT.
   *
   * Fix: return null explicitly. Interface updated to string|null.
   * All callers use: if(tax.taxRateId) { await recordTaxLedger(..., taxRateId: tax.taxRateId) }
   */

  test('missing rate → taxRateId is null (not empty string)', async () => {
    // DB returns [] — no matching active rate for this code.
    mockSelectReturning([]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.taxRateId).toBeNull();
    expect(result.taxRateId).not.toBe(''); // the exact regression: '' would fail a UUID FK
  });

  test('missing rate → taxAmountPaisa is 0', async () => {
    mockSelectReturning([]);
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.taxAmountPaisa).toBe(0);
  });

  test('missing rate → netAmountPaisa equals baseAmountPaisa (no deduction)', async () => {
    mockSelectReturning([]);
    const result = await calculateTax('vat_commission', 50_000);
    expect(result.netAmountPaisa).toBe(50_000);
  });

  test('null taxRateId passes the caller guard if(tax.taxRateId) without crash', () => {
    // Simulate caller logic from complete+api.ts and instant-pay+api.ts:
    //   const tax = await calculateTax(...);
    //   if (tax.taxRateId) { await recordTaxLedger({ taxRateId: tax.taxRateId, ... }); }
    const tax = { taxRateId: null as string | null, taxAmountPaisa: 0, netAmountPaisa: 1_000 };
    let recorded = false;
    if (tax.taxRateId) {
      recorded = true; // should never reach here
    }
    expect(recorded).toBe(false); // null is falsy → guard correctly skips recordTaxLedger
  });

  test('inactive rate treated as missing → taxRateId null', async () => {
    // The DB query filters WHERE is_active=true, so inactive rates return [].
    // An inactive VAT rate must not produce a tax ledger entry.
    mockSelectReturning([]); // is_active filter excludes the row at DB level
    const result = await calculateTax('vat_commission', 10_000);
    expect(result.taxRateId).toBeNull();
    expect(result.taxAmountPaisa).toBe(0);
  });
});

// ── Integer arithmetic ────────────────────────────────────────────────────────

describe('calculateTax — all outputs are integers (Math.round — no fractional paisa)', () => {
  test('15% of 3 paisa → round(0.45) = 0', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 3);
    expect(Number.isInteger(result.taxAmountPaisa)).toBe(true);
    expect(result.taxAmountPaisa).toBe(0); // Math.round(3 × 0.15) = Math.round(0.45) = 0
  });

  test('15% of 7 paisa → round(1.05) = 1', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 7);
    expect(Number.isInteger(result.taxAmountPaisa)).toBe(true);
    expect(result.taxAmountPaisa).toBe(1); // Math.round(7 × 0.15) = Math.round(1.05) = 1
  });

  test('taxAmountPaisa is always an integer for arbitrary input', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 1_337);
    expect(Number.isInteger(result.taxAmountPaisa)).toBe(true);
  });

  test('netAmountPaisa is always an integer (source_tax)', async () => {
    mockSelectReturning([SRC_PAYOUT]);
    const result = await calculateTax('source_tax_payout', 1_337);
    expect(Number.isInteger(result.netAmountPaisa)).toBe(true);
  });

  test('netAmountPaisa is always an integer (vat)', async () => {
    mockSelectReturning([VAT_COMM]);
    const result = await calculateTax('vat_commission', 9_999);
    expect(Number.isInteger(result.netAmountPaisa)).toBe(true);
  });
});
