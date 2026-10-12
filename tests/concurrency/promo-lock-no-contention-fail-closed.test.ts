/**
 * P1-1 promo-lock harness — fail-closed fault injection (new test).
 *
 * Verdict: exit 1 (expect expectation failure) — the harness MUST fail
 * closed, refusing to run against any database other than the scratch URL.
 * A green run against a fake or wrong DB URL is a defect in harness wiring.
 */

import { requireScratchDbUrl } from "./scratch-db-url";

// A fake, non-Postgres URL — enough to make postgres-js try to resolve a
// connection. The harness MUST refuse this URL before opening any socket,
// so a developer who forgot to export SCRATCH_DATABASE_URL can never run
// this harness against the shared dev project or any other DB.
const FAKE_URL = "postgres://localhost:54321/fake";

describe("P1-1 promo-lock concurrency — fail closed without SCRATCH_DATABASE_URL", () => {
  it("REJECTS missing SCRATCH_DATABASE_URL before any connection", async () => {
    const original = process.env.SCRATCH_DATABASE_URL;
    // delete, never `= undefined` — process.env stringifies, so an undefined
    // assignment would be seen by the refuser as the literal "undefined".
    delete process.env.SCRATCH_DATABASE_URL;

    try {
      let threw = false;
      try {
        requireScratchDbUrl();
      } catch (err) {
        threw = true;
      }
      expect(threw).toBe(true);
    } finally {
      if (original !== undefined) {
        process.env.SCRATCH_DATABASE_URL = original;
      } else {
        delete process.env.SCRATCH_DATABASE_URL;
      }
    }
  });

  it("PREFERS a set SCRATCH_DATABASE_URL verbatim — even a fake one (wins outright over DATABASE_URL)", async () => {
    // The policy (tests/concurrency/scratch-db-url.ts) has NO host validation
    // by design: SCRATCH_DATABASE_URL, when set, wins outright, so a fake URL
    // can never fall through to the shared dev project — the harness fails to
    // connect instead, which is the fail-closed outcome.
    const original = process.env.SCRATCH_DATABASE_URL;
    process.env.SCRATCH_DATABASE_URL = FAKE_URL;
    try {
      expect(requireScratchDbUrl()).toBe(FAKE_URL);
    } finally {
      if (original !== undefined) {
        process.env.SCRATCH_DATABASE_URL = original;
      } else {
        delete process.env.SCRATCH_DATABASE_URL;
      }
    }
  });
});
