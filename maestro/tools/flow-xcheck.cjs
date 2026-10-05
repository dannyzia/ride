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
 *
 *     WHY ONLY *LIVE* LOCALE VALUES (2026-10-05): a locale value whose key is
 *     ORPHANED renders nothing, so letting it satisfy an assertion is exactly
 *     the masking this tier must stop. The 106 keys purged 2026-10-05
 *     (confirm_ride.*, find_ride.*, apply_promos.*, ride.request) were exactly
 *     that shape — copy sitting in common.json that no screen could ever show,
 *     yet able to rescue an assertion as dead as it was. The locale side of the
 *     corpus is therefore values of keys scripts/audit-i18n-orphans.cjs does
 *     NOT classify ORPHANED (SHIELDED counts as live: those render through
 *     dynamic evidence). The classification is spawned at RUN time (--json),
 *     like check 5's nav audit, so no snapshot can go stale; when the audit
 *     cannot run the gate REFUSES (exit 2, loudly) rather than degrade to the
 *     full value set, because degrading silently re-enables the masking.
 *     MEASURED 2026-10-05: 7 of 156 distinct assertion candidates matched an
 *     orphaned value and no live one; all 7 are still rescued by
 *     source/containment, so 0 real assertions flipped to dead. This is a
 *     live-copy rule, NOT a locale-only tightening: source literals keep
 *     rescuing exactly as before.
 *
 *     EXTRACTOR WIDENED 2026-10-05: assertions written block-style (the
 *     assertion keyword on one line, `text: "…"` on the next) never matched
 *     COPY_RE and were therefore UNCHECKED — 57 lines / 51 checkable claims
 *     across ~20 flows, 4 of them dead. Disposition (owner ruling): the 3
 *     Barikoi result-row claims were already covered by the `savar`
 *     suppression; the bilingual truckCatalog Freight tab gained external-data
 *     suppressions (freight / মালবাহী); 8 locale-only catalog-label claims
 *     (others, now, food, truck, ton, furniture, bls) joined the locale
 *     ratchet. A claim the gate cannot see is worse than a masked one — the
 *     pass message lies — so `text:` lines are claims like any other.
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
 *  5. SCREEN AFFINITY (advisory, never blocks) Every flow-selected testID is
 *     attributed to its owner screen via testid-map.json, and owners that fall
 *     outside scripts/audit-nav-integrity.cjs's `reachable` set are reported.
 *     The audit is spawned at RUN time (`node scripts/audit-nav-integrity.cjs
 *     --json`), so no committed JSON snapshot can go stale. It is ADVISORY
 *     because `reachable` is a documented FLOOR: UNRESOLVED navigation sites are
 *     not edges, `_layout.tsx` files get no inbound edge (Tabs.Screen children,
 *     AdminShell-mounted admin screens), and external/URL entry is a
 *     declaration, not an edge. MEASURED 2026-10-04: raw `reachable` is 168 of
 *     232 route files; 57 of the map's 218 screens sit outside it while
 *     demonstrably live, and 0 of the 58 flows with id: selectors were flagged.
 *     Blocking on a floor would reject legitimate commits — the tier makes the
 *     gap visible, it does not gate. When the audit cannot run at all the tier
 *     says so loudly and still passes.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT GATE ─────────────────────────────────────
 * Screen-affinity in the full sense — "is this element on the screen the flow is
 * standing on right now" — is a RUNTIME property and cannot be decided from
 * source. Check 5 reports it advisorily for that reason; the two static
 * approximations were built and measured against this tree, and are treated
 * differently today:
 *
 *  · Reachability / orphan-screen detection — REBUILT. The three regex-era
 *    attempts were rejected on evidence (the final run flagged 99 of 234
 *    screens, most demonstrably live) for structural reasons no regex fixes:
 *    routes live in module constants (const R = "/(main)/…"; router.push(R));
 *    app/admin's navigation is a table with ZERO router.push/href calls; and
 *    app/track/[rideId].tsx plus app/payment/success.tsx are entered through an
 *    external URL scheme, not by any router call. scripts/audit-nav-integrity.cjs
 *    now resolves all three with an AST — module and function-local constants,
 *    the AdminShell NAV table, app/index.tsx's redirect forwarder — and is what
 *    check 5 consumes. Its `reachable` set is still a FLOOR (UNRESOLVED sites
 *    are not edges; 21 screens remain outside it once layouts and imports are
 *    accounted for, and 9 admin screens are absent from AdminShell's NAV), so
 *    check 5 warns and never blocks.
 *
 *  · Orphaned-i18n-key detection as a GATE of its own (a value present in
 *    common.json but whose key nothing renders). Key resolution needs a real
 *    parser — the regex era matched `home.search` as referenced because API
 *    routes contain the bare literal "search", while flagging live strings like
 *    "Welcome Back". The sound evidence-tiered version
 *    (scripts/audit-i18n-orphans.cjs) IS now consumed by check 3, but only for
 *    CORPUS PROVENANCE: a key it classifies ORPHANED may not rescue a claim.
 *    Its findings still do not gate here — the 130 pre-existing orphans are
 *    ratcheted in scripts/i18n-orphan-baseline.json behind
 *    `npm run check:i18n-orphans`.
 *
 * Screen-affinity judgments therefore stay CURATED in
 * maestro/tools/flow-testid-map.json (its DEAD section carries per-screen
 * evidence), which check 5 supplements with a live reachability signal but does
 * not replace: a flow is only ever as precise as that curated map.
 *
 * ── NOTE ON A CORRECTED FACT ────────────────────────────────────────────────
 * "Search destination..." is NOT absent from the codebase: it is the value of
 * `home.search` in i18n/locales/en/common.json:181, a key nothing renders. The
 * live destination row renders `home.search_destination` = "Where to?". So a
 * flow asserting the former could never match, but the reason is an orphaned
 * locale key rather than a missing string. That masking path is CLOSED since
 * 2026-10-05: the dead-copy corpus admits only LIVE locale values (see tier 3),
 * so a claim only an orphaned key's value can satisfy is flagged as dead copy —
 * which is the truth, because that copy renders nowhere.
 *
 * ── NOTE ON CORPUS PROVENANCE ───────────────────────────────────────────────
 * The corpus harvests raw string literals from app/ and components/, so every
 * `t('rider_activity.driver')` contributes a dotted i18n KEY to a set that is
 * supposed to hold rendered copy. Measured: 1247 of 9827 entries (12.7%) were
 * key-shaped. A key is not copy — it never renders — so key-shaped entries that
 * come ONLY from source are now excluded (a value present in a LIVE locale key
 * is kept regardless, since that one really does render — an orphaned value
 * does not). Dropping them flipped 0
 * of 198 claims to dead, so this is neutral today and removes the mechanism by
 * which a dead claim could later be masked by a neighbouring key's name.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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
// Block-style matcher value: the same assertion family with `text: "…"` on its
// own line (`- assertVisible:` / `tapOn:` / `extendedWaitUntil:` … then a
// nested `text:`). 57 such lines (51 checkable claims) across ~20 flows were
// invisible to COPY_RE before 2026-10-05 and went unchecked — 4 of them dead.
// Every `text:` line in a flow is a Maestro matcher value, so no nesting logic
// is needed to decide whether it is an assertion.
const TEXT_LINE_RE = /^\s*(?:-\s*)?text:\s*["'](.+?)["']\s*$/;

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
    const m = line.match(COPY_RE) || line.match(TEXT_LINE_RE);
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
const idFlows = new Map(); // id -> flow files (root-relative) that select it
for (const f of flowFiles) {
  const rel = posix(path.relative(ROOT, f));
  const txt = fs.readFileSync(f, "utf8");
  for (const m of txt.matchAll(ID_RE)) {
    idsUsedByFlows.add(m[1]);
    if (!idFlows.has(m[1])) idFlows.set(m[1], new Set());
    idFlows.get(m[1]).add(rel);
  }
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

// ── live-locale classification (spawned at RUN time) ──────────────────────────
// Which locale keys actually render is decided by scripts/audit-i18n-orphans.cjs
// (evidence-tiered and sound — unlike the regex era described in the header),
// spawned now with --json so no committed snapshot can go stale, same as check 5
// spawns the nav audit. Its ORPHANED keys are kept out of the dead-copy corpus
// below. If the audit cannot run, this REFUSES (exit 2, loudly) instead of
// degrading to the full value set: degrading would silently re-enable the exact
// masking this rule exists to close.
const orphanedKeys = new Set();
{
  const auditPath = path.join(ROOT, "scripts", "audit-i18n-orphans.cjs");
  let report = null;
  try {
    const r = spawnSync(process.execPath, [auditPath, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      const tail = (r.stderr || "").trim().split("\n").filter(Boolean).slice(-2).join(" | ");
      throw new Error(`audit exited ${r.status}${tail ? `: ${tail}` : ""}`);
    }
    report = JSON.parse(r.stdout);
  } catch (err) {
    console.error(`❌ cannot classify live locale values: ${err.message}`);
    console.error("   The dead-copy corpus may contain ONLY live locale values, so that an");
    console.error("   orphaned key's value can never mask a dead flow assertion.");
    console.error("   scripts/audit-i18n-orphans.cjs did not produce a classification; refusing");
    console.error("   to run with a corpus that could mask. Restore the audit, then re-run.");
    process.exit(2);
  }
  for (const o of report.orphans || []) {
    const k = o && (typeof o === "string" ? o : o.key);
    if (k) orphanedKeys.add(k);
  }
}

// ── check 3: dead-copy (advisory) ──────────────────────────────────────────────
/** Hoisted to module scope: the locale-only check (check 3b) needs it after the
 *  corpus block closes. Populated below from EVERY locale value, orphans
 *  included — check 3b asks "is this literal in the i18n files at all", a
 *  ratcheted localizability question, not "does it render". */
const localeValues = new Set();
/** LIVE locale values only: values of keys the run-time orphan classification
 *  (scripts/audit-i18n-orphans.cjs) does not list as ORPHANED. This is what
 *  enters the dead-copy corpus — an orphaned key's value never renders, so
 *  letting it rescue a claim is the masking this tier exists to stop. */
const liveValues = new Set();
const corpus = new Set();
{
  // Provenance matters: a dotted token harvested from a t('a.b') call is a KEY,
  // and a key never renders. Locale values are tracked apart from source
  // literals so a key-shaped string that also exists as a real LIVE locale
  // value (and therefore really does render) is still kept.
  const sourceValues = new Set();
  // Every locale value lands in localeValues (check 3b's "is this in the i18n
  // files at all" question). Only LIVE values — keys the run-time orphan
  // classification does not list — reach liveValues and the corpus: an orphaned
  // key's value never renders, so it must never rescue a claim. That exclusion
  // is what closes the masking by which orphaned copy (the purged confirm_ride.*
  // class) could satisfy an assertion no screen can ever render.
  for (const f of walk(I18N_DIR, [], /\.json$/)) {
    let json;
    try {
      json = JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      continue;
    }
    (function rec(v, k) {
      if (typeof v === "string") {
        const t = norm(v);
        if (t.length >= 2) {
          localeValues.add(t);
          if (!orphanedKeys.has(k)) liveValues.add(t);
        }
      } else if (v && typeof v === "object") {
        for (const [key, child] of Object.entries(v)) rec(child, k ? `${k}.${key}` : key);
      }
    })(json, "");
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
    if (KEY_SHAPED.test(v) && !liveValues.has(v)) {
      keysDropped++;
      continue;
    }
    corpus.add(v);
  }
  for (const v of liveValues) corpus.add(v);
  if (process.env.FLOW_XCHECK_VERBOSE) {
    console.log(
      `  corpus: ${corpus.size} entries (${keysDropped} i18n key-shaped literals dropped, ` +
        `${localeValues.size - liveValues.size} orphaned locale values excluded)`
    );
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

// ── check 5: screen affinity (advisory, never blocks) ─────────────────────────
// For each id: selector a flow uses, find its owner screen in testid-map.json
// (same attribution check 2 verifies) and ask whether the nav audit's BFS can
// actually route to that screen. The audit is spawned at RUN time rather than
// read from a committed snapshot, so this can never go stale relative to the
// app/ tree the map and flows were checked against. A spawn/parse failure
// downgrades the tier to a loud note: `reachable` is a FLOOR (see header), and a
// flow commit must not become unrunnable because the audit could not report.
const affinity = { status: "clean", byOwner: new Map(), note: null };
{
  const auditPath = path.join(ROOT, "scripts", "audit-nav-integrity.cjs");
  let report = null;
  try {
    const r = spawnSync(process.execPath, [auditPath, "--json"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.error) throw r.error;
    if (r.status !== 0) {
      const tail = (r.stderr || "").trim().split("\n").filter(Boolean).slice(-2).join(" | ");
      throw new Error(`audit exited ${r.status}${tail ? `: ${tail}` : ""}`);
    }
    report = JSON.parse(r.stdout);
  } catch (err) {
    affinity.status = "unavailable";
    affinity.note = err.message;
  }
  if (report) {
    const screens = new Set(report.screens || []);
    const reachable = new Set(report.reachable || []);
    const hits = [];
    for (const id of idsUsedByFlows) {
      const owner = idOwner.get(id);
      if (!owner) continue; // check 1 already reported this selector
      const screen = `app/${owner}`;
      if (!screens.has(screen)) continue; // not an addressable screen (layout / component / private)
      if (reachable.has(screen)) continue;
      hits.push({ screen, id });
    }
    for (const h of hits) {
      if (!affinity.byOwner.has(h.screen)) affinity.byOwner.set(h.screen, new Set());
      affinity.byOwner.get(h.screen).add(h.id);
    }
    if (hits.length) affinity.status = "findings";
  }
}

if (affinity.status === "unavailable") {
  console.log(`\n⚠ SCREEN AFFINITY (advisory, not blocking): unavailable — ${affinity.note}`);
  console.log(
    "  scripts/audit-nav-integrity.cjs did not produce a reachability report, so " +
      "flow→screen affinity was not evaluated. This is NOT a failure."
  );
} else if (affinity.status === "findings") {
  console.log(
    `\n⚠ SCREEN AFFINITY (advisory, not blocking): ${affinity.byOwner.size} screen(s) ` +
      "hold flow-selected testIDs but fall outside the audit's reachable set"
  );
  for (const [owner, ids] of affinity.byOwner) {
    console.log(`  ${owner}`);
    for (const id of [...ids].sort()) {
      console.log(`      ${id}  <- ${[...(idFlows.get(id) || [])].join(", ")}`);
    }
  }
  console.log(
    "  `reachable` is a FLOOR (BFS from app/index.tsx over resolved nav edges; " +
      "UNRESOLVED sites are not edges,"
  );
  console.log(
    "  and `_layout.tsx` files get no inbound edge), so check the screen before " +
      "trusting it dead. Curated"
  );
  console.log(
    "  affinity evidence lives in maestro/tools/flow-testid-map.json (DEAD section). " +
      "This never blocks."
  );
} else {
  console.log(
    "✅ screen affinity: every flow-selected id lives on a reachable screen (advisory tier)"
  );
}

if (blocked) process.exit(2);
console.log(
  "✅ every id: selector resolves, exists in its own app file, and every text" +
    " assertion resolves to real copy" +
    (skipEnv ? ` (${skipEnv} env-interpolated assertions not text-checked)` : "")
);
console.log(
  "   note: screen-affinity is reported ADVISORILY (check 5) and never blocks — see the" +
    " header in this file."
);
