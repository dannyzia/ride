import { db } from "@/src/db";
import { drivers, users } from "@/src/db/schema";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { logger } from "@/lib/logger";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import {
  beginIdempotencyClaim,
  storeIdempotencyOutcome,
  extractIdempotencyKey,
  sha256Fingerprint,
  IDEMPOTENCY_ROUTES,
} from "@/lib/idempotency";
import { z } from "zod";
import * as errors from "@/lib/errors";

const topupSchema = z.object({
  amount_bdt: z.number().int().min(10000),
});

export async function POST(originalRequest: Request) {
  try {
    const user = await verifySupabaseToken(originalRequest);

    const [dbUser] = await db.select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users).where(eq(users.auth_uid, user.id)).limit(1);
    if (!dbUser) return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.user_id, dbUser.id)).limit(1);
    if (!driver) return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

    // Raw body captured for the idempotency fingerprint BEFORE parseJsonBody
    // consumes the stream; the authoritative Zod validation runs on a re-parse.
    const rawBody: string = await originalRequest.text();
    const bodyForParse = new Request("http://internal/parse", { method: "POST", body: rawBody, headers: { "content-type": "application/json" } });
    const parsed = await parseJsonBody(bodyForParse, topupSchema);
    if (!parsed.ok) return parsed.response;

    const amountBdt = parsed.data.amount_bdt;

    // ── Idempotency-Key convention (decision 01M23628A1566SK1D5XXV1NT5G).
    // Header optional (absent → fresh server key); present → (route, key)
    // barrier with replay-or-conflict before any invoice round-trip.
    const idempotencyKey = extractIdempotencyKey(originalRequest);
    let reference: string = crypto.randomUUID();
    if (idempotencyKey) {
      const claim = await beginIdempotencyClaim({
        route: IDEMPOTENCY_ROUTES.driverWalletTopup,
        key: idempotencyKey,
        userId: dbUser.id,
        requestFingerprint: sha256Fingerprint("POST", rawBody),
      });
      if (claim.kind === "replay") return claim.response;
      if (claim.kind === "conflict") return claim.response;
      reference = idempotencyKey;
    }

    const finish = async (initiated: { payment_url: string; payment_event_id: string } | null): Promise<Response> => {
      if (!initiated) {
        return Response.json({ error: "internal_error", message: "An internal server error occurred" }, { status: 500 });
      }
      return Response.json({ payment_url: initiated.payment_url, payment_event_id: initiated.payment_event_id }, { status: 200 });
    };

    try {
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
      const response = await finish(initiated);
      if (idempotencyKey) await storeIdempotencyOutcome({ route: IDEMPOTENCY_ROUTES.driverWalletTopup, key: idempotencyKey }, response);
      return response;
    } catch (e: unknown) {
      if (errors.getErrorStatus(e) === 401) {
        return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
      }
      throw e;
    }

  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    logger.error("[driver/wallet/topup] error", err);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
