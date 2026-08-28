/**
 * Fare Framework v6 — Zone fee computation (v6.md §3).
 *
 * Published flat monthly schedule: fee per zone × vehicle_category × effective_month.
 * Structurally incapable of acting as a live multiplier.
 * Driver receives 100% — not commission base.
 *
 * Derivation formula: zone_fee ≈ recovery_time_min × time_rate × coverage_factor
 * Coverage factor: 0.55 (configurable, admin-adjustable).
 */

import { db } from '../src/db';
import { zoneFeeSchedule } from '../src/db/schema';
import { eq, and, lte, sql } from 'drizzle-orm';
import { getFareFrameworkConfig, parseConfigNumber } from './fareFrameworkConfig';

/**
 * Look up the active zone fee for a zone × vehicle_category × current month.
 * Returns fee in integer paisa, or 0 if no schedule entry or fee disabled.
 */
export async function lookupZoneFee(
  zoneId: string,
  vehicleCategory: string, // 'bike' | 'cng' | 'car'
  effectiveMonth: Date = new Date(),
): Promise<number> {
  // Check if zone fee is enabled
  const cfg = await getFareFrameworkConfig(['zone_fee_enabled']);
  if (cfg.zone_fee_enabled !== 'true') return 0;

  // Compute effective_month as YYYY-MM-DD string (PgDateString)
  const y = effectiveMonth.getFullYear();
  const m = String(effectiveMonth.getMonth() + 1).padStart(2, '0');
  const monthStr = `${y}-${m}-01`;

  const [row] = await db
    .select({ fee_bdt: zoneFeeSchedule.fee_bdt })
    .from(zoneFeeSchedule)
    .where(
      and(
        eq(zoneFeeSchedule.zone_id, zoneId),
        eq(zoneFeeSchedule.vehicle_category, vehicleCategory),
        lte(zoneFeeSchedule.effective_month, monthStr),
      ),
    )
    .orderBy(sql`${zoneFeeSchedule.effective_month} DESC`)
    .limit(1);

  return row ? row.fee_bdt : 0;
}

/**
 * Derive zone fee from recovery time (for admin preview / schedule generation):
 * zone_fee ≈ recovery_time_min × time_rate × coverage_factor
 *
 * The derived value is rounded to the nearest 5 BDT for the published schedule.
 */
export function deriveZoneFee(
  recoveryTimeMin: number,
  timeRatePaisa: number, // paisa/min from pricing row
  coverageFactor: number = 0.55,
): number {
  const derived = recoveryTimeMin * timeRatePaisa * coverageFactor;
  // Round to nearest 5 BDT (500 paisa)
  return Math.round(derived / 500) * 500;
}
