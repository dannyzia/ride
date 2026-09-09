/**
 * P1-1 concurrency harness — no-contention twin of promo-lock.test.ts.
 * See that file's header for the full rationale (real Postgres, scratch
 * schema, exact production sequence, one scenario per FILE because a shared
 * postgres-js pool across sequential scenarios leaves stale session state
 * that silently eats inserts).
 *
 * This file: CAP 12, N=12 parallel riders → all commit under full load,
 * proving the lock serializes without deadlocking or losing commits when
 * there is no cap pressure. The pair together pins both directions:
 * serialization ENFORCES the cap, and serialization doesn't BREAK normal flow.
 *
 * Usage (CI never runs this — it has no Postgres):
 *   RUN_CONCURRENCY_TESTS=1 npx jest tests/concurrency --watchAll=false
 *
 * @jest-environment node
 * @jest-environment-options {"customExportConditions": ["node"]}
 */
import "../../scripts/_load-env";
import postgresTag from "postgres";

const RUN = process.env.RUN_CONCURRENCY_TESTS === "1";
const COND = RUN ? describe : describe.skip;
const DB_URL = process.env.DATABASE_URL;

const SCHEMA = "promo_concurrency_test_nc";
const N_RIDERS = 12;
const CAP = 12;

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

  // EXACT production sequence (request+api.ts :556-610, 8315120), schema-qualified.
  const worker = async (riderIdx: number): Promise<"committed" | "aborted"> => {
    const riderId = `00000000-0000-4000-8000-${String(riderIdx).padStart(12, "0")}`;
    const rideId = `00000000-0000-4000-8001-${String(riderIdx).padStart(12, "0")}`;
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(
          `SELECT pg_advisory_xact_lock(hashtext('promo_' || (SELECT id FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY')))`,
        );
        const promos = (await tx.unsafe(
          `SELECT is_active, max_uses FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY'`,
        )) as unknown as { is_active: boolean; max_uses: number | null }[];
        const promo = promos[0];
        const maxUses = promo ? promo.max_uses : null;
        const breach = (msg: string): never => {
          throw Object.assign(new Error(msg), {
            status: 409,
            errorCode: "promo_no_longer_valid",
          });
        };
        if (!promo || !promo.is_active) breach("Promo is no longer valid");
        const counts = (await tx.unsafe(
          `SELECT count(*)::int AS uses FROM ${SCHEMA}.promo_redemptions WHERE promo_code_id = (SELECT id FROM ${SCHEMA}.promo_codes WHERE code = 'CONCURRENCY')`,
        )) as unknown as { uses: number }[];
        const uses = counts[0].uses;
        if (maxUses != null && uses >= maxUses) {
          breach("Promo global cap reached");
        }
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

COND("P1-1 promo-lock concurrency — no contention (real Postgres)", () => {
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
    `cap ${CAP} / ${N_RIDERS} riders → all commit under full load (lock serializes without deadlock)`,
    async () => {
      if (!RUN) return;
      const results = await Promise.all(
        Array.from({ length: N_RIDERS }, (_, i) => h.worker(i)),
      );
      expect(results.filter((r) => r === "committed")).toHaveLength(N_RIDERS);
      expect(await h.count()).toBe(N_RIDERS);
    },
    45000,
  );
});
