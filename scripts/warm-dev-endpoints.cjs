#!/usr/bin/env node
/**
 * ISSUE-113 (dev-client load reliability) — Metro endpoint warm-up.
 *
 * WHY THIS EXISTS (measured on the dev machine, 2026-11-13):
 *   Metro's dev-client manifest endpoint (GET /?platform=android) answers in
 *   ~64-105s COLD (Metro server init + entry-graph resolution + OS file
 *   cache — the worktree path is deeply nested and un-watched), and the JS
 *   bundle builds in ~103s cold (19 MB through the transform pipeline).
 *   Both blow past the expo-dev-client's ~10-30s OkHttp timeout, so the
 *   FIRST dev-client load after `expo start` aborts before the app even
 *   boots (the runtime acceptance trace kept failing for this reason — the
 *   app itself is fine). After warm-up: manifest ~2.7s steady, bundle ~0.4s.
 *
 * RUN THIS after `npx expo start` (and after dev-env-sync) and BEFORE any
 * device/dev-client run. It fetches the manifest and bundle endpoints,
 * prints cold + warm timings, and exits non-zero if either endpoint fails.
 *
 * Usage: node scripts/warm-dev-endpoints.cjs [--port 8081] [--host localhost]
 * Optional: --skip-bundle (manifest only — the bundle warm-up costs ~100s
 * cold; run it at least once per Metro lifetime).
 */
const http = require("http");

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}
function hasFlag(name) {
  return args.includes(name);
}

const PORT = argValue("--port", "8081");
const HOST = argValue("--host", "localhost");
const SKIP_BUNDLE = hasFlag("--skip-bundle");

const MANIFEST_URL = `http://${HOST}:${PORT}/?platform=android`;
// The dev-client's own bundle request (expo-router entry, Android, dev mode).
const BUNDLE_URL = `http://${HOST}:${PORT}/node_modules/expo-router/entry.bundle?platform=android&dev=true&lazy=true`;

// Measured cold ceilings + margin: manifest ~105s, bundle ~180s worst.
const MANIFEST_TIMEOUT_MS = 240000;
const BUNDLE_TIMEOUT_MS = 420000;
const WARM_TIMEOUT_MS = 60000;

function fetchTimed(url, timeoutMs) {
  return new Promise((resolve) => {
    const started = Date.now();
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume(); // drain the body — timing includes full transfer
      res.on("end", () => finish({ ms: Date.now() - started, status: res.statusCode }));
      res.on("error", () => finish({ ms: Date.now() - started, status: res.statusCode, error: true }));
    });
    req.on("timeout", () => {
      req.destroy(new Error(`timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) =>
      finish({ ms: Date.now() - started, error: true, message: err.message }),
    );
  });
}

function fmt(result) {
  const label = result.error ? `ERROR (${result.message ?? "request failed"})` : `HTTP ${result.status}`;
  return `${label} in ${(result.ms / 1000).toFixed(1)}s`;
}

(async () => {
  console.log(`[warm-dev] target: http://${HOST}:${PORT}`);
  console.log(`[warm-dev] manifest cold: fetching ${MANIFEST_URL}`);
  const manifestCold = await fetchTimed(MANIFEST_URL, MANIFEST_TIMEOUT_MS);
  console.log(`[warm-dev] manifest cold:  ${fmt(manifestCold)}`);

  let bundleCold = null;
  let bundleWarm = null;
  if (!SKIP_BUNDLE) {
    console.log(`[warm-dev] bundle cold: fetching ${BUNDLE_URL}`);
    console.log("[warm-dev] (first build can take 100s+ on this machine — this is the warm-up's job)");
    bundleCold = await fetchTimed(BUNDLE_URL, BUNDLE_TIMEOUT_MS);
    console.log(`[warm-dev] bundle cold:   ${fmt(bundleCold)}`);
    bundleWarm = await fetchTimed(BUNDLE_URL, WARM_TIMEOUT_MS);
    console.log(`[warm-dev] bundle warm:   ${fmt(bundleWarm)}`);
  }

  const manifestWarm = await fetchTimed(MANIFEST_URL, WARM_TIMEOUT_MS);
  console.log(`[warm-dev] manifest warm: ${fmt(manifestWarm)}`);

  const manifestOk = manifestCold.status === 200 && manifestWarm.status === 200 && !manifestWarm.error;
  const bundleOk = SKIP_BUNDLE || (bundleCold !== null && bundleCold.status === 200 && bundleWarm !== null && !bundleWarm.error);

  if (manifestOk && bundleOk) {
    console.log("[warm-dev] endpoints warm — the dev-client can load within its OkHttp budget. Run the device now.");
    process.exit(0);
  }
  console.log("[warm-dev] FAILED to warm the endpoints — check Metro (npx expo start) before the device run.");
  process.exit(1);
})();