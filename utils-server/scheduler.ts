import { db } from '../src/db';
import { rides, subscriptions, vehicleTypeChanges } from '../src/db/schema';
import { and, eq, lt, lte, isNull, isNotNull, sql } from 'drizzle-orm';
import { logger } from '../lib/logger';

export function startScheduler(): void {
  setInterval(async () => {
    try {
      const now = new Date();
      const cutoff = new Date(now.getTime() + 120_000);
      const cutoffLo = new Date(now.getTime() + 60_000);
      const scheduled = await db.select().from(rides).where(
        and(
          eq(rides.status, 'pending'),
          isNotNull(rides.scheduled_at),
          isNull(rides.scheduled_dispatched_at),
          lte(rides.scheduled_at, cutoff),
          sql`${rides.scheduled_at} >= ${cutoffLo}`,
        )
      );
      for (const ride of scheduled) {
        await db.update(rides).set({ scheduled_dispatched_at: now }).where(eq(rides.id, ride.id));
      }
    } catch (e) { logger.error('[scheduler] scheduled dispatch error', e); }
  }, 60_000);

  setInterval(async () => {
    try {
      await db.update(subscriptions)
        .set({ status: 'expired' })
        .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.expires_at, new Date())));
    } catch (e) { logger.error('[scheduler] expiry error', e); }
  }, 60_000);

  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 30 * 60_000);
      await db.update(rides).set({ status: 'cancelled', cancelled_by: 'system', cancel_reason: 'driver_no_show' })
        .where(and(eq(rides.status, 'matched'), lt(rides.matched_at, staleThreshold)));
    } catch (e) { logger.error('[scheduler] stale rides error', e); }
  }, 60_000);

  setInterval(async () => {
    try {
      const now = new Date();
      const due = await db.select().from(vehicleTypeChanges).where(
        and(eq(vehicleTypeChanges.status, 'cooling_off'), lte(vehicleTypeChanges.effective_at, now))
      );
      for (const change of due) {
        await db.transaction(async (tx) => {
          await tx.update(vehicleTypeChanges).set({ status: 'approved' }).where(eq(vehicleTypeChanges.id, change.id));
        });
      }
    } catch (e) { logger.error('[scheduler] cooling-off error', e); }
  }, 60_000);

  logger.info('[scheduler] started');
}
