import { db } from '../src/db';
import {
  rides, subscriptions, vehicleTypeChanges, drivers,
  usedChallenges, documents, chatMessages, compensationQueue, rateLimits,
  creditVouchers, ownerConsents, paymentEvents,
} from '../src/db/schema';
import { and, eq, lt, lte, isNull, isNotNull, sql, or } from 'drizzle-orm';
import { nextBdtMidnightUtc } from '../lib/time';
import { logger } from '../lib/logger';

export function startScheduler(): void {
  // ── (1) Scheduled ride dispatch — every 60s ─────────────────────────
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
        // Trigger dispatch is handled by /internal/dispatch from ride/request+api.ts
        // Here we just mark as ready for dispatch
      }
    } catch (e) { logger.error('[scheduler] scheduled dispatch error', e); }
  }, 60_000);

  // ── (2) Daily call reset — every 60s (resets at BDT midnight) ───────
  setInterval(async () => {
    try {
      const midnight = nextBdtMidnightUtc();
      const now = new Date();
      // Run within 60s of midnight
      if (Math.abs(now.getTime() - midnight.getTime()) > 60_000) return;

      await db.update(subscriptions)
        .set({ daily_calls_used: 0, daily_reset_at: nextBdtMidnightUtc() })
        .where(eq(subscriptions.status, 'active'));
      logger.info('[scheduler] daily call reset completed');
    } catch (e) { logger.error('[scheduler] daily reset error', e); }
  }, 60_000);

  // ── (3) Temporary driver expiry — every 60s ─────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.update(drivers)
        .set({ status: 'suspended', is_online: false })
        .where(and(
          eq(drivers.status, 'temporary'),
          lt(drivers.provisional_expires_at, now),
        ));
    } catch (e) { logger.error('[scheduler] temp driver expiry error', e); }
  }, 60_000);

  // ── (4) Subscription expiry — every 60s ─────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.update(subscriptions)
        .set({ status: 'expired' })
        .where(and(eq(subscriptions.status, 'active'), lt(subscriptions.expires_at, now)));
    } catch (e) { logger.error('[scheduler] expiry error', e); }
  }, 60_000);

  // ── (5) Stale matched rides — every 60s ─────────────────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 30 * 60_000);
      await db.update(rides).set({
        status: 'cancelled', cancelled_by: 'system', cancel_reason: 'driver_no_show',
      }).where(and(
        eq(rides.status, 'matched'),
        lt(rides.matched_at, staleThreshold),
      ));
    } catch (e) { logger.error('[scheduler] stale rides error', e); }
  }, 60_000);

  // ── (6) Vehicle type cooling-off promotion — every 60s ──────────────
  setInterval(async () => {
    try {
      const now = new Date();
      const due = await db.select().from(vehicleTypeChanges).where(
        and(eq(vehicleTypeChanges.status, 'cooling_off'), lte(vehicleTypeChanges.effective_at, now))
      );
      for (const change of due) {
        await db.transaction(async (tx) => {
          await tx.update(vehicleTypeChanges).set({ status: 'approved' }).where(eq(vehicleTypeChanges.id, change.id));
          await tx.update(drivers).set({ vehicle_type: change.new_vehicle_type as any })
            .where(eq(drivers.id, change.driver_id));
        });
      }
    } catch (e) { logger.error('[scheduler] cooling-off error', e); }
  }, 60_000);

  // ── (7) Consent copy deadline check — every 60s ────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      await db.update(ownerConsents)
        .set({ status: 'expired' })
        .where(and(eq(ownerConsents.status, 'approved'), lt(ownerConsents.created_at, cutoff)));
    } catch (e) { logger.error('[scheduler] consent expiry error', e); }
  }, 60_000);

  // ── (8) Used challenges cleanup — every 5 min ───────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.delete(usedChallenges).where(lt(usedChallenges.expires_at, now));
    } catch (e) { logger.error('[scheduler] used_challenges cleanup error', e); }
  }, 300_000);

  // ── (9) RTDB cleanup — every 5 min ─────────────────────────────────
  setInterval(async () => {
    try {
      // Cleanup stale RTDB verification entries is handled by Cloud Functions TTL
      logger.debug('[scheduler] RTDB cleanup tick');
    } catch (e) { logger.error('[scheduler] RTDB cleanup error', e); }
  }, 300_000);

  // ── (10) Document purge — every 1h ─────────────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.update(documents)
        .set({ deleted_at: now })
        .where(and(
          or(
            isNotNull(documents.purge_at),
            eq(documents.status, 'rejected'),
          ),
          isNull(documents.deleted_at),
          lt(documents.created_at, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
        ));
    } catch (e) { logger.error('[scheduler] document purge error', e); }
  }, 3600_000);

  // ── (11) Chat retention cleanup — every 1h ─────────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
      await db.delete(chatMessages).where(lt(chatMessages.created_at, cutoff));
    } catch (e) { logger.error('[scheduler] chat retention error', e); }
  }, 3600_000);

  // ── (12) Callback_pending recovery — every 30s ──────────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 10 * 60_000); // 10 min
      const stalled = await db.select({ id: paymentEvents.id })
        .from(paymentEvents)
        .where(and(
          eq(paymentEvents.status, 'callback_pending'),
          lt(paymentEvents.updated_at, staleThreshold),
          isNull(paymentEvents.subscription_id),
        ));
      for (const evt of stalled) {
        await db.insert(compensationQueue).values({
          payment_event_id: evt.id,
          status: 'pending',
          next_retry_at: new Date(),
          attempt_count: 0,
        }).onConflictDoNothing();
        logger.info('[scheduler] orphaned callback recovered', { paymentEventId: evt.id });
      }
    } catch (e) { logger.error('[scheduler] callback recovery error', e); }
  }, 30_000);

  // ── (13) Rate limits cleanup — every 1h ────────────────────────────
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
      await db.delete(rateLimits).where(lt(rateLimits.window_start, cutoff));
    } catch (e) { logger.error('[scheduler] rate limits cleanup error', e); }
  }, 3600_000);

  // ── (14) Credit voucher expiry — every 5 min ────────────────────────
  setInterval(async () => {
    try {
      const now = new Date();
      await db.update(creditVouchers)
        .set({ status: 'expired' })
        .where(and(eq(creditVouchers.status, 'active'), lt(creditVouchers.expires_at, now)));
    } catch (e) { logger.error('[scheduler] credit voucher expiry error', e); }
  }, 300_000);

  // ── (15) Stale pending ride recovery — every 30s ────────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 30_000);
      const stalled = await db.select().from(rides).where(
        and(
          eq(rides.status, 'pending'),
          isNull(rides.scheduled_at),
          isNull(rides.scheduled_dispatched_at),
          lt(rides.created_at, staleThreshold),
        )
      );
      const wsPort = process.env.UTILS_SERVER_PORT ?? '3001';
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (!internalSecret) return;
      for (const ride of stalled) {
        const dispatchUrl = `http://127.0.0.1:${wsPort}/internal/dispatch`;
        fetch(dispatchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${internalSecret}` },
          signal: AbortSignal.timeout(5_000),
          body: JSON.stringify({
            ride_id: ride.id,
            vehicle_type: ride.vehicle_type,
            pickup_lat: Number(ride.origin_latitude),
            pickup_lng: Number(ride.origin_longitude),
            allow_downgrade: false,
          }),
        }).catch(e => logger.error('[scheduler] stale dispatch retry error', { ride_id: ride.id, error: e }));
      }
    } catch (e) { logger.error('[scheduler] stale pending recovery error', e); }
  }, 30_000);

  // ── (16) Stale driver_arrived auto-cancel — every 60s ─────────────────
  setInterval(async () => {
    try {
      const staleThreshold = new Date(Date.now() - 10 * 60_000);
      const stale = await db.update(rides)
        .set({
          status: 'cancelled',
          cancelled_by: 'system',
          cancel_reason: 'driver_arrived_timeout',
        })
        .where(and(
          eq(rides.status, 'driver_arrived'),
          lt(rides.arrived_at, staleThreshold),
        ))
        .returning({ id: rides.id });
      if (stale.length > 0) {
        logger.info('[scheduler] stale driver_arrived auto-cancelled', {
          count: stale.length, ids: stale.map(r => r.id),
        });
      }
    } catch (e) { logger.error('[scheduler] stale driver_arrived error', e); }
  }, 60_000);

  logger.info('[scheduler] started (16 jobs)');
}
