/**
 * tests/meta/flow-load-check.test.ts
 *
 * Gate-level proof for maestro/tools/flow-load-check.cjs (pre-commit stage 4).
 *
 * WHY THIS FILE EXISTS. Every flow defect found during S6 (2026-10-15) was a LOAD
 * defect — the flow failed before one step ran, on device, with no test having
 * executed: 98 wrong-depth `runFlow` references across 36 files and 26 `runScript`
 * sites using a construct Maestro 2.6.1 cannot parse. No existing gate saw either
 * class (flow-xcheck validates `id:` selectors and copy; the testID gates validate
 * the map), so both shipped through every "gates green" report. The new stage is
 * only worth having if its three native checks still FIRE: a check quietly turned
 * into a no-op exits 0 on a broken tree exactly like a passing one.
 *
 * HOW. The tool takes its flow root from FLOW_LOAD_ROOT and its engine from
 * MAESTRO_BIN, so this suite runs the SHIPPED file — not a copy, not a
 * reimplementation — against a throwaway tree holding a handful of flows. The
 * engine is a stub whose output is controlled per case, which is the only way to
 * exercise the classification deterministically: the real Maestro exits 1 for a
 * parse error AND for an absent device, so the verdict is read from the message.
 *
 * NON-VACUITY. Each native check is paired with a FAULT-INJECTED copy of the tool
 * in which that check is neutralised; the suite asserts the outcome FLIPS from
 * exit 2 to exit 0 on the same broken tree. neutralize() throws with its anchor
 * when the anchor is gone, and the last test re-checks every anchor against the
 * shipped tool, so a refactor that silently disarms a mutation fails by name
 * instead of showing up as an unexplained pass.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "maestro", "tools", "flow-load-check.cjs");

const HEADER = 'appId: com.ride.bd\n---\n';
const OK_CHILD = `${HEADER}- assertVisible: "hi"\n`;

interface TreeSpec {
  /** maestro/flows-relative path -> body (the appId header is added here). */
  flows?: Record<string, string>;
  /** extra raw files under the tree root, relative path -> contents. */
  files?: Record<string, string>;
}

interface RunOpts {
  /** MAESTRO_BIN value. Default: a stub in `device` mode. */
  bin?: string;
  /** STUB_MODE for the stub engine. */
  stubMode?: "device" | "parse" | "ok";
  /** FLOW_LOAD_REQUIRE_ENGINE=1 */
  requireEngine?: boolean;
  /** Extra CLI args. */
  args?: string[];
}

/** Write a throwaway flow tree; returns { root, flowsRoot, stub }. */
function makeTree(spec: TreeSpec) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-load-"));
  const flowsRoot = path.join(root, "flows");
  fs.mkdirSync(flowsRoot, { recursive: true });
  for (const [rel, body] of Object.entries(spec.flows || {})) {
    const p = path.join(flowsRoot, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, HEADER + body);
  }
  for (const [rel, body] of Object.entries(spec.files || {})) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  const stub = path.join(root, "stub-maestro.cjs");
  fs.writeFileSync(
    stub,
    [
      'const mode = process.env.STUB_MODE || "device";',
      'if (process.argv.includes("--version")) { console.log("2.6.1"); process.exit(0); }',
      'if (mode === "ok") process.exit(0);',
      'if (mode === "parse") { console.log("Invalid Command: wait at " + process.argv[2] + ":3:1"); process.exit(1); }',
      'console.log("Device __flow_load_check__ was requested, but it is not connected.");',
      "process.exit(1);",
    ].join("\n") + "\n",
  );
  // Forward slashes: MAESTRO_BIN is interpolated into a shell command string.
  const bin = `node ${stub.split(path.sep).join("/")}`;
  return { root, flowsRoot, bin };
}

