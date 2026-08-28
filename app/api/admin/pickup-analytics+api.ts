import { db } from '@/src/db';
import { pickupDistanceSamples, zones } from '@/src/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('from');
    const dateTo = url.searchParams.get('to');
    const category = url.searchParams.get('category');
    const daysBack = url.searchParams.get('days');

    const conditions = [];

    // Support both explicit from/to and convenience days param
    if (daysBack) {
      const n = Number(daysBack);
      if (Number.isFinite(n) && n > 0) {
        const since = new Date(Date.now() - n * 86_400_000);
        conditions.push(gte(pickupDistanceSamples.created_at, since));
      }
    } else {
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
        charge_incidence_pct: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.charged} = true) * 100.0 / nullif(count(*), 0), 1)`,
        p50: sql<string>`percentile_cont(0.50) within group (order by ${pickupDistanceSamples.realized_km})`,
        p70: sql<string>`percentile_cont(0.70) within group (order by ${pickupDistanceSamples.realized_km})`,
        p75: sql<string>`percentile_cont(0.75) within group (order by ${pickupDistanceSamples.realized_km})`,
        p90: sql<string>`percentile_cont(0.90) within group (order by ${pickupDistanceSamples.realized_km})`,
        quote_deviation_low: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.quote_km} > 0 and ${pickupDistanceSamples.realized_km} > ${pickupDistanceSamples.quote_km}) * 100.0 / nullif(count(*), 0), 1)`,
        quote_deviation_high: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.quote_km} > 0 and ${pickupDistanceSamples.realized_km} < ${pickupDistanceSamples.quote_km}) * 100.0 / nullif(count(*), 0), 1)`,
        cap_binding_pct: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.cap_was_binding} = true) * 100.0 / nullif(count(*), 0), 1)`,
        backstop_binding_pct: sql<number>`round(count(*) filter (where ${pickupDistanceSamples.backstop_was_binding} = true) * 100.0 / nullif(count(*), 0), 1)`,
      })
      .from(pickupDistanceSamples)
      .leftJoin(zones, eq(pickupDistanceSamples.zone_id, zones.id))
      .where(whereClause)
      .groupBy(pickupDistanceSamples.category, pickupDistanceSamples.zone_id, zones.name)
      .orderBy(pickupDistanceSamples.category, zones.name);

    // Unique categories and zones for summary
    const [catRow] = await db
      .select({ categories: sql<string[]>`array_agg(distinct ${pickupDistanceSamples.category})` })
      .from(pickupDistanceSamples)
      .where(whereClause);

    const [zoneRow] = await db
      .select({ zones: sql<string[]>`array_agg(distinct ${zones.name})` })
      .from(pickupDistanceSamples)
      .leftJoin(zones, eq(pickupDistanceSamples.zone_id, zones.id))
      .where(whereClause);

    const [summaryRow] = await db
      .select({
        total_samples: sql<number>`count(*)::int`,
      })
      .from(pickupDistanceSamples)
      .where(whereClause);

    return Response.json({
      summary: {
        total_samples: Number(summaryRow?.total_samples ?? 0),
        categories: catRow?.categories ?? [],
        zones: zoneRow?.zones ?? [],
      },
      distributions: rows.map((r) => ({
        category: r.category,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        p50: r.p50 !== null ? Number(r.p50) : null,
        p70: r.p70 !== null ? Number(r.p70) : null,
        p75: r.p75 !== null ? Number(r.p75) : null,
        p90: r.p90 !== null ? Number(r.p90) : null,
        charge_incidence_pct: r.charge_incidence_pct !== null ? Number(r.charge_incidence_pct) : null,
        quote_deviation_low: r.quote_deviation_low !== null ? Number(r.quote_deviation_low) : null,
        quote_deviation_high: r.quote_deviation_high !== null ? Number(r.quote_deviation_high) : null,
        sample_count: Number(r.sample_count),
        cap_binding_pct: r.cap_binding_pct !== null ? Number(r.cap_binding_pct) : null,
        backstop_binding_pct: r.backstop_binding_pct !== null ? Number(r.backstop_binding_pct) : null,
      })),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/pickup-analytics] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
