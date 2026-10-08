/**
 * audit-i18n-dead-refs.test.ts — fault-injection suite for
 * scripts/audit-i18n-dead-refs.cjs, the promoted orphan-reference sweep.
 *
 * WHAT IS BEING GUARDED. The audit consumes scripts/audit-i18n-orphans.cjs
 * --json AT RUN TIME (never a snapshot) and reports a locale key that the
 * orphan audit calls ORPHANED while the same copy is still hard-coded in a
 * runtime screen. Tier A blocks; tier B (flow claims) is advisory.
 *
 * The SHIPPED tool is COPIED into a throwaway tree and run there against one
 * deliberately broken fixture per tier, so nothing here is a reimplementation
 * of the logic: a detector that stops working cannot pass by agreeing with a
 * reimplementation. Every blocking tier is PAIRED with a fault-injected copy
 * whose detector is neutralised, asserting the outcome FLIPS — a tier that has
 * become a no-op fails this suite instead of passing quietly.
 *
 * The orphan classification is supplied as a STUB (scripts/audit-i18n-orphans.cjs
 * in the sandbox emitting a fixed --json payload) rather than by running the
 * real AST audit: what is under test here is how this audit CONSUMES the
 * classification and where it refuses to proceed, not the AST resolver, which
 * tests/meta/audit-i18n-orphans.test.ts owns. The real-tree test at the bottom
 * closes the loop by running both together against the actual repository.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "scripts", "audit-i18n-dead-refs.cjs");
const BASELINE_REL = "scripts/i18n-dead-refs-baseline.json";

/** Copy is longer than the 16-char floor so a fixture value is comparable. */
const DEAD = { title: "Re-upload your documents today" };
const DEAD_NORM = "re-upload your documents today";
const DEAD_SHORT = { title: "Retry" }; // below the floor: never reported

interface DeadRef {
  key: string;
  value: string;
  files: string[];
  evidence: string;
}

interface FlowClaimSite {
  file: string;
  line: number;
  raw: string;
}

interface DeadRefReport {
  floor: number;
  locale: { file: string; keys: number };
  scan: {
    sourceFiles: number;
    orphanKeys: number;
    belowFloor: number;
    flowClaims: number;
    comparableClaims: number;
  };
  deadCopyInSource: DeadRef[];
  deadCopyInFlow: { key: string; value: string; claims: FlowClaimSite[] }[];
  gate?: {
    baseline: string;
    baselined: number;
    pairs: number;
    new: DeadRef[];
    stale: string[];
    passed: boolean;
  };
}

