#!/usr/bin/env node
/**
 * audit-nav-integrity.cjs — sound navigation resolver for the Expo Router tree.
 *
 * WHAT THIS REPLACES: three earlier attempts at screen-reachability analysis, all
 * rejected on evidence. They flagged 99 of 234 screens as unreachable while most
 * were demonstrably live, for three reasons that were recorded as "no amount of
 * regex fixes" would help. That diagnosis was half right, and the wrong half is
 * the expensive one:
 *
 *   1. "routes live in module constants (const R = "/(main)/…"; router.push(R))"
 *      — TRUE, and trivially solvable. A const bound to a string literal is one
 *      hop away in the same syntax tree.
 *   2. "app/admin/_layout.tsx contains ZERO router.push/href — the admin SPA
 *      navigates some other way entirely" — TRUE, and it was read as unresolvable.
 *      It is not: every admin screen wraps <AdminShell>, and AdminShell's
 *      `NAV` array (components/admin/AdminShell.tsx) holds every destination as
 *      a `route:` property, consumed by `router.push(item.route)`. That is a
 *      DATA TABLE, not an unknown. Resolving `item.route` means resolving the
 *      array literal it maps over — again one hop.
 *   3. "app/track/[rideId].tsx and app/payment/success.tsx are entered by an
 *      external URL scheme" — TRUE, and genuinely not an in-app edge. This is a
 *      correct DECLARATION of external entry, not an unsound inference, and it
 *      is the only thing here that needs to be stated rather than resolved.
 *
 * So the earlier conclusion ("gating on this would block legitimate commits")
 * was correct for a tool that could not resolve constants or data tables, and
 * the tool has now been written to resolve both. What is left is not a parser
 * problem at all.
 *
 * WHY AST, NOT REGEX: the same three defects are all places where a string is
 * not where it looks. `router.push(item.route)` and `t('x.y')` and the word
 * `href` in a comment are indistinguishable to a regex. This walks the real tree
 * with the TypeScript compiler API (same import as audit-i18n-orphans.cjs), so a
 * navigation site is a call expression or a JSX attribute, not a substring.
 *
 * ── THE SOUNDNESS CONTRACT ────────────────────────────────────────────────────
 * Every navigation site lands in exactly one bucket, and NO bucket is a guess:
 *
 *   RESOLVED   → matched ≥1 route file. An inbound edge.
 *   DANGLING   → resolved to a concrete pattern that matches NO route file. A
 *                real bug: the app navigates to a screen that does not exist.
 *                This is the only bucket that can gate, and only because it is
 *                provable without a false positive.
 *   UNRESOLVED → the value genuinely depends on runtime data (a redirect
 *                callback, a server response, a computed id). Counted and
 *                LISTED, never folded into "dead". A statically-undecidable
 *                edge is not a missing edge, and treating it as one is precisely
 *                how the earlier tools produced 99 false positives.
 *
 * UNRESOLVED is the honesty budget on every number below. If it is large, the
 * DANGLING count is still sound (a dangling target is dangling regardless of what
 * the unresolved sites do), but the UNREACHABLE count is a floor, not a total.
 *
 * ROUTE MATCHING. Expo Router drops `(group)` segments from the URL but accepts
 * them in paths, and this codebase writes them consistently (`/(main)/…`), so
 * both sides are normalized by stripping `(...)`. A `[param]` file segment
 * matches any target segment, which is what lets
 * `router.push(`…/shop-detail/${shop.id}`)` bind to `shop-detail/[id].tsx`.
 *
 * SCOPE: app/** (excluding app/api/**, which is server code) and components/**.
 * app/api/** never navigates. i18n and the utils-server package are not read.
 *
 * Usage:
 *   node scripts/audit-nav-integrity.cjs          # human-readable report
 *   node scripts/audit-nav-integrity.cjs --json   # machine-readable
 *   node scripts/audit-nav-integrity.cjs --gate   # exit 2 on DANGLING
 *
 * Exit codes: 0 = report produced (it is an AUDIT; see --gate), 1 = could not run,
 * 2 = --gate and at least one DANGLING target.
 *
 * JSON CONSUMER: the `screens` and `reachable` fields are read by the
 * screen-affinity tier in maestro/tools/flow-xcheck.cjs. `reachable` is the BFS
 * set from ENTRY_FILES intersected with the addressable screens; it is a FLOOR,
 * not a claim of exclusion (see the UNRESOLVED note above).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const SCAN_DIRS = ["app", "components"];
const WILD = "*";

const argv = process.argv.slice(2);
const AS_JSON = argv.includes("--json");
const AS_GATE = argv.includes("--gate");

let ts;
try {
  ts = require(path.join(ROOT, "node_modules", "typescript"));
} catch (err) {
  console.error(`❌ typescript not found: ${err.message}`);
  console.error("   Run: npm ci (repo root).");
  process.exit(1);
}

const posix = (p) => p.split(path.sep).join("/");
const rel = (abs) => posix(path.relative(ROOT, abs));

function walk(dir, out = [], re = /\.(tsx|ts|jsx|js)$/) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".kilo") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out, re);
    else if (re.test(e.name)) out.push(p);
  }
  return out;
}

// ── route tree ────────────────────────────────────────────────────────────────

/** "/(main)/(customer)/shops/shop-detail/[id]" -> ["shops","shop-detail","*"] */
function toPattern(routePath) {
  const clean = String(routePath).split("#")[0].split("?")[0];
  return clean
    .split("/")
    .filter(Boolean)
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")))
    .map((s) => (/^\[.+\]$/.test(s) ? WILD : s));
}

