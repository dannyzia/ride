/**
 * Z-7: Zone hygiene — batched, low-traffic validation and cleanup.
 *
 * Run via: npx tsx scripts/zone-hygiene.ts
 *
 * Checks:
 *  1. All active zones have valid polygons (>= 3 vertices after normalization)
 *  2. No two active zones overlap > 80% (warning — not blocked)
 *  3. Every active zone has at least one active pricing row
 *  4. demand_forecasts rows for inactive/deleted zones are pruned
 *  5. zones_one_active index is absent (confirms Z-1 migration ran)
 *
 * Exits with code 1 if any hard check fails (zones without pricing, invalid polygons).
 */
import { db } from "../src/db";
import { zones, pricing, demandForecasts } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { normalizePolygon, pointInPolygon, type LatLng } from "../lib/polygon";
import { logger } from "../lib/logger";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

function _polygonArea(pts: { lat: number; lng: number }[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].lng * pts[j].lat;
    area -= pts[j].lng * pts[i].lat;
  }
  return Math.abs(area) / 2;
}

function polygonOverlapRatio(a: LatLng[], b: LatLng[]): number {
  // Sample-based overlap: count how many vertices of A are inside B
  // (not exact but sufficient for hygiene warnings)
  let insideCount = 0;
  for (const pt of a) {
    if (pointInPolygon(pt.lat, pt.lng, b)) insideCount++;
  }
  return insideCount / a.length;
}

async function runHygiene(): Promise<void> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check active zones have valid polygons
  const activeZones = await db
    .select()
    .from(zones)
    .where(eq(zones.is_active, true));

  logger.info("[zone-hygiene] checking active zones", { count: activeZones.length });

  for (const zone of activeZones) {
    const normalized = normalizePolygon(zone.polygon);
    if (!normalized || normalized.length < 3) {
      errors.push(`Zone "${zone.name}" (${zone.id}) has invalid polygon — ${normalized?.length ?? 0} vertices`);
    }
  }

  // 2. Check for overlapping zones (warning only)
  const validZones = activeZones
    .map((z) => ({ ...z, normalized: normalizePolygon(z.polygon) }))
    .filter((z) => z.normalized && z.normalized.length >= 3);

  for (let i = 0; i < validZones.length; i++) {
    for (let j = i + 1; j < validZones.length; j++) {
      const overlap = polygonOverlapRatio(
        validZones[i].normalized!,
        validZones[j].normalized!,
      );
      if (overlap > 0.8) {
        warnings.push(
          `Zones "${validZones[i].name}" and "${validZones[j].name}" overlap ${Math.round(overlap * 100)}% — may cause ambiguous resolution`,
        );
      }
    }
  }

  // 3. Every active zone must have at least one active pricing row
  for (const zone of activeZones) {
    const [pricingRow] = await db
      .select({ id: pricing.id })
      .from(pricing)
      .where(and(eq(pricing.zone_id, zone.id), eq(pricing.is_active, true)))
      .limit(1);

    if (!pricingRow) {
      errors.push(`Zone "${zone.name}" (${zone.id}) has NO active pricing — rides will fail with pricing_not_found`);
    }
  }

  // 4. Prune demand_forecasts for inactive zones
  const inactiveZoneIds = await db
    .select({ id: zones.id })
    .from(zones)
    .where(eq(zones.is_active, false));

  if (inactiveZoneIds.length > 0) {
    const ids = inactiveZoneIds.map((z) => z.id);
    const pruned = await db
      .delete(demandForecasts)
      .where(sql`${demandForecasts.zone_id} IN ${ids}`);

    if (pruned.length > 0) {
      logger.info("[zone-hygiene] pruned orphaned forecasts", {
        count: pruned.length,
        inactiveZones: ids.length,
      });
    }
  }

  // Also prune old forecasts (>14 days) regardless
  const pruneBefore = new Date(Date.now() - FOURTEEN_DAYS_MS);
  const oldPruned = await db
    .delete(demandForecasts)
    .where(sql`${demandForecasts.forecast_hour} < ${pruneBefore}`);

  if (oldPruned.length > 0) {
    logger.info("[zone-hygiene] pruned old forecasts", { count: oldPruned.length });
  }

  // 5. Check zones_one_active index is absent
  const [indexCheck] = await db.execute<{ indexname: string }>(
    sql`SELECT indexname FROM pg_indexes WHERE indexname = 'zones_one_active'`,
  );
  if (indexCheck) {
    errors.push("zones_one_active index still exists — Z-1 migration has not been applied");
  }

  // Report
  console.log("\n=== Zone Hygiene Report ===");
  console.log(`Active zones: ${activeZones.length}`);

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log("\nZone Gate: FAIL");
    process.exit(1);
  } else {
    console.log("\nZone Gate: PASS ✓");
  }
}

runHygiene().catch((e) => {
  logger.error("[zone-hygiene] unexpected error", e);
  process.exit(1);
});
