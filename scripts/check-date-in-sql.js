#!/usr/bin/env node
/**
 * check-date-in-sql.js — CI gate for the ISSUE-47 bug class.
 *
 * Flags raw JS Date objects (new Date(...), Date.now()) interpolated into
 * drizzle sql template literals. These bypass the column's mapToDriverValue
 * and hand postgres.js a raw Date param → TypeError: Buffer.byteLength.
 *
 * Safe patterns (NOT flagged):
 *   - `.toISOString()` / `.toString()` before interpolation (string param)
 *   - `now()` / `NOW()` (DB-side, no JS Date involved)
 *   - typed drizzle operators: `eq(col, date)`, `lt(col, date)` (go through
 *     mapToDriverValue via the column encoder)
 *
 * Usage:
 *   node scripts/check-date-in-sql.js              # scan all source dirs
 *   node scripts/check-date-in-sql.js --staged      # scan only staged files
 *
 * Exit 0 = clean, exit 1 = violations found.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Directories to scan (relative to repo root)
const SOURCE_DIRS = [
  "app/api",
  "utils-server",
  "lib",
  "src",
  "store",
];

// Regex: sql template block containing ${new Date or ${Date.now
// We scan file contents (not grep) to handle multi-line templates.
const DATE_IN_SQL_RE = /sql`[^`]*\$\{\s*(new Date\s*\(|Date\.now\s*\()/g;

// Known safe variables: commonly used as Date but converted before interpolation
const SAFE_SUFFICES = [".toISOString()", ".toString()"];

function isFalsePositive(match, fullContext) {
  // If the Date expression is wrapped in .toISOString() or .toString(), it's safe
  if (SAFE_SUFFICES.some((s) => match.includes(s))) return true;
  return false;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const violations = [];
  let m;

  // Reset regex state
  DATE_IN_SQL_RE.lastIndex = 0;

  while ((m = DATE_IN_SQL_RE.exec(content)) !== null) {
    const match = m[0];
    if (isFalsePositive(match, content)) continue;

    // Find line number
    const upToMatch = content.slice(0, m.index);
    const lineNum = (upToMatch.match(/\n/g) || []).length + 1;
    const lineStart = upToMatch.lastIndexOf("\n") + 1;
    const lineEnd = content.indexOf("\n", m.index);
    const line = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();

    violations.push({ file: filePath, line: lineNum, snippet: line });
  }

  return violations;
}

function getStagedFiles() {
  try {
    return execSync("git diff --cached --name-only --diff-filter=ACM", {
      encoding: "utf8",
      cwd: path.resolve(__dirname, ".."),
    })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f));
  } catch {
    return [];
  }
}

function getAllSourceFiles(dirs) {
  const files = [];
  for (const dir of dirs) {
    const absDir = path.resolve(__dirname, "..", dir);
    if (!fs.existsSync(absDir)) continue;
    const walk = (d) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".audit" || entry.name === ".tmp") continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          files.push(full);
        }
      }
    };
    walk(absDir);
  }
  return files;
}

// --- Main ---
const staged = process.argv.includes("--staged");
const repoRoot = path.resolve(__dirname, "..");
const files = staged ? getStagedFiles().map((f) => path.join(repoRoot, f)) : getAllSourceFiles(SOURCE_DIRS);

if (files.length === 0) {
  console.log("✅ No source files to scan.");
  process.exit(0);
}

const allViolations = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  allViolations.push(...scanFile(f));
}

if (allViolations.length === 0) {
  console.log(`✅ Date-in-sql gate: clean (${files.length} files scanned, 0 violations).`);
  process.exit(0);
}

console.error(`\n❌ Date-in-sql gate: ${allViolations.length} violation(s) found in ${files.length} files:\n`);
for (const v of allViolations) {
  const rel = path.relative(repoRoot, v.file);
  console.error(`  ${rel}:${v.line}`);
  console.error(`    ${v.snippet}`);
}
console.error(
  "\nRaw JS Date objects in sql templates bypass mapToDriverValue and crash postgres.js.\n" +
    "Use DB-side now() - interval or typed drizzle operators (lt/eq/gt) instead.\n" +
    "See: utils-server/deliveryHandler.ts for the canonical fix pattern."
);
process.exit(1);
