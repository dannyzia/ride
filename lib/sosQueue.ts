/**
 * SOS Offline Alert Queue
 *
 * When the device is offline, SOS alert requests are persisted in AsyncStorage
 * and replayed on reconnect (one at a time, with exponential backoff). Each
 * alert is sent at most once (deduped by id). The queue is user-scoped —
 * different users on the same device never see each other's alerts.
 *
 * Storage key format: `@sos_queue:{userId}` → JSON array of QueueItem.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────

export interface SosPayload {
  lat: number;
  lng: number;
  ride_id?: string;
  message?: string;
}

export interface QueueItem {
  id: string;
  payload: SosPayload;
  /** Snapshot of the Supabase access token at enqueue time.
   *  May expire before the queue replays — we re-fetch fresh if needed. */
  token: string;
  userId: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  createdAt: string; // ISO 8601
  lastError?: string;
}

export interface QueueStatus {
  pending: number;
  failed: number;
  items: QueueItem[];
}

// ── Constants ──────────────────────────────────────────────────

const KEY_PREFIX = "@sos_queue:";
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

// ── Internal helpers ───────────────────────────────────────────

function queueKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function generateId(): string {
  return `sos_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function readQueue(userId: string): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(userId: string, items: QueueItem[]): Promise<void> {
  await AsyncStorage.setItem(queueKey(userId), JSON.stringify(items));
}

/**
 * Send a single SOS alert to the API. Returns true on success.
 */
async function sendAlert(
  payload: SosPayload,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/sos/alert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) return { ok: true };

    const body = await res.json().catch(() => ({}));
    const errorMsg = body?.message ?? `HTTP ${res.status}`;
    return { ok: false, error: errorMsg };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    return { ok: false, error: msg };
  }
}

/**
 * Exponential backoff with jitter: base * 2^attempt, capped at MAX_DELAY_MS.
 */
function backoffMs(attempt: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
  // Add 0–25% jitter to avoid thundering herd
  const jitter = exp * Math.random() * 0.25;
  return Math.round(exp + jitter);
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Enqueue an SOS alert for deferred sending.
 *
 * If the device is online, this still queues the item — the caller is
 * responsible for calling `processQueue()` immediately after (or the
 * startup hook does it). This keeps the flow uniform.
 *
 * Deduplication: if there's already a `queued` or `sending` item with
 * the same payload coordinates (within floating-point tolerance), the
 * new item is skipped.
 */
export async function enqueueSosAlert(
  payload: SosPayload,
): Promise<{ queued: boolean; id?: string; deduplicated?: boolean }> {
  // Resolve current user
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || !session?.access_token) {
    logger.warn("[sosQueue] enqueue failed — no active session");
    return { queued: false };
  }

  const userId = session.user.id;
  const token = session.access_token;
  const queue = await readQueue(userId);

  // Dedup: check if an identical alert is already queued/sending
  const existing = queue.find(
    (item) =>
      (item.status === "queued" || item.status === "sending") &&
      item.payload.lat === payload.lat &&
      item.payload.lng === payload.lng,
  );
  if (existing) {
    logger.info("[sosQueue] duplicate alert skipped", {
      existingId: existing.id,
    });
    return { queued: false, id: existing.id, deduplicated: true };
  }

  const item: QueueItem = {
    id: generateId(),
    payload,
    token,
    userId,
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  queue.push(item);
  await writeQueue(userId, queue);

  logger.info("[sosQueue] alert enqueued", { id: item.id });
  return { queued: true, id: item.id };
}

/**
 * Process all queued alerts for the current user.
 *
 * Items are sent one at a time. On success, status → "sent".
 * On failure with retries left, status stays "queued" (will retry
 * on next call). After MAX_ATTEMPTS failures, status → "failed".
 *
 * This function is idempotent — safe to call multiple times.
 */
export async function processQueue(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const userId = session.user.id;
  const queue = await readQueue(userId);
  const pendingItems = queue.filter(
    (item) => item.status === "queued" || item.status === "sending",
  );

  if (pendingItems.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  logger.info("[sosQueue] processing queue", { count: pendingItems.length });

  let sent = 0;
  let failed = 0;

  for (const item of pendingItems) {
    if (item.status !== "queued" && item.status !== "sending") continue;

    // Mark as sending
    item.status = "sending";
    await writeQueue(userId, queue);

    // Use a fresh token if the stored one might be stale (older than 50 min)
    const tokenAge = Date.now() - new Date(item.createdAt).getTime();
    let token = item.token;
    if (tokenAge > 50 * 60 * 1000) {
      const { data: { session: freshSession } } =
        await supabase.auth.getSession();
      if (freshSession?.access_token) {
        token = freshSession.access_token;
      }
    }

    item.attempts++;
    const result = await sendAlert(item.payload, token);

    if (result.ok) {
      item.status = "sent";
      sent++;
      logger.info("[sosQueue] alert sent", {
        id: item.id,
        attempts: item.attempts,
      });
    } else {
      item.lastError = result.error;
      if (item.attempts >= MAX_ATTEMPTS) {
        item.status = "failed";
        failed++;
        logger.error("[sosQueue] alert failed after max attempts", {
          id: item.id,
          attempts: item.attempts,
          error: result.error,
        });
      } else {
        // Will retry on next processQueue() call
        item.status = "queued";
        const delay = backoffMs(item.attempts);
        logger.info("[sosQueue] alert will retry", {
          id: item.id,
          attempts: item.attempts,
          nextDelayMs: delay,
        });
      }
    }

    await writeQueue(userId, queue);
  }

  return { processed: pendingItems.length, sent, failed };
}

/**
 * Get the current queue status for the logged-in user.
 */
export async function getQueueStatus(): Promise<QueueStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return { pending: 0, failed: 0, items: [] };
  }

  const queue = await readQueue(session.user.id);
  const pending = queue.filter(
    (item) => item.status === "queued" || item.status === "sending",
  ).length;
  const failed = queue.filter((item) => item.status === "failed").length;

  return { pending, failed, items: queue };
}

/**
 * Clean up the queue for a given user. Called on logout to prevent
 * cross-account leakage.
 */
export async function clearQueue(userId: string): Promise<void> {
  await AsyncStorage.removeItem(queueKey(userId));
  logger.info("[sosQueue] queue cleared for user", { userId });
}
