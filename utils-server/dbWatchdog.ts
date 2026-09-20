/**
 * dbWatchdog.ts — DB-reachability self-heal (ISSUE-62).
 *
 * Failure class the watchdog exists for (live-verified 2026-09-16): a
 * connection dies half-open (NAT/pooler teardown without FIN/RST) while a query
 * is in flight. Neither server-side `statement_timeout` nor TCP retransmission
 * saves the slot in useful time, so postgres.js's slot never returns and the
 * whole DB queue freezes while the HTTP layer (no DB) stays responsive. Manual
 * restart was the only workaround (~30–60 min lifetime).
 *
 * Self-heal = process exit (postgres.js `end()` is permanent — the pool does
 * NOT reconnect after an explicit end, so in-process pool surgery is not an
 * option). Exit is safe by design: production runs under a supervisor restart
 * policy, and scheduler job 20 already recovers stale dispatch offers after any
 * restart (TD-15 startup recovery).
 *
 * ── The probe MUST NOT share the application pool ────────────────────────────
 *
 * The original probe was `db.execute(sql\`select 1\`)` against the shared pool,
 * and that was a measurement of the WRONG THING. src/db/index.ts sets `max: 5`
 * for the entire process while the scheduler runs 58 jobs, so a probe could
 * spend its whole timeout merely WAITING FOR A FREE SLOT. Demonstrated
 * 2026-09-20 while the watchdog was declaring `db probe timeout after 10000ms —
 * queue wedge suspected` in a 55s restart loop:
 *
 *   - an INDEPENDENT client on the same DATABASE_URL answered `select 1` in
 *     144–233ms — consistently, across every window the watchdog called a wedge;
 *   - `pg_stat_activity` showed ZERO `idle in transaction` sessions — no
 *     server-side wedge, no leaked transaction, nothing to heal;
 *   - the scheduler's own jobs reported `outcome: 'ok'` right up to each kill.
 *
 * Each false exit restarted the WS server, dropping every connected device
 * socket (`Connection reset` on both test phones) and re-running heavy
 * scheduler startup recovery — which saturated the pool again and re-tripped
 * the probe. A self-sustaining loop: 24 restarts in one session, lifetimes
 * 38/54/56/57/75/75s, while the database was healthy throughout.
 *
 * The fix is ownership, not tuning: the probe now runs on its OWN postgres.js
 * client (`max: 1`, see dbProbe.ts) that application queries never touch. It is
 * therefore impossible for scheduler load to make the probe time out — a
 * failure can only mean the database is genuinely unreachable. That also lets
 * the timeout be derived from real DB behaviour instead of from pool capacity,
 * and lets the detection window return to the tight value ISSUE-62 asked for.
 *
 * Two further defects fixed in the same pass:
 *  1. OVERLAPPED PROBES inflated the count. `setInterval` fires every 10s
 *     regardless of whether the previous probe settled, so a single slow window
 *     could be counted as several "consecutive" failures. Probes are serialized
 *     (one in flight; a tick during an in-flight probe is skipped).
 *  2. TIMEOUT BELOW THE POOL'S OWN LIMITS. A 10s probe timeout was shorter than
 *     the pool's connect_timeout/statement_timeout (both 30s), so the probe
 *     could expire while the pool was still legitimately working. The dedicated
 *     probe has no queue wait to tolerate, so 15s now sits well ABOVE the
 *     honest worst case (cold connect ~5.8s, measured BD→Tokyo; healthy
 *     round-trip ~150ms).
 *
 * Timing: 10s interval × 15s probe timeout × 4 consecutive failures ⇒ a
 * timeout-shaped outage heals in ~75s (the 4th consecutive timeout lands at
 * ~75s because in-flight ticks are skipped). One failed probe never exits: a
 * pooler reconnect storm can exceed the probe timeout transiently, and
 * tolerance here costs only the time a real wedge has already cost.
 *
 * ── The dedicated probe alone was NOT enough (added 2026-09-20) ──────────────
 *
 * Fixing the probe's ownership solved the false positives but silently dropped
 * the signal this watchdog exists for. The header above describes the class as
 * "postgres.js's slot never returns and the whole DB queue freezes while the
 * HTTP layer stays responsive" — but a probe on its OWN connection cannot see
 * that, because the dedicated connection is precisely the one that still works.
 * The watchdog was left able to detect "the database is unreachable" and unable
 * to detect "our pool is frozen", so it never fired for the failure it was
 * built for.
 *
 * Live consequence, 2026-09-20: `/health` answered in 1.3ms while
 * `/internal/dispatch` never answered (its first await is `isDispatchPaused()`,
 * a `system_config` read), the scheduler stopped ticking entirely, and
 * `connected_riders` sat at 0 for over two hours. Nothing self-healed, because
 * nothing was watching the right thing.
 *
 * The two probes now discriminate: the DEDICATED probe says whether the
 * database is reachable, and the bounded APPLICATION-POOL probe
 * (probeAppPool, src/db/index.ts) says whether this process can still use it.
 * A pool timeout while the database is reachable can only mean frozen slots, so
 * that is healed in-process via recyclePool() — a fresh client — instead of
 * exiting. Exiting is reserved for genuine unreachability, where a restart
 * cannot help because the database itself is down.
 *
 * ── Heal on the FIRST pool timeout, above the pool's own limits ─────────────
 *
 * That in-process heal shipped in two shapes that both had to be corrected the
 * same day (live-verified 2026-09-20):
 *
 *  1. A CONSECUTIVE-COUNT THRESHOLD (4) on the pool signal. It cannot work,
 *     because probeAppPool cannot release the connection a timed-out probe
 *     abandoned — so every probe that tries again consumes another slot of the
 *     pool's five, and the watchdog deepens the freeze it is waiting to
 *     confirm. On the live server that read as scheduler job durations
 *     inflating 700ms → 11s across four consecutive ticks. The heal is now
 *     immediate; a false result IS the signal.
 *  2. A PROBE TIMEOUT (15s) BELOW THE POOL'S OWN LIMITS (connect_timeout and
 *     statement_timeout are both 30s). A probe that has to open a connection —
 *     routine, the pool's idle_timeout is 30s — could expire while the pool was
 *     healthy. Observed: 3 consecutive "frozen" errors in a process only 147
 *     seconds old, after which the pool answered again with no recycle having
 *     run. The bound is now 35s, above both limits, so exceeding it means no
 *     reply arrived rather than a reply still in flight.
 *
 * Exiting on unreachability keeps its separate 4-failure tolerance: a pooler
 * reconnect storm can exceed one probe timeout, and there the cost of waiting
 * is only time a real outage has already cost.
 */
