import { db } from '@/src/db';
import { callLedger, drivers, users } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { verifyFirebaseIdToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const decoded = await verifyFirebaseIdToken(request);

    const [user] = await db.select().from(users).where(eq(users.auth_uid, decoded.uid)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const entries = await db.select({
      id: callLedger.id,
      event_type: callLedger.event_type,
      delta: callLedger.delta,
      balance_after: callLedger.balance_after,
      reason: callLedger.reason,
      created_at: callLedger.created_at,
    })
      .from(callLedger)
      .where(eq(callLedger.driver_id, driver.id))
      .orderBy(desc(callLedger.created_at))
      .limit(50);

    return Response.json(entries);
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[call-ledger] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
