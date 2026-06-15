import { db } from "@/src/db";
import {
  incentiveDefinitions,
  drivers,
  driverIncentives,
} from "@/src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { VEHICLE_TYPE_ZOD_ENUM } from "@/lib/vehicleTypes";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  target_metric: z.enum([
    "completed_rides",
    "online_hours",
    "acceptance_rate",
    "consecutive_accepts",
  ]),
  target_value: z.number().positive(),
  reward_calls: z.number().int().positive(),
  vehicle_type_filter: VEHICLE_TYPE_ZOD_ENUM.optional().nullable(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
});

const patchSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    await requireRole("admin")(req);

    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("include_inactive") === "true";

    const rows = await db
      .select()
      .from(incentiveDefinitions)
      .where(
        includeInactive
          ? undefined
          : eq(incentiveDefinitions.deleted_at, null as any),
      )
      .orderBy(incentiveDefinitions.created_at);

    return Response.json({ incentives: rows });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403)
      return Response.json({ error: "forbidden" }, { status: 403 });
    logger.error("[admin/incentives] list error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { dbUser } = await requireRole("admin")(req);

  const result = await parseJsonBody(req, createSchema);
  if (!result.ok) return result.response;

  const data = result.data;

  const [incentive] = await db
    .insert(incentiveDefinitions)
    .values({
      name: data.name,
      description: data.description ?? null,
      target_metric: data.target_metric,
      target_value: data.target_value.toString(),
      reward_calls: data.reward_calls,
      vehicle_type_filter: data.vehicle_type_filter ?? null,
      starts_at: new Date(data.starts_at),
      ends_at: new Date(data.ends_at),
      created_by: dbUser.id,
    })
    .returning();

  // Auto-create driver_incentives rows for all eligible active drivers
  const driverFilter = and(
    eq(drivers.status, "active"),
    sql`${drivers.is_online} = true`,
  );
  // If vehicle_type_filter is set, add it
  const eligibleDrivers = data.vehicle_type_filter
    ? await db
        .select({ id: drivers.id })
        .from(drivers)
        .where(
          and(
            driverFilter,
            eq(drivers.vehicle_type, data.vehicle_type_filter as any),
          ),
        )
    : await db.select({ id: drivers.id }).from(drivers).where(driverFilter);

  for (const d of eligibleDrivers) {
    await db
      .insert(driverIncentives)
      .values({
        driver_id: d.id,
        incentive_id: incentive.id,
        current_progress: "0",
      })
      .onConflictDoNothing();
  }

  logger.info("[admin/incentives] created", {
    incentiveId: incentive.id,
    name: incentive.name,
    eligibleDrivers: eligibleDrivers.length,
    adminId: dbUser.id,
  });

  return Response.json(
    { incentive_id: incentive.id, name: incentive.name },
    { status: 201 },
  );
}

export async function PATCH(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const incentiveId = url.searchParams.get("id");
  if (!incentiveId)
    return Response.json({ error: "missing_id" }, { status: 400 });

  const result = await parseJsonBody(req, patchSchema);
  if (!result.ok) return result.response;

  const data = result.data;
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (data.name !== undefined) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data.target_metric !== undefined)
    updates.target_metric = data.target_metric;
  if (data.target_value !== undefined)
    updates.target_value = data.target_value.toString();
  if (data.reward_calls !== undefined) updates.reward_calls = data.reward_calls;
  if (data.vehicle_type_filter !== undefined)
    updates.vehicle_type_filter = data.vehicle_type_filter;
  if (data.starts_at !== undefined)
    updates.starts_at = new Date(data.starts_at);
  if (data.ends_at !== undefined) updates.ends_at = new Date(data.ends_at);
  if (data.is_active !== undefined) updates.is_active = data.is_active;

  if (Object.keys(updates).length <= 1) {
    return Response.json({ error: "no_fields_to_update" }, { status: 400 });
  }

  const [incentive] = await db
    .update(incentiveDefinitions)
    .set(updates)
    .where(eq(incentiveDefinitions.id, incentiveId))
    .returning();

  if (!incentive)
    return Response.json({ error: "incentive_not_found" }, { status: 404 });

  logger.info("[admin/incentives] updated", { incentiveId: incentive.id });
  return Response.json({ incentive });
}

export async function DELETE(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const incentiveId = url.searchParams.get("id");
  if (!incentiveId)
    return Response.json({ error: "missing_id" }, { status: 400 });

  const [incentive] = await db
    .update(incentiveDefinitions)
    .set({ deleted_at: new Date(), is_active: false, updated_at: new Date() })
    .where(eq(incentiveDefinitions.id, incentiveId))
    .returning();

  if (!incentive)
    return Response.json({ error: "incentive_not_found" }, { status: 404 });

  logger.info("[admin/incentives] deleted", { incentiveId: incentive.id });
  return Response.json({ deleted: true });
}
