#!/usr/bin/env node
/**
 * check-web-imports.js — Validates that no native-only modules are imported
 * in the web route graph.
 *
 * Packages WITHOUT .web.js files in their build directory are flagged as
 * risky. Packages with .web.js or .web.ts files are considered safe.
 *
 * Usage:
 *   node scripts/check-web-imports.js
 *   (or: npm run check:web-imports)
 *
 * Exit code: 0 = safe, 1 = risky imports found.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// Native packages that are known-safe (have .web.js or Expo Module polyfills).
// Add to this list after verifying web support.
const KNOWN_SAFE = new Set([
  "expo-router",
  "expo-font",
  "expo-splash-screen",
  "expo-constants",
  "expo-status-bar",
  "expo-notifications",
  "expo-application",
  "expo-location",
  "expo-image-picker",
  "expo-haptics",
  "expo-crypto",
  "expo-device",
  "expo-secure-store",
  "expo-file-system",
  "expo-clipboard",
  "expo-linking",
  "expo-web-browser",
  "react-native-gesture-handler",
  "react-native-reanimated",
  "react-native-safe-area-context",
  "react-native-screens",
  "react-native-svg",
  "react-native-paper",
  "react-native-modal",
  "react-native-progress",
  "react-native-ratings",
  "react-native-swiper",
  "react-native-keyboard-controller",
  "react-native-get-random-values",
  "react-native-async-storage/async-storage",
  "@react-native-async-storage/async-storage",
  "@react-native-community/netinfo",
  "@gorhom/bottom-sheet",
  "@turf/turf",
  "lottie-react-native",
  "nativewind",
  "tailwindcss",
  "h3-js",
  "zod",
  "zustand",
  "react-native-gifted-chat", // has Platform.OS checks, works on web
  "react-native-webview", // renders "not supported" fallback on web (safe)
  "i18next",
  "react-i18next",
  "@supabase/supabase-js",
  "drizzle-orm",
  "pg",
  "postgres",
  "jsonwebtoken",
  "barikoiapis",
  "@mapbox/polyline",
]);

// Packages known to lack web support (need .web.ts stubs or platform guards).
// @maplibre/maplibre-react-native is handled by utils/maplibreLoader.web.ts
const NATIVE_ONLY = new Set([]);

// Node-only packages that must NEVER appear in client-reachable code.
// These cause Metro UnableToResolveError (e.g. ws → stream).
// Keep in sync with metro.config.js NODE_BLOCKLIST.
const NODE_ONLY = new Set([
  "ws",
  "stream",
  "buffer",
  "fs",
  "path",
  "crypto",
  "net",
  "tls",
  "http",
  "https",
  "child_process",
  "dns",
  "http2",
  "dgram",
  "cluster",
  "worker_threads",
]);

function findNativeImports() {
  const SEARCH_DIRS = ["app", "components", "lib", "store", "utils"];
  const IMPORT_RE = /from\s+["']([^"']+)["']/g;
  const NATIVE_PKG_RE = /^(react-native-|@maplibre|expo-(?!router|font|splash-screen|constants|status-bar|crypto))/;
  const imports = [];

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walkDir(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        scanFile(fullPath);
      }
    }
  }

  function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      let match;
      IMPORT_RE.lastIndex = 0;
      while ((match = IMPORT_RE.exec(lines[i])) !== null) {
        const pkg = match[1];
        const pkgName = pkg.startsWith("@")
          ? pkg.split("/").slice(0, 2).join("/")
          : pkg.split("/")[0];
        if (NATIVE_PKG_RE.test(pkgName)) {
          imports.push({
            file: path.relative(ROOT, filePath),
            line: String(i + 1),
            package: pkgName,
          });
        }
      }
    }
  }

  for (const dir of SEARCH_DIRS) {
    walkDir(path.join(ROOT, dir));
  }
  return imports;
}

function hasWebSupport(pkgName) {
  const pkgDir = path.join(ROOT, "node_modules", pkgName);
  if (!fs.existsSync(pkgDir)) return true;

  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return true;

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

    // Expo Modules API: only .d.ts files = has web polyfill
    const buildDir = path.join(pkgDir, "build");
    if (fs.existsSync(buildDir)) {
      const files = fs.readdirSync(buildDir);
      if (files.length > 0 && files.every((f) => f.endsWith(".d.ts") || f.endsWith(".d.ts.map"))) {
        return true;
      }
    }

    // Check for .web.js or .web.ts files in build/src/lib directories
    const checkDirs = ["build", "src", "lib/module", "lib/commonjs"];
    for (const dir of checkDirs) {
      const dirPath = path.join(pkgDir, dir);
      if (!fs.existsSync(dirPath)) continue;
      const files = fs.readdirSync(dirPath);
      if (files.some((f) => f.includes(".web."))) return true;
    }

    return false;
  } catch {
    return true;
  }
}

function findNodeOnlyImports() {
  const SEARCH_DIRS = ["app", "components", "lib", "store", "utils"];
  const IMPORT_RE = /from\s+["']([^"']+)["']/g;
  const imports = [];

  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        walkDir(fullPath);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
        scanFile(fullPath);
      }
    }
  }

  function scanFile(filePath) {
    // Skip test files — not bundled into client
    if (filePath.includes("__tests__") || filePath.includes(".test.")) return;
    // Skip +api.ts files — server-only, not in client bundle
    if (filePath.includes("+api.ts")) return;
    // Skip known server-only files in lib/ (only imported by API routes)
    const rel = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const SERVER_ONLY = [
      "lib/portpos.ts",
      "lib/supabaseServer.ts",
      "lib/adminRbac.ts",
      "lib/auth.ts",
    ];
    if (SERVER_ONLY.includes(rel)) return;

    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Skip import type — erased by Babel, not in client bundle
      if (/import\s+type\s/.test(lines[i])) continue;
      let match;
      IMPORT_RE.lastIndex = 0;
      while ((match = IMPORT_RE.exec(lines[i])) !== null) {
        const pkg = match[1];
        const pkgName = pkg.startsWith("@")
          ? pkg.split("/").slice(0, 2).join("/")
          : pkg.split("/")[0];
        if (NODE_ONLY.has(pkgName)) {
          imports.push({
            file: path.relative(ROOT, filePath),
            line: String(i + 1),
            package: pkgName,
          });
        }
      }
    }
  }

  for (const dir of SEARCH_DIRS) {
    walkDir(path.join(ROOT, dir));
  }
  return imports;
}

function main() {
  console.log("Checking native module imports for web export safety...\n");

  // Check 1: Node-only packages in client-reachable code (hard error)
  const nodeImports = findNodeOnlyImports();
  if (nodeImports.length > 0) {
    console.log("BLOCKED — Node-only packages found in client-reachable code:");
    for (const imp of nodeImports) {
      console.log("  " + imp.file + ":" + imp.line + " — import '" + imp.package + "'");
    }
    console.log("\nNode packages cause Metro UnableToResolveError.");
    console.log("Fix: move import to server-only code, use import type, or create a .web.ts stub.");
    process.exit(1);
  }

  // Check 2: Native packages without .web.js files
  const imports = findNativeImports();

  if (imports.length === 0) {
    console.log("No native module imports found.");
    process.exit(0);
  }

  const byPackage = {};
  for (const imp of imports) {
    if (!byPackage[imp.package]) byPackage[imp.package] = [];
    byPackage[imp.package].push(imp);
  }

  let risky = 0;
  let safe = 0;

  for (const [pkg, files] of Object.entries(byPackage).sort()) {
    if (KNOWN_SAFE.has(pkg)) {
      safe++;
      continue;
    }

    if (NATIVE_ONLY.has(pkg)) {
      risky++;
      console.log("  RISKY " + pkg + " — no .web.js files (" + files.length + " imports):");
      for (const f of files) {
        console.log("    " + f.file + ":" + f.line);
      }
      continue;
    }

    const hasWeb = hasWebSupport(pkg);
    if (hasWeb) {
      safe++;
      console.log("  OK " + pkg + " — has .web.js files");
    } else {
      risky++;
      console.log("  RISKY " + pkg + " — NO .web.js files (" + files.length + " imports):");
      for (const f of files) {
        console.log("    " + f.file + ":" + f.line);
      }
    }
  }

  console.log("\nResults: " + safe + " safe, " + risky + " risky packages");

  if (risky > 0) {
    console.log("\nRisky imports found. Options:");
    console.log("  1. Create a .web.ts platform-split stub in the project");
    console.log("  2. Add the package to KNOWN_SAFE if it has web support");
    console.log("  3. Move the import to function-scope with Platform.OS guard");
    process.exit(1);
  }

  console.log("\nAll native imports have web support.");
}

main();
