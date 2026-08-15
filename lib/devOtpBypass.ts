import { logger } from "@/lib/logger";

/**
 * DEV-ONLY OTP bypass.
 *
 * Enabled ONLY when `DEV_OTP_BYPASS=true` (opt-in, defaults off). Lets automated
 * and manual tests complete phone login WITHOUT a real SMS round-trip:
 *   - send-otp returns a dev session id (and, for convenience, the dev code).
 *   - verify-otp accepts the fixed dev code and marks the phone verified.
 *
 * The verified phone is carried through an in-memory map keyed by sessionId
 * (the dev build is a single process), so verify-otp doesn't need dpRelay's
 * phone echo. NEVER set DEV_OTP_BYPASS in production.
 */
const DEV_OTP_CODE = process.env.DEV_OTP ?? "123456";
// Hard stop, not a comment: the bypass is impossible under NODE_ENV=production
// even if DEV_OTP_BYPASS is accidentally set (copied .env, fat-fingered deploy).
const DEV_OTP_BYPASS =
  process.env.DEV_OTP_BYPASS === "true" && process.env.NODE_ENV !== "production";
const SESSION_TTL_MS = 5 * 60_000; // 5 minutes

interface DevSession {
  phone: string;
  expiresAt: number;
}
const devSessions = new Map<string, DevSession>();

export function isDevOtpBypassEnabled(): boolean {
  return DEV_OTP_BYPASS;
}

export function devOtpCode(): string {
  return DEV_OTP_CODE;
}

/** Create a dev OTP session for a phone; returns the sessionId to hand to the client. */
export function createDevSession(phone: string): {
  sessionId: string;
  expiresAt: string;
} {
  const sessionId = "dev-" + Math.random().toString(36).slice(2, 10);
  const expiresAtMs = Date.now() + SESSION_TTL_MS;
  devSessions.set(sessionId, { phone, expiresAt: expiresAtMs });
  if (DEV_OTP_BYPASS) {
    logger.warn(
      `[devOtpBypass] active — dev session created for ${phone}; use code ${DEV_OTP_CODE}`,
    );
  }
  return { sessionId, expiresAt: new Date(expiresAtMs).toISOString() };
}

/**
 * Validate a dev session + code. Returns the verified phone on success, or null
 * if the session is unknown/expired or the code is wrong. One-time use.
 */
export function consumeDevSession(sessionId: string, otp: string): string | null {
  const entry = devSessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    devSessions.delete(sessionId);
    return null;
  }
  if (otp !== DEV_OTP_CODE) return null;
  devSessions.delete(sessionId);
  return entry.phone;
}
