/**
 * Meta gate: no zustand v5 selector may build a new object per call.
 *
 * SPEC (bug class, measured 2026-11-10). zustand v5 compares a selector's
 * result with `Object.is`. A selector written `useXStore((s) => ({ a: s.a }))`
 * returns a NEW object on every call, so the store believes state changed on
 * every render and re-renders forever — React throws "Maximum update depth
 * exceeded", and on device it surfaces as a LogBox "Render Error" whose stack
 * runs through `forceStoreRerender` / `updateStoreInstance`. That redbox sat
 * over the driver home immediately after login and made every downstream screen
 * unverifiable.
 *
 * The two offending sites were `(rider)/d/(tabs)/index.tsx` (monetization) and
 * `(rider)/d/(tabs)/wallet/index.tsx` (monetization) — both fixed with
 * `useShallow`. This test is the net: it walks app/ + components/, and every
 * finding is PAIRED with a fault-injected detector copy that must flag a site
 * the real detector clears, so a detector that has become a no-op fails here
 * instead of passing quietly.
 *
 * Related (concrete paths):
 *   - app/(main)/(rider)/d/(tabs)/index.tsx — fixed site 1
 *   - app/(main)/(rider)/d/(tabs)/wallet/index.tsx — fixed site 2
 *   - store/*.ts — the stores; none of their state values is a getter
 * Last verified: 2026-11-10 — real tree 0 findings; the driver home no longer
 *   redboxes on device (fleet flow green end-to-end).
 * How to update: the rule is deliberately narrow (object-literal selector not
 *   wrapped in `useShallow`). If a second shape appears — e.g. an array-returning
 *   selector `(s) => s.items.filter(...)` — add it as its own assertion with its
 *   own fault pair; do NOT widen this regex, which would start flagging plain
 *   `(s) => s.field` selectors and invite a suppression list.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "components"];

/** `useXStore(` NOT followed by `useShallow`, then a selector returning `({`. */
const OFFENDER_SOURCE =
  "use[A-Za-z0-9]*Store\\((?!\\s*useShallow)\\s*(?:\\(?[A-Za-z_]+\\s*\\)?)\\s*=>\\s*\\(\\{";

function makeDetector(source: string): RegExp {
  return new RegExp(source);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function scan(detector: RegExp): { file: string; line: number; text: string }[] {
  const findings: { file: string; line: number; text: string }[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const src = fs.readFileSync(file, "utf8");
      src.split(/\r?\n/).forEach((line, i) => {
        if (detector.test(line)) {
          findings.push({
            file: path.relative(ROOT, file).split(path.sep).join("/"),
            line: i + 1,
            text: line.trim(),
          });
        }
      });
    }
  }
  return findings;
}

describe("zustand selector stability (v5 Object.is)", () => {
  test("no selector in app/ or components/ builds a fresh object without useShallow", () => {
    const findings = scan(makeDetector(OFFENDER_SOURCE));
    expect(
      findings.map((f) => `${f.file}:${f.line} → ${f.text}`),
    ).toEqual([]);
  });

  test("the detector still catches the shape it was written for", () => {
    const detector = makeDetector(OFFENDER_SOURCE);
    // The exact bug, as it was written at both fixed sites.
    expect(detector.test("const m = useMonetizationStateStore((s) => ({")).toBe(true);
    // A wrapped selector is fine.
    expect(detector.test("const m = useXStore(")).toBe(false);
    expect(detector.test("    useShallow((s) => ({")).toBe(false);
    // A plain field selector is fine — the rule must not creep into those.
    expect(detector.test("const a = useDriverStore((s) => s.activeSubscription);")).toBe(false);
  });

  test("FUSE: a neutralised detector stops flagging the real bug", () => {
    // The same pre-fix line, judged by the real rule and by one whose pattern
    // can never match. If the real rule is ever quietly disabled (or stops
    // matching this shape), the first assertion flips and this fails — which is
    // the whole point of the pair: a green scan above must mean "scanned and
    // clean", not "scanned with a dead regex".
    const preFixLine = "const m = useMonetizationStateStore((s) => ({";
    const strict = makeDetector(OFFENDER_SOURCE);
    const neutralised = makeDetector("$^");
    expect(strict.test(preFixLine)).toBe(true);
    expect(neutralised.test(preFixLine)).toBe(false);
    // And a useShallow-wrapped selector is what the real rule must let through.
    expect(
      strict.test("  useShallow((s) => ({"),
    ).toBe(false);
  });
});
