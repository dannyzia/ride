const BDT_OFFSET_MS = 6 * 60 * 60 * 1000;

/**
 * Humanized "time ago" for the hotspot map's last-updated label:
 * "Just now" / "N min ago" / "1 hour ago" / "N hours ago".
 * Future timestamps clamp to "Just now".
 *
 * @param now — injectable clock for deterministic tests; defaults to Date.now().
 */
export function relativeTime(d: Date, now: Date = new Date()): string {
  const minutes = Math.floor(Math.max(0, now.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}

/** Next 00:00 Asia/Dhaka as a UTC timestamp. */
export function nextBdtMidnightUtc(): Date {
  const now = new Date();
  const bdtNow = new Date(now.getTime() + BDT_OFFSET_MS);
  const midnight = new Date(Date.UTC(bdtNow.getUTCFullYear(), bdtNow.getUTCMonth(), bdtNow.getUTCDate() + 1));
  return new Date(midnight.getTime() - BDT_OFFSET_MS);
}

/** Previous 00:00 Asia/Dhaka as a UTC timestamp. */
export function prevBdtMidnightUtc(): Date {
  const now = new Date();
  const bdtNow = new Date(now.getTime() + BDT_OFFSET_MS);
  const midnight = new Date(Date.UTC(bdtNow.getUTCFullYear(), bdtNow.getUTCMonth(), bdtNow.getUTCDate()));
  return new Date(midnight.getTime() - BDT_OFFSET_MS);
}

/**
 * UTC boundaries [start, end) of a given Asia/Dhaka calendar day.
 *
 * @param dateStr — "YYYY-MM-DD" interpreted in Asia/Dhaka (UTC+6), not device/server tz.
 * @returns { start, end } as UTC Dates, or null for a malformed/nonexistent date.
 */
export function bdtDayBoundariesUtc(
  dateStr: string,
): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Reject overflow dates that Date.UTC would silently normalize (e.g. Feb 30).
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  const start = new Date(Date.UTC(year, month - 1, day) - BDT_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** First 00:00 of the current Asia/Dhaka month as a UTC timestamp. */
export function bdtMonthStartUtc(): Date {
  const todayStart = prevBdtMidnightUtc(); // UTC midnight of today's Dhaka day
  return new Date(
    Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1) - BDT_OFFSET_MS,
  );
}
