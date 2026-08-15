import { db } from '@/src/db';
import { sosAlerts } from '@/src/db/schema';
import { desc } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const rows = await db
      .select({
        id: sosAlerts.id,
        user_id: sosAlerts.user_id,
        role: sosAlerts.role,
        latitude: sosAlerts.latitude,
        longitude: sosAlerts.longitude,
        message: sosAlerts.message,
        created_at: sosAlerts.created_at,
      })
      .from(sosAlerts)
      .orderBy(desc(sosAlerts.created_at))
      .limit(50);

    return Response.json({ alerts: rows });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/sos-alerts] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
