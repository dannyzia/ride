/**
 * tests/meta/device-preflight-harness.test.ts
 *
 * Keeps scripts/device-preflight-harness.cjs honest about the workflow it
 * replays and the markers it asserts on.
 *
 * WHY THIS FILE EXISTS: the harness is opt-in and slow-ish (a disposable
 * worktree per run), so drift would surface at the worst moment — when someone
 * runs it "before pushing" and a case fails for the wrong reason, or worse,
 * passes while asserting a marker nothing prints any more. These assertions are
 * the fast ones that belong in the normal suite: no worktree, no bash, no
 * stubs — just the three contracts the harness depends on:
 *   1. the preflight lane's step list (names AND order) matches STEPS,
 *   2. every script the workflow runs is a script the harness runs,
 *   3. every marker a case asserts is a string the real artifact prints.
 * The harness itself is the slow, authoritative proof (4 cases end to end).
 */
import fs from "fs";
import path from "path";
import { STEPS, CASES } from "../../scripts/device-preflight-harness.cjs";

const REPO = path.resolve(__dirname, "../..");
const WF_PATH = path.join(REPO, ".github/workflows/device-preflight.yml");
const WF_SRC = fs.readFileSync(WF_PATH, "utf8");

/** The `preflight` job region: from its job key to the next job key. */
const PREFLIGHT_REGION = WF_SRC.split("\n")
  .slice(
    WF_SRC.split("\n").findIndex((l) => /^ {2}preflight:$/.test(l)),
    WF_SRC.split("\n").findIndex((l) => /^ {2}device-day:$/.test(l))
  )
  .join("\n");

type Step = {
  n: number;
  workflowStep: string;
  mode: string;
  script?: string;
  markers?: string[];
  markerSource?: string;
  requiresTool?: string;
};
type Case = {
  key: string;
  expect: string;
  steps: number[];
  stubs: Record<string, boolean>;
  exports: Record<string, string | undefined>;
  wantExit: number;
  wantMarkers?: string[];
  forbidMarkers?: string[];
};
const steps = STEPS as Step[];
const cases = CASES as Case[];

/** Step headers in the workflow region: `- name: X` or `- uses: Y`. */
const workflowSteps = [...PREFLIGHT_REGION.matchAll(/^ {6}- (?:name: (.+)|uses: (\S+))\s*$/gm)].map(
  (m) => (m[1] ?? m[2]).trim()
);

describe("device-preflight harness ↔ workflow consistency", () => {
  it("replays exactly the preflight lane's steps, in order", () => {
    // Both directions in ONE assertion: a workflow step the harness skips is
    // just as much drift as a harness step the workflow dropped.
    expect(steps.map((s) => s.workflowStep)).toEqual(workflowSteps);
  });

  it("runs every script the workflow runs, and nothing else claims to", () => {
    const scriptRefs = (text: string): string[] =>
      [...text.matchAll(/maestro\/utils\/[\w.-]+\.sh/g)].map((m) => m[0]);
    const wfScripts = [...new Set(scriptRefs(PREFLIGHT_REGION))].sort();
    const harnessScripts = [...new Set(steps.flatMap((s) => scriptRefs(s.script || "")))].sort();
    expect(harnessScripts).toEqual(wfScripts);
    // The shellcheck step's discovery pattern is the load-bearing half of its
    // logic; it must stay identical in both places.
    expect(PREFLIGHT_REGION).toContain("git ls-files 'maestro/**/*.sh'");
    const shellcheckStep = steps.find((s) => (s.script || "").includes("shellcheck -x"));
    expect(shellcheckStep?.script).toContain("git ls-files 'maestro/**/*.sh'");
  });

  it("asserts only markers the real artifacts actually print", () => {
    // The anti-rot pin: a reworded transcript line must fail HERE, not as a
    // confusing case failure the next time somebody remembers to run the
    // harness.
    for (const s of steps) {
      if (!s.markers || !s.markers.length) continue;
      const src = fs.readFileSync(path.join(REPO, s.markerSource as string), "utf8");
      for (const m of s.markers) {
        expect({ step: s.n, marker: m, found: src.includes(m) }).toEqual({ step: s.n, marker: m, found: true });
      }
    }
    // Block-case markers are printed by the gate script under test.
    const gateSrc = fs.readFileSync(path.join(REPO, "maestro/utils/run-device-day.sh"), "utf8");
    for (const c of cases) {
      for (const m of c.wantMarkers || []) {
        if (c.expect !== "block") continue; // pass-case markers pinned above via steps
        expect({ case: c.key, marker: m, found: gateSrc.includes(m) }).toEqual({
          case: c.key,
          marker: m,
          found: true,
        });
      }
    }
  });

  it("proves detection, not just success", () => {
    // Anti-vacuity: a harness that only ever asserts green proves nothing about
    // its own detection. There must be block cases, they must expect non-zero,
    // and every case must run at least one real step.
    expect(cases.some((c) => c.expect === "pass")).toBe(true);
    expect(cases.filter((c) => c.expect === "block").length).toBeGreaterThanOrEqual(3);
    for (const c of cases) {
      expect({ case: c.key, runsSteps: c.steps.length > 0 }).toEqual({ case: c.key, runsSteps: true });
      expect({ case: c.key, wantExit: c.wantExit, expect: c.expect }).toEqual({
        case: c.key,
        wantExit: c.expect === "pass" ? 0 : c.wantExit,
        expect: c.expect,
      });
      if (c.expect === "block") {
        expect({ case: c.key, blocksWith: (c.wantMarkers || []).length > 0 }).toEqual({
          case: c.key,
          blocksWith: true,
        });
      }
    }
    // The healthy case is the workflow replay — it must cover every step.
    const healthy = cases.find((c) => c.expect === "pass");
    expect(healthy?.steps.slice().sort((a, b) => a - b)).toEqual(steps.map((s) => s.n));
  });

  it("pins the MAESTRO_BIN override that closes the /c/ fallback trap", () => {
    // MEASURED 2026-10-05: without this override run-device-day.sh's hardcoded
    // /c/maestro/bin/maestro fallback (which exists on a Windows host) makes
    // the missing-Maestro case pass green while detection is dead.
    const kase = cases.find((c) => c.key === "missing-maestro");
    expect(kase?.exports.MAESTRO_BIN).toBeTruthy();
    expect(kase?.stubs.maestro).toBe(false);
  });
});
