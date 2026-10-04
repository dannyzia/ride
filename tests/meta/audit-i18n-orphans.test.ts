/**
 * tests/meta/audit-i18n-orphans.test.ts
 *
 * Proof for scripts/audit-i18n-orphans.cjs — the AST resolver that finds
 * locale keys nothing references (orphans), keys referenced but absent from
 * the locale (missing), and en/bn divergence (parity).
 *
 * WHY. Orphaned locale keys were found by hand: after a screen deletion, its
 * homespace keys survive silently. The first tool version reported 738 rows
 * for 369 distinct keys (one row per key per locale), never implemented the
 * parity check its own comment promised, and could not produce a call site for
 * MISSING. The version under test fixes those, and — the part that actually
 * needs proving — resolves the dynamic carrier shapes that otherwise produce
 * false orphans: `t(TABLE[k])` through file-local const tables, template
 * prefixes (`t(`ns.${x}`)`), and the file fallback for callback-parameter
 * calls (`t(item.titleKey)`) that no local analysis can bind.
 *
 * HOW. Same contract as tests/meta/audit-nav-integrity.test.ts: copy the
 * SHIPPED tool into a throwaway tree, lay out app/**, components/** and both
 * locale files around it, and run the real file. The tool resolves
 * `typescript` from <root>/node_modules/typescript, so the sandbox junctions
 * the repo's real node_modules; fs.rmSync does not follow junctions.
 *
 * NON-VACUITY. Every resolution feature is paired with a fault-injected copy
 * in which that feature's detector is neutralised, asserting the outcome
 * FLIPS (a shielded key becomes orphaned, a resolved site becomes unresolved,
 * a runtime file slips into the scan). neutralize() throws when an anchor no
 * longer matches, and the contract test at the end re-checks every anchor
 * against the shipped tool, so a refactor names itself instead of surfacing
 * as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "scripts", "audit-i18n-orphans.cjs");
const REPO_NODE_MODULES = path.join(REPO, "node_modules");

interface OrphanKey {
  key: string;
  locales: string[];
}

interface ShieldedKey {
  key: string;
  locales: string[];
  reasons: string[];
  via: string[];
}

interface MissingKey {
  key: string;
  file: string;
  line: number;
}

interface DynamicSite {
  file: string;
  line: number;
  kind: string;
  keys: string[];
  prefix: string | null;
  unresolved: boolean;
}

interface I18nReport {
  locales: { en: { file: string; keys: number }; bn: { file: string; keys: number } };
  scan: { files: number; staticCalls: number; dynamicCalls: number; unresolvedDynamic: number };
  orphans: OrphanKey[];
  shielded: ShieldedKey[];
  missing: MissingKey[];
  parity: { onlyInEn: string[]; onlyInBn: string[] };
  dynamic: DynamicSite[];
}

interface AuditDef {
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  /** components/-relative path -> source. */
  components?: Record<string, string>;
  /** en locale JSON. bn mirrors en unless overridden. */
  en?: Record<string, unknown>;
  bn?: Record<string, unknown>;
  /** Run the human-readable report instead of --json. */
  text?: boolean;
  /** Fault injection: rewrite the copied script. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

interface AuditRun {
  code: number;
  out: string;
  err: string;
  /** stdout + stderr, for assertions that only care that a message was printed. */
  all: string;
  json: I18nReport | null;
}

