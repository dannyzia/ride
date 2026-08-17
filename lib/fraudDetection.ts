import { db } from "../src/db";
import {
  users,
  rides,
  userDevices,
} from "../src/db/schema";
import { eq, and, sql, gt, isNotNull } from "drizzle-orm";
import { logger } from "./logger";
import * as errors from "@/lib/errors";

const ONE_DAY_AGO = new Date(Date.now() - 24 * 60 * 60 * 1000);
const TODAY_MIDNIGHT = new Date();
TODAY_MIDNIGHT.setUTCHours(0, 0, 0, 0);

export async function detectCancellationAbuse(riderId: string): Promise<number> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(rides)
      .where(
        and(
          eq(rides.user_id, riderId),
          eq(rides.status, "cancelled"),
          eq(rides.cancel_reason, "rider_cancelled"),
          gt(rides.created_at, ONE_DAY_AGO),
        ),
      );
    const total = Number(count ?? 0);
    if (total > 5) {
      return 10 * (total - 5);
    }
    return 0;
  } catch (e: unknown) {
    logger.error("[fraud] detectCancellationAbuse error", { riderId, error: errors.getErrorMessage(e) });
    return 0;
  }
}

export async function detectReferralRing(riderId: string): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT 1
      FROM referrals r1
      JOIN referrals r2 ON r1.referee_id = r2.referrer_id AND r2.referee_id = r1.referrer_id
      WHERE r1.referrer_id = ${riderId}
      LIMIT 1
    `);
    return result.length > 0 ? 50 : 0;
  } catch (e: unknown) {
    logger.error("[fraud] detectReferralRing error", { riderId, error: errors.getErrorMessage(e) });
    return 0;
  }
}

export async function detectRepeatedPairing(riderId: string): Promise<number> {
  try {
    const pairs = await db
      .select({ driver_id: rides.driver_id, count: sql<number>`count(*)` })
      .from(rides)
      .where(
        and(
          eq(rides.user_id, riderId),
          eq(rides.status, "completed"),
          isNotNull(rides.driver_id),
          sql`${rides.distance_km} < 2`,
          gt(rides.created_at, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        ),
      )
      .groupBy(rides.driver_id)
      .having(sql`count(*) > 3`);
    return pairs.length > 0 ? 30 : 0;
  } catch (e: unknown) {
    logger.error("[fraud] detectRepeatedPairing error", { riderId, error: errors.getErrorMessage(e) });
    return 0;
  }
}

export async function checkDeviceDuplicates(userId: string): Promise<number> {
  try {
    const [userDevice] = await db
      .select({ device_id: userDevices.device_id })
      .from(userDevices)
      .where(eq(userDevices.user_id, userId))
      .limit(1);
    if (!userDevice?.device_id) return 0;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(userDevices)
      .where(
        and(
          eq(userDevices.device_id, userDevice.device_id),
          sql`user_id != ${userId}`,
        ),
      );
    const others = Number(count ?? 0);
    return others > 0 ? 100 : 0;
  } catch (e: unknown) {
    logger.error("[fraud] checkDeviceDuplicates error", { userId, error: errors.getErrorMessage(e) });
    return 0;
  }
}

export async function runFraudDetection(): Promise<void> {
  try {
    const recentRiderIds = await db
      .select({ user_id: rides.user_id })
      .from(rides)
      .where(gt(rides.created_at, ONE_DAY_AGO))
      .groupBy(rides.user_id);

    const riderIds = recentRiderIds
      .map((r) => r.user_id)
      .filter((id): id is string => id != null);

    for (const riderId of riderIds) {
      const score =
        (await detectCancellationAbuse(riderId)) +
        (await detectReferralRing(riderId)) +
        (await detectRepeatedPairing(riderId)) +
        (await checkDeviceDuplicates(riderId));

      if (score > 0) {
        await db
          .update(users)
          .set({ fraud_score: score, updated_at: new Date() })
          .where(eq(users.id, riderId));
        logger.info("[fraud] score updated", { riderId, score });
      }

      if (score > 100) {
        await db
          .update(users)
          .set({ account_status: "suspended", updated_at: new Date() })
          .where(eq(users.id, riderId));

        const [userRow] = await db
          .select({ push_token: userDevices.push_token })
          .from(userDevices)
          .where(eq(userDevices.user_id, riderId))
          .limit(1);

        if (userRow?.push_token) {
          try {
            await fetch("https://exp.host/--/api/v2/push/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                to: userRow.push_token,
                title: "Account Suspended",
                body: "Your account has been suspended due to suspicious activity.",
                sound: "default",
                priority: "high",
              }),
            });
          } catch (pushErr) {
            logger.error("[fraud] suspension push failed", { riderId, error: pushErr });
          }
        }
      }
    }
  } catch (e: unknown) {
    logger.error("[fraud] runFraudDetection error", { error: errors.getErrorMessage(e) });
  }
}
