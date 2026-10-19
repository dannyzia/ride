/**
 * tests/meta/artifacts-parse.test.ts
 *
 * Exercises maestro/tools/artifacts-parse-check.cjs — the reader the Maestro
 * coverage artifacts were missing.
 *
 * WHY THIS FILE EXISTS (A1-1, found 2026-10-16): `maestro/tools/route-inventory.json`
 * was committed SYNTAX-CORRUPT (a missing comma before the `admin/sample-media.tsx`
 * record) and every path in it had lost its `app/` prefix. Nothing noticed for
 * three weeks, because no gate ever read the file — `route-scan.cjs` regenerates
 * it on demand — and JSON.parse was never run against the committed copy. The
 * prefix loss is worse than cosmetic: every vertical matcher in `aggregate.cjs`
 * anchors `^app\/`, so a de-prefixed inventory de-attributes every screen while
 * still exiting 0 with plausible totals.
 *
 * Both halves of the class are asserted below (unparseable JSON, de-prefixed
 * paths), each paired with a fault-injected copy of the SHIPPED CLI whose
 * detector is neutralised and must flip the outcome — so a checker that has
 * quietly become a no-op fails this suite instead of passing silently.
 *
 * The real-tree test reads the COMMITTED artifacts as they are. That is the
 * point: "current" is not a property `route-inventory.json` is meant to have
 * (owner ruling 2026-10-16 — it is the Phase-0 snapshot, refreshed on demand),
 * but "parseable and self-consistent" is.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  BrokenInputError,
  checkRouteInventoryPrefix,
  parseArtifact,
  runArtifactCheck,
  validateRouteInventory,
  validateTestidMap,
} from "../../maestro/tools/artifacts-parse-check.cjs";

const TOOL = path.resolve(__dirname, "../../maestro/tools/artifacts-parse-check.cjs");
const TOOLS_DIR = path.resolve(__dirname, "../../maestro/tools");

/** Minimal well-formed route-inventory doc; `screens` entries are overridable. */
const inventory = (screens: unknown[] = [{ file: "app/(auth)/_layout.tsx" }], routeFiles = screens.length) =>
  JSON.stringify({ scannedAt: "2026-10-16T00:00:00.000Z", routeFiles, interactiveComponents: 1, handlerAnchors: 2, screens });

/** Minimal well-formed testid-map doc. Keys are app/-RELATIVE (no prefix). */
const testidMap = (screens: Record<string, unknown> = { "(auth)/_layout.tsx": [{ id: "auth.layout.set-theme", line: 3 }] }) =>
  JSON.stringify({ total: Object.values(screens).flat().length, screens });

function runCli(root: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [TOOL], {
      env: { ...process.env, ARTIFACTS_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { status: err.status ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

/** A fixture root holding both artifacts; `inv` is the raw route-inventory text. */
function makeRoot(inv: string, map: string = testidMap()): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-parse-"));
  fs.writeFileSync(path.join(root, "route-inventory.json"), inv);
  fs.writeFileSync(path.join(root, "testid-map.json"), map);
  return root;
}

const roots: string[] = [];
const newRoot = (inv: string, map?: string): string => {
  const r = makeRoot(inv, map);
  roots.push(r);
  return r;
};

afterAll(() => {
  for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

describe("the committed artifacts parse — the A1-1 class cannot survive on disk", () => {
  it("route-inventory.json parses as JSON", () => {
    const text = fs.readFileSync(path.join(TOOLS_DIR, "route-inventory.json"), "utf8");
    expect(() => parseArtifact(text, "route-inventory.json")).not.toThrow();
  });

  it("testid-map.json parses as JSON", () => {
    const text = fs.readFileSync(path.join(TOOLS_DIR, "testid-map.json"), "utf8");
    expect(() => parseArtifact(text, "testid-map.json")).not.toThrow();
  });

  it("every route-inventory screen path carries the app/ prefix (what aggregate.cjs matches on)", () => {
    const inv = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, "route-inventory.json"), "utf8"));
    expect(inv.screens.length).toBeGreaterThan(0);
    expect(checkRouteInventoryPrefix(inv.screens, "route-inventory.json")).toEqual([]);
    expect(inv.routeFiles).toBe(inv.screens.length);
  });

  it("the whole checker reports zero findings on the real tools directory", () => {
    const result = runArtifactCheck({ root: TOOLS_DIR });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const stats = result.stats as Record<string, Record<string, number>>;
    expect(stats["route-inventory.json"].screens).toBeGreaterThan(0);
    expect(stats["testid-map.json"].ids).toBeGreaterThan(0);
  });

  it("does not read the map's app/-relative keys as a prefix violation", () => {
    // The map's keys are relative to app/ BY CONSTRUCTION (testid-manifest.cjs
    // records `path.relative(appRoot, file)`), so applying the inventory's prefix
    // rule to it would flag every screen. This pins that the rule stays scoped.
    const map = JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, "testid-map.json"), "utf8"));
    const firstKey = Object.keys(map.screens)[0];
    expect(firstKey.startsWith("app/")).toBe(false);
    expect(validateTestidMap(JSON.stringify(map), "testid-map.json").errors).toEqual([]);
  });
});

