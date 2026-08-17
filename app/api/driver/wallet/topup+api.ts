import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { z } from "zod";
import * as errors from "@/lib/errors";

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000),
});

export async function POST(request: Request) {
  try {
    const user = await verifySupabaseToken(request);

    const [dbUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    const parsed = await parseJsonBody(request, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;
    const reference = crypto.randomUUID();

    // payment_events writes are owned by lib/paymentEvents.ts (see AGENTS.md)
    const initiated = await initiatePortposPayment({
      user_id: dbUser.id,
      driver_id: driver.id,
      idempotency_key: reference,
      amount_bdt: amountBdt,
      purpose: "wallet_topup",
      package_name: "Wallet Top-Up",
      customer_name: dbUser.name,
      customer_email: dbUser.email ?? "",
      customer_phone: dbUser.phone,
      redirect_url: `${process.env.EXPO_PUBLIC_SERVER_URL}/wallet/confirm`,
      ipn_url: `${process.env.EXPO_PUBLIC_SERVER_URL}/api/payment/portpos/callback`,
    });

    if (!initiated) {
      return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
    }

    return Response.json({ payment_url: initiated.payment_url, payment_event_id: initiated.payment_event_id }, { status: 200 });

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/wallet/topup] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
