import { db } from '@/src/db';
import { callLedger, subscriptions, drivers, users } from '@/src/db/schema';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const querySchema = z.object({
  event_type: z.enum(['deduction', 'credit', 'initial_load', 'expiry_writeoff']).optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(200),
});

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [activeSub] = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      event_type: url.searchParams.get('event_type') ?? undefined,
      from_date: url.searchParams.get('from_date') ?? undefined,
      to_date: url.searchParams.get('to_date') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: 'validation_error', message: parsed.error.flatten() }, { status: 400 });
    }

    const { event_type, from_date, to_date, limit } = parsed.data;

    const conditions = [eq(callLedger.driver_id, driver.id)];
    if (event_type) {
      conditions.push(eq(callLedger.event_type, event_type as any));
    }
    if (from_date) {
      conditions.push(gte(callLedger.created_at, new Date(from_date)));
    }
    if (to_date) {
      conditions.push(lte(callLedger.created_at, new Date(to_date)));
    }

    const entries = await db.select()
      .from(callLedger)
      .where(and(...conditions))
      .orderBy(desc(callLedger.created_at))
      .limit(limit);

    return Response.json({
      entries,
      current_balance: activeSub?.calls_remaining ?? 0,
      subscription_name: null, // resolved on frontend if needed
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error('[driver/call-ledger] error', err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
