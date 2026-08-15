import { db } from '@/src/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { userDevices, notifications } from '@/src/db/schema';
import { logger } from '@/lib/logger';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification to a user across all their registered devices.
 * Creates a notifications row for delivery tracking.
 * Returns { sent: number, failed: number }.
 */
export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  options?: { priority?: 'default' | 'high' },
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
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
        } catch (err: any) {
          return { token, success: false, error: err.message };
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

    await db.insert(notifications).values({
      user_id: userId,
      type,
      title,
      body,
      data: (data ?? {}) as any,
      sent_at: new Date(),
      failed_reason: failed > 0 ? `${failed}/${uniqueTokens.length} failed` : null,
    });
  } catch (err: any) {
    logger.error('[notify] sendNotification error', { userId, type, error: err.message });
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
