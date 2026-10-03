#!/usr/bin/env node
/**
 * Gate 1 codemod v3 (owner rejection relay 2026-09-27: positional IDs REJECTED).
 *
 * Replaces every existing positional testID (`file-seq` form) with a SEMANTIC
 * route-qualified ID: `<route-path>.<element-function>` (e.g.
 * `settings.change-password.update-button`), derived in priority order from:
 *   1. the onPress / onChangeText / onSubmitEditing / onValueChange handler —
 *      a named function reference or an inline arrow whose body calls a named
 *      function or a router.<verb>('/path') (→ `<verb>-<last-segment>`)
 *   2. the bound i18n label key (title={t('x.y')} / label={t('x.y')} /
 *      placeholder={t('x.y')}) → `x-y`
 *   3. a literal title/label/placeholder string → slugified
 *   4. fallback `<route-path>.el<N>` (route-qualified, numbered, stable per
 *      source order of THAT route; no bare index-* anywhere)
 *
 * Route path = the file's route path with group segments `(...)` dropped and
 * dynamic segments kept in [bracket] form, e.g.
 * `app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx` →
 * `customer.settings.lost-items`.
 *
 * Collision rules enforced:
 *  - IDs unique within the file (suffix `-2`, `-3` on genuine duplicates).
 *  - NO two screens in the same mounted route stack share a full ID: the
 *    generator emits `collide-<n>` diagnostics for cross-file duplicate IDs
 *    and exits non-zero if any remain — the operator resolves them by hand.
 *
 * Idempotent: existing semantic IDs are left untouched; only positional
 * (`*-NNN` three-digit suffix) or missing testIDs on interactive elements are
 * (re)assigned. `--dry-run` reports without writing.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// APP_TESTIDS_ROOT lets the idempotence gate (maestro/tools/testid-idempotence.cjs)
// point this codemod at a SANDBOX COPY of app/ instead of the working tree. The
// strip->regen proof has to run --strip, which DELETES every testID attribute, so
// running it against the real tree would destroy the developer's work. The
// override exists for that reason alone; unset, behaviour is unchanged.
const APP = process.env.APP_TESTIDS_ROOT
  ? path.resolve(process.env.APP_TESTIDS_ROOT)
  : path.resolve(__dirname, '..', '..', 'app');
const DRY_RUN = process.argv.includes('--dry-run');
const STRIP_ONLY = process.argv.includes('--strip');

const ELEMENTS = new Set([
  'Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback',
  'Button', 'TextInput', 'Switch', 'Checkbox', 'CustomButton',
]);
const HANDLER_PROPS = ['onPress', 'onChangeText', 'onSubmitEditing', 'onValueChange', 'onToggle', 'onRefresh'];
const LABEL_PROPS = ['title', 'label', 'placeholder', 'text'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

function routePathOf(rel) {
  // app/(main)/(customer)/(tabs)/settings/lost-items/index.tsx → customer.settings.lost-items
  // Mirror routes: BOTH actor prefixes are kept when the file sits under an
  // actor branch ((customer)|(rider)|(fleet)|(ambulance-cert)|(ambulance-driver)),
  // so rider/referral and customer/referral can never collide. The
  // marketplace-vertical groups ((shops)|(delivery)|(rental-marketplace)|
  // (rental-bidder)|(ambulance)) are ALSO kept — they are sibling verticals
  // under the same actor whose screens share names (index, request-detail).
  // Pure structural groups ((main), (tabs), (auth)) are dropped.
  // rel arrives forward-slashed and relative to APP (caller normalizes);
  // splitting on path.sep here would produce ONE segment on Windows.
  const parts = rel.split('/');
  const ACTOR = /^\((customer|rider|fleet|ambulance-cert|ambulance-driver)\)$/;
  const VERTICAL = /^\((shops|delivery|rental-marketplace|rental-bidder|ambulance)\)$/;
  const STRUCTURAL = /^\((main|tabs|auth)\)$/; // dropped — no disambiguating value
  const cleaned = [];
  for (const part of parts) {
    if (/^\(.*\)$/.test(part)) {
      if (STRUCTURAL.test(part)) continue;
      cleaned.push(part.slice(1, -1)); // keep actor + vertical groups
      continue;
    }
    if (part === 'index' || part.startsWith('index.')) continue;
    // Segment names keep only [A-Za-z0-9_-]; '(main)'-style leftovers are
    // impossible here (groups handled above), but brackets on dynamic segments
    // and any stray separators are still sanitized.
    cleaned.push(part.replace(/\.tsx$/, '').replace(/[^A-Za-z0-9_-]/g, ''));
  }
  // Route path joins with '.' as the sole selector-safe separator.
  return cleaned.filter(Boolean).join('.');
}

function slug(s) {
  return String(s)
    .replace(/^t\(|\)$/g, '')
    .replace(/['"`]/g, '')
    // camelCase → kebab BEFORE lowercasing: setPhone → set-phone. This also
    // keeps every testID value OUT of the i18n key-shape grammar
    // (lib/__tests__/i18n-smoke.test.ts KEY_SHAPE disallows hyphens), so
    // testIDs are never mistaken for translation keys.
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Derive an element-function token from the attribute set (best effort). */
function deriveFunction(attrs, sf) {
  // 1) handlers
  for (const h of HANDLER_PROPS) {
    const attr = attrs.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === h,
    );
    if (!attr?.initializer) continue;
    const init = attr.initializer;
    const expr = ts.isJsxExpression(init) ? init.expression : null;
    if (!expr) continue;
    // Named function reference: onPress={handleLogin}
    if (ts.isIdentifier(expr)) return slug(expr.getText(sf));
    // Arrow/parenthesized: body calls a named fn, or router.push('/x')
    let body = expr;
    if (ts.isArrowFunction(expr) || ts.isParenthesizedExpression(expr)) body = expr.body;
    const text = body.getText(sf);
    // M-1 fix (2026-10-03): the capture must NOT exclude ')'. It previously read
    // a character class that stopped at the first route group's closing paren:
    //   router.push("/(main)/(customer)/(tabs)/settings/top-up")
    //     -> capture "(main" -> pop() "(main" -> slug "main" -> "push-main"
    // All 44 `push-main` IDs came from this; the same bug produced
    // "login.push-auth" from router.push("/(auth)/forgot-password").
    // Capture to the closing quote only, then take the last real path segment.
    const routerMatch = text.match(/router\.(push|replace|navigate)\(\s*[`'"]([^`'"]*)/);
    if (routerMatch) {
      const raw = routerMatch[2]
        .split('?')[0] // drop query string (?id=…, ?status=…)
        .replace(/\$\{[^}]*\}/g, ''); // drop interpolations
      const segs = raw
        .split('/')
        .map((s) => s.replace(/[()]/g, '').trim())
        .filter(Boolean);
      const leaf = segs[segs.length - 1] || routerMatch[1];
      return slug(`${routerMatch[1]}-${leaf}`);
    }
    const callMatch = text.match(/(?:^|[^\w.])([a-zA-Z][\w]*)\s*\(/);
    if (callMatch && !['if', 'for', 'while', 'switch', 'catch', 'return'].includes(callMatch[1])) {
      return slug(callMatch[1]);
    }
  }
  // 2) i18n label keys / literal labels
  for (const lp of LABEL_PROPS) {
    const attr = attrs.properties.find(
      (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === lp,
    );
    if (!attr?.initializer) continue;
    const init = attr.initializer;
    if (ts.isStringLiteral(init)) {
      const s = slug(init.text);
      if (s) return s;
      continue;
    }
    if (ts.isJsxExpression(init) && init.expression) {
      const t = init.expression.getText(sf);
      const tCall = t.match(/t\(\s*['"`]([^'"`]+)['"`]/);
      if (tCall) return slug(tCall[1]);
      if (ts.isStringLiteral(init.expression)) {
        const s = slug(init.expression.text);
        if (s) return s;
      }
    }
  }
  return null;
}

function processFile(absPath, rel, globalSeen) {
  const src = fs.readFileSync(absPath, 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true);
  const route = routePathOf(rel);
  const edits = []; // { pos, len, text }
  const localCounts = {};
  const fileIds = [];
  let fallbackN = 0;

  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = node.tagName.getText(sf);
      if (ELEMENTS.has(tagName)) {
        const attrs = node.attributes;
        const existing = attrs.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === 'testID',
        );
        const existingVal =
          existing && existing.initializer && ts.isStringLiteral(existing.initializer)
            ? existing.initializer.text
            : null;

        if (STRIP_ONLY) {
          if (existingVal) {
            // Strip ANY testID value (positional or mangled) — the generator
            // re-derives everything from source. Delete the whole attribute
            // plus one preceding whitespace char.
            const start = existing.getStart(sf);
            edits.push({ pos: start - 1, len: existing.getEnd() - start + 1, text: '' });
          }
          ts.forEachChild(node, visit);
          return;
        }

        // B-1 fix (2026-09-28): preserve an existing testID ONLY when it is
        // already a fully-qualified semantic ID for THIS route (i.e. written by
        // a previous v3 run). Positional legacy values (`*-NNN`) and route-less
        // values are re-derived from the element; the route prefix is added
        // exactly once. The old code stored the old FULL ID into `semantic`
        // and unconditionally prefixed `${route}.` — so every re-run turned
        // `_layout.set-theme` into `_layout._layout.set-theme` (double-prefix
        // corruption of all 1,108 IDs, caught by Prompt B audit).
        const isPositional = existingVal && /^[\w.-]+-\d{3}$/.test(existingVal);
        const preserve =
          existingVal && !isPositional && existingVal.startsWith(`${route}.`);
        const semantic = preserve ? existingVal : deriveFunction(attrs, sf);

        let id;
        if (semantic) {
          id = preserve ? semantic : `${route}.${semantic}`;
          // Grammar guard: any single-word token that slipped through slug()
          // still forms a multi-segment ID here — but a token that is itself
          // key-shaped end-to-end (all-lowercase word segments) would collide
          // with the i18n literal sweep grammar. Force-hyphenate the LAST
          // segment when the whole ID is key-shaped (e.g. load → load-verb
          // is ambiguous; simplest correct fix: append '-el').
          if (/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/.test(id)) id = `${id}-el`;
          const n = (localCounts[id] || 0) + 1;
          localCounts[id] = n;
          if (n > 1) id = `${id}-${n}`;
        } else {
          fallbackN += 1;
          // "el-<N>" (hyphenated): bare el<N> would match the i18n key shape
          // and trip the locale-sweep guard — same grammar reason the function
          // tokens above are kebab-case.
          id = `${route}.el-${fallbackN}`;
          const n = (localCounts[id] || 0) + 1;
          localCounts[id] = n;
          if (n > 1) id = `${id}-${n}`;
        }
        fileIds.push(id);
        globalSeen[id] = globalSeen[id] || [];
        globalSeen[id].push(rel);

        if (existing) {
          if (existingVal !== id) {
            const start = existing.initializer.getStart(sf) + 1; // inside quotes
            const len = existing.initializer.getWidth() - 2;
            edits.push({ pos: start, len, text: id });
          }
        } else {
          const insertPos = node.end - 1;
          const ch = src[insertPos - 1] === '/' ? insertPos - 1 : insertPos;
          edits.push({ pos: ch, len: 0, text: ` testID="${id}"` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (edits.length === 0) return { added: 0, ids: fileIds };

  edits.sort((a, b) => b.pos - a.pos);
  let out = src;
  for (const e of edits) {
    out = out.slice(0, e.pos) + e.text + out.slice(e.pos + e.len);
  }
  if (!DRY_RUN) fs.writeFileSync(absPath, out, 'utf8');
  return { added: edits.length, ids: fileIds };
}

function main() {
  const files = walk(APP).filter((f) => {
    const rel = path.relative(APP, f);
    return !/(\+api|\+html)/.test(rel) && !/(^|[\\/])__tests__([\\/]|$)/.test(rel) && !/\.test\.|\.spec\./.test(rel);
  });
  const globalSeen = {};
  let total = 0;
  let touched = 0;
  for (const f of files.sort()) {
    // FORWARD-SLASH rel for BOTH the route-path derivation and diagnostics —
    // splitting on path.sep AFTER joining with '/' yields a single segment on
    // Windows, which silently flattened route prefixes (authlogin bug).
    const rel = path.relative(APP, f).split(path.sep).join('/');
    const r = processFile(f, rel, globalSeen);
    if (r.added > 0) {
      total += r.added;
      touched += 1;
      if (process.argv.includes('--verbose') && r.added) console.log(`  ${rel}: ${r.added}`);
    }
  }
  const collisions = Object.entries(globalSeen).filter(([, files]) => files.length > 1);
  console.log(`mode=${DRY_RUN ? 'DRY-RUN' : 'WRITE'} filesTouched=${touched} idsAssigned=${total} crossFileCollisions=${collisions.length}`);
  for (const [id, fs2] of collisions.slice(0, 20)) {
    console.log(`  COLLISION ${id} → ${fs2.join(', ')}`);
  }
  if (collisions.length > 0) process.exitCode = 2;
}

main();
