/**
 * tests/meta/flow-xcheck.test.ts
 *
 * Gate-level proof for maestro/tools/flow-xcheck.cjs (pre-commit stage 3).
 *
 * WHY THIS FILE EXISTS. stage 3 has four blocking tiers (missing selector, map
 * drift, dead copy, locale-only copy), two blocking input guards (the ratchet
 * baseline must exist; the orphan classification must run, because dead copy
 * admits only LIVE locale values) and two advisory tiers (masked copy; screen
 * affinity). Two run-time spawns are stubbed in every fixture here, since the
 * sandbox cannot run the real audits: scripts/audit-nav-integrity.cjs (check 5)
 * and scripts/audit-i18n-orphans.cjs (dead copy's live-locale classification).
 * Until now the only
 * coverage was three cases in scripts/pre-commit-harness.cjs, which exercise the
 * gate through the real hook — good for proving the hook is wired, useless for
 * proving a tier still FIRES. A gate that has been refactored into a no-op, or
 * whose `blocked = true` line was lost in an edit, still exits 0 on a clean tree
 * and still lets every harness case pass. That is the silent regression this
 * file exists to make impossible: every tier below is asserted against a
 * deliberately broken fixture, so "it blocks" is a fact about a bad tree rather
 * than an assumption carried over from the day the tier was written.
 *
 * HOW. The tool derives every input path from __dirname, so the harness copies
 * the SHIPPED script into a throwaway tree and lays out maestro/flows/**.yaml,
 * app/, components/, i18n/locales/en/, testid-map.json, the suppressions file and
 * the locale baseline around it. That runs the real file — not a reimplementation,
 * not a require() of exported helpers — against inputs small enough to reason
 * about, which is why a missing tier, a flipped severity or a reshaped fixture
 * is all visible here.
 *
 * NON-VACUITY. A fixture test that only ever asserts "exit 2" proves nothing if
 * the harness itself is broken. Every blocking tier is therefore paired with a
 * FAULT-INJECTED copy of the same script in which that tier's detector is
 * neutralised, and the suite asserts the outcome FLIPS. If a mutation silently
 * stopped applying (a rewritten line, a renamed variable), neutralize() throws
 * with the anchor text rather than returning an unmutated script — the one test
 * at the bottom re-checks every anchor against the shipped tool so that failure
 * is named instead of showing up as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "maestro", "tools", "flow-xcheck.cjs");

/** An empty ratchet baseline: present (so the missing-baseline guard is quiet) but granting nothing. */
const EMPTY_BASELINE = { _comment: "fixture", entries: [] };

interface FlowDef {
  /** maestro/flows-relative path -> YAML body (the `---` separator is added here). */
  flows?: Record<string, string>;
  /** app/-relative path -> source. */
  app?: Record<string, string>;
  /** components/-relative path -> source. */
  components?: Record<string, string>;
  /** i18n/locales/en/common.json contents. */
  locale?: Record<string, unknown>;
  /** testid-map.json `screens`, keyed relative to app/. */
  screens?: Record<string, { id: string; line: number }[]>;
  /** null omits flow-locale-baseline.json entirely (the input guard's fixture). */
  baseline?: { lit: string; reason?: string }[] | null;
  /** null omits flow-xcheck-suppressions.json. */
  suppressions?: { match: string; reason: string }[] | null;
  /**
   * Stub for scripts/audit-nav-integrity.cjs, which check 5 (screen affinity)
   * spawns at run time and the sandbox cannot run for real (no node_modules for
   * `typescript`). undefined = derive `screens` from this fixture's `screens`
   * keys, all reachable, so the advisory tier stays quiet; null = write no stub,
   * which exercises the tier's unavailable path.
   */
  audit?: { screens?: string[]; reachable?: string[] } | null;
  /**
   * Stub for scripts/audit-i18n-orphans.cjs, which check 3 (dead copy) spawns
   * at run time to classify locale keys LIVE vs ORPHANED (only LIVE values may
   * enter the corpus). undefined = clean stub (nothing orphaned, every locale
   * value counts as live); an object reports its `orphaned` keys as ORPHANED;
   * null = write no stub, which exercises the tier's refuse-to-run input guard.
   */
  i18nAudit?: { orphaned?: string[] } | null;
  /** Fault injection: rewrite the copied script. Never touches the repo copy. */
  mutate?: (src: string) => string;
}

