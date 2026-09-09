/**
 * Marketplace test-lane jest overrides.
 *
 * Extends jest-expo with a scoped transformer: utils-server/scheduler.ts gets
 * dynamic import() → require() so its inline job bodies (await import seams,
 * lines 2293–2688) can execute under jest's CJS VM. See
 * jest-dynamic-import-transform.cjs for the rationale. The preset +
 * testPathIgnorePatterns moved here from package.json's `jest` key (jest
 * forbids implicit multi-config; package.json.backup-jest-key.json preserves
 * the original key contents).
 */
const expoPreset = require("jest-expo/jest-preset.js");

module.exports = {
  ...expoPreset,
  preset: undefined,
  testPathIgnorePatterns: ["/_reference/", "/node_modules/", "/admin-test-results/"],
  transform: {
    ...expoPreset.transform,
    "\\.[jt]sx?$": "<rootDir>/jest-dynamic-import-transform.cjs",
  },
};
