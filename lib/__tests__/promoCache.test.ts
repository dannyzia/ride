/**
 * lib/__tests__/promoCache.test.ts
 *
 * Unit tests for lib/promoCache.ts — stagePromo, getStagedPromo, clearStagedPromo.
 * Pure in-memory module — no DB or network required.
 * Run: npx jest lib/__tests__/promoCache
 *
 * Critical regression guards:
 * - Staged promo has 10-minute TTL
 * - Clearing a promo removes it from cache
 * - Different riders have separate caches (user-scoped)
 */

// ── Imports ───────────────────────────────────────────────────────────────────

import { stagePromo, getStagedPromo, clearStagedPromo } from '../promoCache';

beforeEach(() => {
  // Clear all staged promos between tests
  clearStagedPromo('rider-1');
  clearStagedPromo('rider-2');
  clearStagedPromo('rider-3');
});

// ── Stage + retrieve ──────────────────────────────────────────────────────────

describe('promoCache — stage and retrieve', () => {
  test('stage a promo and retrieve it', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-uuid-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 20,
      maxDiscountBdt: 500,
      minSpendBdt: 1000,
    });

    const staged = getStagedPromo('rider-1');
    expect(staged).not.toBeNull();
    expect(staged!.promoCodeId).toBe('promo-uuid-1');
    expect(staged!.discountType).toBe('percent');
    expect(staged!.discountValue).toBe(20);
    expect(staged!.maxDiscountBdt).toBe(500);
    expect(staged!.minSpendBdt).toBe(1000);
    expect(staged!.stagedAt).toBeGreaterThan(0);
  });

  test('retrieve returns null for non-existent rider', () => {
    const staged = getStagedPromo('non-existent');
    expect(staged).toBeNull();
  });

  test('flat discount type staged correctly', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-uuid-2',
      riderId: 'rider-1',
      discountType: 'flat',
      discountValue: 500,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    const staged = getStagedPromo('rider-1');
    expect(staged).not.toBeNull();
    expect(staged!.discountType).toBe('flat');
    expect(staged!.discountValue).toBe(500);
    expect(staged!.maxDiscountBdt).toBeNull();
    expect(staged!.minSpendBdt).toBeNull();
  });
});

// ── Clear ─────────────────────────────────────────────────────────────────────

describe('promoCache — clear', () => {
  test('clearing a staged promo removes it', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-uuid-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    expect(getStagedPromo('rider-1')).not.toBeNull();
    clearStagedPromo('rider-1');
    expect(getStagedPromo('rider-1')).toBeNull();
  });

  test('clearing non-existent rider is a no-op', () => {
    expect(() => clearStagedPromo('non-existent')).not.toThrow();
  });
});

// ── User-scoped isolation ─────────────────────────────────────────────────────

describe('promoCache — user isolation', () => {
  test('different riders have separate caches', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-A',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    stagePromo('rider-2', {
      promoCodeId: 'promo-B',
      riderId: 'rider-2',
      discountType: 'flat',
      discountValue: 200,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    expect(getStagedPromo('rider-1')!.promoCodeId).toBe('promo-A');
    expect(getStagedPromo('rider-2')!.promoCodeId).toBe('promo-B');

    // Clearing rider-1 does not affect rider-2
    clearStagedPromo('rider-1');
    expect(getStagedPromo('rider-1')).toBeNull();
    expect(getStagedPromo('rider-2')).not.toBeNull();
    expect(getStagedPromo('rider-2')!.promoCodeId).toBe('promo-B');
  });

  test('staging a new promo replaces the previous one', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-old',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    stagePromo('rider-1', {
      promoCodeId: 'promo-new',
      riderId: 'rider-1',
      discountType: 'flat',
      discountValue: 300,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    const staged = getStagedPromo('rider-1');
    expect(staged!.promoCodeId).toBe('promo-new');
    expect(staged!.discountType).toBe('flat');
    expect(staged!.discountValue).toBe(300);
  });
});

// ── TTL ───────────────────────────────────────────────────────────────────────

describe('promoCache — TTL expiry', () => {
  test('staged promo expires after 10 minutes', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-uuid-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 20,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    // Should be available immediately
    expect(getStagedPromo('rider-1')).not.toBeNull();

    // Simulate TTL expiry by mocking Date.now
    const originalNow = Date.now;
    const tenMinutesLater = Date.now() + 10 * 60 * 1000 + 1; // 10 min + 1ms
    Date.now = jest.fn(() => tenMinutesLater);

    try {
      expect(getStagedPromo('rider-1')).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  test('staged promo available before TTL expiry', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-uuid-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 20,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    // Simulate 9 minutes (just before TTL)
    const originalNow = Date.now;
    const nineMinutesLater = Date.now() + 9 * 60 * 1000;
    Date.now = jest.fn(() => nineMinutesLater);

    try {
      expect(getStagedPromo('rider-1')).not.toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });
});

// ── Logout cleanup integration ────────────────────────────────────────────────

describe('promoCache — logout clears staged promo', () => {
  test('clearStagedPromo removes only the specified rider', () => {
    stagePromo('rider-1', {
      promoCodeId: 'promo-1',
      riderId: 'rider-1',
      discountType: 'percent',
      discountValue: 10,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });
    stagePromo('rider-2', {
      promoCodeId: 'promo-2',
      riderId: 'rider-2',
      discountType: 'flat',
      discountValue: 200,
      maxDiscountBdt: null,
      minSpendBdt: null,
    });

    // Simulate logout for rider-1 (only clears rider-1's staged promo)
    clearStagedPromo('rider-1');

    expect(getStagedPromo('rider-1')).toBeNull();
    expect(getStagedPromo('rider-2')).not.toBeNull();
  });
});
