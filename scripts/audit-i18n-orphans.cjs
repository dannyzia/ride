#!/usr/bin/env node
/**
 * audit-i18n-orphans.cjs — AST-based i18n key resolver.
 *
 * WHAT THIS ANSWERS: which keys in i18n/locales/<lng>/common.json are never
 * referenced by any translation call in the runtime app/ + components/ tree
 * (ORPHANS), which are called but absent from the locale (MISSING), and where
 * en/bn diverge (PARITY). It replaces a hand sweep: after a screen is deleted,
 * its keys survive silently until someone notices. This finds them on demand.
 *
 * WHY AST, NOT REGEX: a regex cannot tell `t('home.search')` from the same
 * characters inside a comment, a class name, or a string in an unrelated file.
 * Deciding "is this key USED" requires knowing it is the first argument of a
 * call expression. This walks the real syntax tree with the TypeScript compiler
 * API (already a dependency — maestro/tools/add-testids.cjs uses the same `ts`
 * import), so a key in a comment is a comment and a key passed to something
 * that is not `t()` is not a translation. `home.search` is the motivating
 * case: a missing-key audit had called it dead while three flow files
 * documented it as unused, when autocomplete/index.tsx:201 renders it.
 *
 * CARRIER SHAPES HANDLED
 *   t('a.b')                     direct call (string literal)
 *   t(`a.b`)                     no-substitution template
 *   <expr>.t('a.b')              property-access callee (i18n.t)
 *   t(`ns.${x}`)                 template with a static prefix -> every locale
 *                                key starting with `ns.` is treated as reachable
 *   t(TABLE[k])                  identifiers in the argument resolve to
 *                                file-local const initializers; every literal
 *                                in them is treated as reachable
 *   t(item.k) / t(key)           callback/function parameters cannot be
 *                                resolved statically. If a file still has such
 *                                UNSOLVED dynamic calls after the above, every
 *                                key-shaped literal in that file (outside call
 *                                arguments) is treated as reachable and lands
 *                                in the SHIELDED bucket, never silently in
 *                                ORPHANS.
 *
 * DELIBERATELY REPORTED, NOT GUESSED: dynamic calls are listed with their
 * evidence. A key shielded by evidence the tool could not resolve is output in
 * `shielded` with a reason, so the uncertainty is visible instead of folded
 * into either verdict. ORPHANS is the "no reference of any kind" list.
 *
 * SCOPE: app/ and components/ only, excluding app/api/** (server code whose
 * key-shaped strings are RBAC scopes and catalog codes), __tests__/, *.test.*,
 * and *.d.ts. store/, lib/, utils-server/ hold no t() calls (verified: the
 * only translation caller is the UI tree). i18n/locales/** is read as data.
 *
 * Usage:
 *   node scripts/audit-i18n-orphans.cjs           # human-readable
 *   node scripts/audit-i18n-orphans.cjs --json    # machine-readable
 *
 * Exit codes: 0 = report produced (regardless of findings — it is an AUDIT and
 * reports, it does not gate), 1 = could not run (missing typescript / unreadable
 * locale). Making it a gate requires an owner ruling on the existing orphan
 * backlog first; see the note in report().
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SCAN_DIRS = ["app", "components"];
const LOCALES = ["en", "bn"];
const LOCALE_FILES = LOCALES.map((l) => path.join("i18n", "locales", l, "common.json"));
const KEY_SHAPE = /^[a-z0-9]+(_[a-z0-9]+)*(\.[a-z0-9_]+)+$/;

const EMPTY = [];

let ts;
try {
  ts = require(path.join(ROOT, "node_modules", "typescript"));
} catch (err) {
  console.error(`❌ typescript not found: ${err.message}`);
  console.error("   Run: npm ci (repo root).");
  process.exit(1);
}

// ─── file discovery ──────────────────────────────────────────────────────────

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

const relPath = (abs) => path.relative(ROOT, abs).split(path.sep).join("/");

/** Runtime UI only. Tests assert their keys; they do not render them. */
function isRuntimeFile(rel) {
  if (rel.includes("__tests__")) return false;
  if (/\.(test|spec)\./.test(rel)) return false;
  if (rel.startsWith("app/api/")) return false;
  return true;
}

// ─── locale data ─────────────────────────────────────────────────────────────

/** Flatten a locale JSON into dotted key paths -> value. */
function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out.set(key, v);
  }
  return out;
}

// ─── AST helpers ─────────────────────────────────────────────────────────────

