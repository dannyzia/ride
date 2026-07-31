import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { demandForecasts } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    await verifySupabaseToken(request);
    const url = new URL(request.url);
    const zoneId = url.searchParams.get('zone_id');

    const query = db.select().from(demandForecasts);
    const rows = zoneId
      ? await query.where(eq(demandForecasts.zone_id, zoneId)).orderBy(desc(demandForecasts.forecast_hour)).limit(24)
      : await query.orderBy(desc(demandForecasts.forecast_hour)).limit(24);

    return Response.json({ forecasts: rows });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/heatmap] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
