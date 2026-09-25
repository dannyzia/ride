/**
 * i18n smoke test — R2.4
 *
 * Verifies that every rider screen either:
 * 1. Imports and uses useTranslation (wired for i18n), OR
 * 2. Has NO user-facing hardcoded strings (legitimate exception: layout/loading screens)
 *
 * This test reads the raw file content (no imports) so it works without
 * mocking the entire module graph.
 */

import fs from 'fs';
import path from 'path';

const RIDER_DIR = path.resolve(__dirname, '../../app/(main)/(rider)');
const EN_LOCALE = path.resolve(__dirname, '../../i18n/locales/en/common.json');
const BN_LOCALE = path.resolve(__dirname, '../../i18n/locales/bn/common.json');

/**
 * Locale-completeness guard (ISSUE-59): every t('ns.key') referenced anywhere
 * under app/ and components/ must resolve in BOTH locale files. This exists
 * because the ride-booking flow shipped ~20 rider_home.* raw keys — the
 * t() wiring was correct but the keys never existed in either locale file.
 * Flat-key scan (no imports) so it runs without mocking the module graph.
 *
 * Enforcement is TOTAL (2026-09-15, ISSUE-61):
 *  - every t('ns.key') literal under app/ and components/ must resolve in BOTH
 *    locales — no baseline, no exceptions. The shrink-only tier introduced with
 *    the ISSUE-59 guard was deleted when the last namespace was repaid (426 → 0).
 *
 * Lookup-table tier (2026-09-24): scanning only t('ns.key') literals left every
 * key held in a lookup table invisible — that is how six missing `rides_list`
 * keys and two dead label keys survived a guard declared total, because the
 * call site reads `t(FILTER_LABELS[tab])`, not `t('rides_list.filter_all')`.
 * collectLookupTableKeys() closes that hole by also scanning the string values
 * inside `*Key` properties and `*_KEYS` / `*_LABELS` / `*_CONFIG` / `*_META`
 * tables. Same enforcement: no baseline, no exceptions.
 *
 * Residue tier (2026-09-24, same day): an audit of every `t(<non-literal>)`
 * call site in app/ + components/ found two further carriers the lookup-table
 * tier cannot see, both of which held real keys:
 *   - a bare all-key-shaped string array — `DELETED_ITEMS`, rendered as
 *     `DELETED_ITEMS.map((item) => t(item))`. The const name carries no marker,
 *     so the array contents are the signal. It was hiding four missing
 *     `delete_account.item_*` keys on the delete-account screen.
 *   - a module-level `*_KEY` constant — `t(ONE_VEHICLE_NOTICE_KEY)`.
 * collectKeyArrayKeys() / collectKeyConstKeys() close those. Same enforcement:
 * no baseline, no exceptions.
 *
 * Sweep tier (2026-09-24, later): a carrier-independent audit
 * (scripts/audit-i18n-dynamic-keys.js) — every key-shaped string literal must
 * resolve in both locales, regardless of carrier — proved the hand-checked
 * claim above wrong: 20 more missing keys hid in shapes no collector scanned
 * (a nested ternary inside t() on confirm-ride, questionKey/answerKey
 * properties in the FAQ fallback table, a `common.all` fallback literal, and
 * openExternal label keys on contact-support). All repaid same-day. The sweep
 * now also runs here as the tier below: it is strictly stronger than the
 * carrier collectors (any literal that resolves here makes carrier coverage
 * moot) and it is the backstop for carrier shapes nobody has named yet.
 * app/api/ is excluded — server code; its key-shaped literals are RBAC scopes
 * (admin.read, verification.write), never user-facing text.
 *
 * Call-site interpolation tier (2026-09-24, later still): en/bn value parity
 * says nothing about what call sites actually supply. The tier after that
 * extracts the options object of every literal t('ns.key', { … }) call site
 * and requires the supplied params to equal the {{params}} declared in BOTH
 * values — in both directions: a supplied-but-undeclared param is silently
 * dropped by i18next, a declared-but-unsupplied one renders the raw {{token}}
 * to users. 74 sites drifted when this landed: the label rows
 * (From/To/Pickup/Fare) had lost their {{address}}/{{amount}} interpolation,
 * rider_wallet.rides_used_of supplied max while the value said total,
 * rider_activity.min_away declared count where the site supplies minutes.
 * Values repaired; dead options on the home CTA stripped. Multi-line
 * options, trailing commas and shorthand params are handled; spreads and
 * computed keys skip the site (counted in the summary, never silent).
 */
