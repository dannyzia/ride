// [public] PortPos payment callback — handles both redirect (GET) and IPN (POST)
// After payment, PortPos redirects the user and also sends an IPN notification.
//
// SECURITY: this is a public endpoint that credits wallets / activates
// subscriptions, so every request is verified against PortPos (verifyIPN) using
// the secret-bearing auth token BEFORE any state is touched. A forged request
// with no matching ACCEPTED invoice is rejected.

import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { portposClient, isConfigured } from "@/lib/portpos";
import { db } from "@/src/db";
import { paymentEvents, riderPasses, drivers } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { activateSubscription } from "@/lib/activateSubscription";
import { creditWalletTopup, activateRiderPass, enqueueCompensation } from "@/lib/paymentRepair";
import { logger } from "@/lib/logger";
import { recordSubscriptionSale } from '@/lib/accounting';
import * as errors from '@/lib/errors';

const ipnSchema = z.object({ invoice: z.string().min(1) });

// Validated shape of the PortPos getInvoice response (order.amount is a taka
// string like "500.00").
const invoiceSchema = z.object({
  invoice_id: z.string(),
  order: z.object({
    amount: z.string(),
    currency: z.string(),
    status: z.string(),
  }),
  reference: z.string().optional(),
});

const baseUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const successUrl = `${baseUrl}/payment/success`;
const failureUrl = `${baseUrl}/payment/failure`;

