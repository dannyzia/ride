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
 *  3. IT COULD NOT TELL A REJECTION FROM A FREEZE (fixed 2026-09-20).
 *     `probeAppPool` resolved one `false` for both "no reply within the bound"
 *     and "the query rejected", so a single connection-level error was read as
 *     the frozen-slot class and healed by destroying the pool. The two are
 *     opposite signals: a timeout left its query parked on a slot, while a
 *     rejection SETTLED and released it — the transaction pooler reaping an
 *     idle backend produces exactly the latter on next use.
 *
 *     Measured live with a 1 Hz probe of the same pool from OUTSIDE the
 *     process: at the instant this watchdog logged `application pool frozen`
 *     (10:58:56 and 11:00:55), the pool answered an equivalent query in 8ms and
 *     3ms, and across the whole 35s window the internal probe spent waiting it
 *     returned 2–8ms on every one of 35 consecutive samples (144ms worst case
 *     over 224 samples). The pool was never frozen; this watchdog was recycling
 *     a healthy one every ~58s, and every `recyclePool()` rejects that pool's
 *     in-flight queries with CONNECTION_DESTROYED — the burst this file's
 *     sibling documents as "the heal working" — which is what dropped the
 *     device WebSockets and killed rider/driver sessions at the ~2-minute mark.
 *
 *     A rejection is now logged at WARN with its underlying error (previously
 *     swallowed) and leaves the pool alone.
 *
 *  4. A SINGLE TIMEOUT IS NOT A FREEZE EITHER (fixed 2026-09-20). After (3) was
 *     released, `probe rejected` appeared ZERO times across the next runs — so
 *     the recycles were genuine 35s timeouts, while the pool kept answering an
 *     equivalent read in 3-8ms throughout. The pool was PARTIALLY wedged: one
 *     connection never settled a `select 1` while the others served normally.
 *     Since `recyclePool()` is all-or-nothing, one dead connection was enough
 *     to destroy a working pool and drop every device socket.
 *
 *     The decision became capacity-based: a timed-out probe triggers
 *     `probeAppPoolCapacity`, and a recycle happens ONLY at `settled === 0`.
 *     The intent was right and the MECHANISM was self-defeating — see (5) and
 *     (6), which are the corrections.
 *
 *  5. THE CAPACITY CHECK WAS THE POOL'S LAST USER (fixed 2026-09-20). It asked
 *     the pool for as many concurrent probes as the pool has SLOTS
 *     (`attempts = APP_POOL_SIZE`), and `probeAppPool` cannot release the slot a
 *     timed-out probe abandoned. The check therefore reserved every connection
 *     for up to 35s, and the `0/5 probes settled` it then reported was produced
 *     by the probes themselves: a cold start or a scheduler burst — the pool
 *     legitimately busy for longer than the bound — is indistinguishable from a
 *     wedge to a probe that cannot get a slot. Measured on the live server the
 *     same day: 4 recycles and 4 of those verdicts in a 10-minute window, 522
 *     CONNECTION_DESTROYED, one of them 12s after start, on a pool that was
 *     serving real queries throughout.
 *
 *     The capacity step now costs ONE slot (`CAPACITY_PROBE_ATTEMPTS`). Its job
 *     is to REFUSE: when the pool serves that probe, the recycle is cancelled.
 *     A refusal also starts a cooldown, because the probe that timed out before
 *     it has already abandoned a slot and re-asking on the next tick would bleed
 *     the pool a slot at a time. The destroy-a-working-pool class described in
 *     (3) stays guarded, and a genuine total freeze still reaches
 *     `settled === 0`.
 *
 *  7. A PROBE WITH NO FREE SLOT MEASURES THE QUEUE, NOT THE POOL (fixed
 *     2026-09-20). Warming up after a deploy and cooling down after a recycle
 *     removed the boot recycle (12s → none) but NOT the mid-run ones: the next
 *     measured run still logged 4 `capacity: '0/5 probes settled'` verdicts, 4
 *     recycles and 411 CONNECTION_DESTROYED in 12 minutes — while the SAME log
 *     recorded 1761 scheduler job completions (`duration_ms: 734, outcome: 'ok'`
 *     and friends, ~2.4/second). The pool was completing two jobs a second while
 *     being destroyed for being frozen. That is the original wrong-measurement
 *     defect this file opens with, reintroduced on the application-pool path:
 *     with `max: 5` against 58 jobs, a probe that cannot get a slot simply
 *     waited. `probeAppPoolCapacity` at one slot cannot fix that by itself —
 *     the single probe also had nowhere to run.
 *
 *     The verdict now requires EVIDENCE OF SERVICE, not the absence of a free
 *     slot: the pool is only frozen when a probe cannot get a reply AND no work
 *     has settled through it for `APP_POOL_LIVENESS_WINDOW_MS`
 *     (utils-server/poolLiveness.ts, fed by every scheduler job settlement — ok,
 *     server-side cancel, or error, all of which are round trips). A busy pool
 *     keeps that clock fresh and is left alone; a wedged pool stops settling
 *     anything, goes stale, and is healed. The trade is deliberate: a genuine
 *     total freeze is now healed in ~2 minutes instead of ~35s, because the cost
 *     of the alternative is rejecting a working pool's in-flight work and
 *     dropping every device socket several times an hour.
 *
 *  6. TWO WINDOWS WHERE THE POOL IS NOT JUDGED AT ALL (fixed 2026-09-20). A
 *     cold start saturates five connections with 58 scheduler jobs and startup
 *     recovery, and a recycle leaves its own in-flight rejections and reconnect
 *     work behind. Both are times the pool is busy without being wedged, and the
 *     pre-fix watchdog recycled on exactly those (live: 12s after boot).
 *     `WATCHDOG_WARMUP_MS` after start and `RECYCLE_COOLDOWN_MS` after a recycle
 *     make that structurally impossible instead of improbable. Neither window
 *     gates the dedicated reachability probe: genuine unreachability still exits
 *     on the unchanged threshold.
 *
 * Exiting on unreachability keeps its separate 4-failure tolerance: a pooler
 * reconnect storm can exceed one probe timeout, and there the cost of waiting
 * is only time a real outage has already cost.
 */
