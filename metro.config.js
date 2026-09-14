const {
  withStorybook,
} = require('@storybook/react-native/withStorybook');

const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs", "web.js", "web.ts", "web.tsx"];

// ─────────────────────────────────────────────────────────────
// Blocklist: Node-only modules that must NEVER appear in the
// client bundle. Metro throws a clear error at bundle time if
// any client-reachable file transitively imports these.
//
// If you hit this blocklist, either:
//   1. Move the import to server-only code (app/api/*)
//   2. Use `import type` (Babel erases it — zero runtime dep)
//   3. Create a .web.ts platform-split (see maplibreLoader.web.ts)
//
// Keep in sync with scripts/check-web-imports.js NODE_ONLY list.
// ─────────────────────────────────────────────────────────────
const NODE_BLOCKLIST = [
    // ws is NOT unconditionally blocked here — see resolver.resolveRequest
    // below. lib/supabaseServer.ts is a documented, legitimate server-only
    // exception (kept in sync with SERVER_ONLY in scripts/check-web-imports.js).
    // A blanket regex block here would also break the λ (API route) bundle,
    // which legitimately needs ws — that's what caused the 2026-09-08/09-10
    // Render build failures.
    // Node stdlib — unavailable or broken in React Native.
    // NOTE: only the bare 'node:buffer' protocol import is blocked. The
    // USERLAND buffer@5 npm polyfill (require('buffer/') from
    // whatwg-url-without-unicode, pulled transitively by expo →
    // react-native-url-polyfill) bundles fine on RN and MUST NOT be
    // blocklisted — blocking its real entry (index.js) made the EAS
    // EAGER_BUNDLE fail with "main module field could not be resolved"
    // (build 65877413). Same class of bug as the blanket ws regex above.
    /\/node_modules\/stream\/index\.js$/, // require('stream') — no userland stream polyfill in the graph
    /\/node_modules\/node:stream\//,
    /\/node_modules\/node:buffer\//,
    /\/node_modules\/node:fs\//,
    /\/node_modules\/node:crypto\//,
    /\/node_modules\/node:net\//,
    /\/node_modules\/node:http\//,
    /\/node_modules\/node:https\//,
    /\/node_modules\/node:child_process\//,
    /\/node_modules\/node:dns\//,
    /\/node_modules\/node:http2\//,
    /\/node_modules\/node:tls\//,
    /\/node_modules\/node:dgram\//,
    /\/node_modules\/node:cluster\//,
    /\/node_modules\/node:worker_threads\//,
];
const existing = config.resolver.blockList;
config.resolver.blockList = [
    ...(Array.isArray(existing) ? existing : existing ? Array.from(existing) : []),
    ...NODE_BLOCKLIST,
    // Exclude test files — Jest runs them in Node, but Metro should never
    // bundle them into the client. __tests__ dirs contain Node-only imports
    // (fs, path, jest mocks) that would break the React Native bundle.
    /\/__tests__\//,
    /\.test\.[jt]sx?$/,
    /\.spec\.[jt]sx?$/,
];

config.resolver.alias = {
    "react-native-maps": path.resolve(__dirname, "mocks/react-native-maps.js"),
    // "@stripe/stripe-react-native": path.resolve(__dirname, "mocks/empty.js"),
    "react-native/Libraries/Utilities/codegenNativeCommands": path.resolve(__dirname, "mocks/empty.js"),
};

// ─────────────────────────────────────────────────────────────
// ws exception: blocked everywhere EXCEPT the one documented
// server-only origin (kept in sync with SERVER_ONLY in
// scripts/check-web-imports.js). Plain regex blockList can't be
// conditioned on the importing file, so this uses resolveRequest
// instead. Any other origin importing 'ws' still hard-fails, same
// as before.
// ─────────────────────────────────────────────────────────────
const { resolve: metroResolve } = require("metro-resolver");
const WS_ALLOWED_ORIGINS = [
    path.resolve(__dirname, "lib/supabaseServer.ts"),
];
const previousResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "ws" && !WS_ALLOWED_ORIGINS.includes(context.originModulePath)) {
        throw new Error(
            `Blocked: 'ws' is Node-only and must not be imported from ${context.originModulePath}. ` +
            `Move the import to a server-only file (see lib/supabaseServer.ts) or use 'import type'.`
        );
    }
    if (previousResolveRequest) {
        return previousResolveRequest(context, moduleName, platform);
    }
    return metroResolve(context, moduleName, platform);
};

// EAS build workers: the eager-bundle (export:embed) Node process must fit
// INSIDE the medium resource class (~8 GB RAM total, shared with Metro
// transformer workers). An 8GB old-space cap let V8 balloon until the
// container OOM'd (EAS builds 65877413/b1360ce3/b0a68d74). 2560 MB is
// verified sufficient locally, cold-cache (133s, 9.79 MB hbc, 2493 modules).
// Same failure class as the buffer blocklist: default-worker OOM, not graph bloat.
if (process.env.EAS_BUILD) {
    config.transformer.maxWorkers = 2;
}

module.exports = withStorybook(withNativeWind(config, {
    input: "./global.css",
}));
