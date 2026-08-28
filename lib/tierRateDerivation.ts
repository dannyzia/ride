/**
 * Fare Framework v6 — Per-tier rate derivation (v6.md §5, owner ruling REV-4).
 *
 * Bike/CNG rates stack bottom-up: fuel/km + driver_maint/km + joma/km.
 * REV-4: parking is owner-borne and recovered inside joma — no parking/km term.
 * Car rates back-solve from daily_target: owner takes 50% of net (joma = 50% of net).
 *
 * All money values in integer paisa. All rates in paisa-per-unit (km, min).
 * Exception (REV-4): the joma_* fields below are taka-scale inputs — ×100
 * converts to paisa inside jomaPerKmFromParams, matching the taka-scale
 * joma_*_bdt platform_config keys (like fuel_price_*_bdt).
 */

import { PICKUP_CATEGORY, type PickupCategory } from './vehicleTypes';

// ── Tier fuel parameters (v6.md §5, REV-4) ──

export interface TierFuelParams {
  fuel_price_bdt_per_unit: number; // paisa/litre (bike) or paisa/m³ (CNG)
  fuel_efficiency_km_per_unit: number;
  driver_maint_per_km: number; // paisa/km (≈50% of total)
  daily_target_bdt: number; // paisa
  expected_billed_minutes: number;

  // REV-4: joma recovery inside bike/CNG km_rate (taka-scale inputs, ×100 → paisa).
  // Cars use the 50%-net back-solve and never set these.
  joma_monthly_bdt?: number; // BDT/month — bike tiers (eco 8000 / std 10000 / prem 12000)
  joma_daily_bdt?: number; // BDT/day — CNG (800)
  operating_days_per_month?: number; // default 26
  estimated_daily_km?: number; // daily-km basis for the joma→per-km conversion
}

/**
 * Fuel cost per km in paisa:
 * fuel_price_bdt_per_unit / fuel_efficiency_km_per_unit * 100 (BDT→paisa if needed)
 */
export function fuelCostPerKm(
  fuelPrice: number,
  fuelEfficiency: number,
): number {
  if (fuelEfficiency <= 0) return 0;
  return Math.round((fuelPrice * 100) / fuelEfficiency); // BDT→paisa for fuel_price
}

/**
 * Joma per km in paisa (daily joma / estimated daily km).
 * For car "50% net" joma type, joma is not a km_rate component — it's handled
 * by the back-solve (computeCarRates). Pass joma_per_km = 0 for car tiers.
 */
export function jomaPerKm(jomaValueBdt: number, dailyKm: number): number {
  if (dailyKm <= 0) return 0;
  return Math.round((jomaValueBdt * 100) / dailyKm); // BDT→paisa
}

/**
 * Joma per km in paisa from TierFuelParams (REV-4), rounded once to integer paisa.
 *   Monthly (bike tiers): (monthly_taka × 100) / (operating_days × daily_km)
 *   Daily (CNG):          (daily_taka × 100) / daily_km
 * Returns 0 when no joma basis is set or estimated_daily_km is missing/<= 0.
 */
export function jomaPerKmFromParams(params: TierFuelParams): number {
  const dailyKm = params.estimated_daily_km ?? 0;
  if (dailyKm <= 0) return 0;
  if (params.joma_monthly_bdt !== undefined) {
    const days = params.operating_days_per_month ?? 26;
    return Math.round((params.joma_monthly_bdt * 100) / (days * dailyKm));
  }
  if (params.joma_daily_bdt !== undefined) {
    return jomaPerKm(params.joma_daily_bdt, dailyKm);
  }
  return 0;
}

/**
 * Compute km_rate and time_rate for bike/CNG tiers (bottom-up cost stack).
 *
 * REV-4: km_rate = fuel/km + driver_maint/km + joma/km
 *        (parking removed — owner-borne, recovered inside joma)
 * time_rate = daily_target_paisa / expected_billed_minutes
 */
export function computeBikeOrCngRates(params: TierFuelParams): {
  km_rate: number;
  time_rate: number;
} {
  const fuel = fuelCostPerKm(params.fuel_price_bdt_per_unit, params.fuel_efficiency_km_per_unit);
  const joma = jomaPerKmFromParams(params);
  const kmRate = fuel + params.driver_maint_per_km + joma;
  const timeRate =
    params.expected_billed_minutes > 0
      ? Math.round((params.daily_target_bdt * 100) / params.expected_billed_minutes)
      : 0;

  return { km_rate: Math.round(kmRate), time_rate: timeRate };
}

/**
 * Compute km_rate and time_rate for car tiers (back-solve from daily target).
 *
 * Car joma = 50% of net revenue. Owner takes half of (fare − fuel).
 * We back-solve: required_gross ≈ 2 × (target + driver_costs) + fuel.
 * Then decompose into km_rate + time_rate for display.
 *
 * REV-4: car fuel fork closed — octane basis. Parking is owner-borne and NOT
 * part of car km_rate; joma is not stacked into car km_rate (the 50%-net
 * back-solve already carries the owner's share).
 */
export function computeCarRates(params: TierFuelParams): {
  km_rate: number;
  time_rate: number;
} {
  // km_rate covers fuel + maint; the target/joma half comes via time_rate
  const fuel = fuelCostPerKm(params.fuel_price_bdt_per_unit, params.fuel_efficiency_km_per_unit);
  const kmRate = fuel + params.driver_maint_per_km;
  const timeRate =
    params.expected_billed_minutes > 0
      ? Math.round((params.daily_target_bdt * 100) / params.expected_billed_minutes)
      : 0;

  return { km_rate: Math.round(kmRate), time_rate: timeRate };
}

/**
 * Look up the fuel parameters for a specific vehicle type from platform_config.
 * Returns REV-4 default values (v6.md §5 table + owner ruling REV-4).
 */
export function getDefaultFuelParams(vehicleType: string): TierFuelParams {
  const category = PICKUP_CATEGORY[vehicleType as keyof typeof PICKUP_CATEGORY] ?? 'bike';

  // Defaults from v6.md §5 + REV-4 (paisa = BDT × 100; joma_* fields are taka)
  const defaults: Record<PickupCategory, TierFuelParams> = {
    bike: {
      fuel_price_bdt_per_unit: 14000, // 140 BDT/L petrol (REV-4)
      fuel_efficiency_km_per_unit: 45, // km/L
      driver_maint_per_km: 55, // 0.55 BDT
      daily_target_bdt: 110000, // 1100 BDT
      expected_billed_minutes: 240,
      // REV-4 bike joma three-tier monthly (BDT): eco 8000 / std 10000 / prem 12000.
      // Per-category default = eco tier; std/prem callers override joma_monthly_bdt.
      joma_monthly_bdt: 8000,
      operating_days_per_month: 26,
      estimated_daily_km: 100,
    },
    cng: {
      fuel_price_bdt_per_unit: 4300, // 43 BDT/m³
      fuel_efficiency_km_per_unit: 20, // km/m³
      driver_maint_per_km: 105, // 1.05 BDT
      daily_target_bdt: 120000, // 1200 BDT
      expected_billed_minutes: 220,
      joma_daily_bdt: 800, // REV-4 (BDT/day)
      estimated_daily_km: 120,
    },
    car: {
      fuel_price_bdt_per_unit: 14500, // 145 BDT/L octane (REV-4 — car fuel fork closed)
      fuel_efficiency_km_per_unit: 12, // km/L (car_compact/economy)
      driver_maint_per_km: 345, // 3.45 BDT
      daily_target_bdt: 125000, // 1250 BDT
      expected_billed_minutes: 200,
    },
  };

  return defaults[category];
}
