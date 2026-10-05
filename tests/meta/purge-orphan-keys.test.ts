/**
 * tests/meta/purge-orphan-keys.test.ts
 *
 * Proof for scripts/purge-orphan-keys.cjs — the same-change cleanup for the
 * gate in scripts/audit-i18n-orphans.cjs. Deleting a screen strands its locale
 * keys; `--gate` fails on the new orphans, and this tool performs the demanded
 * cleanup: it removes ONLY audit-proven orphans from BOTH locale files and
 * prunes the same keys from scripts/i18n-orphan-baseline.json.
 *
 * HOW. Same contract as tests/meta/audit-i18n-orphans.test.ts: copy the
 * SHIPPED purge + audit tools into a throwaway tree, lay out app/**, both
 * locale files (CRLF, like the real ones) and the baseline, and run the real
 * purge. The purge spawns the audit, which requires <root>/node_modules/
 * typescript — the sandbox junctions the repo's node_modules; fs.rmSync does
 * not follow junctions.
 *
 * NON-VACUITY. Each safety property is paired with a fault-injected copy.
 * The live-key protection has TWO barriers: selection only ever intersects
 * the audit's ORPHANED set, and the refusal turns any leftover live match into
 * exit 2 with no writes. Neutralising the refusal alone flips the run to a
 * soft no-op; neutralising the selection alone still exits 2 (the refusal is
 * load-bearing); neutralising BOTH lets the live key be deleted -- proving the
 * green results above are not vacuous. The other properties: the dry-run guard
 * (neutralised -> --dry-run writes anyway) and the baseline prune
 * (neutralised -> the post-write self-check catches the un-pruned baseline and
 * exits 1). neutralize() throws when an anchor no longer matches, and the
 * contract test re-checks every anchor against the shipped tool, so a refactor
 * names itself instead of surfacing as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const PURGE = path.join(REPO, "scripts", "purge-orphan-keys.cjs");
const AUDIT = path.join(REPO, "scripts", "audit-i18n-orphans.cjs");
const REPO_NODE_MODULES = path.join(REPO, "node_modules");

interface PurgeDef {
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  en: Record<string, unknown>;
  /** bn mirrors en unless overridden. */
  bn?: Record<string, unknown>;
  /** Baseline `keys` (written with a fixture `_comment`). */
  baselineKeys?: string[];
  /** Do not write the baseline at all. */
  noBaseline?: boolean;
  args: string[];
  /** Fault injection: rewrite the copied purge script. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

interface PurgeJson {
  purged: string[];
  baseline: { before: number; after: number };
  locales: { before: number; after: number };
  dryRun: boolean;
  message?: string;
}

interface PurgeRun {
  code: number;
  out: string;
  err: string;
  /** stdout + stderr, for assertions that only care that a message was printed. */
  all: string;
  json: PurgeJson | null;
  /** Read a sandbox file verbatim (for byte-level "nothing was written" checks). */
  read: (rel: string) => string;
  locale: (l: "en" | "bn") => Record<string, unknown>;
  baseline: () => { keys: string[] };
  /** Run the audit's gate in the sandbox on the post-purge state. */
  auditGate: () => { code: number; out: string };
}

const sandboxes: string[] = [];
afterAll(() => {
  for (const dir of sandboxes) fs.rmSync(dir, { recursive: true, force: true });
});

const CRLF = (doc: unknown): string => JSON.stringify(doc, null, 2).replace(/\n/g, "\r\n") + "\r\n";

