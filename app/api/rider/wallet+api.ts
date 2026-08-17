import { db } from "@/src/db";
import { riderWalletTransactions, users } from "@/src/db/schema";
import { eq, desc } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id, rider_wallet_balance_bdt: users.rider_wallet_balance_bdt })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const recent = await db.select({
      id: riderWalletTransactions.id,
      transaction_type: riderWalletTransactions.transaction_type,
      amount_bdt: riderWalletTransactions.amount_bdt,
      balance_after: riderWalletTransactions.balance_after,
      created_at: riderWalletTransactions.created_at,
    })
      .from(riderWalletTransactions)
      .where(eq(riderWalletTransactions.rider_id, dbUser.id))
      .orderBy(desc(riderWalletTransactions.created_at))
      .limit(20);

    return Response.json({
      balance_bdt: dbUser.rider_wallet_balance_bdt ?? 0,
      recent_transactions: recent.map((r) => ({
        id: r.id,
        transaction_type: r.transaction_type,
        amount_bdt: r.amount_bdt,
        balance_after: r.balance_after,
        created_at: r.created_at.toISOString(),
      })),
    }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[rider/wallet] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
