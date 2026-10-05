/**
 * U-4 concurrency harness — proves the `activateSubscription` advisory lock
 * ACTUALLY SERIALIZES concurrent activations for the same driver.
 *
 * Why this is not the same as the mocked unit lanes
 * (tests/api/package/purchase-gate.test.ts, tests/api/rider/passes.test.ts,
 * lib/__tests__/portposCallback.test.ts, …): those mock `db`, so they pin the
 * SHAPE of the transaction and nothing about Postgres. `pg_advisory_xact_lock`
 * is a server-side primitive — a mock, a Redis, or an in-process mutex would
 * prove nothing about whether two real connections serialize. The U-4 bug
 * class this guards — two activations for the same driver racing past the
 * initiation gate (two purchases, or purchase + compensation-repair overlap) —
 * is precisely a bug that a mocked `db` cannot see and that a real server is
 * the only thing that can settle.
 *
 * TARGET — a scratch DATABASE on the same cluster, never the shared dev tables.
 * `DATABASE_URL` points at a shared Supabase dev database through the Supavisor
 * transaction pooler, and the production function is schema-UNQUALIFIED
 * (`payment_events`, `subscriptions`, …). A scratch SCHEMA does not work here:
 * transaction-mode pooling discards session state between transactions, so
 * `SET search_path` is reverted before the next statement (verified live for
 * the sibling M-3 harness). A scratch DATABASE is routed correctly by the
 * pooler, so that is what this file creates and drops. The shared
 * `subscriptions` / `payment_events` / `call_ledger` / `credit_vouchers` tables
 * are never written to.
 *
 * The scratch tables are built from the LIVE catalogue (columns, enum types,
 * defaults, primary keys and non-primary indexes), so a future schema change
 * cannot silently break this harness, and `subs_one_active_per_driver`
 * (migration 0000) exists in the scratch DB exactly as it does on the shared
 * database — that is what makes the negative control measure the real
 * constraint. FOREIGN KEYS ARE DELIBERATELY OMITTED: the U-4 class is enforced
 * by the partial unique index + advisory lock, FKs are unchanged by
 * concurrency, and copying them would drag in drivers/users/rides and every
 * table they reference for zero added proof.
 *
 * PROOFS (each fails if the lock line is removed from
 * lib/activateSubscription.ts):
 *   1. BLOCKING — a concurrent activation is observed BLOCKED ON THE ADVISORY
 *      LOCK while another session holds it: an ungranted advisory waiter in
 *      `pg_locks` and a backend parked in `pg_stat_activity` on
 *      `wait_event = 'advisory'`. After the holder commits, the contender
 *      EXPIRES the holder's active row and becomes the sole active subscription
 *      for the driver, WITHOUT a 23505 — that is the U-4 fix itself: the later
 *      purchase supersedes the earlier one instead of rolling back and dooming
 *      the payment into the compensation retry loop (Z-2/Z-3 class).
 *   2. NEGATIVE CONTROL — the same expire + insert transaction MINUS the lock,
 *      run against a `pg_sleep` trigger that widens the window, is REJECTED by
 *      `subs_one_active_per_driver`: every unlocked creator passes the expire
 *      step, all reach the insert, and Postgres refuses all but one with 23505.
 *      This is the defense-in-depth claim — delete the advisory lock and the
 *      invariant still holds, because it now lives in the schema. The scratch
 *      table is built from the live catalogue (columns AND indexes), so this
 *      proves the real constraint and not an artefact of the harness.
 *
 * FAULT-INJECTION RESULT (2026-10-04, live, lock line deleted from
 * lib/activateSubscription.ts): proof 1 FAILED as designed — after the full
 * 15s poll the advisory-waiter query saw `waiters = 0` (the contender was
 * parked on the unique index instead, and surfaced 23505 duplicate key
 * `subs_one_active_per_driver` once the holder committed), so the blocking
 * observation is this harness's deterministic detector of a missing lock.
 * Proof 2 (negative control) PASSED on the same broken lib — it does not
 * depend on the lock; the schema backstop held. Live green with the lock
 * present: proof 1 6.4s, proof 2 4.1s.
 *
 * Usage:
 *   RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false
 * DATABASE_URL comes from the process environment in CI, or .env.local locally
 * (scripts/_load-env.ts fills it from .env.local only when unset).
 * CI: the `concurrency-locks` job (.github/workflows/ci.yml) runs this lane on
 * every PR against a disposable `postgres:16` service container. The default
 * `test` job still SKIPS it (RUN_CONCURRENCY_TESTS unset) — pinned by
 * tests/meta/concurrency-gate.test.ts.
 * LOCAL RUNS: never point this at the shared dev project — provision the
 * throwaway project with `node scripts/concurrency-scratch-project.mjs` and run
 * with its SCRATCH_DATABASE_URL (see .env.scratch.local) — the harness prefers
 * SCRATCH_DATABASE_URL and refuses to run without it
 * (tests/concurrency/scratch-db-url.ts).
 *
 * @jest-environment node
 * @jest-environment-options {"customExportConditions": ["node"]}
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";
import { requireScratchDbUrl } from "./scratch-db-url";
import { randomUUID } from "crypto";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const COND = RUN ? describe : describe.skip;
// Preference rule (tests/concurrency/scratch-db-url.ts): a set
// SCRATCH_DATABASE_URL wins outright over DATABASE_URL. The fallback is
// unreachable past the requireScratchDbUrl() guard in beforeAll; the binding
// stays non-throwing at module scope so a default-suite run still SKIPs.
const DB_URL = process.env.SCRATCH_DATABASE_URL || process.env.DATABASE_URL;

const SCRATCH_DB = "activate_sub_lock_test";
const PLAN_PRICE_BDT = 50000; // integer paisa; must equal pkg.price_bdt
const PLAN_CALLS = 100;

/** Concurrent control creators. The app pool is APP_POOL_SIZE (5), so 4 leaves headroom. */
const N_CREATORS = 4;
/**
 * How long proof 1 waits for the contender to actually REACH the lock
 * statement. It must stay well under the app pool's `statement_timeout` (30s,
 * src/db/index.ts) or the blocked query is cancelled instead of observed.
 * Polling (rather than a fixed sleep) is what makes proof 1 non-vacuous: a
 * contender that is merely slow to start has not been blocked by anything, and
 * a sleep could not tell those two cases apart.
 */
