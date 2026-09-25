/**
 * Expo Router routes-tree guard (ISSUE-70 follow-up, 2026-09-25)
 *
 * Any .ts/.tsx/.js/.jsx file under app/ that enters the expo-router
 * require.context (everything except *+api and +html — see
 * node_modules/expo-router/_ctx.js) must export a default component, or the
 * router logs `Route "X" is missing the required default export` on every
 * dev boot (node_modules/expo-router/build/getRoutesCore.js:227, dev + sync
 * import mode).
 *
 * This bit us once: `_truckCatalog.ts` (a data module) lived in the rental
 * marketplace folder and warned on every Metro boot until it was moved to
 * `constants/truckCatalog.ts` (commit fd9fd39). The one-off sweep that
 * verified the whole tree (532 files, 0 hits) is promoted here as a guard so
 * the next data module dropped into app/ fails the suite at test time instead
 * of surfacing as a dev-console warning — or worse, a crash in a production
 * export where the same load path throws for non-component defaults.
 *
 * Filter chain replicated from the installed router + metro config:
 *  1. Included: every .ts/.tsx/.js/.jsx under app/ except *+api / +html
 *     (expo-router/_ctx.js context regex).
 *  2. Excluded: metro.config.js blockList — __tests__/ dirs, *.test.*,
 *     *.spec.* — Jest runs those in Node; Metro never bundles them, so they
 *     never enter the router context.
 *  3. Excluded: platform-extension mismatches (getRoutesCore specificity < 0):
 *     a `.web.ts`/`.ios.ts` file warns only when bundling FOR that platform,
 *     so it is reported as its own assertion rather than failing every run.
 *  4. Special route files (_layout, +not-found, _not-found) are context-
 *     included like any route and must default-export too.
 *
 * Default-export detection is comment-stripped but deliberately regex-based
 * (no AST dependency): statement form, `export { X as default }`, and
 * `export { default } [from ...]` re-exports are all accepted. The detector
 * was harness-verified against comment/string false-positive traps when the
 * sweep was written (.tmp/router-sweep.cjs, ISSUE-70 checkpoint).
 */

import fs from 'fs';
import path from 'path';

const APP_ROOT = path.resolve(__dirname, '../../app');
const ROUTE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx']);

interface RouteFile {
  /** Path relative to app/, forward slashes — matches router context keys. */
  rel: string;
  abs: string;
}

function walk(dir: string, out: RouteFile[] = []): RouteFile[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (ROUTE_EXTS.has(path.extname(entry.name))) {
      out.push({ abs: p, rel: path.relative(APP_ROOT, p).split(path.sep).join('/') });
    }
  }
  return out;
}

/** expo-router/_ctx.js: include everything except *+api and +html. */
function isContextIncluded(rel: string): boolean {
  if (/\+api(\.\w+)?\.[jt]sx?$/.test(rel)) return false;
  if (/^\+html(\.\w+)?\.[jt]sx?$/.test(rel)) return false;
  return true;
}

/** metro.config.js resolver.blockList additions — never bundled, never routed. */
function isMetroBlocked(rel: string): boolean {
  return (
    /(^|\/)__tests__(\/|$)/.test(rel) ||
    /\.test\.[jt]sx?$/.test(rel) ||
    /\.spec\.[jt]sx?$/.test(rel)
  );
}

/** Platform extension, if any: foo.web.ts → 'web' (getRoutesCore specificity). */
function platformExtension(rel: string): string | null {
  const base = path.basename(rel).replace(/\.[jt]sx?$/, '');
  const m = base.match(/\.([a-z]+)$/);
  if (!m) return null;
  return ['web', 'native', 'ios', 'android'].includes(m[1]) ? m[1] : null;
}

function stripComments(src: string): string {
  return src
    // Block comments → same-length whitespace so line numbers survive.
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    // Line comments (naive about `//` inside strings — acceptable for a guard;
    // the sweep harness verified the realistic traps).
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1: string | undefined) => (p1 ? p1 : ''));
}

/**
 * Accepts every legitimate default-export form; anything else fails the guard.
 * Export lists are parsed per element so `export { A, default } from './x'`
 * counts (the earlier two-regex version missed it) while
 * `export { default as X }` — which re-exports default under a different
 * name — correctly does not.
 */
