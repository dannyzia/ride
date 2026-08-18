import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { surgeCurrent, zones } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { normalizePolygon, polygonCentroid } from '@/lib/polygon';

// Demand pressure per zone: demand / (demand + supply). 0.5 = balanced,
// higher = demand-heavy (hot). Zones with no recent activity stay at 0.
const pressure = (demand: number, supply: number): number =>
  demand + supply === 0 ? 0 : demand / (demand + supply);

export async function GET(request: Request) {
  try {
    await verifySupabaseToken(request);

    const rows = await db
      .select({
        zone_id: surgeCurrent.zone_id,
        multiplier: surgeCurrent.multiplier,
        demand_count: surgeCurrent.demand_count,
        supply_count: surgeCurrent.supply_count,
        updated_at: surgeCurrent.updated_at,
        name: zones.name,
        polygon: zones.polygon,
      })
      .from(surgeCurrent)
      .innerJoin(zones, eq(surgeCurrent.zone_id, zones.id));

    const hotspots = rows
      .map((row) => {
        const polygon = normalizePolygon(row.polygon);
        const center = polygon ? polygonCentroid(polygon) : null;
        if (!center) return null;
        return {
          zone_id: row.zone_id,
          name: row.name,
          lat: center.lat,
          lng: center.lng,
          intensity: pressure(row.demand_count, row.supply_count),
          multiplier: Number(row.multiplier),
          demand_count: row.demand_count,
          supply_count: row.supply_count,
          updated_at: row.updated_at,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);

    // Normalize intensity to 0..1 across zones with activity so the hottest
    // zone renders red and the map stays comparative. Zones with no activity
    // keep intensity 0 (deep green). All-equal sets keep the raw pressure.
    const active = hotspots.filter((h) => h.intensity > 0);
    if (active.length > 0) {
      const values = active.map((h) => h.intensity);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min;
      for (const h of active) {
        if (span > 0) h.intensity = (h.intensity - min) / span;
      }
    }

    return Response.json({ hotspots });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error('[driver/hotspots] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
