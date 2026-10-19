/**
 * GET  /api/fleet/staff?fleet_id=...  — List fleet staff members
 * POST /api/fleet/staff?fleet_id=...  — Invite a user to the fleet (OWNER only)
 *
 * Staff = fleet_members rows. Fully additive to users.role.
 * List gated to any ACTIVE member; invite gated to OWNER.
 */
import { db } from "@/src/db";
import { fleetMembers, fleets, users } from "@/src/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { notifyFleetStaffInvite } from "@/lib/fleetNotify";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

const querySchema = z.object({
  fleet_id: z.string().uuid(),
});

// S5 (plan 27 §4 F-17): invite by PHONE (the dispatcher invite path) or by
// user_id (pre-existing). Exactly one targeting field required.
const inviteSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    phone: z.string().min(6).max(30).optional(),
    role: z.enum(["OWNER", "MANAGER", "DISPATCHER", "ACCOUNTANT", "VIEWER"]),
  })
  .refine((d) => (d.user_id ? 1 : 0) + (d.phone ? 1 : 0) === 1, {
    message: "Provide exactly one of user_id or phone",
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

    // Resolve the target user — by user_id (pre-existing) or phone (S5).
    const inviteUserId = body.data.user_id;
    const invitePhone = body.data.phone;
    const [targetUser] = inviteUserId
      ? await db.select({ id: users.id }).from(users).where(eq(users.id, inviteUserId)).limit(1)
      : await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phone, invitePhone ?? ""))
          .limit(1);

    if (!targetUser) {
      return Response.json(
        { error: "user_not_found", message: "User not found" },
        { status: 404 },
      );
    }
    const targetUserId = targetUser.id;

    // C8-5: the duplicate check filters removed_at — a REMOVED row is not a
    // live membership. Re-inviting a removed user REACTIVATES the same row
    // (the fm_fleet_user_idx unique on (fleet_id, user_id) is NOT partial,
    // so a blind INSERT would 23505); only a live (removed_at IS NULL) row
    // 409s. NOTE (OWNER-minting consistency): unlike the shop R10 rule
    // (OWNER = the shops.owner_user_id creator row, never invited), a fleet
    // OWNER may mint further OWNER rows here — fleet ownership is a
    // membership role, not a creator column (fleets.owner_user_id is the
    // business registrant, a separate fact).
    const [existing] = await db
      .select({ id: fleetMembers.id, removed_at: fleetMembers.removed_at })
      .from(fleetMembers)
      .where(
        and(
          eq(fleetMembers.fleet_id, fleetId),
          eq(fleetMembers.user_id, targetUserId),
        ),
      )
      .limit(1);

    if (existing && !existing.removed_at) {
      return Response.json(
        {
          error: "already_member",
          message: "User is already a member of this fleet",
        },
        { status: 409 },
      );
    }

    const role = body.data.role as
      | "OWNER"
      | "MANAGER"
      | "DISPATCHER"
      | "ACCOUNTANT"
      | "VIEWER";

    let memberId: string;
    let reactivated = false;
    if (existing) {
      // Re-invite: revive the removed row with the new role.
      const [revived] = await db
        .update(fleetMembers)
        .set({ removed_at: null, status: "active", role, updated_at: new Date() })
        .where(eq(fleetMembers.id, existing.id))
        .returning({ id: fleetMembers.id });
      memberId = revived.id;
      reactivated = true;
    } else {
      // Insert new fleet member.
      const [member] = await db
        .insert(fleetMembers)
        .values({
          fleet_id: fleetId,
          user_id: targetUserId,
          role,
          status: "active",
        })
        .returning({ id: fleetMembers.id });
      memberId = member.id;
    }

    logger.info("[fleet/staff] member added", {
      fleet_id: fleetId,
      user_id: targetUserId,
      role: body.data.role,
      member_id: memberId,
      reactivated,
    });

    // C8-5: the invitee learns about the membership via keyed push + WS
    // (the C6-2 shop bell pattern) — the row alone is invisible until their
    // next cold boot. Fire-and-forget AFTER the write resolves; never fails
    // the invite.
    const [fleetRow] = await db
      .select({ name: fleets.name })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);
    void notifyFleetStaffInvite({
      memberId,
      fleetId,
      fleetName: fleetRow?.name ?? "",
      inviteeUserId: targetUserId,
      role,
    });

    return Response.json(
      { member_id: memberId, success: true, reactivated },
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
