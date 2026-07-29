import { db } from '@/src/db';
import { drivers, rides, documents } from '@/src/db/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { requireRole } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    await requireRole('admin')(request);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [activeDrivers] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivers)
      .where(and(eq(drivers.is_online, true), eq(drivers.status, 'active')));

    const [pendingApprovals] = await db
      .select({ count: sql<number>`count(*)` })
      .from(drivers)
      .where(eq(drivers.status, 'pending'));

    const [todayRides] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(and(gte(rides.completed_at ?? rides.created_at, today), eq(rides.status, 'completed')));

    const [todayCommission] = await db
      .select({ total: sql<number>`COALESCE(SUM(platform_commission_bdt), 0)` })
      .from(rides)
      .where(and(gte(rides.completed_at ?? rides.created_at, today), eq(rides.status, 'completed')));

    const [pendingDocs] = await db
      .select({ count: sql<number>`count(*)` })
      .from(documents)
      .where(eq(documents.status, 'pending'));

    return Response.json({
      active_drivers: Number(activeDrivers?.count ?? 0),
      pending_approvals: Number(pendingApprovals?.count ?? 0),
      today_rides: Number(todayRides?.count ?? 0),
      today_commission_bdt: Number(todayCommission?.total ?? 0),
      pending_documents: Number(pendingDocs?.count ?? 0),
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[admin/dashboard] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
