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
  OTP_PHONE_MAX,
  OTP_IP_MAX,
} from "@/lib/otpRateLimit";
import { logger } from "@/lib/logger";

const sendOtpSchema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, sendOtpSchema);
  if (!result.ok) return result.response;

  const { phone } = result.data;

  // DEV-ONLY bypass: skip the SMS round-trip and return a fixed dev session.
  if (isDevOtpBypassEnabled()) {
    const session = createDevSession(phone);
    return Response.json(
      { ...session, dev: true, devOtp: devOtpCode() },
      { status: 200 },
    );
  }

  // Rate-limit the public SMS cannon: per phone AND per IP (rate_limits table).
  // The dev bypass above is excluded — it sends no SMS and costs nothing.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const [phoneCount, ipCount] = await Promise.all([
    rateLimitCount(`otp:phone:${phone}`),
    rateLimitCount(`otp:ip:${ip}`),
  ]);
  if (phoneCount > OTP_PHONE_MAX || ipCount > OTP_IP_MAX) {
    logger.warn("[send-otp] rate limited", {
      phone,
      ip,
      phoneCount,
      ipCount,
    });
    return Response.json(
      { error: "rate_limited", message: "Too many OTP requests. Try again later." },
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
    logger.error("[send-otp] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
