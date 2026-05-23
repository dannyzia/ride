import { db } from '../src/db';
import { drivers } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger';

const TTL_MS = (parseInt(process.env.H3_CACHE_TTL_SECONDS ?? '30')) * 1000;

let index: Map<string, Map<string, Set<string>>> = new Map();
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

export async function refreshH3Index(): Promise<void> {
  const rows = await db.select({
    id: drivers.id, h3_cell_res9: drivers.h3_cell_res9, vehicle_type: drivers.vehicle_type,
  }).from(drivers).where(eq(drivers.is_online, true));

  const newIndex: typeof index = new Map();
  for (const row of rows) {
    if (!row.h3_cell_res9) continue;
    if (!newIndex.has(row.h3_cell_res9)) newIndex.set(row.h3_cell_res9, new Map());
    const byType = newIndex.get(row.h3_cell_res9)!;
    if (!byType.has(row.vehicle_type)) byType.set(row.vehicle_type, new Set());
    byType.get(row.vehicle_type)!.add(row.id);
  }
  index = newIndex;
  lastRefresh = Date.now();
  logger.debug('[h3Index] refreshed', { cells: newIndex.size, drivers: rows.length });
}

export function startH3IndexRefresh(): void {
  refreshH3Index().catch(e => logger.error('[h3Index] initial refresh failed', e));
  setInterval(() => refreshH3Index().catch(e => logger.error('[h3Index] refresh error', e)), TTL_MS);
}

export function getLastRefreshAge(): number { return Date.now() - lastRefresh; }
