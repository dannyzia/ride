/**
 * Shared server-side notification-inbox logic.
 *
 * Used by both the rider and driver notification endpoints so pagination,
 * read semantics, and the 30-day retention predicate stay in one place.
 * The retention predicate mirrors scheduler job 57 exactly: a row becomes
 * soft-delete-eligible only when it is READ and older than the retention
 * window — unread notifications are never swept.
 */
import { db } from '@/src/db';
import { notifications } from '@/src/db/schema';
import { and, desc, eq, isNull, lt, isNotNull, sql, count } from 'drizzle-orm';
import { logger } from '@/lib/logger';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const NOTIFICATION_RETENTION_DAYS = 30;

/** Compact humanized age per the plan contract: "2m", "1h", "3d". */
export function timeAgo(d: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export interface RetentionCandidate {
  read_at: Date | null;
  created_at: Date;
}

/**
 * True when a notifications row is eligible for the 30-day soft delete:
 * read at least once AND created before the retention cutoff.
 * Edge contract (per plan tests): created 31d ago + read 1d ago → true;
 * created 29d ago + read 1d ago → false.
 */
export function isPastRetention(
  row: RetentionCandidate,
  now: Date,
  retentionDays: number = NOTIFICATION_RETENTION_DAYS,
): boolean {
  if (row.read_at === null) return false;
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return row.created_at.getTime() < cutoff.getTime();
}

export interface InboxRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: Date | null;
  created_at: Date;
}

export interface InboxPage {
  notifications: Array<InboxRow & { time_ago: string }>;
  unread_count: number;
  next_cursor: string | null;
}

/**
 * Cursor-paginated inbox list (newest first, cursor on created_at).
 * Soft-deleted rows are excluded everywhere; `unread_count` covers the
 * whole inbox regardless of the cursor.
 */
export async function listNotifications(
  userId: string,
  params: {
    limit?: number;
    before?: string;
    unreadOnly?: boolean;
    /** Injectable clock for the time_ago computation (tests). */
    now?: Date;
  } = {},
): Promise<InboxPage> {
  const limit = Math.min(
    Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );

  const beforeRaw = params.before;
  let beforeDate: Date | null = null;
  if (beforeRaw) {
    const parsed = new Date(beforeRaw);
    if (Number.isNaN(parsed.getTime())) {
      throw Object.assign(new Error('Invalid cursor'), { status: 400 });
    }
    beforeDate = parsed;
  }

  const conditions = [
    eq(notifications.user_id, userId),
    isNull(notifications.deleted_at),
  ];
  if (beforeDate) conditions.push(lt(notifications.created_at, beforeDate));
  if (params.unreadOnly) conditions.push(isNull(notifications.read_at));

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      data: notifications.data,
      read_at: notifications.read_at,
      created_at: notifications.created_at,
    })
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.created_at))
    .limit(limit + 1); // one extra row to detect the next page

  const now = params.now ?? new Date();
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const [{ unread }] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, userId),
        isNull(notifications.deleted_at),
        isNull(notifications.read_at),
      ),
    );

  return {
    notifications: page.map((r) => ({
      ...r,
      data: (r.data ?? null) as Record<string, unknown> | null,
      time_ago: timeAgo(r.created_at, now),
    })),
    unread_count: unread,
    next_cursor:
      hasMore && page.length > 0
        ? page[page.length - 1].created_at.toISOString()
        : null,
  };
}

/** Mark one notification read (ownership enforced in the WHERE). */
export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.user_id, userId),
        isNull(notifications.read_at),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

/** Mark every unread notification read; returns the affected row count. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const updated = await db
    .update(notifications)
    .set({ read_at: new Date() })
    .where(
      and(
        eq(notifications.user_id, userId),
        isNull(notifications.read_at),
        isNull(notifications.deleted_at),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

/** Soft-delete one notification (user swipe-delete). */
export async function softDeleteNotification(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const updated = await db
    .update(notifications)
    .set({ deleted_at: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.user_id, userId),
        isNull(notifications.deleted_at),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length > 0;
}

/**
 * Batch soft-delete for the retention sweep (scheduler job 57): read rows
 * older than the retention window. Returns the affected row count.
 */
export async function sweepExpiredNotifications(
  now: Date,
  retentionDays: number = NOTIFICATION_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const updated = await db
    .update(notifications)
    .set({ deleted_at: now })
    .where(
      and(
        isNull(notifications.deleted_at),
        isNotNull(notifications.read_at),
        lt(notifications.created_at, cutoff),
      ),
    )
    .returning({ id: notifications.id });
  if (updated.length > 0) {
    logger.info('[notifications] retention sweep', { deleted: updated.length });
  }
  return updated.length;
}

/** Raw count helper used by tests to sanity-check the sweep predicate. */
export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.user_id, userId),
        isNull(notifications.deleted_at),
        isNull(notifications.read_at),
      ),
    );
  return row?.unread ?? 0;
}
