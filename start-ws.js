#!/usr/bin/env node
// Production entry point for the utils-server WebSocket server on Render.
// Uses tsx to run TypeScript directly (utils-server has no compile step).

const { execSync } = require("child_process");
const path = require("path");

const entry = path.join(__dirname, "utils-server", "index.ts");
const tsx = path.join(__dirname, "utils-server", "node_modules", ".bin", "tsx");

// On Render, the service MUST listen on the PORT Render provides.
// Override UTILS_SERVER_PORT with Render's PORT when available.
// Force IPv4 DNS resolution — Render blocks IPv6 outbound, and the
// postgres npm package resolves to IPv6 by default.
const env = { ...process.env };
if (env.PORT) {
  env.UTILS_SERVER_PORT = env.PORT;
}
env.NODE_OPTIONS = (env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first";

// Debug: print DATABASE_URL with password masked
const dbUrl = env.DATABASE_URL || "(not set)";
const masked = dbUrl.replace(/:([^@]+)@/, ":****@");
console.log(`DATABASE_URL: ${masked}`);

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
