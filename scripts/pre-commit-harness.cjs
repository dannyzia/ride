#!/usr/bin/env node
/**
 * pre-commit-harness.cjs — on-demand proof that every stage of
 * scripts/git-hooks/pre-commit still BLOCKS what it claims to block and still
 * PASSES what it claims to pass.
 *
 * Usage:
 *   node scripts/pre-commit-harness.cjs                 # all 6 gates, block+pass
 *   node scripts/pre-commit-harness.cjs --gate 5        # one gate
 *   node scripts/pre-commit-harness.cjs --list
 *   node scripts/pre-commit-harness.cjs --json
 *   node scripts/pre-commit-harness.cjs --keep          # leave the worktree behind
 *   node scripts/pre-commit-harness.cjs --base <ref>    # default: HEAD
 *   node scripts/pre-commit-harness.cjs --no-copy       # test HEAD's tools, not the
 *                                                        # working tree's
 * Also importable: require("./scripts/pre-commit-harness.cjs").GATES
 *
 * WHY THIS EXISTS
 * The hook is six stages of shell plumbing around six subprocesses, and the
 * interesting properties of two of them are invisible from the outside: stage 4's
 * proof depends on a sandboxed --strip round-trip, stage 5's on materialising the
 * git index. Both were verified BY HAND, once, at the moment they were written.
 * A gate that nobody re-runs is a gate that quietly stops gating — a renamed
 * banner, a `--diff-filter` that starts dropping deletions, a remedy message that
 * no longer matches the code, and the failure mode is the worst kind: a green
 * hook that has stopped checking anything.
 *
 * It is deliberately NOT a jest test. Each case runs the REAL hook end to end
 * (~30s when every stage executes), because the property under test is the hook's
 * wiring — stage order, the exit-status handoff between stages, which stage
 * reports first — and none of that is reachable by calling a module. The fast,
 * precise assertions about the gates' internals already live in tests/meta/.
 *
 * HOW A CASE WORKS
 * One disposable `git worktree` is created once and reused. Per case: reset to
 * base, inject ONE fault, stage it, run the real hook, assert. The user's
 * checkout and index are never touched, and nothing runs against the working
 * tree's app/ — a fault injected here cannot reach real code.
 *
 * TWO THINGS THAT MAKE A CASE WORTH RUNNING
 * 1. A block case asserts WHICH gate reported, not just a nonzero exit. The hook
 *    exits at the first failure, so finding gate N's banner in the output is
 *    itself the proof that gates 1..N-1 passed.
 * 2. A pass case asserts the gate's "it ran" marker as well as exit 0. This is
 *    not paranoia: a run with nothing staged exits 0 with all six stages
 *    SKIPPED, which looks identical to a full green pipeline. The baseline check
 *    below exists for the same reason — it stages a benign app/ edit so stages
 *    2, 4, 5 and 6 actually execute.
 *
 * TWO TRAPS THIS FILE ALREADY WALKED INTO
 * - `git reset --hard` reverts the copied tool files along with everything else,
 *   so a generator pointed at the "sandbox" falls back to the real paths and
 *   silently overwrites the committed map. resetToBase() therefore re-copies
 *   after every reset, and copyTools() is what makes the run test the WORKING
 *   TREE's gates rather than HEAD's.
 * - node_modules cannot simply be required from the worktree: stage 6 resolves
 *   `node_modules/eslint/bin/eslint.js` RELATIVE TO CWD, so NODE_PATH does not
 *   help and a missing link is reported as "run: npm ci", which would look like a
 *   lint block. linkNodeModules() uses a directory junction on Windows (no
 *   elevation needed) and a symlink elsewhere, and the link is UNLINKED before
 *   the worktree is removed so a recursive delete can never reach the real one.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HOOK = path.join("scripts", "git-hooks", "pre-commit");

/** Working-tree versions of the hook and every gate it invokes. */
const TOOL_FILES = [
  HOOK,
  path.join("scripts", "check-vacuous-assertions.js"),
  path.join("scripts", "check-date-in-sql.js"),
  path.join("maestro", "tools", "flow-xcheck.cjs"),
  path.join("maestro", "tools", "testid-idempotence.cjs"),
  path.join("maestro", "tools", "testid-map-freshness.cjs"),
  path.join("maestro", "tools", "testid-manifest.cjs"),
  path.join("maestro", "tools", "add-testids.cjs"),
];

