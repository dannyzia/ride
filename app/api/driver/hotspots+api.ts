import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { zoneHeat, zones } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';
import { normalizePolygon, polygonCentroid } from '@/lib/polygon';

export async function GET(request: Request) {
  try {
    await verifySupabaseToken(request);

    const rows = await db
      .select({
        zone_id: zoneHeat.zone_id,
        score: zoneHeat.score,
        tag: zoneHeat.tag,
        idle_driver_count: zoneHeat.idle_driver_count,
        updated_at: zoneHeat.updated_at,
        name: zones.name,
        polygon: zones.polygon,
      })
      .from(zoneHeat)
      .innerJoin(zones, eq(zoneHeat.zone_id, zones.id));

    const hotspots = rows
      .map((row) => {
        const polygon = normalizePolygon(row.polygon);
        const center = polygon ? polygonCentroid(polygon) : null;
        if (!center) return null;

        const score = Number(row.score);
        const idleCount = row.idle_driver_count;

        return {
          zone_id: row.zone_id,
          name: row.name,
          lat: center.lat,
          lng: center.lng,
          score,
          tag: row.tag,
          idle_driver_count: idleCount,
          suggest_score: score / (1 + idleCount),
          updated_at: row.updated_at,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null);

    return Response.json({ hotspots });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error('[driver/hotspots] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