/** The app screen every copy fixture renders, so the tier under test is the only one that can fire. */
const appEntry = (testID = "a.cta") =>
  ["export default function Entry() {", `  return <Pressable testID="${testID}"><Text>Continue</Text></Pressable>;`, "}"].join("\n");

/** A flow whose only copy assertion resolves in i18n, so copy tiers stay quiet unless a fixture says otherwise. */
const flow = (...steps: string[]) => ["appId: com.ride", "---", "- launchApp", ...steps].join("\n");

const tapCta = ['- tapOn:', '    id: "a.cta"'];

const CLEAN_APP = { "(auth)/entry.tsx": appEntry() };
const CLEAN_SCREENS = { "(auth)/entry.tsx": [{ id: "a.cta", line: 2 }] };
const CLEAN_LOCALE = { entry: { continue: "Continue" } };

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
 * that does not apply would leave an UNMUTATED tool in the sandbox, whose exit 0
 * would look exactly like the expected result and turn the non-vacuity proof
 * into a lie.
 */
function neutralize(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new Error(`fault-injection anchor not found in flow-xcheck.cjs: ${JSON.stringify(from)}`);
  }
  return src.replace(from, to);
}

interface GateRun {
  code: number;
  out: string;
  err: string;
  /** stdout + stderr, for assertions that only care that a message was printed. */
  all: string;
}

function runGate(f: FlowDef): GateRun {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-xcheck-fixture-"));
  sandboxes.push(root);

  let src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
  if (f.mutate) src = f.mutate(src);
  write(root, "maestro/tools/flow-xcheck.cjs", src);

  for (const [rel, body] of Object.entries(f.flows ?? {})) {
    write(root, `maestro/flows/${rel}`, body);
  }
  for (const [rel, body] of Object.entries(f.app ?? {})) write(root, `app/${rel}`, body);
  for (const [rel, body] of Object.entries(f.components ?? {})) write(root, `components/${rel}`, body);
  write(root, "i18n/locales/en/common.json", JSON.stringify(f.locale ?? {}, null, 2));
  write(
    root,
    "maestro/tools/testid-map.json",
    JSON.stringify({ total: 0, screens: f.screens ?? {} }, null, 2)
  );
  if (f.baseline !== null) {
    write(
      root,
      "maestro/tools/flow-locale-baseline.json",
      JSON.stringify({ entries: f.baseline ?? EMPTY_BASELINE.entries }, null, 2)
    );
  }
  if (f.suppressions !== null) {
    write(
      root,
      "maestro/tools/flow-xcheck-suppressions.json",
      JSON.stringify({ entries: f.suppressions ?? [] }, null, 2)
    );
  }
  if (f.audit !== null) {
    const allScreens = Object.keys(f.screens ?? {}).map((rel) => `app/${rel}`);
    const payload = JSON.stringify({
      screens: f.audit?.screens ?? allScreens,
      reachable: f.audit?.reachable ?? allScreens,
    });
    write(root, "scripts/audit-nav-integrity.cjs", `console.log(${JSON.stringify(payload)});\n`);
  }
  if (f.i18nAudit !== null) {
    const payload = JSON.stringify({
      orphans: (f.i18nAudit?.orphaned ?? []).map((key) => ({ key })),
    });
    write(root, "scripts/audit-i18n-orphans.cjs", `console.log(${JSON.stringify(payload)});\n`);
  }

  const r = spawnSync(process.execPath, [path.join(root, "maestro", "tools", "flow-xcheck.cjs")], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = r.stdout ?? "";
  const err = r.stderr ?? "";
  return { code: r.status ?? -1, out, err, all: out + err };
}

// ── the deliberate faults, one per tier ───────────────────────────────────────

const MISSING_ID = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- tapOn:', '    id: "a.ghost"', '- assertVisible: "Continue"') },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

const MAP_DRIFT_RENAMED = (): FlowDef => ({
  // The map still says a.cta lives in this file; the file now renders a.primary.
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"') },
  app: { "(auth)/entry.tsx": appEntry("a.primary") },
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

const MAP_DRIFT_DELETED_FILE = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"') },
  app: CLEAN_APP,
  screens: { "ghost.tsx": [{ id: "a.cta", line: 2 }] },
  locale: CLEAN_LOCALE,
});

const DEAD_COPY = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"', '- assertVisible: "Zzz nowhere on any screen"') },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

/** Hard-coded JSX: renders, so dead copy passes it, but no locale file carries it. */
const LOCALE_ONLY = (baseline: FlowDef["baseline"] = EMPTY_BASELINE.entries): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"', '- assertVisible: "Complete Registration"') },
  app: { "(auth)/entry.tsx": `${appEntry()}\nconst hint = <Text>Complete Registration</Text>;` },
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
  baseline,
});

