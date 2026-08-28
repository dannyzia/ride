import { db } from '@/src/db';
import { zoneRecalibrationQueue, zones } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireAdminPermission('review.write')(request);

    const url = new URL(request.url);
    const status = url.searchParams.get('status');

    if (status) {
      const validStatuses = ['open', 'reviewed'];
      if (!validStatuses.includes(status)) {
        return Response.json(
          { error: 'validation_error', message: `status must be one of: ${validStatuses.join(', ')}` },
          { status: 400 },
        );
      }
    }

    const rows = await db
      .select({
        id: zoneRecalibrationQueue.id,
        zone_id: zoneRecalibrationQueue.zone_id,
        zone_name: zones.name,
        deviation_pct: zoneRecalibrationQueue.deviation_pct,
        sample_count: zoneRecalibrationQueue.sample_count,
        status: zoneRecalibrationQueue.status,
        created_at: zoneRecalibrationQueue.created_at,
        updated_at: zoneRecalibrationQueue.updated_at,
      })
      .from(zoneRecalibrationQueue)
      .innerJoin(zones, eq(zoneRecalibrationQueue.zone_id, zones.id))
      .where(status ? eq(zoneRecalibrationQueue.status, status as 'open' | 'reviewed') : undefined)
      .orderBy(desc(zoneRecalibrationQueue.created_at));

    return Response.json({
      items: rows.map((r) => ({
        id: r.id,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        deviation_pct: r.deviation_pct !== null ? Number(r.deviation_pct) : null,
        sample_count: r.sample_count,
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      total: rows.length,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/zone-recalibration] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
