#!/usr/bin/env node
/**
 * audit-i18n-dead-refs.cjs — promoted orphan-reference sweep (BLOCKING tier).
 *
 * WHAT THIS ANSWERS, and what the existing audits do NOT: a locale key can be
 * simultaneously DEAD (scripts/audit-i18n-orphans.cjs reports it ORPHANED — no
 * t() call can reach it) and still have its exact copy hard-coded in a live
 * screen. The orphan audit counts the key as dead; flow-xcheck check 3 passes
 * the flow claim because the copy resolves in SOURCE. Nobody ever reports the
 * pair, so the key sits in the orphan ratchet forever while the screen renders
 * English-only copy that the translation file already has a Bengali answer for.
 * That is precisely the state the 7 `auth.*` keys were in until 2026-10-05:
 * `auth.phone_entry` = "Enter your phone number" was ORPHANED while
 * phone-entry.tsx rendered "Enter your phone number to continue" as raw JSX.
 * This is the sweep that found them, promoted to a gate.
 *
 * WHY THE ORPHAN AUDIT CANNOT DO THIS: it answers "is any t() call able to
 * reach this key" — a question about the CALL GRAPH, not about whether the
 * string is on screen. Wiring the copy to the key is the fix; it cannot be
 * inferred from call-graph reachability, and by definition the key has no call.
 * flow-xcheck answers a third question ("does this flow claim resolve"), and
 * deliberately passes a claim that resolves in source (that is what keeps the
 * committed flows green). Neither tool looks at the intersection, which is the
 * only place the defect lives.
 *
 * TIER A — DEAD COPY IN SOURCE (blocking, ratcheted). An ORPHANED key whose en
 *   value is still hard-coded in a runtime screen/component. Blocking because
 *   the fix is unambiguous and local: wire the string to t(key) (the copy is
 *   already in the locale in both languages) or delete the key if the screen
 *   legitimately moved on. A NEW one is a screen that was wired with raw JSX
 *   instead of the key sitting in front of it.
 *   Baseline: scripts/i18n-dead-refs-baseline.json, a RATCHET over the pairs
 *   that predate this gate (13 keys at introduction, measured 2026-10-05). Each
 *   entry is deleted as its key is wired or purged. It must only ever shrink.
 *
 * TIER B — DEAD COPY IN A FLOW CLAIM (ADVISORY, never blocks). An ORPHANED key
 *   whose value a Maestro text claim asserts. Reported because it makes the
 *   Tier A finding expensive: the flow passes today on hard-coded copy and will
 *   start failing the day the screen is correctly localized, unless the claim is
 *   re-pointed in the same change. Advisory because flow-xcheck check 3 is the
 *   blocking authority on claims, and this tier's remedy is always "fix the
 *   screen", never "fix the flow first".
 *
 * MEASUREMENT, not taste, sets the length floor: of 123 orphaned keys, the
 * median value is 12 characters ("Sign Out", "Retry", "Cancel"), where a
 * containment match is indistinguishable from coincidence — 73 substring hits at
 * a 12-char floor, most of them noise ("Home" inside "Homepage"). At 16 the
 * signal is clean and the count drops to 13 keys, every one of them a genuine
 * real finding (see the introduction's measured cases). The floor is a constant
 * so the baseline stays stable rather than drifting with string-length changes.
 *
 * CORPUS DISCIPLINE: the orphan classification is obtained by SPAWNING
 * scripts/audit-i18n-orphans.cjs --json at RUN time, never from a committed
 * snapshot, so it cannot go stale the way a snapshot does — the same rule
 * flow-xcheck follows for its live-locale corpus. If that audit cannot run or
 * produces no classification, this REFUSES (exit 2, loudly) rather than
 * degrading to "no orphans", which would silently make the gate vacuous.
 *
 * Scope: app/ + components/ (.tsx/.ts, excluding app/api, __tests__/,
 * .test. and .spec. files, .d.ts) and every .yaml under maestro/, matching the
 * two tools this sits between. Comparison is whitespace-normalised and
 * case-folded;
 * `&` and Unicode differences are NOT folded, so a value only matches the copy
 * it is actually the same string as.
 *
 * Usage:
 *   node scripts/audit-i18n-dead-refs.cjs            # human-readable audit
 *   node scripts/audit-i18n-dead-refs.cjs --json     # machine-readable audit
 *   node scripts/audit-i18n-dead-refs.cjs --gate     # block on NEW tier-A pairs
 *   node scripts/audit-i18n-dead-refs.cjs --gate --json
 *
 * Exit codes: 0 = audit produced / gate passed; 1 = could not run (missing
 * locales, unreadable tree); 2 = --gate only: tier-A pairs absent from the
 * baseline, or the orphan classification / baseline could not be obtained.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["app", "components"];
const FLOWS_DIR = "maestro";
const LOCALE = "i18n/locales/en/common.json"; // posix literal: messages must not carry a platform separator
const BASELINE_REL = "scripts/i18n-dead-refs-baseline.json";
const MIN_LEN = 16; // measured; see header
const CAP = 20;

const posix = (p) => p.split(path.sep).join("/");
const relPath = (abs) => posix(path.relative(ROOT, abs));
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ").trim();

// ─── inputs ─────────────────────────────────────────────────────────────────

/** Flatten a locale JSON into dotted key -> value. */
function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

