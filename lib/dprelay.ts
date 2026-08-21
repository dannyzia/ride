import { logger } from "./logger";

export interface DpRelaySendOtpResponse {
  sessionId: string;
  expiresAt: string;
}

export interface DpRelayVerifyOtpResponse {
  verified: boolean;
  phoneNumber: string;
}

const FETCH_TIMEOUT_MS = 10_000;

// ── SOS-only hourly circuit breaker ──────────────────────────────────
// Scoped exclusively to SOS SMS traffic so OTP remains unaffected.
// When the breaker trips (>= SOS_MAX_FAILURES_PER_HOUR failures within
// an hour window), sendSmsSos returns false without hitting the wire.
// The breaker self-resets after SOS_COOLDOWN_MS.
const SOS_MAX_FAILURES_PER_HOUR = 5;
const SOS_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
let sosFailureCount = 0;
let sosWindowStart = Date.now();
let sosTripped = false;
let sosTrippedAt = 0;

function recordSosFailure(): boolean {
  const now = Date.now();
  if (sosTripped && now - sosTrippedAt < SOS_COOLDOWN_MS) {
    return false; // still tripped
  }
  if (sosTripped) {
    // Cooldown expired — reset
    sosTripped = false;
    sosFailureCount = 0;
    sosWindowStart = now;
  }
  if (now - sosWindowStart > SOS_COOLDOWN_MS) {
    sosFailureCount = 0;
    sosWindowStart = now;
  }
  sosFailureCount++;
  if (sosFailureCount >= SOS_MAX_FAILURES_PER_HOUR) {
    sosTripped = true;
    sosTrippedAt = now;
    logger.warn("[dprelay] SOS circuit breaker tripped", { failures: sosFailureCount });
    return false;
  }
  return true;
}

function isSosCircuitOpen(): boolean {
  if (!sosTripped) return false;
  if (Date.now() - sosTrippedAt >= SOS_COOLDOWN_MS) {
    sosTripped = false;
    sosFailureCount = 0;
    sosWindowStart = Date.now();
    return false;
  }
  return true;
}

async function dpRelayFetch(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const appId = process.env.DPRELAY_APP_ID;
  const appSecret = process.env.DPRELAY_APP_SECRET;
  const baseUrl = process.env.DPRELAY_BASE_URL;

  if (!appId || !appSecret || !baseUrl) {
    throw new Error("dpRelay credentials not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, appSecret, ...body }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendOtp(
  phoneNumber: string,
): Promise<DpRelaySendOtpResponse> {
  const response = await dpRelayFetch("/sendOtp", { phoneNumber });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[dprelay] sendOtp failed", response.status, errorText);
    throw new Error(`dpRelay sendOtp failed: ${response.status}`);
  }

  return (await response.json()) as DpRelaySendOtpResponse;
}

export async function verifyOtp(
  sessionId: string,
  otp: string,
): Promise<DpRelayVerifyOtpResponse> {
  const response = await dpRelayFetch("/verifyOtp", { sessionId, otp });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[dprelay] verifyOtp failed", response.status, errorText);
    throw new Error(`dpRelay verifyOtp failed: ${response.status}`);
  }

  return (await response.json()) as DpRelayVerifyOtpResponse;
}

export async function sendSms(
  phoneNumber: string,
  message: string,
): Promise<void> {
  const normalized = normalizeBdPhone(phoneNumber);
  const response = await dpRelayFetch("/sendSms", { phoneNumber: normalized, message });
  if (!response.ok) {
    const errorText = await response.text();
    logger.error("[dprelay] sendSms failed", response.status, errorText);
    throw new Error(`dpRelay sendSms failed: ${response.status}`);
  }
}

/**
 * SOS-scoped SMS with circuit breaker. Returns true if SMS was sent
 * successfully, false if the circuit is open or SMS failed.
 * The caller must log failures and never throw — SOS delivery is
 * best-effort; the alert row is already persisted.
 */
export async function sendSmsSos(
  phoneNumber: string,
  message: string,
): Promise<boolean> {
  if (isSosCircuitOpen()) {
    logger.warn("[dprelay] SOS SMS skipped — circuit breaker open");
    return false;
  }
  try {
    const normalized = normalizeBdPhone(phoneNumber);
    const response = await dpRelayFetch("/sendSms", { phoneNumber: normalized, message });
    if (!response.ok) {
      const errorText = await response.text();
      logger.error("[dprelay] sendSmsSos failed", response.status, errorText);
      recordSosFailure();
      return false;
    }
    return true;
  } catch (e) {
    logger.error("[dprelay] sendSmsSos error", e);
    recordSosFailure();
    return false;
  }
}

function normalizeBdPhone(phone: string): string {
  const t = phone.replace(/[\s-]/g, "");
  if (t.startsWith("+880")) return t;
  if (t.startsWith("880")) return "+" + t;
  if (t.startsWith("0")) return "+880" + t.slice(1);
  return "+880" + t;
}