import { getProbeClient } from "./dbProbe";
import { msSinceAppPoolWork } from "./poolLiveness";
import { probeAppPool, probeAppPoolCapacity, recyclePool } from "../src/db";
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
 * Slots the capacity confirmation may occupy — deliberately ONE, not
 * `APP_POOL_SIZE`.
 *
 * The step answers "can this pool still serve a query at all?", so it must not
 * be what removes the pool's ability to serve. At full width it did exactly
 * that: `probeAppPool` cannot release the slot a timed-out probe abandoned, so
 * five concurrent probes reserved all five connections for up to 35s and the
 * `0/5 probes settled` they reported was their own footprint (live measurement
 * in the header, item 5). One slot answers the same question honestly – if the
 * pool is merely saturated or partially wedged, postgres.js queues this probe
 * onto whatever slot is free and it settles, which is the refusal this step
 * exists to produce.
 */
export const CAPACITY_PROBE_ATTEMPTS = 1;

/**
 * No application-pool verdict for this long after start.
 *
 * A cold start is a burst by construction: 58 scheduler jobs and startup
 * recovery open at once against five connections, so the pool is saturated for
 * longer than any probe bound while being perfectly healthy. The pre-fix
 * watchdog recycled on that burst 12s after boot (live 2026-09-20). Reachability
 * is still watched throughout – this window suppresses only the pool verdict.
 */
export const WATCHDOG_WARMUP_MS = 120_000;

/**
 * No application-pool verdict for this long after a recycle.
 *
 * A recycle rejects that pool's in-flight queries (CONNECTION_DESTROYED), those
 * callers retry, and the fresh client reconnects — work that makes a newly
 * recycled pool look busy for a while. Judging it inside that window is what
 * produced chained recycles (4 in 10 minutes, live 2026-09-20).
 */
export const RECYCLE_COOLDOWN_MS = 120_000;

