/**
 * tests/meta/concurrency-gate.test.ts
 *
 * Guards the opt-in gate shared by every tests/concurrency harness (M-3
 * launch-free, U-4 activation, and the P1-1 promo pair).
 * With `RUN_CONCURRENCY_TESTS` unset — the condition of every default
 * `npx jest` / `npm run test:all` run — the harness must skip EVERY test and
 * open ZERO database connections, so the shared `packages` table can never be
 * read or written outside an explicit `RUN_CONCURRENCY_TESTS=1` run.
 *
 * WHY THIS FILE EXISTS. The M-3 harness runs against the real shared cluster:
 * its `beforeAll` drops + creates a scratch database on it, and the DDL builder
 * reads `public.packages` from the live catalogue. It is held back only by
 * `const RUN = process.env.RUN_CONCURRENCY_TESTS === "1"; const COND = RUN ?
 * describe : describe.skip;`. Nothing pinned that gate. An edit that defaults
 * it on — or that moves DB work to module scope, above the `COND` block — would
 * make a plain `npx jest`, and every full-suite run, connect to the shared dev
 * database. tsc and eslint both accept that change; the harness's own suite
 * cannot see it (it is the thing that changed).
 *
 * HOW. Three instrumented child runs of the REAL harness files through the
 * repo's own jest, each with `DATABASE_URL` pointed at a local TCP listener
 * this test owns. The listener counts accepted connections and immediately
 * closes them:
 *   - RUN A (default-suite condition): `RUN_CONCURRENCY_TESTS` deleted from the
 *     child env, targeting EVERY gated harness (launch-free,
 *     activate-subscription, and both promo-lock files). Expect exit 0, every
 *     test PENDING, and ZERO
 *     accepted connections. No connection means no SQL, so the shared tables
 *     cannot have been touched.
 *   - RUN B' (fault injection + policy): `RUN_CONCURRENCY_TESTS=1`, the gate
 *     open, NO SCRATCH_DATABASE_URL, targeting the launch-free harness. Expect
 *     the run to FAIL on the scratch-URL REFUSAL (tests/concurrency/
 *     scratch-db-url.ts) with ZERO connections — a forgotten override can
 *     never run scratch databases on DATABASE_URL (which _load-env fills from
 *     .env.local, the shared dev project).
 *   - RUN C (preference + instrument non-vacuity): gate open with BOTH
 *     variables poisoned to two different listeners. Expect the child's
 *     connections on the SCRATCH_DATABASE_URL listener and NONE on the
 *     DATABASE_URL listener — proving the instrument RUN A relies on can
 *     fire, and that a set SCRATCH_DATABASE_URL wins outright. Neither run can
 *     reach real Postgres: the listeners are not Postgres servers and the
 *     child dies on the socket.
 * A child jest (rather than importing the harness) is deliberate: importing a
 * test file would register its `describe` into THIS process — either silently
 * injecting the skipped suite, or, worse, running the real DB work in-process.
 * `--runInBand` keeps the child cheap (~10s warm) and single-worker.
 *
 * The poisoned `DATABASE_URL` is load-bearing twice: it forces any connection
 * attempt to the listener (never the shared cluster), and scripts/_load-env.ts
 * fills `DATABASE_URL` from `.env.local` ONLY when unset, so the real URL
 * cannot leak into either child. The same deletion discipline applies to
 * `SCRATCH_DATABASE_URL`: runHarness strips it from every child env unless the
 * run explicitly supplies one, so a stray parent-shell value can never change
 * what a run proves.
 *
 * MEASURED (2026-10-05, Windows, warm cache, under the scratch-URL policy;
 * re-measured when RUN A was extended to all four gated files):
 * RUN A 4.4s — 7/7 pending across 4 files (3 launch-free + 2 U-4 + 1 + 1 promo
 * pair), 0 connections; RUN B' 3.0s — refused on
 * SCRATCH_DATABASE_URL before any connection (0 accepted on either listener);
 * RUN C 2.9s — connection attempts on the SCRATCH listener only, DATABASE_URL
 * listener 0, child dead on the socket before any Postgres handshake. The
 * fault-injection shape is the same one the
 * M-3 harness itself uses on live Postgres (it records BOTH outcomes of an
 * unreliable detector): a run that lets the gate open must produce the failure
 * the guard is built to catch, or the guard is a no-op.
 *
 * Related (concrete paths):
 *   - tests/concurrency/scratch-db-url.ts — the scratch-only policy these runs
 *     pin (preference + fail-closed refusal)
 *   - tests/concurrency/launch-free-package-lock.test.ts — M-3 harness, under guard
 *   - tests/concurrency/activate-subscription-lock.test.ts — U-4 harness, under guard
 *   - scripts/_load-env.ts — fills DATABASE_URL from .env.local only when unset
 *   - tests/concurrency/promo-lock.test.ts, promo-lock-no-contention.test.ts —
 *     P1-1 promo harnesses, under the same guard (RUN A covers all four gated
 *     files since 2026-10-05)
 *   - tests/api/auth/register-launch-free.test.ts — the mocked unit lane that
 *     pins the transaction shape without Postgres
 */
