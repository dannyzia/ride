/**
 * N10 — §H.8 Module isolation greps (F31, precise patterns).
 *
 * CI-blocking test: forbids, in all marketplace dirs and libs, imports of the
 * ride-hailing core — `dispatchChain`, `utils-server/dispatch` (exact file),
 * `leadBilling`, `fareCalc`, `useRiderStore`, `useDriverStore`,
 * `store/useChatStore` — and schema imports of the `rides` table.
 *
 * The marketplace's OWN modules (`rentalDispatchChain`, `deliveryChain`,
 * `emergencyChain`) are explicitly ALLOWED — the v1 naive `from '.*dispatch'`
 * pattern false-positived on them. Entry-point edits (F32) are navigation-only
 * and exempt from the store-import ban by inspection (spec §H.8, §E.7).
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// Marketplace directories (existing-only: lanes may add/remove screens)
const MARKETPLACE_DIRS = [
  "app/api/rental",
  "app/api/shop",
  "app/api/delivery",
  "app/api/emergency",
  "app/api/admin/marketplace",
].map((d) => path.join(ROOT, d));

// Marketplace-owned utils-server + lib modules (existing-only)
const MARKETPLACE_FILES = [
  "utils-server/rentalDispatchChain.ts",
  "utils-server/deliveryChain.ts",
  "utils-server/emergencyChain.ts",
  "utils-server/rentalHandler.ts",
  "utils-server/shopHandler.ts",
  "utils-server/deliveryHandler.ts",
  "utils-server/emergencyHandler.ts",
  "utils-server/activationJobs.ts",
  "lib/marketplaceRbac.ts",
  "lib/ambulanceCerts.ts",
  "lib/shopDeliveryBridge.ts",
  "lib/resolveF35Branch.ts",
].map((f) => path.join(ROOT, f));

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function collectScopedFiles(): string[] {
  const files = MARKETPLACE_DIRS.flatMap(walk).concat(
    MARKETPLACE_FILES.filter((f) => fs.existsSync(f)),
  );
  return [...new Set(files)];
}

type Rule = { name: string; test: (line: string, content: string) => boolean };

// A specifier ending in `dispatchChain` is banned unless it is one of the
// marketplace's own chain modules (spec §H.8 allowance).
const DISPATCHCHAIN_ALLOW = /(?:^|[/\\])(?:rental|delivery)DispatchChain$/;

const RULES: Rule[] = [
  {
    name: "imports dispatchChain (ride-hailing chain)",
    test: (line) => {
      const m = line.match(/from\s+['"]([^'"]*dispatchChain)['"]/);
      if (!m) return false;
      const specifier = m[1];
      return !DISPATCHCHAIN_ALLOW.test(specifier);
    },
  },
  {
    name: "imports utils-server/dispatch (exact ride-hailing dispatch file)",
    test: (line) => !!line.match(/from\s+['"](?:.*\/)?dispatch['"]/),
  },
  {
    name: "imports leadBilling (ride-hailing lead billing)",
    test: (line) => !!line.match(/from\s+['"][^'"]*leadBilling['"]/),
  },
  {
    name: "imports fareCalc (ride-hailing fare engine)",
    test: (line) => !!line.match(/from\s+['"][^'"]*fareCalc['"]/),
  },
  {
    name: "imports useRiderStore (rider app store)",
    test: (line) => !!line.match(/from\s+['"][^'"]*useRiderStore['"]/),
  },
  {
    name: "imports useDriverStore (driver app store)",
    test: (line) => !!line.match(/from\s+['"][^'"]*useDriverStore['"]/),
  },
  {
    name: "imports useChatStore (ride chat store)",
    test: (line) => !!line.match(/from\s+['"][^'"]*useChatStore['"]/),
  },
  {
    // Named schema import containing the `rides` table (multiline-safe:
    // [^}] spans newlines inside the brace list but cannot cross the closing brace)
    name: "schema import of the rides table",
    test: (_line, content) =>
      !!content.match(
        /import\s+(?:type\s+)?\{[^}]*\brides\b[^}]*\}\s*from\s+['"][^'"]*schema/,
      ),
  },
  {
    // Namespace schema import (`import * as schema`) combined with schema.rides usage
    name: "namespace schema usage of the rides table",
    test: (_line, content) =>
      !!content.match(/import\s+\*\s+as\s+schema\b/) &&
      !!content.match(/\bschema\.rides\b/),
  },
];

describe("§H.8 module isolation — marketplace never imports ride-hailing core", () => {
  const scoped = collectScopedFiles();

  it("scopes a non-empty marketplace file set (guard against silent scope loss)", () => {
    expect(scoped.length).toBeGreaterThan(0);
  });

  it("contains no banned imports in any marketplace dir or lib", () => {
    const violations: string[] = [];

    for (const file of scoped) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split(/\r?\n/);
      for (const rule of RULES) {
        for (let i = 0; i < lines.length; i++) {
          if (rule.test(lines[i], content)) {
            violations.push(`${path.relative(ROOT, file)}:${i + 1} — ${rule.name}`);
          }
        }
      }
    }

    // Full violation list in the failure message — CI output must name every site
    expect(violations).toEqual([]);
  });
});
