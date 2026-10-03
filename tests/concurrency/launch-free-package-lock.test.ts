/**
 * M-3 concurrency harness — proves the `ensureLaunchFreePackage` advisory lock
 * ACTUALLY SERIALIZES concurrent creators.
 *
 * Why this is not the same as the 7 unit tests in
 * tests/api/auth/register-launch-free.test.ts: those mock `db`, so they pin the
 * SHAPE of the transaction (lock issued before the recheck, recheck inside the
 * lock) and nothing about Postgres. `pg_advisory_xact_lock` is a server-side
 * primitive — a mock, a Redis, or an in-process mutex would prove nothing about
 * whether two real connections serialize. The M-3 bug this guards (two racing
 * creators each minting a duplicate "Launch Free" row, because `packages.name`
 * carried NO unique constraint) is precisely a bug that a mocked `db` cannot
 * see and that a real server is the only thing that can settle. At M-3 time
 * `packages.name` genuinely carried no unique constraint; migration 0057 has since
 * added `packages_name_live_uq`, so the schema now backstops the lock (proof 4).
 * The lock still earns its place: with it, every racing caller returns the SAME
 * shared row id; without it, whoever loses the recheck→insert race surfaces 23505
 * instead.
 *
 * TARGET — a scratch DATABASE on the same cluster, never the shared dev tables.
 * `DATABASE_URL` points at a shared Supabase dev database through the Supavisor
 * transaction pooler, and the production function is schema-UNQUALIFIED
 * (`packages`, `hashtext('ensure_launch_free_package')`). A scratch SCHEMA was
 * the obvious isolation play and it does NOT work here: transaction-mode
 * pooling discards session state between transactions, so `SET search_path` is
 * reverted before the next statement (verified live — `packages` kept resolving
 * to `public.packages` after the SET). A scratch DATABASE is routed correctly by
 * the pooler (verified live), so that is what this file creates and drops. The
 * shared `packages` table is never written to, and `payment_events` /
 * `subscriptions` (both FK to `packages`, NO ACTION) are never touched.
 * Advisory locks are cluster-wide, so the lock is briefly held for the whole
 * cluster while a test runs — milliseconds, and correctness-preserving (that is
 * what serialization means), but worth knowing before running this while the dev
 * server is mid-registration.
 *
 * PROOFS (each fails if the lock line is removed from lib/launchFreeSubscription.ts):
 *   1. BLOCKING — a second caller is observed BLOCKED ON THE ADVISORY LOCK while
 *      another session holds it: an ungranted advisory waiter in `pg_locks` and
 *      a backend parked in `pg_stat_activity` on `wait_event = 'advisory'`. It
 *      then resolves only after the holder commits. This is the serialization
 *      claim itself. "Both callers got the same id" would NOT be: that also
 *      holds by luck when the window is narrow, so proof 1 polls for the waiter's
 *      actual existence rather than sleeping and inferring.
 *   2. THE RECHECK — the loser returns the WINNER's row id rather than inserting
 *      its own. This is the M-3 fix itself; mutual exclusion without it would
 *      still mint duplicates.
 *   3. N-WAY RACE — N concurrent real callers produce exactly one row. KEEP THIS
 *      even though it is NOT a reliable detector of a missing lock: fault-injected
 *      live (lock line deleted from lib/launchFreeSubscription.ts) it has BOTH
 *      passed and failed, because the recheck→insert race is decided by timing.
 *      Proof 1 is what actually detects a missing lock, deterministically. Do not
 *      drop proof 1 believing proof 3 subsumes it; it does not.
 *   4. SCHEMA BACKSTOP — the same transaction MINUS the lock statement, run
 *      against a `pg_sleep` trigger that widens the window, is REJECTED by
 *      packages_name_live_uq (migration 0057): every unlocked creator passes the
 *      recheck, all reach the insert, and Postgres refuses all but one with
 *      23505. This is the defense-in-depth claim — delete the advisory lock and
 *      the invariant still holds, because it now lives in the schema. The
 *      scratch table is built from the live catalogue (columns AND indexes), so
 *      this proves the real constraint and not an artefact of the harness.
 *
 * FAULT-INJECTION RESULT (2026-10-03, live, lock statement deleted): proof 1
 * FAILED as designed — `expect(waiters).toBeGreaterThanOrEqual(1)` received 0,
 * i.e. the contender never blocked on anything — and proof 4 passed. Proof 3 is
 * TIMING-DEPENDENT and BOTH outcomes are recorded in this file: one live run
 * PASSED with the lock deleted (the in-lock recheck won all four races), a later
 * one FAILED with `23505 duplicate key value violates unique constraint
 * "packages_name_live_uq"` on the insert, a creator losing the recheck and being
 * refused by the schema backstop instead. Which way a lockless run goes is
 * decided by the recheck→insert race, so NEITHER result is evidence about the
 * lock. That is why proof 1 polls `pg_locks` for a waiter's actual existence
 * rather than sleeping and inferring: it is the only one of the three whose
 * verdict does not depend on how fast the pooler is.
 *
 * Usage (CI never runs this — it has no Postgres):
 *   RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false
 * DATABASE_URL comes from .env.local (scripts/_load-env.ts pattern).
 *
 * @jest-environment node
 * @jest-environment-options {"customExportConditions": ["node"]}
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const COND = RUN ? describe : describe.skip;
const DB_URL = process.env.DATABASE_URL;

const SCRATCH_DB = "launchfree_lock_test";
const LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('ensure_launch_free_package'))";
const PLAN_NAME = "Launch Free";

/** Concurrent callers. The app pool is APP_POOL_SIZE (5), so 4 leaves headroom. */
const N_CREATORS = 4;
/**
 * How long proof 1 waits for the contender to actually REACH the lock
 * statement. It must stay well under the app pool's `statement_timeout` (30s,
 * src/db/index.ts) or the blocked query is cancelled instead of observed.
 * Polling (rather than a fixed sleep) is what makes proof 1 non-vacuous: a
 * contender that is merely slow to start has not been blocked by anything, and
 * the sleep could not tell those two cases apart.
 */
