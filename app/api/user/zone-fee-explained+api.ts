/**
 * POST /api/user/zone-fee-explained
 *
 * Sets users.zone_fee_explained = true for the authenticated user.
 * Called by ZoneFeeExplainerSheet on first dismiss.
 *
 * Body: none (bodyless POST per AGENTS.md).
 * Auth: user JWT required.
 */
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    await db
      .update(users)
      .set({ zone_fee_explained: true })
      .where(eq(users.auth_uid, user.id));

    return Response.json({ ok: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[user/zone-fee-explained] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
