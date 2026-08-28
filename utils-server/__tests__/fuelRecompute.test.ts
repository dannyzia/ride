/**
 * T-A7: Fuel auto-recompute — tier rate derivation from fuel params.
 *
 * Scheduler job 45 reads fuel_price + efficiency + costs, calls
 * tierRateDerivation, and updates pricing rows. This test verifies
 * the pure computation functions that job 45 depends on.
 *
 * Note: The scheduler job itself is a stub (TODO A-6b). This test
 * covers the computation correctness that the job will use.
 */
import {
  fuelCostPerKm,
  jomaPerKm,
  computeBikeOrCngRates,
  computeCarRates,
  getDefaultFuelParams,
} from '../../lib/tierRateDerivation';

describe('T-A7 — fuel cost per km', () => {
  test('bike: 145 BDT/L ÷ 45 km/L = 3.222 BDT/km → 322 paisa', () => {
    // fuelCostPerKm(price_bdt, efficiency_km/L) → paisa/km
    // Note: fuelConfig prices are in paisa (145 BDT = 14500 paisa)
    // fuelCostPerKm(14500, 45) = round(14500 × 100 / 45) = round(32222) = 32222
    // Wait, the function does (fuelPrice * 100) / fuelEfficiency
    // fuelPrice is already in paisa? Let me check...
    // The function: Math.round((fuelPrice * 100) / fuelEfficiency)
    // If fuelPrice = 145 (BDT), then 145 × 100 / 45 = 322.22 → 322 paisa
    // If fuelPrice = 14500 (paisa), then 14500 × 100 / 45 = 32222 → 32222 paisa
    // The defaults use 14500 (paisa), so result is 32222 paisa/km — that's ~322 BDT/km
    // This seems high for fuel cost. The comment says "BDT→paisa for fuel_price"
    // So fuelPrice input is in BDT and the *100 converts to paisa.
    // With defaults: 14500 (which the comment says is 145 BDT × 100 = 14500 paisa)
    // But the function signature says "fuel_price_bdt_per_unit" = paisa/litre
    // Let's just test with explicit values we control.
    const cost = fuelCostPerKm(145, 45); // 145 BDT/L, 45 km/L
    // Math.round((145 * 100) / 45) = Math.round(322.22) = 322
    expect(cost).toBe(322);
  });

  test('cng: 43 BDT/m³ ÷ 20 km/m³ → paisa', () => {
    const cost = fuelCostPerKm(43, 20);
    // Math.round((43 * 100) / 20) = Math.round(215) = 215
    expect(cost).toBe(215);
  });

  test('zero efficiency → 0 (avoid division by zero)', () => {
    expect(fuelCostPerKm(145, 0)).toBe(0);
  });

  test('negative efficiency → 0', () => {
    expect(fuelCostPerKm(145, -5)).toBe(0);
  });
});

describe('T-A7 — joma per km', () => {
  test('joma 300 BDT / 100 km → 300 paisa/km', () => {
    // jomaPerKm(jomaValueBdt, dailyKm) = round((jomaValueBdt * 100) / dailyKm)
    const joma = jomaPerKm(300, 100);
    // Math.round((300 * 100) / 100) = 300
    expect(joma).toBe(300);
  });

  test('zero daily km → 0 (avoid division by zero)', () => {
    expect(jomaPerKm(300, 0)).toBe(0);
  });
});

describe('T-A7 — bike/CNG rate derivation', () => {
  test('bike: km_rate = fuel + maint + joma; time_rate = target / billed_min', () => {
    const params = getDefaultFuelParams('bike_standard');
    const { km_rate, time_rate } = computeBikeOrCngRates(params);

    // AU-7: params are taka. Engine converts maint to paisa internally.
    // fuel = fuelCostPerKm(140, 45) = round(140 * 100 / 45) = 311 paisa
    // maint = round(0.55 * 100) = 55 paisa
    // joma = round(8000 * 100 / (26 * 100)) = 308 paisa
    const expectedFuel = fuelCostPerKm(params.fuel_price_bdt_per_unit, params.fuel_efficiency_km_per_unit);
    const expectedJoma = Math.round((8000 * 100) / (26 * 100));
    const expectedMaint = Math.round(params.driver_maint_per_km * 100);
    expect(km_rate).toBe(expectedFuel + expectedMaint + expectedJoma);
    // time = round(1100 taka * 100 / 240 min) = 458 paisa/min
    expect(time_rate).toBe(Math.round((params.daily_target_bdt * 100) / params.expected_billed_minutes));

    expect(km_rate).toBeGreaterThan(0);
    expect(time_rate).toBeGreaterThan(0);
  });

  test('CNG: different fuel efficiency produces different km_rate', () => {
    const bikeParams = getDefaultFuelParams('bike_standard');
    const cngParams = getDefaultFuelParams('cng');

    const bike = computeBikeOrCngRates(bikeParams);
    const cng = computeBikeOrCngRates(cngParams);

    // Different fuel efficiency → different fuel cost → different km_rate
    // (CNG has lower fuel price but also lower efficiency)
    expect(bike.km_rate).not.toBe(cng.km_rate);
  });
});

describe('T-A7 — car rate derivation', () => {
  test('car: back-solve from daily target', () => {
    const params = getDefaultFuelParams('car_economy');
    const { km_rate, time_rate } = computeCarRates(params);

    expect(km_rate).toBeGreaterThan(0);
    expect(time_rate).toBeGreaterThan(0);
  });
});

describe('T-A7 — getDefaultFuelParams', () => {
  test('bike_standard returns bike defaults', () => {
    const p = getDefaultFuelParams('bike_standard');
    expect(p.fuel_price_bdt_per_unit).toBe(140); // REV-4: 140 BDT/L petrol
    expect(p.fuel_efficiency_km_per_unit).toBe(45); // bike category default
  });

  test('cng returns CNG defaults', () => {
    const p = getDefaultFuelParams('cng');
    expect(p.fuel_price_bdt_per_unit).toBe(43);
    expect(p.fuel_efficiency_km_per_unit).toBe(20);
  });

  test('car_economy returns car defaults', () => {
    const p = getDefaultFuelParams('car_economy');
    expect(p.fuel_price_bdt_per_unit).toBe(145);
    expect(p.fuel_efficiency_km_per_unit).toBe(12);
  });

  test('unknown vehicle type falls back to bike', () => {
    const p = getDefaultFuelParams('unknown_type');
    expect(p.fuel_price_bdt_per_unit).toBe(140); // REV-4: bike default
  });
});
