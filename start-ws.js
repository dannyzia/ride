#!/usr/bin/env node
// Production entry point for the utils-server WebSocket server on Render.
// Uses tsx to run TypeScript directly (utils-server has no compile step).

const { execSync } = require("child_process");
const path = require("path");

const entry = path.join(__dirname, "utils-server", "index.ts");
const tsx = path.join(__dirname, "utils-server", "node_modules", ".bin", "tsx");

// Render provides PORT (e.g. 10000). The utils-server reads UTILS_SERVER_PORT.
// If UTILS_SERVER_PORT isn't set, inherit from Render's PORT.
const env = { ...process.env };
if (!env.UTILS_SERVER_PORT && env.PORT) {
  env.UTILS_SERVER_PORT = env.PORT;
}

console.log(
  `Starting Ride WebSocket server on port ${env.UTILS_SERVER_PORT || 3001}...`,
);

try {
  execSync(`"${tsx}" "${entry}"`, {
    cwd: __dirname,
    stdio: "inherit",
    env,
  });
} catch (err) {
  console.error("WebSocket server failed:", err.message);
  process.exit(1);
}
