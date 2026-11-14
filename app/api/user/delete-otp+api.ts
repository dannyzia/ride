// [public]
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { sendOtp } from "@/lib/dprelay";
import {
  isDevOtpBypassEnabled,
  createDevSession,
  devOtpCode,
} from "@/lib/devOtpBypass";
import {
  rateLimitCount,
  DELETE_OTP_PHONE_MAX,
  DELETE_OTP_IP_MAX,
} from "@/lib/otpRateLimit";
import { logger } from "@/lib/logger";

const schema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
  })
  .strict();

/**
 * Web account-deletion portal — step 1 of 2.
 *
 * Sends a deletion-scoped SMS challenge. Deliberately does NOT reveal whether
 * the number belongs to a Ride account: the same 200 shape comes back either
 * way, and existence is only resolved after the code is verified
 * (app/api/user/delete-confirm). The challenge is a plain dpRelay session that
 * this flow verifies itself — the generic `markVerified()` registration flag
 * is never set here, so completing a deletion OTP cannot be replayed as a
 * registration or phone-change proof.
 */
export async function POST(request: Request) {
  const result = await parseJsonBody(request, schema);
  if (!result.ok) return result.response;

  const { phone } = result.data;

  // DEV-ONLY bypass: no SMS round-trip, fixed dev session (parity with
  // app/api/auth/send-otp). Excluded from the counters below — it costs
  // nothing and never reaches dpRelay.
  if (isDevOtpBypassEnabled()) {
    const session = createDevSession(phone);
    return Response.json(
      { ...session, dev: true, devOtp: devOtpCode() },
      { status: 200 },
    );
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const [phoneCount, ipCount] = await Promise.all([
    rateLimitCount(`delete-otp:phone:${phone}`),
    rateLimitCount(`delete-otp:ip:${ip}`),
  ]);
  if (phoneCount > DELETE_OTP_PHONE_MAX || ipCount > DELETE_OTP_IP_MAX) {
    logger.warn("[delete-otp] rate limited", { phone, ip, phoneCount, ipCount });
    return Response.json(
      { error: "rate_limited", message: "Too many deletion codes requested. Try again later." },
      { status: 429 },
    );
  }

  try {
    const dpResult = await sendOtp(phone);
    return Response.json(
      { sessionId: dpResult.sessionId, expiresAt: dpResult.expiresAt },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("dpRelay")) {
      return Response.json(
        { error: "otp_send_failed", message: error.message },
        { status: 502 },
      );
    }
    logger.error("[delete-otp] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
