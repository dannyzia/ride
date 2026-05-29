import { db } from '@/src/db';
import { callLedger, subscriptions, drivers, users } from '@/src/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [activeSub] = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);

    const entries = await db.select()
      .from(callLedger)
      .where(eq(callLedger.driver_id, driver.id))
      .orderBy(desc(callLedger.created_at))
      .limit(200);

    return Response.json({
      entries,
      current_balance: activeSub?.calls_remaining ?? 0,
      subscription_name: null, // resolved on frontend if needed
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/call-ledger] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
