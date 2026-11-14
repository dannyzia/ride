// [public]
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { parseJsonBody } from "@/lib/parseBody";
import { verifyOtp as verifyDpRelayOtp } from "@/lib/dprelay";
import { isDevOtpBypassEnabled, consumeDevSession } from "@/lib/devOtpBypass";
import { rateLimitCount, DELETE_OTP_VERIFY_MAX } from "@/lib/otpRateLimit";
import {
  checkDeleteEligibility,
  deletionBlockedResponse,
  scrubAccountTx,
} from "@/lib/accountDelete";
import { logger } from "@/lib/logger";

const schema = z
  .object({
    sessionId: z.string().min(1),
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  })
  .strict();

/**
 * Web account-deletion portal — step 2 of 2 (Google Play web deletion route).
 *
 * Verifies the deletion-scoped OTP and, in one transaction, applies the SAME
 * preconditions as the in-app delete (`lib/accountDelete.ts`): no unpaid dues
 * and no live booking. Only then does `scrubAccountTx` run — the identical
 * writer the app uses, so there is still one delete semantic.
 *
 * Authorization is purpose-scoped: the phone number comes from the verified
 * dpRelay challenge and is resolved to an account here; the caller never
 * supplies a user id. `markVerified()` is never called, so this challenge
 * cannot be replayed as a registration or phone-change proof, and because the
 * scrub tombstones `users.phone`, replaying the same OTP finds no account.
 */
export async function POST(request: Request) {
  const result = await parseJsonBody(request, schema);
  if (!result.ok) return result.response;

  const { sessionId, otp } = result.data;

  try {
    // Local brute-force cap per challenge (same defense-in-depth shape as
    // app/api/auth/verify-otp): the lockout is indistinguishable from a wrong
    // code, and dpRelay's own attempt limit is not relied upon.
    const attempts = await rateLimitCount(`delete-otp:verify:${sessionId}`);
    if (attempts > DELETE_OTP_VERIFY_MAX) {
      return Response.json(
        { error: "invalid_otp", message: "Verification failed" },
        { status: 400 },
      );
    }

    let verifiedPhone: string | null = null;
    if (isDevOtpBypassEnabled()) {
      verifiedPhone = consumeDevSession(sessionId, otp);
    } else {
      const dpResult = await verifyDpRelayOtp(sessionId, otp);
      verifiedPhone = dpResult.verified ? dpResult.phoneNumber : null;
    }

    if (!verifiedPhone) {
      return Response.json(
        { error: "invalid_otp", message: "Verification failed" },
        { status: 400 },
      );
    }

    // Normalize to the stored E.164 shape (leading +).
    const phone = verifiedPhone.startsWith("+")
      ? verifiedPhone
      : "+" + verifiedPhone.replace(/^\D+/, "");

    // A tombstoned account is already deleted: its phone no longer resolves,
    // which is also what makes this endpoint replay-safe.
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), isNull(users.deleted_at)))
      .limit(1);

    if (!target) {
      return Response.json(
        { error: "account_not_found", message: "No active Ride account matches that number" },
        { status: 404 },
      );
    }

    const block = await db.transaction(async (tx) => {
      const blocked = await checkDeleteEligibility(tx, target.id);
      if (blocked) return blocked;
      await scrubAccountTx(tx, target.id);
      return null;
    });

    if (block) return deletionBlockedResponse(block);

    logger.info("[user/delete-confirm] account deleted via web portal", {
      user_id: target.id,
    });
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("dpRelay")) {
      return Response.json(
        { error: "otp_verify_failed", message: error.message },
        { status: 502 },
      );
    }
    logger.error("[user/delete-confirm] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
