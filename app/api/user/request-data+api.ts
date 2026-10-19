import { db } from "@/src/db";
import { paymentEvents, users, rides, riderWalletTransactions, subscriptions, callLedger, promoRedemptions, drivers, shops, shopOrders, fleetMembers, fleets, courierRemittanceDues, deliveryEarnings } from "@/src/db/schema";
import { eq, inArray } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

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

    // C2-5: export scope aligned to the delete policy — the export was
    // customer-only; shop / fleet / courier datasets are included now.
    const ownedShops = await db.select().from(shops).where(eq(shops.owner_user_id, dbUser.id)).limit(100);
    const shopOrdersPlaced = await db.select().from(shopOrders).where(eq(shopOrders.rider_user_id, dbUser.id)).limit(1000);
    const fleetMemberships = await db.select().from(fleetMembers).where(eq(fleetMembers.user_id, dbUser.id)).limit(100);
    const fleetIds = [...new Set(fleetMemberships.map((m) => m.fleet_id))];
    const fleetRows = fleetIds.length > 0
      ? await db.select().from(fleets).where(inArray(fleets.id, fleetIds)).limit(100)
      : [];
    const courierDues = await db.select().from(courierRemittanceDues).where(eq(courierRemittanceDues.delivery_man_user_id, dbUser.id)).limit(1000);
    const courierEarnings = await db.select().from(deliveryEarnings).where(eq(deliveryEarnings.delivery_man_user_id, dbUser.id)).limit(1000);

    const data = {
      profile: dbUser,
      rides: userRides,
      wallet_transactions: riderTxns,
      payments,
      subscriptions: subs,
      call_ledger: ledger,
      promo_redemptions: promos,
      shops: ownedShops,
      shop_orders: shopOrdersPlaced,
      fleet_memberships: fleetMemberships,
      fleets: fleetRows,
      courier_remittance_dues: courierDues,
      delivery_earnings: courierEarnings,
    };

    return Response.json(data, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[user/request-data] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}