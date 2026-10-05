#!/usr/bin/env node
/**
 * audit-deletion-impact.cjs — one command that joins the nav-integrity audit
 * and the i18n orphan audit into a per-screen deletion-impact report.
 *
 * WHY. A dead screen is described from two angles by two tools:
 *   - scripts/audit-nav-integrity.cjs finds route files with NO inbound edge
 *     (its `unreachable` bucket);
 *   - scripts/audit-i18n-orphans.cjs finds locale keys with no reference of any
 *     kind (`orphans`) and keys reachable only through dynamic evidence
 *     (`shielded`).
 * Deleting a screen also drops its testIDs from maestro/tools/testid-map.json.
 * This tool joins the three: for every screen with no inbound edge it lists the
 * testIDs attributed to it and the locale keys whose ONLY reference sites sit
 * inside that screen — exactly the keys that become orphaned when it goes.
 * `node scripts/audit-i18n-orphans.cjs --gate` then fails on those keys, and
 * `node scripts/purge-orphan-keys.cjs --new` purges them in the same change
 * (§ Workflow 9 — Deleting a Screen of .claude/WORKFLOWS.md, tracked as
 * §Deleting a screen of docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md).
 *
 * HOW THE JOIN IS COMPUTED. Per candidate screen:
 *   - its files are the route file itself, plus (for an `index.*` screen) the
 *     non-route helper files in the same directory — sibling route files and
 *     `_`-prefixed layout files are other surfaces and are not attributed;
 *   - testIDs come from maestro/tools/testid-map.json, which attributes every
 *     id to the app-relative file that declares it;
 *   - a key DIES WITH the screen when a key-shaped string literal (the same
 *     shape and the same TypeScript AST source the i18n audit uses) occurs in
 *     its files, the key exists in a locale, the audit does not already list it
 *     as orphaned (an existing backlog entry does not die with anything), and
 *     NO other runtime file references it — not as a literal, not through the
 *     i18n audit's resolved dynamic entries (`keys`), and not under a template
 *     prefix (`t(`ns.${x}`)`). References are indexed once across app/ +
 *     components/ (minus app/api, __tests__, *.test.*, *.d.ts, mirroring the
 *     i18n audit's isRuntimeFile) so the test is exact, not quoted.
 *
 * Usage:
 *   node scripts/audit-deletion-impact.cjs                 # all no-inbound screens
 *   node scripts/audit-deletion-impact.cjs --screen top-up # substring filter
 *   node scripts/audit-deletion-impact.cjs --json          # machine-readable
 *
 * Exit codes: 0 = report emitted, 1 = an input audit failed or the testID map
 * could not be read.
 *
 * CAVEAT, printed with the report: nav `unreachable` is a FLOOR, not a proof —
 * URL entry, deep links, push taps and static tables the resolver cannot bind
 * are not edges. Classify each screen (§1–5 of the DEAD-SCREEN-AUDIT report)
 * before deleting; this report says what WOULD die, not what SHOULD go.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const NAV_AUDIT = path.join(__dirname, "audit-nav-integrity.cjs");
const I18N_AUDIT = path.join(__dirname, "audit-i18n-orphans.cjs");
const TESTID_MAP = path.join(ROOT, "maestro", "tools", "testid-map.json");
const SCAN_DIRS = ["app", "components"];
const LOCALE_FILES = ["en", "bn"].map((l) => `i18n/locales/${l}/common.json`);

// Identical to scripts/audit-i18n-orphans.cjs — one shape, one meaning.
const KEY_SHAPE = /^[a-z0-9]+(_[a-z0-9]+)*(\.[a-z0-9_]+)+$/;

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const screenIdx = argv.indexOf("--screen");
const SCREEN_FILTER = screenIdx >= 0 ? argv[screenIdx + 1] : null;
if (screenIdx >= 0 && (!SCREEN_FILTER || SCREEN_FILTER.startsWith("--"))) {
  console.error("usage: node scripts/audit-deletion-impact.cjs [--json] [--screen <substring>]");
  process.exit(1);
}

let ts;
try {
  ts = require(path.join(ROOT, "node_modules", "typescript"));
} catch (err) {
  console.error(`❌ typescript not found: ${err.message}`);
  console.error("   Run: npm ci (repo root).");
  process.exit(1);
}

const posix = (p) => p.split(path.sep).join("/");
const relPath = (abs) => posix(path.relative(ROOT, abs));

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

/** Runtime UI only, mirroring the i18n audit's filter. */
function isRuntimeFile(rel) {
  if (rel.includes("__tests__")) return false;
  if (/\.(test|spec)\./.test(rel)) return false;
  if (rel.startsWith("app/api/")) return false;
  return true;
}

