/**
 * tests/meta/pre-commit-harness.test.ts
 *
 * Keeps scripts/pre-commit-harness.cjs honest about the hooks it drives —
 * pre-commit's gate table and pre-push's exit-path table.
 *
 * WHY THIS FILE EXISTS: the harness asserts on STRINGS the hook prints — a
 * blocking banner and a "this stage actually ran" marker. Those two strings are
 * exactly the kind of thing that rots: rename a banner, reword a skip message,
 * and every block case starts failing for the wrong reason (or, worse, a pass
 * case starts passing because the marker turned up in the SKIP line, which
 * would make a gate that never executed look green).
 *
 * The harness itself is the slow, authoritative proof (~4 min, runs the real
 * hook end to end) and is opt-in. These assertions are the fast ones that belong
 * in the normal suite: they need no worktree and no commit, so a drift is caught
 * the moment it is introduced rather than the next time somebody remembers to
 * run the harness.
 */
import fs from "fs";
import path from "path";
import {
  GATES,
  TOOL_FILES,
  CORPUS_DIRS,
  CORPUS_FILES,
  PUSH_GATES,
  prePushStdin,
} from "../../scripts/pre-commit-harness.cjs";

const HOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../scripts/git-hooks/pre-commit"),
  "utf8"
);

const PUSH_HOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../scripts/git-hooks/pre-push"),
  "utf8"
);

/** The stage banners the hook prints, in order. */
const HOOK_BANNERS = [...HOOK_SRC.matchAll(/echo "⏳ Pre-commit: (.*?)\.\.\."/g)].map((m) => m[1]);
/** The "stage skipped" lines — none of these may contain a ran-marker. */
const HOOK_SKIP_LINES = HOOK_SRC.split("\n").filter((l) => l.includes("skipping") || l.includes("No staged"));

/** The pre-push table, viewed through the fields these guards read. */
interface PushGate {
  n: number;
  key: string;
  blockBanner: string | string[];
  blockAlso?: string[];
  cases: { name: string; expect: string }[];
}

const PUSH = PUSH_GATES as unknown as PushGate[];

/** `blockBanner` is any-of, so one exit site can list both of its branches. */
const asBanners = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

