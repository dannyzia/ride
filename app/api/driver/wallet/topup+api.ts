import { db } from "@/src/db";
import { paymentEvents, drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { portposClient } from "@/lib/portpos";
import { z } from "zod";

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: "driver_not_found" }, { status: 404 });

    const parsed = await parseJsonBody(request, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;
    const reference = crypto.randomUUID();
    const redirectUrl = `${process.env.EXPO_PUBLIC_SERVER_URL}/wallet/confirm`;
    const ipnUrl = `${process.env.EXPO_PUBLIC_SERVER_URL}/api/payment/portpos/callback`;

    const [evt] = await db.insert(paymentEvents).values({
      user_id: dbUser.id,
      driver_id: driver.id,
      provider: "portpos",
      status: "initiated",
      idempotency_key: reference,
      amount_bdt: amountBdt,
      purpose: "wallet_topup",
    }).returning({ id: paymentEvents.id });

    const invoice = await portposClient.createInvoice({
      amount: amountBdt,
      reference,
      redirectUrl,
      ipnUrl,
      packageName: "Wallet Top-Up",
      billing: {
        customer: { name: dbUser.name, email: dbUser.email ?? "", phone: dbUser.phone },
        address: {
          street: "",
          city: "Dhaka",
          state: "Dhaka",
          zipcode: "1000",
          country: "BD",
        },
      },
    });

    await db.update(paymentEvents)
      .set({ provider_txn_id: invoice.invoice_id, status: "callback_pending" })
      .where(eq(paymentEvents.id, evt!.id));

    return Response.json({ payment_url: invoice.payment_url, payment_event_id: evt!.id }, { status: 200 });

  } catch (err: any) {
    if (err.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
    logger.error("[driver/wallet/topup] error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
