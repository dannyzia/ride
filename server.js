#!/usr/bin/env node
// Production server entry point for Render.
// Serves the Expo SSR web output directly using @expo/server's createRequestHandler.

const path = require("path");
const fs = require("fs");
const http = require("http");
const { createRequestHandler } = require("@expo/server");

const port = process.env.PORT || "10000";
const distFolder = path.join(__dirname, "dist", "server");

// Force IPv4 DNS resolution — Render blocks IPv6 outbound.
const nodeOptions = (process.env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first";
process.env.NODE_OPTIONS = nodeOptions;

console.log(`Starting Ride API server on port ${port}...`);
console.log(`Serving from: ${distFolder}`);

const handler = createRequestHandler(distFolder);

const server = http.createServer(async (req, res) => {
  try {
    // Log incoming request details
    console.log(`Incoming request: ${req.method} ${req.url}`);
    
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
