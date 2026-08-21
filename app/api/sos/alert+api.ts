import { db } from "../../../src/db";
import { users, rides, sosAlerts, userEmergencyContacts } from "../../../src/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { verifySupabaseToken } from "../../../lib/auth";
import { logger } from "../../../lib/logger";
import { sendNotification } from "../../../lib/notify";
import { sendSmsSos } from "../../../lib/dprelay";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { getPlan05Int } from "@/lib/platformConfig";
import * as errors from "@/lib/errors";

// T-1: this endpoint serves BOTH riders and drivers (the plan's canonical
// POST /api/sos/alert — the previous driver/sos-alert route 403'd riders, so
// the rider SOS button could never reach the sos_alerts machinery).
const sosSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Optional ride context so the admin SOS dashboard can tie the alert to a
  // ride (and the auto-SOS can dedupe to one open alert per ride).
  ride_id: z.string().uuid().optional(),
  message: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id, role: users.role, name: users.name })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }
    if (dbUser.role !== "rider" && dbUser.role !== "driver") {
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    }

    const parsed = await parseJsonBody(request, sosSchema);
    if (!parsed.ok) return parsed.response;

    const { lat, lng, ride_id, message } = parsed.data;

    // C-4: ride ownership — an SOS may only be attached to a ride the caller
    // is actually part of (as rider or as driver). Without this, any user
    // could attach alerts to arbitrary ride ids, and the per-ride dedupe
    // below would let them suppress someone else's open alert.
    if (ride_id) {
      const [ride] = await db
        .select({ user_id: rides.user_id, driver_id: rides.driver_id })
        .from(rides)
        .where(eq(rides.id, ride_id))
        .limit(1);
      if (!ride) {
        return Response.json({ error: "ride_not_found", message: "Ride not found" }, { status: 404 });
      }
      const isRider = ride.user_id === dbUser.id;
      const isDriver = ride.driver_id === dbUser.id;
      if (!isRider && !isDriver) {
        return Response.json({ error: "not_your_ride", message: "You can only send an SOS for your own ride" }, { status: 403 });
      }
    }

    // Configurable cooldown: if the user sent an SOS within the configured
    // window (default 15 min), reuse the existing open alert.
    const cooldownSeconds = await getPlan05Int('sos_cooldown_seconds');
    const cooldownThreshold = new Date(Date.now() - cooldownSeconds * 1000);
    const [recentAlert] = await db
      .select({ id: sosAlerts.id })
      .from(sosAlerts)
      .where(
        and(
          eq(sosAlerts.user_id, dbUser.id),
          eq(sosAlerts.status, "open"),
        ),
      )
      .orderBy(desc(sosAlerts.created_at))
      .limit(1);
    if (recentAlert && (!ride_id || !recentAlert.id)) {
      // Cooldown: user already has a recent open alert
      if (recentAlert.id) {
        logger.info("[sos/alert] cooldown — reusing recent open alert", { alertId: recentAlert.id });
        return Response.json({ ok: true, deduped: true, alert_id: recentAlert.id });
      }
    }

    // One open alert per ride: if the ride already has an open SOS (e.g. the
    // auto-SOS fired, or the user double-tapped), keep the existing row — the
    // alert is already on the admin dashboard.
    if (ride_id) {
      const [existing] = await db
        .select({ id: sosAlerts.id })
        .from(sosAlerts)
        .where(and(eq(sosAlerts.ride_id, ride_id), eq(sosAlerts.status, "open")))
        .limit(1);
      if (existing) {
        logger.info("[sos/alert] open alert already exists for ride, keeping it", { ride_id, alertId: existing.id });
        return Response.json({ ok: true, deduped: true, alert_id: existing.id });
      }
    }

    const [inserted] = await db
      .insert(sosAlerts)
      .values({
        user_id: dbUser.id,
        role: dbUser.role as "rider" | "driver",
        latitude: lat.toString(),
        longitude: lng.toString(),
        ride_id: ride_id ?? null,
        message: message ?? (dbUser.role === "driver" ? "Driver SOS alert" : "Rider SOS alert"),
        contacts_notified: [],
      })
      .returning();

    logger.info("[sos/alert] recorded", { user_id: dbUser.id, role: dbUser.role, lat, lng, ride_id });

    // F-15: push the new alert to admin dashboards in real time via
    // utils-server. NEW inserts only — the dedupe short-circuit above means
    // the alert is already on the dashboard. The WS server only broadcasts;
    // it never writes sos_alerts.
    if (inserted) {
      // Push notification to the user (best-effort)
      sendNotification(
        dbUser.id,
        "sos:alert",
        "SOS Alert Sent",
        "Your emergency alert has been sent. Help is on the way.",
        { alert_id: inserted.id },
        { priority: "high" },
      ).catch((e) => logger.warn("[sos/alert] push notification failed", e));

      // Notify admin devices (best-effort)
      const [adminUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1);
      if (adminUser) {
        sendNotification(
          adminUser.id,
          "sos:admin_alert",
          "🚨 SOS Alert",
          `${dbUser.role} SOS from ${message ?? "emergency"}. Location: ${lat}, ${lng}`,
          { alert_id: inserted.id, lat: String(lat), lng: String(lng) },
          { priority: "high" },
        ).catch((e) => logger.warn("[sos/alert] admin push failed", e));
      }

      // Best-effort SMS to user_emergency_contacts (NOT the public SOS contacts)
      // + one retry on failure. Alert succeeds even when SMS fails.
      const contacts = await db
        .select({ phone: userEmergencyContacts.phone, name: userEmergencyContacts.name })
        .from(userEmergencyContacts)
        .where(eq(userEmergencyContacts.user_id, dbUser.id));

      const notifiedContacts: string[] = [];
      const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
      const sosMessage = `Emergency SOS! ${dbUser.name} needs help. Location: ${lat},${lng}${serverUrl ? `. Track: ${serverUrl}/track/${ride_id ?? inserted.id}` : ""}`;

      for (const contact of contacts) {
        let sent = await sendSmsSos(contact.phone, sosMessage);
        if (!sent) {
          // One retry
          await new Promise((r) => setTimeout(r, 1000));
          sent = await sendSmsSos(contact.phone, sosMessage);
        }
        if (sent) notifiedContacts.push(contact.phone);
      }

      // Update contacts_notified
      if (notifiedContacts.length > 0) {
        await db
          .update(sosAlerts)
          .set({ contacts_notified: notifiedContacts as any })
          .where(eq(sosAlerts.id, inserted.id));
      }

      // F-15: push to utils-server WS for admin dashboards
      const wsPort = process.env.UTILS_SERVER_PORT ?? "3001";
      const internalSecret = process.env.WEBSOCKET_INTERNAL_SECRET;
      if (internalSecret) {
        try {
          await fetch(`http://127.0.0.1:${wsPort}/internal/sos/alert`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${internalSecret}`,
            },
            body: JSON.stringify({
              alert: {
                id: inserted.id,
                user_id: inserted.user_id,
                role: inserted.role,
                latitude: String(inserted.latitude),
                longitude: String(inserted.longitude),
                message: inserted.message,
                ride_id: inserted.ride_id,
                created_at: inserted.created_at.toISOString(),
              },
            }),
            signal: AbortSignal.timeout(3_000),
          });
        } catch {
          // WS push failure is non-fatal — the alert is already persisted.
        }
      }
    }

    // 201 for new alerts (not deduped)
    return Response.json({ ok: true, alert_id: inserted?.id }, { status: 201 });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[sos/alert] error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