/** A benign app/ edit: every later stage RUNS on it, and all of them pass. */
const BENIGN_APP_EDIT = "app/(auth)/_layout.tsx";
/** A screen file carrying testIDs, for the faults that need one. */
const SCREEN_WITH_IDS = "app/(auth)/_layout.tsx";
/** A screen whose deletion drops its ids out of the regenerated map. */
const SCREEN_TO_DELETE = "app/(auth)/driver-notifications-permission.tsx";
/** date-in-sql only scans these dirs (check-date-in-sql.js SOURCE_DIRS). */
const SQL_PROBE = "lib/harness-probe.ts";

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/**
 * The gate table. `blockBanner` is the substring the hook prints when THAT gate
 * rejects a commit; `ranMarker` appears only when that gate actually executed
 * (its skip message is worded so it cannot contain the marker). tests/meta/
 * asserts every banner here still exists in the hook, so renaming one fails
 * there rather than silently making every block case pass for the wrong reason.
 */
const GATES = [
  {
    n: 1,
    key: "vacuous",
    title: "vacuous-assertions",
    blockBanner: "Vacuous-assertion gate failed",
    ranMarker: "Vacuous-assertion gate: clean",
    cases: [
      {
        name: "blocks a placeholder assertion in a staged test file",
        expect: "block",
        apply: (ctx) =>
          ctx.write(
            "tests/harness-probe/vacuous.test.ts",
            'describe("harness probe", () => {\n  it("placeholder", () => {\n    expect(true).toBe(true);\n  });\n});\n'
          ),
      },
      {
        name: "passes a real assertion in a staged test file",
        expect: "pass",
        apply: (ctx) =>
          ctx.write(
            "tests/harness-probe/real.test.ts",
            'describe("harness probe", () => {\n  it("adds", () => {\n    expect(1 + 1).toBe(2);\n  });\n});\n'
          ),
      },
    ],
  },
  {
    n: 2,
    key: "date-in-sql",
    title: "date-in-sql",
    blockBanner: "Date-in-sql gate failed",
    ranMarker: "Date-in-sql gate: clean",
    cases: [
      {
        name: "blocks a raw JS Date interpolated into a sql template",
        expect: "block",
        apply: (ctx) =>
          ctx.write(
            SQL_PROBE,
            'import { sql } from "drizzle-orm";\n\nexport const probe = sql`SELECT 1 WHERE ts > ${new Date()}`;\n'
          ),
      },
      {
        name: "passes a DB-side now() with no JS Date",
        expect: "pass",
        apply: (ctx) =>
          ctx.write(SQL_PROBE, 'import { sql } from "drizzle-orm";\n\nexport const probe = sql`SELECT now()`;\n'),
      },
    ],
  },
  {
    n: 3,
    key: "flow-selector",
    title: "Maestro flow selector",
    blockBanner: "Flow selector gate failed",
    ranMarker: "id: selectors:",
    cases: [
      {
        name: "blocks a staged flow using an id: selector that exists nowhere",
        expect: "block",
        apply: (ctx) =>
          ctx.write(
            "maestro/flows/harness-probe.yaml",
            'appId: com.ride.bd\n---\n- tapOn:\n    id: "harness.no-such-selector"\n'
          ),
      },
      {
        name: "passes when a staged flow only carries resolvable selectors",
        expect: "pass",
        apply: (ctx) => ctx.append("maestro/flows/shared/util/_open-settings-hub.yaml", "# harness probe\n"),
      },
    ],
  },
  {
    n: 4,
    key: "idempotence",
    title: "testID codemod idempotence (B-1)",
    blockBanner: "testID codemod idempotence gate failed",
    ranMarker: "testid idempotence: run-1",
    cases: [
      {
        name: "blocks a testID rename that the codemod cannot round-trip",
        expect: "block",
        apply: (ctx) => ctx.replaceIn(SCREEN_WITH_IDS, "_layout.set-theme", "_layout.set-theme-moved"),
      },
      {
        name: "passes an app/ edit that leaves every testID in place",
        expect: "pass",
        apply: (ctx) => ctx.append(BENIGN_APP_EDIT, "\n// harness probe\n"),
      },
    ],
  },
  {
    n: 5,
    key: "map-freshness",
    title: "testID map freshness",
    blockBanner: "testID map freshness gate failed",
    ranMarker: "testid map freshness:",
    cases: [
      {
        name: "blocks a staged screen deletion (stage 4's ACM filter never sees it)",
        expect: "block",
        apply: (ctx) => ctx.gitRm(SCREEN_TO_DELETE),
      },
      {
        name: "passes a line-only shift, which nothing downstream reads",
        // Inserted at the TOP so every testID in the file moves a line: the gate
        // must report the drift and still pass, or every cosmetic app/ edit
        // would break the commit.
        expect: "pass",
        apply: (ctx) => ctx.prepend(BENIGN_APP_EDIT, "// harness probe\n"),
      },
    ],
  },
  {
    n: 6,
    key: "lint",
    title: "eslint (staged files only)",
    // No rule in .eslintrc.json is set to "error" (0 errors / 302 warnings at
    // baseline), and the hook lints with --quiet, so a warning cannot block. A
    // PARSE error is the only realistic lint block, which is what this uses.
    blockBanner: "Lint failed",
    ranMarker: "Linting",
    cases: [
      {
        name: "blocks a staged file with a parse error",
        expect: "block",
        apply: (ctx) =>
          ctx.write("lib/harness-broken.ts", "export const broken = (: => {\n  return 1;\n};\n"),
      },
      {
        name: "passes a clean staged file and reports that it linted",
        expect: "pass",
        apply: (ctx) => ctx.append(BENIGN_APP_EDIT, "\n// harness probe\n"),
      },
    ],
  },
];

