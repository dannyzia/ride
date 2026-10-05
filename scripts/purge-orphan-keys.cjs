#!/usr/bin/env node
/**
 * purge-orphan-keys.cjs — remove a screen's now-orphaned locale keys in the
 * same change that deletes the screen.
 *
 * WHY. Deleting a screen strands its i18n keys: nothing references them, so
 * `node scripts/audit-i18n-orphans.cjs --gate` (run in the CI `test` job) fails
 * with the new orphans. This tool performs the cleanup the gate demands: it
 * takes the keys the audit proves ORPHANED, deletes them from BOTH locale
 * files, and prunes the same keys from scripts/i18n-orphan-baseline.json so the
 * ratchet stays in sync with the locales in one step.
 *
 * Usage:
 *   node scripts/purge-orphan-keys.cjs <namespace|key>...   # confirm_ride ride.request
 *   node scripts/purge-orphan-keys.cjs --new                # exactly the gate's new orphans
 *   node scripts/purge-orphan-keys.cjs [--new] --dry-run    # report the plan, write nothing
 *   node scripts/purge-orphan-keys.cjs [--new] --json
 *
 * A selector matches a locale key when key === sel or key starts with `sel.`.
 * SAFETY: the tool refuses (exit 2, no writes) when any matched locale key is
 * NOT orphaned — a namespace that is still partly referenced must not be purged
 * wholesale. Keys the audit does not list as ORPHANED can never be deleted.
 *
 * Exit codes: 0 = purged or dry-run complete, 1 = could not run (audit failed,
 * unreadable locale/baseline, or post-write verification failed), 2 = refused
 * (a matched key is still live).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const AUDIT = path.join(__dirname, "audit-i18n-orphans.cjs");
const LOCALE_FILES = ["en", "bn"].map((l) => `i18n/locales/${l}/common.json`);
const BASELINE = "scripts/i18n-orphan-baseline.json";

function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Serialize exactly like the file's current shape (indent, EOL, trailing newline). */
function writeJsonLike(rel, obj) {
  const raw = readText(rel);
  const crlf = raw.includes("\r\n");
  const trailing = raw.endsWith("\n");
  let out = JSON.stringify(obj, null, 2);
  if (trailing) out += "\n";
  if (crlf) out = out.replace(/\n/g, "\r\n");
  fs.writeFileSync(path.join(ROOT, rel), out, "utf8");
}

/** Flat dotted key set, the same flattening the audit uses. */
function flatten(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.add(key);
  }
  return out;
}

/** Delete a dotted key; prune ancestor objects that become empty. */
function deleteKey(rootObj, dotted) {
  const parts = dotted.split(".");
  const parents = [];
  let cur = rootObj;
  for (let i = 0; i < parts.length - 1; i++) {
    parents.push([cur, parts[i]]);
    cur = cur && typeof cur === "object" && !Array.isArray(cur) ? cur[parts[i]] : undefined;
  }
  if (!cur || typeof cur !== "object" || Array.isArray(cur)) return false;
  const leaf = parts[parts.length - 1];
  if (!(leaf in cur)) return false;
  delete cur[leaf];
  for (let i = parents.length - 1; i >= 0; i--) {
    const [obj, key] = parents[i];
    const child = obj[key];
    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      Object.keys(child).length === 0
    ) {
      delete obj[key];
    } else break;
  }
  return true;
}

