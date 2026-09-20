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
    max: 5,
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
 * untouched — only property lookup is forwarded.
 */
export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const value = (pool.db as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(pool.db)
      : value;
  },
});

/**
 * Liveness probe for the APPLICATION pool, bounded on the client side.
 *
 * Deliberately unlike `utils-server/dbProbe.ts`, which runs on its own
 * dedicated connection and therefore answers "is the DATABASE reachable?".
 * This one answers a different question — "can THIS POOL still serve a query?"
 * — because those two diverge in exactly the failure class above: the dedicated
 * probe keeps succeeding (the database is fine) while the app pool is frozen.
 *
 * CONTRACT — `false` means "the caller must recycle NOW", not "note it and
 * re-check later". A timed-out probe cannot release its own slot: the query it
 * abandoned is still parked on one of only `max: 5` connections, so an
 * unhealed false result is itself a slot leak. Counting false results up to a
 * threshold therefore makes the freeze worse with every tick — each trying
 * probe consumes another slot — which is why `utils-server/dbWatchdog.ts`
 * recycles on the FIRST false instead of accumulating.
 *
 * `recyclePool()` is what releases that parked query: the old client is torn
 * down with `timeout: 0`, so the abandoned probe settles as an error and its
 * connection goes with it.
 */
export async function probeAppPool(timeoutMs: number): Promise<boolean> {
  const target = pool.db;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  const query = target
    .execute(sql`select 1 as ok`)
    .then(() => true)
    .catch(() => false);
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
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
