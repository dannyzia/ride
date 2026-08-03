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

function normalizeBdPhone(phone: string): string {
  const t = phone.replace(/[\s-]/g, "");
  if (t.startsWith("+880")) return t;
  if (t.startsWith("880")) return "+" + t;
  if (t.startsWith("0")) return "+880" + t.slice(1);
  return "+880" + t;
}
