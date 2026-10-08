/**
 * Unit tests for maestro/tools/testid-flow-currency.cjs (pre-commit stage 6).
 *
 * The end-to-end blocking behaviour is proved by fault injection in a throwaway
 * repo (a rename + correctly regenerated map + no flow staged -> exit 1). What
 * these cover is the part fault injection cannot cheaply re-run on every commit:
 * the pure diff/parse logic, and the two silent-pass traps that were actually hit
 * while writing the tool and would otherwise ship as a gate that always passes.
 *
 * TRAP 1 (regression guard, read-only against this repo): SELECTOR_RE was first
 * written with the POSIX class `[[:space:]]`, copied from the git grep -E
 * pattern. In JAVASCRIPT that bracket expression means "one of [ : s p a c e
 * followed by a literal ]", so it matched no indent and flowSelectors() returned
 * an EMPTY map. The gate then reported "0 flow-selected testIDs ... clean" and
 * exited 0 on every commit — a security gate that never fires. Nothing failed
 * loudly; only a hardcoded expectation on a non-zero selector count catches it.
 *
 * TRAP 2: `git grep --cached` exits 1 when nothing matches. That is an empty
 * result, not a failure, and must not become a BrokenInputError.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const gate = require(path.join(__dirname, "..", "..", "maestro", "tools", "testid-flow-currency.cjs"));

const MAP_A = JSON.stringify({
  total: 3,
  screens: {
    "s.tsx": [
      { id: "a.one", line: 1 },
      { id: "a.two", line: 2 },
    ],
    "t.tsx": [{ id: "t.three", line: 5 }],
  },
});

const MAP_RENAMED = JSON.stringify({
  total: 3,
  screens: {
    "s.tsx": [
      { id: "b.one", line: 1 },
      { id: "a.two", line: 2 },
    ],
    "t.tsx": [{ id: "t.three", line: 5 }],
  },
});

describe("testid-flow-currency: map parsing", () => {
  it("collects every id across screens", () => {
    const ids = gate.parseMap(MAP_A, "test");
    expect([...ids].sort()).toEqual(["a.one", "a.two", "t.three"]);
  });

  it("rejects invalid JSON rather than reporting an empty id set", () => {
    expect(() => gate.parseMap("NOT JSON {{{", "bad map")).toThrow(gate.BrokenInputError);
  });

  it("rejects a map with no screens key", () => {
    expect(() => gate.parseMap(JSON.stringify({ total: 0 }), "bad map")).toThrow(
      gate.BrokenInputError
    );
  });

  it("rejects a screens entry that is not an array", () => {
    const bad = JSON.stringify({ total: 1, screens: { "s.tsx": { id: "x" } } });
    expect(() => gate.parseMap(bad, "bad map")).toThrow(gate.BrokenInputError);
  });

  it("accepts a bare-string id as well as an object with an id", () => {
    const ids = gate.parseMap(JSON.stringify({ screens: { "s.tsx": ["plain.id"] } }), "t");
    expect([...ids]).toEqual(["plain.id"]);
  });
});

describe("testid-flow-currency: removed-id diff", () => {
  it("reports an id the staged map drops", () => {
    const removed = gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(MAP_RENAMED, "b"));
    expect(removed).toEqual(["a.one"]);
  });

  it("reports nothing when the maps are identical", () => {
    expect(gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(MAP_A, "b"))).toEqual([]);
  });

  it("treats a rename as one removal plus one addition", () => {
    const after = gate.parseMap(MAP_RENAMED, "b");
    const removed = gate.diffRemoved(gate.parseMap(MAP_A, "a"), after);
    // b.one is ADDED, not "moved" — this gate only ever diffs identity.
    expect(removed).toEqual(["a.one"]);
    expect(after.has("b.one")).toBe(true);
  });

  it("does not report an id still present under another screen", () => {
    const after = JSON.stringify({
      screens: { "z.tsx": [{ id: "a.one" }, { id: "a.two" }, { id: "t.three" }] },
    });
    expect(gate.diffRemoved(gate.parseMap(MAP_A, "a"), gate.parseMap(after, "b"))).toEqual([]);
  });
});

describe("testid-flow-currency: selector regex", () => {
  it("captures a quoted id", () => {
    expect(gate.SELECTOR_RE.exec('    id: "phone-entry.set-phone')).toBeTruthy();
    expect(gate.SELECTOR_RE.exec('    id: "phone-entry.set-phone')[1]).toBe(
      "phone-entry.set-phone"
    );
  });

  it("captures an unquoted id", () => {
    expect(gate.SELECTOR_RE.exec("- id: some.id")[1]).toBe("some.id");
  });

  it("is the id in group 1 (the optional list dash is non-capturing)", () => {
    // Guards the real bug: when the dash group was capturing, m[1] was "-" and
    // m[2] the id; every id came back as undefined or "-" and the gate passed.
    expect(gate.SELECTOR_RE.exec("- id: some.id")[1]).not.toBe("-");
  });

  it("ignores a text tapOn line", () => {
    expect(gate.SELECTOR_RE.exec('    tapOn: "Submit"')).toBeNull();
  });
});

describe("testid-flow-currency: live repo selector set (TRAP 1 regression guard)", () => {
  it("finds a non-zero number of flow-selected testIDs", () => {
    // If SELECTOR_RE ever regresses to a POSIX class (or the -z record parse
    // misaligns), this returns 0 and the gate becomes a permanent no-op.
    const selectors = gate.flowSelectors();
    expect(selectors.size).toBeGreaterThan(0);
  });

  it("finds the well-known login selector", () => {
    // The live index currently selects 99 ids; this checks one well-known one.
    const selectors = gate.flowSelectors();
    expect(selectors.has("phone-entry.set-phone")).toBe(true);
  });

  it("attributes each selector to a real flow file, not to match text", () => {
    // TRAP 2's sibling bug: with the wrong record split, the "file" was the
    // previous record's match text. Every value must look like a path.
    for (const files of gate.flowSelectors().values()) {
      for (const f of files) {
        expect(f).toMatch(/^maestro\/flows\/.*\.ya?ml$/);
      }
    }
  });

  it("agrees with the measured pre-commit index-mode count of 99 flow-selected ids", () => {
    // Exact count is pinned deliberately: it makes a silent parser regression
    // impossible to miss. It moved 91 -> 93 when the B-3 flow rebuild landed
    // (one selector replaced by three, net +2) — a legitimate flow edit must
    // update this pin in the same commit, never relax the assertion.
    //
    // 2026-10-05: found STALE at 93 while repointing the logout and driver-core
    // claims. flowSelectors() reads the INDEX (`git grep --cached`), and the
    // index equalled HEAD with nothing staged, so 99 was HEAD's own measured
    // value: earlier flow edits had moved the count without updating this pin.
    // The 2026-10-05 repoint contributed NONE of the drift — both ids it
    // selected (phone-entry.set-phone, rider.d.toggle-online-2) were already
    // flow-selected elsewhere (_go-offline.yaml:12), so the count is unchanged
    // by it. Re-pinned to the MEASURED value, not a guess; the assertion is
    // exact as before, so the canary keeps its full force.
    // This 99-pin is the pre-commit INDEX-mode canary (git grep --cached across maestro/flows).
    // The CI's --head-vs-worktree mode reads the worktree and reports 100 here - two views of
    // one consistent selector set; the canary asserts the index count never drifts. Replace 99
    // only if the committed flow selector set itself changes.
    expect(gate.flowSelectors().size).toBe(99);
  });
});

describe("testid-flow-currency: exported surface", () => {
  it("exports everything the hook and harness rely on", () => {
    for (const fn of ["runCurrencyCheck", "diffRemoved", "flowSelectors", "parseMap"]) {
      expect(typeof gate[fn]).toBe("function");
    }
  });
});

// ── --head-vs-worktree (stage 6 in CI) ─────────────────────────────────────────────
// Same copied-tool fixture pattern as the stage 5 suite: the shipped CLI (plus
// the generateMap dependency it requires and the manifest that generator
// spawns) runs in a throwaway git repo exactly as the `maestro-drift` job runs
// it. The stale fixture is the canonical orphan: the map at HEAD claims an id
// the tree no longer declares, and a flow still selects it (owner ruling
// 2026-10-05 defines the CI mode's removal diff as map-at-HEAD vs the map
// regenerated from the tree). PAIRED with a fault-injected copy whose
// removed-set is emptied, asserting the outcome flips — a silent no-op must
// fail this suite, not pass it. NODE_PATH points the copied
// testid-manifest.cjs at the repo's node_modules for `typescript`.
describe("testid-flow-currency: --head-vs-worktree (stage 6 in CI)", () => {
  const TOOLS = path.resolve(__dirname, "..", "..", "maestro", "tools");
  const CHILD_ENV = {
    ...process.env,
    NODE_PATH: path.join(__dirname, "..", "..", "node_modules"),
  };

  const git = (root: string, args: string[]): void => {
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...CHILD_ENV,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.com",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.com",
      },
    });
  };

  /**
   * `stale` (default): the tree declares "x.one", HEAD's map claims "x.gone",
   * and the flow selects "x.gone" — the CI-era orphan. `stale: false` is the
   * consistent state the gate must accept.
   */
  const makeRepo = (opts: { stale?: boolean; fault?: { from: string; to: string } } = {}) => {
    const stale = opts.stale !== false;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "curr-hvw-"));
    fs.mkdirSync(path.join(root, "maestro", "tools"), { recursive: true });
    fs.mkdirSync(path.join(root, "maestro", "flows"), { recursive: true });
    fs.mkdirSync(path.join(root, "app"), { recursive: true });
    for (const f of ["testid-flow-currency.cjs", "testid-map-freshness.cjs", "testid-manifest.cjs"]) {
      let src = fs.readFileSync(path.join(TOOLS, f), "utf8");
      if (opts.fault && f === "testid-flow-currency.cjs") {
        expect(src).toContain(opts.fault.from); // the injection point must exist
        src = src.replace(opts.fault.from, opts.fault.to);
      }
      fs.writeFileSync(path.join(root, "maestro", "tools", f), src);
    }
    fs.writeFileSync(
      path.join(root, "app", "a.tsx"),
      'import { View } from "react-native";\nexport function A() {\n  return <View testID="x.one" />;\n}\n'
    );
    const id = stale ? "x.gone" : "x.one";
    fs.writeFileSync(
      path.join(root, "maestro", "tools", "testid-map.json"),
      JSON.stringify({ total: 1, screens: { "a.tsx": [{ id, line: 1 }] } })
    );
    fs.writeFileSync(path.join(root, "maestro", "flows", "f.yaml"), `appId: fixture\n---\n- id: ${id}\n`);
    git(root, ["init", "-q"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "fixture"]);
    return root;
  };

  const run = (root: string): { code: number; out: string } => {
    try {
      const out = execFileSync(
        process.execPath,
        ["maestro/tools/testid-flow-currency.cjs", "--head-vs-worktree"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: CHILD_ENV }
      );
      return { code: 0, out };
    } catch (err) {
      const e = err as { status: number; stdout?: string; stderr?: string };
      return { code: e.status, out: (e.stdout || "") + (e.stderr || "") };
    }
  };

  it(
    "blocks a flow-selected id the map at HEAD claims but the tree no longer declares (exit 1)",
    () => {
      const root = makeRepo();
      try {
        const { code, out } = run(root);
        expect(code).toBe(1);
        expect(out).toContain("x.gone");
        // The mode's own wording: index mode prints "…when a flow is staged" instead.
        expect(out).toContain("no longer declares");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );

  it(
    "passes when the tree and flows agree with the map at HEAD (exit 0, mode-tagged)",
    () => {
      const root = makeRepo({ stale: false });
      try {
        const { code, out } = run(root);
        expect(code).toBe(0);
        expect(out).toContain("[head-vs-worktree]"); // the flag reached the gate — not an index-mode run
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );

  it(
    "fault pair: emptying the removed-set turns the stale fixture GREEN — the exit 1 is the detector's, not the plumbing's",
    () => {
      const root = makeRepo({
        fault: {
          from: "const removed = diffRemoved(beforeIds, afterIds);",
          to: "const removed = [];",
        },
      });
      try {
        const { code, out } = run(root);
        expect(code).toBe(0);
        expect(out).toContain("[head-vs-worktree]");
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );
});