import { and, eq } from "drizzle-orm";
import { db } from "@/src/db";
import { users, userRoles } from "@/src/db/schema";

/** DB handle type (same shape lib/rideParticipants uses). */
type DbLike = typeof db;

/**
 * C3-8 (STAGE C3-FIX): rider-role MEMBERSHIP for the booking surfaces
 * (ride/request, ride/schedule, ride/schedule/overlap, rider/ride/active).
 *
 * A multi-role account (e.g. shop_owner primary + rider member) books
 * exactly like a legacy rider-primary account: users.role is the legacy
 * fast path, user_roles membership is the additive path. user_roles rows
 * carry no status column — holding the row IS the grant (mirrors
 * heldRoles(), which lists pending roles as held).
 */
export async function holdsRiderRole(
  dbLike: DbLike,
  userId: string,
  knownRole?: string | null,
): Promise<boolean> {
  // Legacy fast path: callers that already hold the users row pass its
  // role in, so legacy rider-primary accounts cost ZERO extra queries and
  // keep their exact query sequence.
  if (knownRole === "rider") return true;
  if (knownRole == null) {
    const [user] = await dbLike
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return false;
    if (user.role === "rider") return true;
  }
  const [membership] = await dbLike
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.user_id, userId), eq(userRoles.role, "rider")))
    .limit(1);
  return membership != null;
}
