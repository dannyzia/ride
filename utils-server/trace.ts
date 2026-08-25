/**
 * Pickup trace accumulation + driver GPS ring buffer — FARE FRAMEWORK
 * Phase F quote state 3 (measurement) and Phase G (trace matching).
 *
 * Two independent in-memory structures (TD-15 acceptable, INSTANCE_COUNT=1):
 *
 *  1. Per-ride trace buffers for MATCHED rides (accept → ride:start): the
 *     accepting driver's GPS points, teleport-filtered per ruling 6 — a
 *     segment implying speed > pickup_trace_max_segment_speed_kmh (config,
 *     snapshotted at registration; default 80) versus the last ACCEPTED
 *     point is dropped. realized_km = Σ haversine over accepted consecutive
 *     segments; confidence = acceptedSegments / totalSegments (0 if none).
 *
 *  2. driverRingBuffer: 30-minute rolling window of ALL driver GPS points
 *     (heartbeats + location:update), capped to the window. Phase G's
 *     off-platform-completion detection reads it at cancel+30 min. The last
 *     point also serves as utils-server's live last-known driver position
 *     for the firm-quote driver fix at accept (ruling 11).
 *
 * In-memory only: on crash the buffers vanish; pickup_realized_km stays null
 * and detection is best-effort (documented TD-15 caveat).
 */

import { haversineKm } from '../lib/fareCalc';

export interface TracePoint {
  lat: number;
  lng: number;
  /** Epoch ms. */
  at: number;
}

/** Ruling 11: a driver fix older than 60 s is stale → low confidence. */
export const DRIVER_FIX_STALE_MS = 60_000;

/** Phase G ring-buffer window (detection runs at cancel + 30 min). */
export const RING_BUFFER_WINDOW_MS = 30 * 60 * 1000;

// ── Per-ride trace buffers ─────────────────────────────────────────────────

interface RideTraceState {
  rideId: string;
  driverId: string;
  /** Teleport-filter threshold, snapshotted at registration (ruling 6). */
  maxSegmentSpeedKmh: number;
  /** Every recorded point (the confidence denominator). */
  points: TracePoint[];
  /** Telemetry-filtered chain (the realized-distance numerator). */
  accepted: TracePoint[];
  startedAtMs: number;
}

const rideTraces = new Map<string, RideTraceState>();
/** driverId → rideId of their active traced ride (a driver traces ≤ 1 ride). */
const driverTraceIndex = new Map<string, string>();

/** Haversine metres between two points. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000;
}

/**
 * Implied speed of a segment in km/h. Non-positive dt (clock skew, duplicate
 * timestamps): zero movement → 0, any movement → Infinity (dropped).
 */
export function segmentSpeedKmh(from: TracePoint, to: TracePoint): number {
  const dtMs = to.at - from.at;
  if (dtMs <= 0) {
    return distanceMeters(from, to) > 0 ? Infinity : 0;
  }
  const km = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return (km / dtMs) * 3_600_000;
}

/**
 * Register a ride for tracing at match commit (measurement mode only). The
 * optional seed point is the accept-time driver fix — only seed when the fix
 * is fresh so a stale anchor cannot poison the first segment.
 */
export function registerRideTrace(
  rideId: string,
  driverId: string,
  maxSegmentSpeedKmh: number,
  seed?: TracePoint,
): void {
  if (rideTraces.has(rideId)) return;
  const state: RideTraceState = {
    rideId,
    driverId,
    maxSegmentSpeedKmh,
    points: [],
    accepted: [],
    startedAtMs: Date.now(),
  };
  if (seed) {
    state.points.push(seed);
    state.accepted.push(seed);
  }
  rideTraces.set(rideId, state);
  driverTraceIndex.set(driverId, rideId);
}

/** The ride currently traced for a driver, if any. */
export function getActiveTraceRideId(driverId: string): string | null {
  return driverTraceIndex.get(driverId) ?? null;
}

/**
 * Record one driver GPS point: ring buffer append (always) + per-ride trace
 * append (when the driver has an active traced ride). Teleport filter
 * (ruling 6): the point joins the accepted chain only when the implied speed
 * vs the LAST ACCEPTED point is ≤ the threshold; rejected points still count
 * toward the total (they lower confidence) but never break chain continuity.
 */
