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
import { drivers, packages, subscriptions } from "../src/db/schema";
import { and, eq, isNull, notInArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { createZeroAmountPaymentEvent } from "./paymentEvents";
import { activateSubscription } from "./activateSubscription";

export const LAUNCH_FREE_PACKAGE_CODE = "launch_free";
export const LAUNCH_FREE_PACKAGE_NAME = "Launch Free";

/**
 * Fetch the seeded launch_free plan row; create it if absent (admin-editable via
 * the existing plans CRUD afterwards). Unlimited = call_count -1 (the sentinel
 * dispatch/leadBilling already treat as unlimited), price ৳0.
 *
 * M-3 (Prompt B audit): `packages.name` has NO unique constraint, so the old
 * `onConflictDoNothing()` here was a silent no-op — two concurrent creators
 * (e.g. two registrations racing on a cold DB) could each insert their own
 * "Launch Free" row. Serialized now with a transaction-scoped advisory lock
 * (same pattern as activateSubscription's U-4 guard) + an in-lock recheck, so
 * exactly one plan row can ever exist.
 */
export async function ensureLaunchFreePackage(): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('ensure_launch_free_package'))`,
    );
    // Recheck INSIDE the lock: the concurrent creator's row is committed and
    // visible here, so the loser reuses it instead of inserting a duplicate.
    const [existing] = await tx
      .select({ id: packages.id })
      .from(packages)
      .where(and(eq(packages.name, LAUNCH_FREE_PACKAGE_NAME), isNull(packages.deleted_at)))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(packages)
      .values({
        name: LAUNCH_FREE_PACKAGE_NAME,
        call_count: -1,
        duration_days: 36500,
        price_bdt: 0,
        is_trial: false,
        daily_cap: 200,
      })
      .returning({ id: packages.id });
    if (!created) throw new Error("launch_free_package_insert_failed");
    return created;
  });
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

// ── M-2 (Prompt B audit): backfill engine + exit-code contract ──────────────
// The STAGED script's old tail did `main().then(() => process.exit(0))`, which
// OVERRODE the partial-failure `process.exitCode = 1` set inside main() — a
// half-failed launch-day backfill would have exited 0 and read as success.
// The loop now lives HERE as a pure, testable function; the script is a thin
// shell whose single exit statement derives from the reported outcome.

export interface BackfillCounts {
  eligible: number;
  granted: number;
  alreadyActive: number;
  failed: number;
  /** -1 when the re-scan didn't run (dry-run). */
  stillEligibleAfterRun: number;
}

/**
 * The launch-day exit-code contract (M-2):
 *   0 = converged — no failures and nothing left eligible after the run
 *   1 = partial failure — at least one grant threw (operator must re-run)
 *   2 = incomplete — zero failures but drivers remain eligible (re-run needed;
 *       treated as non-success so schedulers/CI cannot read it as clean)
 */
export function backfillExitCode(counts: BackfillCounts): number {
  if (counts.failed > 0) return 1;
  if (counts.stillEligibleAfterRun > 0) return 2;
  return 0;
}

/**
 * Grant launch_free to every ACTIVE driver without an active subscription.
 * Idempotent (already-active drivers are skipped by grantLaunchFreeIfEligible);
 * re-running converges. Per-driver failures are counted, never thrown — the
 * caller decides the process exit code via backfillExitCode().
 */
export async function runLaunchFreeBackfill(options: {
  dryRun: boolean;
}): Promise<BackfillCounts> {
  const { dryRun } = options;

  const activeSubDriverIds = db
    .select({ id: subscriptions.driver_id })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));

  const eligible = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(and(eq(drivers.status, "active"), notInArray(drivers.id, activeSubDriverIds)));

  logger.info("[launchFreeBackfill] scan complete", {
    dryRun,
    eligibleCount: eligible.length,
  });

  const counts: BackfillCounts = {
    eligible: eligible.length,
    granted: 0,
    alreadyActive: 0,
    failed: 0,
    stillEligibleAfterRun: -1,
  };

  for (const driver of eligible) {
    if (dryRun) {
      counts.granted += 1;
      continue;
    }
    try {
      const result = await grantLaunchFreeIfEligible({
        driver_id: driver.id,
        idempotency_key: `launch_free_backfill_${driver.id}`,
      });
      if (result.outcome === "granted") counts.granted += 1;
      else counts.alreadyActive += 1;
    } catch (err) {
      counts.failed += 1;
      logger.error("[launchFreeBackfill] grant failed", { driver_id: driver.id, error: err });
    }
  }

  // Convergence re-scan (real run only).
  if (!dryRun) {
    const remaining = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.status, "active"), notInArray(drivers.id, activeSubDriverIds)));
    counts.stillEligibleAfterRun = remaining.length;
  }

  logger.info("[launchFreeBackfill] report", { dryRun, ...counts });
  return counts;
}
