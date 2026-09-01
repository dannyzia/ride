/**
 * GET /api/rental/access-check
 * Lightweight gate for the §F.0(b) bidder entry card.
 * Returns 200 { fleets: [...] } when user has at least one qualifying fleet.
 * Returns 403 otherwise — the card hides itself.
 *
 * Used only for visibility gating; no data mutation, no store import.
 */
import { db } from "@/src/db";
import { fleetMembers, fleets, fleetSubscriptions, fleetSubscriptionPlans } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();

    if (!dbUser) {
      return Response.json(
        { error: "forbidden", message: "User not found" },
        { status: 403 },
      );
    }

    // Get all active fleet memberships
    const members = await db
      .select({
        fleet_id: fleetMembers.fleet_id,
        role: fleetMembers.role,
      })
      .from(fleetMembers)
      .where(
        and(
          eq(fleetMembers.user_id, dbUser.id),
          eq(fleetMembers.status, "active"),
          isNull(fleetMembers.removed_at),
        ),
      );

    if (members.length === 0) {
      return Response.json(
        { error: "fleet_member_required", message: "No fleet membership" },
        { status: 403 },
      );
    }

    // Filter to fleets with active marketplace-enabled subscriptions
    const fleetIds = [...new Set(members.map((m) => m.fleet_id))];
    const qualifying: Array<{ fleet_id: string; fleet_name: string; role: string }> = [];

    for (const fleetId of fleetIds) {
      const { data: sub } = await supabaseAdmin
        .from("fleet_subscriptions")
        .select("id, current_period_end, fleet: fleets!inner(id, name, status), plan: fleet_subscription_plans!inner(id, active, features)")
        .eq("fleet_id", fleetId)
        .eq("status", "ACTIVE")
        .eq("plan.active", true)
        .maybeSingle();

      if (!sub) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fleet = sub.fleet as unknown as { id: string; name: string; status: string } | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = sub.plan as unknown as { id: string; active: boolean; features: Record<string, unknown> | null } | null;

      if (
        fleet?.status === "ACTIVE" &&
        plan?.features?.marketplace_bidding === true &&
        (!sub.current_period_end || new Date(sub.current_period_end as string) >= new Date())
      ) {
        const membership = members.find((m) => m.fleet_id === fleetId);
        qualifying.push({
          fleet_id: fleetId,
          fleet_name: fleet?.name ?? "Fleet",
          role: membership?.role ?? "VIEWER",
        });
      }
    }

    if (qualifying.length === 0) {
      return Response.json(
        { error: "marketplace_subscription_required", message: "No qualifying fleet" },
        { status: 403 },
      );
    }

    return Response.json({ fleets: qualifying });
  } catch (err: unknown) {
    if (err instanceof Error && "status" in err && (err as { status: number }).status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    logger.error("[rental/access-check] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
