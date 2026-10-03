#!/usr/bin/env node
/**
 * Emits maestro/tools/testid-map.json — every testID on disk grouped by file,
 * for flow rewiring and the skeptic audit. Derived from disk (never hand-edited).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Both paths are overridable so a gate can regenerate from a SANDBOX tree and
// write somewhere disposable, instead of mutating the real map. Stage 5 of the
// pre-commit hook (maestro/tools/testid-map-freshness.cjs) depends on these two
// variables existing; they are the same contract as add-testids.cjs's
// APP_TESTIDS_ROOT. Unset (the human-invoked case) means the repo paths above.
const APP = process.env.TESTID_MAP_APP_ROOT
  ? path.resolve(process.env.TESTID_MAP_APP_ROOT)
  : path.resolve(__dirname, '..', '..', 'app');
const OUT = process.env.TESTID_MAP_OUT
  ? path.resolve(process.env.TESTID_MAP_OUT)
  : path.resolve(__dirname, 'testid-map.json');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

const result = {};
let total = 0;
for (const f of walk(APP).sort()) {
  const rel = path.relative(APP, f).split(path.sep).join('/');
  if (/(\+api|\+html)/.test(rel) || /__tests__|\.test\.|\.spec\./.test(rel)) continue;
  const src = fs.readFileSync(f, 'utf8');
  if (!/testID=/.test(src)) continue;
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true);
  const ids = [];
  const visit = (node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))) {
      const attrs = node.attributes;
      const attr = attrs.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'testID',
      );
      if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
        ids.push({ id: attr.initializer.text, line: sf.getLineAndCharacterOfPosition(attr.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (ids.length) {
    result[rel] = ids;
    total += ids.length;
  }
}
// Diff-stability: this file is a GENERATED snapshot, so its only content is
// {total, screens} — both pure functions of the app/ source. A timestamp field
// used to sit here (`generatedAt`), and it made every regeneration produce a
// one-line diff even when nothing had changed, which defeats `git diff` as the
// check for "did I forget to regenerate?" and trains people to ignore it.
// Do NOT add a timestamp, a hostname, or any other ambient value here. Freshness
// is carried by the commit, which is where a "when" actually belongs.
fs.writeFileSync(OUT, JSON.stringify({ total, screens: result }, null, 2));
console.log(`testid-map.json written: ${total} testIDs across ${Object.keys(result).length} screens`);
