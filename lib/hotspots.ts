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
