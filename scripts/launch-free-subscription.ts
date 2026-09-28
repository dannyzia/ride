/**
 * **Purpose:**     One-time launch backfill (owner ruling 2026-09-27): grant the
 *                  "Launch Free" subscription to every ACTIVE driver lacking an
 *                  active subscription. STAGED — run ONCE at launch, exactly like
 *                  the RLS scripts. Do NOT execute during ordinary sessions.
 * **Owner:**       Coding model (this session) / Zia executes at launch.
 * **Status:**      STAGED (authored; execution deferred to launch bring-up)
 * **Source of truth:** lib/launchFreeSubscription.ts (the only grant path)
 * **Related (concrete paths):**
 *   - lib/launchFreeSubscription.ts — ensureLaunchFreePackage + grantLaunchFreeIfEligible
 *   - scripts/fleet-backfill.ts — the idempotent batch-backfill precedent
 *   - AGENTS.md § Write Ownership — payment_events/subscriptions/call_ledger invariants
 * **Last verified:** 2026-09-27, by coding model (tsc clean, dry-run math unit-tested)
 * **How to update:** run report is printed at the end; append launch-day counts to
 *                    the round notes in maestro/COVERAGE-MANIFEST.md.
 *
 * Usage:  npx tsx scripts/launch-free-subscription.ts [--dry-run]
 *
 * Idempotent: drivers already holding ANY active subscription are skipped, so
 * re-running converges (second run reports granted=0).
 */
import "./_load-env";
import { db } from "../src/db";
import { drivers, subscriptions } from "../src/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  grantLaunchFreeIfEligible,
  ensureLaunchFreePackage,
} from "../lib/launchFreeSubscription";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  // Eligible = ACTIVE drivers with no active subscription right now.
  const activeSubDriverIds = db
    .select({ id: subscriptions.driver_id })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));

  const eligible = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(and(eq(drivers.status, "active"), notInArray(drivers.id, activeSubDriverIds)));

  logger.info("[launchFreeBackfill] scan complete", {
    dryRun: DRY_RUN,
    eligibleCount: eligible.length,
  });

  let granted = 0;
  let alreadyActive = 0;
  let failed = 0;

  for (const driver of eligible) {
    if (DRY_RUN) {
      granted += 1;
      continue;
    }
    try {
      const result = await grantLaunchFreeIfEligible({
        driver_id: driver.id,
        idempotency_key: `launch_free_backfill_${driver.id}`,
      });
      if (result.outcome === "granted") granted += 1;
      else alreadyActive += 1;
    } catch (err) {
      failed += 1;
      logger.error("[launchFreeBackfill] grant failed", { driver_id: driver.id, error: err });
    }
  }

  // Re-scan for the convergence report (real run only).
  let stillEligible = -1;
  if (!DRY_RUN) {
    const remaining = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.status, "active"), notInArray(drivers.id, activeSubDriverIds)));
    stillEligible = remaining.length;
  }

  const plan = DRY_RUN ? { id: "(dry-run)" } : await ensureLaunchFreePackage();

  logger.info("[launchFreeBackfill] report", {
    dryRun: DRY_RUN,
    eligible: eligible.length,
    granted,
    alreadyActive,
    failed,
    stillEligibleAfterRun: stillEligible,
    planId: plan.id,
  });

  // Human-readable summary (the report IS the deliverable of the launch-day run).
  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        eligible: eligible.length,
        granted,
        already_active: alreadyActive,
        failed,
        still_eligible_after_run: stillEligible,
      },
      null,
      2,
    ),
  );

  if (failed > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("[launchFreeBackfill] fatal", { error: err });
    process.exit(1);
  });
