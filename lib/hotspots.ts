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

/**
 * Great-circle distance (km), full precision. Used for ranking (nearest
 * hotspot) — unlike lib/mapUtils' display-rounded haversineDistance. Kept
 * import-free so lib/hotspots.ts stays usable from both server routes and
 * the client bundle.
 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A hotspot zone as the client needs it for the "near you" card. */
export interface HotspotPoint {
  name: string;
  lat: number;
  lng: number;
  /** Comparative 0..1 — normalized across zones (drives the heat map). */
  intensity: number;
  /** Absolute demand/supply pressure 0..1 (drives demand-tier labels). */
  intensity_raw: number;
  demand_count: number;
  supply_count: number;
}

/** Nearest hotspot to a coordinate, or null when the list is empty. */
export function nearestHotspot(
  hotspots: HotspotPoint[],
  lat: number,
  lng: number,
): HotspotPoint | null {
  if (hotspots.length === 0) return null;
  let best = hotspots[0];
  let bestDist = haversineKm(lat, lng, best.lat, best.lng);
  for (let i = 1; i < hotspots.length; i++) {
    const d = haversineKm(lat, lng, hotspots[i].lat, hotspots[i].lng);
    if (d < bestDist) {
      bestDist = d;
      best = hotspots[i];
    }
  }
  return best;
}

export type DemandLevel = "low" | "medium" | "high";

/**
 * Intensity 0..1 → demand tier for display labels ("High demand").
 * Thresholds are ratio-anchored to ABSOLUTE demand/supply pressure
 * (demand / (demand + supply)): 0.66 means demand ≥ 2× supply, 0.33 means
 * supply ≤ 2× demand — so a "high" label means true demand-heavy, not
 * merely top-ranked among zones.
 */
export function demandLevel(intensity: number): DemandLevel {
  if (intensity >= 0.66) return "high";
  if (intensity >= 0.33) return "medium";
  return "low";
}
