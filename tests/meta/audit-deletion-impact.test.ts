/**
 * tests/meta/audit-deletion-impact.test.ts
 *
 * Proof for scripts/audit-deletion-impact.cjs — the one command that joins the
 * nav-integrity audit, the i18n orphan audit and maestro/tools/testid-map.json
 * into a per-screen deletion-impact report. For every screen with no inbound
 * navigation edge it must list the testIDs attributed to it and ONLY the locale
 * keys whose reference sites all sit inside that screen — the keys that become
 * orphaned when it is deleted.
 *
 * HOW. Same contract as the other audit suites: copy the SHIPPED tools into a
 * throwaway tree (the impact tool spawns both audits from its own __dirname),
 * lay out app/** + lib/** fixtures, both locales and a testID map, and run the
 * real tool. Both audits require <root>/node_modules/typescript — the sandbox
 * junctions the repo's node_modules; fs.rmSync does not follow junctions.
 *
 * NON-VACUITY. The two exclusion tiers are each paired with a fault-injected
 * copy: neutralising the outside-reference filter makes keys other files still
 * reference (shared.key, dyn.one, pre.one) get claimed as dying; neutralising
 * the orphan exclusion makes an already-backlogged key (gone.key) get claimed.
 * neutralize() throws when an anchor no longer matches, and the contract test
 * re-checks every anchor against the shipped tool, so a refactor names itself
 * instead of surfacing as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "scripts", "audit-deletion-impact.cjs");
const NAV = path.join(REPO, "scripts", "audit-nav-integrity.cjs");
const I18N = path.join(REPO, "scripts", "audit-i18n-orphans.cjs");
const REPO_NODE_MODULES = path.join(REPO, "node_modules");

interface ImpactScreen {
  file: string;
  admin: boolean;
  sources: string[];
  testIDs: string[];
  keys: string[];
}

interface ImpactJson {
  screens: ImpactScreen[];
  totals: { screens: number; testIDs: number; keys: number };
  nav: { routeFiles: number; unreachable: number; adminUnlisted: number; dangling: unknown[]; unresolved: unknown[] };
  i18n: { orphans: number; shielded: number };
}

interface Fixture {
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  /** repo-root-relative (outside app/) path -> source. */
  extra?: Record<string, string>;
  en: Record<string, unknown>;
  bn?: Record<string, unknown>;
  /** app/-relative path -> testID entries. */
  testids?: Record<string, { id: string; line: number }[]>;
  args: string[];
  /** Fault injection: rewrite the copied tool. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

interface ImpactRun {
  code: number;
  out: string;
  err: string;
  all: string;
  json: ImpactJson | null;
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
 * Replace `from` with `to`, or throw. A mutation that does not apply would
 * leave an UNMUTATED tool in the sandbox, whose output would look exactly like
 * the expected result and turn the non-vacuity proof into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in audit-deletion-impact.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

function runTool(f: Fixture): ImpactRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deletion-impact-fixture-"));
  sandboxes.push(root);

  fs.symlinkSync(REPO_NODE_MODULES, path.join(root, "node_modules"), "junction");

  const lf = (rel: string): string => fs.readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
  write(root, "scripts/audit-nav-integrity.cjs", lf(NAV));
  write(root, "scripts/audit-i18n-orphans.cjs", lf(I18N));
  let src = lf(TOOL);
  if (f.mutate) src = f.mutate(src);
  write(root, "scripts/audit-deletion-impact.cjs", src);

  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  for (const [rel, body] of Object.entries(f.extra ?? {})) write(root, rel, body);
  write(root, "i18n/locales/en/common.json", JSON.stringify(f.en, null, 2) + "\n");
  write(root, "i18n/locales/bn/common.json", JSON.stringify(f.bn ?? f.en, null, 2) + "\n");
  write(
    root,
    "maestro/tools/testid-map.json",
    JSON.stringify({ total: 0, screens: f.testids ?? {} }, null, 2) + "\n",
  );

  const r = spawnSync(process.execPath, [path.join(root, "scripts", "audit-deletion-impact.cjs"), ...f.args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  let json: ImpactJson | null = null;
  if (f.args.includes("--json")) {
    try {
      json = JSON.parse(out) as ImpactJson;
    } catch {
      json = null;
    }
  }
  return { code: r.status ?? -1, out, err, all: out + err, json };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const T_IMPORT = 'import { useTranslation } from "react-i18next";';

/** The orphan screen, its .ts helper, plus live screens that keep keys alive. */
function baseApp(): Record<string, string> {
  return {
    "index.tsx": ['import { router } from "expo-router";', "export default function Index() {", '  router.replace("/home");', "  return null;", "}"].join("\n"),
    "home.tsx": [
      T_IMPORT,
      'import { router } from "expo-router";',
      'import { KEYS } from "../lib/keys";',
      "export default function Home() {",
      "  const { t } = useTranslation();",
      '  const kind = "x";',
      "  const labels = KEYS.map((k) => t(k));",
      // Mirrors the real tree's `+not-found` -> "/" edge: the entry screen has
      // an inbound site, so it is not part of the no-inbound report.
      '  const goHome = () => { router.replace("/"); };',
      '  return <Text>{t("live.key")}{t("shared.key")}{t(`pre.${kind}`)}{labels[0]}</Text>;',
      "}",
    ].join("\n"),
    "orphan/index.tsx": [
      T_IMPORT,
      'import { LABELS } from "./labels";',
      "export default function Orphan() {",
      "  const { t } = useTranslation();",
      '  const gone = "gone.key";',
      '  return <Text>{t("dead.one")}{t(LABELS[0])}{t("shared.key")}{t("dyn.one")}{t("pre.one")}{gone}</Text>;',
      "}",
    ].join("\n"),
    "orphan/labels.ts": 'export const LABELS = ["dead.two"];',
  };
}

