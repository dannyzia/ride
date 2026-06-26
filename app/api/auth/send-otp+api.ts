// [public]
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { sendOtp } from "@/lib/dprelay";
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
