import { db } from '@/src/db';
import { incentiveDefinitions, driverIncentives, drivers, users, creditVouchers } from '@/src/db/schema';
import { eq, and, sql, gte, lte, sum } from 'drizzle-orm';
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/driver/incentives
 * Auth: Required (driver)
 * Returns active incentives with progress and completed history for the driver.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.auth_uid, supabaseUser.id)).limit(1);
    if (!user) return Response.json({ error: 'user_not_found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, vehicle_type: drivers.vehicle_type })
      .from(drivers).where(eq(drivers.user_id, user.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found' }, { status: 404 });

    const now = new Date();

    // Fetch active, non-expired incentive definitions
    const activeDefs = await db.select().from(incentiveDefinitions).where(and(
      eq(incentiveDefinitions.is_active, true),
      lte(incentiveDefinitions.starts_at, now),
      gte(incentiveDefinitions.ends_at, now),
      sql`incentive_definitions.deleted_at IS NULL`,
    ));

    // Filter by vehicle_type_filter (if set, must match driver)
    const eligibleDefs = activeDefs.filter(d =>
      d.vehicle_type_filter == null || d.vehicle_type_filter === driver.vehicle_type,
    );

    // Fetch driver's progress rows for these incentives
    const incentiveIds = eligibleDefs.map(d => d.id);
    const progressRows = incentiveIds.length > 0
      ? await db.select().from(driverIncentives).where(and(
          eq(driverIncentives.driver_id, driver.id),
          sql`${driverIncentives.incentive_id} IN ${incentiveIds}`,
        ))
      : [];
    const progressMap = new Map(progressRows.map(p => [p.incentive_id, p]));

    // Build active list (not yet completed)
    const active = eligibleDefs.map(def => {
      const progress = progressMap.get(def.id);
      const completedAt = progress?.completed_at ?? null;
      if (completedAt) return null; // will go into completed
      return {
        incentive_id: def.id,
        name: def.name,
        description: def.description,
        target_metric: def.target_metric,
        target_value: Number(def.target_value),
        current_progress: progress ? Number(progress.current_progress) : 0,
        reward_calls: def.reward_calls,
        ends_at: def.ends_at.toISOString(),
      };
    }).filter(Boolean);

    // Fetch completed incentives (completed_at IS NOT NULL for this driver)
    const completedRows = await db.select({
      incentive: incentiveDefinitions,
      progress: driverIncentives,
    })
      .from(driverIncentives)
      .innerJoin(incentiveDefinitions, eq(incentiveDefinitions.id, driverIncentives.incentive_id))
      .where(and(
        eq(driverIncentives.driver_id, driver.id),
        sql`${driverIncentives.completed_at} IS NOT NULL`,
      ));

    const completed = completedRows.map(r => ({
      incentive_id: r.incentive.id,
      name: r.incentive.name,
      completed_at: r.progress.completed_at?.toISOString(),
      reward_calls: r.incentive.reward_calls,
    }));

    // Total bonus calls earned
    const [{ totalBonus }] = await db.select({ totalBonus: sum(creditVouchers.calls) })
      .from(creditVouchers)
      .where(eq(creditVouchers.driver_id, driver.id));

    return Response.json({
      active,
      completed,
      total_bonus_calls_earned: Number(totalBonus ?? 0),
    });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized' }, { status: 401 });
    logger.error('[driver/incentives] error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