const sandboxes: string[] = [];
afterAll(() => {
  for (const dir of sandboxes) fs.rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

/**
 * Replace `from` with `to`, or throw. Throwing is the whole point: a mutation
 * that does not apply would leave an UNMUTATED tool in the sandbox, whose
 * output would look exactly like the expected result and turn the
 * non-vacuity proof into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in audit-i18n-orphans.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

function runAudit(f: AuditDef): AuditRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-audit-fixture-"));
  sandboxes.push(root);

  // The tool requires <root>/node_modules/typescript. A junction to the real
  // node_modules makes it visible without copying; cleanup below relies on
  // fs.rmSync NOT following junctions (same technique as the nav-audit suite).
  fs.symlinkSync(REPO_NODE_MODULES, path.join(root, "node_modules"), "junction");

  let src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
  if (f.mutate) src = f.mutate(src);
  write(root, "scripts/audit-i18n-orphans.cjs", src);

  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  for (const [rel, body] of Object.entries(f.components ?? {})) write(root, `components/${rel}`, body);
  write(root, "i18n/locales/en/common.json", JSON.stringify(f.en ?? {}, null, 2));
  write(root, "i18n/locales/bn/common.json", JSON.stringify(f.bn ?? f.en ?? {}, null, 2));

  const args = [
    path.join(root, "scripts", "audit-i18n-orphans.cjs"),
    ...(f.text ? [] : ["--json"]),
  ];
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  let json: I18nReport | null = null;
  if (!f.text) {
    try {
      json = JSON.parse(out) as I18nReport;
    } catch {
      json = null;
    }
  }
  return { code: r.status ?? -1, out, err, all: out + err, json };
}

/** The report, failing loudly when the tool produced no parseable JSON. */
function report(r: AuditRun): I18nReport {
  if (!r.json) {
    throw new Error(`expected --json output, got:\n${r.all.slice(0, 600)}`);
  }
  return r.json;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const T_IMPORT = 'import { useTranslation } from "react-i18next";';

const HEALTHY = (): AuditDef => ({
  en: { greet: { hello: "Hi" } },
  app: {
    "index.tsx": [T_IMPORT, "export default function Screen() {", "  const { t } = useTranslation();", '  return <Text>{t("greet.hello")}</Text>;', "}"].join("\n"),
  },
});

/** Unused keys in BOTH locales: one row per key, not one row per key-locale. */
const ORPHANS = (): AuditDef => ({
  en: { dead: { one: "1", two: "2" }, live: { key: "x" } },
  app: {
    "a.tsx": [T_IMPORT, "export default function Screen() {", "  const { t } = useTranslation();", '  return <Text>{t("live.key")}</Text>;', "}"].join("\n"),
  },
});

/**
 * The AST-vs-regex class: a key in a comment, and the same key as the first
 * argument of a call that is NOT `t` — both must stay orphaned. A regex tool
 * reads the comment as a usage; a naive any-call tool reads `wrapper(...)`.
 */
const NOT_REGEX = (): AuditDef => ({
  en: { dead: { one: "1", comment: "2" } },
  app: {
    "a.tsx": [
      T_IMPORT,
      '// t("dead.comment") is mentioned in a comment but never rendered',
      "export function Screen({ wrapper }: { wrapper: (k: string) => string }) {",
      '  return wrapper("dead.one");',
      "}",
    ].join("\n"),
  },
});

const MISSING = (): AuditDef => ({
  en: { live: { key: "x" } },
  app: {
    // line 5 is the ghost call — MISSING must carry file:line, not "(various)".
    "a.tsx": [
      T_IMPORT,
      "export default function Screen() {",
      "  const { t } = useTranslation();",
      '  t("live.key");',
      '  t("ghost.key");',
      '  t("nodot");',
      "  return null;",
      "}",
    ].join("\n"),
  },
});

/** `t(TABLE[k])`: the table lives in the same file, one declaration hop away. */
const DYNAMIC_TABLE = (): AuditDef => ({
  en: { dyn: { a: "A", b: "B", c: "C" } },
  app: {
    "a.tsx": [
      T_IMPORT,
      'const LABELS: Record<string, string> = { one: "dyn.a", two: "dyn.b" };',
      "export default function Screen({ k }: { k: string }) {",
      "  const { t } = useTranslation();",
      "  return <Text>{t(LABELS[k])}</Text>;",
      "}",
    ].join("\n"),
  },
});

const TEMPLATE_PREFIX = (): AuditDef => ({
  en: { hot: { one: "1", two: "2" }, hot_extra: { three: "3" } },
  app: {
    "a.tsx": [
      T_IMPORT,
      "export default function Screen({ x }: { x: string }) {",
      "  const { t } = useTranslation();",
      "  return <Text>{t(`hot.${x}`)}</Text>;",
      "}",
    ].join("\n"),
  },
});

/**
 * `t(r.key)` inside ROWS.map: `r` is a callback parameter, so no local
 * analysis can bind it — the file fallback must catch the table literals, or
 * these become false orphans.
 */
const FILE_FALLBACK = (): AuditDef => ({
  en: { fb: { one: "1", two: "2", three: "3" } },
  app: {
    "a.tsx": [
      T_IMPORT,
      'const ROWS = [{ key: "fb.one" }, { key: "fb.two" }];',
      "export default function Screen() {",
      "  const { t } = useTranslation();",
      "  return ROWS.map((r) => <Text key={r.key}>{t(r.key)}</Text>);",
      "}",
    ].join("\n"),
  },
});

/** en/bn asymmetry: divergence is PARITY, and one-locale keys are still orphans. */
const PARITY = (): AuditDef => ({
  en: { p: { both: "x", only_en: "y" } },
  bn: { p: { both: "x", only_bn: "z" } },
  app: {
    "a.tsx": [T_IMPORT, "export default function Screen() {", "  const { t } = useTranslation();", '  return <Text>{t("p.both")}</Text>;', "}"].join("\n"),
  },
});

/** A truly unresolvable call: reported as dynamic, and it shields nothing. */
const UNRESOLVED = (): AuditDef => ({
  en: { mystery: { a: "x" } },
  app: {
    "a.tsx": [
      T_IMPORT,
      "export default function Screen({ unknownVar }: { unknownVar: string }) {",
      "  const { t } = useTranslation();",
      "  return <Text>{t(unknownVar)}</Text>;",
      "}",
    ].join("\n"),
  },
});

/** Not named *.test.* on purpose — the __tests__ scope check is what must exclude it. */
const TESTS_EXCLUDED = (): AuditDef => ({
  en: { test: { only: "x" } },
  app: {
    "__tests__/screen.ts": [T_IMPORT, 'const { t } = useTranslation();', 't("test.only");'].join("\n"),
  },
});

const API_EXCLUDED = (): AuditDef => ({
  en: { api: { key: "x" } },
  app: {
    "api/ping+api.ts": ['import { t } from "somewhere";', 'export function GET() { return t("api.key"); }'].join("\n"),
  },
});

// ── fault-injection anchors, one per resolution feature ──────────────────────

const ANCHORS = {
  /** only `t` / `<expr>.t` callees count as translation calls. */
  callee: "if (isTranslationCallee(node.expression)) {",
  /** `t(`ns.${x}`)` -> prefix "ns." shields every key under it. */
  templatePrefix: "const prefix = templatePrefix(arg);",
  /** identifiers in the argument resolve to file-local const initializers. */
  identifierTable: "if (decls.has(name)) for (const init of decls.get(name)) collectLiterals(init, keys);",
  /** the coarse file fallback for callback-parameter calls. */
  fileFallback: "const fallbackKeys = hasUnresolved ? res.fileLiterals : EMPTY;",
  /** __tests__/ and *.test.* files are not runtime UI. */
  testsExcluded: 'if (rel.includes("__tests__")) return false;',
  /** app/api/** is server code, never translations. */
  apiExcluded: 'if (rel.startsWith("app/api/")) return false;',
} as const;

const FAULTS = {
  /** any call with a first argument counts as a translation call. */
  anyCallCounts: (s: string) => neutralize(s, ANCHORS.callee, "if (true) {"),
  /** template prefixes stop resolving: those keys become orphans. */
  noTemplatePrefix: (s: string) => neutralize(s, ANCHORS.templatePrefix, "const prefix = null;"),
  /** identifier tables stop resolving: the site degrades to unresolved. */
  noIdentifierTable: (s: string) =>
    neutralize(s, ANCHORS.identifierTable, "/* identifier-table resolution neutralised */"),
  /** the fallback net is removed: shielded keys become orphans. */
  noFileFallback: (s: string) => neutralize(s, ANCHORS.fileFallback, "const fallbackKeys = EMPTY;"),
  /** test files slip into the scan and their calls mark keys used. */
  testsCounted: (s: string) => neutralize(s, ANCHORS.testsExcluded, "if (false) return false;"),
  /** api files slip into the scan. */
  apiCounted: (s: string) => neutralize(s, ANCHORS.apiExcluded, "if (false) return false;"),
} as const;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("healthy tree", () => {
  it("resolves a direct call, reports no orphans and exits 0", () => {
    const r = runAudit(HEALTHY());
    const j = report(r);
    expect(j.orphans).toEqual([]);
    expect(j.missing).toEqual([]);
    expect(j.parity.onlyInEn).toEqual([]);
    expect(j.parity.onlyInBn).toEqual([]);
    expect(j.scan.staticCalls).toBe(1);
    expect(r.code).toBe(0);
  });

  it("prints a human report with the counts and the audit-only note", () => {
    const r = runAudit({ ...HEALTHY(), text: true });
    expect(r.out).toContain("locales read : en 1 keys, bn 1 keys");
    expect(r.out).toContain("ORPHANED (in locale, no reference of any kind): 0 keys");
    expect(r.out).toContain("Audit, not a gate");
    expect(r.code).toBe(0);
  });
});

describe("orphan detection (the class the request names)", () => {
  it("reports each unused key ONCE with its locales, not once per locale", () => {
    const r = runAudit(ORPHANS());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["dead.one", "dead.two"]);
    expect(j.orphans.map((o) => o.locales)).toEqual([["en", "bn"], ["en", "bn"]]);
    // The first tool version emitted 4 rows here (2 keys x 2 locales).
    expect(j.orphans.length).toBe(2);
    expect(r.code).toBe(0);
  });

  it("keeps a key commented out and a key passed to a non-t call orphaned", () => {
    const r = runAudit(NOT_REGEX());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["dead.comment", "dead.one"]);
  });

  it("would flip both to used if ANY call counted as a translation call (non-vacuity)", () => {
    const r = runAudit({ ...NOT_REGEX(), mutate: FAULTS.anyCallCounts });
    const j = report(r);
    // `wrapper("dead.one")` now counts; the comment still does not, because a
    // comment is not a call node at all — which is exactly the AST guarantee.
    expect(j.orphans.map((o) => o.key)).toEqual(["dead.comment"]);
  });
});

describe("MISSING carries the call site", () => {
  it("reports a called key absent from the locale with file:line, and ignores non-key shapes", () => {
    const r = runAudit(MISSING());
    const j = report(r);
    expect(j.missing).toEqual([{ key: "ghost.key", file: "app/a.tsx", line: 5 }]);
    // `t("nodot")` is not key-shaped and is neither missing nor a failure.
    expect(j.orphans).toEqual([]);
  });
});

describe("dynamic carrier shapes (false-orphan prevention)", () => {
  it("resolves t(TABLE[k]) through the file-local const and shields its keys", () => {
    const r = runAudit(DYNAMIC_TABLE());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["dyn.c"]);
    const shielded = Object.fromEntries(j.shielded.map((s) => [s.key, s.reasons]));
    expect(shielded["dyn.a"]).toContain("dynamic-table");
    expect(shielded["dyn.b"]).toContain("dynamic-table");
    expect(j.dynamic[0]?.keys).toEqual(["dyn.a", "dyn.b"]);
    expect(j.dynamic[0]?.unresolved).toBe(false);
  });

  it("degrades the table site to unresolved and the keys to file-fallback once table resolution stops (non-vacuity)", () => {
    const r = runAudit({ ...DYNAMIC_TABLE(), mutate: FAULTS.noIdentifierTable });
    const j = report(r);
    expect(j.dynamic[0]?.unresolved).toBe(true);
    const shielded = Object.fromEntries(j.shielded.map((s) => [s.key, s.reasons]));
    expect(shielded["dyn.a"]).toContain("file-fallback");
    // The fallback still prevents the false orphan — the tiers compose.
    expect(j.orphans.map((o) => o.key)).toEqual(["dyn.c"]);
  });

  it("shields every key under a template prefix", () => {
    const r = runAudit(TEMPLATE_PREFIX());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["hot_extra.three"]);
    const shielded = Object.fromEntries(j.shielded.map((s) => [s.key, s.reasons]));
    expect(shielded["hot.one"]).toContain("template-prefix");
    expect(shielded["hot.two"]).toContain("template-prefix");
    expect(j.dynamic[0]?.prefix).toBe("hot.");
  });

  it("orphans the prefixed keys once prefix resolution stops (non-vacuity)", () => {
    const r = runAudit({ ...TEMPLATE_PREFIX(), mutate: FAULTS.noTemplatePrefix });
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["hot.one", "hot.two", "hot_extra.three"]);
  });

  it("shields callback-parameter calls through the file fallback", () => {
    const r = runAudit(FILE_FALLBACK());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["fb.three"]);
    const shielded = Object.fromEntries(j.shielded.map((s) => [s.key, s.reasons]));
    expect(shielded["fb.one"]).toContain("file-fallback");
    expect(shielded["fb.two"]).toContain("file-fallback");
    expect(j.scan.unresolvedDynamic).toBe(1);
  });

  it("orphans the table literals once the fallback is removed (non-vacuity)", () => {
    const r = runAudit({ ...FILE_FALLBACK(), mutate: FAULTS.noFileFallback });
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["fb.one", "fb.three", "fb.two"]);
  });

  it("reports a genuinely unresolvable call as dynamic and shields nothing", () => {
    const r = runAudit(UNRESOLVED());
    const j = report(r);
    expect(j.dynamic[0]?.unresolved).toBe(true);
    expect(j.dynamic[0]?.keys).toEqual([]);
    // No evidence, no shield: the key stays in the orphan list.
    expect(j.orphans.map((o) => o.key)).toEqual(["mystery.a"]);
    expect(j.shielded).toEqual([]);
  });
});