export function recordDriverPoint(
  driverId: string,
  lat: number,
  lng: number,
  at: number,
): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  appendDriverRingPoint(driverId, lat, lng, at);

  const rideId = driverTraceIndex.get(driverId);
  if (!rideId) return;
  const state = rideTraces.get(rideId);
  if (!state) {
    driverTraceIndex.delete(driverId);
    return;
  }

  const point: TracePoint = { lat, lng, at };
  state.points.push(point);
  const lastAccepted = state.accepted[state.accepted.length - 1];
  if (
    !lastAccepted ||
    segmentSpeedKmh(lastAccepted, point) <= state.maxSegmentSpeedKmh
  ) {
    state.accepted.push(point);
  }
}

export interface TraceResult {
  realizedKm: number;
  /** acceptedSegments / totalSegments; 0 when fewer than 2 points. */
  confidence: number;
}

/**
 * Finalize at ride:start: realized_km = Σ haversine over accepted consecutive
 * segments; confidence = acceptedSegments / totalSegments. Unregisters the
 * trace. Returns null when the ride was never registered.
 */
export function finalizeRideTrace(rideId: string): TraceResult | null {
  const state = rideTraces.get(rideId);
  if (!state) return null;
  rideTraces.delete(rideId);
  if (state.driverId && driverTraceIndex.get(state.driverId) === rideId) {
    driverTraceIndex.delete(state.driverId);
  }

  let realizedKm = 0;
  for (let i = 1; i < state.accepted.length; i++) {
    realizedKm += haversineKm(
      state.accepted[i - 1].lat,
      state.accepted[i - 1].lng,
      state.accepted[i].lat,
      state.accepted[i].lng,
    );
  }
  const totalSegments = Math.max(0, state.points.length - 1);
  const acceptedSegments = Math.max(0, state.accepted.length - 1);
  const confidence = totalSegments > 0 ? acceptedSegments / totalSegments : 0;
  return { realizedKm, confidence };
}

/**
 * Drop a ride's trace without a result (rider/driver cancel, cleanup).
 * Returns true when a trace was actually removed.
 */
export function unregisterRideTrace(rideId: string): boolean {
  const state = rideTraces.get(rideId);
  if (!state) return false;
  rideTraces.delete(rideId);
  if (driverTraceIndex.get(state.driverId) === rideId) {
    driverTraceIndex.delete(state.driverId);
  }
  return true;
}

/** Test helper — wipe all trace state. */
export function clearRideTraces(): void {
  rideTraces.clear();
  driverTraceIndex.clear();
}

// ── Driver GPS ring buffer (Phase G) ───────────────────────────────────────

const driverRingBuffer = new Map<string, TracePoint[]>();

/** Append a point and prune everything older than the 30-minute window. */
export function appendDriverRingPoint(
  driverId: string,
  lat: number,
  lng: number,
  at: number,
): void {
  let points = driverRingBuffer.get(driverId);
  if (!points) {
    points = [];
    driverRingBuffer.set(driverId, points);
  }
  points.push({ lat, lng, at });
  const cutoff = at - RING_BUFFER_WINDOW_MS;
  while (points.length > 0 && points[0].at < cutoff) {
    points.shift();
  }
}

/** Points of a driver recorded inside [fromMs, toMs] (inclusive bounds). */
export function getDriverPointsInWindow(
  driverId: string,
  fromMs: number,
  toMs: number,
): TracePoint[] {
  const points = driverRingBuffer.get(driverId);
  if (!points) return [];
  return points.filter((p) => p.at >= fromMs && p.at <= toMs);
}

/**
 * Live last-known driver position (ruling 11 firm-quote fix source). This is
 * utils-server's freshest GPS observation — fresher than the 30 s-throttled
 * drivers.last_location_* DB columns.
 */
export function getLastDriverPoint(driverId: string): TracePoint | null {
  const points = driverRingBuffer.get(driverId);
  if (!points || points.length === 0) return null;
  return points[points.length - 1];
}

/** Test helper — wipe the ring buffer. */
export function clearDriverRingBuffer(): void {
  driverRingBuffer.clear();
}

// ── Timestamp parsing ──────────────────────────────────────────────────────

/**
 * Parse a client-supplied point timestamp (WS messages send ISO strings or
 * epoch numbers). Falls back to server now() on anything unparseable.
 */
export function parsePointTs(ts: unknown): number {
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}