const BASE: Omit<Fixture, "args"> = {
  app: baseApp(),
  extra: { "lib/keys.ts": 'export const KEYS = ["dyn.one"];' },
  en: {
    live: { key: "Live" },
    shared: { key: "Shared" },
    dead: { one: "1", two: "2" },
    gone: { key: "Gone" },
    dyn: { one: "Dyn" },
    pre: { one: "Pre" },
  },
  testids: {
    "orphan/index.tsx": [
      { id: "orphan.el-1", line: 6 },
      { id: "orphan.action", line: 7 },
    ],
    "home.tsx": [{ id: "home.el-1", line: 8 }],
  },
};

/** A key whose only lookup is an unresolved call INSIDE the screen (file fallback). */
const FALLBACK: Omit<Fixture, "args"> = {
  app: {
    "index.tsx": baseApp()["index.tsx"],
    "home.tsx": baseApp()["home.tsx"],
    "orphan/index.tsx": [
      T_IMPORT,
      'function loadKey() { return "fb.one"; }',
      "export default function Orphan() {",
      "  const { t } = useTranslation();",
      '  const fb = "fb.one";',
      "  return <Text>{t(loadKey())}{fb}</Text>;",
      "}",
    ].join("\n"),
  },
  extra: { "lib/keys.ts": 'export const KEYS = ["dyn.one"];' },
  en: { live: { key: "Live" }, shared: { key: "Shared" }, fb: { one: "Fallback" } },
  testids: { "orphan/index.tsx": [{ id: "orphan.el-1", line: 6 }] },
};

// ── fault-injection anchors, one per exclusion tier ───────────────────────────

const ANCHORS = {
  /** a key another runtime file still references must not be claimed. */
  outsideRefs: ".filter((k) => !literalOutside(k, files) && !dynamicOutside(k, files))",
  /** a key already in the orphan backlog does not die with anything. */
  orphanExclusion: ".filter((k) => (enKeys.has(k) || bnKeys.has(k)) && !orphanSet.has(k))",
} as const;

