// [auth-required] Initiate package purchase via PortPos hosted checkout
// PortPos supports bKash, Nagad, Rocket, Visa, Mastercard, and more.
// Idempotency-Key header required — prevents double-charge

import { z } from "zod";
import { parseJsonBody } from "@/lib/parseBody";
import { db } from "@/src/db";
import {
  packages,
  paymentEvents,
  users,
  drivers,
  subscriptions,
  fraudFlags,
  rides,
} from "@/src/db/schema";
import { eq, and, gte, inArray, sql } from "drizzle-orm";
import { verifySupabaseToken } from "@/lib/auth";
import { isConfigured } from "@/lib/portpos";
import { initiatePortposPayment, createZeroAmountPaymentEvent } from "@/lib/paymentEvents";
import { activateSubscription } from "@/lib/activateSubscription";
import {
  getFareFrameworkConfig,
  parseConfigNumber,
} from "@/lib/fareFrameworkConfig";
import { logger } from "@/lib/logger";
import * as errors from "@/lib/errors";

const purchaseSchema = z
  .object({
    package_id: z.string().uuid(),
    provider: z.enum(["portpos"]),
  })
  .strict();

/**
 * Package-purchase fraud gate: true when the driver has ANY fraud_flags row
 * with status='blocked', OR their trailing-30-day proximity-cancel rate
 * (driver-cancelled-within-200m ÷ (completed + driver-cancelled)) exceeds
 * cancel_rate_package_gate_pct (config, percent — 30 means 30%).
 * Strictly-greater comparison; a zero-ride denominator never blocks.
 */
async function checkPackageGate(driverId: string): Promise<boolean> {
  const [blockedFlag] = await db
    .select({ id: fraudFlags.id })
    .from(fraudFlags)
    .where(
      and(
        eq(fraudFlags.driver_id, driverId),
        eq(fraudFlags.status, "blocked"),
      ),
    )
    .limit(1);
  if (blockedFlag) return true;

  const cfg = await getFareFrameworkConfig(["cancel_rate_package_gate_pct"]);
  const gatePct = parseConfigNumber(cfg.cancel_rate_package_gate_pct, 30);

  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const [counts] = await db
    .select({
      completed: sql<number>`SUM(CASE WHEN ${rides.status} = 'completed' THEN 1 ELSE 0 END)`,
      driver_cancelled: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' AND ${rides.cancelled_by} = 'driver' THEN 1 ELSE 0 END)`,
      proximity_cancels: sql<number>`SUM(CASE WHEN ${rides.status} = 'cancelled' AND ${rides.driver_cancel_within_200m} THEN 1 ELSE 0 END)`,
    })
    .from(rides)
    .where(
      and(
        eq(rides.driver_id, driverId),
        gte(rides.created_at, cutoff),
        inArray(rides.status, ["completed", "cancelled"]),
      ),
    );

  const completed = Number(counts?.completed ?? 0);
  const driverCancelled = Number(counts?.driver_cancelled ?? 0);
  const proximityCancels = Number(counts?.proximity_cancels ?? 0);
  const denominator = completed + driverCancelled;
  if (denominator <= 0) return false;

  return proximityCancels / denominator > gatePct / 100;
}

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

    // ── Fare Framework fraud gate (Phase F/G) — pre-check before any
    // purchase processing. Blocks drivers with an active 'blocked' fraud
    // flag (dawdle/off-platform 3rd offense, admin review pending) or a
    // trailing-30-day proximity-cancel rate above
    // cancel_rate_package_gate_pct. Transaction-free reads.
    const gateBlocked = await checkPackageGate(driver.id);
    if (gateBlocked) {
      return Response.json(
        {
          error: "package_gate_blocked",
          message:
            "Your account requires review before purchasing. Contact support.",
        },
        { status: 403 },
      );
    }

    const parsed = await parseJsonBody(request, purchaseSchema);
    if (!parsed.ok) return parsed.response;
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

      // M-2: a trial is ৳0 — do NOT route it through the hosted gateway
      // (most gateways reject zero invoices; redirecting a new driver to a
      // checkout to "pay" nothing is a funnel wall). Create the payment_event
      // via the write owner (lib/paymentEvents.ts) and activate directly —
      // activateSubscription validates amount == price (0 == 0), creates the
      // subscription + initial_load ledger, and marks the event paid.
      if (pkg.price_bdt === 0) {
        const evt = await createZeroAmountPaymentEvent({
          driver_id: driver.id,
          package_id: pkg.id,
          idempotency_key: idempotencyKey,
          purpose: "driver_package",
        });
        await activateSubscription(evt.id);
        return Response.json({
          payment_url: null,
          payment_event_id: evt.id,
          activated: true,
        });
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
  } catch (e: unknown) {
    if (errors.getErrorStatus(e) === 401) {
      return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
    }
    logger.error("[package/purchase] error", e);
    return Response.json({ error: 'internal_error', message: 'An internal server error occurred' }, { status: 500 });
  }
}