function run(tree: { flowsRoot: string; bin: string }, opts: RunOpts = {}) {
  const args = opts.args ?? ["--all"];
  const res = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      FLOW_LOAD_ROOT: tree.flowsRoot,
      MAESTRO_BIN: opts.bin ?? tree.bin,
      STUB_MODE: opts.stubMode ?? "device",
      ...(opts.requireEngine ? { FLOW_LOAD_REQUIRE_ENGINE: "1" } : {}),
    },
  });
  return { status: res.status, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

function neutralize(src: string, anchor: string, replacement: string, label: string) {
  if (!src.includes(anchor)) {
    throw new Error(`fault injection failed (${label}): anchor not found:\n${anchor}`);
  }
  return src.split(anchor).join(replacement);
}

/** Copy the shipped tool with one anchor rewritten; returns the copy's path. */
function mutated(anchor: string, replacement: string, label: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-load-mut-"));
  const p = path.join(dir, "flow-load-check.cjs");
  fs.writeFileSync(p, neutralize(fs.readFileSync(TOOL, "utf8"), anchor, replacement, label));
  return p;
}

function runMutant(mutant: string, tree: { flowsRoot: string; bin: string }, opts: RunOpts = {}) {
  const res = spawnSync(process.execPath, [mutant, ...(opts.args ?? ["--all"])], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      FLOW_LOAD_ROOT: tree.flowsRoot,
      MAESTRO_BIN: opts.bin ?? tree.bin,
      STUB_MODE: opts.stubMode ?? "device",
    },
  });
  return { status: res.status, out: `${res.stdout || ""}\n${res.stderr || ""}` };
}

const CLEAN: TreeSpec = { flows: { "shared/_ok.yaml": '- assertVisible: "hi"\n', "top.yaml": "- runFlow: shared/_ok.yaml\n" } };

describe("flow-load-check: engine classification", () => {
  it("passes a clean tree when the engine reports only an absent device", () => {
    const t = makeTree(CLEAN);
    const r = run(t, { stubMode: "device" });
    expect(r.status).toBe(0);
    expect(r.out).toContain("engine load-clean");
  });

  it("passes when the engine exits 0", () => {
    const t = makeTree(CLEAN);
    expect(run(t, { stubMode: "ok" }).status).toBe(0);
  });

  it("refuses when the engine reports a parse error (exit 1 is NOT the verdict)", () => {
    const t = makeTree(CLEAN);
    const r = run(t, { stubMode: "parse" });
    expect(r.status).toBe(2);
    expect(r.out).toContain("engine rejected the flow graph");
    expect(r.out).toContain("Invalid Command");
  });

  it("does not claim the engine ran when maestro is absent", () => {
    const t = makeTree(CLEAN);
    const r = run(t, { bin: "definitely-not-maestro" });
    expect(r.status).toBe(0);
    // The CI pre-commit replay fails on the literal words skipped/skipping.
    expect(r.out.toLowerCase()).not.toMatch(/skipped|skipping/);
    expect(r.out).toContain("did NOT run");
    expect(r.out).toContain("native-only");
  });

  it("refuses when CI requires the engine and it cannot run", () => {
    const t = makeTree(CLEAN);
    const r = run(t, { bin: "definitely-not-maestro", requireEngine: true });
    expect(r.status).toBe(2);
    expect(r.out).toContain("FLOW_LOAD_REQUIRE_ENGINE=1");
  });
});