const HARD_NAMESPACE = 'rider_home';

describe('i18n locale completeness — every t() key resolves', () => {
  const en = JSON.parse(fs.readFileSync(EN_LOCALE, 'utf-8'));
  const bn = JSON.parse(fs.readFileSync(BN_LOCALE, 'utf-8'));

  function resolveKey(locale: Record<string, unknown>, key: string): boolean {
    let node: unknown = locale;
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) {
        return false;
      }
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  }

  /** Collect t('ns.key') literal calls from a source string. */
  function collectKeys(content: string): string[] {
    const keys: string[] = [];
    const re = /\bt\(\s*['"]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) keys.push(m[1]);
    return keys;
  }

  /**
   * Strict i18n key shape — `namespace.key`, lowercase, dots only. Anything
   * else is not a key: MIME types carry a `/`, package ids a `-`, hostnames a
   * `-`, human copy a capital or a space. Deliberately shape-based rather than
   * "any dotted string", so prose, domains and icons in a CONFIG table cannot
   * masquerade as keys. Known cost: a key with an uppercase segment would slip
   * through unscanned — the locale files are all-lowercase, and the t() tier
   * above still catches those.
   */
  const KEY_SHAPE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

  /** Property names that hold a translation key by convention. */
  const KEY_PROPERTY =
    /(?:labelKey|titleKey|subtitleKey|textKey|descKey|descriptionKey|messageKey|placeholderKey|nameKey|bodyKey|hintKey)\s*:\s*$/;

  /** Const names that mark a table of key-bearing entries. */
  const KEY_TABLE_NAME = /_(?:KEYS|LABELS|CONFIG|META)$/;

  /** Blank out comment runs so quoted prose never registers as code. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  }

  interface StringLiteral {
    value: string;
    start: number;
    /** Source code between the previous string literal and this one. */
    before: string;
  }

  /**
   * Every string literal in a source string, each with the code that precedes
   * it. Comments and template-literal interpolations are skipped, so prose in a
   * comment and `${...}` expressions never register as values.
   */
  function scanStringLiterals(src: string): StringLiteral[] {
    const out: StringLiteral[] = [];
    let i = 0;
    let codeStart = 0;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? src.length : nl + 1;
        continue;
      }
      if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? src.length : end + 2;
        continue;
      }
      if (ch !== "'" && ch !== '"' && ch !== '`') {
        i++;
        continue;
      }
      const start = i;
      const before = src.slice(codeStart, start);
      i++;
      let value = '';
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          value += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        if (ch === '`' && src[i] === '$' && src[i + 1] === '{') {
          let depth = 1;
          i += 2;
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            i++;
          }
          continue;
        }
        value += src[i];
        i++;
      }
      i++; // consume the closing quote
      if (ch !== '`') out.push({ value, start, before });
      codeStart = i;
    }
    return out;
  }

  /** Index of the bracket closing the one at `open`, or -1 when unbalanced. */
  function matchBracket(src: string, open: number): number {
    const closer = src[open] === '{' ? '}' : src[open] === '[' ? ']' : null;
    if (!closer) return -1;
    let depth = 0;
    let i = open;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? src.length : nl + 1;
        continue;
      }
      if (ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? src.length : end + 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        i++;
        while (i < src.length && src[i] !== ch) {
          if (src[i] === '\\') {
            i += 2;
            continue;
          }
          i++;
        }
        i++;
        continue;
      }
      if (ch === src[open]) depth++;
      else if (ch === closer) {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }

  /** Ranges of object/array literals assigned to key-bearing const names. */
  function keyTableSpans(content: string): [number, number][] {
    const spans: [number, number][] = [];
    const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?=[{[])/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (!KEY_TABLE_NAME.test(m[1])) continue;
      const open = m.index + m[0].length; // lookahead left us on the bracket
      const close = matchBracket(content, open);
      if (close > open) spans.push([open, close]);
    }
    return spans;
  }

  /**
   * Keys held in lookup tables instead of inline t() calls, matched by the two
   * idioms this codebase uses: a `*Key` property value, and an entry inside a
   * `*_KEYS` / `*_LABELS` / `*_CONFIG` / `*_META` table.
   */
  function collectLookupTableKeys(content: string): string[] {
    const spans = keyTableSpans(content);
    const keys: string[] = [];
    for (const literal of scanStringLiterals(content)) {
      if (!KEY_SHAPE.test(literal.value)) continue;
      const before = stripComments(literal.before);
      const isPropertyValue = KEY_PROPERTY.test(before);
      const isTableEntry = spans.some(([s, e]) => literal.start > s && literal.start < e);
      if (isPropertyValue || isTableEntry) keys.push(literal.value);
    }
    return keys;
  }

  /**
   * Keys held in a bare all-key-shaped string array, e.g.
   * `const DELETED_ITEMS = ['delete_account.item_name', …]` rendered as
   * `DELETED_ITEMS.map((item) => t(item))`. The array itself is the signal:
   * it counts only when every entry is a valid key, so arrays of values,
   * ids, icons or prose stay invisible.
   */
  function collectKeyArrayKeys(content: string): string[] {
    const keys: string[] = [];
    const re = /\bconst\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*\[/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      const open = m.index + m[0].length - 1;
      const close = matchBracket(content, open);
      if (close <= open) continue;
      const entries = scanStringLiterals(content.slice(open + 1, close));
      if (entries.length === 0) continue;
      if (entries.every((e) => KEY_SHAPE.test(e.value))) {
        keys.push(...entries.map((e) => e.value));
      }
    }
    return keys;
  }

  /**
   * Keys held in a module-level `*_KEY` constant, e.g.
   * `const ONE_VEHICLE_NOTICE_KEY = 'vehicle_select.one_vehicle_notice'`
   * rendered as `t(ONE_VEHICLE_NOTICE_KEY)`.
   */
  function collectKeyConstKeys(content: string): string[] {
    const keys: string[] = [];
    const re =
      /\bconst\s+[A-Za-z_$][\w$]*KEY\s*(?::[^=]+)?=\s*(['"])([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)\1/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) keys.push(m[2]);
    return keys;
  }

  function* walkTsx(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walkTsx(full);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) yield full;
    }
  }

  const hardMissing: Record<string, string[]> = {};
  const missingByFile: [string, string[]][] = [];
  let softMissingCount = 0;
  for (const dir of [
    path.resolve(__dirname, '../../app'),
    path.resolve(__dirname, '../../components'),
  ]) {
    for (const file of walkTsx(dir)) {
      const content = fs.readFileSync(file, 'utf-8');
      const keys = [
        ...collectKeys(content),
        ...collectLookupTableKeys(content),
        ...collectKeyArrayKeys(content),
        ...collectKeyConstKeys(content),
      ];
      if (keys.length === 0) continue;
      const rel = path.relative(__dirname, file);
      const missing = [
        ...new Set(
          keys.filter((k) => !resolveKey(en, k) || !resolveKey(bn, k)),
        ),
      ];
      if (missing.length === 0) continue;
      const hard = missing.filter((k) => k.startsWith(`${HARD_NAMESPACE}.`));
      if (hard.length > 0) hardMissing[rel] = hard;
      softMissingCount += missing.length;
      missingByFile.push([rel, missing]);
    }
  }

  it(`every ${HARD_NAMESPACE}.* key used in app/ and components/ exists in en + bn locales`, () => {
    const offenders = Object.entries(hardMissing);
    if (offenders.length > 0) {
      const detail = offenders
        .map(([f, keys]) => `  ${f}:\n    ${keys.join('\n    ')}`)
        .join('\n');
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(`\n❌ ${HARD_NAMESPACE}.* keys missing from locale files:\n${detail}`);
    }
    expect(hardMissing).toEqual({});
  });

  it('every missing t() key is a hard failure (no baseline — the guard is total)', () => {
    if (softMissingCount > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(
        `\n❌ ${softMissingCount} referenced key(s) missing from locale files:\n` +
          missingByFile
            .map(([f, keys]) => `  ${f}:\n    ${keys.join('\n    ')}`)
            .join('\n'),
      );
    }
    expect(softMissingCount).toBe(0);
  });

  it('en and bn locale files have identical key sets', () => {
    function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
      return Object.entries(obj).flatMap(([k, v]) =>
        v !== null && typeof v === 'object'
          ? flatten(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
          : [prefix ? `${prefix}.${k}` : k],
      );
    }
    const enKeys = new Set(flatten(en));
    const bnKeys = new Set(flatten(bn));
    const enOnly = [...enKeys].filter((k) => !bnKeys.has(k));
    const bnOnly = [...bnKeys].filter((k) => !enKeys.has(k));
    if (enOnly.length || bnOnly.length) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(`\n❌ key drift — en only: ${enOnly.slice(0, 10).join(', ')} | bn only: ${bnOnly.slice(0, 10).join(', ')}`);
    }
    expect(enOnly).toEqual([]);
    expect(bnOnly).toEqual([]);
  });

  it('interpolation params match between en and bn for shared keys', () => {
    function flattenLeaves(obj: Record<string, unknown>, prefix = ''): [string, string][] {
      return Object.entries(obj).flatMap(([k, v]) =>
        v !== null && typeof v === 'object'
          ? flattenLeaves(v as Record<string, unknown>, prefix ? `${prefix}.${k}` : k)
          : [[prefix ? `${prefix}.${k}` : k, String(v)]],
      );
    }
    const paramRe = /\{\{(\w+)\}\}/g;
    const drift: string[] = [];
    for (const [key, enText] of flattenLeaves(en)) {
      const bnNode = key.split('.').reduce<unknown>((acc, part) => (acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), bn);
      if (typeof bnNode !== 'string') continue;
      const ep = (enText.match(paramRe) || []).sort().join(',');
      const bp = (bnNode.match(paramRe) || []).sort().join(',');
      if (ep !== bp) drift.push(`${key}: en(${ep}) vs bn(${bp})`);
    }
    if (drift.length) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(`\n❌ interpolation drift:\n  ${drift.slice(0, 10).join('\n  ')}`);
    }
    expect(drift).toEqual([]);
  });
});

