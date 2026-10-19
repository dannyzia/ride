/**
 * fleetNotify.ts — F-29 push notifications for the fleet-staff flow (C8-5).
 *
 * Mirrors the shop staff-invite bell pattern (notifyStaffInvite in
 * lib/shopNotify.ts, the C6-2 precedent): the invitee gets a keyed push AND
 * a WS event so a foreground app can route to the fleet surface without
 * waiting for the next cold boot. All sends are fire-and-forget with
 * swallowed errors: a push failure must never fail the invite that
 * triggered it.
 */
import { sendNotification } from "@/lib/notify";
import { notifyWs } from "@/lib/wsNotify";
import { logger } from "@/lib/logger";

/**
 * Fleet staff invite: an OWNER minted (or reactivated) a fleet_members row
 * → the invitee gets a push AND a WS event. The push is deduped on
 * `fleet_staff_invite:{memberId}:{userId}` so a retried invite cannot
 * double-push. Fire-and-forget: never throws.
 */
export async function notifyFleetStaffInvite(args: {
  memberId: string;
  fleetId: string;
  fleetName: string;
  inviteeUserId: string;
  role: "OWNER" | "MANAGER" | "DISPATCHER" | "ACCOUNTANT" | "VIEWER";
}): Promise<void> {
  const { memberId, fleetId, fleetName, inviteeUserId, role } = args;
  const roleLabel =
    role === "OWNER"
      ? "an owner"
      : role === "MANAGER"
        ? "a manager"
        : role === "DISPATCHER"
          ? "a dispatcher"
          : role === "ACCOUNTANT"
            ? "an accountant"
            : "a viewer";
  try {
    await sendNotification(
      inviteeUserId,
      "fleet:staff_invite",
      "You've been added to a fleet team",
      `${fleetName || "A fleet"} added you as ${roleLabel}. Open the fleet surface to see your workspace.`,
      { fleet_id: fleetId, member_id: memberId, role },
      {
        priority: "high",
        idempotencyKey: `fleet_staff_invite:${memberId}:${inviteeUserId}`,
        // D2-3: locale-resolved twin of the literal above.
        copyKey: "fleet_staff_invite",
        copyVars: { fleet_name: fleetName || "A fleet", role_label: roleLabel },
      },
    ).catch(() => {});
  } catch (err) {
    logger.warn("[fleetNotify] staff-invite push failed", {
      fleetId,
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  try {
    notifyWs([
      {
        event: "fleet:staff_invite",
        to: [{ kind: "user", user_id: inviteeUserId }],
        payload: { fleet_id: fleetId, member_id: memberId, role },
      },
    ]);
  } catch (err) {
    logger.warn("[fleetNotify] staff-invite ws failed", {
      fleetId,
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
