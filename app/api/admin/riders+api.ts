import { db } from '@/src/db';
import { users } from '@/src/db/schema';
import { eq, desc, like, and, sql } from 'drizzle-orm';
import { requireAdminPermission } from '@/lib/adminRbac';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

export async function GET(request: Request) {
  try {
    await requireAdminPermission('admin.read')(request);
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const status = url.searchParams.get('status');

    const conditions = [eq(users.role, 'rider')];
    if (search) conditions.push(like(users.name, `%${search}%`));
    if (status) conditions.push(eq(users.account_status, status));

    const rows = await db
      .select({
        id: users.id, name: users.name, phone: users.phone, email: users.email,
        account_status: users.account_status, total_rides: users.total_rides,
        total_spent_bdt: users.total_spent_bdt, fraud_score: users.fraud_score,
        last_ride_at: users.last_ride_at, created_at: users.created_at,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.created_at))
      .limit(100);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(...conditions));

    return Response.json({ riders: rows, total: Number(countResult?.count ?? 0) });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[admin/riders] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
