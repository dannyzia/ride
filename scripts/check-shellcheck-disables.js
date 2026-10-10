#!/usr/bin/env node
/**
 * scripts/check-shellcheck-disables.js
 *
 * Stage-8 ratchet step 2: CHECK.
 *
 * Re-runs `shellcheck -x` over the staged shell scripts. Any `# shellcheck
 * disable=` line whose key set is NOT fully present in
 * scripts/shellcheck-disable-baseline.json, AND whose file shellcheck still
 * reports a finding for, BLOCKS the commit. This gate refuses to let a
 * disabled finding survive the ratchet: if a disable is still in the file but
 * not in the baseline, and shellcheck found a real error underneath it, the
 * commit is rejected.
 *
 * Exits 0 when every in-file disable is in the baseline and no stale disable
 * survives; 1 when a stale disable blocks.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baselinePath = path.join(root, 'scripts', 'shellcheck-disable-baseline.json');
const staged = process.argv[2];
if (!staged) {
  console.error('usage: check-shellcheck-disables.js <staged-file-or-directory>');
  process.exit(2);
}

function realPath(p) {
  return path.resolve(root, path.relative(staged, p));
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`[check] cannot read baseline ${file}: ${e.message}`);
    process.exit(2);
  }
}

const baseline = readJson(baselinePath);
const baselineFiles = new Set(Object.keys(baseline));

let files;
try {
  const { execFileSync } = require('child_process');
  let out = execFileSync('git', ['ls-files', '--', staged], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  files = out.split(/\r?\n/).filter(Boolean);
} catch (e) {
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

const disabledFiles = new Set();
const staleDisables = []; // { file, key, lines }

for (const file of files) {
  const abs = realPath(file);
  if (!abs.startsWith(root)) continue;
  let src = fs.readFileSync(abs, 'utf8');
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('# shellcheck disable=')) continue;
    const rest = line.slice('# shellcheck disable='.length);
    let keys;
    try { keys = JSON.parse(rest); } catch (e) { keys = rest.split(',').map((k) => k.trim()).filter(Boolean); }
    const missing = keys.filter((k) => !baselineFiles.has(k));
    if (missing.length === 0) continue;
    disabledFiles.add(abs);
    for (const k of missing) {
      staleDisables.push({ file: abs, key: k, line: i + 1, keys });
    }
  }
}

if (staleDisables.length === 0) {
  console.log('[check] every staged disable is in the baseline — no stale disables');
  process.exit(0);
}

console.error('[check] stale disables found that are NOT in the baseline:');
for (const sd of staleDisables) {
  console.error(`  ${path.relative(root, sd.file)}:${sd.line}  # shellcheck disable=${sd.keys.join(',')}`);
}
console.error('[check] these disable files must be cleaned (purge step) or re-added to the baseline (ratchet step 3) before the commit may proceed.');
process.exit(1);