class HarnessError extends Error {}

function git(args, cwd, opts = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      ...(opts.input === undefined ? {} : { input: opts.input }),
    });
  } catch (err) {
    throw new HarnessError(`git ${args.join(" ")} failed (exit ${err.status}):\n${err.stderr || ""}`);
  }
}

/** Run the real hook in the worktree. Never throws on a blocking exit. */
function runHook(cwd) {
  try {
    const stdout = execFileSync("bash", [HOOK], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ESLINT_USE_FLAT_CONFIG: "false" },
    });
    return { code: 0, output: stdout };
  } catch (err) {
    return {
      code: typeof err.status === "number" ? err.status : 1,
      output: `${err.stdout || ""}${err.stderr || ""}`,
    };
  }
}

/**
 * Stage the working tree's hook and gates into the worktree. Without this the
 * run tests whatever the BASE COMMIT happens to contain, which is exactly the
 * stale version you are trying to test after editing a gate.
 */
function copyTools(root, wt, { copy }) {
  if (!copy) return [];
  const copied = [];
  for (const rel of TOOL_FILES) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(wt, rel));
    copied.push(rel);
  }
  return copied;
}

/**
 * Reset to base and re-stage the tools. The re-copy is mandatory: `reset --hard`
 * reverts the copied files, and a generator that has lost its sandbox override
 * writes to the real paths instead.
 */
function resetToBase(root, wt, opts) {
  git(["reset", "--hard", "--quiet"], wt);
  git(["clean", "-fdq"], wt);
  copyTools(root, wt, opts);
}

/**
 * Make node_modules reachable in the worktree. Stage 6 resolves eslint's entry
 * RELATIVE TO CWD, so NODE_PATH is not enough — it needs a real path. Windows
 * takes a junction, which needs no elevation; elsewhere a plain symlink.
 */
function linkNodeModules(wt) {
  const link = path.join(wt, "node_modules");
  const target = path.join(ROOT, "node_modules");
  if (fs.existsSync(link)) return null;
  if (!fs.existsSync(target)) return null;
  try {
    fs.symlinkSync(target, link, "junction");
  } catch (err) {
    return { skipped: `could not link node_modules (${err.code || err.message})` };
  }
  return fs.existsSync(path.join(link, "eslint", "bin", "eslint.js")) ? link : null;
}