function loadLocale() {
  const p = path.join(ROOT, ...LOCALE.split("/"));
  try {
    return flatten(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`❌ ${LOCALE} is missing, so dead-key copy cannot be located.`);
    } else {
      console.error(`❌ could not read ${LOCALE}: ${err.message}`);
    }
    process.exit(1);
  }
}

function walk(dir, out = [], re) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, out, re);
    } else if (!re || re.test(e.name)) out.push(p);
  }
  return out;
}

/** Runtime UI only — the same exclusions audit-i18n-orphans.cjs applies. */
function isRuntimeFile(rel) {
  if (rel.includes("__tests__")) return false;
  if (/\.(test|spec)\./.test(rel)) return false;
  if (rel.startsWith("app/api/")) return false;
  return true;
}

/**
 * The orphan classification, spawned at RUN time. Returning null (rather than
 * an empty set) is deliberate: an absent classification must fail the gate,
 * not pass it.
 */
function orphanClassification() {
  const audit = path.join(ROOT, "scripts", "audit-i18n-orphans.cjs");
  const r = spawnSync(process.execPath, [audit, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    console.error("❌ scripts/audit-i18n-orphans.cjs did not run, so dead-key copy cannot be judged.");
    console.error(`   ${(r.stderr || r.error?.message || "").trim().split("\n")[0]}`);
    console.error("   This audit consumes its ORPHANED list at run time rather than trusting a");
    console.error("   snapshot. Restore the orphan audit (npm ci if it is failing to load), then");
    console.error("   re-run. Do NOT commit without a working classification — degrading to an");
    console.error("   empty orphan list would make every tier-A check vacuously pass.");
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    console.error(`❌ scripts/audit-i18n-orphans.cjs --json produced no usable JSON: ${err.message}`);
    console.error("   Refusing to run: an unparsable classification must not read as 'no orphans'.");
    return null;
  }
  if (!parsed || !Array.isArray(parsed.orphans)) {
    console.error("❌ the orphan audit emitted no `orphans` array; refusing to run.");
    console.error("   An empty orphan list would make every tier-A check vacuously pass.");
    return null;
  }
  return new Set(parsed.orphans.map((o) => o.key));
}

// ─── corpus ─────────────────────────────────────────────────────────────────

/** Runtime source files, normalised once; returns [rel, normalisedText]. */
function runtimeSources() {
  const out = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walk(dir, [], /\.tsx?$/)) {
      const rel = relPath(abs);
      if (!isRuntimeFile(rel)) continue;
      let text;
      try {
        text = fs.readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      out.push([rel, norm(text)]);
    }
  }
  return out;
}

// flow-xcheck's two matcher families, so a claim is counted exactly when
// flow-xcheck would check it (copy claims + block-style `text:`), and comment
// lines are documentation rather than assertions.
const COPY_RE =
  /^\s*(?:-\s*)?(?:assertVisible|extendedWaitUntil|waitUntil|notVisible|assertNotVisible|visible|tapOn)\s*:\s*["'](.+?)["']\s*$/;
const TEXT_LINE_RE = /^\s*(?:-\s*)?text:\s*["'](.+?)["']\s*$/;

function flowClaims() {
  const out = [];
  for (const abs of walk(FLOWS_DIR, [], /\.yaml$/)) {
    const rel = relPath(abs);
    if (rel.startsWith("maestro/tools/")) continue;
    let txt;
    try {
      txt = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
    } catch {
      continue;
    }
    txt.split("\n").forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      const m = line.match(COPY_RE) || line.match(TEXT_LINE_RE);
      if (!m) return;
      out.push({ file: rel, line: i + 1, raw: m[1], norm: norm(m[1]) });
    });
  }
  return out;
}

