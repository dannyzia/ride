import { db } from "@/src/db";
import { driverWalletTransactions, drivers, users } from "@/src/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const rows = await db.select({
      id: driverWalletTransactions.id,
      transaction_type: driverWalletTransactions.transaction_type,
      amount_bdt: driverWalletTransactions.amount_bdt,
      balance_after: driverWalletTransactions.balance_after,
      created_at: driverWalletTransactions.created_at,
    })
      .from(driverWalletTransactions)
      .where(and(
        eq(driverWalletTransactions.driver_id, driver.id),
        inArray(driverWalletTransactions.transaction_type, ["payout", "adjustment"]),
      ))
      .orderBy(driverWalletTransactions.created_at)
      .limit(50);

    return Response.json({
      transactions: rows.map((r) => ({
        id: r.id,
        transaction_type: r.transaction_type,
        amount_bdt: r.amount_bdt,
        balance_after: r.balance_after,
        created_at: r.created_at.toISOString(),
      })),
    }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/payout-history] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