async function processPortposPayment(
  invoiceId: string,
): Promise<"success" | "failed"> {
  // 1. Resolve the local payment_event that initiated this invoice — it is the
  //    source of truth for the expected amount.
  const [localRow] = await db
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.provider_txn_id, invoiceId))
    .limit(1);
  if (!localRow) {
    logger.error("[portpos/callback] payment_event not found", { invoiceId });
    return "failed";
  }

  // 2. Verify the IPN with PortPos itself (secret-bearing auth token). This is
  //    what makes the endpoint forgery-proof: an attacker who knows the URL
  //    cannot create an ACCEPTED invoice on PortPos for a wallet/package amount
  //    they never paid.
  const verified = await portposClient.verifyIPN(
    invoiceId,
    (localRow.amount_bdt / 100).toFixed(2),
  );
  if (!verified) {
    logger.error("[portpos/callback] IPN verification failed", { invoiceId });
    return "failed";
  }

  // 3. Fetch + validate the invoice from PortPos.
  const invRaw = await portposClient.getInvoice(invoiceId);
  const parsedInvoice = invoiceSchema.safeParse(invRaw);
  if (!parsedInvoice.success) {
    logger.error("[portpos/callback] unexpected invoice shape", {
      invoiceId,
      issues: parsedInvoice.error.issues,
    });
    return "failed";
  }
  const inv = parsedInvoice.data;
  const orderStatus = inv.order?.status;

  if (orderStatus !== "ACCEPTED" && orderStatus !== "COMPLETED") {
    logger.warn("[portpos/callback] invoice not completed", {
      invoiceId,
      status: orderStatus,
    });
    return "failed";
  }

  let txPhase: 'not_found' | 'done' | 'continue' = 'not_found';
  let txEvt: typeof paymentEvents.$inferSelect | undefined;
  let txNext: 'success' | 'failed' | undefined;

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.provider_txn_id, invoiceId))
      .for("update")
      .limit(1);

    if (!row) {
      txPhase = 'not_found';
      txEvt = undefined;
      txNext = undefined;
      return;
    }

    if (row.status === 'paid') {
      txPhase = 'done';
      txEvt = row;
      txNext = 'success';
      return;
    }

    if (row.subscription_id) {
      txPhase = 'done';
      txEvt = row;
      txNext = 'success';
      return;
    }

    // Amount must match the locally-stored expected amount, compared in integer
    // paisa (never float taka) to avoid rounding drift.
    const invoiceAmountPaisa = Math.round(parseFloat(inv.order.amount) * 100);
    if (invoiceAmountPaisa !== row.amount_bdt) {
      logger.error("[portpos/callback] amount mismatch", {
        invoiceAmount: inv.order.amount,
        expectedAmountPaisa: row.amount_bdt,
      });
      await tx
        .update(paymentEvents)
        .set({ status: 'failed' })
        .where(eq(paymentEvents.id, row.id));
      txPhase = 'done';
      txEvt = row;
      txNext = 'failed';
      return;
    }

    await tx
      .update(paymentEvents)
      .set({ status: 'callback_pending' })
      .where(eq(paymentEvents.id, row.id));

    if (row.ride_id) {
      await tx
        .update(paymentEvents)
        .set({ status: 'paid', confirmed_at: new Date() })
        .where(eq(paymentEvents.id, row.id));
      logger.info("[portpos/callback] ride payment completed", {
        paymentEventId: row.id,
        rideId: row.ride_id,
      });
      txPhase = 'done';
      txEvt = row;
      txNext = 'success';
      return;
    }

    txPhase = 'continue';
    txEvt = row;
    txNext = undefined;
  });

  if (txPhase === 'not_found') {
    logger.error("[portpos/callback] payment_event not found", { invoiceId });
    return 'failed';
  }

  if (txPhase === 'done') {
    const evt = txEvt!;
    if (txNext === 'success') {
      if (evt.status === 'paid') {
        logger.info("[portpos/callback] already processed", {
          paymentEventId: evt.id,
          status: evt.status,
        });
      } else if (evt.subscription_id) {
        logger.info("[portpos/callback] already activated", {
          paymentEventId: evt.id,
          subscriptionId: evt.subscription_id,
        });
      } else if (evt.ride_id) {
        logger.info("[portpos/callback] ride payment completed", {
          paymentEventId: evt.id,
          rideId: evt.ride_id,
        });
      }
    }
    return txNext!;
  }

  const evt = txEvt!;

  // Rider Pass activation — use purpose + pass_id (no price guessing)
  if (evt.purpose === 'rider_pass' && evt.pass_id) {
    const [pass] = await db.select().from(riderPasses).where(eq(riderPasses.id, evt.pass_id)).limit(1);
    if (!pass) {
      // Deleted pass: nothing to repair — fail the event outright instead of
      // falling through to activateSubscription (guaranteed retry doom-loop).
      logger.error('[portpos/callback] rider pass not found — failing event', { paymentEventId: evt.id, passId: evt.pass_id });
      await db.transaction(async (tx) => {
        await tx.update(paymentEvents).set({ status: 'failed' }).where(eq(paymentEvents.id, evt.id));
      });
      return "failed";
    }
    try {
      await activateRiderPass(evt, pass);
      logger.info('[portpos/callback] rider pass activated', { paymentEventId: evt.id, passId: pass.id });
      return "success";
    } catch (passErr: unknown) {
      // Z-3: unlike wallet topup / package purchase, this path never enqueued
      // compensation — one transient failure left the paid pass stuck in
      // callback_pending forever with zero retry machinery.
      logger.error('[portpos/callback] rider pass activation failed — enqueuing compensation', { paymentEventId: evt.id, error: errors.getErrorMessage(passErr) });
      await enqueueCompensation(evt.id);
      return "failed";
    }
  }

  // Wallet topup — credit user or driver wallet (shared credit transaction so
  // the compensation worker can repair failed topups the same way, Z-2).
  if ((evt.purpose === 'wallet_topup' || (!evt.purpose && evt.user_id && !evt.subscription_id && !evt.ride_id && !evt.driver_id)) && !evt.pass_id) {
    try {
      await creditWalletTopup(evt);
      logger.info("[portpos/callback] wallet topup completed", {
        paymentEventId: evt.id,
        userId: evt.user_id,
        amountBdt: evt.amount_bdt,
      });
      return "success";
    } catch (topupErr: unknown) {
      logger.error("[portpos/callback] wallet topup failed", {
        paymentEventId: evt.id,
        error: errors.getErrorMessage(topupErr),
      });
      await enqueueCompensation(evt.id);
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
    if (evt.driver_id) {
      const [dZone] = await db
        .select({ zone_id: drivers.zone_id })
        .from(drivers)
        .where(eq(drivers.id, evt.driver_id))
        .limit(1);
      try { await recordSubscriptionSale({ id: subscriptionId, driverId: evt.driver_id!, amountPaisa: evt.amount_bdt, zoneId: dZone?.zone_id ?? undefined }); }
      catch (e) { logger.warn('[accounting] subscription entry failed', e); }
    } else {
      try { await recordSubscriptionSale({ id: subscriptionId, driverId: evt.driver_id!, amountPaisa: evt.amount_bdt }); }
      catch (e) { logger.warn('[accounting] subscription entry failed', e); }
    }
    return "success";
  } catch (activationErr: unknown) {
    logger.error(
      "[portpos/callback] activateSubscription failed, enqueuing compensation",
      {
        paymentEventId: evt.id,
        error: errors.getErrorMessage(activationErr),
      },
    );
    await enqueueCompensation(evt.id);
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
  } catch (e: unknown) {
    logger.error("[portpos/callback] GET error", {
      invoiceId,
      error: errors.getErrorMessage(e),
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

    const parsedBody = await parseJsonBody(request, ipnSchema);
    if (!parsedBody.ok) {
      logger.warn("[portpos/callback] IPN invalid body");
      return Response.json(
        { result: "error", message: "invalid_body" },
        { status: 400 },
      );
    }
    const invoiceId = parsedBody.data.invoice;

    const result = await processPortposPayment(invoiceId);
    return Response.json({
      result: result === "success" ? "success" : "error",
    });
  } catch (e: unknown) {
    logger.error("[portpos/callback] POST error", { error: errors.getErrorMessage(e) });
    return Response.json(
      { result: "error", message: "internal_error" },
      { status: 500 },
    );
  }
}
