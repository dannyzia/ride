/**
 * lib/__tests__/discountEngine.test.ts
 *
 * Unit tests for lib/discountEngine.ts — getAvailableDiscounts() and applySelectedDiscount().
 * All DB calls are mocked; no network required.
 * Run: npx jest lib/__tests__/discountEngine
 */

// ── Mocks (hoisted before imports by babel-jest) ──────────────────────────────

jest.mock('../../src/db/schema', () => ({
  users: { rider_wallet_balance_bdt: 'wallet_col', id: 'id_col' },
  riderSubscriptions: {
    rider_id: 'rider_id_col',
    status: 'status_col',
    valid_until: 'valid_until_col',
    pass_id: 'pass_id_col',
    rides_used: 'rides_used_col',
    id: 'id_col',
  },
  riderPasses: {
    id: 'id_col',
    name: 'name_col',
    discount_percent: 'discount_percent_col',
    max_rides: 'max_rides_col',
  },
}));

// NOTE: jest.mock is hoisted ABOVE const declarations, so we cannot reference
// `mockDbSelect` inside the factory. Create jest.fn() inline, then extract.
jest.mock('../../src/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('drizzle-orm', () => ({
  eq: jest.fn(() => 'eq_condition'),
  and: jest.fn(() => 'and_condition'),
  sql: jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => `sql(${strings.join('')}${values.join('')})`),
  asc: jest.fn(() => 'asc_condition'),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/lib/promoCache', () => ({
  getStagedPromo: jest.fn(),
}));

jest.mock('@/lib/introIncentive', () => ({
  getIntroDiscount: jest.fn(),
}));

// ── Imports (resolved after mocks) ────────────────────────────────────────────

import { db } from '../../src/db';
import { getAvailableDiscounts, applySelectedDiscount } from '../discountEngine';
import { getStagedPromo } from '@/lib/promoCache';
import { getIntroDiscount } from '@/lib/introIncentive';

const mockDbSelect = db.select as jest.Mock;
const mockGetStagedPromo = getStagedPromo as jest.Mock;
const mockGetIntroDiscount = getIntroDiscount as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSelectChain(result: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

function mockSelectChainNoOrderBy(result: unknown[]) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(result),
      }),
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetIntroDiscount.mockResolvedValue(null);
  mockGetStagedPromo.mockReturnValue(null);

  // Default: pass query returns no active subscription,
  // wallet query returns zero balance.
  mockDbSelect
    .mockReturnValueOnce(mockSelectChain([]))
    .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));
});

// ── applySelectedDiscount (pure function, no mocks needed) ─────────────────────

describe('applySelectedDiscount — pure function', () => {
  test('pass discount applied correctly', () => {
    const result = applySelectedDiscount(10_000, {
      type: 'pass',
      percent: 20,
      amount_bdt: 2_000,
      description: 'Monthly pass',
    });
    expect(result).toBe(8_000);
  });

  test('promo flat discount applied correctly', () => {
    const result = applySelectedDiscount(5_000, {
      type: 'promo',
      amount_bdt: 1_000,
      description: 'Flat promo',
    });
    expect(result).toBe(4_000);
  });

  test('discount capped to fare — never goes negative', () => {
    const result = applySelectedDiscount(500, {
      type: 'promo',
      amount_bdt: 999,
      description: 'Oversized promo',
    });
    expect(result).toBe(0);
  });

  test('zero fare stays zero', () => {
    const result = applySelectedDiscount(0, {
      type: 'intro',
      amount_bdt: 0,
      description: 'No discount',
    });
    expect(result).toBe(0);
  });

  test('large fare with large discount', () => {
    const result = applySelectedDiscount(50_000, {
      type: 'pass',
      amount_bdt: 25_000,
      description: '50% pass',
    });
    expect(result).toBe(25_000);
  });

  test('wallet discount applied correctly', () => {
    const result = applySelectedDiscount(10_000, {
      type: 'wallet',
      amount_bdt: 3_000,
      description: 'Wallet',
    });
    expect(result).toBe(7_000);
  });
});