describe("validateRouteInventory — syntax (A1-1's literal failure)", () => {
  it("accepts a well-formed document", () => {
    expect(validateRouteInventory(inventory(), "inv").errors).toEqual([]);
  });

  it("throws on unparseable JSON rather than reporting a stale artifact", () => {
    expect(() => validateRouteInventory('{"screens": [', "inv")).toThrow(BrokenInputError);
  });

  it("reproduces the exact committed corruption: a missing comma before a record", () => {
    // The break was `"file": "admin/sample-media.tsx"` missing its leading comma.
    const corrupt = '{"routeFiles": 2, "screens": [{"file": "app/a.tsx"}\n      {"file": "app/b.tsx"}]}';
    expect(() => validateRouteInventory(corrupt, "inv")).toThrow(BrokenInputError);
  });

  it("throws when screens is missing or not an array", () => {
    expect(() => validateRouteInventory('{"routeFiles": 0}', "inv")).toThrow(BrokenInputError);
    expect(() => validateRouteInventory('{"routeFiles": 0, "screens": {}}', "inv")).toThrow(BrokenInputError);
  });

  it("reports routeFiles that disagrees with screens.length", () => {
    const errors = validateRouteInventory(inventory([{ file: "app/a.tsx" }], 5), "inv").errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/routeFiles \(5\) does not match screens\.length \(1\)/);
  });
});

describe("validateRouteInventory — the de-prefixed paths (A1-1's silent half)", () => {
  it("reports a path that lost its app/ prefix", () => {
    const errors = validateRouteInventory(inventory([{ file: "admin/sample-media.tsx" }]), "inv").errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/lost its app\/ prefix/);
  });

  it("reports a non-string file as its own finding, not a prefix finding", () => {
    const errors = validateRouteInventory(inventory([{ file: 7 }]), "inv").errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/file is not a string/);
  });

  it("would have caught the real corruption: a de-prefixed record de-attributes every screen", () => {
    // The committed file had BOTH problems; this pins the second one in isolation.
    const screens = [{ file: "app/(auth)/_layout.tsx" }, { file: "admin/sample-media.tsx" }];
    expect(checkRouteInventoryPrefix(screens, "inv")).toHaveLength(1);
  });
});

