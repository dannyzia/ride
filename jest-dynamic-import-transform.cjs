/**
 * Jest transformer wrapper — keeps every file on jest-expo's babel-jest pipeline,
 * but pre-rewrites dynamic `await import(...)` to `require(...)` for exactly one
 * file: utils-server/scheduler.ts.
 *
 * WHY: scheduler job bodies (46–56) resolve their runtime seams with `await import()`.
 * Under jest's CJS VM (Node ≥ 22, jest without --experimental-vm-modules) those
 * imports throw ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG, which each job's
 * try/catch swallows — making every dynamic-import job untestable (its body never
 * executes). Rewriting to require() keeps the imports INSIDE jest's module
 * registry, so test mocks and production code share one module identity — the
 * same guarantee static imports already have.
 *
 * Scoped to scheduler.ts deliberately: a global rewrite would mask real ESM
 * behavior elsewhere. Everything else delegates untouched to the preset's
 * babel-jest (caller: metro/ios — identical to jest-expo's preset entry).
 */
const path = require("path");

const babelJestModule = require("babel-jest");
const babelJest = babelJestModule.default ?? babelJestModule;

// Same transformer config jest-expo's preset passes to babel-jest.
const delegate = babelJest.createTransformer({
  caller: { name: "metro", bundler: "metro", platform: "ios" },
});

const TARGET = "utils-server/scheduler.ts";

function rewriteDynamicImports(sourceText, sourcePath) {
  const babel = require("@babel/core");
  const t = require("@babel/types");

  const dynamicImportToRequire = {
    visitor: {
      CallExpression(callPath) {
        if (callPath.node.callee.type === "Import") {
          callPath.replaceWith(
            t.callExpression(t.identifier("require"), callPath.node.arguments),
          );
        }
      },
    },
  };

  const result = babel.transformSync(sourceText, {
    filename: sourcePath,
    babelrc: false,
    configFile: false, // this visitor IS the pass-1 config; do not load babel.config.js
    parserOpts: { plugins: ["typescript"] },
    plugins: [dynamicImportToRequire],
  });
  return result.code ?? sourceText;
}

module.exports = {
  process(sourceText, sourcePath, options) {
    const normalized = sourcePath.split(path.sep).join("/");
    const text = normalized.endsWith(TARGET)
      ? rewriteDynamicImports(sourceText, sourcePath)
      : sourceText;
    return delegate.process(text, sourcePath, options);
  },
  getCacheKey(fileData, filePath, configString, options) {
    return delegate.getCacheKey(fileData, filePath, configString, options);
  },
};
