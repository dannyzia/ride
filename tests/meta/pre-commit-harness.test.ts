/**
 * tests/meta/pre-commit-harness.test.ts
 *
 * Keeps scripts/pre-commit-harness.cjs honest about the hook it drives.
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
import { GATES, TOOL_FILES } from "../../scripts/pre-commit-harness.cjs";

const HOOK_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../scripts/git-hooks/pre-commit"),
  "utf8"
);

/** The stage banners the hook prints, in order. */
const HOOK_BANNERS = [...HOOK_SRC.matchAll(/echo "⏳ Pre-commit: (.*?)\.\.\."/g)].map((m) => m[1]);
/** The "stage skipped" lines — none of these may contain a ran-marker. */
const HOOK_SKIP_LINES = HOOK_SRC.split("\n").filter((l) => l.includes("skipping") || l.includes("No staged"));

describe("pre-commit harness ↔ hook consistency", () => {
  it("drives exactly the stages the hook has", () => {
    // Guards the harness against the hook growing a stage nobody proves.
    expect(GATES.map((g) => g.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(HOOK_BANNERS).toHaveLength(GATES.length);
  });

  it("has a case for both directions on every gate", () => {
    // A gate with only a block case is never shown to pass; one with only a pass
    // case is never shown to block. Either way the harness proves less than it
    // appears to, and `12/12 cases` would still read as a green result.
    for (const g of GATES) {
      const expectations = (g.cases as { expect: string }[]).map((c) => c.expect).sort();
      expect({ gate: g.n, expectations }).toEqual({ gate: g.n, expectations: ["block", "pass"] });
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
  });
});