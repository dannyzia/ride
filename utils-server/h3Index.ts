import { db } from '../src/db';
import { drivers } from '../src/db/schema';
import { and, eq, gt } from 'drizzle-orm';
import { logger } from '../lib/logger';

const TTL_MS = (parseInt(process.env.H3_CACHE_TTL_SECONDS ?? '30')) * 1000;

/**
 * How stale a heartbeat may be before a driver stops counting as dispatchable.
 *
 * The client heartbeats every 10s; dispatch.ts's M2 rule hard-excludes anyone
 * whose last heartbeat is older than this, because a socket can be alive while
 * the app is effectively dead (iOS background suspension, a silent network
 * partition — no close frame, so `is_online` never flips).
 *
 * The SAME constant now governs this index, and that is the point: the index
 * used to rebuild from `is_online = true` alone, so it advertised drivers the
 * filter would always reject. Live example (2026-09-20): a booking built its
 * pool with `candidatesFound: 1` and then scored `0`, because the only indexed
 * driver's `last_location_at` was 4.2 days old. The index and the filter must
 * not be able to drift, so they read one value.
 */
export const HEARTBEAT_STALE_MS = 120_000;

// Forward index: Map<h3Cell, Map<vehicleType, Set<driverId>>>
let index: Map<string, Map<string, Set<string>>> = new Map();
// Reverse index: Map<driverId, { cell: string; vehicleType: string }> for O(1) lookup on update/remove
let reverseIndex: Map<string, { cell: string; vehicleType: string }> = new Map();
let lastRefresh = 0;

export function getDriversInCells(cells: string[], vehicleType: string): string[] {
  const ids = new Set<string>();
  for (const cell of cells) {
    const byType = index.get(cell);
    if (!byType) continue;
    for (const id of byType.get(vehicleType) ?? []) ids.add(id);
  }
  return [...ids];
}

export function updateDriver(driverId: string, cell: string, vehicleType: string): void {
  // Remove from old position first
  removeDriver(driverId);

  if (!index.has(cell)) index.set(cell, new Map());
  const byType = index.get(cell)!;
  if (!byType.has(vehicleType)) byType.set(vehicleType, new Set());
  byType.get(vehicleType)!.add(driverId);
  reverseIndex.set(driverId, { cell, vehicleType });
}

export function removeDriver(driverId: string): void {
  const entry = reverseIndex.get(driverId);
  if (!entry) return;

  const byType = index.get(entry.cell);
  if (byType) {
    const ids = byType.get(entry.vehicleType);
    if (ids) {
      ids.delete(driverId);
      if (ids.size === 0) byType.delete(entry.vehicleType);
    }
    if (byType.size === 0) index.delete(entry.cell);
  }
  reverseIndex.delete(driverId);
}

export async function refreshH3Index(): Promise<void> {
  // Freshness gate, matching dispatch.ts's M2 exclusion exactly. Online is not
  // enough: a driver whose app stopped reporting location is not dispatchable,
  // and indexing them only inflates `candidatesFound` with rows the score step
  // then throws away.
  const freshSince = new Date(Date.now() - HEARTBEAT_STALE_MS);
  const rows = await db.select({
    id: drivers.id, h3_cell_res9: drivers.h3_cell_res9, vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(and(
    eq(drivers.is_online, true),
    gt(drivers.last_location_at, freshSince),
  ));

  const newIndex: typeof index = new Map();
  const newReverse: typeof reverseIndex = new Map();
  for (const row of rows) {
    if (!row.h3_cell_res9) continue;
    if (!newIndex.has(row.h3_cell_res9)) newIndex.set(row.h3_cell_res9, new Map());
    const byType = newIndex.get(row.h3_cell_res9)!;
    if (!byType.has(row.vehicle_type)) byType.set(row.vehicle_type, new Set());
    byType.get(row.vehicle_type)!.add(row.id);
    newReverse.set(row.id, { cell: row.h3_cell_res9, vehicleType: row.vehicle_type });
  }
  index = newIndex;
  reverseIndex = newReverse;
  lastRefresh = Date.now();
  // `drivers` is the count of FRESH online drivers actually indexed, not every
  // online row — a rebuild that drops a stale driver is not a failed refresh.
  logger.debug('[h3Index] refreshed', { cells: newIndex.size, drivers: rows.length });
}

export function startH3IndexRefresh(): void {
  refreshH3Index().catch(e => logger.error('[h3Index] initial refresh failed', e));
  setInterval(() => refreshH3Index().catch(e => logger.error('[h3Index] refresh error', e)), TTL_MS);
}

export function getLastRefreshAge(): number { return Date.now() - lastRefresh; }

/**
 * Total number of drivers currently held in the in-memory index
 * (reverseIndex maps driverId -> {cell, vehicleType}). Use this for
 * health/metrics reporting instead of querying a synthetic cell.
 */
export function getIndexedDriverCount(): number { return reverseIndex.size; }
