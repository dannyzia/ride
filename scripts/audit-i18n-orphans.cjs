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
 *   t(TABLE[k])                  identifiers in the argument resolve through
 *                                file-local const chains (`const key =
 *                                TABLE[x]` resolves), and IMPORTS are followed:
 *                                a table exported by another module (./x,
 *                                `@/x`) resolves to its initializer. Every
 *                                literal in them is treated as reachable.
 *   ARR.map((p) => t(p))         ITERATION-CALLBACK bindings: the callback's
 *   ARR.map((p) => t(p.key))     first parameter is bound to the elements of
 *                                ARR when ARR resolves to an array literal
 *                                (inline, local const chain, or imported). A
 *                                read property collects only that property's
 *                                literals, so this is precise where the file
 *                                fallback below is coarse. `.map`, `.flatMap`,
 *                                `.forEach`, `.filter`, `.some`, `.every`,
 *                                `.find`, `.findIndex` only — `.reduce` and
 *                                `.sort` do NOT pass elements first.
 *   t(item.k) / t(key)           anything still unresolved (render-prop
 *                                destructuring, useState-derived keys, call
 *                                results) keeps the per-file fallback: every
 *                                key-shaped literal in that file (outside call
 *                                arguments) is treated as reachable and lands
 *                                in the SHIELDED bucket, never silently in
 *                                ORPHANS.
 *
 * DELIBERATELY REPORTED, NOT GUESSED: dynamic calls are listed with their
 * evidence — every resolved site records `local` / `import:<spec>` /
 * `callback:<method>` tags naming what reached it, so a resolution can be
 * audited and a degradation shows up as an empty list. A key shielded by
 * evidence the tool could not resolve is output in `shielded` with a reason, so
 * the uncertainty is visible instead of folded into either verdict. ORPHANS is
 * the "no reference of any kind" list.
 *
 * SCOPE: app/ and components/ only, excluding app/api/** (server code whose
 * key-shaped strings are RBAC scopes and catalog codes), __tests__/, *.test.*,
 * and *.d.ts. store/, lib/, utils-server/ hold no t() calls (verified: the
 * only translation caller is the UI tree). i18n/locales/** is read as data.
 *
 * Usage:
 *   node scripts/audit-i18n-orphans.cjs           # human-readable audit
 *   node scripts/audit-i18n-orphans.cjs --json    # machine-readable audit
 *   node scripts/audit-i18n-orphans.cjs --gate    # gate: fail on NEW orphans
 *   node scripts/audit-i18n-orphans.cjs --gate --json
 *
 * Exit codes: 0 = report produced (audit) or gate passed; 1 = could not run
 * (missing typescript / unreadable locale); 2 = --gate only: orphaned keys that
 * are not in scripts/i18n-orphan-baseline.json, or a missing/unreadable baseline.
 *
 * THE GATE AND ITS RATCHET (added 2026-10-04): the keys that were already
 * orphaned when the gate was added are grandfathered in
 * scripts/i18n-orphan-baseline.json (236 at introduction; the same-day purge of
 * the deleted-screen sets took it to 130); --gate blocks only keys orphaned
 * AFTER that point. The baseline is a RATCHET: delete each key's entry once the
 * key is deleted from the locales or referenced again — or purge a whole
 * namespace with scripts/purge-orphan-keys.cjs, which keeps both in sync — and
 * never add an entry to silence --gate unless the orphan state is deliberate.
 * Baselined keys that are no longer orphaned are reported, not blocked, so
 * bookkeeping never becomes the reason the gate cannot pass.
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

// ─── module graph: imported key tables ───────────────────────────────────────
// `t(TABLE[k])` is answered by reading TABLE's initializer. When TABLE is not in
// this file, follow the import: resolve the specifier (relative or `@/` alias),
// parse the target module on demand, and continue from its EXPORTED declaration.
// That keeps the resolution sound — a module can only contribute what it exports
// — and it composes with the file-local const chain (`const key = TABLE[x]`).

const moduleCache = new Map(); // abs path -> { sf, decls, imports, exports }

function parseModule(abs) {
  let mod = moduleCache.get(abs);
  if (mod) return mod;
  const src = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const decls = buildDecls(sf);
  mod = { abs, sf, decls, imports: buildImports(sf), exports: buildExports(sf, decls) };
  moduleCache.set(abs, mod);
  return mod;
}

/** Named/default/namespace import clauses, local name -> { spec, imported }. */
function buildImports(sf) {
  const imports = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const clause = stmt.importClause;
    if (clause.name) imports.set(clause.name.text, { spec, imported: "default" });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { spec, imported: "*" });
    else if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        imports.set(el.name.text, { spec, imported: el.propertyName ? el.propertyName.text : el.name.text });
      }
    }
  }
  return imports;
}

