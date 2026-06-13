#!/usr/bin/env node
// Production server entry point for Render.
// Serves the Expo SSR web output.
// 1. Static assets (JS/CSS/images) from dist/client/
// 2. Pre-rendered HTML and API routes via @expo/server createRequestHandler

const path = require("path");
const fs = require("fs");
const http = require("http");
const { createRequestHandler } = require("@expo/server");

const port = process.env.PORT || "10000";
const projectRoot = __dirname;
const distFolder = path.join(projectRoot, "dist", "server");
const clientFolder = path.join(projectRoot, "dist", "client");

// Force IPv4 DNS resolution — Render blocks IPv6 outbound.
const nodeOptions = (process.env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first";
process.env.NODE_OPTIONS = nodeOptions;

// ─────────────────────────────────────────────────────────────
// MIME type lookup for static file serving
// ─────────────────────────────────────────────────────────────
const MIME_TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ─────────────────────────────────────────────────────────────
// Static file serving from dist/client/
//
// The @expo/server createRequestHandler only handles HTML routes,
// API routes, and 404 routes. It does NOT serve static assets
// (JS bundles, CSS, images, fonts). Without this, browser requests
// for /_expo/static/js/web/entry-*.js fall through to the catch-all
// 404 route and receive HTML instead of JavaScript, causing a blank
// page (the React app never hydrates).
// ─────────────────────────────────────────────────────────────
function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);

  // Prevent path traversal — reject any path that escapes the client folder
  const resolvedPath = path.resolve(clientFolder, pathname.slice(1));
  if (!resolvedPath.startsWith(clientFolder)) {
    return false;
  }

  // If the path is a directory, try index.html inside it
  let filePath = resolvedPath;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    // File doesn't exist — not a static asset
    return false;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const mimeType = getMimeType(filePath);
  const fileContent = fs.readFileSync(filePath);

  res.statusCode = 200;
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.end(fileContent);
  return true;
}

console.log(`Starting Ride API server on port ${port}...`);
console.log(`Serving SSR from: ${distFolder}`);
console.log(`Serving static from: ${clientFolder}`);

const handler = createRequestHandler(distFolder);

const server = http.createServer(async (req, res) => {
  try {
    // Step 1: Try to serve static files (JS, CSS, images, fonts, etc.)
    // This MUST come before the route handler because createRequestHandler
    // does not serve static assets.
    if (serveStatic(req, res)) {
      return;
    }

    // Step 2: Handle HTML routes, API routes, and 404 via @expo/server
    console.log(`Route request: ${req.method} ${req.url}`);

    // Construct full URL from request
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${port}`;
    const fullUrl = `${protocol}://${host}${req.url}`;

    // Create Web Request object
    const webRequest = new Request(fullUrl, {
      method: req.method,
      headers: new Headers(req.headers),
    });

    const response = await handler(webRequest);

    res.statusCode = response.status;
    for (const [key, value] of response.headers.entries()) {
      res.setHeader(key, value);
    }
    const body = await response.text();
    res.end(body);
  } catch (err) {
    console.error("Request error:", err);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});
