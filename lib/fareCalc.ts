import { logger } from "./logger";

export interface PricingRow {
  base_fare_bdt: number;
  per_km_bdt: number;
  intercity_per_km_bdt?: number;
  per_min_bdt: number;
  floor_length_km: number;
  floor_min: number;
  brta_fare_ceiling_bdt?: number | null;
  platform_commission_percent?: number | null;
}

export interface PlatformCeilings {
  brta_max_base_bdt: number;
  brta_max_per_km_bdt: number;
  brta_max_per_min_bdt: number;
}

export interface FareBreakdown {
  base_fare_bdt: number;
  distance_charge_bdt: number;
  inside_charge_bdt: number;
  outside_charge_bdt: number;
  time_charge_bdt: number;
  floor_fare_bdt: number;
  total_bdt: number;
  platform_commission_bdt: number;
  driver_net_bdt: number;
  distance_km: number;
  origin_city: string | null;
  is_intercity: boolean;
  inside_km: number;
  outside_km: number;
  ride_time_min: number;
}

/**
 * Calculate fare using the extended v2 formula with intercity split-rate:
 *
 *   effective_outside_rate = intercity_per_km_bdt > 0 ? intercity_per_km_bdt : per_km_bdt
 *   inside_charge  = round(per_km_bdt × inside_km)
 *   outside_charge = round(effective_outside_rate × outside_km)
 *   distance_charge = inside_charge + outside_charge
 *   time_charge      = ride_time_min × per_min_bdt
 *   computed_total   = base_fare_bdt + distance_charge + time_charge
 *   floor_fare       = base_fare_bdt + round(per_km_bdt × floor_length_km) + (floor_min × per_min_bdt)
 *   total_fare       = max(computed_total, floor_fare)
 *   platform_fee     = round(total_fare × platform_commission_percent / 100)
 *   driver_net       = total_fare − platform_fee
 *
 * For non-intercity rides: pass outsideKm = 0 (default). The formula collapses to normal v2.
 * For rural-origin rides: pass outsideKm = 0. origin_city and is_intercity are set by the caller.
 *
 * @param pricing - Pricing row from DB
 * @param insideKm - Distance inside origin city (or total distance for non-intercity)
 * @param rideTimeMin - 0 at estimate time; actual ride_time_min at completion
 * @param ceilings - Optional BRTA ceiling values for warning checks
 * @param outsideKm - Distance outside origin city; 0 for non-intercity rides (default)
 */
export function calculateFare(
  pricing: PricingRow,
  insideKm: number,
  rideTimeMin: number,
  ceilings?: PlatformCeilings,
  outsideKm: number = 0,
): FareBreakdown {
  // Intercity rate fallback: if intercity_per_km_bdt = 0, use normal per_km_bdt for outside km
  const intercityRate = pricing.intercity_per_km_bdt ?? 0;
  const effectiveOutsideRate = intercityRate > 0 ? intercityRate : pricing.per_km_bdt;

  // Distance charges (integer paisa, round after each multiplication)
  const insideCharge = Math.round(pricing.per_km_bdt * insideKm);
  const outsideCharge = Math.round(effectiveOutsideRate * outsideKm);
  const distanceCharge = insideCharge + outsideCharge;

  // Time charge (no free-wait subtraction — timer handles that)
  const timeCharge = rideTimeMin * pricing.per_min_bdt;

  // Computed total
  const computedTotal = pricing.base_fare_bdt + distanceCharge + timeCharge;

  // Floor fare
  const floorDistanceCharge = Math.round(
    pricing.per_km_bdt * pricing.floor_length_km,
  );
  const floorTimeCharge = pricing.floor_min * pricing.per_min_bdt;
  const floorFare =
    pricing.base_fare_bdt + floorDistanceCharge + floorTimeCharge;

  // Final fare is the higher of computed and floor
  const totalFare = Math.max(computedTotal, floorFare);

  // Platform commission (percentage of final fare, after floor)
  const commissionPct = pricing.platform_commission_percent ?? 0;
  const platformFee =
    commissionPct > 0 ? Math.round((totalFare * commissionPct) / 100) : 0;

  // Driver net
  const driverNet = totalFare - platformFee;

  const totalDistanceKm = insideKm + outsideKm;

  // BRTA ceiling warnings (logged, never block)
  if (ceilings) {
    if (pricing.base_fare_bdt > ceilings.brta_max_base_bdt) {
      logger.warn("[fareCalc] base_fare exceeds BRTA ceiling", {
        value: pricing.base_fare_bdt,
        ceiling: ceilings.brta_max_base_bdt,
      });
    }
    if (pricing.per_km_bdt > ceilings.brta_max_per_km_bdt) {
      logger.warn("[fareCalc] per_km_bdt exceeds BRTA ceiling", {
        value: pricing.per_km_bdt,
        ceiling: ceilings.brta_max_per_km_bdt,
      });
    }
    if (pricing.per_min_bdt > ceilings.brta_max_per_min_bdt) {
      logger.warn("[fareCalc] per_min_bdt exceeds BRTA ceiling", {
        value: pricing.per_min_bdt,
        ceiling: ceilings.brta_max_per_min_bdt,
      });
    }
    if (
      pricing.brta_fare_ceiling_bdt != null &&
      totalFare > pricing.brta_fare_ceiling_bdt
    ) {
      logger.warn("[fareCalc] final fare exceeds per-row BRTA ceiling", {
        totalFare,
        ceiling: pricing.brta_fare_ceiling_bdt,
      });
    }
  }

  return {
    base_fare_bdt: pricing.base_fare_bdt,
    distance_charge_bdt: distanceCharge,
    inside_charge_bdt: insideCharge,
    outside_charge_bdt: outsideCharge,
    time_charge_bdt: timeCharge,
    floor_fare_bdt: floorFare,
    total_bdt: totalFare,
    platform_commission_bdt: platformFee,
    driver_net_bdt: driverNet,
    distance_km: totalDistanceKm,
    origin_city: null,
    is_intercity: false,
    inside_km: insideKm,
    outside_km: outsideKm,
    ride_time_min: rideTimeMin,
  };
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return (
    Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000) / 1000
  );
}

export function paisaToTaka(paisa: number): number {
  return paisa / 100;
}