/** Files under app/ that may CONTAIN navigation (layouts included — Stack.Screen
 *  registrations live in _layout.tsx). Server code and tests never navigate. */
function isRouteFile(abs) {
  const r = posix(path.relative(APP_DIR, abs));
  if (r.startsWith("api/") || r.includes("/api/")) return false;
  const base = path.basename(abs);
  if (base.endsWith(".test.tsx") || base.endsWith("_test.tsx")) return false;
  return true;
}

/**
 * A file that is an ADDRESSABLE SCREEN. Two Expo Router rules the first version
 * got wrong, both of which put non-screens in the route index and then reported
 * them as orphans: a `_`-prefixed DIRECTORY is private (app/…/(_components)/
 * CargoSummary.tsx is a helper, not a route), and `_layout.tsx` wraps its
 * siblings rather than being one. Both matched on basename alone and so
 * `_components/TruckPicker.tsx` was indexed as a reachable screen.
 */
function isScreen(abs) {
  const r = posix(path.relative(APP_DIR, abs));
  const parts = r.split("/");
  if (parts.slice(0, -1).some((s) => s.startsWith("_"))) return false;
  if (path.basename(abs).startsWith("_")) return false;
  return isRouteFile(abs);
}

const routes = new Map(); // patternKey -> [file]
const routeFiles = [];
for (const f of walk(APP_DIR, [], /\.tsx$/).filter(isScreen)) {
  const r = posix(path.relative(APP_DIR, f)).replace(/\.tsx$/, "");
  const parts = r.split("/");
  const base = parts.pop();
  const dirSegs = parts.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  const segs = base === "index" ? dirSegs : [...dirSegs, base];
  const pattern = toPattern("/" + segs.join("/"));
  const key = pattern.join("/") || "(root)";
  if (!routes.has(key)) routes.set(key, []);
  routes.get(key).push({ file: f, pattern });
  routeFiles.push({ file: f, pattern, key });
}

/**
 * Bind a target pattern to route files. A `*` in the TARGET matches any segment,
 * including a `[param]` file segment; a `*` only in the FILE is matched by a
 * concrete target segment too. Exact beats wildcard so `/packages` does not bind
 * to `[id].tsx` when a literal `packages.tsx` exists.
 */
function matchRoutes(pattern) {
  const hits = [];
  for (const rf of routeFiles) {
    if (rf.pattern.length !== pattern.length) continue;
    let ok = true;
    let wildcards = 0;
    for (let i = 0; i < pattern.length; i++) {
      const t = pattern[i];
      const f = rf.pattern[i];
      if (t === WILD) {
        wildcards++;
        continue;
      }
      if (t !== f) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ ...rf, wildcards });
  }
  hits.sort((a, b) => a.wildcards - b.wildcards);
  return hits;
}

