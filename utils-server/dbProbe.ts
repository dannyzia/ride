/**
 * dbProbe.ts — the DB watchdog's DEDICATED probe connection (ISSUE-62).
 *
 * Why this module exists (root cause, live-verified 2026-09-20):
 *
 * The watchdog used to probe through the SHARED application pool
 * (`db.execute(sql\`select 1\`)` from ../src/db). That did not measure the
 * database — it measured this process's own pool capacity. src/db/index.ts
 * sets `max: 5` for the whole process while the scheduler runs 58 jobs, so
 * under normal load every slot can be busy and a probe spends its entire
 * timeout merely WAITING FOR A FREE SLOT.
 *
 * The result was a false-positive self-kill loop worse than the failure it was
 * built to heal:
 *   - `db probe timeout after 10000ms — queue wedge suspected` fired while an
 *     independent client on the same DATABASE_URL answered `select 1` in
 *     144–233ms, and `pg_stat_activity` showed ZERO `idle in transaction`
 *     sessions — no server-side wedge and no leaked transaction.
 *   - Each false exit restarted the WS server, dropping every connected device
 *     socket (`Connection reset` on both test phones), then re-ran heavy
 *     scheduler startup recovery — saturating the pool again and re-tripping
 *     the probe: a self-sustaining ~55s restart cycle (24 restarts in one
 *     session; observed lifetimes 38/54/56/57/75/75s) that made device testing
 *     impossible while the database stayed perfectly healthy.
 *
 * The fix is a SEPARATE postgres.js client with `max: 1`, never used for
 * application queries. A probe on this client can only fail because the
 * database itself is unreachable — not because sibling scheduler jobs hold the
 * app pool.
 *
 * Connection budget: `max: 1` here + 5 for the app pool + 5 for Metro's API
 * routes = 11, under the session-mode pooler's documented ceiling of ~15
 * connections across all clients (see the comment in src/db/index.ts).
 * `idle_timeout: 0` keeps this one slot reserved for the life of the process,
 * so the watchdog never has to race for a new connection mid-probe.
 */
import postgres from "postgres";

let probeClient: ReturnType<typeof postgres> | undefined;

/**
 * Lazily create (then reuse) the dedicated probe client.
 *
 * Deliberately never `end()`-ed: postgres.js `end()` is permanent and the
 * watchdog must survive pooler reconnects. The OS reclaims the connection when
 * the process exits.
 */
export function getProbeClient(): ReturnType<typeof postgres> {
  if (!probeClient) {
    const DATABASE_URL = process.env.DATABASE_URL;
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    probeClient = postgres(DATABASE_URL, {
      ssl: "require",
      // Required by the transaction-mode pooler (6543) and harmless on the
      // session pooler (5432); mirrors src/db/index.ts.
      prepare: false,
      // Exactly one connection, reserved for the watchdog. This is the entire
      // point of the module: scheduler work cannot occupy it.
      max: 1,
      // 0 = never release. A closed idle connection would reintroduce a cold
      // connect (worst case ~5.8s BD→Tokyo, measured) into the probe's budget.
      idle_timeout: 0,
      connect_timeout: 30,
      // Keep NAT/pooler mappings alive so a dead peer surfaces as an RST rather
      // than a half-open socket (same reasoning as src/db/index.ts). 15s is
      // ample for a probe whose healthy round-trip is ~150ms.
      keep_alive: 15,
      // No statement_timeout: the probe's own client-side race is the bound,
      // and a server-side cancel would mask a hung socket.
    });
  }
  return probeClient;
}