// ─── analysis ───────────────────────────────────────────────────────────────

function analyze() {
  const values = loadLocale();
  const orphans = orphanClassification();
  if (orphans === null) process.exit(2);

  const sources = runtimeSources();
  const claims = flowClaims();

  // A regex claim like ".*Log In.*|.*Get Started.*" or a bare ".*" has no
  // literal content to compare, so it cannot pin copy and must not match
  // anything: dropping those is what keeps tier B from being all noise.
  const comparable = claims.filter((c) => c.norm.replace(/[.*^$?+()[\]{}\\|]/g, "").trim().length >= MIN_LEN);

  const deadCopyInSource = [];
  const deadCopyInFlow = [];
  let tooShort = 0;

  for (const key of [...orphans].sort()) {
    const value = values.get(key);
    if (typeof value !== "string") continue;
    const nv = norm(value);
    // The floor is the noise control; below it a containment match proves
    // nothing, so the key is skipped and counted rather than reported.
    if (nv.length < MIN_LEN) {
      tooShort++;
      continue;
    }

    const files = sources.filter(([, text]) => text.includes(nv)).map(([rel]) => rel);
    if (files.length) {
      deadCopyInSource.push({
        key,
        value,
        files,
        // A single whole-token hit is stronger evidence than one inside a
        // longer sentence; both are real, the tier only records which.
        evidence: files.length === 1 ? "sole-file" : "multi-file",
      });
    }

    const hits = comparable.filter((c) => c.norm === nv);
    if (hits.length) {
      deadCopyInFlow.push({
        key,
        value,
        claims: hits.map((h) => ({ file: h.file, line: h.line, raw: h.raw })),
      });
    }
  }

  return {
    floor: MIN_LEN,
    locale: { file: LOCALE, keys: values.size },
    scan: {
      sourceFiles: sources.length,
      orphanKeys: orphans.size,
      belowFloor: tooShort,
      flowClaims: claims.length,
      comparableClaims: comparable.length,
    },
    deadCopyInSource,
    deadCopyInFlow,
  };
}

// ─── gate ───────────────────────────────────────────────────────────────────
// The ratchet. Only pairs that predate the gate are grandfathered; a new one is
// a regression (a screen wired with raw JSX instead of the key already sitting
// in the locale beside it) and blocks. Stale entries are reported, never
// blocked, so bookkeeping cannot be the reason the gate cannot pass.

