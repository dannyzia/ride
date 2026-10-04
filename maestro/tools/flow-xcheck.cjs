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
 *  3. DEAD-COPY (BLOCKING as of 2026-10-03, was advisory) A literal text
 *     assertion that appears in no locale value AND no app/components source
 *     literal cannot match at runtime, so the flow fails on device after
 *     burning the full wait timeout. This now exits 2 and blocks the commit.
 *     Suppress via maestro/tools/flow-xcheck-suppressions.json.
 *
 *     WHY THE CORPUS IS "LOCALE **OR** SOURCE" AND NOT "LOCALE ONLY":
 *     the obvious stricter rule — every assertion must appear in i18n — was
 *     measured before this was promoted, and it is wrong. Of 178 distinct
 *     assertion literals in maestro/flows, 125 resolve in a locale value, 40
 *     resolve ONLY in app/components source, and 13 resolve in neither. Those
 *     40 are NOT broken: they are hard-coded JSX that renders perfectly well
 *     ("Enter your phone number to continue" lives in phone-entry.tsx, "Tap to
 *     replace document" in components/DocumentUploadCard.tsx). Blocking them
 *     would reject ~40 currently-committed, currently-working assertions on an
 *     i18n-convention technicality, not a runtime failure. What actually breaks
 *     a test is a literal that matches NOTHING — that is what this tier blocks.
 *     Do not "tighten" this to locale-only without first re-measuring, and treat
 *     such a change as an i18n-discipline decision rather than a bug fix.
 *  3b. LOCALE-ONLY (BLOCKING, ratcheted from a baseline) A literal that resolves
 *     in app/components SOURCE but in no locale value is hard-coded JSX. It
 *     renders correctly, so dead-copy passes it and the flow works today — but
 *     it is not localizable, so the assertion breaks when that screen is wired
 *     to a t() key, or when the app runs under a non-en locale. This blocks any
 *     such literal NOT listed in maestro/tools/flow-locale-baseline.json.
 *     MEASURED 2026-10-03: 39 distinct literals / 74 assertion steps across ~15
 *     files predate this gate and are grandfathered in that baseline, rather
 *     than force-fixed here — blocking all of them at once would reject working,
 *     committed flows and bury a real regression under pre-existing noise. The
 *     baseline is a RATCHET: it must only ever shrink. An earlier hand-rolled
 *     audit put this at "40" and also reported 13 spurious DEAD COPY findings;
 *     both were wrong, because it scanned app/ but not components/. Do not
 *     re-derive these numbers by hand — run this gate.
 *  4. MASKED (advisory, never blocks) A claim that IS rescued by the corpus but
 *     only by substring containment, not by a real copy string of its own.
 *     rescue() accepts s.includes(c), so a claim survives whenever some LONGER
 *     live string happens to contain it — the exact shape by which the dead
 *     "Documents Submitted" survived (admin-only "No documents submitted"
 *     contains it). This tier makes those rescues visible instead of silent,
 *     so a masked claim gets repointed rather than trusted.
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
 *
 * ── NOTE ON CORPUS PROVENANCE ───────────────────────────────────────────────
 * The corpus harvests raw string literals from app/ and components/, so every
 * `t('rider_activity.driver')` contributes a dotted i18n KEY to a set that is
 * supposed to hold rendered copy. Measured: 1247 of 9827 entries (12.7%) were
 * key-shaped. A key is not copy — it never renders — so key-shaped entries that
 * come ONLY from source are now excluded (a value present in a locale file is
 * kept regardless, since that one really does render). Dropping them flipped 0
 * of 198 claims to dead, so this is neutral today and removes the mechanism by
 * which a dead claim could later be masked by a neighbouring key's name.
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
/** Hoisted to module scope: the locale-only check (check 3b) needs it after the
 *  corpus block closes. Populated below from every locale value, orphans included. */
const localeValues = new Set();
const corpus = new Set();
{
  // Provenance matters: a dotted token harvested from a t('a.b') call is a KEY,
  // and a key never renders. Locale values are tracked apart from source
  // literals so a key-shaped string that also exists as a real locale value
  // (and therefore really does render) is still kept.
  const sourceValues = new Set();
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
      if (typeof v === "string") {
        const t = norm(v);
        if (t.length >= 2) localeValues.add(t);
      } else if (v && typeof v === "object") Object.values(v).forEach(rec);
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
    const harvest = (s) => {
      if (typeof s !== "string") return;
      const t = norm(s);
      if (t.length >= 2) sourceValues.add(t);
    };
    for (const m of src.matchAll(/(["'`])([^"'`$\n]{2,80})\1/g)) harvest(m[2]);
    const text = src
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    // JSX text nodes are the run between a tag close and a tag open. Stripping
    // tags with /<[^>]*>/ is WRONG here: `=>` inside an onPress attribute ends
    // the span early and the strip desynchronizes, swallowing real labels —
    // that silently hid the live "Complete Registration" (register.tsx:99).
    // Excluding <>{} keeps expression containers out with no tag parsing.
    for (const m of text.matchAll(/>([^<>{}]{2,80})</g)) harvest(m[1]);
  }

  const KEY_SHAPED = /^[a-z0-9]+(_[a-z0-9]+)*(\.[a-z0-9_]+)+$/;
  let keysDropped = 0;
  for (const v of sourceValues) {
    if (KEY_SHAPED.test(v) && !localeValues.has(v)) {
      keysDropped++;
      continue;
    }
    corpus.add(v);
  }
  for (const v of localeValues) corpus.add(v);
  if (process.env.FLOW_XCHECK_VERBOSE) {
    console.log(`  corpus: ${corpus.size} entries (${keysDropped} i18n key-shaped literals dropped)`);
  }
}

let suppressed = new Map();
try {
  const j = JSON.parse(fs.readFileSync(suppressionsPath, "utf8"));
  suppressed = new Map((j.entries || []).map((e) => [norm(e.match), e]));
} catch {
  /* suppressions are optional */
}

// Returns the rescue witness, or null when nothing in the corpus backs `c`.
// The witness is what makes check 4 (MASKED) possible: an exact hit is a real
// copy string, whereas a containment hit means some OTHER string happened to
// swallow this claim — true for a legitimate fragment ("Save" inside "Save
// changes"), but also for a dead one ("Documents Submitted" inside admin's
// "No documents submitted"). The caller reports the difference.
function rescue(c) {
  if (corpus.has(c)) return { how: "exact", just: c };
  for (const s of corpus) {
    // Assertion is a fragment of real copy.
    if (s.includes(c)) return { how: "fragment", just: s };
    // Assertion wraps real copy. The length ratio matters: without it a short
    // token like "search" "matches" any candidate containing it, which is how
    // an earlier version of this rule reported "Search destination" as LIVE.
    if (c.includes(s) && s.length >= Math.max(6, c.length * 0.6)) return { how: "wraps", just: s };
  }
  return null;
}

// A containment rescue only counts as masking when the claim is a small,
// word-internal part of a much longer string — the shape that let a dead
// claim through. A claim that is most of its host string ("Tell your driver")
// is an abbreviated assertion, which is legitimate and stays quiet.
//
// Phrase-shaped claims ONLY. A bare common word is not a masking signal: on
// measurement, 14 of the 15 raw hits were single generic words ("request",
// "bid", "rate", "balance", "quote") rescued by longer copy that contains
// them, which says nothing about whether the claim is stale. "Documents
// Submitted" was phrase-shaped, and so is every real instance of this class.
function isMasked(w, c) {
  if (!w || w.how === "exact") return false;
  if (w.how === "wraps") return false; // claim wraps real copy, ratio already checked
  if (c.length < 12 && !c.includes(" ")) return false; // bare word -> too weak a signal
  // POSITION, not length, is the signal. A claim that begins at the start of
  // its host is an abbreviation of that same string, and Maestro's substring
  // match satisfies it ("Incorrect Ride Pin" inside "Incorrect Ride Pin. Ask
  // your rider and try again."). A claim that starts MID-phrase is masked: it
  // matches a string that never renders it ("Documents Submitted" inside admin's
  // "No documents submitted").
  //
  // A length ratio is deliberately NOT used here. It was tried and it hides the
  // exact case this tier exists to catch: "documents submitted" (19) vs "no
  // documents submitted" (22) fails a 0.8 ratio, silently passing the bug.
  return !w.just.startsWith(c);
}

const deadCopy = [];
const maskedCopy = [];
const localeMiss = [];
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

  // Resolve every candidate so the best (most specific) rescue is the one we
  // report: an exact hit outranks a fragment, a fragment outranks a wrap.
  const witnesses = cands.map((x) => ({ cand: x, w: rescue(x) }));
  const hit = witnesses.find((x) => x.w);
  if (hit) {
    if (isMasked(hit.w, hit.cand)) maskedCopy.push({ ...c, cand: hit.cand, ...hit.w });
    // CHECK 3b — LOCALE-ONLY. `hit` proves the literal resolves SOMEWHERE; this
    // asks the narrower question of whether it resolves in i18n specifically.
    // A rescue satisfied only by app/components source means the copy is
    // hard-coded JSX: it renders correctly and the flow passes, but the string
    // is not localizable, so the assertion breaks the day that screen is wired
    // to a locale key (or run under a non-en locale).
    if (!cands.some((x) => localeValues.has(x))) {
      localeMiss.push({ ...c, cand: hit.cand, via: hit.w.just });
    }
    continue;
  }
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
  blocked = true;
  console.log(`\n❌ DEAD COPY (blocking): ${deadCopy.length}`);
  deadCopy.slice(0, 20).forEach((x) => console.log(`  ${x.f}  "${x.raw}"`));
  console.log(
    "  These literals appear in no locale value and no app/components source string,"
  );
  console.log("  so they cannot match on device — the step will burn its full wait timeout.");
  console.log(
    "  Fix: point the step at copy that actually renders (prefer a testID), or if the text"
  );
  console.log(
    "  really is external (OS dialog, third-party API), add it to maestro/tools/flow-xcheck-suppressions.json"
  );
} else {
  console.log("\n✅ no dead-copy candidates");
}

if (maskedCopy.length) {
  console.log(`\n⚠ MASKED COPY (advisory, not blocking): ${maskedCopy.length}`);
  console.log(
    '  Each claim matched only as a fragment of a LONGER live string, never as copy of its own:'
  );
  maskedCopy.slice(0, 20).forEach((x) =>
    console.log(`  ${x.f}\n     claim "${x.cand}"\n     only inside "${x.just}"`)
  );
  console.log(
    "  Benign for genuine abbreviations; a bug when the claim is stale copy whose text"
  );
  console.log(
    "  happens to sit inside an unrelated string. Suppress with maestro/tools/flow-xcheck-suppressions.json"
  );
} else {
  console.log("✅ no masked-copy candidates");
}

// ── check 3b: locale-only copy (BLOCKING, ratcheted from a baseline) ──────────
// A literal rescued by app/components SOURCE but by no locale value is
// hard-coded JSX. It renders correctly, so dead-copy passes it and the flow
// works — but the string is not localizable, so the assertion breaks the day
// that screen is wired to a locale key, or runs under a non-en locale.
//
// This blocks NEW such literals. The 74 that already exist are baselined in
// maestro/tools/flow-locale-baseline.json rather than force-fixed here: a
// mechanical block on all of them would reject working, committed flows across
// ~15 files and bury a real regression under a wall of pre-existing noise. The
// baseline is a ratchet, not an excuse — it should only ever shrink.
const baselinePath = path.join(__dirname, "flow-locale-baseline.json");
let localeBaseline = new Set();
try {
  localeBaseline = new Set(
    (JSON.parse(fs.readFileSync(baselinePath, "utf8")).entries || []).map((e) => norm(e.lit))
  );
} catch (err) {
  if (err.code === "ENOENT") {
    // A MISSING baseline must not degrade to "empty baseline", which would
    // report all 39 pre-existing literals as new violations and block every flow
    // commit with a message that looks like a real regression. Fail loudly with
    // the actual cause instead.
    console.error(
      `❌ ${path.relative(ROOT, baselinePath)} is missing, so the locale-only ratchet cannot run.`
    );
    console.error(
      "   This file grandfathers the pre-existing hard-coded literals. Restore it from git"
    );
    console.error("   (git checkout -- maestro/tools/flow-locale-baseline.json) — do NOT commit");
    console.error("   without it, or every flow commit fails with a misleading violation list.");
    process.exit(2);
  }
  {
    console.error(`❌ could not read ${baselinePath}: ${err.message}`);
    process.exit(2);
  }
}
const localeMisses = new Map();
for (const x of localeMiss) {
  if (localeBaseline.has(x.cand)) continue;
  if (!localeMisses.has(x.cand)) localeMisses.set(x.cand, new Set());
  localeMisses.get(x.cand).add(x.f);
}
if (localeMisses.size) {
  blocked = true;
  console.log(`\n❌ LOCALE-ONLY COPY (blocking): ${localeMisses.size} literal(s) resolve in app/ but in NO locale file`);
  for (const [cand, files] of localeMisses) {
    console.log(`  ${JSON.stringify(cand)}`);
    console.log(`      ${[...files].join("\n      ")}`);
  }
  console.log("\n  These render correctly today, so this is an i18n problem, not a dead test:");
  console.log("  the copy is hard-coded JSX and will not exist in a non-en locale.");
  console.log("  Fix: wire the string to a t() locale key in the screen it renders on,");
  console.log("  then this assertion resolves in i18n and the entry can be removed from");
  console.log(`  ${path.relative(ROOT, baselinePath)}.`);
} else {
  const n = localeMiss.length;
  console.log(
    `\n✅ locale-only copy: clean (${n} baselined hard-coded literal(s) remain, none new)`
  );
}

if (blocked) process.exit(2);
console.log(
  "✅ every id: selector resolves, exists in its own app file, and every text" +
    " assertion resolves to real copy" +
    (skipEnv ? ` (${skipEnv} env-interpolated assertions not text-checked)` : "")
);
console.log(
  "   note: this gate does NOT verify screen-affinity — see the header in this file."
);
