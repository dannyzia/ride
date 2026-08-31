/**
 * Pre-graph polyfill entry.
 *
 * Loaded first by the React Native runtime (via package.json "main"). We
 * install the utf-16le TextDecoder shim BEFORE expo-router/entry evaluates
 * any app module — so by the time h3-js (transitively required by Map.tsx)
 * runs its `new TextDecoder("utf-16le")` at module scope, the patched
 * decoder is already in place.
 *
 * Why this is necessary: an import from `app/_layout.tsx` is not enough —
 * expo-router's eager route-module evaluation (require.context on app/)
 * evaluates route files that depend on h3-js, and a side-effect import
 * declared in a non-initial module is not guaranteed to run first. The
 * explicit `.install()` call here runs synchronously at the very top of
 * the process and is DCE-proof because the result is observed.
 */
require("./shims/textDecoder").install();
require("expo-router/entry");
