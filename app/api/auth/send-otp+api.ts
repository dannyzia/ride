// [public]
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { sendOtp } from "@/lib/dprelay";
import {
  isDevOtpBypassEnabled,
  createDevSession,
  devOtpCode,
} from "@/lib/devOtpBypass";
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
