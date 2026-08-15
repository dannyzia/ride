const BDT_OFFSET_MS = 6 * 60 * 60 * 1000;

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
