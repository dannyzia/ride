/**
 * Z-8: Per-zone pricing seed script.
 *
 * Run via: npx tsx scripts/zone-seed-pricing.ts [--dry-run] [--zone <uuid>]
 *
 * Behavior:
 *   1. If --zone is provided, seed ONLY that zone (active or not).
 *   2. Otherwise, seed ALL active zones.
 *   3. For each target zone:
 *      a. If the zone already has pricing rows, skip (or update with --force).
 *      b. If another active zone has complete pricing, clone from it.
 *      c. Otherwise, use the hardcoded BD default pricing below.
 *
 * All writes use ON CONFLICT (zone_id, vehicle_type) DO UPDATE — safe to
 * re-run. Use --dry-run to preview without writes.
 *
 * Pricing columns seeded:
 *   zone_id, vehicle_type, base_fare_bdt, per_km_bdt, intercity_per_km_bdt,
 *   per_min_bdt, floor_length_km, floor_min, platform_commission_percent,
 *   is_active, free_wait_minutes, wait_fee_per_minute_bdt, brta_fare_ceiling_bdt
 */
import { db } from "../src/db";
import { zones, pricing } from "../src/db/schema";
import { eq, and } from "drizzle-orm";
import { VEHICLE_TYPE_VALUES, type VehicleTypeEnum } from "../lib/vehicleTypes";
import { logger } from "../lib/logger";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const ZONE_ARG = process.argv.indexOf("--zone");
const TARGET_ZONE_ID =
  ZONE_ARG !== -1 ? process.argv[ZONE_ARG + 1] : undefined;

// ── Hardcoded BD default pricing (fare system v2) ──────────────────────────
// All values in integer paisa. Source: seed-pricing.js + admin panel defaults.
// free_wait_minutes REV-4: bike/cng 1 min, car 2 min (car_compact sentinel stays 0).
interface PricingDefaults {
  base_fare_bdt: number;
  per_km_bdt: number;
  intercity_per_km_bdt: number;
  per_min_bdt: number;
  floor_length_km: string; // numeric(10,2) stored as string for Drizzle
  floor_min: number;
  platform_commission_percent: string | null;
  free_wait_minutes: number;
  wait_fee_per_minute_bdt: number;
  brta_fare_ceiling_bdt: number | null;
}

