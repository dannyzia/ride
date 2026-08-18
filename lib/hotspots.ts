/**
 * Demand-pressure math for the driver hotspot map. Extracted from
 * app/api/driver/hotspots so the ranking rules are unit-testable.
 */

/**
 * Demand pressure per zone: demand / (demand + supply). 0.5 = balanced,
 * higher = demand-heavy (hot). Zones with no recent activity stay at 0,
 * and a zone with demand but zero supply saturates at 1.
 */
export function demandPressure(demand: number, supply: number): number {
  return demand + supply === 0 ? 0 : demand / (demand + supply);
}

/**
 * Normalize a list of zone intensities to 0..1 across the zones with
 * activity (intensity > 0), so the hottest zone renders red and the map
 * stays comparative. Zones with no activity keep 0, preserving positions.
 *
 * Degenerate sets are returned unchanged: all-equal values keep their raw
 * pressure (nothing to stretch against), and an all-zero/empty list stays
 * all-zero/empty. Pure — returns a new array, never mutates the input.
 */
export function normalizeIntensities(values: number[]): number[] {
  const active = values.filter((v) => v > 0);
  if (active.length === 0) return values;

  const min = Math.min(...active);
  const max = Math.max(...active);
  const span = max - min;
  if (span === 0) return values;

  return values.map((v) => (v > 0 ? (v - min) / span : 0));
}

/** One step of the surge threshold table: at this demand/supply ratio, use this multiplier. */
export interface SurgeThreshold {
  ratio: number;
  multiplier: number;
}

/** Seeded into system_config when surge_thresholds is absent. */
export const DEFAULT_SURGE_THRESHOLDS: SurgeThreshold[] = [
  { ratio: 3, multiplier: 2.0 },
  { ratio: 2, multiplier: 1.5 },
  { ratio: 1.2, multiplier: 1.25 },
];

/**
 * Demand/supply ratio for surge: demand / max(supply, 1). A zone with demand
 * but zero online supply saturates to its raw demand count rather than
 * dividing by zero.
 */
export function surgeRatio(demand: number, supply: number): number {
  return demand / Math.max(supply, 1);
}

/**
 * Pick the surge multiplier for a demand/supply ratio from the threshold
 * table. Thresholds are evaluated highest-ratio-first; the first whose ratio
 * is STRICTLY exceeded (`ratio > t.ratio`) wins — so an exactly-3.0 ratio
 * gets the 1.5 tier, not 2.0. No threshold cleared → 1.0 (no surge).
 * Never mutates the input (the scheduler previously sorted the parsed config
 * in place).
 */
export function pickSurgeMultiplier(
  ratio: number,
  thresholds: SurgeThreshold[] = DEFAULT_SURGE_THRESHOLDS,
): number {
  const sorted = [...thresholds].sort((a, b) => b.ratio - a.ratio);
  for (const t of sorted) {
    if (ratio > t.ratio) return t.multiplier;
  }
  return 1.0;
}
