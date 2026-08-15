import { z } from "zod";

export const VEHICLE_TYPE_VALUES = [
  "bike_basic",
  "bike_standard",
  "bike_plus",
  "cng",
  "car_economy",
  "car_comfort",
  "car_premium",
  "car_xl",
] as const;
export type VehicleTypeEnum = (typeof VEHICLE_TYPE_VALUES)[number];

/** Zod enum for vehicle type validation — use this everywhere instead of inlining z.enum([...]) */
export const VEHICLE_TYPE_ZOD_ENUM = z.enum(VEHICLE_TYPE_VALUES);

export type VehicleIconName = "bicycle" | "car" | "car-sport" | "bus";

export interface VehicleCategoryDef {
  key: "bike" | "cng" | "car" | "large_car";
  display_en: string;
  display_bn: string;
  icon: VehicleIconName;
  sort: number;
  subtitle_en: string;
  subtitle_bn: string;
}

export const VEHICLE_CATEGORIES: VehicleCategoryDef[] = [
  { key: "bike", display_en: "Bike", display_bn: "বাইক", icon: "bicycle", sort: 0, subtitle_en: "Fast & affordable", subtitle_bn: "দ্রুত ও সাশ্রয়ী" },
  { key: "cng", display_en: "CNG", display_bn: "সিএনজি", icon: "car-sport", sort: 1, subtitle_en: "Auto-rickshaw", subtitle_bn: "অটো রিকশা" },
  { key: "car", display_en: "Car", display_bn: "গাড়ি", icon: "car", sort: 2, subtitle_en: "Comfortable ride", subtitle_bn: "আরামদায়ক যাত্রা" },
  { key: "large_car", display_en: "Large Cars", display_bn: "বড় গাড়ি", icon: "bus", sort: 3, subtitle_en: "Groups & luggage", subtitle_bn: "গ্রুপ ও লাগেজ" },
];

export interface VehicleTypeDefinition {
  key: VehicleTypeEnum;
  display_en: string;
  display_bn: string;
  cc_range: "≤100" | "101-150" | ">150" | null;
  has_ac: boolean | null;
  seats: number;
  min_age_years: number;
  max_age_years: number | null;
  driver_req: { min_rides?: number; min_rating?: number } | null;
  category: "bike" | "cng" | "car" | "large_car";
}

export const VEHICLE_TYPES: VehicleTypeDefinition[] = [
  {
    key: "bike_basic",
    display_en: "Bike Basic",
    display_bn: "বাইক বেসিক",
    cc_range: "≤100",
    has_ac: null,
    seats: 1,
    min_age_years: 1,
    max_age_years: null,
    driver_req: null,
    category: "bike",
  },
  {
    key: "bike_standard",
    display_en: "Bike Standard",
    display_bn: "বাইক স্ট্যান্ডার্ড",
    cc_range: "101-150",
    has_ac: null,
    seats: 1,
    min_age_years: 1,
    max_age_years: null,
    driver_req: null,
    category: "bike",
  },
  {
    key: "bike_plus",
    display_en: "Bike Plus",
    display_bn: "বাইক প্লাস",
    cc_range: ">150",
    has_ac: null,
    seats: 1,
    min_age_years: 1,
    max_age_years: null,
    driver_req: null,
    category: "bike",
  },
  {
    key: "cng",
    display_en: "CNG",
    display_bn: "সিএনজি",
    cc_range: null,
    has_ac: false,
    seats: 3,
    min_age_years: 1,
    max_age_years: null,
    driver_req: null,
    category: "cng",
  },
  {
    key: "car_economy",
    display_en: "Car Economy",
    display_bn: "কার ইকোনমি",
    cc_range: null,
    has_ac: false,
    seats: 4,
    min_age_years: 1,
    max_age_years: 15,
    driver_req: null,
    category: "car",
  },
  {
    key: "car_comfort",
    display_en: "Car Comfort",
    display_bn: "কার কমফোর্ট",
    cc_range: null,
    has_ac: true,
    seats: 4,
    min_age_years: 1,
    max_age_years: 12,
    driver_req: null,
    category: "car",
  },
  {
    key: "car_premium",
    display_en: "Car Premium",
    display_bn: "কার প্রিমিয়াম",
    cc_range: null,
    has_ac: true,
    seats: 4,
    min_age_years: 1,
    max_age_years: 8,
    driver_req: { min_rides: 50, min_rating: 4.5 },
    category: "car",
  },
  {
    key: "car_xl",
    display_en: "Car XL",
    display_bn: "কার এক্সএল",
    cc_range: null,
    has_ac: true,
    seats: 7,
    min_age_years: 1,
    max_age_years: 12,
    driver_req: { min_rides: 25, min_rating: 4.3 },
    category: "large_car",
  },
];

export function getVehicleType(key: VehicleTypeEnum): VehicleTypeDefinition {
  const t = VEHICLE_TYPES.find((v) => v.key === key);
  if (!t) throw new Error(`Unknown vehicle type: ${key}`);
  return t;
}

export function getVehicleTypesByCategory(category: VehicleCategoryDef["key"]): VehicleTypeDefinition[] {
  return VEHICLE_TYPES.filter((v) => v.category === category);
}

export function checkDriverEligibility(
  vehicleType: VehicleTypeEnum,
  driver: { completed_rides_count: number; rating: number },
): { eligible: boolean; reason?: string } {
  const def = getVehicleType(vehicleType);
  if (!def.driver_req) return { eligible: true };
  const { min_rides, min_rating } = def.driver_req;
  // Both thresholds are independent gates: a driver below the ride minimum is
  // ineligible regardless of rating, and vice versa. (Previous logic only
  // rejected drivers who met the ride count but failed the rating — drivers
  // below the ride minimum sailed straight through.)
  if (min_rides && driver.completed_rides_count < min_rides) {
    return {
      eligible: false,
      reason: `${min_rides}+ completed rides required for ${vehicleType}`,
    };
  }
  if (min_rating && driver.rating < min_rating) {
    return {
      eligible: false,
      reason: `Rating must be ≥ ${min_rating} for ${vehicleType}`,
    };
  }
  return { eligible: true };
}

export function validateDriverMinKm(
  vehicleType: VehicleTypeEnum,
  zonePerKmBdt: number,
  minPerKmBdt: number,
): { valid: boolean; error?: string } {
  const lo = Math.floor(zonePerKmBdt * 0.7);
  const hi = Math.ceil(zonePerKmBdt * 1.5);
  if (minPerKmBdt < lo || minPerKmBdt > hi)
    return {
      valid: false,
      error: `min_per_km_bdt must be between ${lo} and ${hi} paisa (70%–150% of zone rate)`,
    };
  return { valid: true };
}