const BLOCK_WAIT_DEADLINE_MS = 15000;
const POLL_INTERVAL_MS = 50;
/** Per-test budget; every case crosses the network twice (pooler round-trips). */
const CASE_TIMEOUT_MS = 60000;

/** The production function under test, bound after DATABASE_URL is redirected. */
type EnsureLaunchFreePackage = () => Promise<{ id: string }>;

let admin: ReturnType<typeof postgresTag>;
/** Observer/control pool on the scratch DB. Never holds the lock while queried. */
let scratch: ReturnType<typeof postgresTag>;
/** Dedicated holder for proof 1, so inspecting pg_locks cannot deadlock it. */
let holder: ReturnType<typeof postgresTag>;
let ensureLaunchFreePackage!: EnsureLaunchFreePackage;

/** The scratch database's connection URL: same cluster, different database. */
function scratchUrl(): string {
  const u = new URL(DB_URL!);
  u.pathname = `/${SCRATCH_DB}`;
  return u.toString();
}

/**
 * Reproduce the real `packages` table in the scratch database, column for
 * column, by reading the LIVE table's catalogue on the shared database.
 *
 * This is derived rather than hand-written on purpose. A hand-written subset
 * looked fine until it did not: drizzle emits every schema column in the INSERT
 * (`is_active`, `vehicle_type`, `created_at`, `updated_at` all appear even
 * though only six are supplied), so a partial table fails with
 * "column \"is_active\" of relation \"packages\" does not exist" the first time
 * the insert path actually runs. Reading the catalogue means a future schema
 * change cannot silently break this harness.
 *
 * Non-primary INDEXES are copied from the catalogue as well, so
 * `packages_name_live_uq` (migration 0057) exists in the scratch table exactly as
 * it does on the shared database — that is deliberate, and it is what makes proof
 * 4 measure the real constraint. An earlier revision of this harness deliberately
 * OMITTED the index, and its comment here claimed the M-3 absence was the point;
 * that stopped being true the moment 0057 landed.
 */
