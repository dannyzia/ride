/**
 * Bangladesh-tradition truck catalog (Phase 5) — display variants for the
 * rental marketplace, per Zia's approved briefing (rulings V1–V6) and
 * implementation-spec rulings §0.1.13–16.
 *
 * Trucks are listed the Bangladeshi way: length (ft) × tonnage × body style
 * (open/covered), grouped into use-case tabs, each row annotated with typical
 * cargo. Every variant maps N:1 onto a rental_vehicle_type enum value — the
 * enum (src/db/schema.ts) stays the single source of truth; nothing here
 * redefines it. Body style travels to the API as a cargo_tags chip.
 */
import { rentalVehicleTypeEnum } from "@/src/db/schema";

export type RentalVehicleType = (typeof rentalVehicleTypeEnum.enumValues)[number];
export type TruckVehicleType = Exclude<
  RentalVehicleType,
  `car_${string}` | `ambulance_${string}`
>;

/** Truck-only enum values, derived from the DB enum — never inline. */
export const TRUCK_VEHICLE_TYPES: readonly TruckVehicleType[] =
  rentalVehicleTypeEnum.enumValues.filter(
    (v): v is TruckVehicleType =>
      !v.startsWith("car_") && !v.startsWith("ambulance_"),
  );

export interface TruckVariant {
  key: string;
  vehicleType: TruckVehicleType;
  titleEn: string;
  titleBn: string;
  bodyStyle: "open" | "covered" | null;
  cargoHint: string;
}

export interface TruckTab {
  id: string;
  labelEn: string;
  labelBn: string;
  variants: TruckVariant[];
}

export const TRUCK_TABS: TruckTab[] = [
  {
    id: "pickup",
    labelEn: "Pickup",
    labelBn: "পিকআপ",
    variants: [
      { key: "pickup-7ft-1t-open", vehicleType: "pickup", titleEn: "7 ft · 1 Ton (Open)", titleBn: "৭ ফুট ১ টন (খোলা)", bodyStyle: "open", cargoHint: "Furniture, electronics, hardware" },
      { key: "pickup-7ft-1t-covered", vehicleType: "pickup", titleEn: "7 ft · 1 Ton (Covered)", titleBn: "৭ ফুট ১ টন (কাভার)", bodyStyle: "covered", cargoHint: "Furniture, electronics, hardware" },
      { key: "pickup-9ft-1half-open", vehicleType: "pickup", titleEn: "9 ft · 1.5 Ton (Open)", titleBn: "৯ ফুট ১.৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Cargo goods, furniture, hardware" },
      { key: "pickup-9ft-1half-covered", vehicleType: "pickup", titleEn: "9 ft · 1.5 Ton (Covered)", titleBn: "৯ ফুট ১.৫ টন (কাভার)", bodyStyle: "covered", cargoHint: "Cargo goods, furniture, hardware" },
      { key: "pickup-11ft-2t-open", vehicleType: "pickup", titleEn: "11 ft · 2 Ton (Open)", titleBn: "১১ ফুট ২ টন (খোলা)", bodyStyle: "open", cargoHint: "Cargo goods, furniture, hardware" },
      { key: "pickup-11ft-2t-covered", vehicleType: "pickup", titleEn: "11 ft · 2 Ton (Covered)", titleBn: "১১ ফুট ২ টন (কাভার)", bodyStyle: "covered", cargoHint: "Cargo goods, furniture, hardware" },
    ],
  },
  {
    id: "freight",
    labelEn: "Freight",
    labelBn: "মালবাহী",
    variants: [
      // V2 ruling: source app's "0.5 ton" was a typo — corrected to 5 tons.
      { key: "freight-14ft-5t-open", vehicleType: "mini_truck", titleEn: "14 ft · 5 Ton (Open)", titleBn: "১৪ ফুট ৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Heavy goods" },
      { key: "freight-14ft-5t-covered", vehicleType: "mini_truck", titleEn: "14 ft · 5 Ton (Covered)", titleBn: "১৪ ফুট ৫ টন (কাভার)", bodyStyle: "covered", cargoHint: "Heavy goods" },
      { key: "freight-17ft-7half-open", vehicleType: "medium_truck", titleEn: "17 ft · 7.5 Ton (Open)", titleBn: "১৭ ফুট ৭.৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Stone, sand, cement, bricks, loose goods" },
      { key: "freight-17ft-7half-covered", vehicleType: "medium_truck", titleEn: "17 ft · 7.5 Ton (Covered)", titleBn: "১৭ ফুট ৭.৫ টন (কাভার)", bodyStyle: "covered", cargoHint: "Stone, sand, cement, bricks, loose goods" },
    ],
  },
  {
    id: "heavy",
    labelEn: "Heavy Goods",
    labelBn: "বস্তু",
    variants: [
      { key: "heavy-18ft-15t-open", vehicleType: "heavy_truck", titleEn: "18 ft · 15 Ton (Open)", titleBn: "১৮ ফুট ১৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Bricks, stone, wood, steel, sand" },
      { key: "heavy-20ft-15t-open", vehicleType: "heavy_truck", titleEn: "20 ft · 15 Ton (Open)", titleBn: "২০ ফুট ১৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Bricks, stone, wood, steel, sand" },
      { key: "heavy-20ft-15t-covered", vehicleType: "heavy_truck", titleEn: "20 ft · 15 Ton (Covered)", titleBn: "২০ ফুট ১৫ টন (কাভার)", bodyStyle: "covered", cargoHint: "Stone, sand, cement, food items" },
      { key: "heavy-22ft-25t-open", vehicleType: "heavy_truck", titleEn: "22 ft · 25 Ton (Open)", titleBn: "২২ ফুট ২৫ টন (খোলা)", bodyStyle: "open", cargoHint: "Heavy bulk goods" },
    ],
  },
  {
    id: "trailer",
    labelEn: "Trailer",
    labelBn: "ট্রেইলার",
    variants: [
      { key: "trailer-flatbed", vehicleType: "trailer", titleEn: "Flat-bed Trailer", titleBn: "ফ্ল্যাট-বেড ট্রেইলার", bodyStyle: "open", cargoHint: "Bricks, pillars, construction goods" },
      { key: "trailer-lowbed", vehicleType: "trailer", titleEn: "Low-bed Trailer", titleBn: "লো-বেড ট্রেইলার", bodyStyle: "open", cargoHint: "Large machinery, cranes, construction equipment" },
    ],
  },
  {
    // V3 ruling: `van` exists in the enum but not in the reference screenshots —
    // minimal tab keeps the enum value reachable.
    id: "van",
    labelEn: "Van",
    labelBn: "ভ্যান",
    variants: [
      { key: "van-covered", vehicleType: "van", titleEn: "Covered Van", titleBn: "কাভারড ভ্যান", bodyStyle: "covered", cargoHint: "Light enclosed cargo" },
    ],
  },
];