interface Def {
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  components?: Record<string, string>;
  /** maestro/-relative .yaml path -> body. */
  flows?: Record<string, string>;
  en?: Record<string, unknown>;
  /** Keys the stub orphan audit reports as ORPHANED. */
  orphaned?: string[];
  /** Stub's exit code; non-zero models an audit that cannot run. */
  orphanExit?: number;
  /** Raw text the stub prints instead of JSON (models unparsable output). */
  orphanRaw?: string;
  /** Omit the stub entirely, modelling a missing audit. */
  noOrphanStub?: boolean;
  /** Omit the en locale, modelling an unreadable tree. */
  noLocale?: boolean;
  gate?: boolean;
  text?: boolean;
  /** Baseline JSON written to scripts/i18n-dead-refs-baseline.json. */
  baseline?: unknown;
  /** Omit the baseline entirely. */
  noBaseline?: boolean;
  /** Fault injection: rewrite the copied script. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

interface Run {
  code: number;
  out: string;
  err: string;
  all: string;
  json: DeadRefReport | null;
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
 * that did not apply would leave an UNMUTATED tool whose output looks exactly
 * like the expected result and turn the non-vacuity proof into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in audit-i18n-dead-refs.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

function runAudit(f: Def): Run {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-dead-refs-fixture-"));
  sandboxes.push(root);

  let src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
  if (f.mutate) src = f.mutate(src);
  write(root, "scripts/audit-i18n-dead-refs.cjs", src);

  // The orphan classification this audit consumes, as a stub. A non-zero
  // `orphanExit` models an audit that cannot run at all.
  if (!f.noOrphanStub) {
    if (f.orphanExit) {
      write(
        root,
        "scripts/audit-i18n-orphans.cjs",
        `#!/usr/bin/env node\nconsole.error("stub audit failed");\nprocess.exit(${f.orphanExit});\n`,
      );
    } else {
      const payload =
        f.orphanRaw !== undefined
          ? f.orphanRaw
          : JSON.stringify({
              locales: { en: { file: "i18n/locales/en/common.json", keys: 1 }, bn: { file: "x", keys: 1 } },
              scan: { files: 1, staticCalls: 1, dynamicCalls: 0, unresolvedDynamic: 0 },
              orphans: (f.orphaned ?? []).map((key) => ({ key, locales: ["en"] })),
              shielded: [],
              missing: [],
              parity: { onlyInEn: [], onlyInBn: [] },
              dynamic: [],
            });
      write(root, "scripts/audit-i18n-orphans.cjs", `#!/usr/bin/env node\nconsole.log(${JSON.stringify(payload)});\n`);
    }
  }

  if (f.noLocale) {
    // Deliberately write nothing where the locale belongs.
  } else {
    write(root, "i18n/locales/en/common.json", JSON.stringify(f.en ?? { dead: DEAD }, null, 2));
  }

  if (!f.noBaseline && f.baseline !== undefined) {
    write(root, BASELINE_REL, JSON.stringify(f.baseline, null, 2));
  }

  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  for (const [rel, body] of Object.entries(f.components ?? {})) write(root, `components/${rel}`, body);
  for (const [rel, body] of Object.entries(f.flows ?? {})) write(root, `maestro/${rel}`, body);

  const args = [
    path.join(root, "scripts", "audit-i18n-dead-refs.cjs"),
    ...(f.gate ? ["--gate"] : []),
    ...(f.text ? [] : ["--json"]),
  ];
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  let json: DeadRefReport | null = null;
  if (!f.text) {
    try {
      json = JSON.parse(out) as DeadRefReport;
    } catch {
      json = null;
    }
  }
  return { code: r.status ?? -1, out, err, all: out + err, json };
}

/** The screen that hard-codes the dead key's copy — the defect under test. */
const SCREEN = `export default function S() {
  return <Text>${DEAD_NORM}</Text>;
}
`;

// ─── healthy tree ───────────────────────────────────────────────────────────

describe("audit-i18n-dead-refs: healthy tree", () => {
  it("reports a dead key whose copy is hard-coded, naming the file", () => {
    const r = runAudit({ app: { "s.tsx": SCREEN }, orphaned: ["dead.title"] });
    expect(r.code).toBe(0);
    expect(r.json!.deadCopyInSource).toHaveLength(1);
    expect(r.json!.deadCopyInSource[0].key).toBe("dead.title");
    expect(r.json!.deadCopyInSource[0].files).toEqual(["app/s.tsx"]);
    expect(r.json!.deadCopyInSource[0].value).toBe(DEAD.title);
  });

  it("counts the keys below the matching floor instead of reporting them", () => {
    const r = runAudit({
      app: { "s.tsx": `export default function S() { return <Text>Retry</Text>; }\n` },
      en: { dead: DEAD_SHORT },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInSource).toHaveLength(0);
    expect(r.json!.scan.belowFloor).toBe(1);
  });

  it("does not report copy whose key is LIVE (referenced by a t() call)", () => {
    // The distinction the whole audit rests on: hard-coded copy alone is not a
    // finding. It only matters when the key the copy belongs to is dead.
    const r = runAudit({
      app: { "s.tsx": `import { useTranslation } from "react-i18next";\nexport default function S() {\n  const { t } = useTranslation();\n  return <Text>{t("dead.title")}</Text>;\n}\n` },
      orphaned: [],
    });
    expect(r.json!.deadCopyInSource).toHaveLength(0);
    expect(r.json!.deadCopyInFlow).toHaveLength(0);
  });

  it("ignores copy under app/api, __tests__ and *.test.* (server + tests do not render)", () => {
    const r = runAudit({
      app: {
        "api/x.ts": `const s = "${DEAD_NORM}";\n`,
        "__tests__/x.tsx": `const s = "${DEAD_NORM}";\n`,
        "y.test.tsx": `const s = "${DEAD_NORM}";\n`,
      },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInSource).toHaveLength(0);
  });
});

// ─── tier A: DEAD COPY IN SOURCE (blocking, ratcheted) ───────────────────────

describe("tier A — dead copy in source (blocking)", () => {
  it("blocks a pair absent from the ratchet baseline", () => {
    const r = runAudit({ app: { "s.tsx": SCREEN }, orphaned: ["dead.title"], gate: true, baseline: { keys: [] } });
    expect(r.code).toBe(2);
    expect(r.json!.gate!.new.map((d) => d.key)).toEqual(["dead.title"]);
    expect(r.json!.gate!.passed).toBe(false);
  });

  it("passes once the pair is baselined", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: ["dead.title"] },
    });
    expect(r.code).toBe(0);
    expect(r.json!.gate!.new).toEqual([]);
    expect(r.json!.gate!.passed).toBe(true);
  });

