/**
 * R3.2: Driver Safety Hub API
 *
 * GET — returns aggregated safety data for the driver:
 *   - emergency contacts (own userEmergencyContacts rows)
 *   - last 10 SOS alerts (own sosAlerts rows)
 *   - safety tips from platform_config key 'safety_tips' (jsonb array)
 *   - static BD emergency hotlines
 *
 * No new tables. Read-only. Used by the safety hub screen.
 */
import { db } from "@/src/db";
import { users, userEmergencyContacts, sosAlerts } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { getConfigValue } from "@/lib/platformConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/** Static BD emergency hotlines (verified local numbers). */
const BD_HOTLINES = [
  { name: "Police / Fire / Ambulance", phone: "999", icon: "shield" },
  { name: "National Emergency Helpline", phone: "16263", icon: "call" },
  { name: "Fire Service & Civil Defence", phone: "199", icon: "flame" },
  { name: "Ambulance (Red Crescent)", phone: "16235", icon: "medkit" },
] as const;

/** Default safety tips when platform_config has none. */
const DEFAULT_SAFETY_TIPS = [
  { title: "Share your trip", description: "Share your live location with trusted contacts during each trip." },
  { title: "Verify the rider", description: "Confirm the rider's name and destination before starting the trip." },
  { title: "Trust your instincts", description: "If something feels wrong, cancel the ride and report it immediately." },
  { title: "Check vehicle details", description: "Verify the vehicle plate number and model match the app before getting in." },
];

interface SafetyTip {
  title: string;
  description: string;
}

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    // Parallel fetch: emergency contacts, recent SOS alerts, safety tips
    const [contacts, recentAlerts, tipsRaw] = await Promise.all([
      // Emergency contacts
      db
        .select({
          id: userEmergencyContacts.id,
          name: userEmergencyContacts.name,
          phone: userEmergencyContacts.phone,
          relationship: userEmergencyContacts.relationship,
        })
        .from(userEmergencyContacts)
        .where(eq(userEmergencyContacts.user_id, dbUser.id)),

      // Last 10 SOS alerts (own)
      db
        .select({
          id: sosAlerts.id,
          status: sosAlerts.status,
          latitude: sosAlerts.latitude,
          longitude: sosAlerts.longitude,
          message: sosAlerts.message,
          created_at: sosAlerts.created_at,
          ride_id: sosAlerts.ride_id,
        })
        .from(sosAlerts)
        .where(eq(sosAlerts.user_id, dbUser.id))
        .orderBy(desc(sosAlerts.created_at))
        .limit(10),

      // Safety tips from platform_config (jsonb string)
      getConfigValue("safety_tips", ""),
    ]);

    // Parse safety tips — stored as JSON string in platform_config
    let tips: SafetyTip[] = DEFAULT_SAFETY_TIPS;
    if (tipsRaw) {
      try {
        const parsed = JSON.parse(tipsRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          tips = parsed;
        }
      } catch {
        // Invalid JSON — fall back to defaults
        logger.warn("[driver/safety] safety_tips parse failed, using defaults");
      }
    }

    return Response.json({
      emergency_contacts: contacts,
      recent_alerts: recentAlerts.map((a) => ({
        ...a,
        created_at: a.created_at.toISOString(),
      })),
      safety_tips: tips,
      hotlines: BD_HOTLINES,
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    logger.error("[driver/safety] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
