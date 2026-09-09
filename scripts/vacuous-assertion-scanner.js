/**
 * Vacuous-assertion scanner — CI gate core.
 *
 * Purpose:     Detect placeholder assertions that cannot fail, so vacuous tests
 *              cannot land again (lineal descendant of the 2026-09-08/09 staleness
 *              audits: activation/emergency, marketplace, driver/fleet — findings
 *              files in .kilo/plans/findings/).
 * Owner:       Coding model (test lane)
 * Status:      ACTIVE
 * Related (concrete paths):
 *   - scripts/check-vacuous-assertions.js — CLI wrapper (pre-commit hook + npm run check:vacuous)
 *   - scripts/smoke-vacuous-scanner.cjs — sentinel smoke (dev aid)
 *   - tests/meta/vacuous-assertion-gate.test.ts — in-suite gate + sentinel coverage
 *   - scripts/git-hooks/pre-commit — commit-time fence
 * Last verified: 2026-09-09, coding model, mutation checks (real vacuous test trips;
 *   comment-only mentions and variable-based expects do not)
 * How to update: extend PATTERNS only for new always-pass classes; every addition
 *   needs a sentinel case in the meta-test.
 *
 * Vacuous classes detected (line-based, after comment stripping):
 *   V1  expect(<literal>).toBe|toEqual|toStrictEqual(<same literal>)  — e.g. expect(true).toBe(true)
 *   V2a expect(<literal>).toBeDefined()                              — nothing literal is ever undefined
 *   V2b expect(<truthy literal>).toBeTruthy()                        — falsy literals excluded:
 *       expect(false|0|'').toBeTruthy() can only FAIL, so it is strict, not vacuous
 *
 * Known limitations (documented, accepted): single-line detection only; calls
 * split across lines are not flagged. All audit findings were single-line.
 */

'use strict';

/** @typedef {{ rule: string, file: string, line: number, snippet: string }} Violation */

/**
 * Literal class: true / false / integer / decimal / quoted string.
 * Used inline in the regex literals below.
 *   true|false|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*"
 * Truthy-only subclass (for toBeTruthy): drops false / 0 / '' .
 */

const PATTERNS = [
  {
    // V1: expect(<literal>).toBe|toEqual|toStrictEqual(<same literal>) — \1 backreference.
    rule: 'V1-same-literal',
    re: /expect\(\s*(true|false|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")\s*\)\s*\.\s*(toBe|toEqual|toStrictEqual)\(\s*\1\s*\)/,
  },
  {
    // V2a: toBeDefined passes for EVERY literal (a literal is never undefined).
    rule: 'V2-toBeDefined-literal',
    re: /expect\(\s*(?:true|false|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")\s*\)\s*\.\s*toBeDefined\(\s*\)/,
  },
  {
    // V2b: toBeTruthy passes only for truthy values — flag truthy literals only,
    // except numeric zero (Number(lit) === 0, covers 0 / 0.0 / -0), which is
    // falsy and therefore an always-FAIL (strict) assertion, not vacuous.
    rule: 'V2-toBeTruthy-truthy-literal',
    re: /expect\(\s*(true|-?\d+(?:\.\d+)?|'[^']+'|"[^"]+")\s*\)\s*\.\s*toBeTruthy\(\s*\)/,
    except: (m) => Number(m[1]) === 0,
  },
];

/** Directories never scanned (vendored/reference/build output). */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '_reference', 'admin-test-results', '.expo',
  '.kilo', 'dist', 'build', 'App Design', 'docs', '.venv',
]);

/** Roots scanned by the full-tree gate (CLI default; meta-test reuses this). */
const DEFAULT_ROOTS = ['tests', 'lib', 'utils-server', 'scripts', 'app', 'components', 'store', 'i18n'];

/**
 * The gate's own meta-test is the ONE exempt file: its job is to exercise the
 * rule set, so its fixture strings necessarily contain the patterns. This is
 * the same stance ESLint takes toward its rule-test fixtures. Real vacuous
 * tests elsewhere are still flagged everywhere (hook, CLI, meta gate).
 */
const GATE_SELF_FILES = new Set(['tests/meta/vacuous-assertion-gate.test.ts']);

/** Test-file classifier: *.test.* / *.spec.* or any file inside a __tests__ dir. */
function isTestFile(relPath) {
  const norm = relPath.replace(/\\/g, '/');
  if (/\.(test|spec)\.[jt]sx?$/.test(norm)) return true;
  return /(^|\/)__tests__\/[^/]+\.[jt]sx?$/.test(norm);
}

/**
 * Strips comments for matching purposes.
 * Full-line // and block-comment lines (trimmed start: //, *, /�) are dropped;
 * trailing // comments are removed by a quote-aware scan (a '//' inside a
 * string literal, e.g. a URL, does NOT start a comment; escapes honored).
 * Documented limitation: template-literal interiors are not tracked.
 */
function stripComments(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return '';
  let out = '';
  let inQuote = null; // "'" or '"' when inside a string literal
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      out += c;
      if (c === '\\') {
        out += line[i + 1] || '';
        i++;
      } else if (c === inQuote) {
        inQuote = null;
      }
      continue;
    }
    if (c === "'" || c === '"') {
      inQuote = c;
      out += c;
      continue;
    }
    if (c === '/' && line[i + 1] === '/') break; // rest of line is a comment
    out += c;
  }
  return out;
}

/**
 * Scans one file's content.
 * @param {string} file Label (usually repo-relative path)
 * @param {string} content
 * @returns {Violation[]}
 */
function scanContent(file, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const code = stripComments(lines[i]);
    if (!code) continue;
    for (const { rule, re, except } of PATTERNS) {
      const m = code.match(re);
      if (m && !(except && except(m))) {
        violations.push({ rule, file, line: i + 1, snippet: lines[i].trim() });
        break; // one violation per line is enough
      }
    }
  }
  return violations;
}

/**
 * Recursively collects test files under the given roots.
 * @param {string[]} roots Absolute or cwd-relative directories/files
 * @returns {string[]} file paths (as given, not resolved)
 */
function collectTestFiles(roots) {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  const walk = (p) => {
    let stat;
    try { stat = fs.statSync(p); } catch { return; }
    if (stat.isFile()) {
      if (isTestFile(p)) out.push(p);
      return;
    }
    if (!stat.isDirectory()) return;
    const base = path.basename(p);
    if (SKIP_DIRS.has(base)) return;
    let entries;
    try { entries = fs.readdirSync(p); } catch { return; }
    for (const e of entries) walk(path.join(p, e));
  };
  for (const r of roots) walk(r);
  return out;
}

/**
 * Scans the given paths (files or directories; directories are expanded to
 * their contained test files).
 * @param {string[]} roots
 * @returns {Violation[]}
 */
function scanPaths(roots) {
  const fs = require('fs');
  const files = [];
  for (const r of roots) {
    let stat;
    try { stat = fs.statSync(r); } catch { continue; }
    if (stat.isDirectory()) files.push(...collectTestFiles([r]));
    else if (isTestFile(r)) files.push(r);
  }
  const violations = [];
  for (const f of files) {
    if (GATE_SELF_FILES.has(f.replace(/\\/g, '/'))) continue; // see GATE_SELF_FILES
    let content;
    try { content = fs.readFileSync(f, 'utf8'); } catch { continue; }
    violations.push(...scanContent(f, content));
  }
  return violations;
}

module.exports = { PATTERNS, DEFAULT_ROOTS, GATE_SELF_FILES, scanContent, scanPaths, collectTestFiles, isTestFile, stripComments };
