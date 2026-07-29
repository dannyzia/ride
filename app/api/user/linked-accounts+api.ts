import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ linked_accounts: users.linked_accounts })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const stored = (dbUser.linked_accounts as { provider: string; label: string; connected: boolean; connected_at: string | null }[] | null) ?? [];
    return Response.json({ linked_accounts: stored }, { status: 200 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/linked-accounts] GET error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    // Social auth not integrated yet — return "coming_soon" for all connect attempts.
    return Response.json({
      error: "coming_soon",
      message: "Social account linking is not available yet.",
    }, { status: 501 });
  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[user/linked-accounts] PATCH error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