function makeCtx(wt) {
  const abs = (rel) => path.join(wt, rel);
  return {
    wt,
    write(rel, content) {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), content, "utf8");
      git(["add", "--", rel], wt);
    },
    append(rel, text) {
      fs.appendFileSync(abs(rel), text, "utf8");
      git(["add", "--", rel], wt);
    },
    prepend(rel, text) {
      fs.writeFileSync(abs(rel), text + fs.readFileSync(abs(rel), "utf8"), "utf8");
      git(["add", "--", rel], wt);
    },
    replaceIn(rel, from, to) {
      const before = fs.readFileSync(abs(rel), "utf8");
      if (!before.includes(from)) throw new HarnessError(`fixture anchor not found in ${rel}: ${from}`);
      fs.writeFileSync(abs(rel), before.split(from).join(to), "utf8");
      git(["add", "--", rel], wt);
    },
    gitRm(rel) {
      git(["rm", "-q", "--", rel], wt);
    },
  };
}

/**
 * Run the harness.
 * @returns {{ok: boolean, baseline: object, results: object[], worktree: string|null}}
 *   Never calls process.exit — the CLI owns the exit code.
 */
function runHarness({ gates, base = "HEAD", copy = true, keep = false, onCase } = {}) {
  const selected = gates && gates.length ? GATES.filter((g) => gates.includes(g.n) || gates.includes(g.key)) : GATES;
  if (!selected.length) throw new HarnessError(`no such gate: ${gates && gates.join(",")}`);

  // mkdtemp gives a collision-proof name, but git worktree add refuses a path
  // that already exists — so take the name and hand the empty directory back.
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "precommit-harness-"));
  fs.rmdirSync(wt);
  let link = null;
  const results = [];
  let baseline = null;

  try {
    git(["worktree", "add", "--detach", "--quiet", wt, base], ROOT);
    // After `worktree add` — the link target is inside the directory it creates.
    link = linkNodeModules(wt);
    copyTools(ROOT, wt, { copy });

    // Precondition: a commit with a benign app/ edit must pass EVERY gate that
    // runs. If this fails, no case result below can be trusted — a gate that
    // blocks the baseline would make its own block case look correct.
    resetToBase(ROOT, wt, { copy });
    makeCtx(wt).append(BENIGN_APP_EDIT, "\n// harness baseline probe\n");
    const b = runHook(wt);
    const ranStages = selected
      .filter((g) => b.output.includes(g.ranMarker))
      .map((g) => g.n);
    baseline = {
      code: b.code,
      ok: b.code === 0,
      ranStages,
      output: b.output,
    };

    for (const gate of selected) {
      for (const c of gate.cases) {
        resetToBase(ROOT, wt, { copy });
        c.apply(makeCtx(wt));
        const r = runHook(wt);
        const problems = [];
        if (c.expect === "block") {
          if (r.code === 0) problems.push(`expected the hook to BLOCK but it exited 0`);
          if (!r.output.includes(gate.blockBanner)) {
            problems.push(
              `expected gate ${gate.n} to report ${JSON.stringify(gate.blockBanner)}, but it did not. ` +
                `Either a different stage blocked first, or this gate's wording changed — in which ` +
                `case update GATES in scripts/pre-commit-harness.cjs.`
            );
          }
        } else {
          if (r.code !== 0) problems.push(`expected the hook to PASS but it exited ${r.code}`);
          // The anti-vacuity assertion: a skipped gate also exits 0.
          if (!r.output.includes(gate.ranMarker)) {
            problems.push(
              `gate ${gate.n} never ran (${JSON.stringify(gate.ranMarker)} absent) — exit 0 here ` +
                `means SKIPPED, not passed`
            );
          }
        }
        const result = {
          gate: gate.n,
          key: gate.key,
          name: c.name,
          expect: c.expect,
          code: r.code,
          ok: problems.length === 0,
          problems,
          output: r.output,
        };
        results.push(result);
        if (onCase) onCase(result, { baseline });
      }
    }

    return {
      ok: baseline.ok && results.every((r) => r.ok),
      baseline,
      results,
      worktree: keep ? wt : null,
      nodeModulesLinked: Boolean(link),
    };
  } finally {
    if (keep) {
      console.warn(`\n   worktree kept at ${wt} — remove with: git worktree remove --force "${wt}"`);
    } else {
      // Never let cleanup REPLACE the real failure: a throw here would mask the
      // error from the try block that the caller actually needs to see.
      try {
        // Unlink the junction FIRST. `git worktree remove --force` deletes the
        // worktree directory recursively, and following a junction there would
        // mean deleting the real node_modules.
        const linkPath = path.join(wt, "node_modules");
        try {
          if (fs.lstatSync(linkPath).isSymbolicLink()) fs.unlinkSync(linkPath);
        } catch {
          /* already gone */
        }
        git(["worktree", "remove", "--force", wt], ROOT);
        git(["worktree", "prune"], ROOT);
        fs.rmSync(wt, { recursive: true, force: true });
      } catch (err) {
        console.warn(`⚠ harness cleanup failed (the worktree may still exist at ${wt}): ${err.message}`);
        console.warn(`  remove it with: git worktree remove --force "${wt}" && git worktree prune`);
      }
    }
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");

  if (argv.includes("--list")) {
    console.log("pre-commit harness cases (gate: expectation — case):");
    for (const g of GATES) {
      console.log(`\n  ${g.n}. ${g.title}   [${g.key}]`);
      for (const c of g.cases) console.log(`     ${c.expect.padEnd(5)} — ${c.name}`);
    }
    process.exit(0);
  }

  const gateArg = argv.includes("--gate") ? argv[argv.indexOf("--gate") + 1] : null;
  const baseArg = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD";
  const gates = gateArg ? gateArg.split(",").map((s) => (/^\d+$/.test(s) ? Number(s) : s.trim())) : undefined;

  let run;
  try {
    run = runHarness({
      gates,
      base: baseArg,
      copy: !argv.includes("--no-copy"),
      keep: argv.includes("--keep"),
      // No progress output in --json mode: anything else on stdout would make
      // the document unparseable for the caller asking for machine-readable.
      onCase: asJson
        ? undefined
        : (r) => {
            const tag = r.ok ? "✅" : "❌";
            console.log(`${tag} gate ${r.gate} ${r.expect.padEnd(5)} ${r.name}  (hook exit ${r.code})`);
            r.problems.forEach((p) => console.log(`     ↳ ${p}`));
            if (!r.ok) {
              const tail = r.output.split("\n").filter((l) => l.trim()).slice(-12);
              console.log(tail.map((l) => `       │ ${l}`).join("\n"));
            }
          },
    });
  } catch (err) {
    console.error(`❌ harness could not run: ${err.message}`);
    process.exit(1);
  }

  if (asJson) {
    // NOT process.exit(): stdout to a pipe is async, and exiting immediately can
    // truncate a large write — and this payload embeds every case's full hook
    // output. Setting exitCode lets node flush on a natural exit, with the same
    // status.
    console.log(JSON.stringify(run, null, 2));
    process.exitCode = run.ok ? 0 : 1;
    return;
  }

  const b = run.baseline;
  console.log("");
  if (!b.ok) {
    console.error(`❌ BASELINE FAILED (hook exit ${b.code}). Every case below would be meaningless —`);
    console.error("   fix the baseline (or pass --base <ref>) before reading any other result.");
    console.error(b.output.split("\n").slice(-15).join("\n"));
  } else {
    console.log(`✅ baseline: clean tree + benign app/ edit passes (gates that RAN: ${b.ranStages.join(", ") || "none"})`);
  }
  if (!run.nodeModulesLinked) {
    console.warn("⚠ node_modules is not linked into the worktree — stage 6 (eslint) will report");
    console.warn("  'eslint not found' instead of linting, so its cases prove nothing. Run npm ci first.");
  }

  const failed = run.results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? "✅" : "❌"} pre-commit harness: ` +
      `${run.results.length - failed.length}/${run.results.length} cases behave as claimed`
  );
  if (failed.length) {
    console.error(`\n${failed.map((r) => `  gate ${r.gate} (${r.expect}) ${r.name}`).join("\n")}`);
  }
  for (const r of run.results) if (r.note) console.log(`\n   ${r.note}`);
  process.exitCode = run.ok ? 0 : 1;
}

module.exports = { runHarness, GATES, TOOL_FILES, HarnessError };