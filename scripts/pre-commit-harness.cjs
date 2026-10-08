#!/usr/bin/env node
/**
 * pre-commit-harness.cjs — on-demand proof that every stage of
 * scripts/git-hooks/pre-commit (and every exit path of
 * scripts/git-hooks/pre-push, via --push) still BLOCKS what it claims to block
 * and still PASSES what it claims to pass.
 *
 * Usage:
 *   node scripts/pre-commit-harness.cjs                 # all 8 gates, block+pass
 *   node scripts/pre-commit-harness.cjs --gate 5        # one gate
 *   node scripts/pre-commit-harness.cjs --push          # drive scripts/git-hooks/pre-push
 *   node scripts/pre-commit-harness.cjs --push --gate 4 # one pre-push exit path
 *   node scripts/pre-commit-harness.cjs --list
 *   node scripts/pre-commit-harness.cjs --json
 *   node scripts/pre-commit-harness.cjs --keep          # leave the worktree behind
 *   node scripts/pre-commit-harness.cjs --base <ref>    # default: HEAD
 *   node scripts/pre-commit-harness.cjs --no-copy       # test HEAD's tools, not the
 *                                                        # working tree's
 * Also importable: require("./scripts/pre-commit-harness.cjs").GATES / .PUSH_GATES
 *
 * WHY THIS EXISTS
 * The hook is seven stages of shell plumbing around seven subprocesses, and the
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
 * PRE-PUSH MODE (--push)
 * scripts/git-hooks/pre-push has two stages but FOUR `exit 1` sites — missing
 * tsc, tsc failure (or timeout), missing scripts/check-web-imports.js, and a
 * failing native import check — so `--push` numbers its cases by exit path, not
 * by stage. Each case carries its own fixture, and every run is fed the ref
 * list git passes on stdin (the hook ignores it today; the stub keeps the
 * invocation faithful and a future stdin reader from meeting an empty stream).
 * The pass direction is the BASELINE here: unlike pre-commit there is nothing
 * to stage, so a clean tree must print all three success markers in one run.
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

const ROOT = path.resolve(path.dirname(module.filename), "..");// __dirname is undefined under the eval Module wrapper some loaders use;
// module.filename is the reliable anchor for require() paths below.
const HARNESS_DIR = __dirname || path.dirname(module.filename) || 'scripts';
const LINT_BASELINE_PATH = path.join(HARNESS_DIR, '.eslint-lint-baseline.json');
const LINT_BASELINE = (function() { const _p = LINT_BASELINE_PATH; try { const _r = require(_p); if (_r && typeof _r === 'object' && _r !== null && !Array.isArray(_r)) { return _r; } } catch (e) {} return {}; })();
const HOOK = path.join("scripts", "git-hooks", "pre-commit");
const PUSH_HOOK = path.join("scripts", "git-hooks", "pre-push");

/** Working-tree versions of both hooks and every gate/tool they invoke. */
const TOOL_FILES = [
  HOOK,
  PUSH_HOOK,
  path.join("scripts", "check-web-imports.js"),
  path.join("scripts", "check-vacuous-assertions.js"),
  path.join("scripts", "check-date-in-sql.js"),
  path.join("maestro", "tools", "flow-xcheck.cjs"),
  // Stage 3's advisory screen-affinity tier SPAWNS this at run time. The harness
  // worktree sits at the base commit, so without the copy the tier degrades to
  // "unavailable" there instead of exercising the real reachability report.
  path.join("scripts", "audit-nav-integrity.cjs"),
  path.join("maestro", "tools", "testid-idempotence.cjs"),
  path.join("maestro", "tools", "testid-map-freshness.cjs"),
  path.join("maestro", "tools", "testid-flow-currency.cjs"),
  // The locale-only ratchet reads this at RUN time. It must be copied into the
  // worktree or stage 3's missing-baseline guard aborts every harness case.
  path.join("maestro", "tools", "flow-locale-baseline.json"),
  // Stage 3's dead-copy tier consumes these at RUN time too (same class as the
  // two spawn notes above): the suppressions file, the orphan-audit resolver
  // and its baseline (the live-values corpus REFUSES to run without the
  // baseline). The CONTENT those tools scan — flows, app source, locales, the
  // testID map — is CORPUS, not tools, and is overlaid wholesale below.
  path.join("maestro", "tools", "flow-xcheck-suppressions.json"),
  path.join("scripts", "audit-i18n-orphans.cjs"),
  path.join("scripts", "i18n-orphan-baseline.json"),
  path.join("maestro", "tools", "testid-manifest.cjs"),
  path.join("maestro", "tools", "add-testids.cjs"),
  // Stage 8 (lint) resolves eslint config from the worktree root, so the
  // worktree must carry the WORKING TREE's .eslintrc.json — not the base
  // commit's. Without this, a commit that changes the lint config is tested
  // against the old one.
  path.join(".eslintrc.json"),
  // The lint gate now ratchets new warnings against this committed baseline. The
  // baseline is generated from the committed tree by
  // scripts/capture-eslint-baseline.cjs, which runs the lint gate's EXACT lint
  // invocation (same scope, same flags, same ESLINT_USE_FLAT_CONFIG) and stores
  // one entry per lint target so the gate can detect a NEW warning on a
  // currently-clean file. The backlog can only shrink.
  path.join(".eslint-lint-baseline.json"),
];