import fs from "fs";
import net from "net";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
/** The M-3 harness; RUN B fault-injects this one specifically. */
const LAUNCH_FREE_HARNESS = "tests/concurrency/launch-free-package-lock.test.ts";
/**
 * Every DB-touching harness that shares the RUN_CONCURRENCY_TESTS gate. RUN A
 * runs all of them so a new sibling cannot silently become an unguarded
 * default-suite DB connector.
 */
const GATED_HARNESSES = [
  LAUNCH_FREE_HARNESS,
  "tests/concurrency/activate-subscription-lock.test.ts",
  "tests/concurrency/promo-lock.test.ts",
  "tests/concurrency/promo-lock-no-contention.test.ts",
];
const JEST_BIN = path.join(REPO, "node_modules", "jest", "bin", "jest.js");
/**
 * Per-case bound. A cold child jest run (no transform cache) was measured at
 * ~45s on the dev machine; 240s leaves headroom for a slow CI runner without
 * letting a hung child sit for jest's default 5s test timeout. The child is
 * killed on expiry and `timedOut` fails the case; it must never be a skip.
 */
const CASE_TIMEOUT_MS = 240_000;

/** The subset of `jest --json` output these assertions read. */
interface JestJson {
  success: boolean;
  numTotalTests: number;
  numPendingTests: number;
  numPassedTests: number;
  numFailedTests: number;
  testResults: {
    name: string;
    status?: string;
    message?: string;
    assertionResults?: { status?: string }[];
  }[];
}

interface HarnessRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  /** TCP connections ACCEPTED by the DATABASE_URL listener (i.e. attempted by the child). */
  connections: number;
  /** TCP connections ACCEPTED by the SCRATCH_DATABASE_URL listener (RUN C only). */
  scratchConnections: number;
  stderr: string;
  json: JestJson | null;
}

/**
 * Run the real harness in a child jest with DATABASE_URL pinned to a listener.
 *
 * @param runValue `"1"` = gate open (fault injection); `null` = env var deleted
 *   (the default-suite condition this guard is about).
 * @param harnesses Files to run; defaults to every gated harness.
 * @param opts `scratch: "poison"` spins a SECOND listener and points
 *   SCRATCH_DATABASE_URL at it (RUN C's preference instrument); the default
 *   (`"unset"`) deletes SCRATCH_DATABASE_URL from the child env so a stray
 *   parent-shell value can never change what a run proves.
 */
