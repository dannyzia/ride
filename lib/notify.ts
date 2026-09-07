import { db } from '@/src/db';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { userDevices, notifications } from '@/src/db/schema';
import { logger } from '@/lib/logger';
import * as errors from '@/lib/errors';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 push messages per batch request
// (https://docs.expo.dev/push-notifications/sending-notifications/).
const EXPO_BATCH_SIZE = 100;
// Concurrency window for batch POSTs. No new dependency — a local semaphore.
const PUSH_CONCURRENCY = 20;
// inArray bind-param safety: chunk user/key lists so we stay far below the
// 65535-parameter ceiling even for pathological fan-out.
const QUERY_CHUNK_SIZE = 1000;

/**
 * One push target. The single-recipient shape used by every existing caller;
 * `sendNotification` builds these one at a time, `sendNotifications` takes a
 * batch. Optional fields default exactly as the legacy single path defaulted
 * them (priority 'high', data {}).
 */
export interface NotificationRequest {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  priority?: 'default' | 'high';
  /** Deterministic dedup key (e.g. `rental_activation:{id}:{userId}`). */
  idempotencyKey?: string;
}

interface PushOutcome {
  token: string;
  success: boolean;
  error?: string;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  priority: 'default' | 'high';
}

/**
 * Send a push notification to a user across all their registered devices.
 * Creates a notifications row for delivery tracking.
 * Returns { sent: number, failed: number }.
 *
 * When `idempotencyKey` is provided the notification is deduped on the
 * canonical idempotency gate: the same key produces exactly one push (the
 * notifications row with that key exists ⇒ suppressed). This is a thin
 * wrapper over the batch path (`sendNotifications`) — a batch of one.
 */
export async function sendNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, string>,
  options?: { priority?: 'default' | 'high'; idempotencyKey?: string },
): Promise<{ sent: number; failed: number }> {
  const results = await dispatchBatch([
    {
      userId,
      type,
      title,
      body,
      data,
      priority: options?.priority,
      idempotencyKey: options?.idempotencyKey,
    },
  ]);
  return results[0];
}

/**
 * Batched fan-out. The per-recipient work of `sendNotification` — dedup
 * check, device lookup, expo POST, dead-token prune, audit row — amortized
 * into a constant number of round trips:
 *
 *   1. ONE SELECT fetches all idempotency keys already present; recipients
 *      whose key exists are dropped (duplicate suppress, same semantics as
 *      the single path).
 *   2. Device tokens fetched grouped per distinct user.
 *   3. ONE multi-row INSERT records the batch's sent-keys — the dedup gate —
 *      ON CONFLICT DO NOTHING (a concurrent sender may have won a key; that
 *      means one push total, same as the single-path gate).
 *   4. Expo pushes are batched 100-per-POST and sent through a local
 *      concurrency window. A failed push (ticket error or transport error)
 *      is logged and never aborts the batch.
 *
 * Non-idempotent requests keep legacy audit semantics: their notifications
 * row is inserted after the push with a failed_reason summary.
 */
export async function sendNotifications(batch: NotificationRequest[]): Promise<void> {
  await dispatchBatch(batch);
}

