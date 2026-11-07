// [auth-required] POST /api/driver/dues/pay
//
// Unified settlement initiator (Item 18 / §3.4, OQ2). Commission dues are the
// default (backward compatible); an optional `bill_id` routes to a
// subscription_bill settlement whose amount and ownership are validated
// server-side before any PortPos invoice is created. The authoritative bill
// resolution (single open bill under the driver advisory lock) happens at the
// PortPos callback under lock per C-B2 (Item 19).
//
// Amounts are integer paisa everywhere (AGENTS.md). The requested amount can
// never exceed the driver's net dues, and the server — never the client —
// computes those dues.
import { z } from "zod";
import { db } from "@/src/db";
import { drivers, users, driverBills } from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { parseJsonBody } from "@/lib/parseBody";
import { getPlan05Bool } from "@/lib/platformConfig";
import { getDriverUnpaidObligations } from "@/lib/commissionDues";
import { initiatePortposPayment } from "@/lib/paymentEvents";
import { isConfigured } from "@/lib/portpos";
import {
  beginIdempotencyClaim,
  storeIdempotencyOutcome,
  extractIdempotencyKey,
  sha256Fingerprint,
  IDEMPOTENCY_ROUTES,
} from "@/lib/idempotency";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

/** ৳10 — smallest sensible hosted-checkout amount, integer paisa. */
const MIN_PAYMENT_BDT = 1_000;

const duesPaySchema = z
  .object({
    /** Optional partial payment in integer paisa; defaults to full net dues. */
    amount_bdt: z.number().int().positive().optional(),
    /** Optional subscription bill id to settle a specific open bill. */
    bill_id: z.string().uuid().optional(),
  })
  .strict();

/** Deterministic settlement idempotency key for a subscription bill (≤ 64 chars, fits varchar(64)). */
function subscriptionSettlementKey(billId: string): string {
  return `subscription_settlement_${billId}`; // 25 + 36 = 61 chars
}

