import { eq } from "drizzle-orm";
import { db } from "@/src/db";
import { rides, users } from "@/src/db/schema";
import { logger } from "@/lib/logger";

type DbLike = typeof db;
type SendSmsFn = (phone: string, message: string) => Promise<void>;

/**
 * C3-3 (STAGE C3-FIX) — at match, the ride PIN goes to the PASSENGER's phone
 * by SMS: the secondary contact on book-for-other rides, the rider's own
 * phone on normal rides. sendSms precedent: ride/request+api.ts (R1.3).
 *
 * Fire-and-forget at the call site (SMS must never block the match); this
 * helper resolves + sends, and only logs on failure.
 */
export async function sendMatchPinSms(
  dbLike: DbLike,
  opts: { ride_id: string; start_pin: string },
  sendSmsFn?: SendSmsFn,
): Promise<{ to: string | null; sent: boolean }> {
  const [ride] = await dbLike
    .select({
      user_id: rides.user_id,
      secondary_rider_phone: rides.secondary_rider_phone,
      is_booked_for_someone_else: rides.is_booked_for_someone_else,
    })
    .from(rides)
    .where(eq(rides.id, opts.ride_id))
    .limit(1);
  if (!ride) return { to: null, sent: false };

  let to: string | null = null;
  if (ride.is_booked_for_someone_else && ride.secondary_rider_phone) {
    to = ride.secondary_rider_phone;
  } else {
    const [rider] = await dbLike
      .select({ phone: users.phone })
      .from(users)
      .where(eq(users.id, ride.user_id))
      .limit(1);
    to = rider?.phone ?? null;
  }
  if (!to) return { to: null, sent: false };

  const send = sendSmsFn ?? (await import("./dprelay")).sendSms;
  try {
    await send(to, `Your Ride PIN is ${opts.start_pin}. Share it with your driver to start the trip.`);
    return { to, sent: true };
  } catch (err) {
    logger.warn("[ridePinSms] match PIN SMS failed (non-blocking)", {
      ride_id: opts.ride_id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { to, sent: false };
  }
}
