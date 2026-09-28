/**
 * **Purpose:**     One-time launch backfill (owner ruling 2026-09-27): grant the
 *                  "Launch Free" subscription to every ACTIVE driver lacking an
 *                  active subscription. STAGED — run ONCE at launch, exactly like
 *                  the RLS scripts. Do NOT execute during ordinary sessions.
 * **Owner:**       Coding model (this session) / Zia executes at launch.
 * **Status:**      STAGED (authored; execution deferred to launch bring-up)
 * **Source of truth:** lib/launchFreeSubscription.ts (grant path + backfill engine)
 * **Related (concrete paths):**
 *   - lib/launchFreeSubscription.ts — ensureLaunchFreePackage, runLaunchFreeBackfill,
 *     backfillExitCode (the M-2 exit-code contract lives THERE, tested there)
 *   - scripts/fleet-backfill.ts — the idempotent batch-backfill precedent
 *   - AGENTS.md § Write Ownership — payment_events/subscriptions/call_ledger invariants
 * **Last verified:** 2026-09-28, by coding model (M-2/M-3 fix, jest exit-code + race tests)
 * **How to update:** engine changes go in the lib; keep this shell thin. Append
 *                    launch-day counts to the round notes in maestro/COVERAGE-MANIFEST.md.
 *
 * Usage:  npx tsx scripts/launch-free-subscription.ts [--dry-run]
 *
 * Exit codes (backfillExitCode — M-2): 0 converged · 1 grant failure(s) ·
 * 2 incomplete (eligible drivers remain). The OLD tail did
 * `main().then(() => process.exit(0))`, which overrode the partial-failure
 * `process.exitCode = 1` — a half-failed launch day would have read as success.
 * The single exit now derives from the reported outcome, never overrides it.
 *
 * Idempotent: drivers already holding ANY active subscription are skipped, so
 * re-running converges (second run reports granted=0).
 */
import "./_load-env";
import { logger } from "../lib/logger";
import {
  backfillExitCode,
  ensureLaunchFreePackage,
  runLaunchFreeBackfill,
} from "../lib/launchFreeSubscription";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<number> {
  const counts = await runLaunchFreeBackfill({ dryRun: DRY_RUN });

  const plan = DRY_RUN ? { id: "(dry-run)" } : await ensureLaunchFreePackage();

  // Human-readable summary (the report IS the deliverable of the launch-day run).
  console.log(
    JSON.stringify(
      {
        dry_run: DRY_RUN,
        eligible: counts.eligible,
        granted: counts.granted,
        already_active: counts.alreadyActive,
        failed: counts.failed,
        still_eligible_after_run: counts.stillEligibleAfterRun,
        plan_id: plan.id,
      },
      null,
      2,
    ),
  );

  return backfillExitCode(counts);
}

// Force-exit is intentional (src/db's pool would keep the loop alive) — but the
// code is always the computed one. M-2: no unconditional exit anywhere.
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    logger.error("[launchFreeBackfill] fatal", { error: err });
    process.exit(1);
  });
