import { db } from '@/src/db';
import { fraudFlags, drivers, users, zoneRecalibrationQueue, zones } from '@/src/db/schema';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const url = new URL(request.url);
    const flagType = url.searchParams.get('flag_type');
    const status = url.searchParams.get('status');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200) : 50;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    const conditions = [];
    if (flagType) {
      const validTypes = ['dawdle', 'off_platform_completion', 'cancel_rate', 'heat_manipulation'];
      if (!validTypes.includes(flagType)) {
        return Response.json(
          { error: 'validation_error', message: `flag_type must be one of: ${validTypes.join(', ')}` },
          { status: 400 },
        );
      }
      conditions.push(eq(fraudFlags.flag_type, flagType as 'dawdle' | 'off_platform_completion' | 'cancel_rate' | 'heat_manipulation'));
    }
    if (status) {
      const validStatuses = ['open', 'warned', 'escalated', 'blocked', 'resolved'];
      if (!validStatuses.includes(status)) {
        return Response.json(
          { error: 'validation_error', message: `status must be one of: ${validStatuses.join(', ')}` },
          { status: 400 },
        );
      }
      conditions.push(eq(fraudFlags.status, status as 'open' | 'warned' | 'escalated' | 'blocked' | 'resolved'));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ total: count() })
      .from(fraudFlags)
      .where(whereClause);

    const rows = await db
      .select({
        id: fraudFlags.id,
        driver_id: fraudFlags.driver_id,
        flag_type: fraudFlags.flag_type,
        ride_id: fraudFlags.ride_id,
        evidence: fraudFlags.evidence,
        status: fraudFlags.status,
        offense_count: fraudFlags.offense_count,
        resolved_by: fraudFlags.resolved_by,
        resolved_at: fraudFlags.resolved_at,
        created_at: fraudFlags.created_at,
        updated_at: fraudFlags.updated_at,
        driver_name: users.name,
        driver_phone: users.phone,
        driver_vehicle_type: drivers.vehicle_type,
      })
      .from(fraudFlags)
      .innerJoin(drivers, eq(fraudFlags.driver_id, drivers.id))
      .innerJoin(users, eq(drivers.user_id, users.id))
      .where(whereClause)
      .orderBy(desc(fraudFlags.created_at))
      .limit(limit)
      .offset(offset);

    // Zone recalibration queue (open items, newest first)
    const recalRows = await db
      .select({
        id: zoneRecalibrationQueue.id,
        zone_id: zoneRecalibrationQueue.zone_id,
        zone_name: zones.name,
        deviation_pct: zoneRecalibrationQueue.deviation_pct,
        sample_count: zoneRecalibrationQueue.sample_count,
        status: zoneRecalibrationQueue.status,
        created_at: zoneRecalibrationQueue.created_at,
      })
      .from(zoneRecalibrationQueue)
      .leftJoin(zones, eq(zoneRecalibrationQueue.zone_id, zones.id))
      .orderBy(desc(zoneRecalibrationQueue.created_at));

    return Response.json({
      fraud_flags: rows,
      total: Number(totalRow?.total ?? 0),
      limit,
      offset,
      recalibration_queue: recalRows.map((r) => ({
        id: r.id,
        zone_id: r.zone_id,
        zone_name: r.zone_name,
        deviation_pct: r.deviation_pct !== null ? Number(r.deviation_pct) : 0,
        sample_count: r.sample_count,
        status: r.status,
        created_at: r.created_at,
      })),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    if (errors.getErrorStatus(err) === 403) return Response.json({ error: 'forbidden', message: 'Access denied' }, { status: 403 });
    logger.error('[admin/fraud-flags] GET error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