import { getProbeClient } from "./dbProbe";
import { probeAppPool, recyclePool } from "../src/db";
import { logger } from "../lib/logger";

const PROBE_INTERVAL_MS = 10_000;
/**
 * 15s — chosen against the DATABASE's real behaviour, not the pool's capacity,
 * now that the probe holds its own connection and can never queue behind
 * scheduler jobs. Healthy round-trip is ~150ms; the measured worst-case cold
 * connect is ~5.8s (BD→Tokyo), so 15s is ~2.5× headroom. If this ever trips on
 * a healthy DB, the cause is a new blocking condition on the probe connection —
 * not pool contention (that class is structurally gone).
 */
const PROBE_TIMEOUT_MS = 15_000;
/**
 * Four consecutive failures ⇒ sustained unreachability, not a transient
 * reconnect. With serialized probes (10s apart, 15s timeout) this is ~75s of
 * continuous failure before self-exit — inside ISSUE-62's ~1-minute target and
 * far tighter than the 2.5-minute window the previous, contention-blinded probe
 * had to use to avoid firing on its own pool.
 */
const WEDGE_THRESHOLD = 4;
/**
 * Bound on the application-pool probe, in ms.
 *
 * MUST exceed the pool's own limits (`connect_timeout: 30s` and
 * `statement_timeout: 30s`, both set in src/db/index.ts), or the probe expires
 * while the pool is still working correctly. 15s did exactly that, live, on
 * 2026-09-20: 3 consecutive "application pool frozen" errors fired inside a
 * process that was only 147 seconds old, and the pool then recovered on its
 * own with no recycle — because what timed out was a probe that had to OPEN a
 * NEW CONNECTION (the pool is `idle_timeout: 30`, so reconnects are routine,
 * and a cold BD→Tokyo connect is measured at ~5.8s with much worse tails),
 * not a frozen slot. This is the same mistake the header records for the
 * dedicated probe ("TIMEOUT BELOW THE POOL'S OWN LIMITS"), reintroduced on the
 * application-pool path.
 *
 * 35s sits above both 30s limits, so a probe that exceeds it has genuinely
 * received no reply — the half-open class this watchdog exists for. No
 * consecutive-failure accumulation is needed on top of that: see the header
 * for why a second trying probe would consume another slot.
 */
