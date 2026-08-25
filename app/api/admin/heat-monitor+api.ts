import { db } from '@/src/db';
import { zoneHeat, zones, platformConfig } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const rows = await db
      .select({
        zone_id: zoneHeat.zone_id,
        zone_name: zones.name,
        zone_is_active: zones.is_active,
        score: zoneHeat.score,
        tag: zoneHeat.tag,
        baseline_pct: zoneHeat.baseline_pct,
        live_pctile: zoneHeat.live_pctile,
        live_ewma: zoneHeat.live_ewma,
        idle_driver_count: zoneHeat.idle_driver_count,
        computed_at: zoneHeat.computed_at,
        updated_at: zoneHeat.updated_at,
      })
      .from(zoneHeat)
      .innerJoin(zones, eq(zoneHeat.zone_id, zones.id))
      .orderBy(zones.name);

    // Compute suggest_score = score / (1 + idle_driver_count) per zone
    const zonesWithSuggest = rows.map((r) => ({
      zone_id: r.zone_id,
      zone_name: r.zone_name,
      zone_is_active: r.zone_is_active,
      score: Number(r.score),
      tag: r.tag,
      baseline_pct: r.baseline_pct,
      live_pctile: r.live_pctile,
      live_ewma: Number(r.live_ewma),
      idle_driver_count: r.idle_driver_count,
      suggest_score: Number(r.score) / (1 + r.idle_driver_count),
      computed_at: r.computed_at,
      updated_at: r.updated_at,
    }));

    // Read heat_backtest_correlation from platform_config
    const [backtestRow] = await db
      .select({ value: platformConfig.value })
      .from(platformConfig)
      .where(eq(platformConfig.key, 'heat_backtest_correlation'))
      .limit(1);

    const heatBacktestCorrelation = backtestRow?.value
      ? Number(backtestRow.value)
      : null;

    return Response.json({
      zones: zonesWithSuggest,
      heat_backtest_correlation: heatBacktestCorrelation,
      total: zonesWithSuggest.length,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/heat-monitor] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
