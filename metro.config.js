const {
  withStorybook,
} = require('@storybook/react-native/withStorybook');

const { getDefaultConfig } = require("@expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts = [...config.resolver.sourceExts, "cjs", "web.js", "web.ts", "web.tsx"];
// Allow .riv files to be bundled as assets (required for rive-react-native)
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), "riv"];

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
    // ws — WebSocket client lib; leaked into bundle via supabaseServer
    /\/node_modules\/ws\//,
    /\/node_modules\/ws$/, // bare import: require('ws')
    // Node stdlib — unavailable or broken in React Native
    /\/node_modules\/stream\/index\.js$/, // require('stream')
    /\/node_modules\/buffer\/index\.js$/, // require('buffer')
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
module.exports = withStorybook(withNativeWind(config, {
    input: "./global.css",
}));
