/**
 * GET  /api/admin/fleets/[id]  — Fleet detail with vehicle/driver/member counts
 * PATCH /api/admin/fleets/[id] — Change fleet status (approve/suspend/block/close)
 *
 * Auth: GET requires 'admin.read', PATCH requires 'catalog.write'.
 *
 * Expo route convention: dynamic param `id` arrives DIRECTLY as the second
 * argument, NOT wrapped in `{ params }`.
 */
import { db } from "@/src/db";
import {
  fleets,
  drivers,
  fleetMembers,
  vehicles,
  users,
} from "@/src/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/adminRbac";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const idSchema = z.string().uuid();

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "PENDING", "SUSPENDED", "BLOCKED", "CLOSED"]),
  reason: z.string().max(500).nullable().optional(),
});

/** GET — fleet detail with aggregated stats. */
export async function GET(request: Request, { id }: { id: string }) {
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid fleet id" },
        { status: 400 },
      );
    }
    const fleetId = parsedId.data;

    await requireAdminPermission("admin.read")(request);

    const [fleet] = await db
      .select()
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!fleet) {
      return Response.json(
        { error: "fleet_not_found", message: "Fleet not found" },
        { status: 404 },
      );
    }

    // Get owner name.
    const [owner] = await db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, fleet.owner_user_id))
      .limit(1);

    // Aggregate counts.
    const [vehicleCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.fleet_id, fleetId));

    const [driverCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .where(eq(drivers.fleet_id, fleetId));

    const [onlineDriverCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(drivers)
      .where(and(eq(drivers.fleet_id, fleetId), eq(drivers.is_online, true)));

    const [memberCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(fleetMembers)
      .where(eq(fleetMembers.fleet_id, fleetId));

    return Response.json(
      {
        fleet: {
          ...fleet,
          owner_name: owner?.name ?? null,
          owner_phone: owner?.phone ?? null,
        },
        stats: {
          vehicles: vehicleCount?.count ?? 0,
          drivers: driverCount?.count ?? 0,
          drivers_online: onlineDriverCount?.count ?? 0,
          members: memberCount?.count ?? 0,
        },
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
        { error: "forbidden", message: "Admin access required" },
        { status: 403 },
      );
    }
    logger.error("[admin/fleets/[id]] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** PATCH — change fleet status (approve/suspend/block/close). */
export async function PATCH(request: Request, { id }: { id: string }) {
  try {
    const parsedId = idSchema.safeParse(id);
    if (!parsedId.success) {
      return Response.json(
        { error: "invalid_uuid", message: "Invalid fleet id" },
        { status: 400 },
      );
    }
    const fleetId = parsedId.data;

    const { dbUser } = await requireAdminPermission("catalog.write")(request);

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;

    const { status: newStatus, reason } = parsed.data;

    // Verify fleet exists.
    const [existing] = await db
      .select({ id: fleets.id, status: fleets.status })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);

    if (!existing) {
      return Response.json(
        { error: "fleet_not_found", message: "Fleet not found" },
        { status: 404 },
      );
    }

    if (existing.status === newStatus) {
      return Response.json(
        { error: "no_change", message: `Fleet is already ${newStatus}` },
        { status: 400 },
      );
    }

    // Update fleet status.
    const [updated] = await db
      .update(fleets)
      .set({ status: newStatus, updated_at: new Date() })
      .where(eq(fleets.id, fleetId))
      .returning({ id: fleets.id, status: fleets.status });

    // Log to audit trail if audit_logs table exists.
    try {
      const { auditLogs } = await import("@/src/db/schema");
      await db.insert(auditLogs).values({
        actor_user_id: dbUser.id,
        fleet_id: fleetId,
        action: `fleet_status_${newStatus.toLowerCase()}`,
        entity_type: "fleet",
        entity_id: fleetId,
        old_value: { status: existing.status },
        new_value: { status: newStatus, reason: reason ?? null },
      });
    } catch {
      // audit_logs table may not have RLS allowing admin inserts — non-fatal.
    }

    logger.info("[admin/fleets/[id]] status changed", {
      fleet_id: fleetId,
      from: existing.status,
      to: newStatus,
      by: dbUser.id,
      reason: reason ?? null,
    });

    return Response.json({ fleet: updated }, { status: 200 });
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
    logger.error("[admin/fleets/[id]] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
