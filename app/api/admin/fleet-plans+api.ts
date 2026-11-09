/**
 * Admin Fleet Plan Management — READ ONLY since Batch-2 Item 10.
 *
 * GET    /api/admin/fleet-plans           — List all plans (incl. inactive)
 * POST   /api/admin/fleet-plans           — RETIRED (410) — plan writes moved to packages
 * PATCH  /api/admin/fleet-plans?id=...    — RETIRED (410)
 *
 * WHY RETIRED: Item 10 folded the fleet catalogue onto `packages`. Creating or
 * editing a fleet_subscription_plans row post-fold would mint a plan that no
 * purchase rail can sell (the legacy subscribe route is 410) and that no
 * possession can ever point at — a dead-end writer. The fleet catalogue is now
 * maintained on the admin Packages screen (applicable_roles must include
 * 'fleet'), and a fleet package's capacity profile is the retained plan row
 * whose id the fold preserved.
 *
 * GET stays: it is the history/read surface for the pre-fold catalogue that the
 * migration read from, and the screens that still show it read only.
 *
 * Auth: requireAdminPermission — 'admin.read' for GET.
 * Money fields: integer paisa (BDT) throughout.
 */
import { db } from "@/src/db";
import { fleetSubscriptionPlans } from "@/src/db/schema";
import { asc } from "drizzle-orm";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/** GET — list all plans (including inactive for admin). */
export async function GET(request: Request) {
  try {
    await requireAdminPermission("admin.read")(request);

    const plans = await db
      .select()
      .from(fleetSubscriptionPlans)
      .orderBy(asc(fleetSubscriptionPlans.price_bdt));

    return Response.json({ plans }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json(
        { error: "unauthorized", message: "Authentication required" },
        { status: 401 },
      );
    }
    if (status === 403) {
      return Response.json(
        { error: "forbidden", message: "Admin access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleet-plans] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** POST — RETIRED (Batch-2 Item 10): the fleet catalogue is `packages`. */
export async function POST(_request: Request) {
  return Response.json(
    {
      error: "fleet_plans_write_retired",
      message: "Fleet plans are packages. Manage fleet-scoped packages on the Packages screen (POST /api/admin/packages).",
      replacement: "/api/admin/packages",
    },
    { status: 410 },
  );
}

/** PATCH — RETIRED (Batch-2 Item 10): same reason as POST — a fleet_subscription_plans
 * edit no longer reaches any purchasable product. Capacity edits belong on the
 * retained plan row until a fleet-capacity admin surface exists (follow-up), and
 * catalogue edits belong on packages. */
export async function PATCH(_request: Request) {
  return Response.json(
    {
      error: "fleet_plans_write_retired",
      message: "Fleet plans are packages. Manage fleet-scoped packages on the Packages screen (PATCH /api/admin/packages).",
      replacement: "/api/admin/packages",
    },
    { status: 410 },
  );
}
