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
import { isConfigured } from "@/lib/portpos";
import { initiatePortposPayment } from "@/lib/paymentEvents";
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
      return Response.json({ error: 'user_not_found', message: 'User not found' }, { status: 404 });

    const [driver] = await db
      .select({
        id: drivers.id,
        status: drivers.status,
        vehicle_type: drivers.vehicle_type,
      })
      .from(drivers)
      .where(eq(drivers.user_id, user.id))
      .limit(1);
    if (!driver)
      return Response.json({ error: 'driver_not_found', message: 'Driver not found' }, { status: 404 });

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

    // Enforce vehicle-type restriction: if the package is scoped to a
    // specific vehicle type, the purchasing driver must match.
    if (pkg.vehicle_type !== null && pkg.vehicle_type !== driver.vehicle_type) {
      return Response.json(
        {
          error: "vehicle_type_mismatch",
          message: `This package is only available for ${pkg.vehicle_type} drivers`,
        },
        { status: 403 },
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

    // Create the payment_events row + PortPos invoice via the shared owner
    // (lib/paymentEvents.ts, see AGENTS.md). Idempotency-Key collision returns
    // null — replay the existing payment_event instead of a second invoice.
    const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
    const initiated = await initiatePortposPayment({
      driver_id: driver.id,
      package_id: pkg.id,
      idempotency_key: idempotencyKey,
      amount_bdt: pkg.price_bdt,
      purpose: "driver_package",
      package_name: pkg.name,
      customer_name: "Driver",
      customer_email: "driver@ride.app",
      customer_phone: "+880",
      redirect_url: `${serverUrl}/api/payment/portpos/callback`,
      ipn_url: `${serverUrl}/api/payment/portpos/callback`,
    }, { onConflictDoNothing: true });

    if (!initiated) {
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

    return Response.json({ payment_url: initiated!.payment_url, payment_event_id: initiated!.payment_event_id });
  } catch (e: any) {
    if (e.status === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error("[package/purchase] error", e);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