function write(root: string, rel: string, body: string): void {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

/**
 * Replace `from` with `to`, or throw. Throwing is the whole point: a mutation
 * that does not apply would leave an UNMUTATED tool in the sandbox, whose
 * output would look exactly like the expected result and turn the non-vacuity
 * proof into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in purge-orphan-keys.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

function runPurge(f: PurgeDef): PurgeRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-purge-fixture-"));
  sandboxes.push(root);

  // The purge spawns the audit, which requires <root>/node_modules/typescript.
  fs.symlinkSync(REPO_NODE_MODULES, path.join(root, "node_modules"), "junction");

  write(root, "scripts/audit-i18n-orphans.cjs", fs.readFileSync(AUDIT, "utf8").replace(/\r\n/g, "\n"));
  let src = fs.readFileSync(PURGE, "utf8").replace(/\r\n/g, "\n");
  if (f.mutate) src = f.mutate(src);
  write(root, "scripts/purge-orphan-keys.cjs", src);

  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  write(root, "i18n/locales/en/common.json", CRLF(f.en));
  write(root, "i18n/locales/bn/common.json", CRLF(f.bn ?? f.en));
  if (!f.noBaseline) {
    write(
      root,
      "scripts/i18n-orphan-baseline.json",
      JSON.stringify({ _comment: "fixture baseline", keys: f.baselineKeys ?? [] }, null, 2) + "\n",
    );
  }

  const r = spawnSync(process.execPath, [path.join(root, "scripts", "purge-orphan-keys.cjs"), ...f.args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  let json: PurgeJson | null = null;
  if (f.args.includes("--json")) {
    try {
      json = JSON.parse(out) as PurgeJson;
    } catch {
      json = null;
    }
  }
  const read = (rel: string): string => fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
  return {
    code: r.status ?? -1,
    out,
    err,
    all: out + err,
    json,
    read,
    locale: (l) => JSON.parse(read(`i18n/locales/${l}/common.json`)) as Record<string, unknown>,
    baseline: () => JSON.parse(read("scripts/i18n-orphan-baseline.json")) as { keys: string[] },
    auditGate: () => {
      const a = spawnSync(process.execPath, [path.join(root, "scripts", "audit-i18n-orphans.cjs"), "--gate"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { code: a.status ?? -1, out: (a.stdout ?? "") + (a.stderr ?? "") };
    },
  };
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const T_IMPORT = 'import { useTranslation } from "react-i18next";';

/** live.key is referenced; dead.one/dead.two are orphaned (and baselined). */
const BASE: Omit<PurgeDef, "args"> = {
  app: {
    "a.tsx": [
      T_IMPORT,
      "export default function Screen() {",
      "  const { t } = useTranslation();",
      '  return <Text>{t("live.key")}</Text>;',
      "}",
    ].join("\n"),
  },
  en: { live: { key: "Live" }, dead: { one: "1", two: "2" } },
  bn: { live: { key: "লাইভ" }, dead: { one: "১", two: "২" } },
  baselineKeys: ["dead.one", "dead.two"],
};

// ── fault-injection anchors, one per safety property ─────────────────────────

const ANCHORS = {
  /** a matched key that is not orphaned refuses the whole purge. */
  liveRefusal: "if (live.length) {",
  /** selection only ever intersects the audit's ORPHANED set. */
  orphanIntersection: "else live.push(key);",
  /** dry-run disables every write, locales and baseline. */
  dryRunGuard: "const applyWrites = !dryRun;",
  /** the purged keys are removed from the baseline in the same run. */
  baselinePrune: "baseline.keys = baseline.keys.filter((k) => !selectedSet.has(k));",
} as const;

const FAULTS = {
  /** the refusal disappears: the run becomes a soft no-op (selection still guards). */
  noLiveRefusal: (s: string) => neutralize(s, ANCHORS.liveRefusal, "if (false) {"),
  /** selection turns permissive: the refusal must still block the write. */
  permissiveSelection: (s: string) =>
    neutralize(s, ANCHORS.orphanIntersection, "else { live.push(key); selected.push(key); }"),
  /** both barriers off: the live key actually gets deleted (bad outcome reachable). */
  allLiveBarriersOff: (s: string) => FAULTS.permissiveSelection(FAULTS.noLiveRefusal(s)),
  /** dry-run stops guarding: --dry-run writes anyway. */
  noDryRunGuard: (s: string) => neutralize(s, ANCHORS.dryRunGuard, "const applyWrites = true;"),
  /** the prune disappears: the self-check must catch the stale baseline. */
  noBaselinePrune: (s: string) => neutralize(s, ANCHORS.baselinePrune, "/* baseline pruning neutralised */"),
} as const;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("purging by namespace", () => {
  it("removes the orphaned keys from BOTH locales and prunes the baseline", () => {
    const r = runPurge({ ...BASE, args: ["dead"] });
    expect(r.code).toBe(0);
    expect(r.locale("en").dead).toBeUndefined();
    expect(r.locale("bn").dead).toBeUndefined();
    expect(r.locale("en").live).toEqual({ key: "Live" });
    expect(r.baseline().keys).toEqual([]);
    expect(r.out).toContain("purged 2 orphaned key(s)");
    expect(r.out).toContain("dead.*");
    // The write preserves the file shape: CRLF and a trailing newline.
    expect(r.read("i18n/locales/en/common.json")).toContain("\r\n");
    expect(r.read("i18n/locales/en/common.json").endsWith("}\r\n")).toBe(true);
  });

  it("leaves the sandbox gate clean once the orphans are gone (end-to-end)", () => {
    const r = runPurge({ ...BASE, args: ["dead"] });
    expect(r.code).toBe(0);
    const gate = r.auditGate();
    expect(gate.code).toBe(0);
    expect(gate.out).toContain("clean");
  });

  it("supports an exact key selector, leaving sibling keys alone", () => {
    const r = runPurge({ ...BASE, args: ["dead.one"] });
    expect(r.code).toBe(0);
    expect(r.locale("en").dead).toEqual({ two: "2" });
    expect(r.baseline().keys).toEqual(["dead.two"]);
  });

  it("is a no-op, not an error, when nothing matches", () => {
    const r = runPurge({ ...BASE, args: ["absent"] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("no orphaned keys match");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
  });
});

describe("refusing live keys (the safety property)", () => {
  it("refuses when a matched key is NOT orphaned, writing nothing", () => {
    const r = runPurge({ ...BASE, args: ["live"] });
    expect(r.code).toBe(2);
    expect(r.all).toContain("refused");
    expect(r.all).toContain("live.key");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
    expect(r.read("scripts/i18n-orphan-baseline.json")).toBe(
      JSON.stringify({ _comment: "fixture baseline", keys: BASE.baselineKeys }, null, 2) + "\n",
    );
  });

  it("refuses the WHOLE selection when one matched namespace still has live keys", () => {
    const r = runPurge({ ...BASE, args: ["dead", "live"] });
    expect(r.code).toBe(2);
    // dead.* was orphaned, but the mixed selection is refused as a unit.
    expect(r.locale("en").dead).toEqual({ one: "1", two: "2" });
  });

  it("flips to a soft no-op when the refusal is neutralised (non-vacuity)", () => {
    const r = runPurge({ ...BASE, args: ["live"], mutate: FAULTS.noLiveRefusal });
    expect(r.code).toBe(0);
    // No deletion: selection still intersects the audit's orphan set, so the
    // live key is never part of the purge -- the refusal only makes the
    // refusal case loud (exit 2, pinned by the test above).
    expect(r.out).toContain("no orphaned keys match");
    expect(r.locale("en").live).toEqual({ key: "Live" });
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
  });

  it("still refuses a PERMISSIVE selection (the refusal is load-bearing)", () => {
    const r = runPurge({ ...BASE, args: ["live"], mutate: FAULTS.permissiveSelection });
    expect(r.code).toBe(2);
    expect(r.all).toContain("refused");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
  });

  it("deletes the live key only with BOTH barriers off (the protection is not vacuous)", () => {
    const r = runPurge({ ...BASE, args: ["live"], mutate: FAULTS.allLiveBarriersOff });
    expect(r.code).toBe(0);
    expect(r.locale("en").live).toBeUndefined();
    expect(r.out).toContain("purged 1 orphaned key(s)");
  });
});

describe("--new (exactly the gate's new orphans)", () => {
  it("purges only keys absent from the baseline", () => {
    const en = { live: { key: "Live" }, dead: { one: "1", two: "2" }, fresh: { one: "x" } };
    const bn = { live: { key: "লাইভ" }, dead: { one: "১", two: "২" }, fresh: { one: "ক" } };
    const r = runPurge({ ...BASE, en, bn, args: ["--new"] });
    expect(r.code).toBe(0);
    expect(r.locale("en").fresh).toBeUndefined();
    // Baselined orphans are the ratchet's business, not --new's.
    expect(r.locale("en").dead).toEqual({ one: "1", two: "2" });
    expect(r.baseline().keys).toEqual(["dead.one", "dead.two"]);
  });

  it("reports nothing to purge on a clean tree", () => {
    const r = runPurge({ ...BASE, args: ["--new"] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("no new orphans");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
  });
});

describe("--dry-run", () => {
  it("reports the plan and writes nothing", () => {
    const r = runPurge({ ...BASE, args: ["dead", "--dry-run"] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("dry run — would purge");
    expect(r.out).toContain("dead.*");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
    expect(r.read("i18n/locales/bn/common.json")).toBe(CRLF(BASE.bn));
    expect(r.read("scripts/i18n-orphan-baseline.json")).toContain('"dead.one"');
  });

  it("writes once the dry-run guard is neutralised (non-vacuity)", () => {
    const r = runPurge({ ...BASE, args: ["dead", "--dry-run"], mutate: FAULTS.noDryRunGuard });
    expect(r.code).toBe(0);
    expect(r.locale("en").dead).toBeUndefined();
  });
});

describe("baseline handling", () => {
  it("fails loudly when the baseline is missing", () => {
    const r = runPurge({ ...BASE, noBaseline: true, args: ["dead"] });
    expect(r.code).toBe(1);
    expect(r.err).toContain("could not read scripts/i18n-orphan-baseline.json");
    expect(r.read("i18n/locales/en/common.json")).toBe(CRLF(BASE.en));
  });

  it("fails its own self-check when the baseline prune is neutralised (non-vacuity)", () => {
    const r = runPurge({ ...BASE, args: ["dead"], mutate: FAULTS.noBaselinePrune });
    expect(r.code).toBe(1);
    expect(r.err).toContain("the baseline still carries a purged key");
    // Locales were still written — the failure is specifically the ratchet.
    expect(r.locale("en").dead).toBeUndefined();
    expect(r.baseline().keys).toEqual(["dead.one", "dead.two"]);
  });

  it("emits the machine-readable plan under --json", () => {
    const r = runPurge({ ...BASE, args: ["dead", "--json"] });
    expect(r.code).toBe(0);
    expect(r.json?.purged).toEqual(["dead.one", "dead.two"]);
    expect(r.json?.baseline).toEqual({ before: 2, after: 0 });
    expect(r.json?.locales).toEqual({ before: 3, after: 1 });
    expect(r.json?.dryRun).toBe(false);
  });
});

describe("fault-injection contract", () => {
  it("every anchor still matches the shipped tool", () => {
    const src = fs.readFileSync(PURGE, "utf8").replace(/\r\n/g, "\n");
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      expect([name, src.includes(anchor)]).toEqual([name, true]);
    }
  });

  it("mutates the sandbox copy only, never the repo's tool", () => {
    const before = fs.readFileSync(PURGE, "utf8");
    runPurge({ ...BASE, args: ["dead"], mutate: FAULTS.noBaselinePrune });
    expect(fs.readFileSync(PURGE, "utf8")).toBe(before);
  });
});
