#!/usr/bin/env node
/**
 * flow-xcheck.cjs — Gate 1 flow-selector cross-check (permanent).
 *
 * Usage:  node maestro/tools/flow-xcheck.cjs
 * Exit:   0 = pass; 2 = blocking findings (listed); 1 = broken inputs.
 *
 * ── WHAT THIS GATES ──────────────────────────────────────────────────────────
 *  1. EXISTS  (blocking) Every `id:` selector across maestro/flows/**.yaml
 *     resolves against testid-map.json. A miss is a flow that no-ops or hangs
 *     on device.
 *  2. DRIFT   (blocking) Every testID a flow selects is still present in the
 *     app/ file the map attributes it to. Guards against a stale manifest: the
 *     map is a generated snapshot, so editing app/ without regenerating it
 *     would otherwise keep a deleted element resolvable indefinitely.
 *  3. DEAD-COPY (advisory, never blocks) A literal text assertion that appears
 *     in no locale value and no app-source literal cannot match at runtime.
 *     Suppress via maestro/tools/flow-xcheck-suppressions.json.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT GATE ─────────────────────────────────────
 * Screen-affinity in the full sense — "is this element on the screen the flow is
 * standing on right now" — is a RUNTIME property and cannot be decided from
 * source. Both static approximations were built and measured against this tree;
 * both were rejected on evidence, not intuition:
 *
 *  · Reachability / orphan-screen detection. Three implementations. Final run
 *    flagged 99 of 234 screens, most demonstrably live, for structural reasons
 *    no amount of regex fixes: routes live in module constants
 *    (const R = "/(main)/…"; router.push(R)), which inline-literal matching
 *    cannot resolve; app/admin/_layout.tsx contains ZERO router.push/href — the
 *    60-screen admin SPA navigates some other way entirely; and app/track/
 *    [rideId].tsx plus app/payment/success.tsx are entered by an external URL
 *    scheme/redirect, not by any router call. Gating on this would block
 *    legitimate commits.
 *
 *  · Orphaned-i18n-key detection (a value present in common.json but whose key
 *    nothing renders). This is the only technique that catches the "Search
 *    destination..." class of bug, and it is not sound: `home.search` is matched
 *    as referenced because API routes contain the bare literal "search", while
 *    live strings like "Welcome Back" get flagged. Key resolution needs a real
 *    parser, not regex.
 *
 * Screen-affinity judgments therefore stay CURATED in
 * maestro/tools/flow-testid-map.json (its DEAD section carries per-screen
 * evidence), which is where this repo already records them.
 *
 * ── NOTE ON A CORRECTED FACT ────────────────────────────────────────────────
 * "Search destination..." is NOT absent from the codebase: it is the value of
 * `home.search` in i18n/locales/en/common.json:181, a key nothing renders. The
 * live destination row renders `home.search_destination` = "Where to?". So a
 * flow asserting the former could never match, but the reason is an orphaned
 * locale key rather than a missing string.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const mapPath = path.join(__dirname, "testid-map.json");
const suppressionsPath = path.join(__dirname, "flow-xcheck-suppressions.json");
const flowsDir = path.join(__dirname, "..", "flows");
const APP_DIR = path.join(ROOT, "app");
const I18N_DIR = path.join(ROOT, "i18n", "locales", "en");

const posix = (p) => p.replace(/\\/g, "/");
const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// ── inputs ────────────────────────────────────────────────────────────────────
let map;
try {
  map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
} catch (err) {
  console.error(`❌ cannot read ${posix(mapPath)}: ${err.message}`);
  process.exit(1);
}

const idOwner = new Map(); // testID -> app-relative file
for (const file of Object.keys(map.screens || {})) {
  for (const entry of map.screens[file]) idOwner.set(entry.id, file);
}

function walk(dir, out = [], re) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // absent dir is not fatal for the advisory corpus
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, re);
    else if (!re || re.test(e.name)) out.push(p);
  }
  return out;
}

const flowFiles = walk(flowsDir, [], /\.yaml$/).sort();

// ── scan flows ────────────────────────────────────────────────────────────────
let idSels = 0;
let textTaps = 0;
let filesWithIds = 0;
const structural = [];
const missing = [];
const drift = [];
const copyClaims = [];

const ID_RE = /^\s*(?:- )?id:\s*["']?([^"'\s#]+)/gm;
// Assertion text: Maestro's visible/assert family, plus text-only tapOn.
const COPY_RE =
  /^\s*(?:-\s*)?(?:assertVisible|extendedWaitUntil|waitUntil|notVisible|assertNotVisible|visible|tapOn)\s*:\s*["'](.+?)["']\s*$/;

for (const f of flowFiles) {
  const rel = posix(path.relative(ROOT, f));
  const txt = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  if (!txt.includes("\n---\n") && !txt.startsWith("---\n")) {
    structural.push(rel + " (no `---` config/document separator)");
  }
  let fileHasId = false;
  for (const m of txt.matchAll(ID_RE)) {
    idSels++;
    fileHasId = true;
    if (!idOwner.has(m[1])) missing.push({ f: rel, id: m[1] });
  }
  if (fileHasId) filesWithIds++;
  for (const m of txt.matchAll(/^\s*(?:- )?tapOn(?::|\s)[^\n]*$/gm)) {
    if (!/id:/.test(m[0])) textTaps++;
  }
  for (const line of txt.split("\n")) {
    if (/^\s*#/.test(line)) continue; // documentation, not an assertion
    const m = line.match(COPY_RE);
    if (m) copyClaims.push({ f: rel, raw: m[1] });
  }
}

// ── check 2: map drift (blocking) ─────────────────────────────────────────────
const srcCache = new Map();
function appSource(relFile) {
  if (!srcCache.has(relFile)) {
    const abs = path.join(APP_DIR, relFile);
    srcCache.set(relFile, fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null);
  }
  return srcCache.get(relFile);
}

const idsUsedByFlows = new Set();
for (const f of flowFiles) {
  const txt = fs.readFileSync(f, "utf8");
  for (const m of txt.matchAll(ID_RE)) idsUsedByFlows.add(m[1]);
}
for (const id of idsUsedByFlows) {
  if (!idOwner.has(id)) continue; // already reported by check 1
  const owner = idOwner.get(id);
  const src = appSource(owner);
  if (src === null) {
    drift.push({ id, owner, why: "map file missing from app/" });
  } else if (!src.includes(id)) {
    drift.push({ id, owner, why: "id absent from the file the map attributes it to" });
  }
}

// ── check 3: dead-copy (advisory) ──────────────────────────────────────────────
const corpus = new Set();
{
  const add = (s) => {
    if (typeof s === "string") {
      const t = norm(s);
      if (t.length >= 2) corpus.add(t);
    }
  };
  // Every locale value. NOTE: orphaned keys are deliberately included — key
  // resolution is unsound here (see header), and excluding them would make this
  // check blind to the "Search destination..." class.
  for (const f of walk(I18N_DIR, [], /\.json$/)) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    (function rec(v) {
      if (typeof v === "string") add(v);
      else if (v && typeof v === "object") Object.values(v).forEach(rec);
    })(json);
  }
  // App AND components source: string literals AND JSX text nodes. Three separate
  // gaps were found by running the advisory and reading what it flagged:
  //  - JSX text is not optional; most labels are bare text, not quoted strings.
  //    Literals alone flagged the live "Complete Registration" (register.tsx:99).
  //  - components/ was not scanned at all, so every string that reaches the user
  //    through a shared component was invisible: "Tap to replace document" lives in
  //    components/DocumentUploadCard.tsx and was reported as dead copy.
  //  - tag-stripping with /<[^>]*>/ is WRONG: `=>` inside onPress ends the span
  //    early and the strip desynchronizes, swallowing real labels.
  for (const f of [
    ...walk(APP_DIR, [], /\.(tsx|ts|jsx|js)$/),
    ...walk(path.join(ROOT, "components"), [], /\.(tsx|ts|jsx|js)$/),
  ]) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/(["'`])([^"'`$\n]{2,80})\1/g)) add(m[2]);
    const text = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    // JSX text nodes are the run between a tag close and a tag open. Stripping
    // tags with /<[^>]*>/ is WRONG here: `=>` inside an onPress attribute ends
    // the span early and the strip desynchronizes, swallowing real labels —
    // that silently hid the live "Complete Registration" (register.tsx:99).
    // Excluding <>{} keeps expression containers out with no tag parsing.
    for (const m of text.matchAll(/>([^<>{}]{2,80})</g)) add(m[1]);
  }
}

let suppressed = new Map();
try {
  const j = JSON.parse(fs.readFileSync(suppressionsPath, "utf8"));
  suppressed = new Map((j.entries || []).map((e) => [norm(e.match), e]));
} catch {
  /* suppressions are optional */
}

