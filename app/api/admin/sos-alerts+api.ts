import { db } from '@/src/db';
import { sosAlerts } from '@/src/db/schema';
import { desc, eq, count, sql, and, gte } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;
const HIGH_INTENSITY_THRESHOLD = 3; // alerts in 60s = high intensity
const CLUSTER_WINDOW_MS = 60_000; // 60 seconds

export async function GET(request: Request) {
  try {
    await requireAdminPermission('safety.write')(request);

    const url = new URL(request.url);
    const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10);
    const rawOffset = parseInt(url.searchParams.get('offset') ?? '0', 10);
    const status = url.searchParams.get('status');
    const sortBy = url.searchParams.get('sort') ?? 'created_at'; // created_at | intensity

    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

    const conditions = status ? eq(sosAlerts.status, status) : undefined;

    const [totalRow] = await db
      .select({ total: count() })
      .from(sosAlerts)
      .where(conditions);

    // Fetch alerts with per-user recent alert count over trailing 60s
    const windowStart = new Date(Date.now() - CLUSTER_WINDOW_MS);

    const rows = await db
      .select({
        id: sosAlerts.id,
        user_id: sosAlerts.user_id,
        role: sosAlerts.role,
        status: sosAlerts.status,
        latitude: sosAlerts.latitude,
        longitude: sosAlerts.longitude,
        message: sosAlerts.message,
        created_at: sosAlerts.created_at,
        acknowledged_by: sosAlerts.acknowledged_by,
        acknowledged_at: sosAlerts.acknowledged_at,
        recent_alert_count: sql<number>`(
          SELECT count(*)::int FROM sos_alerts sa
          WHERE sa.user_id = ${sosAlerts.user_id}
            AND sa.created_at >= ${windowStart}
        )`.as('recent_alert_count'),
      })
      .from(sosAlerts)
      .where(conditions)
      .orderBy(
        sortBy === 'intensity'
          ? desc(sql`(SELECT count(*) FROM sos_alerts sa WHERE sa.user_id = ${sosAlerts.user_id} AND sa.created_at >= ${windowStart})`)
          : desc(sosAlerts.created_at),
      )
      .limit(limit)
      .offset(offset);

    // Compute is_high_intensity for each row
    const enriched = rows.map((row) => ({
      ...row,
      is_high_intensity: (row.recent_alert_count ?? 0) >= HIGH_INTENSITY_THRESHOLD,
    }));

    return Response.json({ alerts: enriched, total: totalRow?.total ?? 0 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/sos-alerts] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