/** `t('a.b')` contributes a KEY to the source corpus; a key never renders. */
const KEY_SHAPED_SOURCE = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "rider_activity.driver"') },
  app: { "(auth)/entry.tsx": `const { t } = useTranslation();\nt('rider_activity.driver');\n${appEntry()}` },
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

/**
 * The masking this gate must never allow again: the assertion's only match is
 * the value of an ORPHANED key (the purged confirm_ride.* shape) — the copy sits
 * in the locale file but no screen renders it, so the claim is dead.
 */
const ORPHAN_MASKED = (): FlowDef => ({
  flows: {
    "a.yaml": flow(...tapCta, '- assertVisible: "Continue"', '- assertVisible: "Ride Confirmed!"'),
  },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: { dead: { title: "Ride Confirmed!" }, entry: { continue: "Continue" } },
  i18nAudit: { orphaned: ["dead.title"] },
});

/** The same value under an orphaned key AND a live key still rescues: it renders via the live key. */
const ORPHAN_SHARED = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"') },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: { dead: { continue: "Continue" }, entry: { continue: "Continue" } },
  i18nAudit: { orphaned: ["dead.continue"] },
});

/**
 * Block-style matcher: the assertion keyword on one line, `text: "…"` on the
 * next. Invisible to the inline-only regex until 2026-10-05 — 51 such claims
 * were unchecked, 4 of them dead.
 */
const BLOCK_STYLE_DEAD = (): FlowDef => ({
  flows: {
    "a.yaml": flow(
      ...tapCta,
      "- assertVisible:",
      '    text: "Zzz ghost block copy"',
      '- assertVisible: "Continue"'
    ),
  },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

/** The same shape carrying copy that resolves — extraction must not turn into a hammer. */
const BLOCK_STYLE_LIVE = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, "- assertVisible:", '    text: "Continue"') },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

const MASKED = (): FlowDef => ({
  // "Documents Submitted" survives only as a mid-phrase fragment of admin's
  // longer live string — advisory. It is also, necessarily, not itself a locale
  // value, so check 3b would claim it; the baseline grants it to keep this
  // fixture about the advisory/blocking boundary and nothing else.
  flows: {
    "a.yaml": flow(...tapCta, '- assertVisible: "Continue"', '- assertVisible: "Documents Submitted"'),
  },
  app: { ...CLEAN_APP, "admin/docs.tsx": "<Text>No documents submitted</Text>" },
  screens: CLEAN_SCREENS,
  locale: { ...CLEAN_LOCALE, docs: { empty: "No documents submitted" } },
  baseline: [{ lit: "documents submitted", reason: "fixture: abbreviation of a longer live string" }],
});

/** A flow selecting an id whose owner screen the nav audit cannot route to. */
const AFFINITY = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- tapOn:', '    id: "dead.cta"', '- assertVisible: "Continue"') },
  app: { ...CLEAN_APP, "(main)/hidden/entry.tsx": appEntry("dead.cta") },
  screens: {
    ...CLEAN_SCREENS,
    "(main)/hidden/entry.tsx": [{ id: "dead.cta", line: 2 }],
  },
  locale: CLEAN_LOCALE,
  audit: {
    screens: ["app/(auth)/entry.tsx", "app/(main)/hidden/entry.tsx"],
    reachable: ["app/(auth)/entry.tsx"],
  },
});

const CLEAN = (): FlowDef => ({
  flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Continue"') },
  app: CLEAN_APP,
  screens: CLEAN_SCREENS,
  locale: CLEAN_LOCALE,
});

