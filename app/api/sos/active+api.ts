import { db } from "@/src/db";
import { sosAlerts, users } from "@/src/db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/** R3.1: Window (in seconds) for clustering alerts as high-intensity. */
const INTENSITY_WINDOW_SECONDS = 60;

/**
 * GET /api/sos/active
 *
 * Returns the caller's most recent open or acknowledged SOS alert (if any).
 * Used by the SOS screen to check whether an alert is already in progress
 * before allowing a new one, and for the 10-second polling refresh cycle.
 * Acknowledged alerts are included so the user can still resolve them.
 */
export async function GET(request: Request) {
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

    const [alert] = await db
      .select({
        id: sosAlerts.id,
        status: sosAlerts.status,
        ride_id: sosAlerts.ride_id,
        latitude: sosAlerts.latitude,
        longitude: sosAlerts.longitude,
        message: sosAlerts.message,
        contacts_notified: sosAlerts.contacts_notified,
        created_at: sosAlerts.created_at,
        acknowledged_by: sosAlerts.acknowledged_by,
        acknowledged_at: sosAlerts.acknowledged_at,
      })
      .from(sosAlerts)
      .where(
        and(
          eq(sosAlerts.user_id, dbUser.id),
          or(
            eq(sosAlerts.status, "open"),
            eq(sosAlerts.status, "acknowledged"),
          ),
        ),
      )
      .orderBy(desc(sosAlerts.created_at))
      .limit(1);

    if (!alert) {
      return Response.json({ active: false });
    }

    // R3.1: Frequency-as-intensity — count alerts from this user in the
    // last 60 seconds. Three or more = high-intensity distress signal.
    const windowStart = new Date(Date.now() - INTENSITY_WINDOW_SECONDS * 1000);
    const [recentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(sosAlerts)
      .where(
        and(
          eq(sosAlerts.user_id, dbUser.id),
          sql`${sosAlerts.created_at} >= ${windowStart}`,
        ),
      );

    const recentAlertCount = Number(recentCount?.count ?? 0);

    return Response.json({
      active: true,
      alert: {
        id: alert.id,
        status: alert.status,
        ride_id: alert.ride_id,
        latitude: alert.latitude,
        longitude: alert.longitude,
        message: alert.message,
        contacts_notified: alert.contacts_notified,
        created_at: alert.created_at.toISOString(),
        acknowledged_by: alert.acknowledged_by,
        acknowledged_at: alert.acknowledged_at?.toISOString() ?? null,
      },
      // R3.1: frequency clustering data for admin + client
      recent_alert_count: recentAlertCount,
      is_high_intensity: recentAlertCount >= 3,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    logger.error("[sos/active] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
