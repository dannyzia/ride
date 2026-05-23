export function nextBdtMidnightUtc(): Date {
  const now = new Date();
  const bdtNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const midnight = new Date(Date.UTC(bdtNow.getUTCFullYear(), bdtNow.getUTCMonth(), bdtNow.getUTCDate() + 1));
  return new Date(midnight.getTime() - 6 * 60 * 60 * 1000);
}
