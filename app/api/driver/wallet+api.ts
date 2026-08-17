import { db } from "@/src/db";
import { drivers, driverWalletTransactions, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id, driver_wallet_balance_bdt: drivers.driver_wallet_balance_bdt })
      .from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const recent = await db.select({
      id: driverWalletTransactions.id,
      transaction_type: driverWalletTransactions.transaction_type,
      amount_bdt: driverWalletTransactions.amount_bdt,
      balance_after: driverWalletTransactions.balance_after,
      created_at: driverWalletTransactions.created_at,
    })
      .from(driverWalletTransactions)
      .where(eq(driverWalletTransactions.driver_id, driver.id))
      .orderBy(driverWalletTransactions.created_at)
      .limit(20);

    return Response.json({
      balance_bdt: driver.driver_wallet_balance_bdt ?? 0,
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
    logger.error("[driver/wallet] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