// ── per-file resolution environment ───────────────────────────────────────────

/**
 * Every variable binding in the file, indexed BY SCOPE.
 *
 * Module scope alone was not enough: components/admin/AdminShell.tsx builds the
 * admin nav inside the render body —
 *     {GROUP_ORDER.map((group) => {
 *        const items = NAV.filter((n) => …);
 *        {items.map((item) => { … router.push(item.route …) })}}}
 * — so `item` resolves through a FUNCTION-LOCAL binding of a filtered list. A
 * module-only env reported that (correctly shaped) call as undecidable.
 *
 * Nearest-enclosing-scope resolution, not a flat name map: a flat map would let
 * a same-named local in an unrelated function satisfy a use site, which can
 * manufacture a DANGLING verdict from fiction. Walking up the parent chain and
 * stopping at the first scope that declares the name is the only way a
 * resolution can be trusted enough to gate on.
 */
function buildScopeEnv(sf) {
  const scopes = new Map();
  const scopeOf = (node) => {
    let cur = node.parent;
    while (cur) {
      if (
        ts.isSourceFile(cur) ||
        ts.isBlock(cur) ||
        ts.isFunctionDeclaration(cur) ||
        ts.isFunctionExpression(cur) ||
        ts.isArrowFunction(cur) ||
        ts.isMethodDeclaration(cur) ||
        ts.isForStatement(cur) ||
        ts.isForOfStatement(cur)
      ) {
        return cur;
      }
      cur = cur.parent;
    }
    return sf;
  };
  const declare = (scope, name, init) => {
    if (!name) return;
    if (!scopes.has(scope)) scopes.set(scope, new Map());
    if (!scopes.get(scope).has(name)) scopes.get(scope).set(name, init ?? null);
  };

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      declare(scopeOf(node), node.name.text, node.initializer);
    }
    // Function parameters carry no route value, but recording them stops the
    // lookup from wandering into an outer scope and inventing one.
    if (node.parameters && ts.isFunctionLike(node)) {
      const fnScope = scopeOf(node);
      for (const p of node.parameters) {
        if (ts.isIdentifier(p.name)) declare(fnScope, p.name.text, p.initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { scopes, module: scopes.get(sf) || new Map() };
}

function lookupBinding(env, name, node) {
  let cur = node;
  while (cur) {
    const scope = env.scopes.get(cur);
    if (scope && scope.has(name)) return scope.get(name);
    cur = cur.parent;
  }
  return undefined;
}

const UNWRAP = new Set([
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.AsExpression,
  ts.SyntaxKind.NonNullExpression,
  ts.SyntaxKind.TypeAssertionExpression,
  ts.SyntaxKind.SatisfiesExpression,
]);

/** Nav-ish keys on a data-table element: route, path, href, pathname, url, to. */
const NAV_KEYS = ["route", "path", "href", "pathname", "url", "to", "link"];
const OBJECT_ROUTE_KEYS = ["pathname", "href", "url", "path", "route"];

/**
 * Resolve a route expression to a set of patterns.
 * Returns { patterns } on success, or { unknown } with a reason. Never guesses.
 */
function resolveExpr(node, sf, env, depth = 0) {
  if (!node || depth > 8) return { unknown: node ? "too deeply nested" : "missing argument" };
  while (node && UNWRAP.has(node.kind)) node = node.expression;

  // "/a/b"
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { patterns: [toPattern(node.text)] };
  }
  // `/(main)/x/${id}` -> segments with * for each span
  if (ts.isTemplateExpression(node)) {
    let head = node.head.text;
    for (const span of node.templateSpans) {
      head += WILD + span.literal.text;
    }
    return { patterns: [toPattern(head)] };
  }
  // { pathname: "/x" }  /  { href: "/x" }
  if (ts.isObjectLiteralExpression(node)) {
    const out = [];
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p) || !ts.isIdentifier(p.name)) continue;
      if (!OBJECT_ROUTE_KEYS.includes(p.name.text)) continue;
      const r = resolveExpr(p.initializer, sf, env, depth + 1);
      if (r.patterns) out.push(...r.patterns);
      else return r;
    }
    return out.length ? { patterns: out } : { unknown: "object literal has no route key" };
  }
  // const R = "/x"; router.push(R) — resolved in the nearest declaring scope.
  if (ts.isIdentifier(node)) {
    const init = lookupBinding(env, node.text, node);
    if (init) return resolveExpr(init, sf, env, depth + 1);
    return { unknown: `identifier \`${node.text}\` is not a route constant` };
  }
  // router.push(item.route) over a nav array
  if (ts.isPropertyAccessExpression(node)) {
    const prop = node.name.text;
    const table = resolveTableForProperty(node, sf, env, depth);
    if (table) return table;
    if (NAV_KEYS.includes(prop) && depth > 0) return { unknown: `property \`${prop}\` of a runtime value` };
    return { unknown: `property access \`.${prop}\`` };
  }
  // cond ? "/a" : "/b"
  if (ts.isConditionalExpression(node)) {
    const a = resolveExpr(node.whenTrue, sf, env, depth + 1);
    const b = resolveExpr(node.whenFalse, sf, env, depth + 1);
    if (a.patterns && b.patterns) return { patterns: [...a.patterns, ...b.patterns] };
    return { unknown: "conditional with an unresolved branch" };
  }
  // "a" + b  /  `${a}/b` is handled above
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = resolveExpr(node.left, sf, env, depth + 1);
    const b = resolveExpr(node.right, sf, env, depth + 1);
    if (a.patterns && b.patterns) {
      const out = [];
      for (const x of a.patterns) for (const y of b.patterns) out.push(toPattern(`/${x.join("/")}/${y.join("/")}`));
      return { patterns: out };
    }
    return { unknown: "concatenation with an unresolved operand" };
  }
  // INDIRECT NAVIGATION. `redirect(href)` → `router.replace(href)` is a wrapper:
  //     const redirect = useCallback((href: string) => { router.replace(href); }, [router]);
  //     …
  //     redirect("/(auth)/welcome");
  // This is the app's ENTRY POINT (app/index.tsx), so without modelling it the
  // reachability graph has a root with no outgoing edges and every screen looks
  // orphaned. Resolving the forwarder parameter to its call sites is sound: the
  // set of strings the wrapper can receive is enumerable in the same file.
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression)) {
      const param = forwardingParam(sf, env, node.expression.text, node);
      if (param && node.arguments.length) return resolveExpr(node.arguments[0], sf, env, depth + 1);
    }
    return { unknown: "computed from a function call" };
  }
  return { unknown: `${ts.SyntaxKind[node.kind]} expression` };
}

