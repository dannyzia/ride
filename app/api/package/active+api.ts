import { db } from '@/src/db';
import { subscriptions, packages, drivers, users } from '@/src/db/schema';
import { eq, and } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const [sub] = await db.select()
      .from(subscriptions)
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, 'active')))
      .limit(1);

    if (!sub) return Response.json({ subscription: null });

    const [pkg] = await db.select().from(packages).where(eq(packages.id, sub.package_id)).limit(1);

    return Response.json({
      subscription: {
        ...sub,
        package_name: pkg?.name ?? 'Unknown',
      },
    });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[package/active] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
