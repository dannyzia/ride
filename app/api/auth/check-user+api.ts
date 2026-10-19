// [public]
import { z } from "zod";
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { parseJsonBody } from "@/lib/parseBody";
import {
  rateLimitCount,
  CHECK_USER_PHONE_MAX,
  CHECK_USER_IP_MAX,
} from "@/lib/otpRateLimit";
import { logger } from "@/lib/logger";
import { heldRoles } from "@/lib/launchRoles";

const checkUserSchema = z
  .object({
    phone: z.string().regex(/^\+880\d{10}$/, "Invalid Bangladesh phone number"),
  })
  .strict();

export async function POST(request: Request) {
  const result = await parseJsonBody(request, checkUserSchema);
  if (!result.ok) return result.response;

  const { phone } = result.data;

  // Bound phone-number enumeration on this public lookup: per phone AND
  // per IP (rate_limits table), using the same class as send-otp.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip")?.trim() ??
    "unknown";
  const [phoneCount, ipCount] = await Promise.all([
    rateLimitCount(`check-user:phone:${phone}`),
    rateLimitCount(`check-user:ip:${ip}`),
  ]);
  if (phoneCount > CHECK_USER_PHONE_MAX || ipCount > CHECK_USER_IP_MAX) {
    logger.warn("[check-user] rate limited", { phone, ip, phoneCount, ipCount });
    return Response.json(
      { error: "rate_limited", message: "Too many lookup requests. Try again later." },
      { status: 429 },
    );
  }

  try {
    const user = await db
      .select({ id: users.id, role: users.role, deleted_at: users.deleted_at })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    // C2-1/C2-4: a soft-deleted phone frees for re-registration — the public
    // lookup reports it as non-existent.
    if (user.length === 0 || user[0].deleted_at != null) {
      return Response.json({ exists: false, role: null, roles: [] }, { status: 200 });
    }

    // OWNER-DECISION #9: the post-OTP "Login as [Role]" chooser needs the set
    // of roles the account holds. This endpoint is UNAUTHENTICATED (S2.1 D-3,
    // §16): only {role, status} pairs cross the boundary — reject reason/code/
    // field/example, resubmit_count and prefill stay behind the
    // authenticated GET /api/user/roles (full heldRoles payload).
    const held = await heldRoles(user[0].id);

    return Response.json(
      {
        exists: true,
        role: user[0].role,
        roles: held.map((r) => ({ role: r.role, status: r.status })),
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error("[check-user] error", error);
    return Response.json(
      { error: "server_error", message: "Internal server error" },
      { status: 500 },
    );
  }
}
