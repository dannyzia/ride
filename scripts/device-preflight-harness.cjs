#!/usr/bin/env node
/**
 * scripts/device-preflight-harness.cjs
 *
 * **Purpose:**     Local simulated-ubuntu replay of .github/workflows/
 *                  device-preflight.yml's `preflight` lane — offline. Catches
 *                  Linux-only Maestro-toolchain failures before pushing.
 * **Owner:**       Testing model (QA lane)
 * **Status:**      ACTIVE
 * **Source of truth:** .github/workflows/device-preflight.yml is the step
 *                  authority; this harness replays it and must not carry
 *                  logic of its own beyond the simulation.
 * **Related (concrete paths):**
 *   - .github/workflows/device-preflight.yml — the workflow whose steps this replays
 *   - maestro/utils/run-device-day.sh — the `--check` gate under test (step 5)
 *   - maestro/utils/adb-env-selftest.sh — single-adb pinning guard (step 6)
 *   - maestro/utils/section7-preflight-gate.sh — §7 gate guard (step 7)
 *   - tests/meta/device-preflight-harness.test.ts — drift pins (steps/scripts/markers)
 *   - scripts/pre-commit-harness.cjs — sibling harness; same worktree idiom
 * **Last verified:** 2026-10-05, by Coding model, 4/4 cases behave as claimed
 *   on the Windows dev host (see MEASURED below).
 * **How to update:** when device-preflight.yml's preflight steps change, update
 *   STEPS here in the same change — tests/meta/device-preflight-harness.test.ts
 *   fails on any name/marker drift. Never re-implement the scripts' logic here.
 *
 * WHAT "SIMULATED UBUNTU" MEANS (the simulation boundary, in full)
 * The hosted lane runs on ubuntu-latest with platform-tools + a Maestro install
 * and NO emulator/AVD. This harness reproduces those conditions from Windows:
 *   1. BYTES — a disposable git worktree checked out with core.autocrlf=false,
 *      so every script runs with the exact LF bytes a ubuntu checkout sees
 *      (the same idiom as scripts/pre-commit-harness.cjs; a CRLF .sh that would
 *      break Linux breaks here too, which is the point).
 *   2. ENV — LOCALAPPDATA / USERPROFILE / USERNAME / ANDROID_HOME /
 *      ANDROID_SDK_ROOT are stripped and ANDROID_AVD_HOME is pointed at an
 *      empty scratch dir, so the scripts' Windows resolution paths cannot fire
 *      and the dev machine's REAL AVD can never make a case pass by luck.
 *   3. TOOLS — stub `adb` and `maestro` executables stand in for the runner's
 *      platform-tools and Maestro install (exactly the subcommands the gate
 *      uses: `adb version`, `adb devices`, `maestro --version`). The PATH is
 *      filtered free of any directory carrying a real adb/emulator/maestro.
 *   4. NETWORK — the workflow's two install steps (sdkmanager platform-tools,
 *      `curl get.maestro.mobile.dev`) are reported as SIMULATED and never as
 *      passing: installing for real needs the network and would prove nothing
 *      about the toolchain. Everything else runs for real.
 *
 * MEASURED (2026-10-05, Windows dev host):
 *   - healthy: steps 2/5/6/7 exit 0 with their markers; the two device-bound
 *     checks report ⊘ SKIP under PREFLIGHT_DEVICE=optional exactly as the
 *     workflow documents for a device-less runner.
 *   - missing adb exits 1 with `adb not resolvable`; missing Maestro exits 1
 *     with `maestro CLI not found`; PREFLIGHT_DEVICE=required on this
 *     device-less host exits 1 with the device checks as ✗ hard failures and
 *     NO ⊘ skip anywhere — required can never soft-pass.
 *   - TRAP fixed here: run-device-day.sh falls back to the hardcoded path
 *     /c/maestro/bin/maestro, which EXISTS on this Windows host, so simply
 *     removing Maestro from PATH still reported "maestro: 2.6.1". The
 *     missing-maestro case therefore pins MAESTRO_BIN to a nonexistent path,
 *     closing both detection branches the script actually has.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

/**
 * The `preflight` job's steps, in order. `workflowStep` is the literal step
 * header in device-preflight.yml (name: value, or the uses: target for the
 * unnamed checkout step) — the meta test compares both directions, so a step
 * added to the workflow without a matching entry here FAILS the suite.
 */
