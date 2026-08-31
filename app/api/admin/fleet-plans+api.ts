/**
 * Admin Fleet Plan Management.
 *
 * GET    /api/admin/fleet-plans           — List all plans (incl. inactive)
 * POST   /api/admin/fleet-plans           — Create a new plan
 * PATCH  /api/admin/fleet-plans?id=...    — Update plan (name, price, limits, active)
 *
 * Auth: requireAdminPermission — 'admin.read' for GET, 'catalog.write' for POST/PATCH.
 * Money fields: integer paisa (BDT) throughout.
 */
import { db } from "@/src/db";
import { fleetSubscriptionPlans } from "@/src/db/schema";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).nullable().optional(),
  billing_period: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]),
  price_bdt: z.number().int().min(0), // integer paisa
  vehicle_limit: z.number().int().min(1).nullable().optional(),
  driver_limit: z.number().int().min(1).nullable().optional(),
  api_limit: z.number().int().min(1).nullable().optional(),
  features: z.record(z.unknown()).nullable().optional(),
  active: z.boolean().default(true),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  billing_period: z.enum(["WEEKLY", "MONTHLY", "YEARLY"]).optional(),
  price_bdt: z.number().int().min(0).optional(),
  vehicle_limit: z.number().int().min(1).nullable().optional(),
  driver_limit: z.number().int().min(1).nullable().optional(),
  api_limit: z.number().int().min(1).nullable().optional(),
  features: z.record(z.unknown()).nullable().optional(),
  active: z.boolean().optional(),
});

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

/** POST — create a new fleet plan. */
export async function POST(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission("catalog.write")(request);

    const parsed = await parseJsonBody(request, createSchema);
    if (!parsed.ok) return parsed.response;

    const data = parsed.data;
    const [plan] = await db
      .insert(fleetSubscriptionPlans)
      .values({
        name: data.name,
        description: data.description ?? null,
        billing_period: data.billing_period,
        price_bdt: data.price_bdt,
        vehicle_limit: data.vehicle_limit ?? null,
        driver_limit: data.driver_limit ?? null,
        api_limit: data.api_limit ?? null,
        features: data.features ?? null,
        active: data.active,
      })
      .returning({ id: fleetSubscriptionPlans.id });

    logger.info("[admin/fleet-plans] created", {
      plan_id: plan.id,
      by: dbUser.id,
    });

    return Response.json({ plan }, { status: 201 });
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
        { error: "forbidden", message: "Admin write access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleet-plans] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** PATCH — update a fleet plan (name, price, limits, active toggle). */
export async function PATCH(request: Request) {
  try {
    const { dbUser } = await requireAdminPermission("catalog.write")(request);

    const parsed = await parseJsonBody(request, updateSchema);
    if (!parsed.ok) return parsed.response;

    const { id, ...updates } = parsed.data;

    // Build update set from non-undefined fields.
    const setFields: Record<string, unknown> = { updated_at: new Date() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setFields[key] = value;
      }
    }

    const [updated] = await db
      .update(fleetSubscriptionPlans)
      .set(setFields)
      .where(eq(fleetSubscriptionPlans.id, id))
      .returning({ id: fleetSubscriptionPlans.id });

    if (!updated) {
      return Response.json(
        { error: "plan_not_found", message: "Plan not found" },
        { status: 404 },
      );
    }

    logger.info("[admin/fleet-plans] updated", {
      plan_id: id,
      by: dbUser.id,
      fields: Object.keys(setFields).filter((k) => k !== "updated_at"),
    });

    return Response.json({ plan: updated }, { status: 200 });
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
        { error: "forbidden", message: "Admin write access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleet-plans] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
