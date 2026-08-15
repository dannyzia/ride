import { db } from '@/src/db';
import { drivers, rides, driverStreaks, driverAchievements, driverTiers } from '@/src/db/schema';
import { eq, and, sql, gte, asc } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { prevBdtMidnightUtc } from '@/lib/time';

export async function evaluateStreaks(driverId: string): Promise<void> {
  try {
    // V-5: the money stack counts days on BDT boundaries; server-local
    // midnight reset streaks at the wrong hour.
    const today = prevBdtMidnightUtc();

    const [daily] = await db.select().from(driverStreaks)
      .where(and(eq(driverStreaks.driver_id, driverId), eq(driverStreaks.streak_type, 'daily_rides'))).limit(1);

    const [ridesToday] = await db.select({ count: sql<number>`count(*)` }).from(rides)
      .where(and(eq(rides.driver_id, driverId), gte(rides.created_at, today), eq(rides.status, 'completed')));

    if (Number(ridesToday?.count ?? 0) > 0) {
      if (daily) {
        const newCount = daily.current_count + 1;
        await db.update(driverStreaks).set({
          current_count: newCount,
          best_count: Math.max(newCount, daily.best_count),
          updated_at: new Date(),
        }).where(eq(driverStreaks.id, daily.id));
      } else {
        await db.insert(driverStreaks).values({
          driver_id: driverId, streak_type: 'daily_rides', current_count: 1, best_count: 1,
        });
      }
    } else if (daily) {
      await db.update(driverStreaks).set({ current_count: 0, updated_at: new Date() }).where(eq(driverStreaks.id, daily.id));
    }
  } catch (e) { logger.error('[gamification] evaluateStreaks error', { driverId, error: e }); }
}

export async function grantAchievement(driverId: string, key: string, title: string, rewardBdt = 0): Promise<void> {
  try {
    // V-5: atomic grant — the (driver_id, achievement_key) unique index + the
    // onConflictDoNothing insert mean a concurrent grant can't double-credit
    // the reward; only the insert that actually wins the row credits it.
    const [achievement] = await db.insert(driverAchievements).values({
      driver_id: driverId, achievement_key: key, title, reward_bdt: rewardBdt,
    }).onConflictDoNothing().returning();
    if (!achievement) return; // concurrent grant already won

    if (rewardBdt > 0) {
      await db.update(drivers)
        .set({ driver_wallet_balance_bdt: sql`${drivers.driver_wallet_balance_bdt} + ${rewardBdt}` })
        .where(eq(drivers.id, driverId));
    }

    logger.info('[gamification] achievement granted', { driverId, key, rewardBdt });
  } catch (e) { logger.error('[gamification] grantAchievement error', { driverId, key, error: e }); }
}

export async function getCurrentTier(driverId: string): Promise<{ tier: string; discount: number; boost: number }> {
  const [driver] = await db.select({ completed_rides_count: drivers.completed_rides_count, rating: drivers.rating })
    .from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver) return { tier: 'Unrated', discount: 0, boost: 1.0 };

  const totalRides = Number(driver.completed_rides_count ?? 0);
  const rating = parseFloat(driver.rating ?? '0');

  const tiers = await db.select().from(driverTiers).where(eq(driverTiers.is_active, true)).orderBy(asc(driverTiers.rank));
  let matchedTier = { name: 'Bronze', commission_discount_percent: 0, priority_boost: '1.0' };

  for (const t of tiers) {
    if (totalRides >= t.min_rides && rating >= parseFloat(t.min_rating ?? '4.0')) {
      matchedTier = t;
    }
  }

  return {
    tier: matchedTier.name, discount: matchedTier.commission_discount_percent, boost: parseFloat(matchedTier.priority_boost ?? '1.0'),
  };
}
