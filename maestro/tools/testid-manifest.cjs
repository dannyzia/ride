#!/usr/bin/env node
/**
 * Emits maestro/tools/testid-map.json — every testID on disk grouped by file,
 * for flow rewiring and the skeptic audit. Derived from disk (never hand-edited).
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const APP = path.resolve(__dirname, '..', '..', 'app');
const OUT = path.resolve(__dirname, 'testid-map.json');

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
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), total, screens: result }, null, 2));
console.log(`testid-map.json written: ${total} testIDs across ${Object.keys(result).length} screens`);
