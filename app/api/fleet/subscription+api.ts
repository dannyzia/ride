/**
 * GET /api/fleet/subscription?fleet_id=...
 *
 * Returns the fleet's current subscription status and plan details.
 * Includes billing period, limits, and renewal date.
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import {
  fleetSubscriptionPlans,
  fleetSubscriptions,
  fleets,
} from "@/src/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      fleet_id: url.searchParams.get("fleet_id"),
    });
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsed.data.fleet_id;

    await requireFleetMember(fleetId)(request);

    // Get the fleet's subscription status.
    const [fleet] = await db
      .select({
        subscription_plan_id: fleets.subscription_plan_id,
        subscription_status: fleets.subscription_status,
      })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!fleet) {
      return Response.json(
        { error: "fleet_not_found", message: "Fleet not found" },
        { status: 404 },
      );
    }

    // If no subscription, return early.
    if (!fleet.subscription_plan_id) {
      return Response.json(
        {
          has_subscription: false,
          status: fleet.subscription_status ?? "NONE",
          plan: null,
        },
        { status: 200 },
      );
    }

    // Get the most recent subscription record for this fleet.
    const [subscription] = await db
      .select()
      .from(fleetSubscriptions)
      .where(eq(fleetSubscriptions.fleet_id, fleetId))
      .orderBy(desc(fleetSubscriptions.created_at))
      .limit(1);

    // Get the plan details.
    const [plan] = await db
      .select()
      .from(fleetSubscriptionPlans)
      .where(eq(fleetSubscriptionPlans.id, fleet.subscription_plan_id))
      .limit(1);

    return Response.json(
      {
        has_subscription: true,
        status: fleet.subscription_status ?? "NONE",
        subscription: subscription
          ? {
              id: subscription.id,
              status: subscription.status,
              started_at: subscription.started_at,
              current_period_start: subscription.current_period_start,
              current_period_end: subscription.current_period_end,
              cancelled_at: subscription.cancelled_at,
            }
          : null,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              description: plan.description,
              billing_period: plan.billing_period,
              price_bdt: plan.price_bdt,
              vehicle_limit: plan.vehicle_limit,
              driver_limit: plan.driver_limit,
              api_limit: plan.api_limit,
              features: plan.features,
            }
          : null,
      },
      { status: 200 },
    );
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
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleet/subscription] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
