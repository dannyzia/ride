import { db } from '@/src/db';
import { pickupDistanceSamples, zones } from '@/src/db/schema';
import { eq, and, gte, lte, sql, isNotNull } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('from');
    const dateTo = url.searchParams.get('to');
    const category = url.searchParams.get('category');

    const conditions = [];
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (Number.isNaN(from.getTime())) {
        return Response.json({ error: 'validation_error', message: 'Invalid from date' }, { status: 400 });
      }
      conditions.push(gte(pickupDistanceSamples.created_at, from));
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (Number.isNaN(to.getTime())) {
        return Response.json({ error: 'validation_error', message: 'Invalid to date' }, { status: 400 });
      }
      conditions.push(lte(pickupDistanceSamples.created_at, to));
    }
    if (category) {
      conditions.push(eq(pickupDistanceSamples.category, category));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregated stats per category × zone
    const rows = await db
      .select({
        category: pickupDistanceSamples.category,
        zone_id: pickupDistanceSamples.zone_id,
        zone_name: zones.name,
        sample_count: sql<number>`count(*)::int`,
        charged_count: sql<number>`count(*) filter (where ${pickupDistanceSamples.charged} = true)::int`,
        charge_pct: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.charged} = true) * 100.0 / nullif(count(*), 0), 2)`,
        p50_realized: sql<string>`percentile_cont(0.50) within group (order by ${pickupDistanceSamples.realized_km})`,
        p70_realized: sql<string>`percentile_cont(0.70) within group (order by ${pickupDistanceSamples.realized_km})`,
        p75_realized: sql<string>`percentile_cont(0.75) within group (order by ${pickupDistanceSamples.realized_km})`,
        p90_realized: sql<string>`percentile_cont(0.90) within group (order by ${pickupDistanceSamples.realized_km})`,
        mean_quote_km: sql<string>`round(avg(${pickupDistanceSamples.quote_km})::numeric, 3)`,
        mean_realized_km: sql<string>`round(avg(${pickupDistanceSamples.realized_km})::numeric, 3)`,
        mean_deviation_pct: sql<string>`round(avg(case when ${pickupDistanceSamples.quote_km} > 0 then abs(${pickupDistanceSamples.realized_km} - ${pickupDistanceSamples.quote_km}) / ${pickupDistanceSamples.quote_km} * 100 else null end)::numeric, 2)`,
      })
      .from(pickupDistanceSamples)
      .leftJoin(zones, eq(pickupDistanceSamples.zone_id, zones.id))
      .where(whereClause)
      .groupBy(pickupDistanceSamples.category, pickupDistanceSamples.zone_id, zones.name)
      .orderBy(pickupDistanceSamples.category, zones.name);

    // Overall summary
    const [summary] = await db
      .select({
        total_samples: sql<number>`count(*)::int`,
        total_charged: sql<number>`count(*) filter (where ${pickupDistanceSamples.charged} = true)::int`,
        overall_charge_pct: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.charged} = true) * 100.0 / nullif(count(*), 0), 2)`,
        overall_mean_deviation: sql<string>`round(avg(case when ${pickupDistanceSamples.quote_km} > 0 then abs(${pickupDistanceSamples.realized_km} - ${pickupDistanceSamples.quote_km}) / ${pickupDistanceSamples.quote_km} * 100 else null end)::numeric, 2)`,
      })
      .from(pickupDistanceSamples)
      .where(whereClause);

    return Response.json({
      summary: {
        total_samples: Number(summary?.total_samples ?? 0),
        total_charged: Number(summary?.total_charged ?? 0),
        overall_charge_pct: summary?.overall_charge_pct !== null ? Number(summary.overall_charge_pct) : null,
        overall_mean_deviation_pct: summary?.overall_mean_deviation !== null ? Number(summary.overall_mean_deviation) : null,
      },
      distributions: rows.map((r) => ({
        category: r.category,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        sample_count: Number(r.sample_count),
        charged_count: Number(r.charged_count),
        charge_pct: r.charge_pct !== null ? Number(r.charge_pct) : null,
        p50_realized_km: r.p50_realized !== null ? Number(r.p50_realized) : null,
        p70_realized_km: r.p70_realized !== null ? Number(r.p70_realized) : null,
        p75_realized_km: r.p75_realized !== null ? Number(r.p75_realized) : null,
        p90_realized_km: r.p90_realized !== null ? Number(r.p90_realized) : null,
        mean_quote_km: r.mean_quote_km !== null ? Number(r.mean_quote_km) : null,
        mean_realized_km: r.mean_realized_km !== null ? Number(r.mean_realized_km) : null,
        mean_deviation_pct: r.mean_deviation_pct !== null ? Number(r.mean_deviation_pct) : null,
      })),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/pickup-analytics] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
