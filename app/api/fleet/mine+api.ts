/**
 * GET /api/fleet/mine — the caller's fleets (S5, plan 27 §4 F-17).
 *
 * Bootstrap for the (fleet) group: returns every fleet where the caller is
 * owner_user_id OR holds an ACTIVE fleet_members row, with the caller's role
 * in each. The (fleet)/_layout and the login-as chooser call this to resolve
 * a fleet context — the portal shipped UNREACHABLE (enterFleet had zero
 * callers; COVERAGE-MANIFEST 2026-10-04). BUSINESS fleets sort first so a
 * fleet OWNER lands on the fleet created by their role record (S2.1 D-2
 * scoping rule), never the implicit solo NATIVE fleet.
 *
 * Also returns the caller's PENDING fleet_driver_invites (S5 invite-with-
 * consent, F-17/R9) so the invitee sees "Fleet X invited you" on any surface.
 */
import { db } from "@/src/db";
import { fleetDriverInvites, fleetMembers, fleets } from "@/src/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);
    const { data: dbUser } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", supabaseUser.id)
      .maybeSingle();
    if (!dbUser?.id) {
      return Response.json({ error: "user_not_found", message: "No user record" }, { status: 403 });
    }

    const [ownedRows, memberRows, inviteRows] = await Promise.all([
      db
        .select({ id: fleets.id, name: fleets.name, status: fleets.status, fleet_type: fleets.fleet_type })
        .from(fleets)
        .where(eq(fleets.owner_user_id, dbUser.id))
        .orderBy(sql`CASE WHEN ${fleets.fleet_type} = 'BUSINESS' THEN 0 ELSE 1 END`, fleets.created_at),
      db
        .select({ id: fleets.id, name: fleets.name, status: fleets.status, fleet_type: fleets.fleet_type, role: fleetMembers.role })
        .from(fleetMembers)
        .innerJoin(fleets, eq(fleetMembers.fleet_id, fleets.id))
        .where(
          sql`${fleetMembers.user_id} = ${dbUser.id} AND ${fleetMembers.status} = 'active' AND ${fleetMembers.removed_at} IS NULL`,
        ),
      db
        .select({
          id: fleetDriverInvites.id,
          fleet_id: fleetDriverInvites.fleet_id,
          fleet_name: fleets.name,
          expires_at: fleetDriverInvites.expires_at,
        })
        .from(fleetDriverInvites)
        .innerJoin(fleets, eq(fleetDriverInvites.fleet_id, fleets.id))
        .where(
          sql`${fleetDriverInvites.phone} = (select phone from users where id = ${dbUser.id}) AND ${fleetDriverInvites.status} = 'pending' AND ${fleetDriverInvites.expires_at} > now()`,
        )
        .orderBy(desc(fleetDriverInvites.created_at)),
    ]);

    // Owner rows carry OWNER; membership rows carry their own role. A fleet
    // appearing in both resolves to OWNER (ownership outranks membership).
    const byId = new Map<string, { fleet_id: string; name: string; status: string; role: string }>();
    for (const r of memberRows) byId.set(r.id, { fleet_id: r.id, name: r.name, status: r.status, role: r.role });
    for (const r of ownedRows) byId.set(r.id, { fleet_id: r.id, name: r.name, status: r.status, role: "OWNER" });
    // BUSINESS-first order from the owned query drives the final order.
    const ordered = ownedRows.map((r) => byId.get(r.id)!).concat(
      memberRows.filter((m) => !ownedRows.some((o) => o.id === m.id)).map((m) => byId.get(m.id)!),
    );

    return Response.json({ fleets: ordered, invites: inviteRows }, { status: 200 });
  } catch (err: unknown) {
    const status = errors.getErrorStatus(err);
    if (status === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[fleet/mine] GET error", err);
    return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
  }
}