/** `export const X = ...` and local `export { X }`, exported name -> initializers. */
function buildExports(sf, decls) {
  const exports = new Map();
  const add = (name, inits) => {
    if (!inits || inits.length === 0) return;
    if (!exports.has(name)) exports.set(name, []);
    exports.get(name).push(...inits);
  };
  for (const stmt of sf.statements) {
    const exported =
      ts.canHaveModifiers(stmt) &&
      (ts.getModifiers(stmt) || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer) add(d.name.text, [d.initializer]);
      }
    } else if (
      ts.isExportDeclaration(stmt) &&
      !stmt.moduleSpecifier &&
      stmt.exportClause &&
      ts.isNamedExports(stmt.exportClause)
    ) {
      for (const el of stmt.exportClause.elements) {
        add(el.name.text, decls.get(el.propertyName ? el.propertyName.text : el.name.text) || []);
      }
    }
  }
  return exports;
}

/** Repo path for `./x`, `../x` and `@/x` specifiers, with extension probing. */
function specifierToPath(fromAbs, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromAbs), spec);
  else return null; // bare specifier: a package, not a repo module
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")];
  for (const cand of candidates) {
    try {
      if (fs.statSync(cand).isFile()) return cand;
    } catch {
      // probe the next candidate
    }
  }
  return null;
}

const ITERATION_METHODS = new Set([
  "map",
  "flatMap",
  "forEach",
  "filter",
  "some",
  "every",
  "find",
  "findIndex",
]);

/**
 * Initializers a name can mean in `ctx` — the file-local const first, then the
 * exported declaration of an imported module. Each ref carries the context its
 * initializer must be resolved in: an import switches module. `seen` keeps
 * const chains and import cycles from looping, keyed by module + name.
 */
function lookupInitializers(name, ctx, state) {
  const key = `${ctx.abs}:${name}`;
  if (state.seen.has(key)) return EMPTY;
  state.seen.add(key);
  if (ctx.decls.has(name)) {
    state.evidence.add("local");
    return ctx.decls.get(name).map((init) => ({ init, ctx }));
  }
  const imp = ctx.imports.get(name);
  if (imp && imp.imported !== "*") {
    const abs = specifierToPath(ctx.abs, imp.spec);
    if (abs) {
      const target = parseModule(abs);
      const inits = target.exports.get(imp.imported);
      if (inits && inits.length) {
        state.evidence.add(`import:${imp.spec}`);
        const next = { abs, decls: target.decls, imports: target.imports };
        return inits.map((init) => ({ init, ctx: next }));
      }
    }
  }
  return EMPTY;
}

/** Literals + identifiers of an initializer subtree, followed transitively. */
function collectFromNode(node, ctx, out, state) {
  collectLiterals(node, out);
  for (const name of collectIdentifiers(node)) {
    for (const ref of lookupInitializers(name, ctx, state)) collectFromNode(ref.init, ref.ctx, out, state);
  }
}

