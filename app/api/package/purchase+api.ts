// [auth-required] Initiate package purchase via PortPos hosted checkout
// PortPos supports bKash, Nagad, Rocket, Visa, Mastercard, and more.
// Idempotency-Key header required — prevents double-charge

import { z } from "zod";
import { db } from "@/src/db";
import {
  packages,
  paymentEvents,
  users,
  drivers,
  subscriptions,
} from "@/src/db/schema";
import { eq, and } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { portposClient, isConfigured } from "@/lib/portpos";
import { logger } from "@/lib/logger";

const purchaseSchema = z
  .object({
    package_id: z.string().uuid(),
    provider: z.enum(["portpos"]),
  })
  .strict();

export async function POST(request: Request) {
  try {
    if (!isConfigured()) {
      return Response.json(
        {
          error: "payment_not_configured",
          message:
            "PortPos payment gateway is not configured. Set PORTPOS_APP_KEY and PORTPOS_SECRET_KEY env vars.",
        },
        { status: 503 },
      );
    }

    const supabaseUser = await verifySupabaseToken(request);

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.auth_uid, supabaseUser.id))
      .limit(1);
    if (!user)
      return Response.json({ error: "user_not_found" }, { status: 404 });

    const [driver] = await db
      .select({ id: drivers.id, status: drivers.status })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: "driver_not_found" }, { status: 404 });

    if (!["active", "temporary"].includes(driver.status)) {
      return Response.json(
        {
          error: "driver_status_invalid",
          message: "Driver must be active or temporary",
        },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_body", message: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { package_id } = parsed.data;

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (
      !idempotencyKey ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idempotencyKey,
      )
    ) {
      return Response.json(
        {
          error: "missing_idempotency_key",
          message: "Idempotency-Key header required (uuid v4)",
        },
        { status: 400 },
      );
    }

    const [pkg] = await db
      .select()
      .from(packages)
      .where(eq(packages.id, package_id))
      .limit(1);
    if (!pkg || !pkg.is_active) {
      return Response.json(
        {
          error: "package_not_found",
          message: "Package not found or inactive",
        },
        { status: 422 },
      );
    }

    const [activeSub] = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.driver_id, driver.id),
          eq(subscriptions.status, "active"),
        ),
      )
      .limit(1);
    if (activeSub) {
      return Response.json(
        {
          error: "active_subscription_exists",
          message: "Driver already has an active subscription",
        },
        { status: 409 },
      );
    }

    if (pkg.is_trial) {
      const [trialSub] = await db
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.driver_id, driver.id),
            eq(subscriptions.is_trial, true),
          ),
        )
        .limit(1);
      if (trialSub) {
        return Response.json(
          {
            error: "trial_already_used",
            message: "Driver has already used a trial package",
          },
          { status: 409 },
        );
      }
    }

    const [evt] = await db
      .insert(paymentEvents)
      .values({
        driver_id: driver.id,
        package_id: pkg.id,
        idempotency_key: idempotencyKey,
        provider: "portpos",
        amount_bdt: pkg.price_bdt,
        status: "initiated",
      })
      .onConflictDoNothing()
      .returning();

    if (!evt) {
      const [existing] = await db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.idempotency_key, idempotencyKey))
        .limit(1);
      if (existing) {
        return Response.json({
          payment_url: null,
          payment_event_id: existing.id,
        });
      }
    }

    // Create PortPos invoice — user picks bKash/Nagad/Rocket/card on PortPos's hosted checkout
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
    const { invoice_id, payment_url } = await portposClient.createInvoice({
      amount: pkg.price_bdt,
      reference: idempotencyKey,
      redirectUrl: `${serverUrl}/api/payment/portpos/callback`,
      ipnUrl: `${serverUrl}/api/payment/portpos/callback`,
      packageName: pkg.name,
      billing: {
        customer: { name: "Driver", email: "driver@ride.app", phone: "+880" },
        address: {
          street: "N/A",
          city: "Dhaka",
          state: "Dhaka",
          zipcode: "1200",
          country: "BD",
        },
      },
    });

    await db
      .update(paymentEvents)
      .set({
        provider_txn_id: invoice_id,
        status: "callback_pending",
      })
      .where(eq(paymentEvents.id, evt!.id));

    logger.info("[package/purchase] PortPos payment initiated", {
      paymentEventId: evt!.id,
      invoice_id,
      driverId: driver.id,
    });

    return Response.json({ payment_url, payment_event_id: evt!.id });
  } catch (e: any) {
    if (e.status === 401) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    logger.error("[package/purchase] error", e);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
