/**
 * Marketplace test-lane jest overrides.
 *
 * Extends jest-expo with a scoped transformer: utils-server/scheduler.ts gets
 * dynamic import() → require() so its inline job bodies (await import seams,
 * lines 2293–2688) can execute under jest's CJS VM. See
 * jest-dynamic-import-transform.cjs for the rationale. The preset +
 * testPathIgnorePatterns moved here from package.json's `jest` key (jest
 * forbids implicit multi-config (the original package.json `jest` key was
 * folded into this file; git history holds the pre-config state).
 */
const expoPreset = require("jest-expo/jest-preset.js");

module.exports = {
  ...expoPreset,
  preset: undefined,
  // /tests/e2e/ belongs to the Playwright admin lane (A6) — jest must never
  // claim those specs (they import @playwright/test, not jest).
  testPathIgnorePatterns: [
    "/_reference/",
    "/node_modules/",
    "/admin-test-results/",
    // Anchored to <rootDir> so the pattern matches only THIS project root's
    // .kilo dir (plans/scratch, no tests). An unanchored "/.kilo/" also
    // matched git worktrees nested under <mainRoot>/.kilo/worktrees/, which
    // ignored every test file when jest ran inside such a worktree.
    "<rootDir>/.kilo/",
    "/tests/e2e/",
    "<rootDir>/website/",
  ],
  transform: {
    ...expoPreset.transform,
    "\\.[jt]sx?$": "<rootDir>/jest-dynamic-import-transform.cjs",
  },
};
