import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

/**
 * 2026-09-20 (ISSUE-62 follow-up) — the pool is now SWAPPABLE.
 *
 * The failure class this addresses, live-verified 2026-09-20: a connection dies
 * half-open (NAT/pooler teardown without FIN/RST) while a query is in flight.
 * Server-side `statement_timeout` (30s) fires, but the client never receives the
 * error, so postgres.js keeps that slot reserved forever. With `max: 5` the
 * slots drain one incident at a time until EVERY query queues behind a frozen
 * pool, while the HTTP layer (which needs no DB) keeps answering.
 *
 * Observed on the live server before this change: `/health` answered in 1.3ms
 * while `/internal/dispatch` never answered at all — its first await is
 * `isDispatchPaused()`, a plain read of `system_config`. That froze three
 * things at once, which is why they looked like separate bugs:
 *   - dispatch: `/internal/dispatch` parks, so `app/api/ride/request+api.ts`
 *     aborts its loopback POST 3×5s and logs "dispatch failed after 3 retries",
 *     leaving the ride `pending` with no terminal status (the zombie ride);
 *   - the scheduler: its DB jobs run inside `db.transaction()`, so every tick
 *     parks — including the stale-`pending` recovery that would have cleared
 *     those rides;
 *   - auth: `auth:hello` parks on its `users` lookup, so no rider or driver
 *     ever registers and `/health` reads `connected_riders: 0` indefinitely.
 *
 * `postgres.js`'s `end()` is permanent for the CLIENT it is called on, which is
 * why pool surgery was previously ruled out. It is not permanent for the
 * MODULE: a replacement client restores service, provided every caller reads
 * the current one. That is what the Proxy below guarantees, so `recyclePool()`
 * can heal the process without killing it (and without dropping every device
 * socket, which the supervisor-restart route costs).
 *
 * The application pool stays at `max: 5`; see the connection-budget note below.
 */
/**
 * The application pool's connection count, exported so the freeze check can ask
 * for exactly as many concurrent probes as the pool has slots — the freeze
 * question is "how many slots are still usable", which is only answerable
 * against the pool's real size.
 */
export const APP_POOL_SIZE = 5;

function createPool() {
  /**
   * Supabase pooler is in ap-northeast-1 (Tokyo). A cold connect from BD can
   * take ~5.8s under jitter (measured), so connect_timeout must be well above
   * that — 30s is safe (healthy connects complete in ~1.5s). max is kept small
   * because the session-mode pooler (port 5432) caps total connections at ~15
   * across ALL clients: with 2 long-running processes (Metro API + utils-server)
   * each holding `max` connections, 2*max must stay well under 15, so max=5.
   * (Switching DATABASE_URL to the transaction-mode pooler on port 6543 lifts
   * this ceiling entirely — then max can be raised. prepare:false is required
   * for transaction mode and is already set.)
   */
  const client = postgres(DATABASE_URL as string, {
    ssl: "require",
    prepare: false,
    max: APP_POOL_SIZE,
    // 300s, not 30s. The failure that freezes this pool is a RECONNECT that
    // never completes (2026-09-20: the app pool stopped serving for ~2h while
    // the dedicated probe answered in 144-233ms and fresh connects from another
    // process took ~1.4s). A hung reconnect leaves every query on that slot
    // queued behind it, and with `max: 5` the pool is gone. Churning the
    // connections is what creates those reconnects, and 58 scheduler jobs do
    // not query every connection every 30s — so the old value manufactured the
    // exposure. Warm connections are ALSO safer than idle ones here: with
    // keep_alive below, an idle socket is actively probed every 15s, so a dead
    // peer surfaces as an RST instead of sitting half-open.
    idle_timeout: 300,
    connect_timeout: 30,
    // Recycle connections every 30min to prevent stale pooler connections
    max_lifetime: 60 * 30,
    // ISSUE-62: keepalive every 15s (postgres.js default 60s is too slow for
    // the half-open failure class on the transaction pooler — a dead peer can
    // take ~12 min to detect with OS probe defaults, outliving the 30–60 min
    // wedge window). Probes keep NAT mappings alive and force RSTs onto dead
    // sockets quickly; the DB watchdog (utils-server/dbWatchdog.ts) remains
    // the self-heal backstop.
    keep_alive: 15,
    // Set statement_timeout to 30s so no query can hang forever (prevents
    // the 2-hour stuck UPDATE that blocked RLS migration).
    connection: {
      statement_timeout: 30000,
    },
  });
  return { client, db: drizzle(client, { schema }) };
}

type DrizzleDb = ReturnType<typeof createPool>["db"];

let pool = createPool();