export async function POST(originalRequest: Request) {
  try {
    if (!isConfigured()) {
      return Response.json(
        { error: "payment_not_configured", message: "PortPos payment gateway is not configured" },
        { status: 503 },
      );
    }

    const supabaseUser = await verifySupabaseToken(originalRequest);

    const [dbUser] = await db
      .select({ id: users.id, name: users.name, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!dbUser) {
      return Response.json({ error: "user_not_found", message: "User not found" }, { status: 404 });
    }

    const [driver] = await db
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, dbUser.id))
      .limit(1);
    if (!driver) {
      return Response.json({ error: "driver_not_found", message: "Driver not found" }, { status: 404 });
    }
    if (driver.status !== "active") {
      return Response.json(
        { error: "driver_not_active", message: "Only active drivers can settle commission dues" },
        { status: 403 },
      );
    }

    // D9-2: money-movement master switch (mirrors every other PortPos route).
    if (!(await getPlan05Bool("payments_enabled"))) {
      return Response.json(
        { error: "payments_not_enabled", message: "Payments launch later — dues settlement is not live yet" },
        { status: 409 },
      );
    }

    // Raw body is captured for the idempotency fingerprint BEFORE
    // parseJsonBody consumes the stream; Zod validation runs on a re-parse.
    const rawBody: string = await originalRequest.text();
    const bodyForParse = new Request("http://internal/parse", {
      method: "POST",
      body: rawBody,
      headers: { "content-type": "application/json" },
    });
    const parsed = await parseJsonBody(bodyForParse, duesPaySchema);
    if (!parsed.ok) return parsed.response;
    const { amount_bdt: requestedAmount, bill_id } = parsed.data;

    // Canonical owed figure from the view (server-side, never client-trusted).
    const obligations = await getDriverUnpaidObligations(db, driver.id);
    const totalUnpaid = obligations.totalUnpaidPaisa;

    // Resolve purpose + amount. bill_id → subscription_settlement for that
    // specific open bill (validated to belong to this driver below).
    // Otherwise → commission_settlement for the full view-driven total.
    let amountBdt: number;
    let purpose: 'commission_settlement' | 'subscription_settlement';
    let idempotencyKey: string | null = extractIdempotencyKey(originalRequest);

    if (bill_id) {
      const [bill] = await db
        .select({ id: driverBills.id, amount_bdt: driverBills.amount_bdt, status: driverBills.status, kind: driverBills.kind })
        .from(driverBills)
        .where(
          and(
            eq(driverBills.id, bill_id),
            eq(driverBills.driver_id, driver.id),
            eq(driverBills.kind, 'subscription_purchase'),
            eq(driverBills.status, 'open'),
          ),
        )
        .limit(1);
      if (!bill) {
        return Response.json(
          { error: "bill_not_found", message: "Open subscription bill not found for this driver" },
          { status: 404 },
        );
      }
      purpose = 'subscription_settlement';
      amountBdt = bill.amount_bdt;
      // Deterministic key for the bill — replays settle the same bill once.
      idempotencyKey = subscriptionSettlementKey(bill.id);
    } else {
      purpose = 'commission_settlement';
      amountBdt = requestedAmount ?? totalUnpaid;
    }

    if (amountBdt <= 0) {
      return Response.json(
        { error: "no_dues_outstanding", message: "No commission dues are outstanding" },
        { status: 400 },
      );
    }
    if (amountBdt > totalUnpaid) {
      return Response.json(
        {
          error: "amount_exceeds_dues",
          message: "Payment amount cannot exceed outstanding dues",
          total_unpaid_paisa: totalUnpaid,
        },
        { status: 400 },
      );
    }
    if (amountBdt < MIN_PAYMENT_BDT) {
      return Response.json(
        { error: "amount_below_minimum", message: "Minimum dues payment is BDT 10; dust rolls into the next payable settlement", minimum_bdt: MIN_PAYMENT_BDT },
        { status: 400 },
      );
    }

    // ── Idempotency-Key convention (decision 01M23628A1566SK1D5XXV1NT5G).
    // `driverDuesPay` is registered in IDEMPOTENCY_ROUTES (IR-A10). Present
    // key → (route, key) barrier with replay-or-conflict before any invoice
    // round-trip; absent → fresh server key (legacy behavior).
    let reference: string = crypto.randomUUID();
    if (idempotencyKey) {
      const claim = await beginIdempotencyClaim({
        route: IDEMPOTENCY_ROUTES.driverDuesPay,
        key: idempotencyKey,
        userId: dbUser.id,
        requestFingerprint: sha256Fingerprint("POST", rawBody),
      });
      if (claim.kind === "replay") return claim.response;
      if (claim.kind === "conflict") return claim.response;
      reference = idempotencyKey;
    }

    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";

    const finish = async (
      initiated: { payment_url: string; payment_event_id: string } | null,
    ): Promise<Response> => {
      if (!initiated) {
        return Response.json(
          { error: "internal_error", message: "An internal server error occurred" },
          { status: 500 },
        );
      }
      return Response.json(
        {
          payment_url: initiated.payment_url,
          payment_event_id: initiated.payment_event_id,
          amount_bdt: amountBdt,
          purpose,
        },
        { status: 200 },
      );
    };

    try {
      // payment_events writes are owned by lib/paymentEvents.ts (AGENTS.md).
      const initiated = await initiatePortposPayment({
        user_id: dbUser.id,
        driver_id: driver.id,
        idempotency_key: reference,
        amount_bdt: amountBdt,
        purpose,
        package_name: purpose === 'subscription_settlement' ? 'Subscription Bill' : 'Commission Dues',
        customer_name: dbUser.name,
        customer_email: dbUser.email ?? "",
        customer_phone: dbUser.phone,
        redirect_url: `${serverUrl}/payment/success`,
        ipn_url: `${serverUrl}/api/payment/portpos/callback`,
      });

      const response = await finish(initiated);
      if (idempotencyKey) {
        await storeIdempotencyOutcome(
          { route: IDEMPOTENCY_ROUTES.driverDuesPay, key: idempotencyKey },
          response,
        );
      }
      logger.info("[driver/dues/pay] dues invoice initiated", {
        driverId: driver.id,
        amountBdt,
        purpose,
        billId: bill_id ?? null,
        paymentEventId: initiated?.payment_event_id,
      });
      return response;
    } catch (e: unknown) {
      if (errors.getErrorStatus(e) === 401) {
        return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
      }
      throw e;
    }
  } catch (err: unknown) {
    if (errors.getErrorStatus(err) === 401) {
      return Response.json({ error: "unauthorized", message: "Authentication required" }, { status: 401 });
    }
    logger.error("[driver/dues/pay] error", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