const BLOCK_WAIT_DEADLINE_MS = 15000;
const POLL_INTERVAL_MS = 50;
/** Per-test budget; every case crosses the network twice (pooler round-trips). */
const CASE_TIMEOUT_MS = 60000;

/**
 * The five tables the production transaction touches, in creation order
 * (no FKs — see header): packages must exist before subscriptions references
 * it, but without FKs the order only matters for readability.
 */
const TABLES = ["packages", "subscriptions", "payment_events", "call_ledger", "credit_vouchers"];

/** The production function under test, bound after DATABASE_URL is redirected. */
type ActivateSubscription = (paymentEventId: string) => Promise<{ subscriptionId: string }>;

let admin: ReturnType<typeof postgresTag>;
/** Observer/control pool on the scratch DB. Never holds the lock while queried. */
let scratch: ReturnType<typeof postgresTag>;
/** Dedicated holder for proof 1, so inspecting pg_locks cannot deadlock it. */
let holder: ReturnType<typeof postgresTag>;
let activateSubscription!: ActivateSubscription;
let packageId = "";

/** The scratch database's connection URL: same cluster, different database. */
function scratchUrl(): string {
  const u = new URL(DB_URL!);
  u.pathname = `/${SCRATCH_DB}`;
  return u.toString();
}

/**
 * Build the scratch DDL for every table in TABLES from the LIVE catalogue:
 * columns, enum types, defaults, NOT NULL, primary keys, and non-primary
 * indexes. Derived rather than hand-written on purpose — a hand-written subset
 * fails the moment a drizzle `select()` asks for a column the harness forgot,
 * and a hand-written index list could miss the very constraint the negative
 * control exists to measure.
 */