const BD_DEFAULTS: Record<VehicleTypeEnum, PricingDefaults> = {
  bike_basic: {
    base_fare_bdt: 2500,
    per_km_bdt: 775,
    intercity_per_km_bdt: 1160,
    per_min_bdt: 175,
    floor_length_km: "2.00",
    floor_min: 10,
    platform_commission_percent: "15.00",
    free_wait_minutes: 1,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  bike_standard: {
    base_fare_bdt: 2500,
    per_km_bdt: 950,
    intercity_per_km_bdt: 1425,
    per_min_bdt: 180,
    floor_length_km: "2.00",
    floor_min: 10,
    platform_commission_percent: "15.00",
    free_wait_minutes: 1,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  bike_plus: {
    base_fare_bdt: 2500,
    per_km_bdt: 1050,
    intercity_per_km_bdt: 1575,
    per_min_bdt: 190,
    floor_length_km: "2.00",
    floor_min: 10,
    platform_commission_percent: "15.00",
    free_wait_minutes: 1,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  cng: {
    base_fare_bdt: 4000,
    per_km_bdt: 1500,
    intercity_per_km_bdt: 2250,
    per_min_bdt: 200,
    floor_length_km: "3.00",
    floor_min: 15,
    platform_commission_percent: "15.00",
    free_wait_minutes: 1,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  // REQUIRES PRODUCT INPUT — sentinel, do not seed
  car_compact: {
    base_fare_bdt: 0,
    per_km_bdt: 0,
    intercity_per_km_bdt: 0,
    per_min_bdt: 0,
    floor_length_km: "0.00",
    floor_min: 0,
    platform_commission_percent: null,
    free_wait_minutes: 0,
    wait_fee_per_minute_bdt: 0,
    brta_fare_ceiling_bdt: null,
  },
  car_economy: {
    base_fare_bdt: 4500,
    per_km_bdt: 1500,
    intercity_per_km_bdt: 2250,
    per_min_bdt: 350,
    floor_length_km: "4.00",
    floor_min: 20,
    platform_commission_percent: "15.00",
    free_wait_minutes: 2,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  car_comfort: {
    base_fare_bdt: 5000,
    per_km_bdt: 1800,
    intercity_per_km_bdt: 2700,
    per_min_bdt: 375,
    floor_length_km: "4.00",
    floor_min: 20,
    platform_commission_percent: "15.00",
    free_wait_minutes: 2,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  car_premium: {
    base_fare_bdt: 6500,
    per_km_bdt: 2100,
    intercity_per_km_bdt: 3150,
    per_min_bdt: 400,
    floor_length_km: "4.00",
    floor_min: 20,
    platform_commission_percent: "15.00",
    free_wait_minutes: 2,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
  car_xl: {
    base_fare_bdt: 8000,
    per_km_bdt: 2500,
    intercity_per_km_bdt: 3750,
    per_min_bdt: 425,
    floor_length_km: "4.00",
    floor_min: 20,
    platform_commission_percent: "15.00",
    free_wait_minutes: 2,
    wait_fee_per_minute_bdt: 200,
    brta_fare_ceiling_bdt: null,
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function findReferenceZone(): Promise<{
  zone: (typeof zones.$inferSelect)[];
  pricing: (typeof pricing.$inferSelect)[];
} | null> {
  const activeZones = await db
    .select()
    .from(zones)
    .where(eq(zones.is_active, true));

  for (const zone of activeZones) {
    const prices = await db
      .select()
      .from(pricing)
      .where(and(eq(pricing.zone_id, zone.id), eq(pricing.is_active, true)));

    // C2: car_compact may not be seeded yet (sentinel). Account for that.
    const expectedTypes = BD_DEFAULTS.car_compact.base_fare_bdt === 0
      ? VEHICLE_TYPE_VALUES.length - 1
      : VEHICLE_TYPE_VALUES.length;
    if (prices.length >= expectedTypes) {
      return { zone: [zone], pricing: prices };
    }
  }
  return null;
}

async function upsertPricing(
  zoneId: string,
  vt: VehicleTypeEnum,
  data: PricingDefaults,
): Promise<boolean> {
  if (DRY_RUN) {
    console.log(
      `    [dry-run] upsert ${vt}: base=${data.base_fare_bdt} perkm=${data.per_km_bdt} comm=${data.platform_commission_percent}%`,
    );
    return true;
  }

  await db
    .insert(pricing)
    .values({
      zone_id: zoneId,
      vehicle_type: vt,
      base_fare_bdt: data.base_fare_bdt,
      per_km_bdt: data.per_km_bdt,
      intercity_per_km_bdt: data.intercity_per_km_bdt,
      per_min_bdt: data.per_min_bdt,
      floor_length_km: data.floor_length_km,
      floor_min: data.floor_min,
      platform_commission_percent: data.platform_commission_percent,
      is_active: true,
      free_wait_minutes: data.free_wait_minutes,
      wait_fee_per_minute_bdt: data.wait_fee_per_minute_bdt,
      brta_fare_ceiling_bdt: data.brta_fare_ceiling_bdt,
    })
    .onConflictDoUpdate({
      target: [pricing.zone_id, pricing.vehicle_type],
      set: {
        base_fare_bdt: data.base_fare_bdt,
        per_km_bdt: data.per_km_bdt,
        intercity_per_km_bdt: data.intercity_per_km_bdt,
        per_min_bdt: data.per_min_bdt,
        floor_length_km: data.floor_length_km,
        floor_min: data.floor_min,
        platform_commission_percent: data.platform_commission_percent,
        free_wait_minutes: data.free_wait_minutes,
        wait_fee_per_minute_bdt: data.wait_fee_per_minute_bdt,
        brta_fare_ceiling_bdt: data.brta_fare_ceiling_bdt,
        updated_at: new Date(),
      },
    });
  return true;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function seedPricing(): Promise<void> {
  console.log(`\n=== Zone Pricing Seed (Z-8) ===`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  if (FORCE) console.log(`Force: will overwrite existing pricing rows`);

  // Resolve target zones
  let targetZones: (typeof zones.$inferSelect)[];

  if (TARGET_ZONE_ID) {
    const [zone] = await db
      .select()
      .from(zones)
      .where(eq(zones.id, TARGET_ZONE_ID));
    if (!zone) {
      console.error(`\nZone not found: ${TARGET_ZONE_ID}`);
      process.exit(1);
    }
    targetZones = [zone];
    console.log(`Target: "${zone.name}" (${zone.id})`);
  } else {
    targetZones = await db
      .select()
      .from(zones)
      .where(eq(zones.is_active, true));
    console.log(`Target: all active zones (${targetZones.length})`);
  }

  if (targetZones.length === 0) {
    console.log("No target zones — nothing to seed.");
    return;
  }

  // Find a reference zone with complete pricing (for cloning)
  const ref = await findReferenceZone();
  if (ref) {
    console.log(
      `Reference zone: "${ref.zone[0].name}" (${ref.zone[0].id}) — ${ref.pricing.length} types`,
    );
  } else {
    console.log("No reference zone with complete pricing — using BD defaults");
  }

  let seeded = 0;
  let skipped = 0;

  for (const zone of targetZones) {
    console.log(`\n  Zone: "${zone.name}" (${zone.id})`);

    const existing = await db
      .select()
      .from(pricing)
      .where(and(eq(pricing.zone_id, zone.id), eq(pricing.is_active, true)));

    const existingTypes = new Set(
      existing.map((p) => p.vehicle_type as VehicleTypeEnum),
    );

    if (!FORCE && existing.length >= VEHICLE_TYPE_VALUES.length) {
      console.log(`    ✓ Complete (${existing.length}/${VEHICLE_TYPE_VALUES.length}) — skipped`);
      skipped++;
      continue;
    }

    const missing = VEHICLE_TYPE_VALUES.filter((vt) => !existingTypes.has(vt));
    if (!FORCE && missing.length === 0) {
      console.log(`    ✓ All types present — skipped`);
      skipped++;
      continue;
    }

    const toSeed = FORCE ? (VEHICLE_TYPE_VALUES as readonly VehicleTypeEnum[]) : missing;
    console.log(
      `    ${FORCE ? "Force-seeding" : "Seeding"} ${toSeed.length} types: ${toSeed.join(", ")}`,
    );

    for (const vt of toSeed) {
      // C2: Skip car_compact entirely when rates are still sentinel (all-zero).
      // The category must never get seeded rates that product has not approved.
      if (vt === 'car_compact' && BD_DEFAULTS[vt].base_fare_bdt === 0) {
        console.log(`    ⏭  car_compact pricing skipped — REQUIRES PRODUCT INPUT`);
        continue;
      }

      // Prefer reference zone pricing if available
      const refRow = ref?.pricing.find((p) => p.vehicle_type === vt);
      const defaults: PricingDefaults = refRow
        ? {
            base_fare_bdt: refRow.base_fare_bdt,
            per_km_bdt: refRow.per_km_bdt,
            intercity_per_km_bdt: refRow.intercity_per_km_bdt,
            per_min_bdt: refRow.per_min_bdt,
            floor_length_km: String(refRow.floor_length_km),
            floor_min: refRow.floor_min,
            platform_commission_percent: refRow.platform_commission_percent
              ? String(refRow.platform_commission_percent)
              : null,
            free_wait_minutes: refRow.free_wait_minutes,
            wait_fee_per_minute_bdt: refRow.wait_fee_per_minute_bdt,
            brta_fare_ceiling_bdt: refRow.brta_fare_ceiling_bdt,
          }
        : BD_DEFAULTS[vt];

      await upsertPricing(zone.id, vt, defaults);
      seeded++;
    }
  }

  console.log(`\n${DRY_RUN ? "\nWould seed" : "Seeded"}: ${seeded} pricing rows`);
  if (skipped > 0) console.log(`Skipped: ${skipped} zones (already complete)`);
  console.log(`Target zones: ${targetZones.length}`);
}

seedPricing().catch((e) => {
  logger.error("[zone-seed-pricing] error", e);
  process.exit(1);
});
