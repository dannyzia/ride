/**
 * T-A1: Pickup fee v6 — PATCH 3 pinned cap sequence.
 * T-A2: True-up 1.25× upward cap / uncapped downward to 0.
 * T-A3: low_confidence_never_bills_above_firm_quote (Stage 3 invariant).
 *
 * PATCH 3 pinned formula (non-negotiable ordering):
 *   billable_km = min(max(0, pickup_km − free_radius), cap_billable_km)
 *   billable_min = max(0, pickup_min − free_pickup_min)
 *   distance_fee = km_rate × billable_km  (km cap on distance ONLY)
 *   time_fee = time_rate × billable_min   (never dropped by km cap)
 *   uncapped_fee = distance_fee + time_fee
 *   pickup_fee = min(uncapped_fee, round(fare_before_pickup × cap_pct / 100))
 *
 * Critical constraints:
 *   1. km cap applies to distance component ONLY — time never dropped
 *   2. %-backstop applies to the WHOLE fee (km + time)
 *   3. min() at outer level = backstop is final ceiling
 */
import {
  pickupFeeV6,
  trueUpFinal,
  finalPickupFeePaisa,
  computeFeeKm,
} from '../pickupFee';
import {
  computePickupTrueup,
  type PickupTrueupContext,
  type PickupTrueupRideColumns,
} from '../pickupTrueup';

// ══════════════════════════════════════════════════════════════════════
// T-A1: Pickup fee v6 cap sequence (PATCH 3)
// ══════════════════════════════════════════════════════════════════════

