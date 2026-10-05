/**
 * tests/concurrency/scratch-db-url.ts — scratch-only database policy for the
 * tests/concurrency harnesses (ONE policy, four consumers — never inline it).
 *
 * Purpose:     The harnesses DROP/CREATE DATABASES (M-3 launch-free, U-4
 *              activation) and create/drop SCHEMAS (promo). scripts/_load-env.ts
 *              silently fills DATABASE_URL from .env.local — the SHARED dev
 *              project — when that variable is unset, so "forgetting the
 *              override" would run all of that on the shared cluster. The
 *              policy: SCRATCH_DATABASE_URL is PREFERRED whenever it is set (it
 *              wins outright over DATABASE_URL), and REQUIRED to run — without
 *              it this throws BEFORE any connection is opened. A forgotten
 *              override therefore fails loudly and can never run scratch
 *              databases on the shared dev project.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Source of truth: this file (the policy) — proven by
 *              tests/meta/concurrency-gate.test.ts (RUN B' refusal + RUN C
 *              preference, instrumented with poisoned TCP listeners).
 * Related (concrete paths):
 *   - tests/concurrency/launch-free-package-lock.test.ts, activate-subscription-lock.test.ts,
 *     promo-lock.test.ts, promo-lock-no-contention.test.ts — the four consumers;
 *     each calls requireScratchDbUrl() in beforeAll BEFORE opening a connection
 *   - scripts/concurrency-scratch-project.mjs — writes SCRATCH_DATABASE_URL to
 *     the gitignored .env.scratch.local (alongside DATABASE_URL, which only
 *     `drizzle-kit push` still needs)
 *   - tests/meta/concurrency-gate.test.ts — pins preference + refusal
 *   - .github/workflows/ci.yml (`concurrency-locks`) — sets SCRATCH_DATABASE_URL
 *     to its disposable postgres:16 service container (that container IS the
 *     scratch database)
 * Last verified: 2026-10-05, coding model — exercised by the instrumented
 *              RUN B'/RUN C cases in tests/meta/concurrency-gate.test.ts.
 * How to update: change the policy HERE only. Every harness must keep calling
 *              requireScratchDbUrl() in beforeAll before its first connection;
 *              the module-scope URL binding may fall back to DATABASE_URL (it
 *              is non-throwing by contract so a default-suite run can still
 *              SKIP cleanly), but that fallback is unreachable past the guard.
 */

/**
 * The scratch database URL the harness must use. Throws when
 * SCRATCH_DATABASE_URL is absent — deliberate fail-closed behavior: a fallback
 * to DATABASE_URL is exactly the path by which a forgotten override reaches the
 * shared dev project (see the header).
 */
export function requireScratchDbUrl(): string {
  const scratch = process.env.SCRATCH_DATABASE_URL;
  if (!scratch) {
    throw new Error(
      "SCRATCH_DATABASE_URL is required for tests/concurrency — refusing to run. " +
        "Without it the harness would fall back to DATABASE_URL, which scripts/_load-env.ts " +
        "fills from .env.local (the SHARED dev project), and these harnesses DROP/CREATE " +
        "databases and schemas. Provision a throwaway project with " +
        "`node scripts/concurrency-scratch-project.mjs`, then run with the SCRATCH_DATABASE_URL " +
        "it writes to .env.scratch.local (see the script's NEXT steps). In CI the disposable " +
        "postgres:16 service container is the scratch database.",
    );
  }
  return scratch;
}