export function hasDefaultExport(src: string): boolean {
  const s = stripComments(src);
  if (/^\s*export\s+default\b/m.test(s)) return true;
  const exportLists = s.match(/^\s*export\s*\{[^}]*\}/gm) ?? [];
  return exportLists.some((list) => {
    const inner = list.slice(list.indexOf('{') + 1, list.lastIndexOf('}'));
    return inner.split(',').some((el) => {
      const t = el.trim();
      return t === 'default' || /^\S+\s+as\s+default$/.test(t);
    });
  });
}

function classifyAppFiles(): {
  offenders: RouteFile[];
  platformOnly: RouteFile[];
  scanned: number;
} {
  const offenders: RouteFile[] = [];
  const platformOnly: RouteFile[] = [];
  let scanned = 0;
  for (const file of walk(APP_ROOT)) {
    scanned++;
    if (!isContextIncluded(file.rel) || isMetroBlocked(file.rel)) continue;
    const plat = platformExtension(file.rel);
    if (plat && plat !== 'native' && plat !== 'android') {
      // Warns only when bundling for that platform; tracked separately so the
      // main assertion stays deterministic across host platforms.
      if (!hasDefaultExport(fs.readFileSync(file.abs, 'utf8'))) platformOnly.push(file);
      continue;
    }
    if (!hasDefaultExport(fs.readFileSync(file.abs, 'utf8'))) offenders.push(file);
  }
  return { offenders, platformOnly, scanned };
}

describe('expo-router routes tree (app/) — default-export guard', () => {
  const { offenders, platformOnly, scanned } = classifyAppFiles();

  it('every context-included route file exports a default component', () => {
    // On failure jest lists each offender; fix by adding `export default` (a
    // React component) or by MOVING the file out of app/ (e.g. constants/,
    // lib/) — see the _truckCatalog.ts precedent (commit fd9fd39, ISSUE-70).
    expect(offenders.map((f) => `app/${f.rel}`)).toEqual([]);
  });

  it('no platform-specific route file lacks a default export', () => {
    const names = platformOnly.map((f) => `app/${f.rel}`);
    expect(names).toEqual([]);
  });

  it('actually scanned the routes tree (guard cannot pass vacuously)', () => {
    // The guard is only meaningful if it sees the tree; if app/ moves or the
    // walker breaks, fail loudly instead of passing on zero files.
    expect(scanned).toBeGreaterThan(100);
  });
});

// ── Detector harness ──
// The original harness lived in the ephemeral sweep script
// (.tmp/router-sweep.cjs, ISSUE-70 checkpoint). These cases keep it in-repo
// so the detector itself is regression-protected, covering the realistic
// traps: default-export text inside comments/strings, type-only re-exports,
// and renamed re-exports that are NOT this module's default.

describe('default-export detector harness', () => {
  const CASES: [string, string, boolean][] = [
    ['export default function', 'export default function Home() { return null; }', true],
    ['export default class', 'export default class Foo {}', true],
    ['export default identifier', 'const X = 1;\nexport default X;', true],
    ['export default async fn', 'export default async function F() {}', true],
    ['export { X as default }', 'const Screen = 1;\nexport { Screen as default };', true],
    ['export { default } from', "export { default } from './x';", true],
    ['export { A, default } from', "const A = 1;\nexport { A, default } from './x';", true],
    ['export { A as default, B }', 'const A = 1;\nconst B = 2;\nexport { A as default, B };', true],
    ['default export in line comment', '// export default was removed\nexport const A = 1;', false],
    ['default export in block comment', '/* export default\n   hidden */\nexport const B = 2;', false],
    ['default export in string', "const note = 'export default lives elsewhere';", false],
    ['export type with default property', 'export type Config = { default: string };', false],
    ['export type { X as default } (type-only)', "export type { Shape as default } from './t';", false],
    ['export { default as X } (renamed)', "export { default as Foo } from './x';", false],
    ['export * only', "export * from './x';", false],
    ['named exports only', 'export function Screen() {}\nexport const opts = {};', false],
  ];

  test.each(CASES)('%s', (_name, source, expected) => {
    expect(hasDefaultExport(source)).toBe(expected);
  });
});
