import { db } from "@/src/db";
import { rides, users, drivers, subscriptions, packages } from "@/src/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const [sub] = await db.select({
      id: subscriptions.id,
      calls_remaining: subscriptions.calls_remaining,
      status: subscriptions.status,
      expires_at: subscriptions.expires_at,
      package_name: packages.name,
    })
      .from(subscriptions)
      .leftJoin(packages, eq(subscriptions.package_id, packages.id))
      .where(and(eq(subscriptions.driver_id, driver.id), eq(subscriptions.status, "active")))
      .orderBy(desc(subscriptions.purchased_at))
      .limit(1);

    const [commissionRow] = await db.select({
      total_commission: sql<number>`COALESCE(SUM(platform_commission_bdt), 0)`,
    })
      .from(rides)
      .where(and(
        eq(rides.driver_id, driver.id),
        eq(rides.status, "completed"),
      ));

    const commissionDue = Number(commissionRow?.total_commission ?? 0);

    return Response.json({
      subscription: sub
        ? {
            package_name: sub.package_name,
            expires_at: sub.expires_at.toISOString(),
            calls_remaining: sub.calls_remaining,
            status: sub.status,
          }
        : null,
      commission_due_bdt: commissionDue,
      total_outstanding_bdt: commissionDue,
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/dues] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
