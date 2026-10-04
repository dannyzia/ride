#!/usr/bin/env node
/**
 * Git hook installer — copies scripts/git-hooks/* into .git/hooks/,
 * makes them executable, and VERIFIES each one before accepting it.
 *
 * Usage:
 *   node scripts/install-hooks.js
 *   (or: npm run postinstall — already wired)
 *
 * WHY VERIFY INSTEAD OF BLINDLY COPYING:
 * Copying is not the same as working. A hook with a `set -e` regression, a bad
 * `|| true`, or a typo in a gate name installs cleanly, prints "✓ Installed",
 * and then silently permits every commit it was supposed to block — the failure
 * mode is invisible precisely because it looks like success. This installer
 * runs three checks on the INSTALLED copy (not the source, so a bad copy or a
 * chmod problem is caught too):
 *
 *   1. bash -n        syntax. Catches unbalanced quotes/braces before anything runs.
 *   2. shellcheck     lint. Catches quoting, unquoted expansions, SC2155-style
 *                     bugs. Skipped with a WARNING if shellcheck is absent — it is
 *                     not a project dependency, so its absence is not a failure.
 *   3. smoke run      `bash <hook>` in a THROWAWAY repo with nothing staged, on
 *                     empty stdin. This is the check that catches runtime breakage
 *                     the first two cannot: a hook that exits nonzero on a clean
 *                     tree, or that dies before printing anything.
 *
 * FAIL LOUDLY: any check that definitively fails (nonzero exit within the
 * timeout, syntax error, shellcheck error) causes the freshly-installed hook to
 * be REMOVED and the installer to exit 1. A half-installed gate is worse than a
 * missing one, because a missing gate is noticed and a silently-degraded one is
 * not. A timeout is reported as a WARNING, not a failure: pre-push runs a full
 * `tsc --noEmit`, so on a cold install it can legitimately exceed any sane cap
 * and that is inconclusive rather than proof of breakage.
 *
 * SKIP_HOOK_SMOKE=1 skips check 3 only. Use it where a full hook run is
 * prohibitively slow (CI `npm ci` / postinstall); checks 1 and 2 always run
 * because they are milliseconds.
 *
 * Safe to re-run: idempotent.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const HOOKS_DIR = path.join(__dirname, "..", "scripts", "git-hooks");
const GIT_HOOKS_DIR = path.join(__dirname, "..", ".git", "hooks");
const SMOKE_TIMEOUT_MS = 120000;

/** Run a command, never throwing. `timedOut` distinguishes "slow" from "failed". */
function run(cmd, args, opts = {}) {
  // NO `shell: true`. With a shell, the path "D:\My Projects\...\pre-commit" is
  // re-split on whitespace and bash receives "D:\My" — which fails as a missing
  // file and was misreported as a hook syntax error. Passing args as an array
  // keeps each argument intact regardless of spaces.
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    timeout: opts.timeout,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.env ? { env: opts.env } : {}),
    ...(opts.input !== undefined ? { input: opts.input } : {}),
  });
  return {
    ok: r.status === 0,
    status: r.status,
    signal: r.signal,
    timedOut: typeof r.error === "object" && r.error && r.error.code === "ETIMEDOUT",
    output: `${r.stdout || ""}${r.stderr || ""}`.trim(),
  };
}

/**
 * Smoke-run the installed hook in the REAL repo, against an EMPTY throwaway
 * index.
 *
 * A sandboxed clone was the obvious design and it does not work: the hooks call
 * repo-relative paths (`scripts/check-vacuous-assertions.js`,
 * `node_modules/typescript/bin/tsc`), so a bare `git init` temp dir makes every
 * gate fail on a missing module — indistinguishable from a broken hook. Copying
 * node_modules is not an option either (it is enormous, and Windows junctions
 * have already proven unreliable here).
 *
 * Instead: run in the real repo so every path resolves, but point GIT_INDEX_FILE
 * at a freshly emptied index. Nothing is staged, so every gate SKIPs, the hook
 * exits 0, and no gate writes anything (stage 4 rewrites app/ testIDs and stage 5
 * regenerates the map, but both only act on staged files). The developer's REAL
 * index is never touched — it is a different file on disk.
 */