/**
 * The application pool. A Proxy rather than the drizzle instance itself, so
 * `recyclePool()` can replace the underlying client and have every existing
 * importer (they all `import { db } from "../src/db"` and call `db.x()` at the
 * use site) transparently reach the fresh pool. Query builders are still
 * created by the real drizzle instance, so chaining and thenables are
 * untouched — only property lookup is forwarded, and bound methods are cached
 * per instance (see `boundMethods`).
 */
/**
 * Bound-method cache, keyed by the drizzle instance the bind was made against.
 *
 * Without it, `get` returned `value.bind(pool.db)` on EVERY property access — a
 * fresh closure per `db.select` call site access, and an unstable identity
 * (`db.select !== db.select`). Keying on the instance also makes the cache
 * self-invalidating across `recyclePool()`: a replacement client is a new
 * object, so it gets its own map and never yields a method bound to the dead
 * pool.
 */
const boundMethods = new WeakMap<object, Map<string | symbol, unknown>>();

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const instance = pool.db as unknown as Record<string | symbol, unknown>;
    const value = instance[prop];
    if (typeof value !== "function") return value;
    let cache = boundMethods.get(instance);
    if (!cache) {
      cache = new Map();
      boundMethods.set(instance, cache);
    }
    const cached = cache.get(prop);
    if (cached !== undefined) return cached;
    const bound = (value as (...a: unknown[]) => unknown).bind(pool.db);
    cache.set(prop, bound);
    return bound;
  },
});

/**
 * Result of an application-pool probe. The three outcomes mean OPPOSITE things
 * and must not be collapsed into one boolean — see the probe's doc comment.
 */
export type AppPoolProbeResult =
  | { ok: true }
  /** No reply within the bound. The only outcome that proves frozen slots. */
  | {
      ok: false;
      reason: "timeout";
      timeoutMs: number;    }
  /** The query REJECTED — it settled, so its slot was released. Not a freeze. */
  | { ok: false; reason: "error"; error: string };

/**
 * Liveness probe for the APPLICATION pool, bounded on the client side.
 *
 * Deliberately unlike `utils-server/dbProbe.ts`, which runs on its own
 * dedicated connection and therefore answers "is the DATABASE reachable?".
 * This one answers a different question — "can THIS POOL still serve a query?"
 * — because those two diverge in exactly the failure class above: the dedicated
 * probe keeps succeeding (the database is fine) while the app pool is frozen.
 *
 * ── A REJECTION IS NOT A FREEZE (added 2026-09-20, measured) ────────────────
 *
 * This probe previously resolved `false` for BOTH "no reply" and "the query
 * rejected", which made the watchdog unable to tell a frozen pool from a
 * healthy one that had merely lost a connection. The two are opposite signals:
 *
 *   - a TIMEOUT means the query never settled, so its connection is still
 *     reserved — genuine frozen slots, and the only case that warrants a
 *     recycle;
 *   - a REJECTION means the query SETTLED (with an error), so its slot was
 *     released and the pool is demonstrably serving. The transaction pooler
 *     reaping an idle backend produces exactly this on the next use.
 *
 * Measured live, 2026-09-20, with a 1 Hz probe of the same pool from outside
 * the process: at the instant the watchdog logged `application pool frozen`
 * (and then recycled), the pool was answering an equivalent query in 3-8 ms —
 * 35 consecutive successful samples across the full 35 s window the internal
 * probe spent waiting, and a 144 ms worst case across 224 samples. The pool was
 * never frozen; the watchdog was destroying a healthy one every ~58 s, and each
 * `recyclePool()` rejects that pool's in-flight queries with
 * CONNECTION_DESTROYED — which is what dropped the device WebSockets and made
 * rider/driver sessions die at the ~2-minute mark.
 *
 * CONTRACT — `{ ok: false, reason: "timeout" }` means "the caller must recycle
 * NOW", not "note it and re-check later". A timed-out probe cannot release its
 * own slot: the query it abandoned is still parked on one of only `max: 5`
 * connections, so an unhealed timeout is itself a slot leak. Counting timeouts
 * up to a threshold therefore makes the freeze worse with every tick — each
 * trying probe consumes another slot — which is why
 * `utils-server/dbWatchdog.ts` recycles on the FIRST timeout, and must NOT
 * recycle on `reason: "error"`.
 *
 * `recyclePool()` is what releases that parked query: the old client is torn
 * down with `timeout: 0`, so the abandoned probe settles as an error and its
 * connection goes with it.
 */
