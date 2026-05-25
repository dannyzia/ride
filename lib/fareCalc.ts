import { logger } from './logger';

export interface PricingRow {
  base_fare_bdt:              number;
  per_km_bdt:                 number;
  per_min_wait_bdt:           number;
  free_wait_minutes:          number;
  minimum_fare_bdt:           number;
  brta_fare_ceiling_bdt?:     number | null;
  platform_commission_percent?: number | null;
}

export interface PlatformCeilings {
  brta_max_base_bdt:          number;
  brta_max_per_km_bdt:        number;
  brta_max_wait_per_2min_bdt: number;
}

export interface FareBreakdown {
  base_fare_bdt:              number;
  distance_charge_bdt:        number;
  wait_charge_bdt:            number;
  platform_commission_bdt:    number;
  total_bdt:                  number;
  minimum_fare_bdt:           number;
  distance_km:                number;
  wait_minutes:               number;
}

export function calculateFare(
  pricing:      PricingRow,
  distanceKm:   number,
  waitMinutes:  number,
  ceilings?:    PlatformCeilings,
): FareBreakdown {
  const distanceCharge = Math.round(pricing.per_km_bdt * distanceKm);
  const billableWait   = Math.max(0, waitMinutes - pricing.free_wait_minutes);
  const waitCharge     = billableWait * pricing.per_min_wait_bdt;
  const computedTotal  = pricing.base_fare_bdt + distanceCharge + waitCharge;
  const finalFare      = Math.max(computedTotal, pricing.minimum_fare_bdt);

  // Platform commission (percentage of total fare, after minimum floor)
  const commissionPct   = pricing.platform_commission_percent ?? 0;
  const commissionBdt   = commissionPct > 0 ? Math.round(finalFare * commissionPct / 100) : 0;

  if (ceilings) {
    if (pricing.base_fare_bdt > ceilings.brta_max_base_bdt) {
      logger.warn('[fareCalc] base_fare exceeds BRTA ceiling', {
        value: pricing.base_fare_bdt, ceiling: ceilings.brta_max_base_bdt,
      });
    }
    if (pricing.per_km_bdt > ceilings.brta_max_per_km_bdt) {
      logger.warn('[fareCalc] per_km_bdt exceeds BRTA ceiling', {
        value: pricing.per_km_bdt, ceiling: ceilings.brta_max_per_km_bdt,
      });
    }
    if (pricing.per_min_wait_bdt * 2 > ceilings.brta_max_wait_per_2min_bdt) {
      logger.warn('[fareCalc] per_min_wait_bdt (x2) exceeds BRTA ceiling', {
        value: pricing.per_min_wait_bdt * 2,
        ceiling: ceilings.brta_max_wait_per_2min_bdt,
      });
    }
    if (pricing.brta_fare_ceiling_bdt != null && finalFare > pricing.brta_fare_ceiling_bdt) {
      logger.warn('[fareCalc] final fare exceeds per-row BRTA ceiling', {
        finalFare, ceiling: pricing.brta_fare_ceiling_bdt,
      });
    }
  }

  return {
    base_fare_bdt:              pricing.base_fare_bdt,
    distance_charge_bdt:        distanceCharge,
    wait_charge_bdt:            waitCharge,
    platform_commission_bdt:    commissionBdt,
    total_bdt:                  finalFare,
    minimum_fare_bdt:           pricing.minimum_fare_bdt,
    distance_km:                distanceKm,
    wait_minutes:               waitMinutes,
  };
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000;
}

export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}