/**
 * Committed lint baseline for the lint-gate ratchet.
 *
 * This is generated from the committed tree by scripts/capture-eslint-baseline.cjs,
 * which runs the lint gate's EXACT lint invocation (same scope, same flags, same
 * ESLINT_USE_FLAT_CONFIG) and stores one entry per lint target so the gate can
 * detect a NEW warning on a currently-clean file. The backlog can only shrink.
 */

/**
 * CORPUS — the content the gates SCAN (as opposed to the tools they run).
 * Replaced WHOLESALE per directory, because deletions are state too: the base
 * commit still contains flows/screens/locale keys the working tree has deleted
 * or fixed, and a per-file copy would leave exactly that stale content behind.
 * Overlaying the corpus is what keeps the worktree a CONSISTENT state — without
 * it the run pairs the WORKING-TREE gates with the base commit's corpus and
 * reports findings that exist in neither state. MEASURED 2026-10-05 (twice):
 * gate 3's pass case blocked first on HEAD-era locale/suppressions skew, and
 * after those were overlaid, on HEAD-era flows + source + map carrying two
 * dead-copy findings and one new locale-only literal the working tree had
 * already fixed. The harness proves the GATES behave on the working tree's
 * corpus; the committed-state question belongs to the CI jobs, which audit the
 * checkout.
 */
const CORPUS_DIRS = [
  path.join("maestro", "flows"),
  "app",
  "components",
  "i18n",
];
/** Selector resolution reads the map as data — same class as the dirs above. */
const CORPUS_FILES = [path.join("maestro", "tools", "testid-map.json")];

/** A benign app/ edit: every later stage RUNS on it, and all of them pass. */
const BENIGN_APP_EDIT = "app/(auth)/_layout.tsx";
/** A screen file carrying testIDs, for the faults that need one. */
const SCREEN_WITH_IDS = "app/(auth)/_layout.tsx";
/** A screen whose deletion drops its ids out of the regenerated map. */
const SCREEN_TO_DELETE = "app/(auth)/driver-notifications-permission.tsx";
/**
 * Fixtures for the stage 6 (flow-currency) cases.
 *
 * These use a DELETED SCREEN, not a renamed testID, and that is load-bearing
 * rather than incidental. A hand-rename of a testID never reaches stage 6: it
 * fails stage 4 first, because stripping every testID and regenerating no longer
 * reproduces the file ("strip→regen did not round-trip"). That makes a rename the
 * WRONG fixture here — the harness would be proving stage 4, and stage 6 would
 * never run. A DELETION, by contrast, slips past stage 4 precisely because stage
 * 4 filters on ACM and drops deletions, while stage 5 (ACMRD) still validates the
 * regenerated map and passes. That is the real reachable gap this gate closes:
 * drop a screen, regenerate the map, commit, and no earlier stage notices that
 * flows still select its testIDs.
 *
 * FLOW_SELECTED_SCREEN holds ids that maestro/flows/** genuinely selects;
 * UNFLOW_SELECTED_SCREEN holds only ids no flow selects, so deleting it must stay
 * green. That pair is what proves the gate blocks real orphans without blocking
 * ordinary app/ work.
 */
