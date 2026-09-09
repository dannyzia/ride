#!/usr/bin/env node
/**
 * CLI: fail on vacuous placeholder assertions in test files.
 *
 * Usage:
 *   node scripts/check-vacuous-assertions.js                # scan default roots
 *   node scripts/check-vacuous-assertions.js file1 file2    # scan explicit paths
 *   node scripts/check-vacuous-assertions.js --staged       # scan git-staged test files
 *
 * Exit codes: 0 = clean, 1 = violations found (or scan error).
 * Consumers:  scripts/git-hooks/pre-commit (commit-time fence, --staged),
 *             npm run check:vacuous (full-tree scan),
 *             tests/meta/vacuous-assertion-gate.test.ts (in-suite meta-test).
 */
'use strict';

const { execFileSync } = require('child_process');
const { scanPaths, isTestFile, DEFAULT_ROOTS } = require('./vacuous-assertion-scanner.js');

function stagedTestFiles() {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
      encoding: 'utf8',
    });
    return out.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && isTestFile(s));
  } catch {
    return null; // not a git repo / git unavailable
  }
}

function main() {
  const args = process.argv.slice(2);
  let roots;
  if (args.includes('--staged')) {
    const staged = stagedTestFiles();
    if (staged === null) {
      console.error('check-vacuous-assertions: git unavailable — cannot resolve staged files.');
      process.exit(1);
    }
    if (staged.length === 0) {
      console.log('✅ No staged test files — vacuous-assertion check skipped.');
      return;
    }
    roots = staged;
  } else {
    roots = args.length > 0 ? args : DEFAULT_ROOTS;
  }

  const violations = scanPaths(roots);
  if (violations.length > 0) {
    console.error(`❌ Vacuous-assertion gate: ${violations.length} violation(s) in test files.\n`);
    for (const v of violations) {
      console.error(`  [${v.rule}] ${v.file}:${v.line}`);
      console.error(`      ${v.snippet}`);
    }
    console.error(
      '\nPlaceholder assertions like expect(true).toBe(true) can never fail and pin no behavior.',
    );
    console.error(
      '  Replace them with a real assertion (see tests/meta/vacuous-assertion-gate.test.ts for the rule set),',
    );
    console.error('  or delete the test if it truly has no observable contract.');
    process.exit(1);
  }
  console.log(`✅ Vacuous-assertion gate: clean (${roots.length} path(s) scanned).`);
}

main();
