#!/usr/bin/env node
/**
 * One-shot capture of the committed tree's lint surface for the lint-gate ratchet.
 *
 * The lint gate only lints STAGED files, but on a clean committed tree nothing is
 * staged, so the committed surface is whatever the gate WOULD lint if those files
 * were staged. We capture that surface here so new warnings against it fail the
 * lint gate, while the existing backlog can only shrink.
 *
 * This must reproduce the gate's EXACT lint invocation — same files, same flags,
 * same ESLINT_USE_FLAT_CONFIG — otherwise it ratchets a different lint path than
 * the hook ships, which is exactly the drift the rest of this file already fights.
 *
 * Output: .eslint-lint-baseline.json — { "<relative path>": [{ ruleId, line, hash }] }
 *
 * Note: ESLint on this machine writes deprecation/ignore warnings to stderr and the
 * real JSON payload to stdout. We deliberately ignore stderr: warnings are not lint
 * findings, and the gate itself ships `>"$LINT_LOG" 2>&1` only so a transient spawn
 * flake can be retried — it still gates on grep "error", not on warnings.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ESCOPE = [
  'app',
  'lib',
  'components',
  'scripts',
  'maestro',
  'tests',
  'theme',
];

function main() {
  let raw;
  try {
    raw = execFileSync('node', [
      'node_modules/eslint/bin/eslint.js',
      '--quiet',
      '--format', 'json',
      ...ESCOPE,
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ESLINT_USE_FLAT_CONFIG: 'false' },
    });
  } catch (e) {
    // ESLint writes deprecation/ignore warnings to stderr and a nonzero rc even on a
    // successful JSON payload. If stdout parsed as JSON we still use it.
    if (e.stdout) raw = e.stdout.toString();
    else {
      console.error('eslint capture failed to produce stdout');
      console.error((e.stderr || '').toString().slice(0, 400));
      process.exit(1);
    }
  }

  let hits;
  try {
    hits = JSON.parse(raw);
  } catch (e) {
    console.error('eslint json parse failed');
    console.error(raw.slice(0, 400));
    process.exit(1);
  }

  const map = {};
  for (const h of hits) {
    if (!h.filePath) continue;
    const rel = path.relative(process.cwd(), h.filePath).split(path.sep).join('/');
    if (!map[rel]) map[rel] = [];
    for (const m of (h.messages || [])) {
      map[rel].push({
        ruleId: m.ruleId || 'unknown',
        line: m.line,
        hash: (m.message || '').slice(0, 64),
      });
    }
  }

  fs.writeFileSync(
    '.eslint-lint-baseline.json',
    JSON.stringify(map, null, 2) + '\n',
  );

  const files = Object.keys(map).length;
  const messages = Object.values(map).reduce((a, b) => a + b.length, 0);
  console.log(`baseline written: ${files} files, ${messages} messages`);
}

main();