const FLOW_SELECTED_SCREEN = "app/(auth)/phone-entry.tsx";
const UNFLOW_SELECTED_SCREEN = "app/(auth)/driver-enable-location.tsx";
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
        // Dead copy was an ADVISORY until 2026-10-03; this case exists so a
        // regression back to non-blocking is caught by the harness rather than
        // discovered on device as a 30s timeout. The literal is deliberately
        // nonsense that can appear in no locale value and no source string.
        name: "blocks a staged flow asserting copy that renders nowhere (dead copy is now blocking)",
        expect: "block",
        apply: (ctx) =>
          ctx.write(
            "maestro/flows/harness-probe.yaml",
            'appId: com.ride.bd\n---\n- assertVisible: "Zzzq harness dead copy that renders nowhere zzzq"\n'
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
    key: "flow-currency",
    title: "testID flow currency",
    blockBanner: "testID flow-currency gate failed",
    ranMarker: "flow currency gate:",
    cases: [
      {
        name: "blocks deleting a screen whose testIDs a flow still selects (stage 4's ACM filter never sees it)",
        expect: "block",
        apply: (ctx) => {
          ctx.gitRm(FLOW_SELECTED_SCREEN);
          ctx.regenMap();
        },
      },
      {
        name: "passes deleting a screen no flow selects",
        expect: "pass",
        apply: (ctx) => {
          ctx.gitRm(UNFLOW_SELECTED_SCREEN);
          ctx.regenMap();
        },
      },
    ],
  },
  {
    n: 7,
    key: "shellcheck",
    title: "shellcheck (shell scripts)",
    blockBanner: "ShellCheck gate failed",
    ranMarker: "ShellCheck gate: clean",
    cases: [
      {
        // The probe is written into the worktree and staged, so `git ls-files`
        // discovers it alongside the repo's real scripts — the gate lints the
        // whole discovered set on every commit, not only staged changes.
        name: "blocks a tracked shell script carrying a shellcheck finding (SC2086)",
        expect: "block",
        apply: (ctx) =>
          ctx.write(
            "harness-probe.sh",
            "#!/bin/sh\n# harness probe — deliberately unquoted expansion (SC2086)\necho $harness_unquoted\n"
          ),
      },
      {
        name: "passes a clean shell script and reports that it linted",
        expect: "pass",
        apply: (ctx) =>
          ctx.write("harness-probe.sh", "#!/bin/sh\n# harness probe\necho \"harness probe\"\n"),
      },
    ],
  },
  {
    n: 8,
    key: "lint",
    title: "eslint (staged files only)",
    // The hook lints with --quiet, so a warning cannot block; only a parse error
    // can block. This gate is pinned to the `.cjs` branch of the lint stage: the
    // harness always runs `ESLINT_USE_FLAT_CONFIG=false`, and both
    // `.eslintrc.json` and `.eslint-lint-baseline.json` are copied into the
    // worktree so the case exercises the WORKING TREE's config and committed lint
    // surface, not the base commit's. The baseline ratchets new warnings: a staged
    // file that adds a lint target to a currently-clean file fails the gate (the
    // backlog can only shrink).
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

/**
 * The pre-push gate table. One gate per `exit 1` site, numbered by exit path.
 * The PASS direction is the baseline (see HOOKS): pre-push reads the filesystem,
 * not the index, so there is no staged edit to force the stages to run — a clean
 * tree that prints all three success markers in one run is the proof.
 *
 * `blockAlso` is the ordering guard: exits 3 and 4 sit BEHIND a green type
 * check, so their cases also require `✅ Type check passed.` in the output. If
 * the stages are ever reordered, the banner can still appear while that marker
 * cannot, and the case fails instead of silently proving the wrong path.
 */
const PUSH_GATES = [
  {
    n: 1,
    key: "tsc-missing",
    title: "missing TypeScript (guarded before any npx fetch)",
    blockBanner: "❌ TypeScript not found at",
    cases: [
      {
        name: "blocks when node_modules/typescript/bin/tsc is absent",
        expect: "block",
        // `apply` returns an UNDO the runner always runs (even on throw): the
        // fault IS the absent link, and leaving it off would break later cases.
        apply: (ctx) => {
          unlinkNodeModules(ctx.wt);
          return () => {
            const relinked = linkNodeModules(ctx.wt);
            if (
              !relinked ||
              !fs.existsSync(path.join(ctx.wt, "node_modules", "typescript", "bin", "tsc"))
            ) {
              throw new HarnessError("could not re-link node_modules after the missing-tsc case");
            }
          };
        },
      },
    ],
  },
  {
    n: 2,
    key: "tsc-failed",
    title: "tsc failure (type error; the timeout branch shares this exit site)",
    // Both banners sit at the same `exit 1`. The fixture exercises the type-error
    // branch; listing both keeps the timeout wording under the same guard.
    blockBanner: ["❌ Type check failed (exit", "❌ Type check TIMED OUT after"],
    cases: [
      {
        name: "blocks a type error anywhere in the project",
        expect: "block",
        apply: (ctx) =>
          ctx.write("lib/harness-push-probe.ts", 'export const broken: number = "not a number";\n'),
      },
    ],
  },
  {
    n: 3,
    key: "imports-script-missing",
    title: "missing scripts/check-web-imports.js",
    blockBanner: "❌ scripts/check-web-imports.js is missing",
    blockAlso: ["✅ Type check passed."],
    cases: [
      {
        name: "blocks when the native import checker is missing",
        expect: "block",
        apply: (ctx) => ctx.gitRm("scripts/check-web-imports.js"),
      },
    ],
  },
  {
    n: 4,
    key: "node-only-import",
    title: "node-only import in client-reachable code",
    blockBanner: "❌ Native import check failed",
    blockAlso: ["✅ Type check passed."],
    cases: [
      {
        name: "blocks a ws import in lib/ that tsc accepts (stage 1 must pass first)",
        expect: "block",
        // `ws` is the canonical Metro UnableToResolveError example and @types/ws
        // is installed, so the file type-checks and only the import check blocks.
        apply: (ctx) =>
          ctx.write(
            "lib/harness-push-probe.ts",
            'import WebSocket from "ws";\n\nexport const pushProbe = WebSocket;\n'
          ),
      },
    ],
  },
];

/**
 * The stdin git supplies to a pre-push hook: one line per ref,
 * `<local ref> SP <local oid> SP <remote ref> SP <remote oid>`. Today's hook
 * ignores it; the stub keeps each run faithful to a real push (and a future
 * stdin-reading hook from meeting an empty stream).
 */
function prePushStdin(sha) {
  return `refs/heads/harness ${sha} refs/heads/harness ${sha}\n`;
}

/**
 * The hooks this harness can drive. Each spec owns its case table, its stdin
 * stub, and its baseline shape: pre-commit stages a benign app/ edit so its
 * later stages execute; pre-push checks the filesystem (nothing to stage) and
 * its baseline is the pass direction, asserted via the three success markers.
 */
const HOOKS = {
  "pre-commit": {
    hookFile: HOOK,
    gates: GATES,
    baselineEdit: BENIGN_APP_EDIT,
    baselineMarkers: [],
    stdin: null,
  },
  "pre-push": {
    hookFile: PUSH_HOOK,
    gates: PUSH_GATES,
    baselineEdit: null,
    baselineMarkers: ["✅ Type check passed.", "✅ Native import check passed.", "✅ Pre-push checks passed."],
    stdin: prePushStdin,
  },
};

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

/**
 * Run one real hook in the worktree. Never throws on a blocking exit.
 * Pre-push additionally receives git's ref list on stdin; with `input` set,
 * execFileSync writes it to a pipe and closes the stream, exactly like git.
 */
function runHook(cwd, spec, stdin) {
  try {
    const stdout = execFileSync("bash", [spec.hookFile], {
      cwd,
      encoding: "utf8",
      stdio: [stdin === null ? "ignore" : "pipe", "pipe", "pipe"],
      ...(stdin === null ? {} : { input: stdin }),
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
  // The shellcheck gate (stage 7) lints the DISCOVERED shell scripts — its
  // inputs, not tools. Overlay them from the root worktree for the same reason
  // as TOOL_FILES: the worktree sits at the base commit, and MEASURED
  // 2026-10-05 showed a HEAD-vs-worktree divergence (HEAD's
  // maestro/utils/bootstrap-device-day.sh carried SC2034/SC2164 the working
  // tree had already fixed) that failed the baseline and masked every case.
  // The harness proves the GATES behave; the committed-state question belongs
  // to the CI shellcheck job, which lints the checkout.
  for (const rel of shellScriptSet(root)) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(wt, rel));
    copied.push(rel);
  }
  // Corpus is replaced WHOLESALE (rm + recursive copy), not copied file by
  // file: the working tree's DELETIONS must propagate too, or the base
  // commit's stale screens/flows come back and the gates find findings that
  // the root working tree does not have.
  for (const rel of CORPUS_DIRS) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(wt, rel);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    copied.push(rel + "/");
  }
  for (const rel of CORPUS_FILES) {
    const src = path.join(root, rel);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(wt, rel));
    copied.push(rel);
  }
  return copied;
}