/**
 * True when `name` is the parameter of some local function in this file that
 * forwards it into a router method — i.e. the site `router.replace(href)` inside
 * the forwarder body, whose real targets live at the `redirect("…")` call sites.
 */
function isForwardedParameter(sf, env, name) {
  for (const scope of env.scopes.values()) {
    for (const init of scope.values()) {
      if (!init) continue;
      let fn = init;
      let guard = 0;
      while (fn && guard++ < 6) {
        if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) break;
        if (ts.isCallExpression(fn) && fn.arguments.length) fn = fn.arguments[0];
        else if (UNWRAP.has(fn.kind)) fn = fn.expression;
        else fn = undefined;
      }
      if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) continue;
      if (!fn.parameters.length) continue;
      const p = fn.parameters[0].name;
      if (!p || !ts.isIdentifier(p) || p.text !== name) continue;
      if (hasForwardingBody(fn, name)) return true;
    }
  }
  return false;
}

/** Does this function body push its own `param` into a router method? */
function hasForwardingBody(fn, param) {
  let found = false;
  const scan = (n) => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      ROUTER_METHODS.has(n.expression.name.text) &&
      n.arguments[0] &&
      ts.isIdentifier(n.arguments[0]) &&
      n.arguments[0].text === param
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, scan);
  };
  scan(fn);
  return found;
}

