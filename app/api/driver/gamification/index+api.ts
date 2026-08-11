import { verifySupabaseToken } from '@/lib/auth';
import { db } from '@/src/db';
import { users, drivers, driverStreaks, driverAchievements, driverMysteryBonuses } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getCurrentTier } from '@/lib/gamification';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const tier = await getCurrentTier(driver.id);
    const streaks = await db.select().from(driverStreaks).where(eq(driverStreaks.driver_id, driver.id));
    const achievements = await db.select().from(driverAchievements).where(eq(driverAchievements.driver_id, driver.id)).orderBy(desc(driverAchievements.unlocked_at));
    const mysteryBonuses = await db.select().from(driverMysteryBonuses).where(eq(driverMysteryBonuses.driver_id, driver.id));

    return Response.json({ tier, streaks, achievements, mystery_bonuses: mysteryBonuses });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/gamification] GET error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
