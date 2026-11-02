/**
 * Breadcrumb telematics — in-memory per-ride GPS buffers with a crash-safe
 * JSONB-concatenation flush into `ride_routes` (Plan 28 Stage 3, ISSUE-87).
 *
 * Buffering: points accumulate in-memory per ride_id. When a buffer reaches
 * 1,000 points it is decimated to half (even indices survive), which
 * preserves the trajectory shape across 166+ minute trips without dropping
 * points or freezing the buffer.
 *
 * Flush: `flushAndEvictRoute` inserts the buffer with onConflictDoUpdate so
 * a partial earlier flush is APPENDED (PostgreSQL `||` concatenation), not
 * overwritten — a crash between flushes loses at most the unflushed tail.
 * Distance accumulates, duration keeps the max. `flushAllActiveRoutes` is
 * wired to SIGTERM/SIGINT in index.ts.
 *
 * Write ownership: this module is the ONLY writer of `ride_routes` rows.
 * RLS is FORCED with no policies — only the service role touches the table.
 */

import { db } from '../src/db';
import { rideRoutes } from '../src/db/schema';
import { sql } from 'drizzle-orm';
import { haversineKm } from '../lib/fareCalc';
import { logger } from '../lib/logger';

export interface BreadcrumbPoint {
  lat: number;
  lng: number;
  /** Epoch ms. */
  ts: number;
}

/** Decimation ceiling — buffer halves (even indices survive) at this size. */
export const MAX_BUFFER_POINTS = 1000;

const routeBuffers = new Map<string, BreadcrumbPoint[]>();

/** Append a GPS fix to a ride's buffer, decimating at the ceiling. */
export function recordBreadcrumbPoint(rideId: string, point: BreadcrumbPoint): void {
  let points = routeBuffers.get(rideId);
  if (!points) {
    points = [];
    routeBuffers.set(rideId, points);
  }
  points.push(point);
  if (points.length >= MAX_BUFFER_POINTS) {
    routeBuffers.set(
      rideId,
      points.filter((_, idx) => idx % 2 === 0),
    );
  }
}

/** Freshest buffered fix for a ride, or null when the ride has no buffer. */
export function getLastPoint(rideId: string): BreadcrumbPoint | null {
  const points = routeBuffers.get(rideId);
  if (!points || points.length === 0) return null;
  return points[points.length - 1];
}

/** Drop a ride's buffer without persisting (cancel path). */
export function evictActiveRoute(rideId: string): void {
  routeBuffers.delete(rideId);
}

/** Test helper — wipe all buffers. */
export function clearRouteBuffers(): void {
  routeBuffers.clear();
}

/** Test helper — buffered point count for a ride (0 when untracked). */
export function getBufferedRouteCount(rideId: string): number {
  return routeBuffers.get(rideId)?.length ?? 0;
}

interface FlushSummary {
  distanceMeters: number;
  durationSec: number;
}

/** Σ haversine over consecutive segments; duration = last.ts − first.ts. */
export function summarizeRoutePoints(points: BreadcrumbPoint[]): FlushSummary {
  let distanceMeters = 0;
  for (let i = 1; i < points.length; i++) {
    distanceMeters += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng) * 1000;
  }
  const durationSec =
    points.length >= 2
      ? Math.max(0, Math.floor((points[points.length - 1].ts - points[0].ts) / 1000))
      : 0;
  return { distanceMeters, durationSec };
}

/**
 * Persist a ride's buffer into `ride_routes` and evict it.
 *
 * Returns true when a row was written, false when there was nothing to
 * flush. On DB failure the buffer is KEPT (returns false) so a later tick
 * or shutdown flush can retry — data loss is the failure mode being
 * avoided, not a stale buffer.
 */
export async function flushAndEvictRoute(rideId: string): Promise<boolean> {
  const points = routeBuffers.get(rideId);
  if (!points || points.length === 0) {
    routeBuffers.delete(rideId);
    return false;
  }
  const payload = points.map((p) => ({ lat: p.lat, lng: p.lng, ts: p.ts }));
  const { distanceMeters, durationSec } = summarizeRoutePoints(points);
  try {
    await db
      .insert(rideRoutes)
      .values({
        ride_id: rideId,
        points: payload,
        distance_meters: distanceMeters.toFixed(2),
        duration_seconds: durationSec,
      })
      .onConflictDoUpdate({
        target: rideRoutes.ride_id,
        set: {
          points: sql`COALESCE(${rideRoutes.points}, '[]'::jsonb) || ${JSON.stringify(payload)}::jsonb`,
          duration_seconds: sql`GREATEST(COALESCE(${rideRoutes.duration_seconds}, 0), ${durationSec})`,
          distance_meters: sql`COALESCE(${rideRoutes.distance_meters}, 0) + ${distanceMeters}`,
        },
      });
  } catch (e: unknown) {
    logger.error('[breadcrumbs] route flush failed — buffer kept for retry', {
      ride_id: rideId,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
  routeBuffers.delete(rideId);
  return true;
}

/** Flush every buffered route (server shutdown path). Never throws. */
export async function flushAllActiveRoutes(): Promise<{ flushed: number; failed: number }> {
  const rideIds = [...routeBuffers.keys()];
  let flushed = 0;
  let failed = 0;
  for (const rideId of rideIds) {
    try {
      if (await flushAndEvictRoute(rideId)) {
        flushed += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
      routeBuffers.delete(rideId);
    }
  }
  return { flushed, failed };
}
