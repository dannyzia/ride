#!/usr/bin/env node
// Production server entry point for Render.
// Serves the Expo SSR web output directly using @expo/server's createRequestHandler.

const path = require("path");
const { createRequestHandler } = require("@expo/server");

const port = process.env.PORT || "10000";
const distFolder = path.join(__dirname, "dist", "server");

// Force IPv4 DNS resolution — Render blocks IPv6 outbound.
const nodeOptions = (process.env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first";
process.env.NODE_OPTIONS = nodeOptions;

console.log(`Starting Ride API server on port ${port}...`);
console.log(`Serving from: ${distFolder}`);

const handler = createRequestHandler(distFolder);

const http = require("http");

const server = http.createServer(async (req, res) => {
  try {
    // Rewrite /admin to /(admin) for route group compatibility.
    // We must construct a full URL for the Request because @expo/server's
    // updateRequestWithConfig calls new URL(request.url) without a base,
    // which fails on paths containing parentheses like /(admin).
    let urlPath = req.url;
    if (urlPath === "/admin" || urlPath.startsWith("/admin?")) {
      urlPath = urlPath.replace(/^\/admin/, "/(admin)");
    }

    // Build a full URL so @expo/server can parse it correctly
    const fullUrl = `http://localhost:${port}${urlPath}`;
    const request = new Request(fullUrl, {
      method: req.method,
      headers: req.headers,
    });

    const response = await handler(request);

    res.statusCode = response.status;
    const headers = response.headers;
    for (const [key, value] of headers.entries()) {
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
