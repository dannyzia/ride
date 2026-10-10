#!/usr/bin/env node
/**
 * scripts/purge-shellcheck-disables.cjs
 *
 * Stage-8 ratchet step 1: PURGE.
 *
 * Given the set of shell script files this commit stages (discovered by the
 * same `git ls-files` query stage 7 uses), reads every
 * `# shellcheck disable=X,Y,...` line and deletes each disable key that is NOT
 * present in scripts/shellcheck-disable-baseline.json. If a file is left with
 * no disables at all, the entire disable line is deleted from that file.
 *
 * Exits 0 when nothing needed purging; 1 when at least one disable was removed.
 * Never adds a new disable to the baseline — that is step 3 (RATSET) only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'scripts', 'shellcheck-disable-baseline.json');
const staged = process.argv[2];
if (!staged) {
  console.error('usage: purge-shellcheck-disables.cjs <staged-file-or-directory>');
  process.exit(2);
}

// Allow a check that the harness bats against a sandbox copy of `app/`: stage
// the directory, and the tool only reads files below the project root that
// exist in the sandbox. For the real `git ls-files` set, paths are clean.
function realPath(p) {
  return path.resolve(root, path.relative(staged, p));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[purge] cannot read baseline ${file}: ${e.message}`);
    process.exit(2);
  }
}

const baseline = readJson(baselinePath);
const baselineFiles = new Set(Object.keys(baseline));

// Discover staged shell files (same set stage 7 uses).
let files;
try {
  const { execFileSync } = require('child_process');
  let out = execFileSync('git', ['ls-files', '--', staged], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  files = out.split(/\r?\n/).filter(Boolean);
} catch (e) {
  // git ls-files may fail if run outside a repo or with an empty path; fall back
  // to a filesystem scan of the staged tree for the harness sandbox case.
  files = [];
  const stack = [staged];
  const seen = new Set();
  while (stack.length) {
    const dir = stack.pop();
    if (seen.has(dir)) continue;
    seen.add(dir);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.isFile() && (ent.name.endsWith('.sh') || full.endsWith('.cjs') || full.endsWith('.js'))) {
        files.push(full);
      }
    }
  }
}

let purged = 0;
for (const file of files) {
  const abs = realPath(file);
  if (!abs.startsWith(root)) continue;
  let src = fs.readFileSync(abs, 'utf8');
  const lines = src.split(/\r?\n/);
  let changed = false;
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('# shellcheck disable=')) { out.push(raw); continue; }
    const rest = line.slice('# shellcheck disable='.length);
    let keys;
    try { keys = JSON.parse(rest); } catch (e) {
      // legacy unquoted comma list; shellcheck accepts `# shellcheck disable=SC1008,SC1009`
      keys = rest.split(',').map((k) => k.trim()).filter(Boolean);
    }
    const kept = keys.filter((k) => baselineFiles.has(k));
    if (kept.length === keys.length) { out.push(raw); continue; }
    changed = true;
    purged += keys.length - kept.length;
    if (kept.length > 0) {
      out.push(`# shellcheck disable=${kept.join(',')}`);
    }
    // else: drop the line entirely
  }
  if (changed) {
    fs.writeFileSync(abs, out.join('\n') + '\n', 'utf8');
    console.log(`[purge] ${path.relative(root, abs)} — removed ${keys.length - kept.length} stale disable key(s)`);
  }
}

if (purged > 0) {
  console.error(`[purge] ${purged} stale disable key(s) removed from ${files.length} file(s)`);
  process.exit(1);
}
console.log('[purge] nothing stale — nothing to purge');
process.exit(0);
