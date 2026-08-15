import { db } from "@/src/db";
import { users, riderFeeDeductions } from "@/src/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const supabaseUser = await verifySupabaseToken(request);

    const [dbUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser)
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const now = new Date();
    const deductions = await db
      .select({
        id: riderFeeDeductions.id,
        ride_id: riderFeeDeductions.ride_id,
        total_amount_bdt: riderFeeDeductions.total_amount_bdt,
        remaining_amount_bdt: riderFeeDeductions.remaining_amount_bdt,
        status: riderFeeDeductions.status,
        expires_at: riderFeeDeductions.expires_at,
        created_at: riderFeeDeductions.created_at,
      })
      .from(riderFeeDeductions)
      .where(
        and(
          eq(riderFeeDeductions.rider_id, dbUser.id),
          sql`${riderFeeDeductions.status} IN ('pending', 'partially_collected')`,
          sql`${riderFeeDeductions.expires_at} > ${now}`,
        ),
      )
      .orderBy(asc(riderFeeDeductions.created_at));

    const totalOwed = deductions.reduce((sum, d) => sum + d.remaining_amount_bdt, 0);

    return Response.json({
      deductions: deductions.map((d) => ({
        id: d.id,
        ride_id: d.ride_id,
        total_amount_bdt: d.total_amount_bdt,
        remaining_amount_bdt: d.remaining_amount_bdt,
        status: d.status,
        expires_at: d.expires_at.toISOString(),
        created_at: d.created_at.toISOString(),
      })),
      total_owed_bdt: totalOwed,
    });
  } catch (err: any) {
    if (err.status === 401)
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[rider/fee-deductions] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
