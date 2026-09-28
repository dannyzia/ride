/**
 * **Purpose:**     Owner ruling (2026-09-27): every driver gets a FREE SUBSCRIPTION
 *                  at launch. Grants the seeded "Launch Free" package (code
 *                  `launch_free`, call_count -1 = unlimited, price ৳0) to a driver
 *                  idempotently — through the existing write-ownership chain only:
 *                  `lib/paymentEvents.ts#createZeroAmountPaymentEvent` (payment_events
 *                  row) then `lib/activateSubscription.ts` (subscriptions row +
 *                  call_ledger initial_load, amount 0 == price validated).
 * **Owner:**       Coding model (this session) — keep current with rulings in
 *                  `.kilo/plans/active-lanes.md` and AGENTS.md § Write Ownership.
 * **Status:**      ACTIVE
 * **Source of truth:** this file is the only grant path for launch_free.
 * **Related (concrete paths):**
 *   - app/api/register+api.ts — driver-path registration hook (new drivers)
 *   - scripts/launch-free-subscription.ts — one-time backfill (staged, run at launch)
 *   - lib/paymentEvents.ts — payment_events write owner (createZeroAmountPaymentEvent)
 *   - lib/activateSubscription.ts — subscriptions + call_ledger write owner
 *   - AGENTS.md § Write Ownership / § Idempotency-Key Convention — invariants
 * **Last verified:** 2026-09-27, by coding model (lint + tsc + targeted jest).
 * **How to update:** if the write-ownership chain changes, change ONLY this file's
 *                    calls — the registration hook and backfill must stay thin.
 */
import { db } from "../src/db";
import { packages, subscriptions } from "../src/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { createZeroAmountPaymentEvent } from "./paymentEvents";
import { activateSubscription } from "./activateSubscription";

export const LAUNCH_FREE_PACKAGE_CODE = "launch_free";
export const LAUNCH_FREE_PACKAGE_NAME = "Launch Free";

/**
 * Fetch the seeded launch_free plan row; create it if absent (admin-editable via
 * the existing plans CRUD afterwards). Unlimited = call_count -1 (the sentinel
 * dispatch/leadBilling already treat as unlimited), price ৳0.
 */
export async function ensureLaunchFreePackage(): Promise<{ id: string }> {
  const [existing] = await db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.name, LAUNCH_FREE_PACKAGE_NAME), isNull(packages.deleted_at)))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(packages)
    .values({
      name: LAUNCH_FREE_PACKAGE_NAME,
      call_count: -1,
      duration_days: 36500,
      price_bdt: 0,
      is_trial: false,
      daily_cap: 200,
    })
    .onConflictDoNothing()
    .returning({ id: packages.id });
  if (created) return created;

  // Concurrent creator won — re-read.
  const [row] = await db
    .select({ id: packages.id })
    .from(packages)
    .where(and(eq(packages.name, LAUNCH_FREE_PACKAGE_NAME), isNull(packages.deleted_at)))
    .limit(1);
  if (!row) throw new Error("launch_free_package_missing_after_upsert");
  return row;
}

/**
 * Idempotently grant launch_free to one driver. Skips (returns 'already_active')
 * when the driver holds ANY active subscription — the ruling's skip condition.
 * The grant itself is a ৳0 zero-amount payment event + activation, so the
 * payment_events/subscriptions/call_ledger write-ownership rules apply in full.
 */
export async function grantLaunchFreeIfEligible(params: {
  driver_id: string;
  idempotency_key: string;
}): Promise<{ outcome: "granted" | "already_active" }> {
  const { driver_id, idempotency_key } = params;

  // Idempotency barrier (ruling §2): a driver already holding any ACTIVE
  // subscription is skipped. The DB partial unique index subs_one_active_per_driver
  // is the race barrier; this check is the fast path.
  const [activeSub] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(and(eq(subscriptions.driver_id, driver_id), eq(subscriptions.status, "active")))
    .limit(1);
  if (activeSub) return { outcome: "already_active" };

  const plan = await ensureLaunchFreePackage();

  const evt = await createZeroAmountPaymentEvent({
    driver_id,
    package_id: plan.id,
    idempotency_key,
    purpose: "driver_package",
  });
  await activateSubscription(evt.id);

  logger.info("[launchFree] granted", { driver_id, payment_event_id: evt.id });
  return { outcome: "granted" };
}