// ── getPromoOption (via getAvailableDiscounts) ─────────────────────────────────

describe('getAvailableDiscounts — promo option', () => {
  beforeEach(() => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));
  });

  test('returns promo discount when staged', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 20,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(promo!.percent).toBe(20);
    expect(promo!.amount_bdt).toBe(2_000);
  });

  test('promo flat discount', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-2',
      riderId: 'rider-1',
      discountType: 'flat',
      discountValue: 500,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(promo!.amount_bdt).toBe(500);
  });

  test('promo max_discount_bdt cap enforced', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-3',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 50,
      maxDiscountBdt: 2_000,
      minSpendBdt: null,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(promo!.amount_bdt).toBe(2_000);
  });

  test('promo min_spend_bdt — below threshold excluded', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-4',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 20,
      maxDiscountBdt: null,
      minSpendBdt: 5_000,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 3_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeUndefined();
  });

  test('promo min_spend_bdt — at threshold included', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-5',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: 5_000,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 5_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(promo!.amount_bdt).toBe(500);
  });

  test('no promo staged → no promo option', async () => {
    mockGetStagedPromo.mockReturnValue(null);

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const promos = options.filter((o) => o.type === 'promo');
    expect(promos).toHaveLength(0);
  });

  test('promo discount capped to fare — never exceeds fare', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-6',
      riderId: 'rider-1',
      discountType: 'flat',
      discountValue: 99_999,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 1_000,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(promo!.amount_bdt).toBe(1_000);
  });
});

// ── getPassOption (via getAvailableDiscounts) ──────────────────────────────────

describe('getAvailableDiscounts — pass option', () => {
  test('returns pass discount for active subscription', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'sub-1',
            rider_id: 'rider-1',
            pass_id: 'pass-1',
            status: 'active',
            rides_used: 3,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([
          {
            id: 'pass-1',
            name: 'Monthly',
            discount_percent: 15,
            max_rides: 20,
          },
        ]),
      )
      .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const pass = options.find((o) => o.type === 'pass');
    expect(pass).toBeDefined();
    expect(pass!.amount_bdt).toBe(1_500);
    expect(pass!.percent).toBe(15);
    expect(pass!.subscription_id).toBe('sub-1');
  });

  test('no active subscription → no pass option', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const passes = options.filter((o) => o.type === 'pass');
    expect(passes).toHaveLength(0);
  });

  test('pass exhausted (rides_used >= max_rides) → excluded', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'sub-2',
            rider_id: 'rider-1',
            pass_id: 'pass-2',
            status: 'active',
            rides_used: 20,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([
          {
            id: 'pass-2',
            name: 'Monthly',
            discount_percent: 15,
            max_rides: 20,
          },
        ]),
      )
      .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const passes = options.filter((o) => o.type === 'pass');
    expect(passes).toHaveLength(0);
  });

  test('pass discount capped to fare', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'sub-3',
            rider_id: 'rider-1',
            pass_id: 'pass-3',
            status: 'active',
            rides_used: 0,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([
          {
            id: 'pass-3',
            name: 'Unlimited',
            discount_percent: 50,
            max_rides: null,
          },
        ]),
      )
      .mockReturnValueOnce(mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]));

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 1_000,
      zoneId: 'zone-1',
    });

    const pass = options.find((o) => o.type === 'pass');
    expect(pass).toBeDefined();
    expect(pass!.amount_bdt).toBe(500);
  });
});

// ── getWalletOption (via getAvailableDiscounts) ───────────────────────────────