/** True when the callee is `t` or any `<expr>.t`. */
function isTranslationCallee(expr) {
  if (ts.isIdentifier(expr)) return expr.text === "t";
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text === "t";
  return false;
}

/** Every string literal in a subtree (used for argument + table evidence). */
function collectLiterals(node, out) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.add(node.text);
  ts.forEachChild(node, (c) => collectLiterals(c, out));
}

/** Identifier names in a subtree; property names (`x.name`) are not bindings. */
function collectIdentifiers(node, out = new Set()) {
  if (ts.isPropertyAccessExpression(node)) {
    collectIdentifiers(node.expression, out);
    return out;
  }
  if (ts.isIdentifier(node)) out.add(node.text);
  ts.forEachChild(node, (c) => collectIdentifiers(c, out));
  return out;
}

/** `t(`ns.${x}`)` -> "ns." — the static head, when it is a usable prefix. */
function templatePrefix(arg) {
  if (!ts.isTemplateExpression(arg)) return null;
  const head = arg.head.text;
  return head.length >= 3 && head.includes(".") ? head : null;
}

/** File-local `const NAME = <initializer>` declarations, name -> initializers. */
function buildDecls(sf) {
  const decls = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!decls.has(node.name.text)) decls.set(node.name.text, []);
      decls.get(node.name.text).push(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return decls;
}

// ─── per-file analysis ───────────────────────────────────────────────────────