export async function probeAppPool(timeoutMs: number): Promise<AppPoolProbeResult> {
  const target = pool.db;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AppPoolProbeResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout", timeoutMs }), timeoutMs);
  });

  // The verdict query is the shape callers actually use: a drizzle builder read
  // of `system_config`, the same table the dispatch path reads first. A probe
  // must exercise the path that has to work.
  //
  // It MUST NOT be `execute(sql\`select 1\`)` — the shape this probe used until
  // 2026-09-20, and the whole cause of the recycle loop:
  //
  //   * that shape never settles on this pool (`executeShape: 'hung'` on every
  //     timeout the watchdog recorded), and
  //   * postgres.js keeps a connection reserved for a query that never settles,
  //     so EVERY 10s probe tick permanently burnt one of the pool's five
  //     connections. The pool therefore reached `0/5 probes settled` in ~50s, at
  //     which point the watchdog dutifully diagnosed "frozen" and recycled —
  //     giving the measured, endless ~58s recycle cadence. Each recycle rejected
  //     that pool's in-flight queries (CONNECTION_DESTROYED) and dropped every
  //     device WebSocket, which is what killed rider/driver sessions at the
  //     ~2-minute mark.
  //
  // The app's own queries never showed it because they use this builder path,
  // which kept working — proven by 35 consecutive 3-8ms reads taken from OUTSIDE
  // the process, one per second, across the entire 35s window the internal probe
  // spent waiting to be told the pool was frozen.
  const query = target
    .select()
    .from(schema.systemConfig)
    .limit(1)
    .then((): AppPoolProbeResult => ({ ok: true }))
    .catch(
      (e: Error): AppPoolProbeResult => ({
        ok: false,
        reason: "error",
        error: e?.message ?? String(e),
      }),
    );
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How much of the pool can still serve a query — the measurement a single
 * probe cannot make.
 *
 * Why this exists (live-measured 2026-09-20): a SINGLE timed-out probe does not
 * prove the pool is frozen. From outside the process, an equivalent read of the
 * same pool answered in 3–8ms on 35 consecutive 1 Hz samples spanning the exact
 * 35s window the internal probe spent waiting, and again at the instant the
 * watchdog logged `application pool frozen`. So at least one slot was serving
 * while at least one `select 1` never settled: the pool was PARTIALLY wedged,
 * and `recyclePool()` — which is all-or-nothing — turned a survivable
 * degradation into a total outage by rejecting the healthy connections'
 * in-flight queries (CONNECTION_DESTROYED) and dropping every device socket.
 *
 * This fires `attempts` probes concurrently (the caller passes the pool size)
 * and counts how many settle. Zero settled is the only outcome that proves the
 * pool has lost all capacity and must be recycled. postgres.js queues queries
 * that arrive while every connection is busy, so a pool with even one usable
 * slot still settles every probe — sequentially on that slot — which is
 * precisely the "still alive" state we must not destroy.
 */
export async function probeAppPoolCapacity(
  timeoutMs: number,
  attempts: number = APP_POOL_SIZE,
): Promise<{ settled: number; attempts: number }> {
  const results = await Promise.all(
    Array.from({ length: attempts }, () => probeAppPool(timeoutMs)),
  );
  return { settled: results.filter((r) => r.ok).length, attempts };
}

/**
 * Replace the application pool and force-close the old one.
 *
 * The new pool is installed BEFORE the old client is torn down, so callers that
 * arrive during a recycle are already being served by fresh sockets — the heal
 * is what restores service, not a subsequent restart.
 *
 * `end({ timeout: 0 })` means "do not wait for in-flight queries". Those queries
 * are exactly the ones holding the wedged slots, and they have already blown
 * their deadline (that is why we are here), so waiting on them would recreate
 * the hang. They settle as errors, which is the correct outcome: callers fail
 * fast and retry against the healthy pool instead of parking forever.
 *
 * EXPECT THIS IN THE LOGS AFTER A HEAL, and do not read it as the cause of the
 * freeze: postgres.js implements `end({ timeout })` as `setTimeout(destroy,
 * timeout*1000)` (node_modules/postgres/cjs/src/index.js:372), and `destroy`
 * terminates every connection of the old pool and rejects its queued queries
 * with `CONNECTION_DESTROYED` (same file, line 384-387). A burst of
 * `DrizzleQueryError: ... cause: write CONNECTION_DESTROYED` therefore means the
 * recycle just worked — the failures are the queries that were in flight when
 * it ran. Mistaking that burst for the fault itself sends the investigation to
 * the database, which was healthy throughout.
 */
export async function recyclePool(): Promise<void> {
  const dying = pool;
  pool = createPool();
  try {
    await dying.client.end({ timeout: 0 });
  } catch {
    // Already dead, or force-closed mid-teardown — nothing left to release.
  }
}
