/**
 * Fare Framework v6 — Zone recovery tracking (v6.md §3).
 *
 * Tracks median driver recovery time per zone: dropoff → next accepted dispatch.
 * Entry: recovery > 30 min → cold zone → zone fee applies.
 * Exit: recovery < 20 min → warm zone → zone fee retires.
 * Hysteresis: 10-min band prevents border-zone flapping.
 *
 * Written by: complete+api.ts (zone_recovery_samples insert).
 * Read by: scheduler job 42 (upserts zone_heat.recovery_time_min).
 */

import { db } from '../src/db';
import { zoneRecoverySamples, zoneHeat } from '../src/db/schema';
import { eq, sql, and, gte } from 'drizzle-orm';
import { logger } from './logger';

/**
 * Compute median recovery time per zone from recent samples (7-day window).
 * Returns zone_id → median_recovery_minutes map.
 */
export async function computeZoneRecoveries(
  windowDays: number = 7,
): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      zone_id: zoneRecoverySamples.zone_id,
      recovery_minutes: zoneRecoverySamples.recovery_minutes,
    })
    .from(zoneRecoverySamples)
    .where(
      and(
        gte(zoneRecoverySamples.dropped_at, cutoff),
        sql`${zoneRecoverySamples.recovery_minutes} IS NOT NULL`,
      ),
    );

  // Group by zone and compute median
  const byZone = new Map<string, number[]>();
  for (const row of rows) {
    if (!row.zone_id) continue;
    const val = Number(row.recovery_minutes);
    if (!Number.isFinite(val)) continue;
    const arr = byZone.get(row.zone_id) ?? [];
    arr.push(val);
    byZone.set(row.zone_id, arr);
  }

  const medians = new Map<string, number>();
  for (const [zoneId, values] of byZone) {
    values.sort((a, b) => a - b);
    const mid = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 0
        ? (values[mid - 1] + values[mid]) / 2
        : values[mid];
    medians.set(zoneId, median);
  }

  return medians;
}

/**
 * Entry/exit hysteresis logic:
 * - Zone enters zone fee if recovery > entryThresholdMin (default 30)
 * - Zone exits zone fee if recovery < exitThresholdMin (default 20)
 * - 10-min band prevents flapping
 */
export function shouldApplyZoneFee(
  currentRecoveryMin: number,
  currentlyHasFee: boolean,
  entryThresholdMin: number = 30,
  exitThresholdMin: number = 20,
): boolean {
  if (currentlyHasFee) {
    // Currently has fee — exit only if recovery drops below exit threshold
    return currentRecoveryMin >= exitThresholdMin;
  }
  // No fee — enter only if recovery exceeds entry threshold
  return currentRecoveryMin > entryThresholdMin;
}
