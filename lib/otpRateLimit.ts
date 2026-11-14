import { db } from "@/src/db";
import { rateLimits } from "@/src/db/schema";
import { sql } from "drizzle-orm";

/**
 * Atomic per-key rate-limit counter backed by the `rate_limits` table
 * (PK: key + window_start). Fixed 5-minute buckets; the counter is
 * incremented with ON CONFLICT DO UPDATE + RETURNING, so concurrent
 * requests can never read-modify-write past each other.
 *
 * Callers reject when the returned count exceeds their limit.
 */

const WINDOW_MS = 5 * 60_000;

export const OTP_PHONE_MAX = 5; // OTP texts per phone per window
export const OTP_IP_MAX = 20; // OTP texts per IP per window
export const OTP_VERIFY_MAX = 5; // verify attempts per session per window
export const CHECK_USER_PHONE_MAX = 30; // check-user lookups per phone per window
export const CHECK_USER_IP_MAX = 120; // check-user lookups per IP per window

// Public web account-deletion portal (app/api/user/delete-otp, delete-confirm).
// Deliberately tighter than login OTP: this is an unauthenticated SMS trigger
// whose success path destroys an account.
export const DELETE_OTP_PHONE_MAX = 3; // deletion OTP texts per phone per window
export const DELETE_OTP_IP_MAX = 10; // deletion OTP texts per IP per window
export const DELETE_OTP_VERIFY_MAX = 5; // verify attempts per challenge per window

export async function rateLimitCount(key: string): Promise<number> {
  const windowStart = new Date(
    Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS,
  );
  const [row] = await db
    .insert(rateLimits)
    .values({ key, window_start: windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.window_start],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  return row?.count ?? 1;
}
