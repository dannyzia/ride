#!/usr/bin/env node
/**
 * scripts/check-i18n-braces.cjs — repo-wide gate against single-brace
 * interpolation params in locale values.
 *
 * Why: react-i18next interpolates `{{name}}`; a value written `{name}` is left
 * verbatim on screen ("Debt ceiling: {amount}") instead of rendering the amount.
 * The bug is invisible to every other gate: the key exists, both locales agree,
 * the call site passes the param, and tsc/lint never read locale JSON. It was
 * found by hand in monetization.ceiling_warn / shop.packages.* (2026-11-10) and
 * the fix had no regression net. This is that net.
 *
 * What it checks — every JSON file under i18n/locales/** (discovered, so a new
 * locale or a split namespace is covered without editing this file). For every
 * STRING leaf:
 *   1. remove every well-formed double-brace placeholder `{{ name }}`;
 *   2. if a `{` or `}` survives, the value is malformed — that single rule
 *      covers `{name}`, `{{name}` and `{name}}` at once.
 * Nested objects are walked; numbers/booleans/null are not copy and are skipped.
 *
 * There is deliberately no suppression list. A locale value has no legitimate
 * reason to contain a stray brace: if real copy ever needs a literal `{`, wrap
 * it as `{{'{'}}` or use i18next's escape, and the gate keeps its teeth.
 *
 * Run with:  node scripts/check-i18n-braces.cjs [--gate] [--json]
 *              --gate  exit 1 on findings (CI / pre-commit shape)
 *              --json  machine-readable findings
 * Exit codes: 0 = every locale value is well-formed;
 *             1 = at least one malformed value (listed with file:key);
 *             2 = could not run (no locale files, unreadable/unparseable JSON).
 *
 * Exit 2 is deliberately distinct from 0: "found nothing to scan" must never
 * read as "scanned and clean".
 *
 * Pinned by tests/meta/i18n-braces-gate.test.ts, which runs this CLI in a
 * throwaway tree (the tool resolves its inputs from __dirname, so there are no
 * overrides to fake) against one fixture per fault shape, and PAIRS every case
 * with a fault-injected copy whose detector is neutralised — a gate that has
 * become a no-op fails the suite instead of passing quietly.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// The detector. A fault-injected copy in the meta test replaces this line to
// prove the fixtures fail because of the rule, not by accident.
const PLACEHOLDER_RE = /\{\{\s*[\w.\s]*\s*\}\}/g;

const ROOT = path.dirname(__dirname);
const LOCALES_DIR = path.join(ROOT, 'i18n', 'locales');

const args = process.argv.slice(2);
const AS_JSON = args.includes('--json');

let failures = 0;

function die(msg) {
  console.error(`❌ i18n braces gate could not run: ${msg}`);
  process.exit(2);
}

/** Every .json file under i18n/locales, sorted for stable output. */
function localeFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    die(`cannot read ${dir} (${e.code || e.message})`);
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...localeFiles(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

/** Strip well-formed placeholders; whatever braces remain are the finding. */
function strayBraces(value) {
  const rest = value.replace(PLACEHOLDER_RE, '');
  if (!/[{}]/.test(rest)) return null;
  return rest.trim();
}

function scanFile(file, findings) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    die(`cannot read ${file} (${e.code || e.message})`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    die(`${file} is not valid JSON (${e.message})`);
  }
  const walk = (node, prefix) => {
    if (typeof node === 'string') {
      const stray = strayBraces(node);
      if (stray !== null) {
        findings.push({
          file: path.relative(ROOT, file).split(path.sep).join('/'),
          key: prefix,
          value: node,
          stray,
        });
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const key of Object.keys(node)) {
      walk(node[key], prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(json, '');
}

const files = localeFiles(LOCALES_DIR);
if (files.length === 0) die(`no locale JSON files under ${LOCALES_DIR}`);

const findings = [];
for (const file of files) scanFile(file, findings);

// The exit code is set from `findings` alone, BEFORE any output branch: an
// early return in a report mode is how a gate silently stops failing.
failures = findings.length;

if (AS_JSON) {
  console.log(JSON.stringify({ files: files.length, findings }, null, 2));
} else if (findings.length === 0) {
  console.log(
    `✅ i18n braces gate: ${files.length} locale file(s) clean — every placeholder is a well-formed {{name}}.`,
  );
} else {
  console.error(
    `❌ i18n braces gate: ${findings.length} malformed locale value(s):`,
  );
  for (const f of findings) {
    console.error(`   ${f.file} :: ${f.key}`);
    console.error(`      value : ${JSON.stringify(f.value)}`);
    console.error(`      stray : ${JSON.stringify(f.stray)}`);
  }
  console.error(
    '   react-i18next interpolates {{name}} — a single-brace {name} renders verbatim.',
  );
}

process.exit(failures > 0 ? 1 : 0);
