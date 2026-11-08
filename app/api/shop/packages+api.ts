// GET /api/shop/packages — the shop operator's purchasable packages.
// Batch-2 Item 6 list visibility: containment on `applicable_roles`
// (`{shop}` plans AND plans shared with other roles; never driver-only plans).
// Active role required (§14): a pending/suspended shop cannot buy credit.
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { hasActiveOperatorRole, listOperatorPackages } from "@/lib/operatorPurchase";
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
    if (!user) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    if (!(await hasActiveOperatorRole("shop", user.id))) {
      return Response.json(
        { error: "role_not_eligible", message: "An active shop role is required" },
        { status: 403 },
      );
    }

    return Response.json({ packages: await listOperatorPackages("shop") });
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[shop/packages] list error", e);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
