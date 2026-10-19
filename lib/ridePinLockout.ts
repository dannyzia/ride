import { eq, sql } from "drizzle-orm";
import { db } from "@/src/db";
import { auditLogs, rides } from "@/src/db/schema";
import { logger } from "@/lib/logger";

type DbLike = typeof db;

/** Wrong-PIN attempts before the ride locks (F-05). */
export const PIN_MAX_ATTEMPTS = 3;

export interface PinState {
  start_pin: string | null;
  start_pin_attempts: number;
  start_pin_locked_at: Date | string | null;
}

/**
 * C3-4 (STAGE C3-FIX) — shared PIN-lockout writer for BOTH start entry
 * points (WS ride:start + REST start+api). ×3 mismatches lock the ride and
 * notify the admin; a correct PIN after lock still fails.
 */
export function isPinLocked(state: Pick<PinState, "start_pin_locked_at">): boolean {
  return state.start_pin_locked_at != null;
}

/** Increment the attempt counter; on the 3rd miss lock + notify. */
export async function recordPinFailure(
  dbLike: DbLike,
  rideId: string,
): Promise<{ attempts: number; locked: boolean }> {
  const [row] = await dbLike
    .update(rides)
    .set({ start_pin_attempts: sql`${rides.start_pin_attempts} + 1` })
    .where(eq(rides.id, rideId))
    .returning({ attempts: rides.start_pin_attempts });
  const attempts = Number(row?.attempts ?? 1);
  if (attempts < PIN_MAX_ATTEMPTS) return { attempts, locked: false };

  await dbLike
    .update(rides)
    .set({ start_pin_locked_at: new Date() })
    .where(eq(rides.id, rideId));
  // F-05 admin notify = the admin-visible audit trail (A3 pattern), non-fatal
  // — the table may lack an admin RLS grant (see fleets/[id] precedent).
  try {
    await dbLike.insert(auditLogs).values({
      action: "ride_pin_locked",
      entity_type: "ride",
      entity_id: rideId,
      new_value: { attempts } as unknown as Record<string, unknown>,
    });
  } catch (auditErr) {
    logger.warn("[ridePinLockout] audit_logs write failed (non-fatal)", auditErr);
  }
  logger.warn("[ridePinLockout] ride locked after PIN mismatches", { ride_id: rideId, attempts });
  return { attempts, locked: true };
}

/** Reset the counter on a successful start (correct PIN, unlocked ride). */
export async function resetPinAttempts(dbLike: DbLike, rideId: string): Promise<void> {
  await dbLike
    .update(rides)
    .set({ start_pin_attempts: 0 })
    .where(eq(rides.id, rideId));
}
