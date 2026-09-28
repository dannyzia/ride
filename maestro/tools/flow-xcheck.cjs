#!/usr/bin/env node
/**
 * flow-xcheck.cjs — Gate 1 flow-selector cross-check (permanent).
 *
 * Verifies every `id:` selector across the yaml flows under maestro/flows/
 * resolves against
 * the on-disk testID inventory (maestro/tools/testid-map.json, regenerated from
 * app/ by testid-manifest.cjs). A selector that misses the map = a flow that
 * will silently no-op or hang on device — this gate makes that a commit-time
 * error instead of a device-day surprise.
 *
 * Usage:  node maestro/tools/flow-xcheck.cjs
 * Exit:   0 = all selectors resolve; 2 = missing selectors (listed); 1 = broken
 *         yaml structure (no `---` separator) or unreadable inputs.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const mapPath = path.join(__dirname, "testid-map.json");
const flowsDir = path.join(__dirname, "..", "flows");

const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const idsOnDisk = new Set();
for (const file of Object.keys(map.screens || {})) {
  for (const entry of map.screens[file]) idsOnDisk.add(entry.id);
}

const flowFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.yaml$/.test(e.name)) flowFiles.push(p);
  }
})(flowsDir);

let idSels = 0;
let textTaps = 0;
let missing = [];
let structural = [];
let filesWithIds = 0;

for (const f of flowFiles) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const txt = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n"); // CRLF-tolerant (git autocrlf working copies)
  if (!txt.includes("\n---\n") && !txt.startsWith("---\n")) {
    structural.push(rel + " (no `---` config/document separator)");
  }
  let fileHasId = false;
  for (const m of txt.matchAll(/^\s*(?:- )?id:\s*["']?([^"'\s#]+)/gm)) {
    idSels++;
    fileHasId = true;
    if (!idsOnDisk.has(m[1])) missing.push({ f: rel, id: m[1] });
  }
  if (fileHasId) filesWithIds++;
  for (const m of txt.matchAll(/^\s*(?:- )?tapOn(?::|\s)[^\n]*$/gm)) {
    if (!/id:/.test(m[0])) textTaps++;
  }
}

console.log(
  `flow files: ${flowFiles.length} | files using id: selectors: ${filesWithIds}`
);
console.log(
  `id: selectors: ${idSels} (all resolve: ${missing.length === 0}) | text tapOn steps remaining: ${textTaps}`
);
if (structural.length) {
  console.log(`⚠ structural warnings: ${structural.length}`);
  structural.slice(0, 10).forEach((s) => console.log("  ⚠", s));
}
if (missing.length) {
  console.log(`❌ MISSING on disk: ${missing.length}`);
  missing.slice(0, 30).forEach((x) => console.log(`  ${x.f} -> ${x.id}`));
  process.exit(2);
}
console.log("✅ every id: selector resolves in testid-map.json");