function runHarness(
  runValue: string | null,
  harnesses: string[] = GATED_HARNESSES,
  opts: { scratch?: "unset" | "poison" } = {},
): Promise<HarnessRun> {
  if (!fs.existsSync(JEST_BIN)) {
    // Not skipped on purpose: a missing jest means npm ci was never run, and a
    // skip here would hide the guard while reporting green.
    throw new Error(`concurrency-gate.test.ts: jest not found at ${JEST_BIN} — run npm ci`);
  }

  return new Promise<HarnessRun>((resolve, reject) => {
    let connections = 0;
    let scratchConnections = 0;
    const makeServer = (bump: () => void): net.Server =>
      net.createServer((socket) => {
        bump();
        // Refuse immediately: the child must fail fast on the connect, not wait
        // out postgres.js's connect_timeout against a silent socket.
        socket.destroy();
      });
    const server = makeServer(() => {
      connections += 1;
    });
    // The SCRATCH_DATABASE_URL instrument (RUN C). Two counters are what make
    // "prefer scratch over DATABASE_URL" observable: the DATABASE_URL listener
    // must record NOTHING while this one records the child's attempts.
    const scratchServer =
      opts.scratch === "poison"
        ? makeServer(() => {
            scratchConnections += 1;
          })
        : null;
    server.once("error", reject);
    scratchServer?.once("error", reject);

    const begin = (scratchPort: number | null): void => {
      const port = (server.address() as net.AddressInfo).port;
      const poisonUrl = `postgres://concurrency_gate:concurrency_gate@127.0.0.1:${port}/concurrency_gate`;
      const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: poisonUrl };
      // SCRATCH_DATABASE_URL is DELETED unless a run supplies one: a stray
      // parent-shell value would silently change what each run proves.
      delete env.SCRATCH_DATABASE_URL;
      if (scratchServer && scratchPort !== null) {
        env.SCRATCH_DATABASE_URL = `postgres://concurrency_gate:concurrency_gate@127.0.0.1:${scratchPort}/concurrency_gate`;
      }
      // The parent is itself a jest worker; the child must start as a normal CLI.
      delete env.JEST_WORKER_ID;
      if (runValue === null) delete env.RUN_CONCURRENCY_TESTS;
      else env.RUN_CONCURRENCY_TESTS = runValue;

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "concurrency-gate-"));
      const outputFile = path.join(tmp, "jest.json");
      const child = spawn(
        process.execPath,
        [
          JEST_BIN,
          "--runTestsByPath",
          ...harnesses,
          "--watchAll=false",
          "--ci",
          "--silent",
          "--runInBand",
          "--json",
          `--outputFile=${outputFile}`,
        ],
        { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] },
      );

      let stderr = "";
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString();
      });
      // Drain stdout so a chatty child cannot fill the pipe and stall.
      child.stdout.on("data", () => {});

      let timedOut = false;
      const killTimer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, CASE_TIMEOUT_MS);

      const closeAll = (then: () => void): void => {
        let pending = scratchServer ? 2 : 1;
        const done = (): void => {
          pending -= 1;
          if (pending === 0) then();
        };
        server.close(done);
        scratchServer?.close(done);
      };

      const settle = (code: number | null, signal: NodeJS.Signals | null): void => {
        clearTimeout(killTimer);
        let json: JestJson | null = null;
        try {
          json = JSON.parse(fs.readFileSync(outputFile, "utf8")) as JestJson;
        } catch {
          json = null; // assertions fail on the null; stderr carries the reason
        }
        fs.rmSync(tmp, { recursive: true, force: true });
        closeAll(() =>
          resolve({ code, signal, timedOut, connections, scratchConnections, stderr, json }),
        );
      };

      child.on("error", (err) => {
        clearTimeout(killTimer);
        fs.rmSync(tmp, { recursive: true, force: true });
        closeAll(() => reject(err));
      });
      child.on("close", settle);
    };

    server.listen(0, "127.0.0.1", () => {
      if (scratchServer) {
        scratchServer.listen(0, "127.0.0.1", () => {
          begin((scratchServer.address() as net.AddressInfo).port);
        });
      } else {
        begin(null);
      }
    });
  });
}