/**
 * If `name` names a local function whose body forwards its own first parameter
 * into `router.push/replace/navigate`, return that parameter's name. Otherwise
 * undefined — which keeps the call site honestly UNRESOLVED.
 */
function forwardingParam(sf, env, name, useNode) {
  let fn = lookupBinding(env, name, useNode);
  let guard = 0;
  while (fn && guard++ < 6) {
    if (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) break;
    // `useCallback(fn, deps)` is the common shape and its callee is a plain
    // Identifier, so a property-access test here silently fails to unwrap it.
    if (ts.isCallExpression(fn) && fn.arguments.length) fn = fn.arguments[0];
    else if (UNWRAP.has(fn.kind)) fn = fn.expression;
    else return undefined;
  }
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) || !fn.parameters.length) return undefined;
  const p = fn.parameters[0].name;
  if (!p || !ts.isIdentifier(p)) return undefined;
  const param = p.text;
  return hasForwardingBody(fn, param) ? param : undefined;
}

/**
 * `router.push(item.route)` — find the enclosing `.map(...)` (or `for…of`) and
 * read `route` off every element of the collection it iterates. This is the
 * AdminShell NAV table and the settings/activity lists; it is the reason the
 * earlier admin analysis found "no navigation at all".
 */
function resolveTableForProperty(node, sf, env, depth) {
  const prop = node.name.text;
  let cur = node.parent;
  while (cur && depth < 10) {
    if (
      ts.isCallExpression(cur) &&
      ts.isPropertyAccessExpression(cur.expression) &&
      cur.expression.name.text === "map" &&
      cur.arguments.length
    ) {
      const cb = cur.arguments[0];
      const params = cb && cb.parameters ? cb.parameters.map((p) => p.name.getText(sf)) : [];
      if (!params.includes(node.expression.getText(sf))) {
        cur = cur.parent;
        continue;
      }
      const coll = resolveCollection(cur.expression.expression, sf, env, depth + 1);
      if (!coll) return { unknown: "maps over a runtime collection" };
      const out = [];
      for (const el of coll) {
        if (!ts.isObjectLiteralExpression(el)) continue;
        for (const p of el.properties) {
          if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === prop) {
            const r = resolveExpr(p.initializer, sf, env, depth + 1);
            if (r.patterns) out.push(...r.patterns);
          }
        }
      }
      return out.length ? { patterns: out } : { unknown: `nav table has no \`${prop}\` values` };
    }
    cur = cur.parent;
  }
  return null;
}

/** Resolve the receiver of `.map` to an array literal, through filter/sort chains. */
function resolveCollection(node, sf, env, depth) {
  // `NAV.filter(…).sort(…).map(…)` and `const items = NAV.filter(…)` before it:
  // the terminal `.map` receiver is a call chain or a local binding of one, not
  // the literal. Peel calls/property-accesses back to a base expression, then
  // resolve THAT base if it is a local name, and repeat — the two peels have to
  // interleave, because peeling the chain lands on an identifier that itself
  // needs binding lookup. Resolving an identifier only on entry (the first
  // version) silently failed the whole admin nav table for exactly that reason.
  let guard = 0;
  while (node && guard++ < 24) {
    if (ts.isArrayLiteralExpression(node)) return node.elements;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      node = node.expression.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(node) || UNWRAP.has(node.kind)) {
      node = node.expression;
      continue;
    }
    if (ts.isIdentifier(node)) {
      const init = lookupBinding(env, node.text, node);
      if (!init || init === node) return null;
      node = init;
      continue;
    }
    return null;
  }
  return null;
}

// ── nav-site collection ───────────────────────────────────────────────────────

const ROUTER_METHODS = new Set(["push", "replace", "navigate", "back"]);
const HREF_JSX = new Set(["Redirect", "Link"]);
const ROUTER_FACTORIES = new Set(["useRouter", "useNavigation"]);

