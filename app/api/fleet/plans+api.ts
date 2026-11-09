/**
 * GET  /api/fleet/plans              — List active subscription plans (fleet-gated)
 * POST /api/fleet/plans?fleet_id=... — RETIRED (410) — Batch-2 Item 10
 *
 * GET requires auth + fleet capability (an ACTIVE fleet_members row OR fleet
 * ownership) — the full catalog is never sent to a non-matching client
 * (S5/§14 VISIBILITY; corrected 2026-10-17 — this header previously said
 * "public-ish / no fleet context", which has not been true since the
 * server-side caller gate shipped).
 *
 * POST is GONE. It was the fleet rail's only writer: it inserted
 * fleet_subscriptions, moved fleets.subscription_plan_id/status, and appended a
 * fleet_billing_transactions fee row. Batch-2 Item 10 folded fleet possession
 * onto operator_packages and retired this writer, so the fleet's purchase
 * surface is now POST /api/fleet/packages/purchase (Item 6 rail: grant + bill +
 * settle-first). The 410 body names the replacement.
 *
 * INTERIM GAP (accepted within the batch): the fleet panel's Subscription
 * screen still calls this POST until Item 13 rewires the screen to the package
 * rail. GET keeps serving the legacy catalog so the screen still renders; the
 * buy button fails with a named error rather than an unexplained 404.
 *
 * Money fields are integer paisa (BDT) — never floats.
 */
import { db } from "@/src/db";
import { fleetMembers, fleetSubscriptionPlans, fleets, users } from "@/src/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/**
 * GET — the active fleet-plan catalog. S5/§14 VISIBILITY: the full catalog is
 * never sent to a caller with no fleet capability (§14: "the full catalog is
 * never sent to a non-matching client"). A caller qualifies with an ACTIVE
 * fleet_members row OR by owning any fleet (solo NATIVE owners included —
 * the portal is their surface too). Unauthenticated callers get 401;
 * authenticated callers with no fleet capability get 403
 * fleet_membership_required.
 */
export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }

    const [memberRow, ownedRow] = await Promise.all([
      db
        .select({ id: fleetMembers.id })
        .from(fleetMembers)
        .where(
          sql`${fleetMembers.user_id} = ${dbUser.id} AND ${fleetMembers.status} = 'active' AND ${fleetMembers.removed_at} IS NULL`,
        )
        .limit(1),
      db
        .select({ id: fleets.id })
        .from(fleets)
        .where(eq(fleets.owner_user_id, dbUser.id))
        .limit(1),
    ]);
    if (memberRow.length === 0 && ownedRow.length === 0) {
      return Response.json(
        { error: "fleet_membership_required", message: "Fleet plans are visible to fleet owners and members only" },
        { status: 403 },
      );
    }

    const plans = await db
      .select()
      .from(fleetSubscriptionPlans)
      .where(eq(fleetSubscriptionPlans.active, true))
      .orderBy(asc(fleetSubscriptionPlans.price_bdt));

    return Response.json({ plans }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[fleet/plans] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/**
 * POST — RETIRED (Batch-2 Item 10). See the file header.
 *
 * 410 rather than 404: the route is known and deliberately withdrawn, and the
 * body points at the rail that replaced it, so an older client fails loudly
 * instead of looking like a typo'd URL.
 */
export async function POST(_request: Request) {
  return Response.json(
    {
      error: "fleet_plans_purchase_retired",
      message:
        "Fleet subscriptions are purchased as packages. Use POST /api/fleet/packages/purchase.",
      replacement: "/api/fleet/packages/purchase",
    },
    { status: 410 },
  );
}

/** REMOVED (Batch-2 Item 10): the legacy subscribe writer. Kept as a comment
 * description only — no code path may recreate it without also re-opening the
 * fold-in decision.
 *
 *   Creates a fleet_subscriptions row and updates fleets.subscription_plan_id
 *   + fleets.subscription_status in the same transaction; appends a
 *   fleet_billing_transactions SUBSCRIPTION row.
 */
