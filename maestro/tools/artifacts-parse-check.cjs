/**
 * artifacts-parse-check.cjs — parses the two Maestro coverage artifacts and
 * validates their INTERNAL SHAPE.
 *
 * WHY THIS EXISTS (A1-1, found 2026-10-16): `maestro/tools/route-inventory.json`
 * was committed SYNTAX-CORRUPT — a comma was missing before the
 * `"admin/sample-media.tsx"` record — and every path in it had lost its `app/`
 * prefix. Nothing anywhere noticed, because:
 *   1. no gate reads the file (`route-scan.cjs` regenerates it on demand), and
 *      JSON.parse was never run against the COMMITTED copy; and
 *   2. the prefix loss is silent at the consumer end — every vertical matcher in
 *      `aggregate.cjs` anchors `^app\/`, so all 254 screens collapsed into
 *      `other` while the tool still exited 0 and printed plausible totals.
 * A corrupt manifest that nothing reads is still a corrupt manifest: it is the
 * reference humans and agents quote, and a hand-edit to it was invisible for
 * three weeks. This checker is the missing reader.
 *
 * SCOPE / STANDING (owner ruling 2026-10-16): `testid-map.json` is the LIVE
 * inventory (gate-enforced by pre-commit stages 5–7 and CI `maestro-drift`);
 * `route-inventory.json` is the Phase-0 deep-detail snapshot, refreshed ON
 * DEMAND. This file asserts only that both are PARSEABLE and SELF-CONSISTENT —
 * it deliberately does NOT assert that the inventory is up to date with `app/`,
 * because "current" is not a property that file is meant to have.
 *
 * ENV OVERRIDE: `ARTIFACTS_ROOT` points the checker at another directory holding
 * the two JSON files (default: this tool's own directory), matching the
 * `TESTID_MAP_APP_ROOT` / `APP_TESTIDS_ROOT` precedent so a test can drive it
 * against fixtures without touching the real artifacts.
 *
 * Exit codes: 0 clean · 1 a broken artifact · 2 the checker could not run
 * ("cannot check" must never be reported as a pass).
 *
 * The 1-vs-2 split is load-bearing and was WRONG in the first cut: a
 * syntax-corrupt artifact escaped as BrokenInputError and exited 2, i.e. it was
 * reported as a TOOLING failure rather than as the broken artifact it is. Only
 * file-level problems (missing / unreadable) mean "cannot run"; a document that
 * exists but is malformed is a finding. A caller that cannot tell those apart
 * will eventually treat the second as the first and stop reading the exit code.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = __dirname;

class BrokenInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrokenInputError';
  }
}

/** JSON.parse that reports WHICH artifact and WHERE, instead of a bare throw. */
function parseArtifact(text, label) {
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new BrokenInputError(`${label} is not valid JSON: ${e.message}`);
  }
}

/**
 * route-inventory.json — shape + the `app/` prefix on every screen path.
 *
 * The prefix rule is the load-bearing half. `route-scan.cjs` writes
 * `path.relative(repoRoot, abs)` and `aggregate.cjs` matches `^app\/…`, so a
 * de-prefixed inventory is not merely ugly: it silently de-attributes every
 * screen in the roll-up.
 */
function validateRouteInventory(text, label) {
  const errors = [];
  const inv = parseArtifact(text, label);
  if (inv === null || typeof inv !== 'object' || Array.isArray(inv)) {
    throw new BrokenInputError(`${label} is not an object`);
  }
  if (!Array.isArray(inv.screens)) {
    throw new BrokenInputError(`${label} has no screens array`);
  }
  if (typeof inv.routeFiles !== 'number') {
    errors.push(`${label}: routeFiles is not a number (${JSON.stringify(inv.routeFiles)})`);
  } else if (inv.routeFiles !== inv.screens.length) {
    errors.push(
      `${label}: routeFiles (${inv.routeFiles}) does not match screens.length (${inv.screens.length})`
    );
  }
  errors.push(...checkRouteInventoryPrefix(inv.screens, label));
  return { errors, screenCount: inv.screens.length };
}

/** Exported separately so a test can fault-inject THIS detector and prove it flips. */
function checkRouteInventoryPrefix(screens, label) {
  const errors = [];
  for (let i = 0; i < screens.length; i++) {
    const file = screens[i] && screens[i].file;
    if (typeof file !== 'string') {
      errors.push(`${label}: screens[${i}].file is not a string`);
      continue;
    }
    if (!file.startsWith('app/')) {
      errors.push(`${label}: screens[${i}].file "${file}" lost its app/ prefix`);
    }
  }
  return errors;
}