const FAULTS = {
  /** the outside-reference filter disappears: live keys get claimed as dying. */
  noOutsideRefs: (s: string) => neutralize(s, ANCHORS.outsideRefs, ".filter(() => true)"),
  /** the backlog exclusion disappears: already-orphaned keys get claimed. */
  noOrphanExclusion: (s: string) => neutralize(s, ANCHORS.orphanExclusion, ".filter((k) => enKeys.has(k) || bnKeys.has(k))"),
} as const;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("the join", () => {
  it("reports the screen's testIDs and the keys that die with it", () => {
    const r = runTool({ ...BASE, args: ["--json"] });
    expect(r.code).toBe(0);
    expect(r.json?.screens).toHaveLength(1);
    const s = r.json!.screens[0];
    expect(s.file).toBe("app/orphan/index.tsx");
    expect(s.admin).toBe(false);
    // The directory's .ts helper is part of the surface; the live screens are not.
    expect(s.sources).toEqual(["app/orphan/index.tsx", "app/orphan/labels.ts"]);
    expect(s.testIDs).toEqual(["orphan.el-1", "orphan.action"]);
    // dead.one (static) and dead.two (resolved through the imported table) die;
    // nothing else does. Exact array, so an over-claim fails as loudly as a miss.
    expect(s.keys).toEqual(["dead.one", "dead.two"]);
    expect(r.json?.totals).toEqual({ screens: 1, testIDs: 2, keys: 2 });
    expect(r.json?.nav.unreachable).toBe(1);
    expect(r.json?.i18n.orphans).toBe(1); // gone.key only — the audit's own view
  });

  it("excludes every key another runtime file still references", () => {
    const r = runTool({ ...BASE, args: ["--json"] });
    const keys = r.json!.screens[0].keys;
    // shared.key: a static call in home.tsx.
    expect(keys).not.toContain("shared.key");
    // dyn.one: resolved through home.tsx's imported-table callback.
    expect(keys).not.toContain("dyn.one");
    // pre.one: covered by home.tsx's `t(`pre.${kind}`)` template prefix.
    expect(keys).not.toContain("pre.one");
    // gone.key: already in the audit's orphan backlog — deleting the screen
    // changes nothing about it, so it is not part of this screen's cost.
    expect(keys).not.toContain("gone.key");
  });

  it("lists the screen, its testIDs and its keys in the human report", () => {
    const r = runTool({ ...BASE, args: [] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("app/orphan/index.tsx");
    expect(r.out).toContain("testIDs (2): orphan.el-1, orphan.action");
    expect(r.out).toContain("keys that die with it (2): dead.one, dead.two");
    expect(r.out).toContain("no inbound edge is a FLOOR");
  });

  it("filters to a matching screen and reports an empty match cleanly", () => {
    const hit = runTool({ ...BASE, args: ["--screen", "orphan", "--json"] });
    expect(hit.code).toBe(0);
    expect(hit.json?.screens.map((s) => s.file)).toEqual(["app/orphan/index.tsx"]);
    const miss = runTool({ ...BASE, args: ["--screen", "home", "--json"] });
    expect(miss.code).toBe(0);
    expect(miss.json?.screens).toEqual([]);
    const missHuman = runTool({ ...BASE, args: ["--screen", "home"] });
    expect(missHuman.out).toContain('no no-inbound screen matches "home"');
  });
});

describe("keys shielded only by the screen's own unresolved call", () => {
  it("counts a file-fallback key as dying with the screen", () => {
    const r = runTool({ ...FALLBACK, args: ["--json"] });
    expect(r.code).toBe(0);
    expect(r.json?.screens).toHaveLength(1);
    expect(r.json?.screens[0].keys).toEqual(["fb.one"]);
  });
});

describe("drift guards", () => {
  it("keeps KEY_SHAPE byte-identical to the i18n audit's", () => {
    // The join only works while both tools agree on what a key-shaped literal
    // is; this fails the day one side changes shape without the other.
    const pick = (rel: string): string | null => {
      const src = fs.readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
      const m = src.match(/const KEY_SHAPE = (\/.*\/);/);
      return m ? m[1] : null;
    };
    const tool = pick(TOOL);
    expect(tool).not.toBeNull();
    expect(tool).toBe(pick(I18N));
  });
});

describe("fault injection (non-vacuity)", () => {
  it("claims live keys once the outside-reference filter is neutralised", () => {
    const r = runTool({ ...BASE, args: ["--json"], mutate: FAULTS.noOutsideRefs });
    expect(r.code).toBe(0);
    const keys = r.json!.screens[0].keys;
    expect(keys).toEqual(expect.arrayContaining(["dead.one", "shared.key", "dyn.one", "pre.one"]));
    // The backlog exclusion is a separate tier and stays intact.
    expect(keys).not.toContain("gone.key");
  });

  it("claims a backlogged key once the orphan exclusion is neutralised", () => {
    const r = runTool({ ...BASE, args: ["--json"], mutate: FAULTS.noOrphanExclusion });
    expect(r.code).toBe(0);
    const keys = r.json!.screens[0].keys;
    expect(keys).toContain("gone.key");
    // The outside-reference filter is a separate tier and stays intact.
    expect(keys).not.toContain("shared.key");
  });

  it("every anchor still matches the shipped tool", () => {
    const src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      expect([name, src.includes(anchor)]).toEqual([name, true]);
    }
  });

  it("mutates the sandbox copy only, never the repo's tool", () => {
    const before = fs.readFileSync(TOOL, "utf8");
    runTool({ ...BASE, args: ["--json"], mutate: FAULTS.noOutsideRefs });
    expect(fs.readFileSync(TOOL, "utf8")).toBe(before);
  });
});
