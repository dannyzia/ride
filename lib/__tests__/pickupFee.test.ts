/**
 * FC-3 true-up coverage (Phase F): the five mandated cases run through
 * finalPickupFeePaisa — the guard helper the COMPLETE step must call.
 * Cases 1–4 exercise trueUpFinal via high-confidence inputs; case 5 is the
 * Stage 3 protected invariant (low-confidence freeze at firm).
 */
import {
  computeFeeKm,
  pickupFeePaisa,
  applyBackstop,
  ratePerKmPaisa,
  referenceKm,
  trueUpFinal,
  finalPickupFeePaisa,
  haversineKm,
} from '../pickupFee';

describe('computeFeeKm', () => {
  test('inside free radius → 0', () => {
    expect(computeFeeKm(1.2, 1.5)).toBe(0);
  });

  test('beyond free radius → excess km', () => {
    expect(computeFeeKm(3.2, 1.5)).toBeCloseTo(1.7, 10);
  });

  test('exactly at radius → 0', () => {
    expect(computeFeeKm(1.5, 1.5)).toBe(0);
  });
});

describe('pickupFeePaisa — integer paisa with km cap', () => {
  test('under cap: rate × chargeable km, rounded to integer paisa', () => {
    // 581.25 × 1.0 = 581.25 → 581
    expect(pickupFeePaisa(1.0, 581.25, 2.0)).toBe(581);
  });

  test('over cap: chargeable km clamped to cap_billable_km', () => {
    // 581.25 × min(5.0, 2.0) = 1162.5 → 1163 (Math.round)
    expect(pickupFeePaisa(5.0, 581.25, 2.0)).toBe(1163);
  });

  test('zero chargeable km → 0', () => {
    expect(pickupFeePaisa(0, 581.25, 2.0)).toBe(0);
  });
});

describe('applyBackstop — 40% of fare-before-pickup', () => {
  test('fee under backstop passes through', () => {
    expect(applyBackstop(500, 2000, 40)).toBe(500);
  });

  test('fee above backstop is clamped, rounded to integer paisa', () => {
    // 3333 × 40 / 100 = 1333.2 → round = 1333
    expect(applyBackstop(2000, 3333, 40)).toBe(1333);
  });
});

describe('ratePerKmPaisa — locked multipliers, integer paisa', () => {
  test('bike 0.75', () => {
    // 775 × 0.75 = 581.25 → 581
    expect(ratePerKmPaisa(775, 'bike')).toBe(581);
  });

  test('cng 0.80', () => {
    expect(ratePerKmPaisa(775, 'cng')).toBe(620);
  });

  test('car 0.90', () => {
    // 1500 × 0.9 = 1350
    expect(ratePerKmPaisa(1500, 'car')).toBe(1350);
  });
});

describe('referenceKm — quantile over sorted pool', () => {
  test('p75 of 5 nearest drivers (linear interpolation)', () => {
    // idx = 0.75 × (5−1) = 3 → exactly the 4th element
    expect(referenceKm([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });

  test('interpolates between elements', () => {
    // idx = 0.5 × (4−1) = 1.5 → 2 + 0.5 × (3−2) = 2.5
    expect(referenceKm([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  test('empty pool → 0', () => {
    expect(referenceKm([], 0.75)).toBe(0);
  });

  test('quantile 0 → nearest driver', () => {
    expect(referenceKm([1.2, 2.4, 3.6], 0)).toBe(1.2);
  });
});

describe('trueUpFinal — downward uncapped, upward capped at 1.25×', () => {
  const FIRM = 1000;

  test('realized < firm → rider pays less, uncapped downward', () => {
    expect(trueUpFinal(FIRM, 700, 1.25)).toBe(700);
  });

  test('firm < realized < firm×1.25 → partial upward adjustment', () => {
    expect(trueUpFinal(FIRM, 1100, 1.25)).toBe(1100);
  });

  test('realized ≥ firm×1.25 → capped at round(firm × 1.25)', () => {
    expect(trueUpFinal(FIRM, 9999, 1.25)).toBe(1250);
  });

  test('realized = 0 → final fee 0, not firm', () => {
    expect(trueUpFinal(FIRM, 0, 1.25)).toBe(0);
  });

  test('cap multiplier rounding is integer paisa', () => {
    // round(1001 × 1.25) = round(1251.25) = 1251
    expect(trueUpFinal(1001, 5000, 1.25)).toBe(1251);
  });
});

describe('haversineKm re-export', () => {
  test('same point → 0; distinct points → positive distance', () => {
    expect(haversineKm(23.8103, 90.4125, 23.8103, 90.4125)).toBe(0);
    const d = haversineKm(23.8103, 90.4125, 23.8203, 90.4225);
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(2);
  });
});

describe('FC-3 — finalPickupFeePaisa (guard helper for quote state 3)', () => {
  const MIN_CONF = 0.7;
  const HIGH_CONF = 0.95;
  const FIRM = 1000;

  const call = (feeFromRealized: number, confidence: number) =>
    finalPickupFeePaisa({
      feeFirm: FIRM,
      feeFromRealized,
      confidence,
      minConfidence: MIN_CONF,
      capMultiplier: 1.25,
    });

  test('case 1: realized < firm → downward adjustment, uncapped (rider pays less)', () => {
    expect(call(700, HIGH_CONF)).toBe(700);
  });

  test('case 2: firm < realized < firm×1.25 → partial upward adjustment under cap', () => {
    expect(call(1100, HIGH_CONF)).toBe(1100);
  });

  test('case 3: realized ≥ firm×1.25 → full cap, exactly round(firm×1.25), never more', () => {
    expect(call(9999, HIGH_CONF)).toBe(1250);
    expect(call(1250, HIGH_CONF)).toBe(1250);
  });

  test('case 4: realized = 0 → fee = 0, not firm', () => {
    expect(call(0, HIGH_CONF)).toBe(0);
  });

  test('case 5: low confidence → firm EXACTLY, even when realized would mean a downward adjustment', () => {
    // Freeze: never above firm, never below firm — realized ignored entirely
    expect(call(700, 0.69)).toBe(FIRM);
    expect(call(0, 0.0)).toBe(FIRM);
    // ...and equally frozen when realized would mean an upward adjustment
    expect(call(9999, 0.5)).toBe(FIRM);
  });

  test('boundary: confidence exactly at minConfidence is NOT frozen (strict <)', () => {
    expect(call(700, MIN_CONF)).toBe(700);
  });

  test('helper stays pure — trueUpFinal result unchanged for high confidence', () => {
    expect(call(1100, HIGH_CONF)).toBe(trueUpFinal(FIRM, 1100, 1.25));
    expect(call(9999, HIGH_CONF)).toBe(trueUpFinal(FIRM, 9999, 1.25));
  });
});
