import { db } from '../src/db';
import { drivers } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';

const TTL_MS = (parseInt(process.env.H3_CACHE_TTL_SECONDS ?? '30')) * 1000;

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
  const rows = await db.select({
    id: drivers.id, h3_cell_res9: drivers.h3_cell_res9, vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(eq(drivers.is_online, true));

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
