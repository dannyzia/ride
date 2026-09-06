import { db } from '@/src/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { userDevices, notifications } from '@/src/db/schema';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a user across all their registered devices.
 * Creates a notifications row for delivery tracking.
 * Returns { sent: number, failed: number }.
 *
 * When `idempotencyKey` is provided the notification row is inserted first
 * with ON CONFLICT DO NOTHING.  If the row already exists the call is a
 * no-op (duplicate trigger / retry).  This is the canonical dedup gate —
 * callers should pass a deterministic key such as `ride:{id}:reminder_60`.
 */
export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  options?: { priority?: 'default' | 'high'; idempotencyKey?: string },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    // Idempotency gate: insert the audit row first; if it already exists,
    // this notification was already sent — skip the push entirely.
    if (options?.idempotencyKey) {
      const inserted = await db
        .insert(notifications)
        .values({
          user_id: userId,
          type,
          title,
          body,
          data: (data ?? {}) as any,
          sent_at: new Date(),
          idempotency_key: options.idempotencyKey,
        })
        .onConflictDoNothing({ target: notifications.idempotency_key })
        .returning({ id: notifications.id });

      if (inserted.length === 0) {
        logger.debug('[notify] duplicate suppressed by idempotency key', { userId, type, key: options.idempotencyKey });
        return { sent: 0, failed: 0 };
      }
    }

    const devices = await db
      .select({ push_token: userDevices.push_token })
      .from(userDevices)
      .where(eq(userDevices.user_id, userId))
      .orderBy(desc(userDevices.last_active_at));

    if (devices.length === 0) {
      logger.debug('[notify] no devices for user', { userId, type });
      return { sent: 0, failed: 0 };
    }

    const seen = new Set<string>();
    const uniqueTokens = devices
      .map((d) => d.push_token)
      .filter((t) => { if (seen.has(t)) return false; seen.add(t); return true; });

    const results = await Promise.allSettled(
      uniqueTokens.map(async (token) => {
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: token,
              title,
              body,
              data: data ?? {},
              sound: 'default',
              priority: options?.priority ?? 'high',
            }),
          });
          const result = await res.json();
          if (result.data?.status === 'error') {
            return { token, success: false, error: result.data.message };
          }
          return { token, success: true };
        } catch (err: unknown) {
          return { token, success: false, error: errors.getErrorMessage(err) };
        }
      }),
    );

    const deadTokens: string[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.success) sent++;
      else {
        failed++;
        // Y-2: prune tokens Expo reports as unregistered so stale devices
        // aren't re-targeted forever (wasted quota, growing latency, inflated
        // failure stats).
        if (
          r.status === 'fulfilled' &&
          typeof r.value.error === 'string' &&
          (r.value.error.includes('DeviceNotRegistered') ||
            r.value.error.includes('InvalidProviderToken'))
        ) {
          deadTokens.push(r.value.token);
        }
      }
    }

    if (deadTokens.length > 0) {
      await db
        .delete(userDevices)
        .where(and(
          eq(userDevices.user_id, userId),
          inArray(userDevices.push_token, deadTokens),
        ));
      logger.info('[notify] pruned dead push tokens', { userId, count: deadTokens.length });
    }

    // Non-idempotent path: insert audit row after push (legacy callers).
    if (!options?.idempotencyKey) {
      await db.insert(notifications).values({
        user_id: userId,
        type,
        title,
        body,
        data: (data ?? {}) as any,
        sent_at: new Date(),
        failed_reason: failed > 0 ? `${failed}/${uniqueTokens.length} failed` : null,
      });
    }
  } catch (err: unknown) {
    logger.error('[notify] sendNotification error', { userId, type, error: errors.getErrorMessage(err) });
  }

  return { sent, failed };
}

/**
 * Wire notification calls into ride lifecycle events.
 * Call from API routes after ride status transitions.
 */
export function notifyRideMatched(riderId: string, _driverId: string): void {
  sendNotification(riderId, 'ride:matched', 'Driver Found', 'Your driver is on the way!').catch(() => {});
}

export function notifyRideCompleted(riderId: string, _driverId: string): void {
  sendNotification(riderId, 'ride:completed', 'Ride Complete', 'Thanks for riding with us! Rate your driver.').catch(() => {});
}

export function notifyDriverArrived(riderId: string): void {
  sendNotification(riderId, 'driver:arrived', 'Driver Arrived', 'Your driver has arrived at the pickup location.').catch(() => {});
}

/**
 * Admin status change (suspend/activate) → driver push. Type strings match
 * lib/notificationRouter's DRIVER_NOTIFICATION_ROUTES so the tap deep-links.
 */
export function notifyAccountStatus(
  driverUserId: string,
  suspended: boolean,
  reason?: string,
): void {
  sendNotification(
    driverUserId,
    suspended ? 'account:suspended' : 'account:approved',
    suspended ? 'Account suspended' : 'Account activated',
    suspended
      ? `Your account has been suspended.${reason ? ` Reason: ${reason}` : ' Tap for details.'}`
      : 'Your account is active again. Welcome back!',
    { suspended: String(suspended) },
  ).catch(() => {});
}
