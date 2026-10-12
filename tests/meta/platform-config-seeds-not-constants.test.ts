/**
 * STAGE ORDER RULE (Plan 27 §13 STAGE 2 ORDER, item F2) — "SEEDS, NOT
 * CONSTANTS": every delivery/shop economics value is seeded into
 * platform_config and fresh-read at request time, so an admin edit takes
 * effect with no deploy. A code-level constant for any of these values is a
 * REJECTED stage.
 *
 * This test is the grep-style assertion the order asks for. It pins three
 * things, each with a fault injection so a silently-neutered version fails:
 *
 *   1. every §12 economics key is on the marketplace allow-list (so
 *      PATCH /api/admin/config can actually edit it), and the superseded
 *      `delivery_fee_default_bdt` is gone;
 *   2. NO lib/ source line mentions one of those keys next to a numeric
 *      literal — i.e. no `getConfigInt('delivery_fee_within_3km_bdt', 8000)`;
 *   3. the seed script carries the owner's launch values verbatim.
 */
import { describe, it, expect } from "@jest/globals";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

/** §12 keys (OWNER-DECISION 2026-10-12, refined) — seeds, never literals. */
const ECONOMICS_KEYS = [
  "delivery_commission_percent",
  "delivery_fee_within_3km_bdt",
  "delivery_fee_beyond_3km_bdt",
  "delivery_fee_tier_radius_km",
  "delivery_man_subscription_bdt_monthly",
  "shop_commission_percent",
] as const;

/** Launch DEFAULTS as Zia set them — asserted against the SEED, never lib code. */
const LAUNCH_SEEDS: Record<string, string> = {
  delivery_commission_percent: "0",
  delivery_fee_within_3km_bdt: "8000",
  delivery_fee_beyond_3km_bdt: "12000",
  delivery_fee_tier_radius_km: "3",
  delivery_man_subscription_bdt_monthly: "10000",
  shop_commission_percent: "0",
};

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".ts")) yield full;
  }
}

/**
 * A line "mentions key beside a digit" when, after removing the key text
 * itself (keys contain digits: `within_3km`), a digit still remains. That
 * catches the constant regardless of how it is spelled in the call.
 */
export function literalBesideKey(line: string, key: string): boolean {
  if (!line.includes(key)) return false;
  const withoutKey = line.split(key).join("");
  return /\d/.test(withoutKey);
}

function scanLibForLiterals(): { file: string; line: number; text: string }[] {
  const findings: { file: string; line: number; text: string }[] = [];
  for (const file of walk(path.join(ROOT, "lib"))) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((text, idx) => {
      for (const key of ECONOMICS_KEYS) {
        if (literalBesideKey(text, key)) {
          findings.push({ file: path.relative(ROOT, file), line: idx + 1, text: text.trim() });
        }
      }
    });
  }
  return findings;
}

describe("§12 economics — seeds, not constants (stage-order rule)", () => {
  it("lists every §12 key on the marketplace allow-list", () => {
    const src = fs.readFileSync(path.join(ROOT, "lib/platformConfig.ts"), "utf8");
    for (const key of ECONOMICS_KEYS) {
      expect(src).toContain(`'${key}'`);
    }
  });

  it("drops the superseded delivery_fee_default_bdt key", () => {
    const platformSrc = fs.readFileSync(path.join(ROOT, "lib/platformConfig.ts"), "utf8");
    const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/admin/config+api.ts"), "utf8");
    const seedSrc = fs.readFileSync(path.join(ROOT, "scripts/seed-platform-config.js"), "utf8");
    expect(platformSrc).not.toMatch(/'delivery_fee_default_bdt'/);
    expect(routeSrc).not.toMatch(/'delivery_fee_default_bdt'/);
    expect(seedSrc).not.toMatch(/delivery_fee_default_bdt',/);
  });

  it("keeps NO economics literal in lib/ code paths", () => {
    expect(scanLibForLiterals()).toEqual([]);
  });

  it("seeds the owner's launch values verbatim", () => {
    const seedSrc = fs.readFileSync(path.join(ROOT, "scripts/seed-platform-config.js"), "utf8");
    for (const [key, value] of Object.entries(LAUNCH_SEEDS)) {
      const row = new RegExp(`\\(\\s*'${key}'\\s*,\\s*'${value}'`);
      expect(seedSrc).toMatch(row);
    }
  });

  // ── Fault injection: a neutered scanner must flip both directions ─────────
  it("FAULT: a literal in a lib file is detected (scanner is not a no-op)", () => {
    const sandbox = path.join(ROOT, "lib/__fault_injection_probe__.ts");
    fs.writeFileSync(
      sandbox,
      "export const fee = 8000; // delivery_fee_within_3km_bdt = 8000\n",
      "utf8",
    );
    try {
      const findings = scanLibForLiterals();
      expect(findings.some((f) => f.file.includes("__fault_injection_probe__"))).toBe(true);
    } finally {
      fs.rmSync(sandbox, { force: true });
    }
  });

  it("FAULT: a wrong seed value is detected (seed assertion is not a no-op)", () => {
    const wrong = "delivery_fee_within_3km_bdt";
    const bogus = "('delivery_fee_within_3km_bdt', '9999', now())";
    expect(bogus).not.toMatch(new RegExp(`\\(\\s*'${wrong}'\\s*,\\s*'8000'`));
  });

  it("FAULT: a clean line passes the literal detector", () => {
    expect(literalBesideKey("const raw = await getConfigInt('delivery_commission_percent');", "delivery_commission_percent")).toBe(false);
    expect(literalBesideKey("const raw = await getConfigInt('delivery_commission_percent', 8000);", "delivery_commission_percent")).toBe(true);
  });
});