function scanFile(file) {
  const rel = relPath(file);
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file,
    src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const decls = buildDecls(sf);

  const staticUses = []; // { key, file, line }
  const dynamic = []; // { file, line, kind, keys, prefix, unresolved }
  const argRanges = []; // [start, end] of every translation call's first argument

  function visit(node) {
    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const arg = node.arguments[0];
      if (isTranslationCallee(node.expression)) {
        argRanges.push([arg.getStart(sf), arg.end]);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
          if (KEY_SHAPE.test(arg.text)) staticUses.push({ key: arg.text, file: rel, line });
        } else {
          const keys = new Set();
          collectLiterals(arg, keys);
          const prefix = templatePrefix(arg);
          for (const name of collectIdentifiers(arg)) {
            if (decls.has(name)) for (const init of decls.get(name)) collectLiterals(init, keys);
          }
          const keyList = [...keys].filter((k) => KEY_SHAPE.test(k));
          dynamic.push({
            file: rel,
            line,
            kind: ts.SyntaxKind[arg.kind],
            keys: keyList,
            prefix,
            unresolved: keyList.length === 0 && !prefix,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  // Key-shaped literals OUTSIDE translation-call arguments. These are the
  // tables/call-sites that unresolved callback-parameter calls may consume.
  const fileLiterals = [];
  function literalWalk(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (KEY_SHAPE.test(text)) {
        const start = node.getStart(sf);
        const inArg = argRanges.some(([a, b]) => start >= a && node.end <= b);
        if (!inArg) {
          fileLiterals.push({ key: text, line: sf.getLineAndCharacterOfPosition(start).line + 1 });
        }
      }
    }
    ts.forEachChild(node, literalWalk);
  }
  literalWalk(sf);

  return { rel, staticUses, dynamic, fileLiterals };
}

// ─── aggregation ─────────────────────────────────────────────────────────────

function pushSite(map, key, site) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(site);
}

function analyze() {
  const localeMaps = new Map();
  for (const rel of LOCALE_FILES) {
    const abs = path.join(ROOT, rel);
    let json;
    try {
      json = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch (err) {
      console.error(`❌ could not read ${rel}: ${err.message}`);
      process.exit(1);
    }
    localeMaps.set(rel, flatten(json));
  }
  const en = localeMaps.get(LOCALE_FILES[0]);
  const bn = localeMaps.get(LOCALE_FILES[1]);

  const files = SCAN_DIRS.map((d) => path.join(ROOT, d))
    .flatMap((d) => walk(d))
    .filter((f) => isRuntimeFile(relPath(f)));

  const staticByKey = new Map(); // key -> [file:line]
  const templateShield = new Map(); // prefix -> [file:line]
  const argShield = new Map(); // key -> [file:line]
  const fallbackByKey = new Map(); // key -> [file:line]
  const dynamicAll = [];

  for (const file of files) {
    const res = scanFile(file);
    for (const u of res.staticUses) pushSite(staticByKey, u.key, `${u.file}:${u.line}`);
    for (const d of res.dynamic) {
      const site = `${d.file}:${d.line}`;
      dynamicAll.push(d);
      if (d.prefix) pushSite(templateShield, d.prefix, site);
      for (const key of d.keys) pushSite(argShield, key, site);
    }
    const hasUnresolved = res.dynamic.some((d) => d.unresolved);
    const fallbackKeys = hasUnresolved ? res.fileLiterals : EMPTY;
    for (const lit of fallbackKeys) pushSite(fallbackByKey, lit.key, `${res.rel}:${lit.line}`);
  }

  // Orphans vs shielded: a locale key is orphaned only when NO tier — static
  // call, template prefix, resolved table, or file fallback — can reach it.
  const allKeys = [...new Set([...en.keys(), ...bn.keys()])].sort();
  const orphans = [];
  const shielded = [];
  for (const key of allKeys) {
    if (staticByKey.has(key)) continue;
    const reasons = [];
    const via = [];
    const prefixHit = [...templateShield.keys()].filter((p) => key.startsWith(p));
    if (prefixHit.length) {
      reasons.push("template-prefix");
      via.push(...templateShield.get(prefixHit[0]).slice(0, 2));
    }
    if (argShield.has(key)) {
      reasons.push("dynamic-table");
      via.push(...argShield.get(key).slice(0, 2));
    }
    if (fallbackByKey.has(key)) {
      reasons.push("file-fallback");
      via.push(...fallbackByKey.get(key).slice(0, 2));
    }
    const locales = [];
    if (en.has(key)) locales.push("en");
    if (bn.has(key)) locales.push("bn");
    if (reasons.length === 0) orphans.push({ key, locales });
    else shielded.push({ key, locales, reasons, via: [...new Set(via)] });
  }

  // Missing: called with a static key that the primary locale does not define.
  const missing = [];
  for (const [key, sites] of staticByKey) {
    if (en.has(key)) continue;
    const [file, line] = sites[0].split(":");
    missing.push({ key, file, line: Number(line) });
  }

  const onlyInEn = [...en.keys()].filter((k) => !bn.has(k)).sort();
  const onlyInBn = [...bn.keys()].filter((k) => !en.has(k)).sort();

  return {
    locales: {
      en: { file: LOCALE_FILES[0], keys: en.size },
      bn: { file: LOCALE_FILES[1], keys: bn.size },
    },
    scan: {
      files: files.length,
      staticCalls: [...staticByKey.values()].reduce((n, s) => n + s.length, 0),
      dynamicCalls: dynamicAll.length,
      unresolvedDynamic: dynamicAll.filter((d) => d.unresolved).length,
    },
    orphans,
    shielded,
    missing,
    parity: { onlyInEn, onlyInBn },
    dynamic: dynamicAll,
  };
}

// ─── output ──────────────────────────────────────────────────────────────────

function report(r) {
  const json = process.argv.includes("--json");
  if (json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }
  const cap = (list, n, fmt) => {
    for (const item of list.slice(0, n)) console.log("  " + fmt(item));
    if (list.length > n) console.log(`  ... +${list.length - n} more (use --json for the full list)`);
  };
  console.log(
    `locales read : en ${r.locales.en.keys} keys, bn ${r.locales.bn.keys} keys`,
  );
  console.log(
    `scanned      : ${r.scan.files} runtime files — ${r.scan.staticCalls} static calls, ` +
      `${r.scan.dynamicCalls} dynamic calls (${r.scan.unresolvedDynamic} unresolved)`,
  );
  console.log(`\nORPHANED (in locale, no reference of any kind): ${r.orphans.length} keys`);
  cap(r.orphans, 80, (o) => `${o.key}   [${o.locales.join(", ")}]`);
  console.log(`\nSHIELDED (reachable only through dynamic evidence): ${r.shielded.length} keys`);
  cap(r.shielded, 40, (s) => `${s.key}   [${s.reasons.join("+")}]   ${s.via.join(" ")}`);
  console.log(`\nMISSING (called, not in en): ${r.missing.length}`);
  cap(r.missing, 40, (m) => `${m.key}   (${m.file}:${m.line})`);
  console.log(
    `\nPARITY (en/bn divergence): ${r.parity.onlyInEn.length + r.parity.onlyInBn.length}`,
  );
  cap(r.parity.onlyInEn, 20, (k) => `only in en: ${k}`);
  cap(r.parity.onlyInBn, 20, (k) => `only in bn: ${k}`);
  console.log(
    "\nNOTE: everything in SHIELDED is reachable through at least one dynamic call —",
  );
  console.log(
    "      the uncertainty budget on ORPHANED. Audit, not a gate: see report() in this file.",
  );
}

report(analyze());