/**
 * After a REFUSED verdict (the pool timed out, then served the capacity probe),
 * wait this long before judging the pool again.
 *
 * Each timed-out probe leaves a slot abandoned until something recycles the
 * pool, so re-asking on the next tick would bleed the pool one slot at a time –
 * the defect the watchdog exists to heal, performed slowly by the watchdog
 * itself. A partial wedge is logged and then left alone for a while.
 */
export const PARTIAL_WEDGE_COOLDOWN_MS = 60_000;

/**
 * How recently the pool must have settled real work for a no-free-slot probe to
 * be treated as load rather than a freeze.
 *
 * 60s is set against a measured feed rate, not a guess: the live server logged
 * 1761 scheduler job settlements in 733s (~2.4/s), so a healthy pool misses
 * roughly 145 settlements inside this window before the clock could look stale.
 * The window only ever makes the watchdog MORE reluctant to recycle, so a
 * generous value costs heal latency and never a false positive — the opposite of
 * the trade that produced 4 recycles in 12 minutes on a pool completing work.
 */
export const APP_POOL_LIVENESS_WINDOW_MS = 60_000;
/**
 * The ONLY probe outcome that triggers a recycle is `reason: "timeout"`.
 *
 * A rejected probe is deliberately excluded (see the branch in `startDbWatchdog`
 * and the `ProbeAppPoolResult` doc in src/db/index.ts). Collapsing the two into
 * one boolean is what made this watchdog recycle a healthy pool every ~58s on
 * 2026-09-20, live-measured at 3-8ms of real pool latency during every window
 * it called "frozen". A rejection has already released its slot, so it cannot
 * be the frozen-slot class this heal exists for; a genuine freeze still
 * produces a timeout on this or a later tick and heals then.

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
  // Warm-up / cooldown bookkeeping (header items 5 and 6). Both windows exist so
  // that a pool which is demonstrably busy-but-working cannot be read as wedged.
  const startedAt = Date.now();
  let lastRecycleAt = 0;
  let poolProbeCooldownUntil = 0;
  logger.info("[db-watchdog] started", {
    intervalMs,
    probeTimeoutMs: PROBE_TIMEOUT_MS,
    wedgeThreshold: WEDGE_THRESHOLD,
    probeConnection: "dedicated (max: 1, cannot queue behind scheduler jobs)",
    // Surfaced so a reader can tell why no pool verdict appears for the first
    // two minutes after a deploy, and after any recycle.
    appPoolWarmupMs: WATCHDOG_WARMUP_MS,
    recycleCooldownMs: RECYCLE_COOLDOWN_MS,
    capacityProbeAttempts: CAPACITY_PROBE_ATTEMPTS,
    appPoolLivenessWindowMs: APP_POOL_LIVENESS_WINDOW_MS,
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

        // ── Warm-up / cooldown: the pool is not judged inside these windows ──
        // A cold start and the moments after a recycle are both periods when
        // five connections are legitimately saturated (58 scheduler jobs,
        // startup recovery, retries from the queries a recycle just rejected).
        // They are also exactly what a wedged pool looks like to a probe, so
        // the verdict is withheld rather than guessed at. Deliberately placed
        // AFTER the reachability verdict above: unreachability is still
        // detected and still exits on its unchanged threshold.
        const now = Date.now();
        if (now - startedAt < WATCHDOG_WARMUP_MS) {
          poolFrozen = false;
          return;
        }
        if (now - lastRecycleAt < RECYCLE_COOLDOWN_MS || now < poolProbeCooldownUntil) {
          return;
        }

        // The database answered on the dedicated connection, so a failure on
        // the application pool can only concern this process's own slots — the
        // half-open case in the header — not a down database.
        // Heal in-process: a recycle keeps every connected device socket, which
        // a supervisor restart would drop.
        const poolProbe = await probeAppPool(APP_POOL_PROBE_TIMEOUT_MS);
        if (poolProbe.ok) {
          if (poolFrozen) {
            logger.info("[db-watchdog] application pool recovered", {
              note: "pool serves queries again",
            });
          }
          poolFrozen = false;
          return;
        }

        // A REJECTION is not a freeze. The query settled (with an error), so
        // its slot was released and the pool is demonstrably serving — the
        // pooler reaping an idle backend produces exactly this on next use.
        // Recycling here would destroy a HEALTHY pool: the recycle rejects
        // that pool's in-flight queries (CONNECTION_DESTROYED) and drops every
        // device WebSocket. Measured live 2026-09-20 — the watchdog logged
        // `frozen` and recycled every ~58s while the pool answered in 3-8ms
        // throughout, which is what killed the phone sessions. Only a TIMEOUT
        // means slots are still reserved, so only a timeout heals.
        if (poolProbe.reason === "error") {
          logger.warn("[db-watchdog] application-pool probe rejected — pool is serving, not frozen", {
            error: poolProbe.error,
            note: "a released slot is not a frozen one; no recycle (a timeout on a later tick still heals a real freeze)",
          });
          return;
        }

        // A SINGLE timeout does not prove the pool is frozen — measured live
        // 2026-09-20, the pool answered an equivalent query in 3-8ms on 35
        // consecutive samples across the whole window this probe spent waiting.
        // The pool was PARTIALLY wedged (one connection never settled while the
        // others served), and recycling is all-or-nothing: it rejected the
        // healthy connections' in-flight queries and dropped every device
        // socket. So ask the pool directly how much capacity it still has, and
        // destroy it only when it has none.
        const capacity = await probeAppPoolCapacity(
          APP_POOL_PROBE_TIMEOUT_MS,
          CAPACITY_PROBE_ATTEMPTS,
        );
        if (capacity.settled > 0) {
          poolFrozen = false;
          // The pool served this probe, so it is NOT frozen — refuse the recycle
          // and back off before asking again. The probe above already abandoned
          // one slot, so a verdict every tick would bleed the pool toward a real
          // freeze.
          poolProbeCooldownUntil = Date.now() + PARTIAL_WEDGE_COOLDOWN_MS;
          logger.warn("[db-watchdog] application pool partially wedged — still serving, NOT recycled", {
            settled: capacity.settled,
            attempts: capacity.attempts,
            note: "some connection never settles; the others still serve, so a recycle would kill a working pool",
          });
          return;
        }

        // Capacity is exhausted — but a probe with nowhere to run measures the
        // QUEUE, not the pool. So the verdict also requires that the pool has
        // stopped DELIVERING: if real work settled recently, this is load and
        // the pool must be left alone. Measured live 2026-09-20: 4 such verdicts
        // and 4 recycles inside 12 minutes, against 1761 scheduler job
        // completions in the same log, on the pool being recycled.
        const sinceLastSettledMs = msSinceAppPoolWork();
        if (sinceLastSettledMs < APP_POOL_LIVENESS_WINDOW_MS) {
          poolFrozen = false;
          poolProbeCooldownUntil = Date.now() + PARTIAL_WEDGE_COOLDOWN_MS;
          logger.warn(
            "[db-watchdog] no free slot for the pool probe, but the pool is delivering work — NOT recycled",
            {
              sinceLastSettledMs,
              livenessWindowMs: APP_POOL_LIVENESS_WINDOW_MS,
              capacity: `${capacity.settled}/${capacity.attempts} probes settled`,
              note: "only a pool that has stopped settling work is frozen; a probe that cannot get a slot measures the queue",
            },
          );
          return;
        }

        poolFrozen = true;
        logger.error("[db-watchdog] application pool frozen (database is reachable)", {
          probeTimeoutMs: APP_POOL_PROBE_TIMEOUT_MS,
          capacity: `${capacity.settled}/${capacity.attempts} probes settled`,
          // null = nothing has settled since this process started.
          sinceLastSettledMs: Number.isFinite(sinceLastSettledMs) ? sinceLastSettledMs : null,
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
        // Start the post-recycle cooldown, and clear any partial-wedge cooldown:
        // the fresh client makes that earlier verdict moot.
        lastRecycleAt = Date.now();
        poolProbeCooldownUntil = 0;
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
