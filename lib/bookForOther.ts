/**
 * Shared helpers for book-for-other ride booking.
 *
 * Covers: BD phone normalization, self-phone rejection, consent freshness.
 * Used by app/api/ride/request+api.ts and app/api/ride/schedule+api.ts.
 */

/** BD phone regex: starts with 01, 11 digits total. */
const BD_PHONE_RE = /^01\d{9}$/;

/**
 * Normalize a BD phone number to `01XXXXXXXXX` (11 digits).
 * Strips +88 / 88 prefix, strips spaces/dashes.
 * Returns null if the input is not a valid BD phone.
 */
export function normalizeBdPhone(raw: string): string | null {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  let phone = cleaned;
  // Strip +88 / 88 prefix
  if (phone.startsWith("+88")) {
    phone = phone.slice(3);
  } else if (phone.startsWith("88") && phone.length > 11) {
    phone = phone.slice(2);
  }
  if (!BD_PHONE_RE.test(phone)) return null;
  return phone;
}

/**
 * Check whether two phone numbers refer to the same person (normalized).
 * Both must be valid BD phones.
 */
export function isSamePhone(a: string, b: string): boolean {
  const na = normalizeBdPhone(a);
  const nb = normalizeBdPhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

/** Default max consent age: 10 minutes. */
export const CONSENT_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Check whether a consent_at timestamp is fresh enough.
 * Returns true if consentAt is within maxAgeMs of now.
 */
export function isConsentFresh(
  consentAt: string | undefined | null,
  nowMs: number,
  maxAgeMs: number = CONSENT_MAX_AGE_MS,
): boolean {
  if (!consentAt) return false;
  const ts = new Date(consentAt).getTime();
  if (isNaN(ts)) return false;
  return nowMs - ts <= maxAgeMs;
}