describe('getAvailableDiscounts — wallet option', () => {
  test('returns wallet discount when balance > 0', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 5_000 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const wallet = options.find((o) => o.type === 'wallet');
    expect(wallet).toBeDefined();
    expect(wallet!.amount_bdt).toBe(5_000);
  });

  test('wallet capped at 50% of fare', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 20_000 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const wallet = options.find((o) => o.type === 'wallet');
    expect(wallet).toBeDefined();
    expect(wallet!.amount_bdt).toBe(5_000);
  });

  test('zero wallet balance → no wallet option', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const wallets = options.filter((o) => o.type === 'wallet');
    expect(wallets).toHaveLength(0);
  });

  test('small fare limits wallet redemption', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 10_000 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 1_000,
      zoneId: 'zone-1',
    });

    const wallet = options.find((o) => o.type === 'wallet');
    expect(wallet).toBeDefined();
    expect(wallet!.amount_bdt).toBe(500);
  });
});

// ── Intro incentive (via getAvailableDiscounts) ───────────────────────────────

describe('getAvailableDiscounts — intro option', () => {
  test('returns intro discount when configured', async () => {
    mockGetIntroDiscount.mockResolvedValue({
      type: 'intro',
      percent: 30,
      amount_bdt: 3_000,
      description: 'Intro 30% off',
    });

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 0,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const intro = options.find((o) => o.type === 'intro');
    expect(intro).toBeDefined();
    expect(intro!.amount_bdt).toBe(3_000);
  });

  test('no intro config → no intro option', async () => {
    mockGetIntroDiscount.mockResolvedValue(null);

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 0,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    const intros = options.filter((o) => o.type === 'intro');
    expect(intros).toHaveLength(0);
  });
});

// ── Combined scenarios ─────────────────────────────────────────────────────────

describe('getAvailableDiscounts — combined scenarios', () => {
  test('intro + promo + pass + wallet all available', async () => {
    mockGetIntroDiscount.mockResolvedValue({
      type: 'intro',
      percent: 10,
      amount_bdt: 1_000,
      description: 'Intro',
    });
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        mockSelectChain([
          {
            id: 'sub-1',
            rider_id: 'rider-1',
            pass_id: 'pass-1',
            status: 'active',
            rides_used: 3,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([
          {
            id: 'pass-1',
            name: 'Monthly',
            discount_percent: 10,
            max_rides: 20,
          },
        ]),
      )
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 5_000 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 10_000,
      zoneId: 'zone-1',
    });

    expect(options).toHaveLength(4);
    expect(options.map((o) => o.type).sort()).toEqual([
      'intro',
      'pass',
      'promo',
      'wallet',
    ]);
  });

  test('rider with no promos, no passes, no wallet', async () => {
    mockGetIntroDiscount.mockResolvedValue(null);
    mockGetStagedPromo.mockReturnValue(null);
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 0,
      fareTotalBdt: 5_000,
      zoneId: 'zone-1',
    });

    expect(options).toHaveLength(0);
  });
});

// ── Integer arithmetic ────────────────────────────────────────────────────────

describe('discount engine — integer arithmetic', () => {
  test('all discount amounts are integers', async () => {
    mockGetStagedPromo.mockReturnValue({
      promoCodeId: 'promo-odd',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 33,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(mockSelectChain([]))
      .mockReturnValueOnce(
        mockSelectChainNoOrderBy([{ wallet_balance_bdt: 0 }]),
      );

    const options = await getAvailableDiscounts({
      riderId: 'rider-1',
      totalRides: 5,
      fareTotalBdt: 7_777,
      zoneId: 'zone-1',
    });

    const promo = options.find((o) => o.type === 'promo');
    expect(promo).toBeDefined();
    expect(Number.isInteger(promo!.amount_bdt)).toBe(true);
    expect(promo!.amount_bdt).toBe(2_566);
  });

  test('applySelectedDiscount returns integer', () => {
    const result = applySelectedDiscount(7_777, {
      type: 'promo',
      amount_bdt: 2_566,
      description: '33% promo',
    });
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(5_211);
  });
});
