/**
 * POST /api/fleet/drivers/invite?fleet_id=... — invite a driver by PHONE with
 * CONSENT (S5, plan 27 §4 F-17/R9). OWNER/MANAGER only.
 * GET  same path — the fleet's pending invites.
 *
 * The invite is a pending `fleet_driver_invites` row keyed by phone (7-day
 * validity). NOTHING is attached here — the invitee accepts from their own
 * session (POST /api/driver/fleet-invites/[id]/accept), which runs the §4.3
 * plan-limit checks + the single-fleet rule: an existing driver in ANOTHER
 * fleet is REJECTED on the consent path (F-17: "Already in another fleet →
 * REJECTED — single-fleet rule"), never silently transferred like the direct
 * attach's B1 branch.
 *
 * Known phone with a user row → keyed push (F-29). Unknown phone → the invite
 * still lands (F-34: the phone registers later and sees it), no dangling
 * user reference (invited_by only).
 */
import { db } from "@/src/db";
import { fleetDriverInvites, fleets, users } from "@/src/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireFleetMember } from "@/lib/auth";
import { driverErrorCode } from "@/lib/idempotency";
import { sendNotifications } from "@/lib/notify";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";
import { parseJsonBody } from "@/lib/parseBody";

/** Invite validity window (F-17). Lifecycle constant, not §12 economics. */
const INVITE_VALIDITY_MS = 7 * 24 * 60 * 60 * 1000;

const querySchema = z.object({ fleet_id: z.string().uuid() });
const inviteSchema = z.object({ phone: z.string().min(6).max(30) });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Valid fleet_id required" }, { status: 400 });
    }
    const fleetId = parsed.data.fleet_id;

    await requireFleetMember(fleetId)(request);

    const invites = await db
      .select({
        id: fleetDriverInvites.id,
        phone: fleetDriverInvites.phone,
        status: fleetDriverInvites.status,
        expires_at: fleetDriverInvites.expires_at,
        created_at: fleetDriverInvites.created_at,
      })
      .from(fleetDriverInvites)
      .where(eq(fleetDriverInvites.fleet_id, fleetId))
      .orderBy(desc(fleetDriverInvites.created_at));

    return Response.json({ invites }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: "forbidden", message: "Not authorized for this fleet" }, { status: 403 });
    }
    logger.error("[fleet/drivers/invite] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({ fleet_id: url.searchParams.get("fleet_id") });
    if (!parsed.success) {
      return Response.json({ error: "invalid_param", message: "Valid fleet_id required" }, { status: 400 });
    }
    const fleetId = parsed.data.fleet_id;

    const auth = await requireFleetMember(fleetId, ["OWNER", "MANAGER"])(request);

    const body = await parseJsonBody(request, inviteSchema);
    if (!body.ok) return body.response;
    const phone = body.data.phone.trim();

    // Fleet must exist AND be ACTIVE (same D4 gate as the direct attach).
    const [fleet] = await db
      .select({ id: fleets.id, status: fleets.status })
      .from(fleets)
      .where(eq(fleets.id, fleetId))
      .limit(1);
    if (!fleet) {
      return Response.json({ error: "fleet_not_found", message: "Fleet not found" }, { status: 404 });
    }
    if (fleet.status !== "ACTIVE") {
      return Response.json({ error: "fleet_not_active", message: "Fleet is not active" }, { status: 403 });
    }

    const invite = await db.transaction(async (tx) => {
      // The partial unique index (fleet_id, phone) WHERE status='pending' is
      // the duplicate barrier; expired rows are swept to keep the slot free.
      await tx
        .update(fleetDriverInvites)
        .set({ status: "expired", updated_at: new Date() })
        .where(
          and(
            eq(fleetDriverInvites.fleet_id, fleetId),
            eq(fleetDriverInvites.phone, phone),
            eq(fleetDriverInvites.status, "pending"),
            sql`${fleetDriverInvites.expires_at} <= now()`,
          ),
        );

      const [row] = await tx
        .insert(fleetDriverInvites)
        .values({
          fleet_id: fleetId,
          phone,
          invited_by: auth.dbUser.id,
          expires_at: new Date(Date.now() + INVITE_VALIDITY_MS),
        })
        .returning();
      return row;
    });

    // F-29 keyed push — only when the phone has a user row (no dangling
    // target). Fire-and-forget like the shop new-order path.
    try {
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);
      if (target) {
        void sendNotifications([
          {
            userId: target.id,
            type: "invite",
            title: "Fleet driver invite",
            body: `A fleet invited you to join as a driver. Open the app to accept or decline.`,
            data: { invite_id: invite.id, fleet_id: fleetId, type: "fleet_driver_invite" },
            priority: "high",
            idempotencyKey: `fleet_driver_invite:${invite.id}:${target.id}`,
          },
        ]);
      }
    } catch (err) {
      logger.warn("[fleet/drivers/invite] push failed", { invite_id: invite.id, err });
    }

    logger.info("[fleet/drivers/invite] created", { fleet_id: fleetId, invite_id: invite.id });
    return Response.json({ invite, message: "Invite created — the driver must accept" }, { status: 201 });
  } catch (err: unknown) {
    // S4 lesson: drizzle wraps driver errors (code lives on `cause`) — bare
    // e.code never matches a real DB. Reuse the fixed cause-chain unwrap.
    if (driverErrorCode(err) === "23505") {
      return Response.json(
        { error: "invite_already_pending", message: "An open invite for this phone already exists" },
        { status: 409 },
      );
    }
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    if (status === 403) {
      return Response.json({ error: "forbidden", message: "Not authorized for this fleet" }, { status: 403 });
    }
    logger.error("[fleet/drivers/invite] POST error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