/** The shellcheck gate's input set — the same discovery its hook stage uses. */
function shellScriptSet(root) {
  return git(["ls-files", "*.sh", "scripts/git-hooks/*"], root)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
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
 * Remove a worktree's node_modules link WITHOUT touching its target. lstat
 * reports a junction as a symlink, so unlink removes the link itself.
 */
function unlinkNodeModules(wt) {
  const linkPath = path.join(wt, "node_modules");
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) fs.unlinkSync(linkPath);
  } catch {
    /* already gone */
  }
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
      // `-f` is deliberate. copyTools() rewrites tracked tools from the root
      // working tree, and with core.autocrlf=true that byte-identical copy is
      // reported as "locally modified" (LF where the checkout expects CRLF), so
      // a plain `git rm` refuses. This is a fault injector — removal is the point.
      git(["rm", "-f", "-q", "--", rel], wt);
    },
    /**
     * Regenerate the testID manifest from the worktree and stage it. Stage 6
     * only fires on a correctly-regenerated map (a stale one is stage 5's job),
     * so its cases MUST regen or they would prove nothing.
     */
    regenMap() {
      git(["add", "--", "app"], wt);
      try {
        execFileSync(process.execPath, ["maestro/tools/testid-manifest.cjs"], {
          cwd: wt,
          stdio: "pipe",
        });
      } catch (err) {
        throw new HarnessError(`testid-manifest.cjs failed in the worktree:\n${err.stderr || err.stdout || err.message}`);
      }
      git(["add", "--", "maestro/tools/testid-map.json"], wt);
    },
  };
}