const STEPS = [
  {
    n: 1,
    workflowStep: "actions/checkout@v7",
    title: "checkout (simulated: the disposable worktree is the checkout)",
    mode: "simulated",
  },
  {
    n: 2,
    workflowStep: "ShellCheck the Maestro scripts",
    title: "ShellCheck the Maestro scripts",
    mode: "run",
    // Same discovery + same analyzer as the workflow's run block; only the
    // apt-get install-if-missing half is dropped (offline — see boundary 4).
    script: `mapfile -t scripts < <(git ls-files 'maestro/**/*.sh')
if [ "\${#scripts[@]}" -eq 0 ]; then
  echo "no shell scripts found under maestro/ — the discovery pattern is broken"
  exit 1
fi
echo "shellcheck: linting \${#scripts[@]} script(s)"
shellcheck -x "\${scripts[@]}"`,
    requiresTool: "shellcheck",
    markers: ["shellcheck: linting"],
    markerSource: path.join(".github", "workflows", "device-preflight.yml"),
  },
  {
    n: 3,
    workflowStep: "Ensure adb is resolvable",
    title: "adb resolvable (simulated: stub adb stands in for platform-tools)",
    mode: "simulated",
  },
  {
    n: 4,
    workflowStep: "Install Maestro CLI",
    title: "Maestro CLI present (simulated: stub maestro stands in for the installer)",
    mode: "simulated",
  },
  {
    n: 5,
    workflowStep: "Device-day preflight (PREFLIGHT_DEVICE=optional)",
    title: "Device-day preflight (PREFLIGHT_DEVICE=optional)",
    mode: "run",
    script: "bash maestro/utils/run-device-day.sh --check",
    env: { PREFLIGHT_DEVICE: "optional" },
    markers: ["preconditions OK", "device-bound check(s) skipped"],
    markerSource: path.join("maestro", "utils", "run-device-day.sh"),
  },
  {
    n: 6,
    workflowStep: "Single-adb pinning self-test",
    title: "Single-adb pinning self-test",
    mode: "run",
    script: "bash maestro/utils/adb-env-selftest.sh",
    markers: ["PASS — one adb for every device script"],
    markerSource: path.join("maestro", "utils", "adb-env-selftest.sh"),
  },
  {
    n: 7,
    workflowStep: "§7 preflight gate self-test",
    title: "§7 preflight gate self-test",
    mode: "run",
    script: "bash maestro/utils/section7-preflight-gate.sh",
    markers: ["PASS — §7 gate fails fast"],
    markerSource: path.join("maestro", "utils", "section7-preflight-gate.sh"),
  },
];

/**
 * Four cases. `healthy` is the workflow replay; the three `block` cases are the
 * detection contract — the 2026-10-03 manual verification of this lane proved
 * these exit codes by hand, and they are pinned here so the harness can never
 * report green while its own detection is dead.
 */
