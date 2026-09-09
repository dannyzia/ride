/**
 * P1-1 concurrency harness — proves the per-promo advisory lock SERIALIZES
 * concurrent ride-request transactions under load (primitive-audit P1-1,
 * commit 8315120, Bug Survey theme 7 / X-1 pattern).
 *
 * Runs against a REAL Postgres (the lock is pg_advisory_xact_lock — a Redis or
 * in-process simulation would prove nothing). App tables are never touched:
 * the harness creates a self-contained scratch schema and drops it in
 * afterAll. One scenario per FILE (this is the cap-8 contention case; the
 * no-contention twin lives in promo-lock-no-contention.test.ts) because a
 * shared `postgres` pool across sequential scenarios leaves stale session
 * state that silently eats inserts (empirically proven: each passes alone,
 * the second fails in sequence).
 *
 * This file: CAP 8, N=12 parallel riders → the contested case. Exactly 8
 * commits, 4 aborts with errorCode promo_no_longer_valid, count(*) == 8 —
 * no oversubscription is possible while the lock holds.
 *
 * The worker transaction transcribes the EXACT production sequence from
 * app/api/ride/request+api.ts (:556-610, commit 8315120):
 *   tx → pg_advisory_xact_lock(hashtext('promo_' || id)) → liveness re-read →
 *   global cap count → redemption INSERT (all on the tx snapshot).
 * Every harness statement is SCHEMA-QUALIFIED (unqualified names would
 * resolve to the real app tables — that failure mode made every worker abort
 * on the liveness branch). rider/ride ids are bound parameters.
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

const SCHEMA = "promo_concurrency_test";
const N_RIDERS = 12;
const CAP = 8;
const BARRIER_TIMEOUT_MS = 15000;

interface Harness {
  sql: ReturnType<typeof postgresTag>;
  setup: () => Promise<void>;
  worker: (riderIdx: number) => Promise<"committed" | "aborted">;
  count: () => Promise<number>;
  teardown: () => Promise<void>;
}

function makeHarness(): Harness {
  const sql = postgresTag(DB_URL!, { max: N_RIDERS + 2 });

  const setup = async (): Promise<void> => {
    // Fresh schema per run — no cross-run or cross-file state can leak.
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await sql.unsafe(`CREATE SCHEMA ${SCHEMA}`);
    await sql.unsafe(`
      CREATE TABLE ${SCHEMA}.promo_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        max_uses integer,
        max_uses_per_rider integer
      )`);
    await sql.unsafe(`
      CREATE TABLE ${SCHEMA}.promo_redemptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        promo_code_id uuid NOT NULL REFERENCES ${SCHEMA}.promo_codes(id),
        rider_id uuid NOT NULL,
        ride_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await sql.unsafe(`
      INSERT INTO ${SCHEMA}.promo_codes (code, is_active, max_uses)
      VALUES ('CONCURRENCY', true, ${CAP})`);
  };

  // EXACT production sequence (request+api.ts :556-610, 8315120) against the
  // scratch tables. Every statement is schema-qualified (see header note);
  // rider/ride ids are the only per-worker parameters (bound, not interpolated).
  const worker = async (riderIdx: number): Promise<"committed" | "aborted"> => {
    const riderId = `00000000-0000-4000-8000-${String(riderIdx).padStart(12, "0")}`;
    const rideId = `00000000-0000-4000-8001-${String(riderIdx).padStart(12, "0")}`;
    try {
      await sql.begin(async (tx: any) => {
        // (1) Per-promo advisory lock — production form, verbatim (schema-qualified).
        await tx.unsafe(
          `SELECT pg_advisory_xact_lock(hashtext('promo_' || (SELECT id FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY')))`,
        );

        // (2) Liveness + cap re-read on the tx snapshot (schema-qualified).
        const promos = await tx.unsafe(
          `SELECT is_active, max_uses FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY'`,
        );
        const promo = promos[0] as
          | { is_active: boolean; max_uses: number | null }
          | undefined;
        const maxUses = promo ? promo.max_uses : null; // captured pre-guard (never-call narrowing doesn't apply to arrow fns)
        const breach = (msg: string): never => {
          throw Object.assign(new Error(msg), {
            status: 409,
            errorCode: "promo_no_longer_valid",
          });
        };
        if (!promo || !promo.is_active) breach("Promo is no longer valid");

        // (3) Global cap count on the same snapshot (schema-qualified).
        const counts = await tx.unsafe(
          `SELECT count(*)::int AS uses FROM ${SCHEMA}.promo_redemptions WHERE promo_code_id = (SELECT id FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY')`,
        );
        const uses = (counts[0] as { uses: number }).uses;
        if (maxUses != null && uses >= maxUses) {
          breach("Promo global cap reached");
        }

        // (4) Redemption insert on the same snapshot (schema-qualified; ids bound).
        await tx.unsafe(
          `INSERT INTO ${SCHEMA}.promo_redemptions (promo_code_id, rider_id, ride_id)
           VALUES ((SELECT id FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY'), $1::uuid, $2::uuid)`,
          [riderId, rideId],
        );
      });
      return "committed";
    } catch (err: any) {
      if (err && err.errorCode === "promo_no_longer_valid") return "aborted";
      throw err;
    }
  };

  const count = async (): Promise<number> => {
    const rows = (await sql.unsafe(
      `SELECT count(*)::int AS n FROM ${SCHEMA}.promo_redemptions`,
    )) as unknown as { n: number }[];
    return rows[0].n;
  };

  const teardown = async (): Promise<void> => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await sql.end();
  };

  return { sql, setup, worker, count, teardown };
}

COND("P1-1 promo-lock concurrency — contention (real Postgres)", () => {
  let h: Harness;

  beforeAll(async () => {
    if (!DB_URL) throw new Error("DATABASE_URL required for the concurrency harness");
    h = makeHarness();
    await h.setup();
  });

  afterAll(async () => {
    if (h) await h.teardown();
  });

  it(
    `cap ${CAP} / ${N_RIDERS} riders → exactly ${CAP} commits, ${N_RIDERS - CAP} aborts, count == ${CAP} (no oversubscription)`,
    async () => {
      if (!RUN) return;
      const results = await Promise.all(
        Array.from({ length: N_RIDERS }, (_, i) => h.worker(i)),
      );
      const commits = results.filter((r) => r === "committed").length;
      const aborts = results.filter((r) => r === "aborted").length;
      expect(commits).toBe(CAP);
      expect(aborts).toBe(N_RIDERS - CAP);
      expect(await h.count()).toBe(CAP);
    },
    45000,
  );
});