async function dispatchBatch(
  batch: NotificationRequest[],
): Promise<Array<{ sent: number; failed: number }>> {
  const results = batch.map(() => ({ sent: 0, failed: 0 }));
  if (batch.length === 0) return results;

  try {
    // ── Intra-batch duplicate keys: keep the first occurrence of each key.
    const seenKeys = new Set<string>();
    const uniqueBatch = batch.filter((req) => {
      if (!req.idempotencyKey) return true;
      if (seenKeys.has(req.idempotencyKey)) return false;
      seenKeys.add(req.idempotencyKey);
      return true;
    });
    const intraDups = batch.length - uniqueBatch.length;
    if (intraDups > 0) {
      logger.debug('[notify] intra-batch duplicate keys suppressed', { count: intraDups });
    }

    // ── 1. One SELECT for the whole batch's idempotency keys.
    let pending = uniqueBatch;
    const keyed = uniqueBatch.filter((r) => r.idempotencyKey);
    if (keyed.length > 0) {
      const alreadySent = new Set<string>();
      for (let i = 0; i < keyed.length; i += QUERY_CHUNK_SIZE) {
        const keys = keyed.slice(i, i + QUERY_CHUNK_SIZE).map((r) => r.idempotencyKey as string);
        const rows = await db
          .select({ idempotency_key: notifications.idempotency_key })
          .from(notifications)
          .where(inArray(notifications.idempotency_key, keys));
        for (const row of rows) {
          if (row.idempotency_key) alreadySent.add(row.idempotency_key);
        }
      }
      const dropped = keyed.filter((r) => alreadySent.has(r.idempotencyKey as string));
      if (dropped.length > 0) {
        logger.debug('[notify] duplicates suppressed by idempotency key', {
          count: dropped.length,
        });
      }
      pending = uniqueBatch.filter(
        (r) => !r.idempotencyKey || !alreadySent.has(r.idempotencyKey),
      );
    }

    if (pending.length === 0) return results;

    // ── 2. Device tokens, grouped per distinct user (one query per chunk).
    const userIds = [...new Set(pending.map((r) => r.userId))];
    const tokensByUser = await fetchTokensByUser(userIds);

    // ── 3. One multi-row INSERT records the batch's sent-keys (dedup gate).
    const keyedPending = pending.filter((r) => r.idempotencyKey);
    if (keyedPending.length > 0) {
      for (let i = 0; i < keyedPending.length; i += QUERY_CHUNK_SIZE) {
        await db
          .insert(notifications)
          .values(
            keyedPending.slice(i, i + QUERY_CHUNK_SIZE).map((r) => ({
              user_id: r.userId,
              type: r.type,
              title: r.title,
              body: r.body,
              data: (r.data ?? {}) as any,
              sent_at: new Date(),
              idempotency_key: r.idempotencyKey,
            })),
          )
          .onConflictDoNothing({ target: notifications.idempotency_key });
      }
    }

    // ── 4. Pushes: batched 100-per-POST through a local concurrency window.
    //      Each request pushes to its user's unique token set (most-recent
    //      first, like the single path).
    const uniqueTokensByUser = new Map<string, string[]>();
    for (const [userId, tokens] of tokensByUser) {
      const seen = new Set<string>();
      uniqueTokensByUser.set(
        userId,
        tokens.filter((t) => {
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        }),
      );
    }

    const deadTokensByUser = new Map<string, string[]>();
    const auditRows: Array<{
      req: NotificationRequest;
      idx: number;
      tokenCount: number;
      failed: number;
    }> = [];

    const messages: Array<{ msg: ExpoPushMessage; reqIdx: number; userId: string }> = [];
    pending.forEach((req, reqIdx) => {
      const tokens = uniqueTokensByUser.get(req.userId) ?? [];
      if (tokens.length === 0) {
        logger.debug('[notify] no devices for user', { userId: req.userId, type: req.type });
        return;
      }
      for (const token of tokens) {
        messages.push({
          msg: {
            to: token,
            title: req.title,
            body: req.body,
            data: req.data ?? {},
            sound: 'default',
            priority: req.priority ?? 'high',
          },
          reqIdx,
          userId: req.userId,
        });
      }
    });

    // Chunked parallel sends. Outcomes land per message; one failed chunk
    // marks only its own messages failed.
    const chunks: Array<typeof messages> = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      chunks.push(messages.slice(i, i + EXPO_BATCH_SIZE));
    }
    const chunkOutcomes = await runWithConcurrency(chunks, PUSH_CONCURRENCY, (chunk) =>
      sendExpoChunk(chunk.map((m) => m.msg)),
    );

    for (let c = 0; c < chunks.length; c++) {
      const outcomes = chunkOutcomes[c];
      for (let m = 0; m < chunks[c].length; m++) {
        const { reqIdx, userId } = chunks[c][m];
        const outcome = outcomes[m];
        if (outcome.success) {
          results[reqIdx].sent++;
          continue;
        }
        results[reqIdx].failed++;
        // Y-2: prune tokens Expo reports as unregistered so stale devices
        // aren't re-targeted forever (wasted quota, latency, failure stats).
        if (
          typeof outcome.error === 'string' &&
          (outcome.error.includes('DeviceNotRegistered') ||
            outcome.error.includes('InvalidProviderToken'))
        ) {
          const dead = deadTokensByUser.get(userId) ?? [];
          dead.push(outcome.token);
          deadTokensByUser.set(userId, dead);
        }
      }
    }

    // Track non-idempotent requests that attempted pushes → legacy audit row.
    pending.forEach((req, reqIdx) => {
      const tokens = uniqueTokensByUser.get(req.userId) ?? [];
      if (tokens.length > 0 && !req.idempotencyKey) {
        auditRows.push({ req, idx: reqIdx, tokenCount: tokens.length, failed: results[reqIdx].failed });
      }
    });

    // Dead-token prune: one delete per affected user.
    for (const [userId, dead] of deadTokensByUser) {
      if (dead.length === 0) continue;
      try {
        await db
          .delete(userDevices)
          .where(and(eq(userDevices.user_id, userId), inArray(userDevices.push_token, dead)));
        logger.info('[notify] pruned dead push tokens', { userId, count: dead.length });
      } catch (err: unknown) {
        logger.warn('[notify] dead-token prune failed', {
          userId,
          error: errors.getErrorMessage(err),
        });
      }
    }

    // Non-idempotent path: audit rows after push (legacy callers).
    if (auditRows.length > 0) {
      await db.insert(notifications).values(
        auditRows.map(({ req, tokenCount, failed }) => ({
          user_id: req.userId,
          type: req.type,
          title: req.title,
          body: req.body,
          data: (req.data ?? {}) as any,
          sent_at: new Date(),
          failed_reason: failed > 0 ? `${failed}/${tokenCount} failed` : null,
        })),
      );
    }
  } catch (err: unknown) {
    // Legacy single path never threw to callers; the batch path keeps that
    // contract — failures are logged, partial results returned.
    logger.error('[notify] sendNotifications error', { error: errors.getErrorMessage(err) });
  }

  return results;
}