const CASES = [
  {
    key: "healthy",
    expect: "pass",
    name: "simulated ubuntu: every runnable step passes with its run marker",
    steps: [1, 2, 3, 4, 5, 6, 7],
    stubs: { adb: true, maestro: true },
    exports: {},
    wantExit: 0,
    wantMarkers: ["shellcheck: linting", "preconditions OK", "device-bound check(s) skipped", "PASS — one adb for every device script", "PASS — §7 gate fails fast"],
  },
  {
    key: "missing-adb",
    expect: "block",
    name: "blocks when adb cannot be resolved (toolchain rot)",
    steps: [5],
    stubs: { adb: false, maestro: true },
    exports: {},
    wantExit: 1,
    wantMarkers: ["adb not resolvable"],
  },
  {
    key: "missing-maestro",
    expect: "block",
    name: "blocks when the Maestro CLI is missing (MAESTRO_BIN pinned dead — see MEASURED)",
    steps: [5],
    stubs: { adb: true, maestro: false },
    // Both detection branches must fail: PATH (filtered of maestro) AND the
    // configured binary. Without this override the hardcoded /c/maestro/bin
    // fallback exists on a Windows host and the case silently passes.
    exports: { MAESTRO_BIN: "/definitely/not/maestro" },
    wantExit: 1,
    wantMarkers: ["maestro CLI not found"],
  },
  {
    key: "required-no-device",
    expect: "block",
    name: "PREFLIGHT_DEVICE=required on a device-less host hard-fails (never ⊘ skip)",
    steps: [5],
    stubs: { adb: true, maestro: true },
    exports: { PREFLIGHT_DEVICE: "required" },
    wantExit: 1,
    wantMarkers: ["precondition(s) failed"],
    // The skip glyph skip_() prints. Under `required` the device-bound checks
    // must be ✗ hard failures — a ⊘ anywhere means the knob regressed.
    forbidMarkers: ["\u2298"],
  },
];

/** Stub executables answering exactly the subcommands the gate uses. */
const STUBS = {
  adb: `#!/usr/bin/env bash
# Harness stub — stands in for the runner's platform-tools adb.
case "\${1:-}" in
  version) printf 'Android Debug Bridge version 1.0.41\\nVersion 37.0.0-harness-stub\\n' ;;
  devices) printf 'List of devices attached\\n' ;;
  *) echo "harness adb stub: unsupported subcommand '\${1:-}'" >&2; exit 1 ;;
esac
`,
  maestro: `#!/usr/bin/env bash
# Harness stub — stands in for the runner's Maestro install.
case "\${1:-}" in
  --version|version) echo "2.6.1-harness-stub" ;;
  *) echo "harness maestro stub: unsupported subcommand '\${1:-}'" >&2; exit 1 ;;
esac
`,
};

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/**
 * The bash prelude every simulated step runs under. PATH filtering lives in
 * bash on purpose: bash owns the environment the scripts see, and node's
 * view of PATH on Windows (drive-letter, ';'-delimited) is not the view the
 * scripts get.
 */
function simPrelude({ stubDir, avdScratch, exports: extra = {} }) {
  const exportLines = Object.entries(extra)
    .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
    .join("\n");
  return `set -e
NEWPATH=${shellQuote(stubDir)}
IFS=: read -ra _dirs <<< "$PATH"
for d in "\${_dirs[@]}"; do
  [ -n "$d" ] || continue
  for t in adb adb.exe emulator emulator.exe maestro maestro.bat maestro.cmd; do
    if [ -e "$d/$t" ]; then continue 2; fi
  done
  NEWPATH="$NEWPATH:$d"
done
export PATH="$NEWPATH"
unset LOCALAPPDATA USERPROFILE USERNAME ANDROID_HOME ANDROID_SDK_ROOT ADB MAESTRO_BIN
export ANDROID_AVD_HOME=${shellQuote(avdScratch)}
${exportLines}`;
}

function makeStubs(stubs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dp-harness-stubs-"));
  for (const [name, body] of Object.entries(STUBS)) {
    if (!stubs[name]) continue;
    fs.writeFileSync(path.join(dir, name), body, { mode: 0o755 });
  }
  return dir;
}

function git(args, cwd = ROOT, { quiet = false } = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: quiet ? ["ignore", "pipe", "ignore"] : undefined,
  }).trim();
}

