#!/usr/bin/env node
/**
 * audit-i18n-dynamic-keys.js — Sweep every key-shaped string literal under
 * app/ and components/ and report any that fails to resolve in BOTH locales.
 *
 * WHY (history): lib/__tests__/i18n-smoke.test.ts enforces key resolution per
 * carrier shape (t('ns.key') literals, lookup tables, key arrays, *_KEY
 * consts). Carrier-based enforcement is only as good as its carrier list:
 * commit 7d4c043 closed four carriers, and this sweep still found 20 more
 * missing keys hiding in shapes no collector scanned (nested ternaries inside
 * t(), questionKey/answerKey properties, a `common.all` fallback literal).
 * Carrier lists rot; the shape of a key never changes. This script therefore
 * ignores carriers entirely: a key-shaped literal that is not a locale key is
 * either a missing translation or a non-translation code. Run it after any
 * batch of screen work; if it flags a key the guard missed, extend the guard
 * with a collector for that carrier so the class stays closed between audits.
 *
 * app/api/** is excluded: it is server code, and its key-shaped literals are
 * RBAC permission scopes (`admin.read`, `verification.write`) and catalog
 * codes — never passed to t(), never user-facing.
 *
 * Usage:
 *   node scripts/audit-i18n-dynamic-keys.js          # human-readable report
 *   node scripts/audit-i18n-dynamic-keys.js --json   # machine-readable
 *
 * Exit codes: 0 = every key-shaped literal resolves in every locale;
 *             1 = unresolved literals found (printed).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(ROOT, 'i18n', 'locales');
const SCAN_ROOTS = ['app', 'components'].map((d) => path.join(ROOT, d));
const APP_DIR = path.join(ROOT, 'app');

function loadLocales() {
  const locales = {};
  for (const lang of fs.readdirSync(LOCALES_DIR)) {
    const file = path.join(LOCALES_DIR, lang, 'common.json');
    if (fs.existsSync(file)) locales[lang] = JSON.parse(fs.readFileSync(file, 'utf-8'));
  }
  return locales;
}

const SHAPE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

function resolveKey(locale, key) {
  let node = locale;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !(part in node)) return false;
    node = node[part];
  }
  return typeof node === 'string';
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.')) continue;
    // app/api/** is server code — see the header. Its key-shaped literals are
    // RBAC scopes, not copy.
    if (dir === APP_DIR && e.name === 'api') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

function literals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      let v = '';
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') { v += src[i + 1] ?? ''; i += 2; continue; }
        v += src[i];
        i++;
      }
      i++;
      out.push(v);
      continue;
    }
    i++;
  }
  return out;
}

const locales = loadLocales();
const langs = Object.keys(locales);
if (langs.length === 0) {
  console.error(`no locale files found under ${LOCALES_DIR}`);
  process.exitCode = 1;
} else {
const misses = new Map();
let files = 0;
let shaped = 0;
for (const dir of SCAN_ROOTS) {
  for (const file of walk(dir)) {
    files++;
    const src = fs.readFileSync(file, 'utf8');
    for (const v of literals(src)) {
      if (!SHAPE.test(v)) continue;
      shaped++;
      if (langs.some((lang) => !resolveKey(locales[lang], v))) {
        const rel = path.relative(ROOT, file).split(path.sep).join('/');
        if (!misses.has(rel)) misses.set(rel, new Set());
        misses.get(rel).add(v);
      }
    }
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    filesScanned: files,
    keyShapedLiterals: shaped,
    unresolved: [...misses.entries()].sort().map(([file, keys]) => ({ file, keys: [...keys].sort() })),
  }, null, 2));
} else {
  for (const [f, ks] of [...misses.entries()].sort()) {
    console.log(`\n${f}`);
    for (const k of [...ks].sort()) console.log(`   ${k}`);
  }
  console.log(`\nfiles scanned: ${files} | key-shaped literals: ${shaped} | unresolved: ${[...misses.values()].reduce((a, s) => a + s.size, 0)}`);
  if (misses.size > 0) {
    console.log('Repay the keys in both locales, then extend the guard in lib/__tests__/i18n-smoke.test.ts\nwith a collector for whichever carrier hid them (see that file\'s header).');
  }
}
process.exitCode = misses.size > 0 ? 1 : 0;
}
