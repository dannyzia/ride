import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { drivers, rides } from "@/src/db/schema";

/** DB handle type (same shape leadBilling uses). */
type DbLike = typeof db;

export interface RideParticipantIds {
  riderUserId: string;
  driverUserId: string | null;
}

/**
 * C3-1 (STAGE C3-FIX) — single participant-resolution writer.
 *
 * rides.driver_id is a drivers.id, NOT a users.id. Every participant check
 * and counterparty lookup must resolve it to the driver's users.id first —
 * comparing ride.driver_id to a users.id 403s drivers forever (the exact
 * case this stage fixes). Ported from app/api/chat/message+api.ts (correct)
 * across the ride/[id]/{message,messages,details} trio.
 */
export async function resolveRideParticipantIds(
  dbLike: DbLike,
  ride: Pick<typeof rides.$inferSelect, "user_id" | "driver_id">,
): Promise<RideParticipantIds> {
  const [driverUser] = ride.driver_id
    ? await dbLike
        .select({ user_id: drivers.user_id })
        .from(drivers)
        .where(eq(drivers.id, ride.driver_id))
        .limit(1)
    : [];
  return {
    riderUserId: ride.user_id,
    driverUserId: driverUser?.user_id ?? null,
  };
}

/** True when userId is the rider or the resolved driver of the ride. */
export function isParticipant(ids: RideParticipantIds, userId: string): boolean {
  return userId === ids.riderUserId || (ids.driverUserId != null && userId === ids.driverUserId);
}

/** The OTHER party's users.id (recipient for relays, details counterparty). */
export function counterpartyUserId(ids: RideParticipantIds, userId: string): string | null {
  if (userId === ids.riderUserId) return ids.driverUserId;
  if (ids.driverUserId != null && userId === ids.driverUserId) return ids.riderUserId;
  return null;
}