/** Grouped device lookup: tokens per user, most-recently-active first. */
async function fetchTokensByUser(userIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  for (const id of userIds) map.set(id, []);
  for (let i = 0; i < userIds.length; i += QUERY_CHUNK_SIZE) {
    const rows = await db
      .select({ user_id: userDevices.user_id, push_token: userDevices.push_token })
      .from(userDevices)
      .where(inArray(userDevices.user_id, userIds.slice(i, i + QUERY_CHUNK_SIZE)))
      .orderBy(desc(userDevices.last_active_at));
    for (const row of rows) {
      const list = map.get(row.user_id);
      if (list) list.push(row.push_token);
    }
  }
  return map;
}

/**
 * One Expo batch POST (up to 100 messages). Returns per-message outcomes
 * aligned to the input. A transport/shaped-response failure marks every
 * message in the chunk failed — it never throws.
 */
async function sendExpoChunk(messages: ExpoPushMessage[]): Promise<PushOutcome[]> {
  if (messages.length === 0) return [];
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: messages }),
    });
    const json: unknown = await res.json();
    const data = (json as { data?: unknown })?.data;
    if (!Array.isArray(data) || data.length !== messages.length) {
      throw new Error('unexpected expo batch response shape');
    }
    return data.map((item: unknown, i: number) => {
      const status = (item as { status?: string } | null)?.status;
      if (status === 'error') {
        const message = (item as { message?: unknown } | null)?.message;
        return {
          token: messages[i].to,
          success: false,
          error: typeof message === 'string' ? message : 'expo push error',
        };
      }
      return { token: messages[i].to, success: true };
    });
  } catch (err: unknown) {
    const msg = errors.getErrorMessage(err);
    return messages.map((m) => ({ token: m.to, success: false, error: msg }));
  }
}

/** Fixed-window semaphore over array items. No new dependency. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
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
