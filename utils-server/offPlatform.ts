/**
 * Off-platform completion trace matching — FARE FRAMEWORK Phase G (locked).
 *
 * Pure geometry/overlap module (no DB, no timers): utils-server/index.ts owns
 * the scheduling (detection at cancel + 30 min) and the fraud_flags insert.
 *
 * Detection rule (framework §7 response protocol): a driver who cancelled
 * within 200 m of the pickup, whose GPS trace in the window [cancel + 5 min,
 * cancel + 30 min] overlaps the cancelled ride's route_polyline corridor,
 * likely completed the trip off-platform. The 300 m pickup exclusion and the
 * 5-minute blind window prevent the approach path from false-positiving.
 *
 * Geometry: point-to-segment distance over decoded polyline legs, using a
 * local equirectangular projection (accurate at city scale, no deps).
 */

import type { TracePoint } from './trace';
import { distanceMeters } from './trace';
import type { LatLng } from './polyline';

/** Points within this radius of the pickup pin never qualify. */
export const PICKUP_EXCLUSION_RADIUS_M = 300;
/** Corridor half-width around the decoded route polyline. */
export const CORRIDOR_WIDTH_M = 150;
/** Minimum qualifying points before a flag may be raised. */
export const MIN_QUALIFYING_POINTS = 5;
/** Detection window: [cancel + 5 min, cancel + 30 min]. */
export const DETECTION_BLIND_WINDOW_MS = 5 * 60 * 1000;
export const DETECTION_WINDOW_MS = 30 * 60 * 1000;

const DEG_TO_M = 111_320; // metres per degree (equatorial approximation)

/**
 * Shortest distance in metres from point p to the segment [a, b].
 *
 * Local affine frame in degrees relative to p, with lng compressed by
 * cos(a.lat) so one scale factor converts both axes to metres: x =
 * Δlng × cos(lat), y = Δlat, distance = (x, y) × DEG_TO_M.
 * Degenerate segment (a == b) → point distance.
 */
export function pointToSegmentDistanceM(p: LatLng, a: LatLng, b: LatLng): number {
  const cosLat = Math.cos(a.lat * (Math.PI / 180));
  const ax = (a.lng - p.lng) * cosLat;
  const ay = a.lat - p.lat;
  const bx = (b.lng - p.lng) * cosLat;
  const by = b.lat - p.lat;
  // Project (p relative to a) onto (b relative to a); clamp to [0, 1].
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  let t = 0;
  if (lenSq > 0) {
    t = (-(ax * abx) - (ay * aby)) / lenSq;
    t = Math.min(1, Math.max(0, t));
  }
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dxM = cx * DEG_TO_M;
  const dyM = cy * DEG_TO_M;
  return Math.sqrt(dxM * dxM + dyM * dyM);
}

/** True when p is within corridorM of any polyline leg (early exit). */
export function isWithinCorridorM(
  p: LatLng,
  legs: LatLng[],
  corridorM: number,
): boolean {
  for (let i = 1; i < legs.length; i++) {
    if (pointToSegmentDistanceM(p, legs[i - 1], legs[i]) <= corridorM) {
      return true;
    }
  }
  return false;
}

export interface OverlapResult {
  /** Points in the window that were > 300 m from the pickup pin. */
  qualifying: number;
  /** Qualifying points also within 150 m of the route corridor. */
  matched: number;
  /** matched / qualifying as a 0–100 integer percentage (0 when none). */
  overlapPct: number;
}

/**
 * Corridor overlap over already-window-filtered points: a point qualifies
 * when it is farther than PICKUP_EXCLUSION_RADIUS_M from the pickup pin; it
 * matches when it additionally lies within CORRIDOR_WIDTH_M of the corridor.
 */
export function computeOverlap(
  points: TracePoint[],
  pickup: LatLng,
  legs: LatLng[],
): OverlapResult {
  let qualifying = 0;
  let matched = 0;
  for (const p of points) {
    if (distanceMeters(p, pickup) <= PICKUP_EXCLUSION_RADIUS_M) continue;
    qualifying += 1;
    if (isWithinCorridorM(p, legs, CORRIDOR_WIDTH_M)) {
      matched += 1;
    }
  }
  const overlapPct =
    qualifying > 0 ? Math.round((matched / qualifying) * 100) : 0;
  return { qualifying, matched, overlapPct };
}

/**
 * Window filter: points recorded in [cancelAt + 5 min, cancelAt + 30 min]
 * (inclusive). The 5-minute blind window and the 300 m pickup exclusion
 * together prevent the driver's approach path from counting as evidence.
 */
export function pointsInDetectionWindow(
  points: TracePoint[],
  cancelAtMs: number,
): TracePoint[] {
  const from = cancelAtMs + DETECTION_BLIND_WINDOW_MS;
  const to = cancelAtMs + DETECTION_WINDOW_MS;
  return points.filter((p) => p.at >= from && p.at <= to);
}
