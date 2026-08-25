import { z } from "zod";

// ── Canonical vehicle type values (Postgres enum lockstep) ──────────────
export const VEHICLE_TYPE_VALUES = [
  "bike_basic",
  "bike_standard",
  "bike_plus",
  "cng",
  "car_compact",
  "car_economy",
  "car_comfort",
  "car_premium",
  "car_xl",
] as const;
export type VehicleTypeEnum = (typeof VEHICLE_TYPE_VALUES)[number];

/** Zod enum for vehicle type validation — use this everywhere instead of inlining z.enum([...]) */
export const VEHICLE_TYPE_ZOD_ENUM = z.enum(VEHICLE_TYPE_VALUES);

// ── Canonical body type values (Postgres enum lockstep) ─────────────────
export const BODY_TYPE_VALUES = [
  "motorcycle",
  "scooter",
  "auto_rickshaw",
  "hatchback",
  "sedan",
  "crossover",
  "suv",
  "suv_large",
  "mpv",
  "van",
  "minibus",
] as const;
export type BodyTypeEnum = (typeof BODY_TYPE_VALUES)[number];
export const BODY_TYPE_ZOD_ENUM = z.enum(BODY_TYPE_VALUES);

// ── Shared tier ordering (upgrade / downgrade) ──────────────────────────
// Higher number = higher tier. Reused by upgrade+api, downgrade+api, and
// any other code that needs a canonical ordinal.
export const VEHICLE_TIER_ORDER: Record<VehicleTypeEnum, number> = {
  bike_basic: 0,
  bike_standard: 1,
  bike_plus: 2,
  cng: 3,
  car_compact: 4,
  car_economy: 5,
  car_comfort: 6,
  car_premium: 7,
  car_xl: 8,
};

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
  subtitle_en: string;
  subtitle_bn: string;
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
    subtitle_en: "Fast & affordable",
    subtitle_bn: "দ্রুত ও সাশ্রয়ী",
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
    subtitle_en: "Popular commuter bike",
    subtitle_bn: "জনপ্রিয় কমিউটার বাইক",
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
    subtitle_en: "Premium performance bike",
    subtitle_bn: "প্রিমিয়াম পারফরম্যান্স বাইক",
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
    subtitle_en: "Auto-rickshaw",
    subtitle_bn: "অটো রিকশা",
    cc_range: null,
    has_ac: false,
    seats: 3,
    min_age_years: 1,
    max_age_years: null,
    driver_req: null,
    category: "cng",
  },
  {
    key: "car_compact",
    display_en: "Car Compact",
    display_bn: "কার কম্প্যাক্ট",
    subtitle_en: "Affordable enclosed ride",
    subtitle_bn: "সাশ্রয়ী মূল্যে বদ্ধ রাইড",
    cc_range: null,
    has_ac: null,
    seats: 4,
    min_age_years: 1,
    max_age_years: 15,
    driver_req: null,
    category: "car",
  },
  {
    key: "car_economy",
    display_en: "Car Economy",
    display_bn: "কার ইকোনমি",
    subtitle_en: "Everyday sedan ride",
    subtitle_bn: "প্রতিদিনের সেডান রাইড",
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
    subtitle_en: "Air-conditioned comfort",
    subtitle_bn: "এয়ার-কন্ডিশনড আরাম",
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
    subtitle_en: "Luxury ride experience",
    subtitle_bn: "প্রিমিয়াম রাইড অভিজ্ঞতা",
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
    subtitle_en: "Group & family rides",
    subtitle_bn: "গ্রুপ ও পরিবারের রাইড",
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

// ── Authoritative vehicle classifier ──────────────────────────────────────
// Pure function — no DB access. Resolves allowlist state server-side and
// passes premium_match as a boolean.
//
// Rule order (first match wins):
//  1. auto_rickshaw → cng
//  2. motorcycle/scooter ≤110cc → bike_basic
//  3. motorcycle/scooter 111–150cc → bike_standard
//  4. motorcycle/scooter >150cc → bike_plus
//  5. seats ≥6 + van/mpv/minibus/suv_large → car_xl
//  6. premium match (server-resolved) → car_premium
//  7. cc > 2000 → car_premium
//  8. suv/crossover with cc ≥ 1001 → car_comfort (SUV floor)
//  9. cc ≤ 1000 → car_compact
// 10. cc 1001–1500 → car_economy
// 11. cc 1501–2000 → car_comfort
// 12. fallback → manual review (returned as null)

export interface ClassifyVehicleInput {
  body_type?: BodyTypeEnum | null;
  engine_cc?: number | null;
  registered_seats?: number | null;
  premium_match?: boolean;
}

export interface ClassifyVehicleResult {
  vehicle_type: VehicleTypeEnum | null; // null = manual review needed
  rule: string;
}

// ── §10.2: Body type display constants (bilingual, grouped) ─────────────
export const BODY_TYPE_GROUPS: { group: string; items: { value: BodyTypeEnum; en: string; bn: string }[] }[] = [
  {
    group: "Two-Wheelers",
    items: [
      { value: "motorcycle", en: "Motorcycle", bn: "মোটরসাইকেল" },
      { value: "scooter", en: "Scooter", bn: "স্কুটার" },
    ],
  },
  {
    group: "Three-Wheelers",
    items: [
      { value: "auto_rickshaw", en: "Auto Rickshaw", bn: "সিএনজি অটোরিকশা" },
    ],
  },
  {
    group: "Cars",
    items: [
      { value: "hatchback", en: "Hatchback", bn: "হ্যাচব্যাক" },
      { value: "sedan", en: "Sedan", bn: "সেডান" },
      { value: "crossover", en: "Crossover", bn: "ক্রসওভার" },
      { value: "suv", en: "SUV", bn: "এসইউভি" },
    ],
  },
  {
    group: "Large Vehicles",
    items: [
      { value: "suv_large", en: "Large SUV", bn: "বড় এসইউভি" },
      { value: "mpv", en: "MPV", bn: "এমপিভি" },
      { value: "van", en: "Van", bn: "ভ্যান" },
      { value: "minibus", en: "Minibus", bn: "মিনিবাস" },
    ],
  },
];

export const BODY_TYPE_DISPLAY: Record<BodyTypeEnum, { en: string; bn: string }> = Object.fromEntries(
  BODY_TYPE_GROUPS.flatMap((g) => g.items.map((i) => [i.value, { en: i.en, bn: i.bn }])),
) as Record<BodyTypeEnum, { en: string; bn: string }>;

export function classifyVehicle(input: ClassifyVehicleInput): ClassifyVehicleResult {
  const { body_type, engine_cc, registered_seats, premium_match } = input;
  const seats = registered_seats ?? 0;
  const cc = engine_cc ?? 0;
  const isMotorcycle = body_type === "motorcycle" || body_type === "scooter";

  // Rule 1: auto-rickshaw → cng
  if (body_type === "auto_rickshaw") {
    return { vehicle_type: "cng", rule: "auto_rickshaw" };
  }

  // Rules 2–4: motorcycle/scooter bands
  if (isMotorcycle) {
    if (cc <= 110) return { vehicle_type: "bike_basic", rule: "motorcycle_cc_bands" };
    if (cc <= 150) return { vehicle_type: "bike_standard", rule: "motorcycle_cc_bands" };
    return { vehicle_type: "bike_plus", rule: "motorcycle_cc_bands" };
  }

  // Rule 5: XL — registered seats ≥ 6 AND body type is van/mpv/minibus/suv_large
  if (seats >= 6) {
    const xlBodies: BodyTypeEnum[] = ["van", "mpv", "minibus", "suv_large"];
    if (body_type && xlBodies.includes(body_type)) {
      return { vehicle_type: "car_xl", rule: "seats_body_xl" };
    }
    // 6+ seats but not an XL body type → still XL if body is recognized
    // as a van/MPV family vehicle even if classified differently
  }

  // Rule 6: premium allowlist (server-resolved flag)
  if (premium_match) {
    return { vehicle_type: "car_premium", rule: "premium_allowlist" };
  }

  // Rule 7: cc > 2000 → car_premium
  if (cc > 2000) {
    return { vehicle_type: "car_premium", rule: "cc_over_2000" };
  }

  // Rule 8: SUV/crossover floor — body type suv/crossover with cc ≥ 1001
  if (
    (body_type === "suv" || body_type === "crossover") &&
    cc >= 1001
  ) {
    return { vehicle_type: "car_comfort", rule: "suv_crossover_floor" };
  }

  // Rule 9: cc ≤ 1000 → car_compact
  if (cc > 0 && cc <= 1000) {
    return { vehicle_type: "car_compact", rule: "cc_compact_band" };
  }

  // Rule 10: cc 1001–1500 → car_economy
  if (cc >= 1001 && cc <= 1500) {
    return { vehicle_type: "car_economy", rule: "cc_economy_band" };
  }

  // Rule 11: cc 1501–2000 → car_comfort
  if (cc >= 1501 && cc <= 2000) {
    return { vehicle_type: "car_comfort", rule: "cc_comfort_band" };
  }

  // Rule 12: missing/ambiguous data → manual review
  return { vehicle_type: null, rule: "manual_review" };
}

// ═══════════════════════════════════════════════════════════════════
// Ride Fare Framework v1 — vehicle category mapping (ruling 7)
// ═══════════════════════════════════════════════════════════════════

export type PickupCategory = 'bike' | 'cng' | 'car';

/** Map a vehicle type to its pickup-fee category. */
export const PICKUP_CATEGORY: Record<VehicleTypeEnum, PickupCategory> = {
  bike_basic: 'bike',
  bike_standard: 'bike',
  bike_plus: 'bike',
  cng: 'cng',
  car_compact: 'car',
  car_economy: 'car',
  car_comfort: 'car',
  car_premium: 'car',
  car_xl: 'car',
};
