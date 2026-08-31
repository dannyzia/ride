/**
 * GET  /api/fleet/plans              — List active subscription plans (public-ish)
 * POST /api/fleet/plans?fleet_id=... — Subscribe fleet to a plan (OWNER only)
 *
 * GET requires no fleet context (plans are platform-wide catalog).
 * POST requires OWNER via requireFleetMember — only the fleet owner can
 * change the fleet's subscription.
 *
 * Money fields are integer paisa (BDT) — never floats.
 */
import { db } from "@/src/db";
import {
  fleetSubscriptionPlans,
  fleetSubscriptions,
  fleets,
} from "@/src/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const subscribeSchema = z.object({
  plan_id: z.string().uuid(),
});

/** GET — list all active plans (anyone can browse the catalog). */
export async function GET() {
  try {
    const plans = await db
      .select()
      .from(fleetSubscriptionPlans)
      .where(eq(fleetSubscriptionPlans.active, true))
      .orderBy(asc(fleetSubscriptionPlans.price_bdt));

    return Response.json({ plans }, { status: 200 });
  } catch (err: unknown) {
    logger.error("[fleet/plans] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/**
 * POST — subscribe fleet to a plan (OWNER only).
 *
 * Creates a fleet_subscriptions row and updates fleets.subscription_plan_id
 * + fleets.subscription_status in the same transaction.
 *
 * Idempotent: if fleet already has an ACTIVE subscription to the same plan,
 * returns the existing subscription (no duplicate).
 * If fleet has an ACTIVE subscription to a DIFFERENT plan, cancels the old
 * one and creates a new one (plan change).
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const parsedFleet = z
      .object({ fleet_id: z.string().uuid() })
      .safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsedFleet.success) {
      return Response.json(
        { error: "invalid_param", message: "Valid fleet_id required" },
        { status: 400 },
      );
    }
    const fleetId = parsedFleet.data.fleet_id;

    // Only OWNER can change subscription.
    await requireFleetMember(fleetId, ["OWNER"])(request);

    const body = await parseJsonBody(request, subscribeSchema);
    if (!body.ok) return body.response;

    const planId = body.data.plan_id;

    // Verify the plan exists and is active.
    const [plan] = await db
      .select()
      .from(fleetSubscriptionPlans)
      .where(
        and(
          eq(fleetSubscriptionPlans.id, planId),
          eq(fleetSubscriptionPlans.active, true),
        ),
      )
      .limit(1);

    if (!plan) {
      return Response.json(
        { error: "plan_not_found", message: "Plan not found or inactive" },
        { status: 404 },
      );
    }

    // Check for existing active subscription.
    const [existing] = await db
      .select()
      .from(fleetSubscriptions)
      .where(
        and(
          eq(fleetSubscriptions.fleet_id, fleetId),
          eq(fleetSubscriptions.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (existing && existing.plan_id === planId) {
      // Already subscribed to this plan — idempotent return.
      return Response.json(
        { subscription_id: existing.id, status: "ACTIVE", plan_id: planId },
        { status: 200 },
      );
    }

    const now = new Date();
    const periodEnd = new Date(now);

    // Compute billing period end.
    switch (plan.billing_period) {
      case "WEEKLY":
        periodEnd.setDate(periodEnd.getDate() + 7);
        break;
      case "MONTHLY":
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        break;
      case "YEARLY":
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        break;
    }

    const result = await db.transaction(async (tx) => {
      // Cancel existing active subscription if upgrading/downgrading.
      if (existing) {
        await tx
          .update(fleetSubscriptions)
          .set({
            status: "CANCELLED",
            cancelled_at: now,
            updated_at: now,
          })
          .where(eq(fleetSubscriptions.id, existing.id));
      }

      // Create new subscription.
      const [sub] = await tx
        .insert(fleetSubscriptions)
        .values({
          fleet_id: fleetId,
          plan_id: planId,
          status: "ACTIVE",
          started_at: now,
          current_period_start: now,
          current_period_end: periodEnd,
        })
        .returning({ id: fleetSubscriptions.id });

      // Update fleet's subscription pointer.
      await tx
        .update(fleets)
        .set({
          subscription_plan_id: planId,
          subscription_status: "ACTIVE",
          updated_at: now,
        })
        .where(eq(fleets.id, fleetId));

      // Create billing transaction record.
      const { fleetBillingTransactions } = await import("@/src/db/schema");
      await tx.insert(fleetBillingTransactions).values({
        fleet_id: fleetId,
        subscription_id: sub.id,
        transaction_type: "SUBSCRIPTION",
        amount_bdt: plan.price_bdt,
        currency: "BDT",
        status: "completed",
      });

      return { id: sub.id };
    });

    logger.info("[fleet/plans] subscription created", {
      fleet_id: fleetId,
      plan_id: planId,
      subscription_id: result.id,
    });

    return Response.json(
      {
        subscription_id: result.id,
        status: "ACTIVE",
        plan_id: planId,
        plan_name: plan.name,
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
      },
      { status: 201 },
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
        { error: "forbidden", message: "Only the fleet owner can manage subscriptions" },
        { status: 403 },
      );
    }
    logger.error("[fleet/plans] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
