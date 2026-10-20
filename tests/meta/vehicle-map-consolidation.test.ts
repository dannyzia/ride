/**
 * §4.8 vehicle-type literal-map consolidation pin (STAGE S8b, Step 8).
 *
 * Contract: .kilo/plans/1792438955890-women-only-gender-scooter-audit.md §4.8
 * ("Vehicle-Type Literal-Map Consolidation — derive, don't duplicate").
 *
 * The detector is the contract's own grep:
 *   grep -rn "bike_plus" app/ components/ lib/ scripts/ \
 *        --include="*.tsx" --include="*.ts" --include="*.js"
 *
 * Every hit must be ONE of:
 *   1. DERIVED — the six consolidated sites derive from lib/vehicleTypes.ts
 *      and therefore must contain no literal vehicle-type list at all
 *      (asserted per site below, not just via the detector);
 *   2. COMPILE-FORCED — the hit sits in a `Record<VehicleTypeEnum, …>` map
 *      literal, so tsc --noEmit breaks the day the registry gains a member
 *      the map lacks (scooter can never be silently missing);
 *   3. EXPLICITLY EXEMPT — the registry source-of-truth itself, platform
 *      config KEY names (fuel_efficiency_* / joma_*), mock/debug fixtures, or
 *      the canonical pricing seed rows (the seed IS the data, not a label
 *      map).
 *
 * The failure mode this pins: a scooter-era hard-coded label/filter list
 * rebuilt by hand. Before consolidation the detector found literal lists in
 * six surfaces (home getTypesForCategory, three fleet VEHICLE_TYPE_LABELS,
 * fare-gate-metrics VT_LABEL, call-ledger VEHICLE_TYPE_KEYS,
 * schedule-ride VEHICLE_TYPE_LABEL_KEYS, DriverPricingReference VT_LABEL) —
 * each one silently dropping scooter (and any future tier) from a rider,
 * driver, fleet, or admin surface. A reintroduced literal fails here at
 * test time instead of shipping a broken filter chip or a blank label.
 *
 * Classifier is fault-tested below with in-memory synthetic files (a
 * hard-coded list must be REJECTED; a compile-forced member must be
 * ALLOWED) so a detector that degenerates to "allow everything" turns the
 * suite red rather than passing quietly.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const SWEEP_DIRS = ['app', 'components', 'lib', 'scripts'];
const SWEEP_EXTS = new Set(['.ts', '.tsx', '.js']);

/**
 * Explicit exemptions, path-relative to the repo root (forward slashes).
 * Reason travels with the entry so an exemption is reviewable, not tribal.
 */
const EXEMPT: Record<string, string> = {
  'lib/vehicleTypes.ts':
    'registry source of truth (VEHICLE_TYPE_VALUES / classifier / category maps)',
  'app/admin/fare-config.tsx':
    'platform_config fuel/joma FIELD KEYS, not vehicle label maps',
  'app/api/admin/config+api.ts': 'platform_config key allowlist',
  'lib/fareFrameworkConfig.ts': 'platform_config key names + defaults',
  'lib/fuelConfig.ts': 'platform_config key names + parsed fuel map',
  'scripts/seed-fuel-config.js': 'platform_config seed rows',
  'lib/integrations/mockRidePlatform.ts': 'mock fixture data',
  'scripts/seed-pricing.js':
    'canonical pricing seed row (the row itself is the data)',
};

/** Debug tooling queries DB rows by literal vehicle_type — exempt as a dir. */
const EXEMPT_DIR_PREFIXES = ['scripts/debug/'];

/** Files that MUST derive (no literal vehicle-type list anywhere in them). */
interface DerivedSite {
  file: string;
  mustContain: string;
  mustNotContain: string;
  why: string;
}

const DERIVED_SITES: DerivedSite[] = [
  {
    file: 'app/(main)/(customer)/(tabs)/home/index.tsx',
    mustContain: 'getVehicleTypesByCategory(cat)',
    mustNotContain: 'return ["bike_basic", "bike_standard"',
    why: 'getTypesForCategory derives from the registry (scooter joins the bike list)',
  },
  {
    file: 'app/(main)/(customer)/schedule-ride/index.tsx',
    mustContain: 't(`schedule_ride.vehicle_${vt.key}`',
    mustNotContain: 'schedule_ride.vehicle_bike_plus',
    why: 'label keys built inline from the registry (orphan-auditor template-prefix tier)',
  },
  {
    file: 'app/(main)/(rider)/call-ledger.tsx',
    mustContain: "['all', ...VEHICLE_TYPE_VALUES]",
    mustNotContain: "'bike_plus'",
    why: 'VEHICLE_TYPE_KEYS derives from VEHICLE_TYPE_VALUES',
  },
  {
    file: 'app/admin/fare-gate-metrics.tsx',
    mustContain: 'vehicleTypeLabel(',
    mustNotContain: 'bike_plus',
    why: 'VT_LABEL replaced by the shared vehicleTypeLabel helper',
  },
  {
    file: 'components/DriverPricingReference.tsx',
    mustContain: 'vehicleTypeLabel(',
    mustNotContain: 'bike_plus',
    why: 'VT_LABEL replaced by the shared vehicleTypeLabel helper',
  },
];

