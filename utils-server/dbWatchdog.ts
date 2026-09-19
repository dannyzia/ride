/**
 * dbWatchdog.ts — ISSUE-62 (Supavisor transaction-pooler wedge) self-heal.
 *
 * Failure class (live-verified 2026-09-16): a connection dies half-open
 * (NAT/pooler teardown without FIN/RST) while a query is in flight. Neither
 * server-side `statement_timeout` nor TCP retransmission saves the slot in
 * useful time, so postgres.js's slot never returns and the whole DB queue
 * freezes while the HTTP layer (no DB) stays responsive. Manual restart was
 * the only workaround (~30–60 min lifetime).
 *
 * Why end-to-end probing (through the same drizzle/postgres.js pool) instead
 * of pool introspection: the wedge freezes internal pool state; the only
 * observable that tracks the actual failure is "can a trivial query complete
 * in bounded time right now".
 *
 * Self-heal = process exit (postgres.js `end()` is permanent — the pool does
 * NOT reconnect after an explicit end, so in-process pool surgery is not an
 * option). Exit is safe by design: dev runs under tsx watch (auto-restart),
 * production requires a supervisor restart policy, and scheduler job 20
 * already recovers stale dispatch offers after any restart (TD-15 startup
 * recovery).
 *
 * Timing: 10s interval × 10s probe timeout × 2 consecutive failures ⇒ wedge
 * detected and healed in ~20–30s (acceptance criterion 2 of ISSUE-62). One
 * failed probe alone never exits (a pooler reconnect storm can exceed the
 * probe timeout transiently — the pool's connect_timeout is 30s).
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { logger } from "../lib/logger";

const PROBE_INTERVAL_MS = 10_000;
// 10s — MUST exceed the worst-case cold connect (~5.8s measured BD→Tokyo per
// src/db/index.ts) or a healthy boot false-positives twice and exits. During
// a real wedge the interval (10s) equals the timeout, so probes overlap and
// each stalled probe counts — onset→exit ≈ 20–30s (ISSUE-62 criterion 2).
const PROBE_TIMEOUT_MS = 10_000;
/** Two consecutive failures ⇒ sustained freeze, not a transient blip. */
const WEDGE_THRESHOLD = 2;

/** One end-to-end pool probe. Resolves on success, rejects on timeout/error. */
export async function probeDbOnce(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`db probe timeout after ${timeoutMs}ms — queue wedge suspected`)),
      timeoutMs,
    );
  });
  const query = db.execute(sql`select 1`);
  // If the timeout wins the race, the losing query's late rejection must not
  // hit the process-level unhandledRejection handler (noise on every wedge).
  query.catch(() => {});
  try {
    await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start the watchdog. Returns the interval timer (clearInterval to stop in
 * tests). `timer.unref` is optional-called so jest's jsdom timers (no unref)
 * don't break the unit tests.
 */
export function startDbWatchdog(intervalMs: number = PROBE_INTERVAL_MS): NodeJS.Timeout {
  let consecutiveFailures = 0;
  logger.info("[db-watchdog] started", {
    intervalMs,
    probeTimeoutMs: PROBE_TIMEOUT_MS,
    wedgeThreshold: WEDGE_THRESHOLD,
  });
  const timer = setInterval(() => {
    probeDbOnce()
      .then(() => {
        if (consecutiveFailures > 0) {
          logger.info("[db-watchdog] probe recovered", { consecutiveFailures });
        }
        consecutiveFailures = 0;
      })
      .catch((e: Error) => {
        consecutiveFailures += 1;
        logger.error("[db-watchdog] probe failed", {
          consecutiveFailures,
          error: e.message,
        });
        if (consecutiveFailures >= WEDGE_THRESHOLD) {
          logger.error("[db-watchdog] DB queue wedged — exiting for supervisor restart", {
            consecutiveFailures,
            note: "restart is the ISSUE-62-approved self-heal; job 20 recovers stale offers",
          });
          // Short beat so the error log flushes before the process dies.
          setTimeout(() => process.exit(1), 150).unref?.();
        }
      });
  }, intervalMs);
  timer.unref?.();
  return timer;
}
