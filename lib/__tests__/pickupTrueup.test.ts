/**
 * Phase F quote state 3 — computePickupTrueup unit tests (pure helper).
 *
 * Covers the completion true-up orchestration that wraps lib/pickupFee:
 * - fee-off (Stage 0): charge nothing, but the 'trued' transition applies
 * - low-confidence freeze at firm (< pickup_origin_confidence_min)
 * - realized null → freeze at firm
 * - backstop re-check against the completion-recalculated trip fare
 *   (ruling 18)
 * - downward uncapped / upward 1.25× cap / realized 0 → 0
 * - non-'firm' states are no-ops; sample harvesting gated on firm_km
 *
 * Fixture: bike category, zone per-km 775 paisa → pickup rate
 * round(775 × 0.75) = 581 paisa/km; free radius 0.5 km; cap 2.0 km;
 * backstop 40%; minConfidence 0.7; capMultiplier 1.25.
 */
import {
  computePickupTrueup,
  type PickupTrueupContext,
  type PickupTrueupRideColumns,
} from '../pickupTrueup';

const BASE_CTX: PickupTrueupContext = {
  feeEnabled: true,
  freeRadiusKm: 0.5,
  capBillableKm: 2.0,
  backstopPct: 40,
  minConfidence: 0.7,
  capMultiplier: 1.25,
  zonePerKmBdt: 775,
  category: 'bike',
  recalculatedTripFareBdt: 12750,
};

function firmRide(
  overrides: Partial<PickupTrueupRideColumns> = {},
): PickupTrueupRideColumns {
  return {
    pickup_fee_state: 'firm',
    pickup_fee_firm_bdt: 900,
    pickup_firm_km: '3.000',
    pickup_realized_km: '4.000',
    pickup_realized_confidence: '0.950',
    ...overrides,
  };
}

describe('computePickupTrueup — fee-off (Stage 0, ruling 16)', () => {
  test('charges nothing but the trued transition applies + sample harvested', () => {
    const r = computePickupTrueup(firmRide(), { ...BASE_CTX, feeEnabled: false });
    expect(r.applies).toBe(true);
    expect(r.insertSample).toBe(true);
    expect(r.finalFeeBdt).toBeNull();
    expect(r.deltaBdt).toBeNull();
    expect(r.firmKm).toBe(3);
    expect(r.realizedKm).toBe(4);
  });

  test('defensive: firm state without a firm fee charges nothing', () => {
    const r = computePickupTrueup(firmRide({ pickup_fee_firm_bdt: null }), BASE_CTX);
    expect(r.applies).toBe(true);
    expect(r.finalFeeBdt).toBeNull();
    expect(r.deltaBdt).toBeNull();
  });
});

describe('computePickupTrueup — Stage 3 invariant (low-confidence freeze)', () => {
  test('confidence below min → final = firm EXACTLY, realized ignored (even downward)', () => {
    // Realized fee would be 872 (a downward adjustment) — still frozen.
    const r = computePickupTrueup(
      firmRide({ pickup_realized_km: '2.000', pickup_realized_confidence: '0.690' }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(900);
    expect(r.deltaBdt).toBe(0);
  });

  test('confidence below min → frozen even when realized would mean an upward move', () => {
    const r = computePickupTrueup(
      firmRide({ pickup_realized_confidence: '0.500' }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(900);
    expect(r.deltaBdt).toBe(0);
  });

  test('missing confidence (null) is treated as low → freeze at firm', () => {
    const r = computePickupTrueup(
      firmRide({ pickup_realized_confidence: null }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(900);
  });

  test('confidence exactly at min is NOT frozen (strict <)', () => {
    // realized 4 km → fee 1162 → capped at round(900 × 1.25) = 1125
    const r = computePickupTrueup(
      firmRide({ pickup_realized_confidence: '0.700' }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(1125);
  });
});

describe('computePickupTrueup — realized data paths', () => {
  test('realized null → final = firm (freeze; no realized data)', () => {
    const r = computePickupTrueup(
      firmRide({ pickup_realized_km: null, pickup_realized_confidence: null }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(900);
    expect(r.deltaBdt).toBe(0);
    expect(r.insertSample).toBe(true);
    expect(r.realizedKm).toBeNull();
  });

  test('upward: raw realized fee capped at 1.25× firm', () => {
    // feeKm = min(4 − 0.5, 2.0) = 2 → 581 × 2 = 1162; backstop 5100 not
    // binding; trueUp(900, 1162, 1.25) = min(1162, 1125) = 1125.
    const r = computePickupTrueup(firmRide(), BASE_CTX);
    expect(r.finalFeeBdt).toBe(1125);
    expect(r.deltaBdt).toBe(225);
  });

  test('downward: realized below firm → uncapped rider-favorable adjustment', () => {
    // feeKm = 2 − 0.5 = 1.5 → round(581 × 1.5) = 872 < 900 → final 872.
    const r = computePickupTrueup(
      firmRide({ pickup_realized_km: '2.000' }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(872);
    expect(r.deltaBdt).toBe(-28);
  });

  test('realized 0 km → final fee 0, not firm', () => {
    const r = computePickupTrueup(
      firmRide({ pickup_realized_km: '0.000' }),
      BASE_CTX,
    );
    expect(r.finalFeeBdt).toBe(0);
    expect(r.deltaBdt).toBe(-900);
  });
});

describe('computePickupTrueup — backstop re-check (ruling 18)', () => {
  test('realized fee clamped to 40% of the completion-recalculated trip fare', () => {
    // Recalculated fare 2000 → 40% = 800 < raw 1162 → feeFromRealized 800.
    // Firm 900 → downward: final 800 (uncapped downward).
    const r = computePickupTrueup(firmRide(), {
      ...BASE_CTX,
      recalculatedTripFareBdt: 2000,
    });
    expect(r.finalFeeBdt).toBe(800);
    expect(r.deltaBdt).toBe(-100);
  });

  test('backstop clamp applies before the upward 1.25× cap', () => {
    // Firm 700; backstop 800; raw 1162 → feeFromRealized 800; trueUp(700,
    // 800, 1.25) → 800 ≤ round(700 × 1.25)=875 → 800.
    const r = computePickupTrueup(
      firmRide({ pickup_fee_firm_bdt: 700 }),
      { ...BASE_CTX, recalculatedTripFareBdt: 2000 },
    );
    expect(r.finalFeeBdt).toBe(800);
  });

  test('backstop binding on a high recalculated fare keeps the raw fee', () => {
    // 40% of 12750 = 5100 > 1162 → backstop not binding.
    const r = computePickupTrueup(firmRide(), BASE_CTX);
    expect(r.finalFeeBdt).toBe(1125); // only the 1.25× cap binds
  });
});

describe('computePickupTrueup — state gating & sample harvesting', () => {
  test.each([null, 'range', 'trued'] as const)(
    'pickup_fee_state %p → no-op (applies=false, no sample, no charge)',
    (state) => {
      const r = computePickupTrueup(
        firmRide({ pickup_fee_state: state }),
        BASE_CTX,
      );
      expect(r.applies).toBe(false);
      expect(r.insertSample).toBe(false);
      expect(r.finalFeeBdt).toBeNull();
      expect(r.deltaBdt).toBeNull();
    },
  );

  test('no firm_km → no sample row even though the true-up applies', () => {
    const r = computePickupTrueup(firmRide({ pickup_firm_km: null }), BASE_CTX);
    expect(r.applies).toBe(true);
    expect(r.insertSample).toBe(false);
    expect(r.firmKm).toBeNull();
  });
});