/**
 * Disposable LF worktree with the WORKING TREE's maestro/ laid over it —
 * the same reasoning as pre-commit-harness's CORPUS overlay: this harness must
 * judge the toolchain as it stands (uncommitted fixes included), and wholesale
 * replacement propagates deletions. The overlay is staged so `git ls-files`
 * also sees working-tree scripts that are not tracked yet — CI will see them
 * the moment they are committed.
 */
function makeWorktree() {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), "device-preflight-"));
  fs.rmdirSync(wt);
  git(["-c", "core.autocrlf=false", "worktree", "add", "--detach", "--quiet", wt, "HEAD"]);
  const dest = path.join(wt, "maestro");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "maestro"), dest, { recursive: true });
  // Staged only so `git ls-files` sees working-tree scripts that are not
  // tracked yet. autocrlf=false keeps the host's normalization out of it and
  // silences its per-file "LF will be replaced by CRLF" flood.
  git(["-c", "core.autocrlf=false", "add", "--", "maestro"], wt, { quiet: true });
  return wt;
}

function runBash(script, { cwd, env }) {
  try {
    const out = execFileSync("bash", ["-c", script], {
      cwd,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    return {
      code: typeof err.status === "number" ? err.status : 1,
      out: `${err.stdout || ""}${err.stderr || ""}`,
    };
  }
}

/**
 * Run one harness case. Returns { ok, problems, results } — `problems` names
 * exactly which claim broke (wrong exit, missing marker, forbidden marker, or
 * a run-step that never ran).
 */
function runCase(kase, { wt, avdScratch }) {
  const stubDir = makeStubs(kase.stubs);
  const env = { ...process.env };
  const results = [];
  const problems = [];
  let combined = "";

  try {
    for (const n of kase.steps) {
      const step = STEPS.find((s) => s.n === n);
      if (step.mode === "simulated") {
        results.push({ n, ran: false, simulated: true, code: 0 });
        continue;
      }
      if (step.requiresTool && runBash(`command -v ${step.requiresTool} >/dev/null`, { cwd: wt, env }).code !== 0) {
        // Offline honesty: a missing tool is a loud "not covered", never a
        // silent pass and never a fabricated failure.
        results.push({ n, ran: false, skipped: `requires ${step.requiresTool}, not installed`, code: 0 });
        continue;
      }
      const prelude = simPrelude({
        stubDir,
        avdScratch,
        exports: { ...(step.env || {}), ...(kase.exports || {}) },
      });
      const r = runBash(`${prelude}\n${step.script}`, { cwd: wt, env });
      combined += r.out;
      results.push({ n, ran: true, code: r.code });
      // Run markers are the PASS-direction claim only. In a block case the
      // transcript is supposed to lack them — asserting them there would fail
      // every healthy detection for exactly the right behavior.
      if (kase.wantExit === 0) {
        for (const m of step.markers || []) {
          if (!r.out.includes(m)) problems.push(`step ${n}: run marker not printed: ${JSON.stringify(m)}`);
        }
      }
    }

    if (kase.wantExit === 0) {
      for (const r of results.filter((x) => x.ran && x.code !== 0)) {
        problems.push(`step ${r.n}: exited ${r.code}, expected 0`);
      }
      for (const r of results.filter((x) => x.skipped)) {
        problems.push(`step ${r.n}: NOT COVERED — ${r.skipped}`);
      }
    } else {
      const gate = results.find((x) => x.ran);
      if (!gate) problems.push("no step ran — the block claim is vacuous");
      else if (gate.code === 0) problems.push(`step ${gate.n}: exited 0, expected non-zero (detection dead)`);
    }
    for (const m of kase.wantMarkers || []) {
      if (!combined.includes(m)) problems.push(`expected marker not printed: ${JSON.stringify(m)}`);
    }
    for (const m of kase.forbidMarkers || []) {
      if (combined.includes(m)) problems.push(`forbidden marker printed: ${JSON.stringify(m)}`);
    }
    return { ok: problems.length === 0, problems, results };
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}

/**
 * Run the harness.
 * @returns {{ok: boolean, cases: object[], worktree: string|null}}
 */
function runHarness({ cases, keep = false, onCase } = {}) {
  const selected = cases && cases.length
    ? CASES.filter((c) => cases.includes(c.key) || cases.includes(String(CASES.indexOf(c) + 1)))
    : CASES;
  if (!selected.length) throw new Error(`no such case: ${cases && cases.join(",")}`);

  const wt = makeWorktree();
  const avdScratch = fs.mkdtempSync(path.join(os.tmpdir(), "dp-harness-noavd-"));
  const results = [];
  try {
    for (const kase of selected) {
      const r = runCase(kase, { wt, avdScratch });
      results.push({ key: kase.key, expect: kase.expect, name: kase.name, ...r });
      if (onCase) onCase(results[results.length - 1]);
    }
    return { ok: results.every((r) => r.ok), cases: results, worktree: keep ? wt : null };
  } finally {
    fs.rmSync(avdScratch, { recursive: true, force: true });
    if (keep) {
      console.warn(`\n   worktree kept at ${wt} — remove with: git worktree remove --force "${wt}"`);
    } else {
      try {
        git(["worktree", "remove", "--force", wt]);
        git(["worktree", "prune"]);
      } catch (err) {
        console.warn(`⚠ harness cleanup failed (the worktree may still exist at ${wt}): ${err.message}`);
        console.warn(`  remove it with: git worktree remove --force "${wt}" && git worktree prune`);
      }
    }
  }
}

module.exports = { runHarness, STEPS, CASES };

// ── CLI ──────────────────────────────────────────────────────────────────────
// Wrapped in a function so `return` to bail after --json is legal.
(function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");

  if (argv.includes("--list")) {
    console.log("device-preflight harness (step: mode — title):");
    for (const s of STEPS) console.log(`  ${s.n}. ${s.mode.padEnd(9)} — ${s.title}`);
    console.log("\ncases (expect — name):");
    for (const c of CASES) console.log(`  ${c.expect.padEnd(5)} — ${c.key}: ${c.name}`);
    console.log("\nRun: node scripts/device-preflight-harness.cjs [--case <key>] [--json] [--keep]");
    return;
  }

  const caseArg = argv.includes("--case") ? [argv[argv.indexOf("--case") + 1]] : null;

  let run;
  try {
    run = runHarness({
      cases: caseArg,
      keep: argv.includes("--keep"),
      onCase: asJson
        ? null
        : (r) => {
            const tag = r.ok ? "✅" : "❌";
            console.log(`${tag} ${r.key.padEnd(18)} ${r.expect.padEnd(5)} ${r.name}`);
            r.problems.forEach((p) => console.log(`     ↳ ${p}`));
            const covered = r.results.filter((x) => x.ran).length;
            const sim = r.results.filter((x) => x.simulated).length;
            const skip = r.results.filter((x) => x.skipped);
            console.log(
              `       steps: ${covered} ran, ${sim} simulated` +
                (skip.length ? `, ${skip.length} NOT COVERED (${skip.map((s) => s.skipped).join("; ")})` : "")
            );
          },
    });
  } catch (err) {
    console.error(`❌ harness could not run: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    // NOT process.exit(): stdout to a pipe is async — set exitCode and return.
    console.log(JSON.stringify(run, null, 2));
    process.exitCode = run.ok ? 0 : 1;
    return;
  }

  const passed = run.cases.filter((r) => r.ok).length;
  if (run.ok) console.log(`\n✅ device-preflight harness: ${passed}/${run.cases.length} cases behave as claimed`);
  else console.log(`\n❌ device-preflight harness: ${passed}/${run.cases.length} cases behave as claimed`);
  process.exitCode = run.ok ? 0 : 1;
})();