/**
 * testid-map.json — the gated live inventory. Its keys are relative to `app/`
 * (NO prefix), so the prefix rule above must not be applied here; the checks
 * that matter are that `total` really is the entry count and that every entry
 * carries a string id and a numeric line.
 */
function validateTestidMap(text, label) {
  const errors = [];
  const map = parseArtifact(text, label);
  if (map === null || typeof map !== 'object' || Array.isArray(map)) {
    throw new BrokenInputError(`${label} is not an object`);
  }
  if (map.screens === null || typeof map.screens !== 'object' || Array.isArray(map.screens)) {
    throw new BrokenInputError(`${label} has no screens object`);
  }
  if (typeof map.total !== 'number') {
    errors.push(`${label}: total is not a number (${JSON.stringify(map.total)})`);
  }
  let counted = 0;
  for (const [screen, entries] of Object.entries(map.screens)) {
    if (!Array.isArray(entries)) {
      errors.push(`${label}: screens["${screen}"] is not an array`);
      continue;
    }
    for (const entry of entries) {
      counted++;
      if (!entry || typeof entry.id !== 'string') {
        errors.push(`${label}: screens["${screen}"] has an entry without a string id`);
        continue;
      }
      if (typeof entry.line !== 'number') {
        errors.push(`${label}: screens["${screen}"] id "${entry.id}" has a non-numeric line`);
      }
    }
  }
  if (typeof map.total === 'number' && map.total !== counted) {
    errors.push(`${label}: total (${map.total}) does not match the entry count (${counted})`);
  }
  return { errors, screenCount: Object.keys(map.screens).length, idCount: counted };
}

const ARTIFACTS = [
  { file: 'route-inventory.json', validate: validateRouteInventory },
  { file: 'testid-map.json', validate: validateTestidMap },
];

/**
 * Run every check. Never throws for a BROKEN ARTIFACT (that is a reported
 * failure); throws BrokenInputError only when the checker itself cannot run
 * (an artifact missing from the root, or a read failure) so the CLI can exit 2.
 */
function runArtifactCheck(options) {
  const root = (options && options.root) || DEFAULT_ROOT;
  const errors = [];
  const stats = {};
  for (const { file, validate } of ARTIFACTS) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) {
      throw new BrokenInputError(`cannot run: ${file} not found in ${root}`);
    }
    let text;
    try {
      text = fs.readFileSync(abs, 'utf8');
    } catch (e) {
      throw new BrokenInputError(`cannot run: cannot read ${abs}: ${e.message}`);
    }
    let result;
    try {
      result = validate(text, file);
    } catch (e) {
      // The file EXISTS and was read, so a malformed document is a finding
      // (exit 1), never "cannot run" (exit 2). The read/missing guards above
      // stay outside this try on purpose: those are the only exit-2 paths.
      if (e instanceof BrokenInputError) {
        errors.push(e.message);
        continue;
      }
      throw e;
    }
    errors.push(...result.errors);
    stats[file] = {
      ...(result.screenCount !== undefined ? { screens: result.screenCount } : {}),
      ...(result.idCount !== undefined ? { ids: result.idCount } : {}),
    };
  }
  return { ok: errors.length === 0, errors, stats };
}

function main() {
  const root = process.env.ARTIFACTS_ROOT || DEFAULT_ROOT;
  let result;
  try {
    result = runArtifactCheck({ root });
  } catch (e) {
    if (e instanceof BrokenInputError) {
      process.stderr.write(`artifacts-parse-check: ${e.message}\n`);
      process.exit(2);
    }
    throw e;
  }
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (result.ok) {
    process.stdout.write(
      `✅ artifacts parse gate: clean (route-inventory ${result.stats['route-inventory.json'].screens} screens, all app/-prefixed; ` +
        `testid-map ${result.stats['testid-map.json'].ids} ids / ${result.stats['testid-map.json'].screens} screens)\n`
    );
  } else {
    process.stderr.write(`❌ artifacts parse gate: ${result.errors.length} finding(s)\n`);
    for (const e of result.errors) process.stderr.write(`   - ${e}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = {
  BrokenInputError,
  parseArtifact,
  checkRouteInventoryPrefix,
  validateRouteInventory,
  validateTestidMap,
  runArtifactCheck,
  ARTIFACTS,
};