async function tablesDdl(): Promise<string> {
  type Col = {
    column_name: string;
    udt_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
  };

  const enums = new Map<string, string[]>();
  const statements: string[] = [];

  for (const table of TABLES) {
    const cols = (await admin.unsafe(
      `
      SELECT column_name, udt_name, data_type, is_nullable, column_default,
             character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    )) as unknown as Col[];

    // Enum types the table depends on, recreated by name so the scratch table
    // has the identical type rather than a text stand-in.
    const enumRows = (await admin.unsafe(
      `
      SELECT t.typname, e.enumlabel
        FROM information_schema.columns c
        JOIN pg_type t ON t.typname = c.udt_name
        JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE c.table_schema = 'public' AND c.table_name = $1
         AND c.data_type = 'USER-DEFINED'
       ORDER BY t.typname, e.enumsortorder`,
      [table],
    )) as unknown as { typname: string; enumlabel: string }[];
    for (const r of enumRows) {
      const list = enums.get(r.typname) ?? [];
      list.push(`'${r.enumlabel}'`);
      enums.set(r.typname, list);
    }

    const pk = (await admin.unsafe(
      `
      SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary
       ORDER BY array_position(i.indkey, a.attnum)`,
      [`public.${table}`],
    )) as unknown as { attname: string }[];

    const sqlType = (c: Col): string => {
      if (c.data_type === "USER-DEFINED") return c.udt_name;
      if (c.data_type === "character varying")
        return `varchar(${c.character_maximum_length ?? 255})`;
      if (c.data_type === "timestamp with time zone") return "timestamptz";
      if (c.data_type === "integer") return "integer";
      if (c.data_type === "boolean") return "boolean";
      if (c.data_type === "uuid") return "uuid";
      if (c.data_type === "numeric")
        return c.numeric_precision === null
          ? "numeric"
          : `numeric(${c.numeric_precision},${c.numeric_scale ?? 0})`;
      return c.udt_name;
    };

    const defs = cols.map((c) => {
      const parts = [`"${c.column_name}"`, sqlType(c)];
      if (c.column_default !== null) parts.push(`DEFAULT ${c.column_default}`);
      if (c.is_nullable === "NO") parts.push("NOT NULL");
      return parts.join(" ");
    });
    if (pk.length > 0) {
      defs.push(`PRIMARY KEY (${pk.map((r) => `"${r.attname}"`).join(", ")})`);
    }
    statements.push(`CREATE TABLE ${table} (\n  ${defs.join(",\n  ")}\n);`);

    // Indexes too, not just columns. Without this the scratch table would lack
    // subs_one_active_per_driver and the negative control below would prove
    // nothing — it would be asserting a backstop the harness never installed.
    // The primary key is skipped: it is already emitted as a table constraint.
    const indexes = (await admin.unsafe(
      `
      SELECT i.indexdef
        FROM pg_indexes i
        JOIN pg_class ic ON ic.relname = i.indexname
        JOIN pg_index x ON x.indexrelid = ic.oid
       WHERE i.schemaname = 'public' AND i.tablename = $1
         AND NOT x.indisprimary`,
      [table],
    )) as unknown as { indexdef: string }[];

    statements.push(
      ...indexes.map((r) =>
        r.indexdef
          .replace(
            /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
            (_m, u: string | undefined) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `,
          )
          .replace(/;\s*$/, "")
          .concat(";"),
      ),
    );
  }

  const enumDdl = [...enums.entries()].map(
    ([name, labels]) => `CREATE TYPE ${name} AS ENUM (${labels.join(", ")});`,
  );
  return [...enumDdl, ...statements].join("\n");
}

/** Seed a pending payment event for the driver; returns its id. */
async function seedPaymentEvent(driverId: string): Promise<string> {
  const rows = (await scratch.unsafe(
    `INSERT INTO payment_events (idempotency_key, provider, amount_bdt, driver_id, package_id, purpose)
     VALUES ($1, 'portpos', $2, $3, $4, 'package') RETURNING id`,
    [randomUUID(), PLAN_PRICE_BDT, driverId, packageId],
  )) as unknown as { id: string }[];
  return rows[0].id;
}

/** All ACTIVE subscription rows for the driver. */
async function activeSubs(driverId: string): Promise<{ id: string; status: string }[]> {
  return (await scratch.unsafe(
    `SELECT id, status FROM subscriptions WHERE driver_id = $1 AND status = 'active' ORDER BY id`,
    [driverId],
  )) as unknown as { id: string; status: string }[];
}