/**
 * Run the harness for one hook.
 * @returns {{ok: boolean, hook: string, baseline: object, results: object[], worktree: string|null}}
 *   Never calls process.exit — the CLI owns the exit code.
 */
function runHarness({ hook = "pre-commit", gates, base = "HEAD", copy = true, keep = false, onCase } = {}) {
  const spec = HOOKS[hook];
  if (!spec) throw new HarnessError(`no such hook: ${hook} (known: ${Object.keys(HOOKS).join(", ")})`);
  const selected =
    gates && gates.length ? spec.gates.filter((g) => gates.includes(g.n) || gates.includes(g.key)) : spec.gates;
  if (!selected.length) throw new HarnessError(`no such gate: ${gates && gates.join(",")}`);

  // mkdtemp gives a collision-proof name, but git worktree add refuses a path
  // that already exists — so take the name and hand the empty directory back.
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "precommit-harness-"));
  fs.rmdirSync(wt);
  let link = null;
  const results = [];
  let baseline = null;

  try {
    // Checkout with autocrlf=false: the host's Windows config would otherwise
    // write CRLF into the worktree's shell scripts and the shellcheck gate
    // (gate 7) would report SC1017 on every one — the case results would be
    // measuring the host's EOL conversion instead of the gates. Linux CI checks
    // out LF; this makes the harness see the same bytes CI does.
    git(["-c", "core.autocrlf=false", "worktree", "add", "--detach", "--quiet", wt, base], ROOT);
    // After `worktree add` — the link target is inside the directory it creates.
    link = linkNodeModules(wt);
    copyTools(ROOT, wt, { copy });

    // Precondition: the baseline tree must pass. If this fails, no case result
    // below can be trusted — a hook that blocks the baseline would make its own
    // block case look correct. Pre-commit stages a benign app/ edit so its later
    // stages execute; pre-push needs no edit (it reads the filesystem, not the
    // index) and instead asserts its three success markers below.
    resetToBase(ROOT, wt, { copy });
    if (spec.baselineEdit) makeCtx(wt).append(spec.baselineEdit, "\n// harness baseline probe\n");
    // Pre-push hooks receive git's ref list on stdin; execFileSync closes the
    // stream after writing, exactly like git does after the ref list.
    const stdin = spec.stdin ? spec.stdin(git(["rev-parse", "HEAD"], wt).trim()) : null;
    const b = runHook(wt, spec, stdin);
    const missingMarkers = (spec.baselineMarkers || []).filter((m) => !b.output.includes(m));
    const ranStages = selected.filter((g) => g.ranMarker && b.output.includes(g.ranMarker)).map((g) => g.n);
    baseline = {
      code: b.code,
      ok: b.code === 0 && missingMarkers.length === 0,
      ranStages,
      markersRequired: spec.baselineMarkers || [],
      missingMarkers,
      edited: Boolean(spec.baselineEdit),
      output: b.output,
    };

    for (const gate of selected) {
      for (const c of gate.cases) {
        resetToBase(ROOT, wt, { copy });
        // `apply` may return an UNDO function (the missing-tsc case unlinks
        // node_modules); the runner calls it in a finally so a throwing case
        // cannot leave shared state broken for the cases after it.
        const undo = c.apply(makeCtx(wt));
        try {
          const r = runHook(wt, spec, stdin);
          const problems = [];
          if (c.expect === "block") {
            const banners = Array.isArray(gate.blockBanner) ? gate.blockBanner : [gate.blockBanner];
            if (r.code === 0) problems.push(`expected the hook to BLOCK but it exited 0`);
            if (!banners.some((b) => r.output.includes(b))) {
              problems.push(
                `expected gate ${gate.n} to report ${banners.map((s) => JSON.stringify(s)).join(" or ")}, but it did not. ` +
                  `Either a different stage blocked first, or this gate's wording changed — in which ` +
                  `case update the ${hook} gate table in scripts/pre-commit-harness.cjs.`
              );
            }
            // blockAlso proves an EARLIER stage ran and passed before this exit
            // was reached (the pre-push import exits sit behind a green tsc).
            for (const m of gate.blockAlso || []) {
              if (!r.output.includes(m)) {
                problems.push(
                  `expected ${JSON.stringify(m)} before the block, but it is absent — an earlier stage did not run or did not pass`
                );
              }
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
        } finally {
          if (typeof undo === "function") undo();
        }
      }
    }

    return {
      ok: baseline.ok && results.every((r) => r.ok),
      hook,
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
        unlinkNodeModules(wt);
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
// Wrapped in a function on purpose: `return` to bail after --json is legal in
// CommonJS (Node's module wrapper) but a PARSE ERROR to ESLint, which is how
// this file stayed green only while .cjs was outside lint coverage.
function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  // --push selects the other hook; --gate then numbers ITS exit paths.
  const hookName = argv.includes("--push") ? "pre-push" : "pre-commit";
  const spec = HOOKS[hookName];

  if (argv.includes("--list")) {
    console.log(`${hookName} harness cases (${hookName === "pre-push" ? "exit path" : "gate"}: expectation — case):`);
    for (const g of spec.gates) {
      console.log(`\n  ${g.n}. ${g.title}   [${g.key}]`);
      for (const c of g.cases) console.log(`     ${c.expect.padEnd(5)} — ${c.name}`);
    }
    console.log(
      `\nRun: node scripts/pre-commit-harness.cjs ${hookName === "pre-push" ? "--push " : ""}[--gate ${spec.gates[0].n}] [--json] [--keep] [--base <ref>] [--no-copy]`
    );
    process.exit(0);
  }

  const gateArg = argv.includes("--gate") ? argv[argv.indexOf("--gate") + 1] : null;
  const baseArg = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "HEAD";
  const gates = gateArg ? gateArg.split(",").map((s) => (/^\d+$/.test(s) ? Number(s) : s.trim())) : undefined;

  let run;
  try {
    run = runHarness({
      hook: hookName,
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
            const unit = hookName === "pre-push" ? "exit" : "gate";
            console.log(`${tag} ${unit} ${r.gate} ${r.expect.padEnd(5)} ${r.name}  (hook exit ${r.code})`);
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
    if (b.missingMarkers.length) {
      console.error(`   the baseline never printed: ${b.missingMarkers.join(", ")}`);
    }
    console.error(b.output.split("\n").slice(-15).join("\n"));
  } else {
    const detail = b.markersRequired.length
      ? `all ${b.markersRequired.length} stage markers present`
      : `gates that RAN: ${b.ranStages.join(", ") || "none"}`;
    console.log(`✅ baseline: clean tree${b.edited ? " + benign app/ edit" : ""} passes (${detail})`);
  }
  if (!run.nodeModulesLinked) {
    console.warn("⚠ node_modules is not linked into the worktree — checks that need it will report");
    console.warn("  a missing module instead of running, so their cases prove nothing. Run npm ci first.");
  }

  const failed = run.results.filter((r) => !r.ok);
  console.log(
    `\n${failed.length === 0 ? "✅" : "❌"} ${run.hook} harness: ` +
      `${run.results.length - failed.length}/${run.results.length} cases behave as claimed`
  );
  if (failed.length) {
    const unit = run.hook === "pre-push" ? "exit" : "gate";
    console.error(`\n${failed.map((r) => `  ${unit} ${r.gate} (${r.expect}) ${r.name}`).join("\n")}`);
  }
  for (const r of run.results) if (r.note) console.log(`\n   ${r.note}`);
  process.exitCode = run.ok ? 0 : 1;
}

if (require.main === module) main();

module.exports = {
  runHarness,
  GATES,
  PUSH_GATES,
  HOOKS,
  TOOL_FILES,
  CORPUS_DIRS,
  CORPUS_FILES,
  prePushStdin,
  HarnessError,
};