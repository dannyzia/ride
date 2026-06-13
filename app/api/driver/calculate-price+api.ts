// Auth: verifySupabaseToken via Bearer token
import { db } from "@/src/db";
import { rides, users } from "@/src/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { verifySupabaseToken } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);
    const supabaseUid = user.id;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const data = await db.select({
      totalBdt: sql<string>`COALESCE(CAST(fare_breakdown->>'total_bdt' AS text), '0')`,
      commissionBdt: sql<number>`COALESCE(platform_commission_bdt, 0)`,
    })
      .from(rides)
      .innerJoin(users, eq(rides.driver_id, users.id))
      .where(
        and(
          eq(users.auth_uid, supabaseUid),
          gte(rides.created_at, startOfDay),
          lt(rides.created_at, endOfDay)
        )
      );

    const totalEarnings = data.reduce((acc, ride) => {
      const gross = Number(ride.totalBdt ?? 0);
      const commission = ride.commissionBdt ?? 0;
      return acc + (gross - commission);
    }, 0);
    const roundedEarnings = Math.round(totalEarnings * 100) / 100;

    return Response.json({ totalEarnings: roundedEarnings }, { status: 200 });
  } catch (error) {
    logger.error('[driver/calculate-price] error', error);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