/** The three fleet dictionaries collapsed into the shared helper. */
const FLEET_DICT_SITES = [
  'app/(main)/(fleet)/(tabs)/operations/index.tsx',
  'app/(main)/(fleet)/drivers/[id].tsx',
  'app/(main)/(fleet)/vehicles/[id].tsx',
];

interface Hit {
  file: string; // repo-relative, forward slashes
  line: number; // 1-based
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(p, out);
    } else if (SWEEP_EXTS.has(path.extname(entry.name))) {
      if (/\.test\.[^.]+$/.test(entry.name) || /\.spec\.[^.]+$/.test(entry.name)) continue;
      out.push(p);
    }
  }
  return out;
}

function detect(root: string): Hit[] {
  const hits: Hit[] = [];
  for (const dir of SWEEP_DIRS) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((text, i) => {
        if (text.includes('bike_plus')) hits.push({ file: rel, line: i + 1, text });
      });
    }
  }
  return hits;
}

/**
 * Find the header of the `const … = {` declaration containing `hitIndex`
 * (walking up over map entries) and report whether it is compile-forced.
 */
function isCompileForced(lines: string[], hitIndex: number): boolean {
  for (let i = hitIndex; i >= 0; i--) {
    const line = lines[i];
    if (/^(export\s+)?const\s+/.test(line)) {
      return /Record<VehicleTypeEnum\s*,/.test(line);
    }
    // Hit is inside a function/JSX, not a const map literal → not forced.
    if (/^[}\s]*\b(function|return|if|for|=>)/.test(line)) return false;
  }
  return false;
}

function classify(rel: string, lines: string[], hitIndex: number): { ok: boolean; reason: string } {
  if (EXEMPT_DIR_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    return { ok: true, reason: `exempt dir ${prefixFor(rel)}` };
  }
  if (EXEMPT[rel]) return { ok: true, reason: `exempt: ${EXEMPT[rel]}` };
  if (isCompileForced(lines, hitIndex)) {
    return { ok: true, reason: 'compile-forced Record<VehicleTypeEnum, …>' };
  }
  return { ok: false, reason: 'literal vehicle-type hit outside any allowlist' };
}

function prefixFor(rel: string): string {
  return EXEMPT_DIR_PREFIXES.find((p) => rel.startsWith(p)) ?? '';
}

describe('§4.8 vehicle-type literal-map consolidation sweep', () => {
  const hits = detect(ROOT);

  it('runs the contract detector over app/, components/, lib/, scripts/', () => {
    // Sanity: the detector must actually find the known compile-forced /
    // exempt sites — a silently-empty sweep would let a broken regex pass.
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.file === 'lib/vehicleTypes.ts')).toBe(true);
  });

  it('every detector hit is derived, compile-forced, or explicitly exempt', () => {
    const offenders: string[] = [];
    for (const hit of hits) {
      const lines = fs.readFileSync(path.join(ROOT, hit.file), 'utf8').split(/\r?\n/);
      const verdict = classify(hit.file, lines, hit.line - 1);
      if (!verdict.ok) offenders.push(`${hit.file}:${hit.line} — ${hit.text.trim()}`);
    }
    expect(offenders).toEqual([]);
  });

  describe('consolidated sites derive from lib/vehicleTypes.ts', () => {
    for (const site of DERIVED_SITES) {
      it(`${site.file} — ${site.why}`, () => {
        const src = fs.readFileSync(path.join(ROOT, site.file), 'utf8');
        expect(src).toContain(site.mustContain);
        expect(src).not.toContain(site.mustNotContain);
      });
    }

    for (const file of FLEET_DICT_SITES) {
      it(`${file} — duplicate VEHICLE_TYPE_LABELS dictionary removed`, () => {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        expect(src).not.toContain('VEHICLE_TYPE_LABELS');
        expect(src).toContain('vehicleTypeLabel(');
      });
    }
  });

  describe('classifier fault pairs (a no-op detector must fail here)', () => {
    const FORCED = [
      'const SOME_ICONS: Record<VehicleTypeEnum, string> = {',
      '  bike_basic: "bicycle",',
      '  bike_plus: "bicycle",',
      '};',
    ];
    const HARD_LISTED = [
      'function getTypesForCategory(cat: string) {',
      '  if (cat === "bike") return ["bike_basic", "bike_standard", "bike_plus"];',
      '  return [];',
      '}',
    ];

    it('ALLOWS a compile-forced map member', () => {
      expect(classify('components/Synthetic.tsx', FORCED, 2).ok).toBe(true);
    });

    it('REJECTS a hard-coded vehicle list in an unlisted file', () => {
      expect(classify('components/Synthetic.tsx', HARD_LISTED, 1).ok).toBe(false);
    });

    it('REJECTS the same hit when the compile-forced detector is neutralised', () => {
      const lines = FORCED;
      const headerIdx = lines.findIndex((l) => l.startsWith('const '));
      const noForced = lines.map((l, i) => (i === headerIdx ? l.replace('Record<VehicleTypeEnum, string>', 'Record<string, string>') : l));
      expect(classify('components/Synthetic.tsx', noForced, 2).ok).toBe(false);
    });

    it('honours an explicit exemption entry', () => {
      expect(classify('lib/vehicleTypes.ts', ['  "bike_plus",'], 0).ok).toBe(true);
    });
  });
});