describe("RUN_CONCURRENCY_TESTS gate — every gated lock harness stays opt-in", () => {
  it(
    "skips cleanly and opens ZERO connections when the flag is unset (default suite)",
    async () => {
      const run = await runHarness(null);

      expect(run.timedOut).toBe(false);
      if (run.json === null) {
        throw new Error(`child jest produced no parseable JSON; stderr:\n${run.stderr}`);
      }
      const json = run.json;

      // Collected and skipped, not silently absent: `--runTestsByPath` exits 1
      // on "no tests found", and success=true cannot be a zero-test run.
      expect(run.code).toBe(0);
      expect(json.success).toBe(true);
      // Non-vacuous floor: today 3 tests in launch-free + 2 in U-4 + 1 + 1 in
      // the promo pair. The count
      // may grow; every collected test must be pending, which is asserted both
      // globally and per file below.
      expect(json.numTotalTests).toBeGreaterThanOrEqual(7);
      expect(json.numPendingTests).toBe(json.numTotalTests);
      expect(json.numPassedTests).toBe(0);
      expect(json.numFailedTests).toBe(0);

      // It really ran every gated harness, and every one of their tests is
      // pending — not just the global totals.
      const files = json.testResults.map((t) => t.name.replace(/\\/g, "/"));
      expect(files).toHaveLength(GATED_HARNESSES.length);
      for (const gated of GATED_HARNESSES) {
        expect(files.some((f) => f.endsWith(gated))).toBe(true);
      }
      for (const tr of json.testResults) {
        const statuses = (tr.assertionResults ?? []).map((a) => a.status);
        expect(statuses.length).toBeGreaterThan(0);
        expect(statuses.every((s) => s === "pending")).toBe(true);
      }

      // THE safety property: no TCP connection was ever attempted, so no SQL
      // can have run, so the shared `packages` table was never touched.
      expect(run.connections).toBe(0);
    },
    CASE_TIMEOUT_MS + 30_000,
  );

  it(
    "fault injection: with the gate open and NO scratch URL the harness REFUSES before any connection — RUN A is not vacuous",
    async () => {
      const run = await runHarness("1", [LAUNCH_FREE_HARNESS]);

      expect(run.timedOut).toBe(false);
      if (run.json === null) {
        throw new Error(`child jest produced no parseable JSON; stderr:\n${run.stderr}`);
      }
      const json = run.json;

      // The gate-open run was collected and failed — in beforeAll, on the
      // scratch-URL policy (tests/concurrency/scratch-db-url.ts).
      expect(json.numTotalTests).toBeGreaterThanOrEqual(3);
      expect(json.success).toBe(false);
      expect(json.numFailedTests).toBeGreaterThanOrEqual(1);
      expect(json.numPassedTests).toBe(0);
      expect(run.code).not.toBe(0);
      const message = json.testResults[0]?.message ?? "";
      expect(message).toMatch(/SCRATCH_DATABASE_URL/);

      // THE safety property this policy exists for: a forgotten override can
      // never run scratch databases on DATABASE_URL (which _load-env fills
      // from .env.local — the SHARED dev project). The refusal fires BEFORE
      // any connection, so the shared cluster cannot have been touched.
      expect(run.connections).toBe(0);
      expect(run.scratchConnections).toBe(0);
    },
    CASE_TIMEOUT_MS + 30_000,
  );
});

describe("SCRATCH_DATABASE_URL policy — preferred over DATABASE_URL, required to run", () => {
  it(
    "prefers SCRATCH_DATABASE_URL: the scratch listener sees the attempts, the DATABASE_URL listener sees NONE",
    async () => {
      const run = await runHarness("1", [LAUNCH_FREE_HARNESS], { scratch: "poison" });

      expect(run.timedOut).toBe(false);
      if (run.json === null) {
        throw new Error(`child jest produced no parseable JSON; stderr:\n${run.stderr}`);
      }
      const json = run.json;

      // The instrument is live (this replaces the old RUN B non-vacuity role):
      // the child really connected — to the SCRATCH listener.
      expect(run.scratchConnections).toBeGreaterThanOrEqual(1);
      // THE preference property: DATABASE_URL was set and reachable and was
      // never touched — a set SCRATCH_DATABASE_URL wins outright.
      expect(run.connections).toBe(0);
      // Both listeners refuse at the socket, so the run fails on the connection.
      expect(json.success).toBe(false);
      expect(run.code).not.toBe(0);
      const message = json.testResults[0]?.message ?? "";
      expect(message).toMatch(/ECONNRESET|ECONNREFUSED|CONNECT_TIMEOUT/i);
    },
    CASE_TIMEOUT_MS + 30_000,
  );
});