describe("pre-commit harness ↔ hook consistency", () => {
  it("drives exactly the stages the hook has", () => {
    // Guards the harness against the hook growing a stage nobody proves.
    // Stage 6 (testID flow currency) was added on 2026-10-03; the guard caught the
    // hook gaining a stage before the harness had a case for it, which is exactly
    // its job. Do NOT relax this to a range or a length comparison.
    // Stage 7 (i18n orphan) was inserted on 2026-10-05 ahead of ShellCheck so
    // eslint stays last; the two trailing gates moved 7->8 and 8->9.
    expect(GATES.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(HOOK_BANNERS).toContain("lint staged files");
    expect(HOOK_BANNERS.length).toBeGreaterThan(0);
  });

  it("has a case for both directions on every gate", () => {
    // A gate with only a block case is never shown to pass; one with only a pass
    // case is never shown to block. Either way the harness proves less than it
    // appears to, and `12/12 cases` would still read as a green result.
    //
    // The invariant is "BOTH directions present", NOT "exactly one of each".
    // Gate 3 gained a second BLOCK case on 2026-10-03 when dead-copy was promoted
    // from advisory to blocking, and the previous exact-equality form failed it.
    // Multiple cases in the same direction are strictly MORE coverage, so the
    // assertion is restated rather than loosened: a missing direction still
    // fails here, which is the property that was being protected.
    for (const g of GATES) {
      const expectations = (g.cases as { expect: string }[]).map((c) => c.expect);
      expect({
        gate: g.n,
        hasBlock: expectations.includes("block"),
        hasPass: expectations.includes("pass"),
      }).toEqual({ gate: g.n, hasBlock: true, hasPass: true });
    }
  });

  it("uses a blocking banner the hook really prints", () => {
    // THE drift guard. If this fails after editing a gate's message, copy the
    // new wording into the harness — do not loosen the assertion.
    for (const g of GATES) {
      expect({ gate: g.n, banner: HOOK_SRC.includes(g.blockBanner) }).toEqual({
        gate: g.n,
        banner: true,
      });
    }
  });

  it("uses a ran-marker that no skip message can produce", () => {
    // Anti-vacuity. If a marker's text leaks into a "skipping ..." line, a pass
    // case would go green against a stage that never executed — which is exactly
    // how this harness would report a green pipeline for an empty commit.
    for (const g of GATES) {
      const leaked = HOOK_SKIP_LINES.filter((l) => l.includes(g.ranMarker));
      expect({ gate: g.n, leaked: leaked.length }).toEqual({ gate: g.n, leaked: 0 });
    }
  });

  it("copies gate tools that all exist in the repo", () => {
    // The harness stages these into its worktree so it tests the WORKING TREE's
    // gates. A path that has moved would silently not be copied, and the run
    // would quietly fall back to testing the base commit.
    for (const rel of TOOL_FILES as string[]) {
      expect(fs.existsSync(path.resolve(__dirname, "../..", rel))).toBe(true);
    }
    // The same anti-rot guard over the CORPUS overlay (what the gates SCAN):
    // a moved directory would silently stop being overlaid, the worktree would
    // pair working-tree gates with base-commit corpus content, and gate 3
    // would report findings that exist in neither consistent state.
    for (const rel of CORPUS_DIRS as string[]) {
      expect({ rel, dir: fs.statSync(path.resolve(__dirname, "../..", rel)).isDirectory() }).toEqual({
        rel,
        dir: true,
      });
    }
    for (const rel of CORPUS_FILES as string[]) {
      expect(fs.existsSync(path.resolve(__dirname, "../..", rel))).toBe(true);
    }
    // --push depends on these being staged too: without them the run would test
    // the base commit's hook and could skip the working tree's import checker.
    const normalized = (TOOL_FILES as string[]).map((p) => p.replace(/\\/g, "/"));
    expect(normalized).toContain("scripts/git-hooks/pre-push");
    expect(normalized).toContain("scripts/check-web-imports.js");
    // Gate 3 scans ALL flows and resolves their selectors against the map —
    // both must ride the corpus overlay or its pass case blocks on stale
    // base-commit findings the working tree already fixed.
    expect((CORPUS_DIRS as string[]).map((p) => p.replace(/\\/g, "/"))).toContain("maestro/flows");
    expect((CORPUS_FILES as string[]).map((p) => p.replace(/\\/g, "/"))).toContain(
      "maestro/tools/testid-map.json"
    );
  });
});

/**
 * The same guard set, for the other hook. scripts/git-hooks/pre-push has four
 * `exit 1` sites and --push grows one case per site; its banners and the marker
 * each late exit sits behind are strings that rot exactly like pre-commit's.
 */
describe("pre-push harness ↔ hook consistency", () => {
  it("drives exactly the exit paths the hook has", () => {
    // Four `exit 1` sites today. A fifth would be an unproven block; a removal
    // would leave a case asserting a banner the hook can no longer print. Do NOT
    // relax this to a range or a length comparison.
    expect(PUSH.map((g) => g.n)).toEqual([1, 2, 3, 4]);
    const exitSites = PUSH_HOOK_SRC.match(/^\s*exit 1\s*$/gm) ?? [];
    expect(exitSites).toHaveLength(PUSH.length);
  });

  it("has a block case for every exit path", () => {
    // The pass direction for pre-push is the baseline, not a per-gate case, so
    // the invariant here is only "every exit path is proven to block".
    for (const g of PUSH) {
      const expectations = g.cases.map((c) => c.expect);
      expect({ gate: g.n, hasBlock: expectations.includes("block") }).toEqual({ gate: g.n, hasBlock: true });
    }
  });

  it("uses a blocking banner the pre-push hook really prints", () => {
    // THE drift guard, same contract as the pre-commit one: if a case fails
    // after editing a message, copy the new wording into PUSH_GATES.
    for (const g of PUSH) {
      for (const banner of asBanners(g.blockBanner)) {
        expect({ gate: g.n, banner, found: PUSH_HOOK_SRC.includes(banner) }).toEqual({
          gate: g.n,
          banner,
          found: true,
        });
      }
    }
  });

  it("guards the earlier-stage marker the late exit paths sit behind", () => {
    // Exits 3 and 4 are only reachable after a green type check, and their
    // harness cases require its success marker so a stage reorder fails the
    // harness instead of letting those cases prove the wrong path.
    const behindTsc = PUSH.filter((g) => (g.blockAlso ?? []).includes("✅ Type check passed."));
    expect(behindTsc.map((g) => g.n)).toEqual([3, 4]);
    for (const g of behindTsc) {
      for (const marker of g.blockAlso ?? []) {
        expect(PUSH_HOOK_SRC.includes(marker)).toBe(true);
      }
    }
  });

  it("feeds the hook git's ref-list line on stdin", () => {
    // `<local ref> SP <local oid> SP <remote ref> SP <remote oid>`
    const line = prePushStdin("a".repeat(40));
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trim().split(/\s+/)).toEqual([
      "refs/heads/harness",
      "a".repeat(40),
      "refs/heads/harness",
      "a".repeat(40),
    ]);
  });
});