describe("parity: en/bn divergence is its own verdict", () => {
  it("lists one-sided keys as parity AND as orphans when unused", () => {
    const r = runAudit(PARITY());
    const j = report(r);
    expect(j.parity.onlyInEn).toEqual(["p.only_en"]);
    expect(j.parity.onlyInBn).toEqual(["p.only_bn"]);
    expect(j.orphans.map((o) => [o.key, o.locales])).toEqual([
      ["p.only_bn", ["bn"]],
      ["p.only_en", ["en"]],
    ]);
  });
});

describe("scan scope", () => {
  it("ignores t() calls in __tests__ files (they do not render anything)", () => {
    const r = runAudit(TESTS_EXCLUDED());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["test.only"]);
  });

  it("marks the key used once test files slip into the scan (non-vacuity)", () => {
    const r = runAudit({ ...TESTS_EXCLUDED(), mutate: FAULTS.testsCounted });
    const j = report(r);
    expect(j.orphans).toEqual([]);
  });

  it("ignores t()-shaped strings in app/api server code", () => {
    const r = runAudit(API_EXCLUDED());
    const j = report(r);
    expect(j.orphans.map((o) => o.key)).toEqual(["api.key"]);
  });

  it("marks the key used once api files slip into the scan (non-vacuity)", () => {
    const r = runAudit({ ...API_EXCLUDED(), mutate: FAULTS.apiCounted });
    const j = report(r);
    expect(j.orphans).toEqual([]);
  });
});

describe("fault-injection contract", () => {
  it("every anchor still matches the shipped tool", () => {
    // If a refactor moves any of these lines, the non-vacuity tests above would
    // fail with an opaque assertion from an UNMUTATED script. This names the
    // drift instead.
    const src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      expect([name, src.includes(anchor)]).toEqual([name, true]);
    }
  });

  it("mutates the sandbox copy only, never the repo's tool", () => {
    const before = fs.readFileSync(TOOL, "utf8");
    runAudit({ ...DYNAMIC_TABLE(), mutate: FAULTS.noIdentifierTable });
    expect(fs.readFileSync(TOOL, "utf8")).toBe(before);
  });
});
