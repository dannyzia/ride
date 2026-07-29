// [public] PortPos payment callback — handles both redirect (GET) and IPN (POST)
// After payment, PortPos redirects the user and also sends an IPN notification.

import { portposClient, isConfigured } from "@/lib/portpos";
import { db } from "@/src/db";
import { paymentEvents, compensationQueue, users, drivers, driverWalletTransactions, riderWalletTransactions, riderPasses, riderSubscriptions } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { activateSubscription } from "@/lib/activateSubscription";
import { logger } from "@/lib/logger";
import { recordSubscriptionSale, recordWalletTopup, recordRiderPassPurchase } from '@/lib/accounting';

const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const successUrl = `${baseUrl}/payment/success`;
const failureUrl = `${baseUrl}/payment/failure`;

async function processPortposPayment(
  invoiceId: string,
): Promise<"success" | "failed"> {
  const inv = await portposClient.getInvoice(invoiceId);
  const orderStatus = inv.order?.status;

  if (orderStatus !== "ACCEPTED" && orderStatus !== "COMPLETED") {
    logger.warn("[portpos/callback] invoice not completed", {
      invoiceId,
      status: orderStatus,
    });
    return "failed";
  }

  const [evt] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.provider_txn_id, invoiceId))
    .limit(1);

  if (!evt) {
    logger.error("[portpos/callback] payment_event not found", { invoiceId });
    return "failed";
  }

  if (evt.status === "paid") {
    logger.info("[portpos/callback] already processed", {
      paymentEventId: evt.id,
      status: evt.status,
    });
    return "success";
  }

  if (evt.subscription_id) {
    logger.info("[portpos/callback] already activated", {
      paymentEventId: evt.id,
      subscriptionId: evt.subscription_id,
    });
    return "success";
  }

  // Verify amount matches (anti-tamper)
  const invoiceAmountTaka = parseFloat(inv.order.amount);
  const eventAmountTaka = evt.amount_bdt / 100;
  if (Math.abs(invoiceAmountTaka - eventAmountTaka) > 0.01) {
    logger.error("[portpos/callback] amount mismatch", {
      invoiceAmount: inv.order.amount,
      expectedAmount: eventAmountTaka,
    });
    await db
      .update(paymentEvents)
      .set({ status: "failed" })
      .where(eq(paymentEvents.id, evt.id));
    return "failed";
  }

  await db
    .update(paymentEvents)
    .set({ status: "callback_pending" })
    .where(eq(paymentEvents.id, evt.id));

  if (evt.ride_id) {
    await db
      .update(paymentEvents)
      .set({ status: "paid", confirmed_at: new Date() })
      .where(eq(paymentEvents.id, evt.id));
    logger.info("[portpos/callback] ride payment completed", {
      paymentEventId: evt.id,
      rideId: evt.ride_id,
    });
    return "success";
  }

  // Rider Pass activation — use purpose + pass_id (no price guessing)
  if (evt.purpose === 'rider_pass' && evt.pass_id) {
    const [pass] = await db.select().from(riderPasses).where(eq(riderPasses.id, evt.pass_id)).limit(1);
    if (pass) {
      try {
        const [newSub] = await db.insert(riderSubscriptions).values({
          rider_id: evt.user_id!,
          pass_id: pass.id,
          status: 'active',
          valid_until: new Date(Date.now() + pass.validity_days * 86400000),
          payment_event_id: evt.id,
        }).returning();
        await db.update(paymentEvents).set({ status: "paid", confirmed_at: new Date() }).where(eq(paymentEvents.id, evt.id));
        logger.info('[portpos/callback] rider pass activated', { paymentEventId: evt.id, passId: pass.id });
        try { await recordRiderPassPurchase({ subscriptionId: newSub.id, amountPaisa: evt.amount_bdt, riderId: evt.user_id!, paymentEventId: evt.id }); }
        catch (e) { logger.warn('[accounting] rider pass entry failed', e); }
        return "success";
      } catch (passErr: any) {
        logger.error('[portpos/callback] rider pass activation failed', { paymentEventId: evt.id, error: passErr.message });
        return "failed";
      }
    }
  }

  // Wallet topup — credit user or driver wallet
  if ((evt.purpose === 'wallet_topup' || (!evt.purpose && evt.user_id && !evt.subscription_id && !evt.ride_id && !evt.driver_id)) && !evt.pass_id) {
    try {
      await db.transaction(async (tx) => {
        if (evt.driver_id) {
          const [d] = await tx.select({ balance: drivers.driver_wallet_balance_bdt })
            .from(drivers).where(eq(drivers.id, evt.driver_id!)).limit(1)
            .for("update");
          const newBalance = (d?.balance ?? 0) + evt.amount_bdt;
          await tx.update(drivers)
            .set({ driver_wallet_balance_bdt: newBalance, updated_at: new Date() })
            .where(eq(drivers.id, evt.driver_id!));
          await tx.insert(driverWalletTransactions).values({
            driver_id: evt.driver_id!,
            transaction_type: "adjustment",
            amount_bdt: evt.amount_bdt,
            balance_after: newBalance,
          } as any);
        } else {
          const [u] = await tx.select({ balance: users.rider_wallet_balance_bdt })
            .from(users).where(eq(users.id, evt.user_id!)).limit(1)
            .for("update");
          const newBalance = (u?.balance ?? 0) + evt.amount_bdt;
          await tx.update(users)
            .set({ rider_wallet_balance_bdt: newBalance, updated_at: new Date() })
            .where(eq(users.id, evt.user_id!));
          await tx.insert(riderWalletTransactions).values({
            rider_id: evt.user_id!,
            transaction_type: "adjustment",
            amount_bdt: evt.amount_bdt,
            balance_after: newBalance,
          } as any);
        }
        await tx.update(paymentEvents)
          .set({ status: "paid", confirmed_at: new Date() })
          .where(eq(paymentEvents.id, evt.id));
      });
      logger.info("[portpos/callback] wallet topup completed", {
        paymentEventId: evt.id,
        userId: evt.user_id,
        amountBdt: evt.amount_bdt,
      });
      try { await recordWalletTopup({ userId: evt.user_id!, amountPaisa: evt.amount_bdt, isDriver: !!evt.driver_id, paymentEventId: evt.id }); }
      catch (e) { logger.warn('[accounting] wallet topup entry failed', e); }
      return "success";
    } catch (topupErr: any) {
      logger.error("[portpos/callback] wallet topup failed", {
        paymentEventId: evt.id,
        error: topupErr.message,
      });
      await db.insert(compensationQueue).values({
        payment_event_id: evt.id,
        status: "pending",
        next_retry_at: new Date(),
        attempt_count: 0,
      });
      return "failed";
    }
  }

  // Package purchase — activate subscription
  try {
    const { subscriptionId } = await activateSubscription(evt.id);
    logger.info("[portpos/callback] subscription activated", {
      paymentEventId: evt.id,
      subscriptionId,
    });
    try { await recordSubscriptionSale({ id: subscriptionId, driverId: evt.driver_id!, amountPaisa: evt.amount_bdt }); }
    catch (e) { logger.warn('[accounting] subscription entry failed', e); }
    return "success";
  } catch (activationErr: any) {
    logger.error(
      "[portpos/callback] activateSubscription failed, enqueuing compensation",
      {
        paymentEventId: evt.id,
        error: activationErr.message,
      },
    );
    await db.insert(compensationQueue).values({
      payment_event_id: evt.id,
      status: "pending",
      next_retry_at: new Date(),
      attempt_count: 0,
    });
    return "failed";
  }
}