COND("U-4 activateSubscription advisory lock (real Postgres)", () => {
  beforeAll(async () => {
    requireScratchDbUrl(); // scratch-only policy: throws BEFORE any connection
    admin = postgresTag(DB_URL!, { max: 1, connect_timeout: 15 });
    // FORCE terminates stragglers: the app pool below may still hold a session.
    await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${SCRATCH_DB}`);

    const url = scratchUrl();
    scratch = postgresTag(url, { max: N_CREATORS + 2, connect_timeout: 15 });
    holder = postgresTag(url, { max: 1, connect_timeout: 15 });
    await scratch.unsafe(await tablesDdl());

    const pkg = (await scratch.unsafe(
      `INSERT INTO packages (name, call_count, duration_days, price_bdt, is_trial, daily_cap)
       VALUES ('U-4 Concurrency Plan', ${PLAN_CALLS}, 30, ${PLAN_PRICE_BDT}, false, 200) RETURNING id`,
    )) as unknown as { id: string }[];
    packageId = pkg[0].id;

    // src/db reads DATABASE_URL at MODULE LOAD, so this must be redirected
    // before lib/activateSubscription is pulled in. Each jest test file gets a
    // fresh module registry, so nothing has imported it yet.
    process.env.DATABASE_URL = url;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../../lib/activateSubscription") as {
      activateSubscription: ActivateSubscription;
    };
    activateSubscription = mod.activateSubscription;
  }, 120000);

  afterAll(async () => {
    // Restore the app's own target so nothing later in this process inherits it.
    if (DB_URL) process.env.DATABASE_URL = DB_URL;
    await holder?.end({ timeout: 5 }).catch(() => {});
    await scratch?.end({ timeout: 5 }).catch(() => {});
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`).catch(() => {});
    await admin?.end({ timeout: 5 }).catch(() => {});
  }, 120000);

  it(
    "a concurrent activation BLOCKS on the advisory lock, then the loser expires the winner and becomes the sole active subscription",
    async () => {
      const driverId = randomUUID();
      const evtHolder = await seedPaymentEvent(driverId);
      const evtContender = await seedPaymentEvent(driverId);

      // Warm the holder's connection so the lock is acquired promptly rather
      // than after a cold TLS handshake inside the polling window.
      await holder.unsafe(`SELECT 1`);

      // The holder takes the lock and performs the first activation's write
      // path (expire + insert + mark its event paid), staying open.
      let releaseHolder!: () => void;
      const gate = new Promise<void>((r) => {
        releaseHolder = r;
      });
      const held = holder.begin(async (tx) => {
        await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtext('activate_sub_' || $1::text))`, [
          driverId,
        ]);
        const ins = (await tx.unsafe(
          `INSERT INTO subscriptions (driver_id, package_id, calls_remaining, daily_reset_at, status, expires_at, is_trial)
           VALUES ($1, $2, ${PLAN_CALLS}, now(), 'active', now() + interval '30 days', false) RETURNING id`,
          [driverId, packageId],
        )) as unknown as { id: string }[];
        await tx.unsafe(
          `UPDATE payment_events SET status = 'paid', confirmed_at = now(), subscription_id = $1 WHERE id = $2`,
          [ins[0].id, evtHolder],
        );
        await gate; // hold the lock (and the uncommitted row) across the watch
        return ins[0].id;
      });

      let settled = false;
      let contenderError: unknown;
      const contended = activateSubscription(evtContender)
        .then((r) => {
          settled = true;
          return r;
        })
        .catch((e) => {
          contenderError = e;
          settled = true;
          throw e;
        });
      // Fault-injection hygiene: when the assertions below fail BEFORE the
      // `await contended`, the rejected promise would otherwise surface as an
      // unhandled rejection and be misattributed to the NEXT test. A second
      // consumer marks it handled; the await below still sees the rejection.
      void contended.catch(() => {});

      let winnerId: string;
      try {
        // (1) Poll for the contender to be observed BLOCKED ON THE LOCK. An
        // ungranted advisory waiter in pg_locks plus a backend parked on
        // wait_event = 'advisory' is the server agreeing it is serialized.
        // `settled` going true early means it did NOT block — fail fast.
        // Both subqueries are filtered to THIS database so a sibling harness
        // running in parallel cannot satisfy them with its own waiters.
        const deadline = Date.now() + BLOCK_WAIT_DEADLINE_MS;
        let waiters = 0;
        let blockedBackends = 0;
        while (Date.now() < deadline && !settled) {
          const rows = (await scratch.unsafe(`
            SELECT
              (SELECT count(*)::int
                 FROM pg_locks l
                 JOIN pg_stat_activity a ON a.pid = l.pid
                WHERE l.locktype = 'advisory' AND l.granted = false
                  AND a.datname = current_database()) AS waiters,
              (SELECT count(*)::int FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'
                  AND datname = current_database()) AS blocked`)) as unknown as {
            waiters: number;
            blocked: number;
          }[];
          waiters = rows[0].waiters;
          blockedBackends = rows[0].blocked;
          if (waiters > 0 && blockedBackends > 0) break;
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        }

        expect(contenderError).toBeUndefined();
        // Still pending: it has not raced through, so the two must be serialized.
        expect(settled).toBe(false);
        expect(waiters).toBeGreaterThanOrEqual(1);
        expect(blockedBackends).toBeGreaterThanOrEqual(1);
      } finally {
        // ALWAYS release. A leaked holder would keep the transaction (and the
        // lock) open, and every later case would then time out behind it —
        // turning one real failure into a cascade of misleading ones.
        releaseHolder();
      }

      // (2) Release: the contender may now proceed. Reaching here proves it
      // completed only after the holder committed, and that it did so WITHOUT
      // the 23505 a missing lock would have produced (this await would reject).
      winnerId = await held;
      const contender = await contended;
      expect(contender.subscriptionId).not.toBe(winnerId);

      // The U-4 semantics: the later purchase supersedes the earlier one.
      expect((await activeSubs(driverId)).map((r) => r.id)).toEqual([contender.subscriptionId]);

      const holderRow = (await scratch.unsafe(`SELECT status FROM subscriptions WHERE id = $1`, [
        winnerId,
      ])) as unknown as { status: string }[];
      expect(holderRow[0].status).toBe("expired");

      // Both payments are satisfied — neither was doomed into the retry loop.
      const paid = (await scratch.unsafe(
        `SELECT id, status, subscription_id FROM payment_events WHERE driver_id = $1 ORDER BY id`,
        [driverId],
      )) as unknown as { id: string; status: string; subscription_id: string | null }[];
      expect(paid).toHaveLength(2);
      for (const evt of paid) expect(evt.status).toBe("paid");
      expect(new Set(paid.map((e) => e.subscription_id))).toEqual(
        new Set([winnerId, contender.subscriptionId]),
      );
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "NEGATIVE CONTROL: with the lock removed the SCHEMA still refuses a second active subscription (subs_one_active_per_driver)",
    async () => {
      const driverId = randomUUID();

      // Defense in depth: delete the advisory lock and the invariant must STILL
      // hold, because it now lives in the schema. The trigger widens the window
      // so every unlocked creator is guaranteed to pass the expire step and
      // reach the insert — otherwise the proof would pass for the wrong reason
      // (an earlier creator's committed row would simply be expired first).
      await scratch.unsafe(`
        CREATE FUNCTION zz_widen_window_sub() RETURNS trigger AS $$
        BEGIN PERFORM pg_sleep(0.25); RETURN NEW; END $$ LANGUAGE plpgsql`);
      await scratch.unsafe(
        `CREATE TRIGGER zz_widen_sub BEFORE INSERT ON subscriptions
         FOR EACH ROW EXECUTE FUNCTION zz_widen_window_sub()`,
      );
      try {
        // Control = activateSubscription's write path MINUS the lock line, on a
        // control pool rather than the app pool. Labelled as a control, not
        // production code: it exists to exercise the constraint, not to ship.
        const unlockedCreator = async (): Promise<void> => {
          await scratch.begin(async (tx) => {
            await tx.unsafe(
              `UPDATE subscriptions SET status = 'expired', updated_at = now()
                WHERE driver_id = $1 AND status = 'active'`,
              [driverId],
            );
            await tx.unsafe(
              `INSERT INTO subscriptions (driver_id, package_id, calls_remaining, daily_reset_at, status, expires_at, is_trial)
               VALUES ($1, $2, ${PLAN_CALLS}, now(), 'active', now() + interval '30 days', false)`,
              [driverId, packageId],
            );
          });
        };
        // allSettled, not all: the losers are EXPECTED to reject with 23505.
        const settled = await Promise.allSettled(
          Array.from({ length: N_CREATORS }, () => unlockedCreator()),
        );
        const rejected = settled.filter((r) => r.status === "rejected");
        const winners = settled.filter((r) => r.status === "fulfilled");

        // The index fired, and it fired for the RIGHT reason: not a lock, not a
        // trigger, but the unique constraint itself.
        expect(rejected.length).toBeGreaterThanOrEqual(1);
        for (const r of rejected) {
          const reason = (r as PromiseRejectedResult).reason as {
            code?: string;
            message?: string;
          };
          expect(reason?.code).toBe("23505");
          expect(String(reason?.message)).toContain("subs_one_active_per_driver");
        }
        // The invariant: one active subscription, even with no lock at all.
        expect(winners.length).toBeGreaterThanOrEqual(1);
        expect(await activeSubs(driverId)).toHaveLength(1);
      } finally {
        await scratch.unsafe(`DROP TRIGGER IF EXISTS zz_widen_sub ON subscriptions`);
        await scratch.unsafe(`DROP FUNCTION IF EXISTS zz_widen_window_sub()`);
      }
    },
    CASE_TIMEOUT_MS,
  );
});
