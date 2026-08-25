// Admin CRUD for the event calendar — dispatch/heat-engine input only.
// See src/db/schema.ts (eventCalendar) for the "never fare" lock and why.
// Schema: eventCalendar (src/db/schema.ts, "Event Calendar" block).
// Pattern mirrors app/api/admin/promos+api.ts.
import { db } from "@/src/db";
import { eventCalendar } from "@/src/db/schema";
import { eq, sql, desc, and, or, ilike, gt } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import * as errors from "@/lib/errors";

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  venue: z.string().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  event_start: z.string().datetime(),
  event_end: z.string().datetime(),
});

const patchSchema = createSchema.partial().extend({
  is_active: z.boolean().optional(),
});

export async function POST(req: Request) {
  await requireRole("admin")(req);

  const result = await parseJsonBody(req, createSchema);
  if (!result.ok) return result.response;
  const data = result.data;

  if (new Date(data.event_end) <= new Date(data.event_start)) {
    return Response.json(
      { error: "invalid_window", message: "event_end must be after event_start" },
      { status: 400 },
    );
  }

  try {
    const [event] = await db
      .insert(eventCalendar)
      .values({
        title: data.title,
        description: data.description ?? null,
        venue: data.venue ?? null,
        latitude: data.latitude?.toString() ?? null,
        longitude: data.longitude?.toString() ?? null,
        event_start: new Date(data.event_start),
        event_end: new Date(data.event_end),
      })
      .returning();

    logger.info("[admin/events] created", { eventId: event.id, title: event.title });
    return Response.json({ event_id: event.id }, { status: 201 });
  } catch (err: unknown) {
    logger.error("[admin/events] create error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const eventId = url.searchParams.get("id");
  if (!eventId) return Response.json({ error: "missing_id", message: "ID parameter missing" }, { status: 400 });

  const result = await parseJsonBody(req, patchSchema);
  if (!result.ok) return result.response;
  const data = result.data;

  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.venue !== undefined) updates.venue = data.venue;
  if (data.latitude !== undefined) updates.latitude = data.latitude?.toString() ?? null;
  if (data.longitude !== undefined) updates.longitude = data.longitude?.toString() ?? null;
  if (data.event_start !== undefined) updates.event_start = new Date(data.event_start);
  if (data.event_end !== undefined) updates.event_end = new Date(data.event_end);
  if (data.is_active !== undefined) updates.is_active = data.is_active;

  if (Object.keys(updates).length <= 1) {
    return Response.json({ error: "no_fields_to_update", message: "No fields to update" }, { status: 400 });
  }

  try {
    const [event] = await db
      .update(eventCalendar)
      .set(updates)
      .where(eq(eventCalendar.id, eventId))
      .returning();

    if (!event)
      return Response.json({ error: "event_not_found", message: "Event not found" }, { status: 404 });

    logger.info("[admin/events] updated", { eventId: event.id });
    return Response.json({ event });
  } catch (err: unknown) {
    logger.error("[admin/events] update error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  await requireRole("admin")(req);

  const url = new URL(req.url);
  const eventId = url.searchParams.get("id");
  if (!eventId) return Response.json({ error: "missing_id", message: "ID parameter missing" }, { status: 400 });

  const [event] = await db
    .update(eventCalendar)
    .set({ is_active: false, updated_at: new Date() })
    .where(eq(eventCalendar.id, eventId))
    .returning();

  if (!event)
    return Response.json({ error: "event_not_found", message: "Event not found" }, { status: 404 });

  logger.info("[admin/events] deactivated", { eventId: event.id });
  return Response.json({ deleted: true });
}

// GET /api/admin/events — list events, optionally filtered to upcoming/active.
export async function GET(req: Request) {
  try {
    await requireRole("admin")(req);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "all"; // all | upcoming | active | inactive
    const search = url.searchParams.get("search");
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 200);
    const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

    const conditions = [];
    const now = new Date();
    if (status === "upcoming") conditions.push(gt(eventCalendar.event_start, now));
    else if (status === "active") conditions.push(eq(eventCalendar.is_active, true));
    else if (status === "inactive") conditions.push(eq(eventCalendar.is_active, false));
    if (search) conditions.push(or(ilike(eventCalendar.title, `%${search}%`), ilike(eventCalendar.venue, `%${search}%`))!);

    const where = conditions.length ? and(...conditions) : undefined;

    const [events, totalResult] = await Promise.all([
      db.select().from(eventCalendar).where(where).orderBy(desc(eventCalendar.event_start)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(eventCalendar).where(where),
    ]);

    return Response.json({
      events,
      total: totalResult[0]?.count ?? events.length,
      has_more: offset + events.length < (totalResult[0]?.count ?? events.length),
    });
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401)
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    if (errors.getErrorStatus(err) === 403)
      return Response.json({ error: "forbidden", message: "Access denied" }, { status: 403 });
    logger.error("[admin/events] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
