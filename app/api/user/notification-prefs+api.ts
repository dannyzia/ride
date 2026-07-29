import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { z } from "zod";

const DEFAULT_PREFS = {
  ride_updates: true,
  promo_offers: true,
  service_alerts: true,
  email_notifications: false,
  sms_notifications: true,
};

const patchSchema = z.object({
  ride_updates: z.boolean().optional(),
  promo_offers: z.boolean().optional(),
  service_alerts: z.boolean().optional(),
  email_notifications: z.boolean().optional(),
  sms_notifications: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ notification_prefs: users.notification_prefs })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const prefs = { ...DEFAULT_PREFS, ...(dbUser.notification_prefs as Record<string, boolean> ?? {}) };
    return Response.json({ notification_prefs: prefs }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/notification-prefs] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ id: users.id, notification_prefs: users.notification_prefs })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;

    const current = { ...DEFAULT_PREFS, ...(dbUser.notification_prefs as Record<string, boolean> ?? {}) };
    const merged = { ...current, ...parsed.data };

    await db.update(users)
      .set({ notification_prefs: merged, updated_at: new Date() })
      .where(eq(users.id, dbUser.id));

    return Response.json({ notification_prefs: merged }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/notification-prefs] PATCH error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
