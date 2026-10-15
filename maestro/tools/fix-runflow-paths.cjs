#!/usr/bin/env node
/**
 * fix-runflow-paths.cjs — one-shot: rewrite `runFlow: <../>+shared/...` to the
 * correct file-relative prefix.
 *
 * Maestro 2.6.1 resolves runFlow/runScript paths relative to the flow FILE, so a
 * flow at maestro/flows/auth/x.yaml needs `../shared/...` and one at
 * maestro/flows/driver/home/x.yaml needs `../../shared/...`. The number of `../`
 * must equal the number of directory segments under maestro/flows.
 *
 * Usage: node maestro/tools/fix-runflow-paths.cjs [--dry-run]
 * Exit:  0 = done (changed or already correct); 1 = broken input.
 *
 * HISTORY — the formula bug this file carried until 2026-10-15: it computed
 * `norm.split('/').length - 2` over a path that ALREADY included the two leading
 * segments (`maestro/flows/...`), emitting depth+1 and contradicting its own
 * comment. Running it produced 98 wrong-depth references across 36 flows, every
 * one a load failure. maestro/tools/flow-load-check.cjs now gates the invariant;
 * this fixer is the repair tool for a tree that already drifted.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const FLOWS_DIR = path.join(ROOT, "maestro", "flows");
const DRY_RUN = process.argv.includes("--dry-run");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".yaml")) out.push(p);
  }
  return out;
}

let fixed = 0;
for (const p of walk(FLOWS_DIR)) {
  const norm = path.relative(ROOT, p).split(path.sep).join("/");
  // Directory segments under maestro/flows == the required number of '../'.
  const under = path.relative(FLOWS_DIR, path.dirname(p)).split(path.sep).filter(Boolean).length;
  const prefix = "../".repeat(under);

  const orig = fs.readFileSync(p, "utf8");
  const s = orig.replace(/runFlow: (?:\.\.\/)+shared\//g, `runFlow: ${prefix}shared/`);
  if (s === orig) continue;

  if (!DRY_RUN) fs.writeFileSync(p, s);
  fixed++;
  console.log(`${DRY_RUN ? "would fix" : "fixed"} ${norm} -> prefix "${prefix}shared/"`);
}
console.log(`${DRY_RUN ? "files that would change" : "files fixed"}: ${fixed}`);