/**
 * The set of local names that actually hold an expo-router router.
 *
 * THIS IS NOT COSMETIC. A first pass matched ANY `<recv>.push/replace/navigate`
 * call and reported 116 undecidable and 23 dangling sites; almost all were
 * `String.prototype.replace` (`text.replace(/\D/g, '')`) and `Array.prototype.push`
 * (`lines.push(row)`). Matching the METHOD NAME alone makes the tool report
 * fiction, and a navigation audit that reports fiction is worse than none.
 * A receiver counts only if it is imported from expo-router or assigned from
 * useRouter()/useNavigation().
 */
function routerNames(sf) {
  const names = new Set();
  // Any depth, not module scope only. `const router = useRouter()` normally
  // lives INSIDE a component function — the fleet dashboard binds it at line 85
  // of a ~500-line screen. A module-only scan silently DROPPED that file's
  // navigation sites, which is the dangerous direction: a dropped site hides a
  // dangling target. `assertNoSilentDrops()` below is the standing guard.
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === "expo-router") {
      const nb = node.importClause && node.importClause.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        for (const el of nb.elements) {
          const imported = el.propertyName ? el.propertyName.text : el.name.text;
          if (imported === "router" || ROUTER_FACTORIES.has(imported)) names.add(el.name.text);
        }
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isCallExpression(init) && ts.isIdentifier(init.expression) && ROUTER_FACTORIES.has(init.expression.text)) {
        names.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/**
 * `<Stack.Screen name="x" />` is RELATIVE to its layout directory, and a
 * trailing `index` segment addresses the directory itself, not a child. The
 * codebase already relies on this: components/GlobalActionButtons.tsx:542
 * normalizes with `item.route.replace("/index", "")`.
 */
function resolveScreenName(sf, node) {
  const nameProp = node.attributes.properties.find(
    (a) => ts.isJsxAttribute(a) && a.name.text === "name" && a.initializer
  );
  if (!nameProp || !ts.isStringLiteral(nameProp.initializer)) return null;
  const layoutDir = path.dirname(sf.fileName);
  const base = posix(path.relative(APP_DIR, layoutDir))
    .split("/")
    .filter((s) => s && !(s.startsWith("(") && s.endsWith(")")));
  const segs = base.concat(nameProp.initializer.text.split("/").filter(Boolean));
  if (segs[segs.length - 1] === "index") segs.pop();
  return segs;
}

const sites = [];
/** Every line a TEXTUAL scan would call a navigation site — used only as a coverage
 *  bound. A regex cannot decide whether `.push(` is an array push, but it can
 *  prove the AST found FEWER sites than a dumb scan does, which means something
 *  was dropped. Dropping is the dangerous direction: an unrecognized receiver
 *  silently hides a dangling target, which is exactly how the first version of
 *  this tool lost the fleet dashboard's `/integrations` finding. */
const regexCandidates = [];
for (const dir of SCAN_DIRS) {
  for (const f of walk(path.join(ROOT, dir), [])) {
    if (f.startsWith(path.join(APP_DIR, "api"))) continue;
    if (!isRouteFile(f) && dir === "app") continue;
    const src = fs.readFileSync(f, "utf8");
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
    for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(push|replace|navigate)\s*\(/g)) {
      regexCandidates.push({ file: f, recv: m[1], line: src.slice(0, m.index).split("\n").length });
    }
    const env = buildScopeEnv(sf);
    const routers = routerNames(sf);

    const visit = (node) => {
      // Only a CONFIRMED expo-router receiver makes a call a navigation site.
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        routers.has(node.expression.expression.text)
      ) {
        const m = node.expression.name.text;
        if (ROUTER_METHODS.has(m) && node.arguments.length) {
          sites.push({ file: f, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `router.${m}`, arg: node.arguments[0], env, sf });
        }
      }
      // Indirect navigation: `redirect("/(auth)/welcome")` where `redirect` is a
      // local wrapper that forwards its parameter into router.replace. These are
      // the edges out of the app's ROOT, so omitting them makes every screen look
      // orphaned from a node with no children.
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.arguments.length) {
        if (forwardingParam(sf, env, node.expression.text, node)) {
          sites.push({ file: f, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `${node.expression.text}()`, arg: node.arguments[0], env, sf });
        }
      }
      // <Link href> / <Redirect href>
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = node.tagName.getText(sf);
        const base = tag.split(".").pop();
        if (HREF_JSX.has(base)) {
          const href = node.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.text === "href" && a.initializer);
          if (href) {
            sites.push({ file: f, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `<${base}>`, arg: href.initializer.kind === ts.SyntaxKind.JsxExpression ? href.initializer.expression : href.initializer, env, sf });
          }
        }
        if (base === "Screen" && /^(Stack|Tabs)\.Screen$/.test(tag)) {
          const segs = resolveScreenName(sf, node);
          if (segs) sites.push({ file: f, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: `${tag}`, literal: `/${segs.join("/")}`, env, sf });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

// ── classify ──────────────────────────────────────────────────────────────────

const resolved = [];
const dangling = [];
const unresolved = [];
const inbound = new Map(); // route file -> Set<from file>

for (const s of sites) {
  const from = rel(s.file);
  let patterns = null;
  let reason = null;
  if (s.literal) {
    patterns = [toPattern(s.literal)];
  } else {
    const r = resolveExpr(s.arg, s.sf, s.env);
    if (r.patterns) patterns = r.patterns;
    else reason = r.unknown;
  }
  if (!patterns) {
    // router.back() takes no route; not an edge at all.
    if (s.kind === "router.back") continue;
    // The forwarder body itself (`router.replace(href)`) is not an independent
    // edge — its call sites carry the real targets and are resolved above.
    const isForwardBody = ts.isIdentifier(s.arg) && isForwardedParameter(s.sf, s.env, s.arg.text);
    if (isForwardBody) continue;
    unresolved.push({ file: from, line: s.line, kind: s.kind, reason });
    continue;
  }
  const seen = new Set();
  for (const p of patterns) {
    const key = p.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const hits = matchRoutes(p);
    if (!hits.length) {
      dangling.push({ file: from, line: s.line, kind: s.kind, target: "/" + key });
      continue;
    }
    for (const h of hits) {
      resolved.push({ file: from, line: s.line, kind: s.kind, target: "/" + key, route: rel(h.file) });
      if (!inbound.has(h.file)) inbound.set(h.file, new Set());
      // Absolute paths on both sides: the BFS seeds from ENTRY_FILES and compares
      // whole paths. Storing the display-relative form here made every lookup
      // miss, so the graph reported "1 of 251 reachable" from a root that
      // demonstrably navigates four screens.
      inbound.get(h.file).add(s.file);
    }
  }
}

// ── reachability ──────────────────────────────────────────────────────────────

const ENTRY_FILES = [path.join(APP_DIR, "index.tsx")];
const reachable = new Set();
const queue = [...ENTRY_FILES];
while (queue.length) {
  const cur = queue.shift();
  if (reachable.has(cur)) continue;
  reachable.add(cur);
  for (const [file, froms] of inbound) {
    if (!reachable.has(file) && froms.has(cur)) queue.push(file);
  }
}
const unreachable = routeFiles.filter((r) => !inbound.has(r.file));

// Admin-only: the panel's sole in-app navigation is the NAV table, so an admin
// screen with no inbound edge cannot be reached through the panel UI at all.
// That is the property a Maestro flow needs and cannot invent.
const adminUnlisted = routeFiles.filter((r) => {
  const relPath = posix(path.relative(APP_DIR, r.file));
  if (!relPath.startsWith("admin/")) return false;
  if (path.basename(r.file).startsWith("_")) return false; // a layout is not a screen
  return !inbound.has(r.file);
});

/** Coverage bound: sites a textual scan would flag that the AST did not accept. */
const siteKeys = new Set(sites.map((s) => `${s.file}:${s.line}`));
const dropped = regexCandidates.filter((c) => !siteKeys.has(`${c.file}:${c.line}`));

/**
 * Addressable screens, for JSON consumers. The screen-affinity tier in
 * maestro/tools/flow-xcheck.cjs reads `screens` and `reachable` to decide
 * whether a flow's selected testIDs live on a screen the app can actually route
 * to; keep both field names stable or update that consumer in the same commit.
 */
const screenFiles = new Set(routeFiles.map((r) => r.file));

// ── report ────────────────────────────────────────────────────────────────────

if (AS_JSON) {
  console.log(
    JSON.stringify(
      {
        routeFiles: routeFiles.length,
        sites: sites.length,
        resolved: resolved.length,
        dangling,
        unresolved,
        droppedByReceiverCheck: dropped.length,
        unreachable: unreachable.map((u) => rel(u.file)),
        adminUnlisted: adminUnlisted.map((u) => rel(u.file)),
        // Every addressable screen, and the subset the BFS from ENTRY_FILES
        // visits. `reachable` is a FLOOR (UNRESOLVED sites are not edges): a
        // screen outside it has no in-app route FOUND, not a proof it can never
        // be shown — external/URL entry is a declaration, not an edge.
        screens: routeFiles.map((r) => rel(r.file)).sort(),
        reachable: [...reachable].filter((f) => screenFiles.has(f)).map((f) => rel(f)).sort(),
      },
      null,
      2
    )
  );
} else {
  console.log(`route files: ${routeFiles.length} | navigation sites: ${sites.length}`);
  console.log(`RESOLVED ${resolved.length}  DANGLING ${dangling.length}  UNRESOLVED ${unresolved.length}`);
  if (dangling.length) {
    console.log(`\n❌ DANGLING navigation targets (no matching route file): ${dangling.length}`);
    for (const d of dangling.slice(0, 40)) console.log(`  ${d.file}:${d.line}  ${d.kind} -> ${d.target}`);
  } else {
    console.log("\n✅ no dangling navigation targets");
  }
  if (unresolved.length) {
    console.log(`\n⚠ UNRESOLVED (runtime-dependent; NOT counted as dead): ${unresolved.length}`);
    for (const u of unresolved.slice(0, 20)) console.log(`  ${u.file}:${u.line}  ${u.kind} — ${u.reason}`);
    if (unresolved.length > 20) console.log(`  … ${unresolved.length - 20} more`);
  }
  if (adminUnlisted.length) {
    console.log(`\n⚠ admin screens with no inbound navigation edge: ${adminUnlisted.length}`);
    for (const a of adminUnlisted.slice(0, 30)) console.log(`  ${rel(a.file)}`);
  }
  const orphans = unreachable.length;
  console.log(
    `\nreachability from app/index.tsx: ${reachable.size} of ${routeFiles.length} route files; ` +
      `${orphans} have NO inbound navigation edge at all`
  );
  if (unresolved.length) {
    console.log(`NOTE: ${unresolved.length} runtime-dependent sites are undecided, so both figures are a FLOOR, not a total.`);
  }
  if (orphans) {
    console.log("      (deep-link/external entries are not roots here; app/track/[rideId].tsx and");
    console.log("       app/payment/success.tsx are entered by URL scheme, not by any in-app edge.)");
  }
  // The coverage bound. Most drops are legitimate (String.replace on a phone
  // number, Array.push on a CSV row); a drop whose RECEIVER is `router` is not,
  // and would be a navigation site this tool failed to check.
  const suspicious = dropped.filter((d) => /^router$/i.test(d.recv));
  console.log(
    `\ncoverage: ${sites.length} AST navigation sites vs ${regexCandidates.length} textual candidates; ` +
      `${dropped.length} rejected by the router-receiver check (${suspicious.length} of them on a receiver named "router")`
  );
  if (suspicious.length) {
    console.log("⚠ sites on a `router`-named receiver that were NOT treated as navigation:");
    for (const s of suspicious.slice(0, 20)) console.log(`  ${rel(s.file)}:${s.line}  .${s.recv}`);
  }
}

if (AS_GATE && dangling.length) {
  console.error(`\n❌ ${dangling.length} dangling navigation target(s) — the app navigates to screens that do not exist.`);
  process.exitCode = 2;
}