// ── fault injection anchors, one per tier ─────────────────────────────────────

const ANCHORS = {
  missingId: "if (!idOwner.has(m[1])) missing.push({ f: rel, id: m[1] });",
  drift: "} else if (!src.includes(id)) {",
  deadCopy: "deadCopy.push({ ...c, cands });",
  localeMiss: "localeMiss.push({ ...c, cand: hit.cand, via: hit.w.just });",
  localeBaseline: "if (localeBaseline.has(x.cand)) continue;",
  missingBaselineGuard: 'violation list.");\n    process.exit(2);',
  orphanExclusion: "if (!orphanedKeys.has(k)) liveValues.add(t);",
  orphanAuditGuard: 'Restore the audit, then re-run.");\n    process.exit(2);',
  blockText: "const m = line.match(COPY_RE) || line.match(TEXT_LINE_RE);",
  affinity: "hits.push({ screen, id });",
} as const;

const FAULTS = {
  /** check 1 stops collecting unresolvable selectors. */
  missingId: (s: string) => neutralize(s, ANCHORS.missingId, "if (false) missing.push({ f: rel, id: m[1] });"),
  /** check 2 stops comparing the map's attribution against app/ source. */
  drift: (s: string) => neutralize(s, ANCHORS.drift, "} else if (false) {"),
  /** check 3 stops collecting unresolvable copy. */
  deadCopy: (s: string) => neutralize(s, ANCHORS.deadCopy, "if (false) deadCopy.push({ ...c, cands });"),
  /** check 3b stops collecting hard-coded literals. */
  localeMiss: (s: string) =>
    neutralize(s, ANCHORS.localeMiss, "if (false) localeMiss.push({ ...c, cand: hit.cand, via: hit.w.just });"),
  /**
   * check 3b stops honouring the ratchet, so grandfathered literals count as
   * new violations again. Direction matters: making the filter unconditional
   * would skip every literal and fail OPEN, which proves nothing about whether
   * the baseline is consulted.
   */
  localeBaseline: (s: string) => neutralize(s, ANCHORS.localeBaseline, "/* ratchet filter removed */"),
  /** the missing-baseline input guard degrades to an empty baseline. */
  missingBaselineGuard: (s: string) => neutralize(s, ANCHORS.missingBaselineGuard, 'violation list.");\n    process.exit(0);'),
  /**
   * check 3 stops excluding ORPHANED keys' values from the corpus, so the
   * masking this rule closes comes back. Direction matters: widening the corpus
   * makes the orphan-masked fixture PASS, which is the finding flipping.
   */
  orphanExclusion: (s: string) =>
    neutralize(s, ANCHORS.orphanExclusion, "if (true) liveValues.add(t);"),
  /** the orphan-classification input guard degrades to a pass instead of refusing. */
  orphanAuditGuard: (s: string) =>
    neutralize(s, ANCHORS.orphanAuditGuard, 'Restore the audit, then re-run.");\n    process.exit(0);'),
  /** check 3 stops reading block-style `text:` matchers (the 2026-10-05 blind spot returns). */
  blockText: (s: string) => neutralize(s, ANCHORS.blockText, "const m = line.match(COPY_RE);"),
  /** check 5 stops collecting ids whose owner screen is outside reachable. */
  affinity: (s: string) => neutralize(s, ANCHORS.affinity, "if (false) hits.push({ screen, id });"),
} as const;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("flow-xcheck: healthy tree", () => {
  it("exits 0 and reports every tier clean", () => {
    const r = runGate(CLEAN());
    expect(r.out).toContain("id: selectors: 1");
    expect(r.out).toContain("✅ no dead-copy candidates");
    expect(r.out).toContain("✅ no masked-copy candidates");
    expect(r.out).toContain("✅ locale-only copy: clean");
    expect(r.out).toContain(
      "✅ screen affinity: every flow-selected id lives on a reachable screen"
    );
    expect(r.out).not.toContain("❌");
    expect(r.code).toBe(0);
  });

  it("counts text that resolves only in components/ — the corpus gap that once hid live copy", () => {
    // "Tap to replace document" reaches the user only through a shared
    // component. It is baselined so this fixture isolates the corpus question:
    // with components/ unscanned it would be DEAD COPY (exit 2); scanned, it is
    // a locale-only miss the ratchet grandfathers (exit 0).
    const r = runGate({
      flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Tap to replace document"') },
      app: CLEAN_APP,
      components: { "DocumentUploadCard.tsx": "<Text>Tap to replace document</Text>" },
      screens: CLEAN_SCREENS,
      locale: CLEAN_LOCALE,
      baseline: [{ lit: "tap to replace document", reason: "fixture" }],
    });
    expect(r.out).toContain("✅ no dead-copy candidates");
    expect(r.code).toBe(0);
  });
});