function isLive(c) {
  if (corpus.has(c)) return true;
  for (const s of corpus) {
    if (s.includes(c)) return true; // assertion is a fragment of real copy
    // Assertion wraps real copy. The length ratio matters: without it a short
    // token like "search" "matches" any candidate containing it, which is how
    // an earlier version of this rule reported "Search destination" as LIVE.
    if (c.includes(s) && s.length >= Math.max(6, c.length * 0.6)) return true;
  }
  return false;
}

const deadCopy = [];
let skipEnv = 0;
for (const c of copyClaims) {
  if (c.raw.includes("${")) {
    skipEnv++;
    continue; // env-interpolated: not knowable statically
  }
  const cands = c.raw
    .replace(/[()]/g, "")
    .split("|")
    .map((s) => s.replace(/^\.\*|\.\*$/g, "").replace(/[.*+?^${}[\]\\]/g, "").trim())
    .map(norm)
    .filter((s) => s.length >= 3);
  if (!cands.length) continue;
  if (cands.some(isLive)) continue;
  const sup = cands.map((x) => suppressed.get(x)).find(Boolean);
  if (sup) continue; // suppression matches -> already accounted for
  deadCopy.push({ ...c, cands });
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(`flow files: ${flowFiles.length} | files using id: selectors: ${filesWithIds}`);
console.log(
  `id: selectors: ${idSels} (exist: ${missing.length === 0}, in-own-file: ${drift.length === 0}) | text tapOn steps remaining: ${textTaps}`
);
if (structural.length) {
  console.log(`⚠ structural warnings: ${structural.length}`);
  structural.slice(0, 10).forEach((s) => console.log("  ⚠", s));
}

let blocked = false;
if (missing.length) {
  blocked = true;
  console.log(`\n❌ MISSING from testid-map.json: ${missing.length}`);
  missing.slice(0, 30).forEach((x) => console.log(`  ${x.f} -> ${x.id}`));
}
if (drift.length) {
  blocked = true;
  console.log(`\n❌ MAP DRIFT (map is stale): ${drift.length}`);
  drift.slice(0, 30).forEach((x) => console.log(`  ${x.id}  (${x.why}: ${x.owner})`));
  console.log("  Fix: node maestro/tools/testid-manifest.cjs");
}

if (deadCopy.length) {
  console.log(`\n⚠ DEAD COPY (advisory, not blocking): ${deadCopy.length}`);
  deadCopy.slice(0, 20).forEach((x) => console.log(`  ${x.f}  "${x.raw}"`));
  console.log(
    "  These literals appear in no locale value and no app-source string, so they cannot match."
  );
  console.log(
    "  If the text really renders (OS dialog, third-party API), add it to maestro/tools/flow-xcheck-suppressions.json"
  );
} else {
  console.log("\n✅ no dead-copy candidates");
}

if (blocked) process.exit(2);
console.log(
  "✅ every id: selector resolves and exists in its own app file" +
    (skipEnv ? ` (${skipEnv} env-interpolated assertions not text-checked)` : "")
);
console.log(
  "   note: this gate does NOT verify screen-affinity — see the header in this file."
);