function gate(r) {
  const json = process.argv.includes("--json");
  let baselined;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_REL), "utf8"));
    if (!parsed || !Array.isArray(parsed.keys) || !parsed.keys.every((k) => typeof k === "string")) {
      throw new Error("missing a `keys` array of strings");
    }
    baselined = new Set(parsed.keys);
  } catch (err) {
    if (err.code === "ENOENT") {
      // A MISSING baseline must not degrade to "empty": that would report
      // every pre-existing pair as new and fail every run with a message that
      // looks like a regression.
      console.error(`❌ ${BASELINE_REL} is missing, so the dead-reference ratchet cannot run.`);
      console.error("   This file grandfathers the dead-copy pairs that predate the gate. Restore");
      console.error(`   it from git (git checkout -- ${BASELINE_REL}) — do NOT commit without it.`);
    } else {
      console.error(`❌ could not read ${BASELINE_REL}: ${err.message}`);
    }
    return 2;
  }

  const current = r.deadCopyInSource.map((d) => d.key);
  const currentSet = new Set(current);
  const fresh = r.deadCopyInSource.filter((d) => !baselined.has(d.key));
  const stale = [...baselined].filter((k) => !currentSet.has(k)).sort();

  if (json) {
    console.log(
      JSON.stringify(
        {
          ...r,
          gate: {
            baseline: BASELINE_REL,
            baselined: baselined.size,
            pairs: r.deadCopyInSource.length,
            new: fresh,
            stale,
            passed: fresh.length === 0,
          },
        },
        null,
        2,
      ),
    );
  } else {
    if (fresh.length) {
      console.log(`❌ i18n dead-ref gate: ${fresh.length} NEW dead key(s) whose copy is hard-coded:`);
      console.log("");
      for (const d of fresh) {
        console.log(`  ${d.key}  = ${JSON.stringify(d.value)}`);
        console.log(`      hard-coded in: ${d.files.join(", ")}`);
      }
      console.log("");
      console.log("  These keys are ORPHANED (nothing calls t() on them) while the same copy is");
      console.log("  rendered as raw JSX. The Bengali translation already exists in");
      console.log(`  ${LOCALE}; the screen is showing English only.`);
      console.log("  Fix: wire the string to t('" + fresh[0].key + "') — the copy and both");
      console.log("  translations already exist — or delete the key if this screen moved on.");
      console.log(`  Do NOT add it to ${BASELINE_REL} to silence this check — that file is the`);
      console.log("  ratchet for the backlog that predates the gate.");
    } else {
      console.log(
        `✅ i18n dead-ref gate: clean (${r.deadCopyInSource.length} baselined pair(s) remain, none new)`,
      );
    }
    if (r.deadCopyInFlow.length) {
      console.log(
        `\nℹ️  ${r.deadCopyInFlow.length} dead key(s) are asserted by flow text claim(s) (advisory):`,
      );
      for (const d of r.deadCopyInFlow.slice(0, CAP)) {
        const where = d.claims.slice(0, 3).map((c) => `${c.file}:${c.line}`).join(", ");
        console.log(`  ${d.key}  ${where}${d.claims.length > 3 ? ` (+${d.claims.length - 3} more)` : ""}`);
      }
      if (r.deadCopyInFlow.length > CAP) {
        console.log(`  ... +${r.deadCopyInFlow.length - CAP} more (use --json for the full list)`);
      }
      console.log("  These claims pass today because the copy is hard-coded. They will start");
      console.log("  failing when the screen is localized — re-point them in that same change.");
    }
    if (stale.length) {
      console.log(
        `\nℹ️  ${stale.length} baselined key(s) are no longer dead-copy — delete them from ${BASELINE_REL}:`,
      );
      for (const k of stale.slice(0, CAP)) console.log(`  ${k}`);
      if (stale.length > CAP) console.log(`  ... +${stale.length - CAP} more (use --json for the full list)`);
    }
  }
  return fresh.length === 0 ? 0 : 2;
}

// ─── output ─────────────────────────────────────────────────────────────────

function report(r) {
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  console.log(`locale read  : ${r.locale.file} (${r.locale.keys} keys)`);
  console.log(
    `orphan keys  : ${r.scan.orphanKeys} (${r.scan.belowFloor} below the ${r.floor}-char ` +
      `matching floor, skipped)`,
  );
  console.log(`scanned      : ${r.scan.sourceFiles} runtime files, ${r.scan.flowClaims} flow text claims`);
  console.log(`\nDEAD COPY IN SOURCE (orphan key, copy hard-coded): ${r.deadCopyInSource.length}`);
  for (const d of r.deadCopyInSource.slice(0, CAP)) {
    console.log(`  ${d.key}  = ${JSON.stringify(d.value)}  [${d.evidence}]`);
    console.log(`      ${d.files.join(", ")}`);
  }
  if (r.deadCopyInSource.length > CAP) {
    console.log(`  ... +${r.deadCopyInSource.length - CAP} more (use --json for the full list)`);
  }
  console.log(`\nDEAD COPY IN A FLOW CLAIM (advisory): ${r.deadCopyInFlow.length}`);
  for (const d of r.deadCopyInFlow.slice(0, CAP)) {
    console.log(`  ${d.key}  ${d.claims.map((c) => `${c.file}:${c.line}`).join(", ")}`);
  }
  console.log("\nNOTE: this audit run exits 0 regardless; --gate blocks only dead-copy pairs");
  console.log(`      not in ${BASELINE_REL}. The floor-claim count above is the honest bound:`);
  console.log("      an orphaned key whose copy is asserted by a flow is REPORTED, never blocked.");
}

const result = analyze();
if (process.argv.includes("--gate")) process.exitCode = gate(result);
else report(result);