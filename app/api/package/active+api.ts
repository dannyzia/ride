import { db } from "@/src/db";
import { subscriptions, packages, drivers, users } from "@/src/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const [sub] = await db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        calls_remaining: subscriptions.calls_remaining,
        expires_at: subscriptions.expires_at,
        frozen_at: subscriptions.frozen_at,
        package_id: subscriptions.package_id,
      })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.driver_id, driver.id),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);

    if (!sub) return Response.json({ subscription: null });

    const [pkg] = await db
      .select()
      .from(packages)
      .where(eq(packages.id, sub.package_id))
      .limit(1);

    const now = new Date();
    const frozen = sub.frozen_at != null
      && (sub.expires_at ? new Date(sub.expires_at) > now : false)
      && (sub.calls_remaining ?? 0) > 0;

    return Response.json({
      subscription: {
        ...sub,
        package_name: pkg?.name ?? "Unknown",
        package_vehicle_type: pkg?.vehicle_type ?? null,
        // C10-1 grant-source identity: stable plan code (e.g. 'launch_free').
        // Clients match on this, never on the admin-editable package_name.
        package_code: pkg?.code ?? null,
        // D2: frozen-calls state — a frozen (but usable) call subscription must
        // never render as spendable calls on home/calls UI (CUJ 5).
        frozen,
        frozen_at: sub.frozen_at ? sub.frozen_at.toISOString() : null,
      },
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[package/active] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