export const ALL_TRUCK_VARIANTS: readonly TruckVariant[] = TRUCK_TABS.flatMap(
  (t) => t.variants,
);

export function findTruckVariant(key: string | null): TruckVariant | null {
  if (!key) return null;
  return ALL_TRUCK_VARIANTS.find((v) => v.key === key) ?? null;
}

/** Human label for any rental_vehicle_type enum value (badges, summaries). */
export function describeVehicleType(value: string): string {
  const labels: Record<string, string> = {
    pickup: "Pickup",
    mini_truck: "Mini Truck",
    medium_truck: "Medium Truck",
    heavy_truck: "Heavy Truck",
    trailer: "Trailer",
    van: "Van",
    car_compact: "Compact Car",
    car_economy: "Economy Car",
    car_comfort: "Comfort Car",
    car_premium: "Premium Car",
    car_xl: "XL Car",
    ambulance_basic: "Basic Ambulance",
    ambulance_advanced: "Advanced Ambulance",
  };
  return labels[value] ?? value.replace(/_/g, " ");
}

/** Image-5 cargo-type quick chips (stored in cargo_tags array). */
export const CARGO_TYPE_CHIPS: readonly string[] = [
  "Electronics/Devices",
  "FMCG/Food",
  "Furniture/Household",
  "Machine/Building parts",
];

/**
 * Round-5 condition/option chips (screenshot conditions + truck-relevant
 * options) — stored as ONE comma-separated string in rental_options
 * (ruling 13). Keep the joined total within the API's 200-char cap.
 */
export const RENTAL_OPTION_CHIPS: readonly string[] = [
  "Fragile goods",
  "Live animals",
  "Weight > 1 ton",
  "Length > 7 ft",
  "Premium",
  "As-down trip",
  "Loading help",
  "Rope & cover",
];

/** Duration-hour presets (ruling 14; API accepts 1–720). */
export const DURATION_HOUR_OPTIONS: readonly number[] = [1, 2, 4, 8, 12, 24, 48, 72];
