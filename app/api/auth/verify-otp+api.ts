// [public]
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { verifyOtp as verifyDpRelayOtp } from "@/lib/dprelay";
import { markVerified } from "@/lib/verifiedPhones";
import { logger } from "@/lib/logger";

const verifyOtpSchema = z
  .object({
    sessionId: z.string().min(1),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, verifyOtpSchema);
  if (!result.ok) return result.response;

  const { sessionId, otp } = result.data;

  try {
    const dpResult = await verifyDpRelayOtp(sessionId, otp);

    if (!dpResult.verified) {
      return Response.json(
        { error: "invalid_otp", message: "OTP verification failed" },
        { status: 400 },
      );
    }

    // Normalize: always store with leading + to match client format
    const normalizedPhone = dpResult.phoneNumber.startsWith("+")
      ? dpResult.phoneNumber
      : "+" + dpResult.phoneNumber.replace(/^\D+/, "");

    markVerified(normalizedPhone);

    return Response.json(
      { verified: true, phoneNumber: normalizedPhone },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("dpRelay")) {
      return Response.json(
        { error: "otp_verify_failed", message: error.message },
        { status: 502 },
      );
    }
    logger.error("[verify-otp] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
