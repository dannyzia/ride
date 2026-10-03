/**
 * Meta gate: the date-in-sql pre-commit gate must never report success when it
 * could not determine what to scan.
 *
 * Purpose:     The ISSUE-47 gate (raw JS Date in a sql template crashes
 *              postgres.js) resolved its staged file list with
 *              `catch { return [] }`. An empty list is indistinguishable from
 *              "nothing staged", so ANY git failure — no repo, git missing,
 *              index locked — made stage 2 print "No source files to scan" and
 *              exit 0. That is the worst shape a commit gate can fail in: a
 *              green result that means nothing was checked. Nothing tested it,
 *              which is why it survived.
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - scripts/check-date-in-sql.js — the CLI under test (--staged feeds the hook)
 *   - scripts/check-vacuous-assertions.js — sibling gate, already correct; the
 *     parity case below exists so the two do not drift apart again
 *   - scripts/git-hooks/pre-commit — stage 2, the only consumer that matters here
 * Last verified: 2026-10-03, coding model — fault injection via GIT_DIR: before
 *   the fix the CLI exited 0 on "git unreadable"; after it exits 1. Both gates'
 *   normal paths re-checked green in the same session.
 * How to update: if the staged-file lookup ever moves, re-run the fault
 *   injection below rather than trusting the assertion — the bug is invisible in
 *   normal operation by construction.
 */
import { execFileSync } from "child_process";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

/**
 * Run a gate CLI with git deliberately unreadable.
 *
 * GIT_DIR=/nonexistent makes every `git diff --cached` fail inside the child,
 * which is the exact condition that used to produce a silent pass. Using an env
 * var rather than corrupting the real index keeps the fault injection inert:
 * nothing about this repo's git state changes.
 */
function runWithGitBroken(script: string): { code: number; output: string } {
  try {
    const stdout = execFileSync(process.execPath, [path.join(ROOT, script), "--staged"], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, GIT_DIR: path.join(ROOT, "node_modules", ".definitely-not-a-repo") },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, output: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: typeof e.status === "number" ? e.status : 1, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("date-in-sql gate — a git failure must never read as a pass", () => {
  it("exits non-zero when the staged file list cannot be read", () => {
    const { code } = runWithGitBroken("scripts/check-date-in-sql.js");
    // REGRESSION GUARD. This was 0: the gate printed "No source files to scan"
    // and reported success while having scanned nothing at all.
    expect(code).not.toBe(0);
  });

  it("does not print a clean bill of health on that path", () => {
    const { output } = runWithGitBroken("scripts/check-date-in-sql.js");
    // The exit code alone is not enough — a green-sounding message is what a
    // human reads in hook output, so it must not say "clean" / "✅" either.
    expect(output).not.toMatch(/✅/);
    expect(output).toMatch(/could not read the staged file list/i);
  });

  it("keeps parity with the sibling vacuous-assertion gate", () => {
    // Both gates resolve staged files via git and both must fail loudly when
    // that fails. The vacuous gate got this right first (null sentinel + an
    // explicit exit 1); the date-in-sql gate now matches instead of inventing a
    // third shape. If this case ever fails, the two have drifted again.
    const vacuous = runWithGitBroken("scripts/check-vacuous-assertions.js");
    const dateInSql = runWithGitBroken("scripts/check-date-in-sql.js");
    expect(vacuous.code).not.toBe(0);
    expect(dateInSql.code).not.toBe(0);
  });
});