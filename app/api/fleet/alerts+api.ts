/**
 * GET  /api/fleet/alerts?fleet_id=...       — List fleet alerts (newest first)
 * PATCH /api/fleet/alerts?fleet_id=...      — Mark an alert as read
 *
 * Gated to any ACTIVE fleet member via requireFleetMember.
 */
import { db } from "@/src/db";
import { fleetAlerts } from "@/src/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const markReadSchema = z.object({
  alert_id: z.string().uuid(),
});

/** GET — list alerts (newest first, last 50). */
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

    const rows = await db
      .select()
      .from(fleetAlerts)
      .where(eq(fleetAlerts.fleet_id, fleetId))
      .orderBy(desc(fleetAlerts.created_at))
      .limit(50);

    return Response.json({ alerts: rows }, { status: 200 });
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
    logger.error("[fleet/alerts] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** PATCH — mark a single alert as read. */
export async function PATCH(request: Request) {
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

    const body = await parseJsonBody(request, markReadSchema);
    if (!body.ok) return body.response;

    // Mark read — only if the alert belongs to this fleet (defense in depth).
    await db
      .update(fleetAlerts)
      .set({ is_read: true })
      .where(
        and(
          eq(fleetAlerts.id, body.data.alert_id),
          eq(fleetAlerts.fleet_id, fleetId),
        ),
      );

    return Response.json({ success: true }, { status: 200 });
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
    logger.error("[fleet/alerts] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