describe("flow-load-check: native checks block", () => {
  it("blocks a wrong-depth runFlow reference, naming the required depth", () => {
    // Depth 2 under the flow root: the 97-of-98 shape from the real tree.
    const t = makeTree({ flows: { "shared/_ok.yaml": '- assertVisible: "hi"\n', "sub/deeper/x.yaml": "- runFlow: ../../../shared/_ok.yaml\n" } });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("REFS");
    expect(r.out).toContain("needs 2 '../'");
    expect(r.out).toContain("expected '../../shared/_ok.yaml'");
  });

  it("blocks a wrong-depth reference at depth 1 as well, naming depth 1", () => {
    const t = makeTree({ flows: { "shared/_ok.yaml": '- assertVisible: "hi"\n', "sub/x.yaml": "- runFlow: ../../shared/_ok.yaml\n" } });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("needs 1 '../'");
  });

  it("blocks a runScript carrying inline commands", () => {
    // `file:` present AND `commands:` present: this isolates the commands check.
    // Without the file: the same flow would also trip the no-file check, and a
    // fixture that blocks for two reasons cannot prove either one fires —
    // MEASURED: the first version of this case left the mutant at exit 2.
    const t = makeTree({
      flows: { "lib.js": "var x = 1;\n", "a.yaml": "- runScript:\n    file: lib.js\n    commands:\n      - node x.js\n" },
    });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("RUNSCRIPT");
    expect(r.out).toContain("not a runScript field");
  });

  it("blocks a runScript with no file:", () => {
    const t = makeTree({ flows: { "a.yaml": "- runScript:\n    env:\n      a: b\n" } });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("runScript without `file:`");
  });

  it("blocks `when:` followed by an indented bare true", () => {
    const t = makeTree({
      flows: { "ok.js": "", "a.yaml": "- runScript:\n    when:\n      true\n    file: ../flows/ok.js\n" },
    });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("WHEN");
    expect(r.out).toContain("bare `true`");
  });

  it("blocks a bare boolean `when: true`", () => {
    const t = makeTree({ flows: { "shared/_ok.yaml": '- assertVisible: "hi"\n', "a.yaml": "- runFlow:\n    when: true\n    file: shared/_ok.yaml\n" } });
    const r = run(t);
    expect(r.status).toBe(2);
    expect(r.out).toContain("WHEN");
    expect(r.out).toContain("bare boolean");
  });

  it("accepts the documented forms: `when: { true: ${EXPR} }` and runScript file:+env", () => {
    const t = makeTree({
      flows: {
        "shared/_ok.yaml": '- assertVisible: "hi"\n',
        "lib.js": "var x = 1;\n",
        "a.yaml":
          "- runFlow:\n    when:\n      true: ${SHOULD_RUN}\n    file: shared/_ok.yaml\n" +
          "- runScript:\n    file: lib.js\n    env:\n      a: b\n",
      },
    });
    const r = run(t);
    expect(r.status).toBe(0);
    expect(r.out).toContain("OK");
  });

  it("still blocks native faults when the engine is unavailable", () => {
    const t = makeTree({ flows: { "a.yaml": "- runScript:\n    commands:\n      - node x.js\n" } });
    const r = run(t, { bin: "definitely-not-maestro" });
    expect(r.status).toBe(2);
    expect(r.out).toContain("RUNSCRIPT");
  });
});

describe("flow-load-check: non-vacuity (each check flips when disarmed)", () => {
  const refsTree = makeTree({ flows: { "shared/_ok.yaml": '- assertVisible: "hi"\n', "sub/x.yaml": "- runFlow: ../../shared/_ok.yaml\n" } });
  // (depth 1, one '../' too many — the shape of the single depth-1 defect in the real tree)
  const scriptTree = makeTree({
    flows: { "lib.js": "var x = 1;\n", "a.yaml": "- runScript:\n    file: lib.js\n    commands:\n      - node x.js\n" },
  });
  const whenTree = makeTree({ flows: { "ok.js": "", "a.yaml": "- runScript:\n    when:\n      true\n    file: ../flows/ok.js\n" } });

  it("baseline: every fixture really does block", () => {
    expect(run(refsTree).status).toBe(2);
    expect(run(scriptTree).status).toBe(2);
    expect(run(whenTree).status).toBe(2);
  });

  it("REFS stops firing when the existence check is neutralised", () => {
    const m = mutated("if (!fs.existsSync(resolved)) {", "if (false) {", "REFS");
    expect(runMutant(m, refsTree).status).toBe(0);
  });

  it("RUNSCRIPT stops firing when the commands check is neutralised", () => {
    const m = mutated("if (cmds) {", "if (false) {", "RUNSCRIPT");
    expect(runMutant(m, scriptTree).status).toBe(0);
  });

  it("WHEN stops firing when the bare-true check is neutralised", () => {
    const m = mutated("if (/^(true|false)\\s*$/i.test(t)) {", "if (false) {", "WHEN");
    expect(runMutant(m, whenTree).status).toBe(0);
  });

  it("every neutraliser anchor still exists in the shipped tool", () => {
    const src = fs.readFileSync(TOOL, "utf8");
    for (const anchor of [
      "if (!fs.existsSync(resolved)) {",
      "if (cmds) {",
      "if (/^(true|false)\\s*$/i.test(t)) {",
    ]) {
      expect(src).toContain(anchor);
    }
  });
});
