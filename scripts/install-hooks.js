#!/usr/bin/env node
/**
 * Git hook installer — copies scripts/git-hooks/* into .git/hooks/
 * and makes them executable.
 *
 * Usage:
 *   node scripts/install-hooks.js
 *   (or: npm run postinstall — already wired)
 *
 * Safe to re-run: idempotent.
 */

const fs = require("fs");
const path = require("path");

const HOOKS_DIR = path.join(__dirname, "..", "scripts", "git-hooks");
const GIT_HOOKS_DIR = path.join(__dirname, "..", ".git", "hooks");

function install() {
  if (!fs.existsSync(GIT_HOOKS_DIR)) {
    console.log("⚠️  .git/hooks/ not found — skipping hook install (not a git repo?).");
    return;
  }

  const hooks = fs.readdirSync(HOOKS_DIR).filter((f) => !f.startsWith(".") && f !== "README.md");

  if (hooks.length === 0) {
    console.log("⚠️  No hooks found in scripts/git-hooks/");
    return;
  }

  for (const hook of hooks) {
    const src = path.join(HOOKS_DIR, hook);
    const dst = path.join(GIT_HOOKS_DIR, hook);

    // Skip if src is a directory
    if (fs.statSync(src).isDirectory()) continue;

    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o755);
    console.log(`  ✓ Installed ${hook}`);
  }

  console.log(`✅ ${hooks.length} git hook(s) installed.`);
}

try {
  install();
} catch (err) {
  console.error("Hook install failed:", err.message);
  process.exit(1);
}
