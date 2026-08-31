/**
 * GET  /api/fleet/staff?fleet_id=...  — List fleet staff members
 * POST /api/fleet/staff?fleet_id=...  — Invite a user to the fleet (OWNER only)
 *
 * Staff = fleet_members rows. Fully additive to users.role.
 * List gated to any ACTIVE member; invite gated to OWNER.
 */
import { db } from "@/src/db";
import { fleetMembers, users } from "@/src/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

const inviteSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["OWNER", "MANAGER", "DISPATCHER", "ACCOUNTANT", "VIEWER"]),
});

/** GET — list staff (any active member). */
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
      .select({
        id: fleetMembers.id,
        user_id: fleetMembers.user_id,
        role: fleetMembers.role,
        status: fleetMembers.status,
        joined_at: fleetMembers.joined_at,
        removed_at: fleetMembers.removed_at,
        name: users.name,
        phone: users.phone,
      })
      .from(fleetMembers)
      .innerJoin(users, eq(fleetMembers.user_id, users.id))
      .where(eq(fleetMembers.fleet_id, fleetId))
      .orderBy(asc(fleetMembers.joined_at));

    return Response.json({ staff: rows }, { status: 200 });
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
    logger.error("[fleet/staff] GET error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}

/** POST — invite user to fleet (OWNER only). */
export async function POST(request: Request) {
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

    await requireFleetMember(fleetId, ["OWNER"])(request);

    const body = await parseJsonBody(request, inviteSchema);
    if (!body.ok) return body.response;

    // Check the target user exists.
    const [targetUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, body.data.user_id))
      .limit(1);

    if (!targetUser) {
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );
    }

    // Check not already an active member.
    const [existing] = await db
      .select({ id: fleetMembers.id })
      .from(fleetMembers)
      .where(
        and(
          eq(fleetMembers.fleet_id, fleetId),
          eq(fleetMembers.user_id, body.data.user_id),
        ),
      )
      .limit(1);

    if (existing) {
      return Response.json(
        {
          error: "already_member",
          message: "User is already a member of this fleet",
        },
        { status: 409 },
      );
    }

    // Insert new fleet member.
    const [member] = await db
      .insert(fleetMembers)
      .values({
        fleet_id: fleetId,
        user_id: body.data.user_id,
        role: body.data.role as
          | "OWNER"
          | "MANAGER"
          | "DISPATCHER"
          | "ACCOUNTANT"
          | "VIEWER",
        status: "active",
      })
      .returning({ id: fleetMembers.id });

    logger.info("[fleet/staff] member added", {
      fleet_id: fleetId,
      user_id: body.data.user_id,
      role: body.data.role,
      member_id: member.id,
    });

    return Response.json(
      { member_id: member.id, success: true },
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
        { error: "forbidden", message: "Not authorized for this fleet" },
        { status: 403 },
      );
    }
    logger.error("[fleet/staff] POST error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
