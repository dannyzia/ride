#!/usr/bin/env node
// Production server entry point for Render.
// Render requires "node server.js" but Expo's production server is "npx expo serve".
// This wrapper delegates to Expo's serve command.

const { execSync } = require("child_process");

const port = process.env.PORT || "10000";

console.log(`Starting Ride API server on port ${port}...`);

try {
  execSync(`npx expo serve --port ${port}`, {
    stdio: "inherit",
    env: { ...process.env },
  });
} catch (err) {
  console.error("Server failed to start:", err.message);
  process.exit(1);
}