const APP_POOL_PROBE_TIMEOUT_MS = 35_000;

/**
 * One end-to-end reachability probe on the DEDICATED probe connection.
 * Resolves on success, rejects on timeout/error.
 */
export async function probeDbOnce(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `db probe timeout after ${timeoutMs}ms — database unreachable (dedicated probe connection)`,
          ),
        ),
      timeoutMs,
    );
  });
  const query = getProbeClient()`select 1`;
  // If the timeout wins the race, the losing query's late rejection must not
  // hit the process-level unhandledRejection handler (noise on every probe
  // failure).
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
  // Tracks whether the previous tick found the application pool frozen, so the
  // recovery can be logged once instead of on every healthy tick. Deliberately
  // a boolean and not a count: the two signals mean opposite things (one is
  // "the database is gone", this one is "the database is fine and WE are
  // broken"), and a false pool probe is healed on the spot rather than
  // accumulated — every extra trying probe leaks another slot of the five the
  // pool has.
  let poolFrozen = false;
  // Serialization guard: without this, setInterval starts a new probe every
  // tick even when the previous one is still pending, so a single slow window
  // is counted as several "consecutive" failures (see header).
  let probeInFlight = false;
  logger.info("[db-watchdog] started", {
    intervalMs,
    probeTimeoutMs: PROBE_TIMEOUT_MS,
    wedgeThreshold: WEDGE_THRESHOLD,
    probeConnection: "dedicated (max: 1, cannot queue behind scheduler jobs)",
  });
  const timer = setInterval(() => {
    if (probeInFlight) {
      // Previous probe still pending — skip this tick rather than stacking a
      // concurrent probe that would double-count the same stall.
      return;
    }
    probeInFlight = true;
    probeDbOnce()
      .then(async () => {
        if (consecutiveFailures > 0) {
          logger.info("[db-watchdog] probe recovered", { consecutiveFailures });
        }
        consecutiveFailures = 0;

        // The database answered on the dedicated connection, so a timeout on
        // the application pool can only mean this process's own slots are
        // frozen — the half-open case in the header — not a down database.
        // Heal in-process: a recycle keeps every connected device socket, which
        // a supervisor restart would drop.
        if (await probeAppPool(APP_POOL_PROBE_TIMEOUT_MS)) {
          if (poolFrozen) {
            logger.info("[db-watchdog] application pool recovered", {
              note: "pool serves queries again",
            });
          }
          poolFrozen = false;
          return;
        }
        poolFrozen = true;
        logger.error("[db-watchdog] application pool frozen (database is reachable)", {
          probeTimeoutMs: APP_POOL_PROBE_TIMEOUT_MS,
          effect:
            "dispatch, scheduler ticks and rider/driver auth all park on DB access",
        });
        // Heal on the FIRST timeout, not after a threshold. The probe cannot
        // release the slot it abandoned (see the CONTRACT note on
        // probeAppPool), so each further trying probe would consume another of
        // the pool's five connections and deepen the freeze it is waiting to
        // confirm. recyclePool() is what releases the abandoned query.
        logger.error("[db-watchdog] recycling application pool", {
          note: "frozen slots are released by a fresh client; in-flight queries settle as errors",
        });
        await recyclePool();
      })
      .catch((e: Error) => {
        consecutiveFailures += 1;
        logger.error("[db-watchdog] probe failed", {
          consecutiveFailures,
          error: e.message,
        });
        if (consecutiveFailures >= WEDGE_THRESHOLD) {
          logger.error("[db-watchdog] database unreachable — exiting for supervisor restart", {
            consecutiveFailures,
            note: "restart is the ISSUE-62-approved self-heal; job 20 recovers stale offers",
          });
          // Short beat so the error log flushes before the process dies.
          setTimeout(() => process.exit(1), 150).unref?.();
        }
      })
      .finally(() => {
        probeInFlight = false;
      });
  }, intervalMs);
  timer.unref?.();
  return timer;
}