  it("does not block once the source detector is neutralised (non-vacuity)", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: [] },
      mutate: (s) =>
        neutralize(
          s,
          "const files = sources.filter(([, text]) => text.includes(nv)).map(([rel]) => rel);",
          "const files = [];",
        ),
    });
    expect(r.code).toBe(0);
    expect(r.json!.deadCopyInSource).toHaveLength(0);
  });

  it("blocks a baselined pair once the ratchet filter is neutralised (non-vacuity)", () => {
    // The fault makes the gate IGNORE the baseline, so a pair that is
    // legitimately baselined is reported as new. That is the direction that
    // proves the filter is load-bearing: if consulting `baselined` stopped
    // mattering, this run would pass and the ratchet would be decorative.
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: ["dead.title"] },
      mutate: (s) =>
        neutralize(
          s,
          "const fresh = r.deadCopyInSource.filter((d) => !baselined.has(d.key));",
          "const fresh = r.deadCopyInSource.filter(() => true);",
        ),
    });
    expect(r.code).toBe(2);
    expect(r.json!.gate!.new.map((d) => d.key)).toEqual(["dead.title"]);
  });

  it("reports a stale baseline entry without blocking (bookkeeping cannot fail the gate)", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: ["dead.title", "gone.key"] },
    });
    expect(r.code).toBe(0);
    expect(r.json!.gate!.stale).toEqual(["gone.key"]);
  });

  it("refuses to run, loudly, when the baseline is missing", () => {
    const r = runAudit({ app: { "s.tsx": SCREEN }, orphaned: ["dead.title"], gate: true, noBaseline: true });
    expect(r.code).toBe(2);
    expect(r.err).toContain("is missing");
    expect(r.err).toContain("do NOT commit without it");
  });

  it("refuses to run, loudly, when the baseline is malformed", () => {
    const r = runAudit({ app: { "s.tsx": SCREEN }, orphaned: ["dead.title"], gate: true, baseline: { nope: 1 } });
    expect(r.code).toBe(2);
    expect(r.err).toContain("could not read");
  });
});

// ─── tier B: DEAD COPY IN A FLOW CLAIM (advisory, never blocks) ──────────────

describe("tier B — dead copy in a flow claim (advisory)", () => {
  const FLOW = `appId: com.ride.bd
---
- launchApp:
    appId: com.ride.bd
- assertVisible: "${DEAD.title}"
`;

  it("reports the claim and the file:line without blocking", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "flows/a.yaml": FLOW },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: ["dead.title"] },
    });
    expect(r.code).toBe(0);
    expect(r.json!.deadCopyInFlow).toHaveLength(1);
    expect(r.json!.deadCopyInFlow[0].key).toBe("dead.title");
    expect(r.json!.deadCopyInFlow[0].claims[0].file).toBe("maestro/flows/a.yaml");
    expect(r.json!.deadCopyInFlow[0].claims[0].line).toBe(5);
  });

  it("does not see the claim once the tier-B detector is neutralised (non-vacuity)", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "flows/a.yaml": FLOW },
      orphaned: ["dead.title"],
      gate: true,
      baseline: { keys: ["dead.title"] },
      mutate: (s) => neutralize(s, "const hits = comparable.filter((c) => c.norm === nv);", "const hits = [];"),
    });
    expect(r.json!.deadCopyInFlow).toHaveLength(0);
  });

  it("counts a block-style `text:` matcher, as flow-xcheck does", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "flows/a.yaml": `appId: com.ride.bd\n---\n- assertVisible:\n    text: "${DEAD.title}"\n` },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInFlow).toHaveLength(1);
  });

  it("ignores a comment line (documentation is not an assertion)", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "flows/a.yaml": `appId: com.ride.bd\n---\n# assertVisible: "${DEAD.title}"\n` },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInFlow).toHaveLength(0);
  });

  it("ignores a bare regex claim, which pins no copy", () => {
    // ".*" strips to nothing; letting it match would attach every dead key to
    // every wildcard flow and bury the finding.
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "flows/a.yaml": `appId: com.ride.bd\n---\n- assertVisible: ".*"\n` },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInFlow).toHaveLength(0);
  });

  it("ignores flows under maestro/tools (they are not flows)", () => {
    const r = runAudit({
      app: { "s.tsx": SCREEN },
      flows: { "tools/x.yaml": `appId: com.ride.bd\n---\n- assertVisible: "${DEAD.title}"\n` },
      orphaned: ["dead.title"],
    });
    expect(r.json!.deadCopyInFlow).toHaveLength(0);
  });
});