/** The direct `p` / `p.prop` shape of a translation argument, if it has one. */
function directBinding(arg) {
  if (ts.isIdentifier(arg)) return { name: arg.text, propName: null };
  if (ts.isPropertyAccessExpression(arg) && ts.isIdentifier(arg.expression)) {
    return { name: arg.expression.text, propName: arg.name.text };
  }
  return null;
}

function enclosingFunction(node) {
  let fn = node;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  return fn;
}

/** Element expressions of an array literal reached inline or by name. */
function resolveArrayElements(expr, ctx, state) {
  if (ts.isArrayLiteralExpression(expr)) return expr.elements;
  if (ts.isIdentifier(expr)) {
    const out = [];
    for (const ref of lookupInitializers(expr.text, ctx, state)) {
      if (ts.isArrayLiteralExpression(ref.init)) out.push(...ref.init.elements);
    }
    return out.length ? out : null;
  }
  return null;
}

/** Keys an element contributes for `p` (all literals) or `p.prop` (that property). */
function collectElement(el, propName, ctx, out, state) {
  if (propName === null) {
    collectFromNode(el, ctx, out, state);
    return;
  }
  if (!ts.isObjectLiteralExpression(el)) return;
  for (const prop of el.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === propName) {
      collectFromNode(prop.initializer, ctx, out, state);
    }
  }
}

/**
 * `ARR.map((p) => ... t(p.key))`: bind the callback's first parameter to the
 * elements of ARR when ARR resolves to an array literal. `.reduce`/`.sort` are
 * excluded — their first parameter is not an element.
 */
function collectFromCallback(binding, callNode, ctx, out, state) {
  let fn = enclosingFunction(callNode);
  while (fn) {
    const first = fn.parameters[0];
    if (first && ts.isIdentifier(first.name) && first.name.text === binding.name) {
      const call = fn.parent;
      if (
        call &&
        ts.isCallExpression(call) &&
        call.arguments.includes(fn) &&
        ts.isPropertyAccessExpression(call.expression) &&
        ITERATION_METHODS.has(call.expression.name.text)
      ) {
        const elements = resolveArrayElements(call.expression.expression, ctx, state);
        if (elements) {
          state.evidence.add(`callback:${call.expression.name.text}`);
          for (const el of elements) collectElement(el, binding.propName, ctx, out, state);
        }
      }
      return;
    }
    fn = enclosingFunction(fn.parent);
  }
}

// ─── per-file analysis ───────────────────────────────────────────────────────