describe('i18n smoke — all rider screens use useTranslation', () => {
  const files = findTsxFiles(RIDER_DIR);

  // Layout files and files with no default export are excluded
  const EXCLUDED_PATTERNS = [
    '_layout.tsx',
    'chat/[rideId].tsx',
    'earnings-detail/[date].tsx',
    'customer-navigation/[rideId].tsx',
  ];

  const screenFiles = files.filter(
    (f) => !EXCLUDED_PATTERNS.some((p) => f.includes(p)),
  );

  it(`finds ${screenFiles.length} screen files to check`, () => {
    expect(screenFiles.length).toBeGreaterThan(30);
  });

  const wiredScreens: string[] = [];
  const unwiredScreens: string[] = [];
  const screensWithHardcoded: string[] = [];

  for (const file of screenFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relPath = path.relative(path.resolve(__dirname, '../..'), file);
    const hasHook = content.includes('useTranslation');

    if (hasHook) {
      wiredScreens.push(relPath);
    } else {
      unwiredScreens.push(relPath);
      const hardcoded = hasHardcodedStrings(content);
      if (hardcoded.length > 0) {
        screensWithHardcoded.push(`${relPath}: ${hardcoded.slice(0, 3).join(', ')}`);
      }
    }
  }

  it('at least 50 screens are wired with useTranslation', () => {
    expect(wiredScreens.length).toBeGreaterThanOrEqual(50);
  });

  it('unwired screens have no hardcoded user-facing strings', () => {
    if (screensWithHardcoded.length > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(
        '\n⚠️  Screens with hardcoded strings but no useTranslation:',
        '\n' + screensWithHardcoded.join('\n'),
      );
    }
    // Allow up to 5 screens with hardcoded strings (layout/loading edge cases)
    expect(screensWithHardcoded.length).toBeLessThanOrEqual(5);
  });

  it('logs wiring status summary', () => {
    // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
    console.log(`\n📊 i18n wiring status:`);
    // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
    console.log(`   Wired: ${wiredScreens.length}/${screenFiles.length}`);
    // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
    console.log(`   Unwired: ${unwiredScreens.length}`);
    if (unwiredScreens.length > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(`   Unwired files: ${unwiredScreens.join(', ')}`);
    }
  });
});