describe('T-A1 — pickupFeeV6 cap sequence (PATCH 3)', () => {
  const KM_RATE = 775; // paisa/km
  const TIME_RATE = 50; // paisa/min
  const FREE_RADIUS = 1.0; // km
  const FREE_TIME = 3; // min
  const CAP_KM = 2.0; // max billable pickup km
  const CAP_PCT = 25; // % of fare before pickup

  test('(a) km > cap_km does NOT drop time component', () => {
    // pickup_km=5, pickup_min=10
    // billable_km = min(max(0, 5−1), 2) = 2
    // billable_min = max(0, 10−3) = 7
    // distance = round(775 × 2) = 1550
    // time = round(50 × 7) = 350
    // uncapped = 1550 + 350 = 1900
    const fee = pickupFeeV6({
      pickupKm: 5,
      pickupMin: 10,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 20000, // high fare → backstop won't bind
    });
    // distance is capped at 1550, but time is still 350
    expect(fee).toBe(1550 + 350); // 1900
  });

  test('(b) backstop applies to km+time total (not just distance)', () => {
    // fareBeforePickup = 5000, capPct = 25 → backstop = 1250
    // pickup_km=3, pickup_min=15 → billable_km=2, billable_min=12
    // distance=1550, time=600 → uncapped=2150
    // backstop = round(5000 × 25/100) = 1250
    // fee = min(2150, 1250) = 1250
    const fee = pickupFeeV6({
      pickupKm: 3,
      pickupMin: 15,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 5000,
    });
    expect(fee).toBe(1250);
  });

  test('(c) backstop < km+time total triggers backstop clamp', () => {
    // Very low fare → backstop binds hard
    // fareBeforePickup = 2000, capPct = 25 → backstop = 500
    // uncapped = 1550 + 350 = 1900
    // fee = min(1900, 500) = 500
    const fee = pickupFeeV6({
      pickupKm: 5,
      pickupMin: 10,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 2000,
    });
    expect(fee).toBe(500);
  });

  test('under cap: distance not capped, time still computed', () => {
    // pickup_km=1.5, pickup_min=5 → billable_km=0.5, billable_min=2
    // distance=round(775×0.5)=388, time=round(50×2)=100
    // uncapped=488, backstop=round(20000×25/100)=5000 → 488
    const fee = pickupFeeV6({
      pickupKm: 1.5,
      pickupMin: 5,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 20000,
    });
    expect(fee).toBe(388 + 100); // 488
  });

  test('inside free radius → distance=0, time still charged', () => {
    // pickup_km=0.5 (< free_radius 1.0), pickup_min=8 → billable_min=5
    // distance=0, time=round(50×5)=250
    const fee = pickupFeeV6({
      pickupKm: 0.5,
      pickupMin: 8,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 20000,
    });
    expect(fee).toBe(250); // time only
  });

  test('inside free time → time=0, distance still charged', () => {
    // pickup_km=2, pickup_min=2 (< free_pickup_min 3) → billable_min=0
    // billable_km=1, distance=round(775×1)=775
    const fee = pickupFeeV6({
      pickupKm: 2,
      pickupMin: 2,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 20000,
    });
    expect(fee).toBe(775); // distance only
  });

  test('both free allowances → fee = 0', () => {
    const fee = pickupFeeV6({
      pickupKm: 0.5,
      pickupMin: 2,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: CAP_PCT,
      fareBeforePickup: 20000,
    });
    expect(fee).toBe(0);
  });

  test('cap_pct=0 → backstop = 0, fee = 0 (edge case)', () => {
    const fee = pickupFeeV6({
      pickupKm: 5,
      pickupMin: 10,
      freeRadiusKm: FREE_RADIUS,
      freePickupMin: FREE_TIME,
      kmRate: KM_RATE,
      timeRate: TIME_RATE,
      capBillableKm: CAP_KM,
      capPct: 0,
      fareBeforePickup: 20000,
    });
    expect(fee).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A2: True-up 1.25× upward cap / uncapped downward to 0
// ══════════════════════════════════════════════════════════════════════

describe('T-A2 — true-up 1.25× cap', () => {
  const FIRM = 1000;
  const CAP = 1.25;

  test('downward: realized < firm → uncapped, rider pays less', () => {
    expect(trueUpFinal(FIRM, 500, CAP)).toBe(500);
  });

  test('downward: realized = 0 → final fee 0, not firm', () => {
    expect(trueUpFinal(FIRM, 0, CAP)).toBe(0);
  });

  test('upward: realized < firm × 1.25 → passes through', () => {
    // firm×1.25 = 1250; realized=1100 < 1250 → 1100
    expect(trueUpFinal(FIRM, 1100, CAP)).toBe(1100);
  });

  test('upward: realized ≥ firm × 1.25 → capped at round(firm × 1.25)', () => {
    expect(trueUpFinal(FIRM, 9999, CAP)).toBe(1250);
    expect(trueUpFinal(FIRM, 1250, CAP)).toBe(1250);
  });

  test('upward: exactly at cap boundary → cap value', () => {
    // round(1000 × 1.25) = 1250
    expect(trueUpFinal(FIRM, 1250, CAP)).toBe(1250);
  });

  test('rounding: firm=1001 → cap = round(1001×1.25) = round(1251.25) = 1251', () => {
    expect(trueUpFinal(1001, 5000, CAP)).toBe(1251);
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A3: low_confidence_never_bills_above_firm_quote (Stage 3 invariant)
// ══════════════════════════════════════════════════════════════════════

describe('T-A3 — low-confidence invariant (Stage 3)', () => {
  const FIRM = 1000;
  const MIN_CONF = 0.7;

  const call = (feeFromRealized: number, confidence: number) =>
    finalPickupFeePaisa({
      feeFirm: FIRM,
      feeFromRealized,
      confidence,
      minConfidence: MIN_CONF,
      capMultiplier: 1.25,
    });

  test('low confidence → frozen at firm EXACTLY, even when realized is lower', () => {
    // realized would produce 500 (downward), but confidence < 0.7 → frozen at 1000
    expect(call(500, 0.69)).toBe(FIRM);
    expect(call(0, 0.0)).toBe(FIRM);
  });

  test('low confidence → frozen at firm even when realized is higher', () => {
    // realized would produce 9999 (upward), but frozen at 1000
    expect(call(9999, 0.5)).toBe(FIRM);
  });

  test('high confidence → NOT frozen, uses trueUpFinal', () => {
    // realized 500 → downward → 500
    expect(call(500, 0.95)).toBe(500);
    // realized 1100 → upward under cap → 1100
    expect(call(1100, 0.95)).toBe(1100);
    // realized 9999 → upward over cap → 1250
    expect(call(9999, 0.95)).toBe(1250);
  });

  test('confidence exactly at min is NOT frozen (strict <)', () => {
    // confidence = 0.700 is NOT < 0.7 → passes through to trueUpFinal
    expect(call(500, 0.700)).toBe(500);
  });

  test('invariant: low confidence never bills above firm', () => {
    // Exhaustive: for any confidence < min, result is always firm
    for (let c = 0; c < MIN_CONF; c += 0.05) {
      for (const realized of [0, 500, 1000, 2000, 5000, 9999]) {
        expect(call(realized, c)).toBe(FIRM);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// T-A3 (cont): computePickupTrueup integration of the invariant
// ══════════════════════════════════════════════════════════════════════

describe('T-A3 — computePickupTrueup low-confidence invariant integration', () => {
  const CTX: PickupTrueupContext = {
    feeEnabled: true,
    freeRadiusKm: 0.5,
    capBillableKm: 2.0,
    backstopPct: 40,
    minConfidence: 0.7,
    capMultiplier: 1.25,
    zonePerKmBdt: 775,
    category: 'bike',
    recalculatedTripFareBdt: 50000, // high → backstop won't bind
  };

  function firmRide(overrides: Partial<PickupTrueupRideColumns> = {}): PickupTrueupRideColumns {
    return {
      pickup_fee_state: 'firm',
      pickup_fee_firm_bdt: 900,
      pickup_firm_km: '3.000',
      pickup_realized_km: '4.000',
      pickup_realized_confidence: '0.950',
      ...overrides,
    };
  }

  test('low confidence freezes at firm even when realized would lower the fee', () => {
    const r = computePickupTrueup(
      firmRide({
        pickup_realized_km: '1.500', // would produce a lower fee
        pickup_realized_confidence: '0.500',
      }),
      CTX,
    );
    expect(r.finalFeeBdt).toBe(900);
    expect(r.deltaBdt).toBe(0);
  });

  test('high confidence allows the true-up to proceed', () => {
    const r = computePickupTrueup(
      firmRide({ pickup_realized_km: '1.500', pickup_realized_confidence: '0.900' }),
      CTX,
    );
    // feeKm = min(max(0, 1.5−0.5), 2.0) = 1.0
    // rate = round(775 × 0.75) = 581
    // uncapped = round(581 × 1.0) = 581
    // backstop = round(50000 × 40/100) = 20000 → 581 < 20000
    // trueUpFinal(900, 581, 1.25) = 581 (downward, uncapped)
    expect(r.finalFeeBdt).toBe(581);
    expect(r.deltaBdt).toBe(-319);
  });
});