describe("check 1 — MISSING selector (blocking)", () => {
  it("blocks a flow selecting an id the map does not record", () => {
    const r = runGate(MISSING_ID());
    expect(r.out).toContain("❌ MISSING from testid-map.json: 1");
    expect(r.out).toContain("a.ghost");
    expect(r.code).toBe(2);
  });

  it("does not block once the detector is neutralised (non-vacuity)", () => {
    const r = runGate({ ...MISSING_ID(), mutate: FAULTS.missingId });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("MISSING from testid-map.json");
  });
});

describe("check 2 — MAP DRIFT (blocking)", () => {
  it("blocks when the attributed app file no longer contains the id", () => {
    const r = runGate(MAP_DRIFT_RENAMED());
    expect(r.out).toContain("❌ MAP DRIFT (map is stale)");
    expect(r.out).toContain("id absent from the file the map attributes it to");
    expect(r.out).toContain("node maestro/tools/testid-manifest.cjs");
    expect(r.code).toBe(2);
  });

  it("blocks when the attributed app file is gone entirely", () => {
    const r = runGate(MAP_DRIFT_DELETED_FILE());
    expect(r.out).toContain("map file missing from app/");
    expect(r.code).toBe(2);
  });

  it("does not block once the detector is neutralised (non-vacuity)", () => {
    const r = runGate({ ...MAP_DRIFT_RENAMED(), mutate: FAULTS.drift });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("MAP DRIFT");
  });
});

