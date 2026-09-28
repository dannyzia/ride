#!/usr/bin/env node
// One-shot: rewrite `runFlow: shared/...` (or any ../-prefixed variant) to the
// correct file-relative prefix. Maestro 2.6.1 resolves runFlow paths relative
// to the flow FILE, so a flow at maestro/flows/auth/x.yaml must reference
// ../shared/..., and one at maestro/flows/driver/home/x.yaml needs ../../shared/.
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.yaml')) out.push(p);
  }
  return out;
}

let fixed = 0;
for (const p of walk('maestro/flows')) {
  const norm = p.split(path.sep).join('/');
  if (norm.includes('/shared/')) continue; // subflows reference their own tree
  const depth = norm.split('/').length - 2; // segments under maestro/flows
  const prefix = '../'.repeat(Math.max(depth, 0));
  let s = fs.readFileSync(p, 'utf8');
  const orig = s;
  s = s.replace(/runFlow: (?:\.\.\/)*shared\//g, `runFlow: ${prefix}shared/`);
  if (s !== orig) {
    fs.writeFileSync(p, s);
    fixed++;
    console.log(`fixed ${norm} -> prefix "${prefix}shared/"`);
  }
}
console.log('files fixed:', fixed);