/**
 * Detect user-facing hardcoded strings.
 * Heuristic: looks for JSX <Text> or string literals that are likely UI copy.
 */
function hasHardcodedStrings(content: string): string[] {
  const issues: string[] = [];

  // Skip layout files (no user-facing strings)
  if (content.includes('export default function') === false) return issues;

  // Check for hardcoded strings in JSX Text components
  // Pattern: >"Some text"< or >{'Some text'}<
  const textPatterns = [
    // Direct JSX text: <Text>Hardcoded</Text>
    />\s*([A-Z][a-zA-Z ]{2,30})\s*</g,
    // Template with hardcoded: {"Hardcoded text"}
    /\{\s*["']([A-Z][a-zA-Z ]{2,40})["']\s*\}/g,
  ];

  for (const pattern of textPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const text = match[1].trim();
      // Filter out common non-translatable strings
      if (
        text.length > 2 &&
        !text.startsWith('http') &&
        !text.startsWith('/') &&
        !text.match(/^[A-Z_]+$/) && // skip constants
        !text.match(/^\d/) && // skip numbers
        !['ios', 'android', 'web'].includes(text.toLowerCase()) &&
        !['SafeAreaView', 'ScrollView', 'StatusBar', 'TouchableOpacity', 'View', 'Text', 'TextInput'].includes(text)
      ) {
        issues.push(`"${text}"`);
      }
    }
  }

  return issues;
}

/** Find all .tsx files under the rider directory. */
function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('i18n key-shaped literal sweep — carrier-independent tier', () => {
  const APP_DIR = path.resolve(__dirname, '../../app');
  const COMPONENTS_DIR = path.resolve(__dirname, '../../components');
  const SHAPE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

  const locales = [
    ['en', JSON.parse(fs.readFileSync(EN_LOCALE, 'utf-8'))],
    ['bn', JSON.parse(fs.readFileSync(BN_LOCALE, 'utf-8'))],
  ];

  function resolveIn(localeJson: Record<string, unknown>, key: string): boolean {
    let node: unknown = localeJson;
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) {
        return false;
      }
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  }

  /** Comment-aware, quote-aware scanner: every '' / "" literal value in a source string. */
  function literalsIn(src: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? src.length : nl + 1;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end === -1 ? src.length : end + 2;
        continue;
      }
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        let v = '';
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') {
            v += src[i + 1] ?? '';
            i += 2;
            continue;
          }
          v += src[i];
          i++;
        }
        i++;
        out.push(v);
        continue;
      }
      i++;
    }
    return out;
  }

  function walkSources(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // app/api/** is server code: its key-shaped literals are RBAC scopes
        // (admin.read, verification.write) — never passed to t().
        if (full === APP_DIR + path.sep + 'api') continue;
        walkSources(full, out);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        out.push(full);
      }
    }
    return out;
  }

  const unresolvedByFile = new Map<string, Set<string>>();
  let shapedCount = 0;
  outer: for (const dir of [APP_DIR, COMPONENTS_DIR]) {
    for (const file of walkSources(dir)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const value of literalsIn(content)) {
        if (!SHAPE.test(value)) continue;
        shapedCount++;
        const missing = locales.filter(([, json]) => !resolveIn(json, value)).map(([lang]) => lang);
        if (missing.length === 0) continue;
        const rel = path.relative(path.join(__dirname, '../..'), file);
        if (!unresolvedByFile.has(rel)) unresolvedByFile.set(rel, new Set());
        unresolvedByFile.get(rel)!.add(`${value} [missing: ${missing.join(', ')}]`);
        if (unresolvedByFile.size >= 200) break outer;
      }
    }
  }
  const unresolvedTotal = [...unresolvedByFile.values()].reduce((a, s) => a + s.size, 0);

  it('every key-shaped string literal resolves in every locale (carrier-independent)', () => {
    if (unresolvedByFile.size > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(
        `\n❌ ${unresolvedTotal} key-shaped literal(s) missing from locales ` +
          `(of ${shapedCount} scanned across ${unresolvedByFile.size} files):\n` +
          [...unresolvedByFile.entries()]
            .sort()
            .map(([f, keys]) => `  ${f}:\n    ${[...keys].sort().join('\n    ')}`)
            .join('\n'),
      );
    }
    expect(unresolvedByFile.size).toBe(0);
  });
});

