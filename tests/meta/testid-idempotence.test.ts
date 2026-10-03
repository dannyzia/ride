/**
 * tests/meta/testid-idempotence.test.ts
 *
 * Exercises the reusable B-1 proof in maestro/tools/testid-idempotence.cjs.
 *
 * WHY THIS FILE EXISTS: the gate used to be reachable only by spawning
 * `node scripts/check-testid-idempotence.js` (a ~12s full-codemod run), so the
 * only way to test it was to actually run the codemod over a sandboxed copy of
 * app/. That is too slow to run in the normal suite and too coarse to point at a
 * specific defect. The proof is now a MODULE (runIdempotenceCheck +
 * findDoublePrefixed), so the fast, precise checks live here and only the
 * end-to-end gate run stays in CI.
 *
 * The full proof is deliberately NOT duplicated here — running the real codemod
 * in a unit test would add ~12s and would re-prove what pre-commit stage 4
 * already proves on every app/ commit. What is asserted here is the logic that
 * could silently rot: the double-prefix detector, including the JSX-comment
 * false positive that a regex-based version reported.
 */
import fs from "fs";
import os from "os";
import {
  findDoublePrefixed,
  runIdempotenceCheck,
  BrokenInputError,
} from "../../maestro/tools/testid-idempotence.cjs";

const tsx = (body: string) => `<View>${body}</View>`;

describe("findDoublePrefixed — B-1 signature detector", () => {
  it("flags an ID that repeats a path segment (B-1's literal signature)", () => {
    // This is what B-1 actually shipped: _layout.set-theme became
    // _layout._layout.set-theme on a write-mode re-run.
    const src = tsx(`<TouchableOpacity testID="_layout._layout.set-theme" />`);
    const r = findDoublePrefixed("layout.tsx", src);
    expect(r.doublePrefixed).toEqual(["_layout._layout.set-theme"]);
    expect(r.scanned).toBe(1);
  });

  it("does not flag a healthy ID", () => {
    const src = tsx(`<TouchableOpacity testID="rider.profile.push-settings-hub" />`);
    const r = findDoublePrefixed("profile.tsx", src);
    expect(r.doublePrefixed).toEqual([]);
  });

  it("ignores testID=\"...\" inside a JSX COMMENT", () => {
    // REGRESSION GUARD. A regex scan matched this and reported a phantom
    // double-prefixed ID at onboarding/index.tsx:1314, where a comment documents
    // that the manifest only records string-literal initialisers. The whole
    // point of parsing the AST is that prose in a comment is not an attribute.
    const src = `<View>
      {/* records only testID="..." JSX attributes whose initializer is a literal */}
      <TouchableOpacity testID="rider.onboarding.set-name" />
    </View>`;
    const r = findDoublePrefixed("onboarding.tsx", src);
    expect(r.doublePrefixed).toEqual([]);
    expect(r.scanned).toBe(1); // the comment is not counted as a real attribute
  });

  it("ignores computed testIDs, matching testid-manifest.cjs", () => {
    // testid-manifest.cjs records only string-literal initialisers, so a mapped
    // testID={f.testId} is invisible to the map and must be invisible here too.
    const src = tsx(`<TouchableOpacity testID={f.testId} />`);
    const r = findDoublePrefixed("cards.tsx", src);
    expect(r.scanned).toBe(0);
    expect(r.doublePrefixed).toEqual([]);
  });

  it("counts every literal attribute in a file", () => {
    const src = `<View>
      <TouchableOpacity testID="a.one" />
      <TextInput testID="a.two" />
      <Pressable testID="a.three" />
    </View>`;
    expect(findDoublePrefixed("multi.tsx", src).scanned).toBe(3);
  });
});

describe("runIdempotenceCheck — module contract", () => {
  // Opt-in via RUN_IDEMPOTENCE_E2E=1. Deliberately declared with `it.skip`
  // rather than an `if (...) return;` guard: an early return makes jest report
  // the test as PASSED while asserting nothing, which is precisely the
  // vacuous-assertion anti-pattern this repo gates against. `it.skip` reports
  // it as PENDING, so an unrun proof can never be mistaken for a green one.
  const e2eIt = process.env.RUN_IDEMPOTENCE_E2E === "1" ? it : it.skip;

  e2eIt(
    "returns a result object rather than exiting the process",
    () => {
      // The CLI owns the exit code; the library must be safe to require() from
      // a test or another tool. Full run (~12s) — paid once, opt-in only;
      // pre-commit stage 4 runs this same check on every app/ commit anyway.
      const r = runIdempotenceCheck();
      // Untyped from TS's side (a required .cjs), so narrow `stats` explicitly
      // rather than letting it fall back to `object`.
      const stats = r.stats as Record<string, number>;
      expect(stats.run2FilesTouched).toBe(0);
      expect(stats.doublePrefixed).toBe(0);
    },
    120000
  );

  it("rejects a missing app/ or codemod as a broken input, not a regression", () => {
    // Distinguishing "cannot run" (exit 1) from "B-1 is back" (exit 2) is the
    // whole point of BrokenInputError; a swallowed path would report a green
    // gate for a check that never ran.
    expect(() =>
      runIdempotenceCheck({ app: "/definitely/not/here" })
    ).toThrow(BrokenInputError);
  });

  it("leaves no sandbox behind, even on failure", () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("testid-idem-"));
    expect(() => runIdempotenceCheck({ codemod: "/nope/add-testids.cjs" })).toThrow();
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("testid-idem-"));
    expect(after.length).toBe(before.length);
  });
});