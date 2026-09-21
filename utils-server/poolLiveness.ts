/**
 * poolLiveness.ts — proof that the application pool is still DELIVERING work.
 *
 * Why this exists (measured live 2026-09-20):
 *
 * The watchdog's application-pool probe cannot get a slot when all five are
 * busy, and it has no way to tell that from a wedged pool: postgres.js simply
 * queues the probe. So a timed-out probe is a QUEUE-WAIT measurement, and at
 * `max: 5` against 58 scheduler jobs it times out routinely while the pool is
 * perfectly healthy. Measured on a live run: 4 `capacity: '0/5'` verdicts → 4
 * recycles → 522 CONNECTION_DESTROYED, while the SAME log recorded **1761
 * scheduler job completions in 733 seconds** (`job 53 tick { duration_ms: 734,
 * outcome: 'ok' }` and friends, ~2.4/second). Every recycle rejected the
 * in-flight queries of a pool that was completing jobs twice a second, and
 * dropped every connected device socket with them.
 *
 * The discriminator that actually separates the two states is whether the pool
 * has recently COMPLETED anything, not whether a new probe could get a slot:
 *
 *   - busy pool  → jobs finish (slowly); this timestamp stays fresh.
 *   - wedged pool → the pool's own work hangs; nothing settles, so the timestamp
 *     goes stale and the heal is justified.
 *
 * This costs no slots (unlike every probe-based signal) and it is fed by the
 * densest real consumer of the pool, so its staleness is meaningful rather than
 * an artifact of idleness. `utils-server/scheduler.ts` stamps it as each job
 * settles, whatever the outcome: an `ok`, a server-side cancel (`timeout`) and a
 * connection error all prove a round trip happened. A wedged slot produces none
 * of them, which is exactly why the class it guards against is invisible to a
 * probe that has to wait for capacity.
 */
let lastSettledAt = 0;

/**
 * Record that a query through the application pool settled (ok, cancelled or
 * errored — all three are round trips).
 */
export function markAppPoolWorkSettled(now: number = Date.now()): void {
  lastSettledAt = now;
}

/**
 * Milliseconds since the application pool last settled real work.
 *
 * `Infinity` when nothing has settled yet in this process: at boot that is
 * literal, and the watchdog's warm-up window covers the gap before the
 * scheduler's first completions.
 */
export function msSinceAppPoolWork(now: number = Date.now()): number {
  return lastSettledAt === 0 ? Number.POSITIVE_INFINITY : now - lastSettledAt;
}
