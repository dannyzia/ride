/**
 * Fare Framework v6 — Fuel price configuration (v6.md §5, §9).
 *
 * Live config via platform_config (never cached).
 */

import { getFareFrameworkConfig, parseConfigNumber } from './fareFrameworkConfig';

/**
 * Fuel config keys for platform_config.
 * Per-category fuel type and efficiency, plus global fuel prices.
 */
export const FUEL_CONFIG_KEYS = [
  // Global fuel prices (BDT, admin-updatable)
  'fuel_price_octane_bdt',
  'fuel_price_petrol_bdt',
  'fuel_price_cng_bdt',

  // Per-tier fuel efficiency (km/L or km/m³)
  'fuel_efficiency_bike_basic',
  'fuel_efficiency_bike_standard',
  'fuel_efficiency_bike_plus',
  'fuel_efficiency_cng',
  'fuel_efficiency_car_compact',
  'fuel_efficiency_car_economy',
  'fuel_efficiency_car_comfort',
  'fuel_efficiency_car_premium',
  'fuel_efficiency_car_xl',

  // Driver maintenance per km (paisa) — 50% of total maint
  'driver_maint_per_km_bike',
  'driver_maint_per_km_cng',
  'driver_maint_per_km_car',

  // Parking per km (paisa)
  'parking_per_km_bike',
  'parking_per_km_cng',
  'parking_per_km_car',

  // Daily target per tier (paisa)
  'daily_target_bdt_bike',
  'daily_target_bdt_cng',
  'daily_target_bdt_car',

  // Expected billed minutes per tier
  'expected_billed_minutes_bike',
  'expected_billed_minutes_cng',
  'expected_billed_minutes_car',

] as const;

export type FuelConfigKey = (typeof FUEL_CONFIG_KEYS)[number];

export interface FuelConfig {
  fuel_price_octane: number;
  fuel_price_petrol: number;
  fuel_price_cng: number;
  fuel_efficiency: Record<string, number>;
  driver_maint_per_km: Record<string, number>;
  parking_per_km: Record<string, number>;
  daily_target_bdt: Record<string, number>;
  expected_billed_minutes: Record<string, number>;
}

/**
 * Load fuel config from platform_config.
 */
export async function getFuelConfig(): Promise<FuelConfig> {
  const raw = await getFareFrameworkConfig(FUEL_CONFIG_KEYS);

  return {
    fuel_price_octane: parseConfigNumber(raw.fuel_price_octane_bdt, 145),
    fuel_price_petrol: parseConfigNumber(raw.fuel_price_petrol_bdt, 145),
    fuel_price_cng: parseConfigNumber(raw.fuel_price_cng_bdt, 43),
    fuel_efficiency: {
      bike_basic: parseConfigNumber(raw.fuel_efficiency_bike_basic, 45),
      bike_standard: parseConfigNumber(raw.fuel_efficiency_bike_standard, 40),
      bike_plus: parseConfigNumber(raw.fuel_efficiency_bike_plus, 33),
      cng: parseConfigNumber(raw.fuel_efficiency_cng, 20),
      car_compact: parseConfigNumber(raw.fuel_efficiency_car_compact, 12),
      car_economy: parseConfigNumber(raw.fuel_efficiency_car_economy, 10),
      car_comfort: parseConfigNumber(raw.fuel_efficiency_car_comfort, 8),
      car_premium: parseConfigNumber(raw.fuel_efficiency_car_premium, 10),
      car_xl: parseConfigNumber(raw.fuel_efficiency_car_xl, 13),
    },
    driver_maint_per_km: {
      bike: parseConfigNumber(raw.driver_maint_per_km_bike, 55),
      cng: parseConfigNumber(raw.driver_maint_per_km_cng, 105),
      car: parseConfigNumber(raw.driver_maint_per_km_car, 345),
    },
    parking_per_km: {
      bike: parseConfigNumber(raw.parking_per_km_bike, 10),
      cng: parseConfigNumber(raw.parking_per_km_cng, 15),
      car: parseConfigNumber(raw.parking_per_km_car, 20),
    },
    daily_target_bdt: {
      bike: parseConfigNumber(raw.daily_target_bdt_bike, 110000),
      cng: parseConfigNumber(raw.daily_target_bdt_cng, 120000),
      car: parseConfigNumber(raw.daily_target_bdt_car, 125000),
    },
    expected_billed_minutes: {
      bike: parseConfigNumber(raw.expected_billed_minutes_bike, 240),
      cng: parseConfigNumber(raw.expected_billed_minutes_cng, 220),
      car: parseConfigNumber(raw.expected_billed_minutes_car, 200),
    },
  };
}