async function packagesDdl(): Promise<string> {
  type Col = {
    column_name: string;
    udt_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    character_maximum_length: number | null;
  };
  const cols = (await admin.unsafe(`
    SELECT column_name, udt_name, data_type, is_nullable, column_default,
           character_maximum_length
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'packages'
     ORDER BY ordinal_position`)) as unknown as Col[];

  // Enum types the table depends on (packages.vehicle_type). Recreated by name
  // so the scratch table has the identical type rather than a text stand-in.
  const enumRows = (await admin.unsafe(`
    SELECT t.typname, e.enumlabel
      FROM information_schema.columns c
      JOIN pg_type t ON t.typname = c.udt_name
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE c.table_schema = 'public' AND c.table_name = 'packages'
       AND c.data_type = 'USER-DEFINED'
     ORDER BY t.typname, e.enumsortorder`)) as unknown as {
    typname: string;
    enumlabel: string;
  }[];
  const byType = new Map<string, string[]>();
  for (const r of enumRows) {
    const list = byType.get(r.typname) ?? [];
    list.push(`'${r.enumlabel}'`);
    byType.set(r.typname, list);
  }

  const pk = (await admin.unsafe(`
    SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = 'public.packages'::regclass AND i.indisprimary
     ORDER BY array_position(i.indkey, a.attnum)`)) as unknown as { attname: string }[];

  const sqlType = (c: Col): string => {
    if (c.data_type === "USER-DEFINED") return c.udt_name;
    if (c.data_type === "character varying") return `varchar(${c.character_maximum_length ?? 255})`;
    if (c.data_type === "timestamp with time zone") return "timestamptz";
    if (c.data_type === "integer") return "integer";
    if (c.data_type === "boolean") return "boolean";
    if (c.data_type === "uuid") return "uuid";
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

  const enums = [...byType.entries()].map(
    ([name, labels]) => `CREATE TYPE ${name} AS ENUM (${labels.join(", ")});`,
  );

  // Indexes too, not just columns. Without this the scratch table would lack
  // packages_name_live_uq (migration 0057) and proof 4 below would prove
  // nothing — it would be asserting a backstop the harness never installed.
  // The primary key is skipped: it is already emitted as a table constraint.
  const indexes = (await admin.unsafe(`
    SELECT i.indexdef
      FROM pg_indexes i
      JOIN pg_class ic ON ic.relname = i.indexname
      JOIN pg_index x ON x.indexrelid = ic.oid
     WHERE i.schemaname = 'public' AND i.tablename = 'packages'
       AND NOT x.indisprimary`)) as unknown as { indexdef: string }[];

  return [
    ...enums,
    `CREATE TABLE packages (\n  ${defs.join(",\n  ")}\n);`,
    // pg_indexes.indexdef carries NO trailing semicolon, so the statements are
    // normalised here — otherwise the second derived index is concatenated onto
    // the first and Postgres reports `syntax error at or near "CREATE"`.
    ...indexes.map((r) =>
      r.indexdef
        .replace(
          /^CREATE\s+(UNIQUE\s+)?INDEX\s+/i,
          (_m, u: string | undefined) => `CREATE ${u ?? ""}INDEX IF NOT EXISTS `,
        )
        .replace(/;\s*$/, "")
        .concat(";"),
    ),
  ].join("\n");
}

/** Every Launch Free row, fresh slate or not. */
async function resetPlans(): Promise<void> {
  await scratch.unsafe(`DELETE FROM packages WHERE name = '${PLAN_NAME}'`);
}

async function planRowCount(): Promise<number> {
  const rows = (await scratch.unsafe(
    `SELECT count(*)::int AS n FROM packages WHERE name = '${PLAN_NAME}'`,
  )) as unknown as { n: number }[];
  return rows[0].n;
}

COND("M-3 ensureLaunchFreePackage advisory lock (real Postgres)", () => {
  beforeAll(async () => {
    if (!DB_URL) throw new Error("DATABASE_URL required for the launch_free lock harness");
    admin = postgresTag(DB_URL!, { max: 1, connect_timeout: 15 });
    // FORCE terminates stragglers: the app pool below may still hold a session.
    await admin.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${SCRATCH_DB}`);

    const url = scratchUrl();
    scratch = postgresTag(url, { max: N_CREATORS + 2, connect_timeout: 15 });
    holder = postgresTag(url, { max: 1, connect_timeout: 15 });
    await scratch.unsafe(await packagesDdl());

    // src/db reads DATABASE_URL at MODULE LOAD, so this must be redirected
    // before lib/launchFreeSubscription is pulled in. Each jest test file gets a
    // fresh module registry, so nothing has imported it yet.
    process.env.DATABASE_URL = url;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../../lib/launchFreeSubscription") as {
      ensureLaunchFreePackage: EnsureLaunchFreePackage;
    };
    ensureLaunchFreePackage = mod.ensureLaunchFreePackage;
  }, 120000);

  afterAll(async () => {
    // Restore the app's own target so nothing later in this process inherits it.
    if (DB_URL) process.env.DATABASE_URL = DB_URL;
    await holder?.end({ timeout: 5 }).catch(() => {});
    await scratch?.end({ timeout: 5 }).catch(() => {});
    await admin?.unsafe(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`).catch(() => {});
    await admin?.end({ timeout: 5 }).catch(() => {});
  }, 120000);

  beforeEach(async () => {
    await resetPlans();
  });

  it(
    "a second caller BLOCKS on the advisory lock while another session holds it, then returns the holder's row",
    async () => {
      // Warm the holder's connection so the lock is acquired promptly rather
      // than after a cold TLS handshake inside the polling window.
      await holder.unsafe(`SELECT 1`);

      // The holder takes the lock, inserts the winner's row, and stays open.
      let releaseHolder!: () => void;
      const gate = new Promise<void>((r) => {
        releaseHolder = r;
      });
      const held = holder.begin(async (tx) => {
        await tx.unsafe(LOCK_SQL);
        const ins = (await tx.unsafe(
          `INSERT INTO packages (name, call_count, duration_days, price_bdt, is_trial, daily_cap)
           VALUES ('${PLAN_NAME}', -1, 36500, 0, false, 200) RETURNING id`,
        )) as unknown as { id: string }[];
        await gate; // hold the lock (and the uncommitted row) across the watch
        return ins[0].id;
      });

      let settled = false;
      let contenderError: unknown;
      const contended = ensureLaunchFreePackage()
        .then((p) => {
          settled = true;
          return p;
        })
        .catch((e) => {
          contenderError = e;
          settled = true;
          throw e;
        });

      let winnerId: string;
      try {
        // (1) Poll for the contender to be observed BLOCKED ON THE LOCK. An
        // ungranted advisory waiter in pg_locks plus a backend parked on
        // wait_event = 'advisory' is the server agreeing it is serialized.
        // `settled` going true early means it did NOT block — fail fast.
        const deadline = Date.now() + BLOCK_WAIT_DEADLINE_MS;
        let waiters = 0;
        let blockedBackends = 0;
        while (Date.now() < deadline && !settled) {
          const rows = (await scratch.unsafe(`
            SELECT
              (SELECT count(*)::int FROM pg_locks
                WHERE locktype = 'advisory' AND granted = false) AS waiters,
              (SELECT count(*)::int FROM pg_stat_activity
                WHERE wait_event_type = 'Lock' AND wait_event = 'advisory') AS blocked`)) as unknown as {
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

      // (2) Release: the contender may now proceed. Reaching here at all proves
      // it completed only after the holder committed — no assertion needed for
      // the ordering itself (that is what the pg_locks poll established); an
      // `expect(settled).toBe(true)` here could never fail, because the `.then`
      // sets the flag before resolving, so it is deliberately absent.
      winnerId = await held;
      const loser = await contended;

      // (3) THE RECHECK: the loser reused the winner's committed row. Without
      // the in-lock recheck it would have inserted its own second row.
      expect(loser.id).toBe(winnerId);
      expect(await planRowCount()).toBe(1);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    `${N_CREATORS} concurrent creators produce exactly ONE row and all return the same id`,
    // NOTE: this is NOT a reliable detector of a missing lock. With the lock
    // deleted it has passed (the recheck wins the race) and failed (23505 from
    // packages_name_live_uq) — both verified live. It pins the end-to-end
    // symptom, not the mechanism. Proof 1 pins the mechanism, deterministically.
    // See the FAULT-INJECTION RESULT note in the header.
    async () => {
      const results = await Promise.all(
        Array.from({ length: N_CREATORS }, () => ensureLaunchFreePackage()),
      );
      const ids = new Set(results.map((r) => r.id));
      expect(ids.size).toBe(1);
      expect(results[0].id).toBeTruthy();
      // End-to-end symptom: exactly one row survives and every caller agrees on
      // its id. This is NO LONGER the only thing standing between a missing lock
      // and duplicates — packages_name_live_uq is (proof 4) — so this assertion
      // does not prove the lock did the work. Proof 1 does, deterministically.
      expect(await planRowCount()).toBe(1);
    },
    CASE_TIMEOUT_MS,
  );

  it(
    "NEGATIVE CONTROL: with the lock removed the SCHEMA still refuses duplicates (packages_name_live_uq)",
    async () => {
      // Defense in depth: delete the advisory lock and the invariant must STILL
      // hold, because it now lives in the schema. The trigger widens the window
      // so every unlocked creator is guaranteed to pass the recheck and reach
      // the insert — otherwise the proof would pass for the wrong reason (the
      // recheck alone would have found the winner's row and nothing would be
      // rejected).
      await scratch.unsafe(`
        CREATE FUNCTION zz_widen_window() RETURNS trigger AS $$
        BEGIN PERFORM pg_sleep(0.25); RETURN NEW; END $$ LANGUAGE plpgsql`);
      await scratch.unsafe(
        `CREATE TRIGGER zz_widen BEFORE INSERT ON packages
         FOR EACH ROW EXECUTE FUNCTION zz_widen_window()`,
      );
      try {
        // Control = ensureLaunchFreePackage's transaction MINUS the lock line,
        // on a control pool rather than the app pool. Labelled as a control, not
        // production code: it exists to exercise the constraint, not to ship.
        const unlockedCreator = async (): Promise<void> => {
          await scratch.begin(async (tx) => {
            await tx.unsafe(
              `SELECT id FROM packages WHERE name = '${PLAN_NAME}' AND deleted_at IS NULL LIMIT 1`,
            );
            await tx.unsafe(
              `INSERT INTO packages (name, call_count, duration_days, price_bdt, is_trial, daily_cap)
               VALUES ('${PLAN_NAME}', -1, 36500, 0, false, 200)`,
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
          expect((r as PromiseRejectedResult).reason?.code).toBe("23505");
        }
        // The invariant: duplicates are impossible even with no lock at all.
        expect(winners.length).toBeGreaterThanOrEqual(1);
        expect(await planRowCount()).toBe(1);
      } finally {
        await scratch.unsafe(`DROP TRIGGER IF EXISTS zz_widen ON packages`);
        await scratch.unsafe(`DROP FUNCTION IF EXISTS zz_widen_window()`);
      }
    },
    CASE_TIMEOUT_MS,
  );
});
