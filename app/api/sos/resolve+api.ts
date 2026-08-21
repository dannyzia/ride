import { db } from "@/src/db";
import { sosAlerts, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import * as errors from "@/lib/errors";

const resolveSchema = z.object({
  alert_id: z.string().uuid(),
});

/**
 * POST /api/sos/resolve
 *
 * Creator-only resolve: closes an open or acknowledged SOS alert. Only the
 * user who created the alert may resolve it. Accepts both 'open' and
 * 'acknowledged' status so that admin-acknowledged alerts are not stuck.
 * The scheduler also resolves after the configured timeout automatically
 * (see utils-server/scheduler.ts).
 */
export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );
    }

    const parsed = await parseJsonBody(request, resolveSchema);
    if (!parsed.ok) return parsed.response;

    const { alert_id } = parsed.data;

    // Fetch the alert — must be open and belong to the caller
    const [alert] = await db
      .select({
        id: sosAlerts.id,
        user_id: sosAlerts.user_id,
        status: sosAlerts.status,
      })
      .from(sosAlerts)
      .where(eq(sosAlerts.id, alert_id))
      .limit(1);

    if (!alert) {
      return Response.json(
        { error: "alert_not_found", message: "Alert not found" },
        { status: 404 },
      );
    }

    if (alert.status !== "open" && alert.status !== "acknowledged") {
      return Response.json(
        { error: "alert_not_resolvable", message: "Alert is not in a resolvable state" },
        { status: 409 },
      );
    }

    // Creator-only: only the user who triggered the SOS may resolve it
    if (alert.user_id !== dbUser.id) {
      return Response.json(
        { error: "forbidden", message: "Only the alert creator can resolve it" },
        { status: 403 },
      );
    }

    await db
      .update(sosAlerts)
      .set({
        status: "resolved",
        acknowledged_by: dbUser.id,
        acknowledged_at: new Date(),
      })
      .where(eq(sosAlerts.id, alert_id));

    logger.info("[sos/resolve] alert resolved", {
      alertId: alert_id,
      userId: dbUser.id,
    });

    return Response.json({ ok: true });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[sos/resolve] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