function runAudit(tool) {
  const raw = execFileSync(process.execPath, [tool, "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

/** Locale JSON -> Set of flat dotted keys (membership only). */
function flattenKeys(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenKeys(v, key, out);
    else out.add(key);
  }
  return out;
}

/** Every key-shaped string literal in a file, as the i18n audit reads them. */
function literalKeysOf(abs) {
  const text = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, false);
  const keys = new Set();
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (KEY_SHAPE.test(node.text)) keys.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return keys;
}

// ── inputs ────────────────────────────────────────────────────────────────────

let nav;
let i18n;
let testidMap;
try {
  nav = runAudit(NAV_AUDIT);
} catch (err) {
  console.error(`❌ nav-integrity audit failed: ${(err.stderr || err.message || "").trim()}`);
  process.exit(1);
}
try {
  i18n = runAudit(I18N_AUDIT);
} catch (err) {
  console.error(`❌ i18n orphan audit failed: ${(err.stderr || err.message || "").trim()}`);
  process.exit(1);
}
try {
  testidMap = JSON.parse(fs.readFileSync(TESTID_MAP, "utf8"));
} catch (err) {
  console.error(`❌ could not read ${path.relative(ROOT, TESTID_MAP)}: ${err.message}`);
  process.exit(1);
}

const enKeys = flattenKeys(JSON.parse(fs.readFileSync(path.join(ROOT, ...LOCALE_FILES[0].split("/")), "utf8")));
const bnKeys = flattenKeys(JSON.parse(fs.readFileSync(path.join(ROOT, ...LOCALE_FILES[1].split("/")), "utf8")));

// ── reference indexes over the runtime tree ──────────────────────────────────

const runtimeFiles = SCAN_DIRS.map((d) => path.join(ROOT, d))
  .flatMap((d) => walk(d))
  .map((abs) => ({ abs, rel: relPath(abs) }))
  .filter((f) => isRuntimeFile(f.rel));

const literalsByFile = new Map(); // file -> Set<key>
const literalFiles = new Map(); // key -> Set<file>
for (const f of runtimeFiles) {
  const keys = literalKeysOf(f.abs);
  literalsByFile.set(f.rel, keys);
  for (const k of keys) {
    if (!literalFiles.has(k)) literalFiles.set(k, new Set());
    literalFiles.get(k).add(f.rel);
  }
}

// Resolved dynamic entries and template prefixes, straight from the audit.
const dynKeyFiles = new Map(); // key -> Set<file>
const dynPrefixFiles = new Map(); // prefix -> Set<file>
for (const d of i18n.dynamic) {
  for (const k of d.keys) {
    if (!dynKeyFiles.has(k)) dynKeyFiles.set(k, new Set());
    dynKeyFiles.get(k).add(d.file);
  }
  if (d.prefix) {
    if (!dynPrefixFiles.has(d.prefix)) dynPrefixFiles.set(d.prefix, new Set());
    dynPrefixFiles.get(d.prefix).add(d.file);
  }
}

const orphanSet = new Set(i18n.orphans.map((o) => o.key));
const screensSet = new Set(nav.screens);

// ── per-screen join ──────────────────────────────────────────────────────────

function screenFiles(rel) {
  const files = new Set([rel]);
  const base = path.basename(rel, path.extname(rel));
  if (base !== "index") return files; // a leaf route is its own single file
  const dir = posix(path.dirname(rel));
  for (const f of runtimeFiles) {
    // Direct siblings only: an `app/index.tsx` screen must not swallow the
    // whole nested tree (and a nested helper belongs to its own directory).
    if (posix(path.dirname(f.rel)) !== dir) continue;
    const bn = path.basename(f.rel);
    if (bn.startsWith("_")) continue; // a layout is not this screen
    if (screensSet.has(f.rel) && f.rel !== rel) continue; // a sibling route is its own screen
    files.add(f.rel);
  }
  return files;
}

function literalOutside(key, files) {
  const sites = literalFiles.get(key);
  return sites ? [...sites].some((f) => !files.has(f)) : false;
}

function dynamicOutside(key, files) {
  const viaKeys = dynKeyFiles.get(key);
  if (viaKeys && [...viaKeys].some((f) => !files.has(f))) return true;
  for (const [prefix, sites] of dynPrefixFiles) {
    if (!key.startsWith(prefix)) continue;
    if ([...sites].some((f) => !files.has(f))) return true;
  }
  return false;
}

const candidates = nav.unreachable
  .filter((rel) => !SCREEN_FILTER || rel.toLowerCase().includes(SCREEN_FILTER.toLowerCase()))
  .sort();

const screens = [];
for (const rel of candidates) {
  const files = screenFiles(rel);
  const testIDs = [];
  for (const f of [...files].sort()) {
    const entry = testidMap.screens[f.replace(/^app\//, "")] || [];
    for (const item of entry) if (!testIDs.includes(item.id)) testIDs.push(item.id);
  }
  const inScreen = new Set();
  for (const f of files) for (const k of literalsByFile.get(f) || []) inScreen.add(k);
  const keys = [...inScreen]
    .filter((k) => (enKeys.has(k) || bnKeys.has(k)) && !orphanSet.has(k))
    .filter((k) => !literalOutside(k, files) && !dynamicOutside(k, files))
    .sort();
  screens.push({
    file: rel,
    admin: rel.startsWith("app/admin/"),
    sources: [...files].sort(),
    testIDs,
    keys,
  });
}

// ── report ────────────────────────────────────────────────────────────────────

const totals = {
  screens: screens.length,
  testIDs: screens.reduce((n, s) => n + s.testIDs.length, 0),
  keys: screens.reduce((n, s) => n + s.keys.length, 0),
};

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        screens,
        totals,
        nav: {
          routeFiles: nav.routeFiles,
          sites: nav.sites,
          unreachable: nav.unreachable.length,
          adminUnlisted: nav.adminUnlisted.length,
          dangling: nav.dangling,
          unresolved: nav.unresolved,
        },
        i18n: { orphans: i18n.orphans.length, shielded: i18n.shielded.length },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const CAP = 40;
const cap = (list) => (list.length > CAP ? [...list.slice(0, CAP), `… +${list.length - CAP} more (use --json)`] : list);

console.log("Deletion-impact report — screens with no inbound navigation edge");
console.log("(joins audit-nav-integrity + audit-i18n-orphans + maestro/tools/testid-map.json)");
console.log("─".repeat(72));
if (screens.length === 0) {
  console.log(SCREEN_FILTER ? `no no-inbound screen matches "${SCREEN_FILTER}"` : "no screens with no inbound edge");
}
for (const s of screens) {
  console.log(`\n${s.file}${s.admin ? "  [admin]" : ""}`);
  const ids = cap(s.testIDs);
  console.log(`   testIDs (${s.testIDs.length}): ${ids.length ? ids.join(", ") : "none"}`);
  const keys = cap(s.keys);
  console.log(`   keys that die with it (${s.keys.length}): ${keys.length ? keys.join(", ") : "none"}`);
}
console.log(`\n${"─".repeat(72)}`);
console.log(`${totals.screens} screen(s) · ${totals.testIDs} testID(s) · ${totals.keys} locale key(s) die with them`);
console.log(
  `nav: ${nav.routeFiles} route files · ${nav.unreachable.length} no inbound edge · ` +
    `${nav.adminUnlisted.length} admin-unlisted · ${nav.dangling.length} dangling · ${nav.unresolved.length} unresolved`,
);
console.log(`i18n (current tree): ${i18n.orphans.length} orphaned (baselined) · ${i18n.shielded.length} shielded`);
if (nav.dangling.length) {
  console.log("\nDANGLING navigation targets (fix or remove):");
  for (const d of nav.dangling) console.log(`   ${d.file}:${d.line} -> ${d.target}`);
}
console.log(
  "\n⚠ no inbound edge is a FLOOR — URL entry, deep links, push taps and static tables\n" +
    "  the resolver cannot bind are not edges. Classify before deleting (§1–5 of\n" +
    "  docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md); this report says what\n" +
    "  WOULD die, not what SHOULD go.",
);
