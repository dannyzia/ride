import { db } from "@/src/db";
import { paymentEvents, users, rides, riderWalletTransactions, subscriptions, callLedger, promoRedemptions, drivers } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select().from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const userRides = await db.select().from(rides).where(eq(rides.user_id, dbUser.id)).limit(1000);
    const riderTxns = await db.select().from(riderWalletTransactions).where(eq(riderWalletTransactions.rider_id, dbUser.id)).limit(1000);
    const promos = await db.select().from(promoRedemptions).where(eq(promoRedemptions.rider_id, dbUser.id)).limit(1000);

    const [driver] = await db.select().from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);

    const payments = driver
      ? await db.select().from(paymentEvents).where(eq(paymentEvents.driver_id, driver.id)).limit(1000)
      : [];
    const subs = driver
      ? await db.select().from(subscriptions).where(eq(subscriptions.driver_id, driver.id)).limit(1000)
      : [];
    const ledger = driver
      ? await db.select().from(callLedger).where(eq(callLedger.driver_id, driver.id)).limit(1000)
      : [];

    const data = {
      profile: dbUser,
      rides: userRides,
      wallet_transactions: riderTxns,
      payments,
      subscriptions: subs,
      call_ledger: ledger,
      promo_redemptions: promos,
    };

    return Response.json(data, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/request-data] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}