describe("check 3 — DEAD COPY (blocking, promoted from advisory 2026-10-03)", () => {
  it("blocks copy that resolves in neither i18n nor app/components source", () => {
    const r = runGate(DEAD_COPY());
    expect(r.out).toContain("❌ DEAD COPY (blocking)");
    expect(r.out).toContain("Zzz nowhere on any screen");
    expect(r.code).toBe(2);
  });

  it("still honours an explicit suppression", () => {
    const r = runGate({
      ...DEAD_COPY(),
      suppressions: [{ match: "zzz nowhere on any screen", reason: "fixture: external OS dialog" }],
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("✅ no dead-copy candidates");
  });

  it("does not let a dotted i18n KEY harvested from source rescue a dead claim", () => {
    // A key-shaped literal that is in no locale value is dropped from the
    // corpus. If that exclusion regressed, `t('rider_activity.driver')` would
    // satisfy an assertion on the key itself — the masking mechanism the
    // provenance rule exists to remove.
    const r = runGate(KEY_SHAPED_SOURCE());
    expect(r.out).toContain("❌ DEAD COPY (blocking)");
    expect(r.code).toBe(2);
  });

  it("does not let an orphaned key's value rescue a dead claim (live-values corpus)", () => {
    // The purged confirm_ride.* shape: the copy sits in common.json under a key
    // nothing renders, so it can never appear on device. The old corpus counted
    // it as a rescue; the live-values corpus must not.
    const r = runGate(ORPHAN_MASKED());
    expect(r.out).toContain("❌ DEAD COPY (blocking)");
    expect(r.out).toContain("Ride Confirmed!");
    expect(r.code).toBe(2);
  });

  it("still counts a value a LIVE key carries, even when an orphaned key shares it", () => {
    // Values decide, not keys: "Continue" renders through entry.continue, so the
    // dead.continue twin must not poison it.
    const r = runGate(ORPHAN_SHARED());
    expect(r.out).toContain("✅ no dead-copy candidates");
    expect(r.code).toBe(0);
  });

  it("does not block once the detector is neutralised (non-vacuity)", () => {
    const r = runGate({ ...DEAD_COPY(), mutate: FAULTS.deadCopy });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("DEAD COPY (blocking)");
  });

  it("lets the orphaned value mask the claim again once the exclusion is neutralised (non-vacuity)", () => {
    const r = runGate({ ...ORPHAN_MASKED(), mutate: FAULTS.orphanExclusion });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("DEAD COPY (blocking)");
  });

  it("checks block-style `text:` matchers, not just inline quotes (blind spot until 2026-10-05)", () => {
    // `- assertVisible:` with `text: "…"` on its own line matched no line-regex
    // before, so these claims were UNCHECKED — 51 across ~20 real flows, 4 of
    // them dead. A claim the gate cannot see is worse than a masked one: the
    // "every text assertion resolves" pass message would be a lie.
    const r = runGate(BLOCK_STYLE_DEAD());
    expect(r.out).toContain("❌ DEAD COPY (blocking)");
    expect(r.out).toContain("Zzz ghost block copy");
    expect(r.code).toBe(2);
  });

  it("keeps block-style copy that resolves", () => {
    const r = runGate(BLOCK_STYLE_LIVE());
    expect(r.out).toContain("✅ no dead-copy candidates");
    expect(r.code).toBe(0);
  });

  it("does not see block-style copy once the extractor is neutralised (non-vacuity)", () => {
    const r = runGate({ ...BLOCK_STYLE_DEAD(), mutate: FAULTS.blockText });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("DEAD COPY (blocking)");
  });
});

describe("check 3 input guard — orphan classification (refuses to run)", () => {
  it("refuses to run, loudly, when the orphan audit cannot run", () => {
    // Degrading to the full value set would silently re-enable the exact masking
    // the live-values corpus exists to close.
    const r = runGate({ ...CLEAN(), i18nAudit: null });
    expect(r.code).toBe(2);
    expect(r.err).toContain("orphaned key's value can never mask a dead flow assertion");
    expect(r.err).toContain("refusing");
    // Same ci.yml constraint as check 5: hook output must never say "skipped".
    expect(r.all).not.toMatch(/skip(ping|ped)/i);
  });

  it("does not block once the guard is neutralised (non-vacuity)", () => {
    const r = runGate({ ...CLEAN(), i18nAudit: null, mutate: FAULTS.orphanAuditGuard });
    expect(r.code).toBe(0);
  });
});

describe("check 3b — LOCALE-ONLY COPY (blocking, ratcheted)", () => {
  it("blocks a NEW hard-coded literal that resolves in app source but no locale", () => {
    const r = runGate(LOCALE_ONLY());
    expect(r.out).toContain("❌ LOCALE-ONLY COPY (blocking)");
    expect(r.out).toContain('"complete registration"');
    expect(r.code).toBe(2);
  });

  it("passes the same literal once it is in the ratchet baseline", () => {
    const r = runGate(LOCALE_ONLY([{ lit: "complete registration", reason: "fixture" }]));
    expect(r.out).toContain("✅ locale-only copy: clean");
    expect(r.out).toContain("baselined hard-coded literal(s) remain");
    expect(r.code).toBe(0);
  });

  it("does not block once the detector is neutralised (non-vacuity)", () => {
    const r = runGate({ ...LOCALE_ONLY(), mutate: FAULTS.localeMiss });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("LOCALE-ONLY COPY (blocking)");
  });

  it("blocks a baselined literal once the ratchet filter is neutralised (non-vacuity)", () => {
    const r = runGate({
      ...LOCALE_ONLY([{ lit: "complete registration", reason: "fixture" }]),
      mutate: FAULTS.localeBaseline,
    });
    expect(r.out).toContain("❌ LOCALE-ONLY COPY (blocking)");
    expect(r.code).toBe(2);
  });

  it("refuses to run, loudly, when the baseline file is missing", () => {
    // Degrading to an empty baseline would report all 39 grandfathered literals
    // as new violations and block every flow commit with a misleading list.
    const r = runGate({ ...CLEAN(), baseline: null });
    expect(r.code).toBe(2);
    expect(r.err).toContain("is missing, so the locale-only ratchet cannot run");
    expect(r.err).toContain("git checkout -- maestro/tools/flow-locale-baseline.json");
    expect(r.err).toContain("do NOT commit");
  });

  it("does not block once the missing-baseline guard is neutralised (non-vacuity)", () => {
    const r = runGate({ ...CLEAN(), baseline: null, mutate: FAULTS.missingBaselineGuard });
    expect(r.code).toBe(0);
  });
});

describe("check 4 — MASKED COPY (advisory, must never block)", () => {
  it("reports a fragment rescue without failing the commit", () => {
    const r = runGate(MASKED());
    expect(r.out).toContain("⚠ MASKED COPY (advisory, not blocking)");
    expect(r.out).toContain("only inside");
    expect(r.code).toBe(0);
  });
});

describe("check 5 — SCREEN AFFINITY (advisory, must never block)", () => {
  it("warns when a flow-selected id lives on a screen outside the audit's reachable set", () => {
    const r = runGate(AFFINITY());
    expect(r.out).toContain("⚠ SCREEN AFFINITY (advisory, not blocking)");
    expect(r.out).toContain("app/(main)/hidden/entry.tsx");
    // The finding must name the FLOW that selects the id, not just the id —
    // otherwise the report tells the author nothing they can open.
    expect(r.out).toContain("dead.cta  <- maestro/flows/a.yaml");
    expect(r.code).toBe(0);
  });

  it("says so loudly (and still passes) when the nav audit cannot run at all", () => {
    // The ci.yml `precommit-gates` job fails on any skipped/skipping line in
    // hook output, so this tier must never reach for that vocabulary either.
    const r = runGate({ ...CLEAN(), audit: null });
    expect(r.out).toContain("SCREEN AFFINITY (advisory, not blocking): unavailable");
    expect(r.out).not.toMatch(/skip(ping|ped)/i);
    expect(r.code).toBe(0);
  });

  it("does not warn once the collector is neutralised (non-vacuity)", () => {
    const r = runGate({ ...AFFINITY(), mutate: FAULTS.affinity });
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("hold flow-selected testIDs");
  });
});

describe("exempt paths", () => {
  it("does not text-check env-interpolated assertions", () => {
    const r = runGate({
      ...CLEAN(),
      flows: { "a.yaml": flow(...tapCta, '- assertVisible: "Hello ${NAME}"') },
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("1 env-interpolated assertions not text-checked");
  });

  it("warns structurally about a missing `---` separator without blocking", () => {
    const r = runGate({
      ...CLEAN(),
      flows: { "a.yaml": ["appId: com.ride", "- launchApp", ...tapCta, '- assertVisible: "Continue"'].join("\n") },
    });
    expect(r.out).toContain("⚠ structural warnings: 1");
    expect(r.code).toBe(0);
  });

  it("exits 1 on an unreadable map rather than reporting an empty id set", () => {
    // The silent-degradation shape: a broken input read as "no findings" would
    // pass every commit while checking nothing.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-xcheck-fixture-"));
    sandboxes.push(root);
    write(root, "maestro/tools/flow-xcheck.cjs", fs.readFileSync(TOOL, "utf8"));
    write(root, "maestro/tools/testid-map.json", "{ not json");
    write(root, "maestro/flows/a.yaml", flow(...tapCta));
    write(root, "maestro/tools/flow-locale-baseline.json", JSON.stringify(EMPTY_BASELINE));
    const r = spawnSync(process.execPath, [path.join(root, "maestro", "tools", "flow-xcheck.cjs")], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(r.status).toBe(1);
    expect((r.stderr ?? "") + (r.stdout ?? "")).toContain("cannot read");
  });
});

describe("fault-injection contract", () => {
  it("every anchor still matches the shipped tool", () => {
    // If a refactor moves any of these lines, the non-vacuity tests above would
    // fail with an opaque "expected 0, received 2" from an UNMUTATED script.
    // This names the drift instead.
    const src = fs.readFileSync(TOOL, "utf8").replace(/\r\n/g, "\n");
    for (const [name, anchor] of Object.entries(ANCHORS)) {
      expect([name, src.includes(anchor)]).toEqual([name, true]);
    }
  });

  it("mutates the sandbox copy only, never the repo's tool", () => {
    const before = fs.readFileSync(TOOL, "utf8");
    runGate({ ...DEAD_COPY(), mutate: FAULTS.deadCopy });
    expect(fs.readFileSync(TOOL, "utf8")).toBe(before);
  });
});
