import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, rides } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { z } from 'zod';

export async function POST(request: Request, { id }: { id: string }) {
  try {
    const uuidParam = z.string().uuid().safeParse(id);
    if (!uuidParam.success) return Response.json({ error: 'invalid_uuid' }, { status: 400 });

    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [ride] = await db.select({ id: rides.id, driver_id: rides.driver_id }).from(rides).where(eq(rides.id, id)).limit(1);
    if (!ride) return Response.json({ error: 'not_found' }, { status: 404 });
    if (ride.driver_id !== driver.id) return Response.json({ error: 'forbidden' }, { status: 403 });

    await db.update(rides).set({ wait_start_at: new Date() }).where(eq(rides.id, id));
    return Response.json({ success: true, wait_started_at: new Date().toISOString() });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[wait-start] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
