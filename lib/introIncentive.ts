import { db } from "../src/db";
import { riderIntroConfigs, rides } from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { nextBdtMidnightUtc } from "./time";

export interface DiscountOption {
  type: "intro" | "promo" | "pass" | "wallet";
  percent?: number;
  amount_bdt: number;
  description: string;
  // W-2: set only by the pass option — the rider_subscriptions row that
  // supplied the discount, so the ride records it and completion burns the
  // right pass's quota.
  subscription_id?: string;
}

export async function getIntroConfig(zoneId: string) {
  const [config] = await db
    .select()
    .from(riderIntroConfigs)
    .where(
      and(
        eq(riderIntroConfigs.zone_id, zoneId),
        eq(riderIntroConfigs.is_active, true),
      ),
    )
    .limit(1);
  return config || null;
}

export async function getIntroDiscount(
  riderId: string,
  nextRideNumber: number,
  fareTotalBdt: number,
  zoneId: string,
): Promise<DiscountOption | null> {
  const [config] = await db
    .select()
    .from(riderIntroConfigs)
    .where(
      and(
        eq(riderIntroConfigs.zone_id, zoneId),
        eq(riderIntroConfigs.is_active, true),
        sql`${riderIntroConfigs.ride_number} = ${nextRideNumber}`,
        sql`${riderIntroConfigs.effective_from} <= now()`,
        sql`${riderIntroConfigs.effective_to} IS NULL OR ${riderIntroConfigs.effective_to} > now()`,
      ),
    )
    .limit(1);
  if (!config) return null;

  const dayStart = new Date(nextBdtMidnightUtc().getTime() - 24 * 60 * 60 * 1000);
  const dayEnd = nextBdtMidnightUtc();

  const [{ spent }] = await db
    .select({
      spent: sql<number>`COALESCE(SUM(${rides.applied_discount_bdt}), 0)`,
    })
    .from(rides)
    .where(
      and(
        eq(rides.zone_id, zoneId),
        sql`${rides.applied_discount_type} = 'intro'`,
        sql`${rides.created_at} >= ${dayStart} AND ${rides.created_at} < ${dayEnd}`,
      ),
    );
  const dailySpent = Number(spent ?? 0);
  if (dailySpent >= config.daily_cap_bdt) return null;

  const discountBdt = Math.round(
    (fareTotalBdt * config.discount_percent) / 100,
  );
  const capped = config.max_discount_bdt
    ? Math.min(discountBdt, config.max_discount_bdt)
    : discountBdt;
  const remainingBudget = config.daily_cap_bdt - dailySpent;
  const finalAmount = Math.min(capped, remainingBudget);
  if (finalAmount <= 0) return null;

  return {
    type: "intro",
    percent: config.discount_percent,
    amount_bdt: finalAmount,
     description: `Intro offer: ${config.discount_percent}% off (ride ${nextRideNumber})`,
  };
}
