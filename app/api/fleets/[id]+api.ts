/**
 * Fleet-scoped read/write endpoints (Phase 2 — authorization anchor).
 *
 * Both handlers bind the caller to EXACTLY the `id` from the URL via
 * requireFleetMember(id, roles?). A user may only ever access the fleet they
 * are an active member of; any request whose URL names a DIFFERENT fleet is
 * rejected with 403 before any fleet row is read or written.
 *
 * Expo route convention: dynamic param `id` arrives DIRECTLY as the second
 * argument, NOT wrapped in `{ params }` (see AGENTS.md — BUG-1/BUG-2).
 */
import { db } from "@/src/db";
import { fleets } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const idSchema = z.string().uuid();

const patchSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(150).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  business_name: z.string().max(150).nullable().optional(),
});

/** GET /api/fleets/[id] — any ACTIVE member may read the fleet profile. */
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

    // Binds the caller to `fleetId`; cross-fleet URL tampering → 403 here.
    const { fleetMember } = await requireFleetMember(fleetId)(request);

    const [fleet] = await db
      .select({
        id: fleets.id,
        name: fleets.name,
        fleet_type: fleets.fleet_type,
        status: fleets.status,
        owner_user_id: fleets.owner_user_id,
        business_name: fleets.business_name,
        phone: fleets.phone,
        email: fleets.email,
        address: fleets.address,
        created_at: fleets.created_at,
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

    return Response.json({ fleet, my_role: fleetMember.role }, { status: 200 });
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
    logger.error("[fleets/[id]] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/fleets/[id] — write endpoint gated to OWNER / MANAGER.
 * Cross-fleet write (a member of fleet A writing fleet B) → 403.
 */
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

    // Owner/manager can write; any other active member → 403.
    await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    const parsed = await parseJsonBody(request, patchSchema);
    if (!parsed.ok) return parsed.response;
    const patch = parsed.data;

    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.phone !== undefined) set.phone = patch.phone;
    if (patch.email !== undefined) set.email = patch.email;
    if (patch.address !== undefined) set.address = patch.address;
    if (patch.business_name !== undefined) set.business_name = patch.business_name;
    set.updated_at = new Date();

    if (Object.keys(set).length === 1) {
      // No mutable field supplied → nothing to update.
      return Response.json(
        { error: "empty_update", message: "No fields to update" },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(fleets)
      .set(set)
      .where(eq(fleets.id, fleetId))
      .returning({ id: fleets.id, name: fleets.name, updated_at: fleets.updated_at });

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
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleets/[id]] PATCH error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}