function smokeRun(hookName, installedPath) {
  const repoRoot = path.join(__dirname, "..");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hook-smoke-"));
  const emptyIndex = path.join(tmp, "index");
  try {
    // `read-tree HEAD` (NOT --empty): the index must be POPULATED so gates that
    // read app/ from the index can do their work, with nothing staged relative to
    // HEAD so every gate takes its skip path. A truly empty index is not
    // representative — testid-map-freshness.cjs rightly refuses it ("the git
    // index has no files under app/"), which would make every install fail.
    let seed = run("git", ["read-tree", "HEAD"], {
      cwd: repoRoot,
      env: { ...process.env, GIT_INDEX_FILE: emptyIndex },
    });
    if (!seed.ok) {
      // No commits yet (fresh repo): fall back to an empty index.
      seed = run("git", ["read-tree", "--empty"], {
        cwd: repoRoot,
        env: { ...process.env, GIT_INDEX_FILE: emptyIndex },
      });
    }
    if (!seed.ok) {
      return { ok: false, reason: `could not build a clean index: ${seed.output || seed.status}` };
    }

    const r = run("bash", [installedPath], {
      cwd: repoRoot,
      timeout: SMOKE_TIMEOUT_MS,
      env: { ...process.env, GIT_INDEX_FILE: emptyIndex },
      input: "",
    });
    if (r.timedOut) {
      return {
        ok: true,
        warning:
          `smoke run exceeded ${SMOKE_TIMEOUT_MS / 1000}s and was inconclusive ` +
          `(pre-push runs a full tsc; expected on a cold install). Not treated as a failure.`,
      };
    }
    if (!r.ok) {
      return {
        ok: false,
        reason:
          `smoke run with nothing staged exited ${r.status}` +
          (r.output ? `:\n${indent(r.output)}` : " with no output"),
      };
    }
    // EXIT 0 IS NOT SUFFICIENT. A hook gutted to `exit 0` passes it trivially —
    // verified by fault injection on 2026-10-03, which is precisely the silent
    // regression this exists to catch. So also require that the hook actually
    // RAN: a real hook announces each gate it evaluates, and one that exits early
    // prints nothing. Without this the check only catches hooks that crash, not
    // hooks that have stopped blocking.
    if (!/\S/.test(r.output)) {
      return {
        ok: false,
        reason:
          "smoke run exited 0 but printed nothing. A hook that produces no output has\n" +
          "      exited before evaluating anything — usually `exit 0` near the top.\n" +
          "      Exit 0 alone proves nothing: a hook gutted to always succeed passes it.",
      };
    }
    return { ok: true };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function indent(s) {
  return s
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
}

function verify(hookName, installedPath) {
  const syntax = run("bash", ["-n", installedPath]);
  if (!syntax.ok) {
    return { ok: false, reason: `bash -n syntax error:\n${indent(syntax.output)}` };
  }

  const shellcheck = run("shellcheck", ["-x", installedPath]);
  if (shellcheck.status !== 0 && !shellcheck.timedOut) {
    // Distinguish "not installed" from "found it and it failed".
    const missing =
      shellcheck.status === 127 ||
      /not found|is not recognized|command not found/i.test(shellcheck.output);
    if (missing) {
      return { ok: true, warning: "shellcheck not installed — lint check skipped" };
    }
    return { ok: false, reason: `shellcheck reported errors:\n${indent(shellcheck.output)}` };
  }

  if (process.env.SKIP_HOOK_SMOKE === "1") {
    return { ok: true, warning: "smoke run skipped (SKIP_HOOK_SMOKE=1)" };
  }

  const smoke = smokeRun(hookName, installedPath);
  return { ok: smoke.ok, reason: smoke.reason, warning: smoke.warning };
}

function install() {
  if (!fs.existsSync(GIT_HOOKS_DIR)) {
    console.log("⚠️  .git/hooks/ not found — skipping hook install (not a git repo?).");
    return;
  }

  const hooks = fs
    .readdirSync(HOOKS_DIR)
    .filter((f) => !f.startsWith(".") && f !== "README.md")
    .filter((f) => !fs.statSync(path.join(HOOKS_DIR, f)).isDirectory());

  if (hooks.length === 0) {
    console.log("⚠️  No hooks found in scripts/git-hooks/");
    return;
  }

  const failures = [];

  for (const hook of hooks) {
    const src = path.join(HOOKS_DIR, hook);
    const dst = path.join(GIT_HOOKS_DIR, hook);

    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o755);

    const v = verify(hook, dst);
    if (!v.ok) {
      // Roll back: a half-installed, broken gate is worse than none, because a
      // missing gate gets noticed and a silently-degraded one does not.
      fs.rmSync(dst, { force: true });
      failures.push({ hook, reason: v.reason });
      console.error(`  ✗ ${hook} FAILED VERIFICATION — not installed (removed).`);
      console.error(`    ${v.reason}`);
      continue;
    }

    if (v.warning) console.log(`  ✓ Installed ${hook} (${v.warning})`);
    else console.log(`  ✓ Installed ${hook} — verified (bash -n, shellcheck, smoke run)`);
  }

  const installed = hooks.length - failures.length;
  if (failures.length) {
    console.error("");
    console.error(`❌ ${failures.length} of ${hooks.length} hook(s) failed verification and were NOT installed:`);
    for (const f of failures) console.error(`   - ${f.hook}`);
    console.error("   Fix the hook in scripts/git-hooks/, then re-run: node scripts/install-hooks.js");
    process.exit(1);
  }

  console.log(`✅ ${installed} git hook(s) installed and verified.`);
}

try {
  install();
} catch (err) {
  console.error("Hook install failed:", err.message);
  process.exit(1);
}