import { db } from '@/src/db';
import { rides, drivers } from '@/src/db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [activeDrivers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivers)
      .where(and(eq(drivers.is_online, true), eq(drivers.status, 'active')));

    const [dispatchingRides] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(eq(rides.status, 'dispatching'));

    const [matchedRides] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(eq(rides.status, 'matched'));

    const [inProgressRides] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(eq(rides.status, 'in_progress'));

    const [recentCompleted] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(and(eq(rides.status, 'completed'), gte(rides.completed_at ?? rides.updated_at, fiveMinAgo)));

    return Response.json({
      active_drivers: Number(activeDrivers?.count ?? 0),
      dispatching: Number(dispatchingRides?.count ?? 0),
      matched: Number(matchedRides?.count ?? 0),
      in_progress: Number(inProgressRides?.count ?? 0),
      recent_completed: Number(recentCompleted?.count ?? 0),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/live-stats] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
