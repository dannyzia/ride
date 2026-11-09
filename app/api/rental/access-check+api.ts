/**
 * GET /api/rental/access-check
 * Lightweight gate for the §F.0(b) bidder entry card.
 * Returns 200 { fleets: [...] } when user has at least one qualifying fleet.
 * Returns 403 otherwise — the card hides itself.
 *
 * Used only for visibility gating; no data mutation, no store import.
 */
import { db } from "@/src/db";
import { fleetMembers } from "@/src/db/schema";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { fleetMarketplaceEntitlements } from "@/lib/marketplaceRbac";
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

    // Filter to fleets that HOLD a marketplace-enabled package. Batch-2 Item 10:
    // the entitlement is fleet possession (operator_packages, role='fleet'), not
    // a fleet_subscriptions row — same predicate the bid-accept gate re-checks,
    // so the card the bidder sees and the gate that admits the bid cannot disagree.
    const fleetIds = [...new Set(members.map((m) => m.fleet_id))];
    const entitlements = await fleetMarketplaceEntitlements(fleetIds);
    const qualifying: { fleet_id: string; fleet_name: string; role: string }[] = [];

    for (const fleetId of fleetIds) {
      const entitlement = entitlements.get(fleetId);
      if (!entitlement) continue;
      const membership = members.find((m) => m.fleet_id === fleetId);
      qualifying.push({
        fleet_id: fleetId,
        fleet_name: entitlement.fleet_name ?? "Fleet",
        role: membership?.role ?? "VIEWER",
      });
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
