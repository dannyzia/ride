import { db } from "@/src/db";
import { referralCodes, referrals, referralCampaigns, users, drivers, driverWalletTransactions, riderWalletTransactions } from "@/src/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [codeRow] = await db.select().from(referralCodes).where(eq(referralCodes.user_id, dbUser.id)).limit(1);

    if (!codeRow) {
      return Response.json({ code: null, campaign: null, stats: { total_referrals: 0, successful: 0, total_reward_bdt: 0 }, recent: [] }, { status: 200 });
    }

    const referralRows = await db.select({
      id: referrals.id,
      status: referrals.status,
      created_at: referrals.created_at,
      rewarded_at: referrals.rewarded_at,
      referee_id: referrals.referee_id,
      campaign_id: referrals.campaign_id,
    })
      .from(referrals)
      .where(eq(referrals.referrer_id, dbUser.id))
      .orderBy(referrals.created_at)
      .limit(20);

    const refereeIds = referralRows.map((r) => r.referee_id);
    const refereeUsers = refereeIds.length > 0
      ? await db.select({ id: users.id, phone: users.phone }).from(users).where(inArray(users.id, refereeIds))
      : [];
    const refereeMap = new Map(refereeUsers.map((u) => [u.id, u.phone]));

    const [campaign] = await db.select()
      .from(referralCampaigns)
      .where(sql`is_active = true`)
      .limit(1);

    let totalRewardBdt = 0;
    if (dbUser.role === "driver") {
      const [d] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
      if (d) {
        const [result] = await db.select({
          total: sql<number>`COALESCE(SUM(amount_bdt), 0)`,
        }).from(driverWalletTransactions)
          .where(sql`driver_id = ${d.id} AND transaction_type = 'referral_receivable'`);
        totalRewardBdt = result?.total ?? 0;
      }
    } else {
      const [result] = await db.select({
        total: sql<number>`COALESCE(SUM(amount_bdt), 0)`,
      }).from(riderWalletTransactions)
        .where(sql`rider_id = ${dbUser.id} AND transaction_type = 'referral_reward'`);
      totalRewardBdt = result?.total ?? 0;
    }

    const recent = referralRows.map((r) => ({
      referee_phone: refereeMap.get(r.referee_id) ?? null,
      status: r.status,
      created_at: r.created_at.toISOString(),
      rewarded_at: r.rewarded_at?.toISOString() ?? null,
    }));

    const totalReferrals = referralRows.length;
    const successful = referralRows.filter((r) => r.status === "rewarded").length;

    return Response.json({
      code: codeRow.code,
      campaign: campaign ? { name: campaign.name, referrer_reward_percent: campaign.referrer_reward_percent, referee_reward_percent: campaign.referee_reward_percent, referrer_reward_bdt: 0, referee_reward_bdt: 5000 } : null,
      stats: { total_referrals: totalReferrals, successful, total_reward_bdt: totalRewardBdt },
      recent,
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/referral] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