/** Run the audit and return its report; throws with the tool's stderr on failure. */
function runAudit() {
  const raw = execFileSync(process.execPath, [AUDIT, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** Display groups: a lone key prints itself, a real set prints its namespace. */
function displayGroups(keys) {
  const groups = new Map();
  for (const key of keys) {
    const ns = key.split(".")[0];
    if (!groups.has(ns)) groups.set(ns, []);
    groups.get(ns).push(key);
  }
  return [...groups.entries()]
    .map(([ns, list]) => (list.length === 1 ? { label: list[0], count: 1 } : { label: `${ns}.*`, count: list.length }))
    .sort((a, b) => b.count - a.count);
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const selectors = argv.filter((a) => !a.startsWith("--"));
  const dryRun = flags.has("--dry-run");
  const asJson = flags.has("--json");
  const wantNew = flags.has("--new");
  if (!wantNew && selectors.length === 0) {
    console.error("usage: node scripts/purge-orphan-keys.cjs <namespace|key>... | --new [--dry-run] [--json]");
    return 1;
  }
  if (wantNew && selectors.length > 0) {
    console.error("❌ use either --new or explicit selectors, not both");
    return 1;
  }

  let report;
  try {
    report = runAudit();
  } catch (err) {
    console.error(`❌ could not run the audit: ${(err.stderr || err.message || "").trim()}`);
    return 1;
  }

  let baseline;
  try {
    baseline = JSON.parse(readText(BASELINE));
    if (!Array.isArray(baseline.keys) || !baseline.keys.every((k) => typeof k === "string")) {
      throw new Error("missing a `keys` array of strings");
    }
  } catch (err) {
    console.error(`❌ could not read ${BASELINE}: ${err.message}`);
    return 1;
  }

  const orphans = new Set(report.orphans.map((o) => o.key));
  const baselined = new Set(baseline.keys);
  const localeKeys = new Set();
  const localeDocs = new Map();
  for (const rel of LOCALE_FILES) {
    let doc;
    try {
      doc = JSON.parse(readText(rel));
    } catch (err) {
      console.error(`❌ could not read ${rel}: ${err.message}`);
      return 1;
    }
    localeDocs.set(rel, doc);
    for (const k of flatten(doc)) localeKeys.add(k);
  }

  const selected = [];
  const live = [];
  if (wantNew) {
    for (const o of report.orphans) {
      if (!baselined.has(o.key)) selected.push(o.key);
    }
  } else {
    const matches = (key) => selectors.some((s) => key === s || key.startsWith(`${s}.`));
    for (const key of localeKeys) {
      if (!matches(key)) continue;
      if (orphans.has(key)) selected.push(key);
      else live.push(key);
    }
  }

  if (live.length) {
    console.error(`❌ refused: ${live.length} matched key(s) are NOT orphaned — purging would delete live copy:`);
    for (const k of [...live].sort().slice(0, 20)) console.error(`   ${k}`);
    if (live.length > 20) console.error(`   ... +${live.length - 20} more`);
    console.error("   Narrow the selector to keys the audit lists as ORPHANED, or restore their references.");
    return 2;
  }

  selected.sort();
  if (selected.length === 0) {
    const message = wantNew
      ? "no new orphans — nothing to purge"
      : "no orphaned keys match the selector(s) — nothing to purge";
    if (asJson) console.log(JSON.stringify({ purged: [], baseline: { before: baselined.size, after: baselined.size }, dryRun, message }, null, 2));
    else console.log(`✅ ${message}`);
    return 0;
  }

  const selectedSet = new Set(selected);
  const beforeBaseline = baselined.size;
  const beforeLocale = localeKeys.size;
  const applyWrites = !dryRun;
  let afterBaseline = beforeBaseline;
  let afterLocale = beforeLocale;

  if (applyWrites) {
    for (const rel of LOCALE_FILES) {
      const doc = localeDocs.get(rel);
      for (const key of selected) deleteKey(doc, key);
      writeJsonLike(rel, doc);
    }
    baseline.keys = baseline.keys.filter((k) => !selectedSet.has(k));
    writeJsonLike(BASELINE, baseline);

    // Self-check: purged keys must be gone from BOTH locales, the en/bn key
    // sets must still match, and the baseline must not still carry any of them.
    const after = LOCALE_FILES.map((rel) => flatten(JSON.parse(readText(rel))));
    const afterBaselineKeys = JSON.parse(readText(BASELINE)).keys;
    for (const set of after) {
      for (const key of selected) {
        if (set.has(key)) {
          console.error(`❌ ${key} is still present after the purge`);
          return 1;
        }
      }
    }
    if (after[0].size !== after[1].size || [...after[0]].some((k) => !after[1].has(k))) {
      console.error("❌ en/bn key sets diverged after the purge");
      return 1;
    }
    if (afterBaselineKeys.some((k) => selectedSet.has(k))) {
      console.error("❌ the baseline still carries a purged key");
      return 1;
    }
    afterLocale = after[0].size;
    afterBaseline = afterBaselineKeys.length;
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          purged: selected,
          baseline: { before: beforeBaseline, after: afterBaseline },
          locales: { before: beforeLocale, after: afterLocale },
          dryRun,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`${dryRun ? "🔎 dry run — would purge" : "✅ purged"} ${selected.length} orphaned key(s) from en + bn:`);
    for (const g of displayGroups(selected)) console.log(`   ${g.label.padEnd(26)} ${g.count}`);
    console.log(`   baseline: ${beforeBaseline} → ${afterBaseline} entries`);
    console.log(`   locales : ${beforeLocale} → ${afterLocale} flat keys (both)`);
    if (!dryRun) console.log("   Next: node scripts/audit-i18n-orphans.cjs --gate");
  }
  return 0;
}

process.exitCode = main();