describe('i18n call-site interpolation — t(key, { params }) matches locale declarations', () => {
  const APP_DIR = path.resolve(__dirname, '../../app');
  const COMPONENTS_DIR = path.resolve(__dirname, '../../components');
  const KEY_LITERAL_WITH_OPTIONS =
    /\bt\(\s*(['"])([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)\1\s*,\s*\{/g;
  const TOKEN_RE = /\{\{(\w+)\}\}/g;

  const locales = [
    ['en', JSON.parse(fs.readFileSync(EN_LOCALE, 'utf-8'))],
    ['bn', JSON.parse(fs.readFileSync(BN_LOCALE, 'utf-8'))],
  ] as [string, Record<string, unknown>][];

  function resolveIn(localeJson: Record<string, unknown>, key: string): boolean {
    let node: unknown = localeJson;
    for (const part of key.split('.')) {
      if (node === null || typeof node !== 'object' || !(part in (node as Record<string, unknown>))) {
        return false;
      }
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string';
  }

  function valueFor(localeJson: Record<string, unknown>, key: string): string {
    let node: unknown = localeJson;
    for (const part of key.split('.')) node = (node as Record<string, unknown>)[part];
    return typeof node === 'string' ? node : '';
  }

  /** Index of the brace closing the object opened at `open`, skipping string literals. */
  function matchObjectBrace(src: string, open: number): number {
    let depth = 0;
    let i = open;
    while (i < src.length) {
      const ch = src[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        i++;
        while (i < src.length && src[i] !== ch) {
          if (src[i] === '\\') i += 2;
          else i++;
        }
        i++;
        continue;
      }
      if (ch === '/' && src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        i = nl === -1 ? src.length : nl + 1;
        continue;
      }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
      i++;
    }
    return -1;
  }

  /**
   * Top-level property names of an options object body: `name: expr` entries
   * and bare shorthand `name`. Spreads or computed keys return null for that
   * entry; if any entry is unparseable the whole site is skipped (counted in
   * skippedSites so nothing hides).
   */
  function suppliedParams(body: string): string[] | null {
    const names: string[] = [];
    let depth = 0;
    let segStart = 0;
    const segments: string[] = [];
    let i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        i++;
        while (i < body.length && body[i] !== ch) {
          if (body[i] === '\\') i += 2;
          else i++;
        }
        i++;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        segments.push(body.slice(segStart, i));
        segStart = i + 1;
      }
      i++;
    }
    segments.push(body.slice(segStart));
    for (const seg of segments) {
      if (/^\s*$/.test(seg)) continue; // trailing comma
      const named = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
      const shorthand = seg.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
      if (named) names.push(named[1]);
      else if (shorthand) names.push(shorthand[1]);
      else return null; // spread / computed / unparseable
    }
    return names;
  }

  function walkSources(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full === APP_DIR + path.sep + 'api') continue;
        walkSources(full, out);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        out.push(full);
      }
    }
    return out;
  }

  const problems: string[] = [];
  let siteCount = 0;
  let skippedSites = 0;
  for (const dir of [APP_DIR, COMPONENTS_DIR]) {
    for (const file of walkSources(dir)) {
      const content = fs.readFileSync(file, 'utf-8');
      const rel = path.relative(path.join(__dirname, '../..'), file);
      KEY_LITERAL_WITH_OPTIONS.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = KEY_LITERAL_WITH_OPTIONS.exec(content)) !== null) {
        const openBrace = m.index + m[0].length - 1;
        const closeBrace = matchObjectBrace(content, openBrace);
        if (closeBrace === -1) {
          skippedSites += 1;
          continue;
        }
        const params = suppliedParams(content.slice(openBrace + 1, closeBrace));
        if (params === null) {
          skippedSites += 1;
          continue;
        }
        siteCount += 1;
        const key = m[2];
        if (!resolveIn(locales[0][1], key) || !resolveIn(locales[1][1], key)) continue; // missing-key tiers own that failure
        const line = content.slice(0, m.index).split('\n').length;
        const supplied = new Set(params);
        for (const [lang, json] of locales) {
          const declared = new Set(
            [...valueFor(json, key).matchAll(TOKEN_RE)].map((t) => t[1]),
          );
          for (const p of supplied)
            if (!declared.has(p))
              problems.push(
                `${rel}:${line} ${key} — param {${p}} supplied but not in ${lang} value`,
              );
          for (const p of declared)
            if (!supplied.has(p))
              problems.push(
                `${rel}:${line} ${key} — {{${p}}} declared in ${lang} value but never supplied (renders raw)`,
              );
        }
      }
    }
  }

  it('every t(key, { params }) call site supplies exactly the params both locale values declare', () => {
    // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
    console.log(
      `   checked ${siteCount} literal t(key, {…}) call sites` +
        (skippedSites > 0 ? ` (skipped ${skippedSites} unparseable)` : ''),
    );
    if (problems.length > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(`\n❌ interpolation drift at ${problems.length} call site(s):\n  ${problems.join('\n  ')}`);
    }
    expect(problems).toEqual([]);
  });
});