function scanFile(file) {
  const mod = parseModule(file);
  const rel = relPath(file);
  const sf = mod.sf;
  const ctx = { abs: file, decls: mod.decls, imports: mod.imports };

  const staticUses = []; // { key, file, line }
  const dynamic = []; // { file, line, kind, keys, prefix, unresolved, evidence }
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
          const state = { seen: new Set(), evidence: new Set() };
          // Literals directly in the argument (t(cond ? "a.b" : "c.d")).
          collectLiterals(arg, keys);
          // The direct `p` / `p.prop` shape: a local/imported table, or the
          // first parameter of the iteration callback the call sits in.
          const binding = directBinding(arg);
          if (binding) {
            for (const ref of lookupInitializers(binding.name, ctx, state)) {
              collectFromNode(ref.init, ref.ctx, keys, state);
            }
            collectFromCallback(binding, node, ctx, keys, state);
          }
          // Any other identifier in the argument (e.g. t(f(x).k)) follows the
          // same local/import chain.
          for (const name of collectIdentifiers(arg)) {
            for (const ref of lookupInitializers(name, ctx, state)) {
              collectFromNode(ref.init, ref.ctx, keys, state);
            }
          }
          const prefix = templatePrefix(arg);
          const keyList = [...keys].filter((k) => KEY_SHAPE.test(k));
          dynamic.push({
            file: rel,
            line,
            kind: ts.SyntaxKind[arg.kind],
            keys: keyList,
            prefix,
            unresolved: keyList.length === 0 && !prefix,
            evidence: [...state.evidence].sort(),
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

// ─── gate ────────────────────────────────────────────────────────────────────
// The ratchet, for CI and `npm run check:i18n-orphans`. The baseline records
// the orphan backlog that predates the gate; a key not in it that becomes
// orphaned is a NEW regression (usually a deleted screen's keys, or a rename
// that left the old key behind) and blocks. Everything else stays a report.

function gate(r) {
  const json = process.argv.includes("--json");
  const baselineRel = path.join("scripts", "i18n-orphan-baseline.json").split(path.sep).join("/");
  const baselinePath = path.join(ROOT, "scripts", "i18n-orphan-baseline.json");
  let baselined;
  try {
    const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    if (!parsed || !Array.isArray(parsed.keys) || !parsed.keys.every((k) => typeof k === "string")) {
      throw new Error("missing a `keys` array of strings");
    }
    baselined = new Set(parsed.keys);
  } catch (err) {
    if (err.code === "ENOENT") {
      // A MISSING baseline must not degrade to "empty baseline": that would
      // report all 236 pre-existing orphans as new and fail every run with a
      // message that looks like a regression. Fail loudly with the real cause.
      console.error(`❌ ${baselineRel} is missing, so the i18n orphan ratchet cannot run.`);
      console.error("   This file grandfathers the pre-existing orphaned keys. Restore it from git");
      console.error(`   (git checkout -- ${baselineRel}) — do NOT commit without it.`);
    } else {
      console.error(`❌ could not read ${baselineRel}: ${err.message}`);
    }
    return 2;
  }

  const current = r.orphans.map((o) => o.key);
  const currentSet = new Set(current);
  const newOrphans = r.orphans.filter((o) => !baselined.has(o.key));
  const stale = [...baselined].filter((k) => !currentSet.has(k)).sort();

  if (json) {
    console.log(
      JSON.stringify(
        {
          ...r,
          gate: {
            baseline: baselineRel,
            baselined: baselined.size,
            orphans: r.orphans.length,
            new: newOrphans,
            stale,
            passed: newOrphans.length === 0,
          },
        },
        null,
        2,
      ),
    );
  } else {
    if (newOrphans.length) {
      console.log(
        `❌ i18n orphan gate: ${newOrphans.length} NEW orphaned key(s) not in ${baselineRel}`,
      );
      console.log("");
      for (const o of newOrphans) console.log(`  ${o.key}   [${o.locales.join(", ")}]`);
      console.log("");
      console.log("  An orphan is a locale key no translation call in app/ or components/ can");
      console.log("  reach. Delete it from i18n/locales/*/common.json, or restore the reference");
      console.log("  if its loss was accidental — a deleted screen's keys are the common cause:");
      console.log("    node scripts/purge-orphan-keys.cjs --new");
      console.log("  removes exactly these keys from both locales and prunes the baseline.");
      console.log(`  Do NOT add them to ${baselineRel} to silence this check —`);
      console.log("  that file is the ratchet for the backlog that predates the gate.");
    } else {
      console.log(
        `✅ i18n orphan gate: clean (${r.orphans.length} baselined key(s) remain, none new)`,
      );
    }
    if (stale.length) {
      console.log(
        `ℹ️  ${stale.length} baselined key(s) are no longer orphaned — delete them from ${baselineRel}:`,
      );
      for (const k of stale.slice(0, 20)) console.log(`  ${k}`);
      if (stale.length > 20) console.log(`  ... +${stale.length - 20} more (use --json for the full list)`);
    }
  }
  return newOrphans.length === 0 ? 0 : 2;
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
    "      the uncertainty budget on ORPHANED. This audit run exits 0 regardless;",
  );
  console.log(
    "      --gate blocks only orphaned keys not in scripts/i18n-orphan-baseline.json.",
  );
}

const result = analyze();
if (process.argv.includes("--gate")) process.exitCode = gate(result);
else report(result);