describe("validateTestidMap — the gated live inventory's shape", () => {
  it("accepts a well-formed map", () => {
    expect(validateTestidMap(testidMap(), "map").errors).toEqual([]);
  });

  it("throws when screens is missing, null or an array", () => {
    expect(() => validateTestidMap('{"total": 0}', "map")).toThrow(BrokenInputError);
    expect(() => validateTestidMap('{"total": 0, "screens": null}', "map")).toThrow(BrokenInputError);
    expect(() => validateTestidMap('{"total": 0, "screens": []}', "map")).toThrow(BrokenInputError);
  });

  it("reports a total that disagrees with the entry count", () => {
    const errors = validateTestidMap(JSON.stringify({ total: 9, screens: { "a.tsx": [{ id: "a.b", line: 1 }] } }), "map").errors;
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/total \(9\) does not match the entry count \(1\)/);
  });

  it("reports an entry without a string id, and a non-numeric line", () => {
    const errors = validateTestidMap(
      JSON.stringify({ total: 2, screens: { "a.tsx": [{ line: 1 }, { id: "a.b", line: "2" }] } }),
      "map"
    ).errors;
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/without a string id/);
    expect(errors[1]).toMatch(/non-numeric line/);
  });
});

describe("CLI exit codes — 'cannot run' must never read as a pass", () => {
  it("exits 0 on a clean fixture root", () => {
    const { status, stdout } = runCli(newRoot(inventory(), testidMap()));
    expect(stdout).toMatch(/clean/);
    expect(status).toBe(0);
  });

  it("exits 1 on syntax-corrupt JSON", () => {
    const { status, stderr } = runCli(newRoot('{"routeFiles": 1, "screens": [{"file": "app/a.tsx"}\n{"file": "app/b.tsx"}]}'));
    expect(status).toBe(1);
    expect(stderr).toMatch(/not valid JSON/);
  });

  it("exits 1 on a de-prefixed inventory", () => {
    const { status, stderr } = runCli(newRoot(inventory([{ file: "admin/sample-media.tsx" }])));
    expect(status).toBe(1);
    expect(stderr).toMatch(/lost its app\/ prefix/);
  });

  it("exits 2 — not 0 — when an artifact is missing", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-parse-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "testid-map.json"), testidMap());
    const { status, stderr } = runCli(root);
    expect(status).toBe(2);
    expect(stderr).toMatch(/cannot run: route-inventory\.json not found/);
  });
});

describe("fault pair — a neutralised detector must flip the outcome", () => {
  /**
   * Copy the SHIPPED CLI into a throwaway root, string-replace one detector, and
   * run it against the de-prefixed fixture. House pattern (testid-map-freshness,
   * testid-flow-currency): without this, a checker whose prefix rule was deleted
   * would keep passing every test above except the ones that call the exported
   * function directly — and the CLI, which is what pre-commit would call, would
   * be silently inert.
   */
  const withNeutralisedPrefix = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-parse-fault-"));
    roots.push(root);
    const src = fs.readFileSync(TOOL, "utf8");
    const from = "    if (!file.startsWith('app/')) {";
    expect(src).toContain(from); // the injection point must exist
    const mutated = src.replace(from, "    if (false) {");
    expect(mutated).not.toBe(src);
    const toolCopy = path.join(root, "artifacts-parse-check.cjs");
    fs.writeFileSync(toolCopy, mutated);
    fs.writeFileSync(path.join(root, "route-inventory.json"), inventory([{ file: "admin/sample-media.tsx" }]));
    fs.writeFileSync(path.join(root, "testid-map.json"), testidMap());
    return toolCopy;
  };

  it("the real CLI fails the de-prefixed fixture; the neutralised copy passes it", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-parse-pair-"));
    roots.push(root);
    fs.writeFileSync(path.join(root, "route-inventory.json"), inventory([{ file: "admin/sample-media.tsx" }]));
    fs.writeFileSync(path.join(root, "testid-map.json"), testidMap());

    // The SHIPPED tool: exit 1 (detector live).
    expect(runCli(root).status).toBe(1);

    // The copy with the prefix detector removed: the same input now exits 0.
    const mutated = withNeutralisedPrefix();
    let status = 0;
    try {
      execFileSync(process.execPath, [mutated], { env: { ...process.env, ARTIFACTS_ROOT: root }, stdio: "ignore" });
    } catch (e) {
      status = (e as { status?: number }).status ?? -1;
    }
    expect(status).toBe(0);
  });
});
