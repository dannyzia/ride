// GET /api/delivery/mine — the delivery staff hub's identity + role card.
// Mirrors the shop/fleet "mine" pattern: a single authenticated lookup that
// returns the operator identity the dashboard can render. Delivery staff are
// an operator role, so this reuses hasActiveOperatorRole/resolveOperatorIdentity
// the same way /api/delivery/packages and /api/delivery/dues do.
import { db } from "@/src/db";
import { users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { hasActiveOperatorRole, resolveOperatorIdentity } from "@/lib/operatorPurchase";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    if (!(await hasActiveOperatorRole("delivery", user.id))) {
      return Response.json(
        { error: "role_not_eligible", message: "An active delivery role is required" },
        { status: 403 },
      );
    }

    const deliveryId = await resolveOperatorIdentity("delivery", user.id);
    const role = (await hasActiveOperatorRole("delivery", user.id)) ? "delivery" : null;

    return Response.json({
      delivery: deliveryId
        ? {
            id: deliveryId,
            name: user.name,
            status: "active",
            is_verified: true,
            logo_url: null,
          }
        : null,
      role,
    });
  } catch (e: unknown) {
    if (e && (e as any).status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[delivery/mine] error", e);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