/**
 * GET — Browser redirect after payment.
 */
export async function GET(request: Request) {
  if (!isConfigured()) {
    return Response.redirect(
      `${failureUrl}?reason=payment_not_configured`,
      302,
    );
  }

  const url = new URL(request.url);
  const invoiceId = url.searchParams.get("invoice");

  if (!invoiceId) {
    logger.warn("[portpos/callback] missing invoice param");
    return Response.redirect(`${failureUrl}?reason=missing_invoice`, 302);
  }

  try {
    const result = await processPortposPayment(invoiceId);
    return Response.redirect(
      result === "success" ? successUrl : `${failureUrl}?reason=payment_failed`,
      302,
    );
  } catch (e: any) {
    logger.error("[portpos/callback] GET error", {
      invoiceId,
      error: e.message,
    });
    return Response.redirect(`${failureUrl}?reason=internal_error`, 302);
  }
}

/**
 * POST — IPN notification from PortPos.
 */
export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return Response.json(
        { result: "error", message: "payment_not_configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const invoiceId = body.invoice as string;

    if (!invoiceId) {
      logger.warn("[portpos/callback] IPN missing invoice");
      return Response.json(
        { result: "error", message: "missing_invoice" },
        { status: 400 },
      );
    }

    const result = await processPortposPayment(invoiceId);
    return Response.json({
      result: result === "success" ? "success" : "error",
    });
  } catch (e: any) {
    logger.error("[portpos/callback] POST error", { error: e.message });
    return Response.json(
      { result: "error", message: "internal_error" },
      { status: 500 },
    );
  }
}