// ─── the run-time classification guards ──────────────────────────────────────
// The orphan list is consumed at RUN time. If it cannot be obtained, every
// tier-A check would vacuously pass (there would be no dead keys to compare).
// Refusing loudly is the load-bearing behaviour, and each guard is paired with
// a mutation proving the guard is what stopped the run.

describe("orphan-classification guards (the audit refuses rather than degrading)", () => {
  const BAD = { app: { "s.tsx": SCREEN }, orphaned: ["dead.title"], gate: true, baseline: { keys: [] } };

  it("refuses when the orphan audit exits non-zero", () => {
    const r = runAudit({ ...BAD, orphanExit: 1 });
    expect(r.code).toBe(2);
    expect(r.err).toContain("did not run");
    expect(r.err).toContain("degrading");
  });

  it("refuses when the orphan audit emits unparsable output", () => {
    const r = runAudit({ ...BAD, orphanRaw: "not json at all" });
    expect(r.code).toBe(2);
    expect(r.err).toContain("no usable JSON");
  });

  it("refuses when the orphan audit emits no `orphans` array", () => {
    const r = runAudit({ ...BAD, orphanRaw: JSON.stringify({ scan: {} }) });
    expect(r.code).toBe(2);
    expect(r.err).toContain("no `orphans` array");
  });

  it("refuses when the orphan audit is absent entirely", () => {
    const r = runAudit({ ...BAD, noOrphanStub: true });
    expect(r.code).toBe(2);
    expect(r.err).toContain("did not run");
  });

  it("exits 1 when the en locale cannot be read", () => {
    const r = runAudit({ ...BAD, noLocale: true });
    expect(r.code).toBe(1);
    expect(r.err).toContain("i18n/locales/en/common.json");
  });

  it("blocks on a NEW pair once the missing-classification guard is neutralised (non-vacuity)", () => {
    // Proves the guard is what produced exit 2: with it removed the run
    // continues, and the pair blocks for the ordinary reason instead.
    const r = runAudit({
      ...BAD,
      mutate: (s) =>
        neutralize(s, "const orphans = orphanClassification();\n  if (orphans === null) process.exit(2);", "const orphans = new Set(['dead.title']);"),
    });
    expect(r.code).toBe(2);
    expect(r.json!.gate!.new.map((d) => d.key)).toEqual(["dead.title"]);
  });
});

// ─── real tree ──────────────────────────────────────────────────────────────

describe("the committed ratchet stays in sync with the real tree", () => {
  it("passes --gate on this repository: every dead-copy pair is baselined, none new", () => {
    const r = spawnSync(process.execPath, [TOOL, "--gate", "--json"], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(r.status).toBe(0);
    const j = JSON.parse(r.stdout) as DeadRefReport;
    expect(j.gate?.passed).toBe(true);
    expect(j.gate?.new).toEqual([]);
    // The 13 keys measured on 2026-10-05 when the gate was introduced. A DROP
    // is progress (a screen was wired or the key purged) and wants the
    // baseline entry deleted; a RISE means a new dead-copy pair and means this
    // pin is wrong. Either way the baseline must shrink, never grow.
    expect(j.deadCopyInSource.length).toBe(13);
    // The orphan classification really is being consumed, not stubbed.
    expect(j.scan.orphanKeys).toBeGreaterThan(0);
    expect(j.scan.sourceFiles).toBeGreaterThan(100);

    const baseline = JSON.parse(fs.readFileSync(path.join(REPO, ...BASELINE_REL.split("/")), "utf8")) as {
      keys: string[];
    };
    expect(new Set(baseline.keys).size).toBe(baseline.keys.length);
    expect([...baseline.keys].sort()).toEqual(baseline.keys);
  });

  it("agrees with the orphan audit it consumes: every pair's key really is ORPHANED", () => {
    // The audit must not invent dead keys; this is the cross-tool invariant.
    const mine = spawnSync(process.execPath, [TOOL, "--json"], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const theirs = spawnSync(process.execPath, [path.join(REPO, "scripts", "audit-i18n-orphans.cjs"), "--json"], {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const orphans = new Set(
      (JSON.parse(theirs.stdout) as { orphans: { key: string }[] }).orphans.map((o) => o.key),
    );
    const pairs = (JSON.parse(mine.stdout) as DeadRefReport).deadCopyInSource.map((d) => d.key);
    expect(pairs.length).toBeGreaterThan(0);
    for (const key of pairs) expect(orphans.has(key)).toBe(true);
  });
});