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
 * Enforcement is two-tier (2026-09-15):
 *  - rider_home.* keys: HARD FAIL — the ISSUE-59 namespace must never regress.
 *  - all other namespaces: shrink-only BASELINE. The R2.4 sweep wired t() into
 *    60+ screens without backfilling every namespace, leaving ~730 pre-existing
 *    raw-key sites (file a separate issue to repay that debt). New code may not
 *    ADD to the baseline: the fail count here may only go DOWN. When it hits
 *    zero, delete the baseline and the guard becomes total.
 */
const HARD_NAMESPACE = 'rider_home';

/** Pre-existing missing-key count at guard introduction (2026-09-15, measured).
 * Shrink-only: CI fails if the count rises above this. Update downwards as
 * namespaces are repaid; must never be increased. */
const MISSING_KEY_BASELINE = 733;

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

  function* walkTsx(dir: string): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* walkTsx(full);
      else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) yield full;
    }
  }

  const hardMissing: Record<string, string[]> = {};
  let softMissingCount = 0;
  for (const dir of [
    path.resolve(__dirname, '../../app'),
    path.resolve(__dirname, '../../components'),
  ]) {
    for (const file of walkTsx(dir)) {
      const content = fs.readFileSync(file, 'utf-8');
      const keys = collectKeys(content);
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

  it(`non-rider_home missing-key count does not exceed the shrink-only baseline (${MISSING_KEY_BASELINE})`, () => {
    if (softMissingCount > 0) {
      // eslint-disable-next-line no-console -- test diagnostic (house pattern in this file)
      console.log(
        `\n⚠️  pre-existing raw-key debt: ${softMissingCount} missing t() keys ` +
          `(baseline ${MISSING_KEY_BASELINE} — shrink-only; repay namespaces and lower it)`,
      );
    }
    expect(softMissingCount).toBeLessThanOrEqual(MISSING_KEY_BASELINE);
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
