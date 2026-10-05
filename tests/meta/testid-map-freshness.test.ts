/**
 * tests/meta/testid-map-freshness.test.ts
 *
 * Exercises the reusable pre-commit stage 5 proof in
 * maestro/tools/testid-map-freshness.cjs.
 *
 * WHY THIS FILE EXISTS: the gate compares a GENERATED manifest against the app/
 * tree, so the interesting ways for it to be wrong are all in the comparison —
 * a category of difference that is not reported, a reported difference that
 * should not be fatal, a corrupt map that silently degenerates into "everything
 * vanished". Those are cheap to pin with fixtures and impossible to reach by
 * running the gate on a healthy tree.
 *
 * The end-to-end run (which materialises the index and regenerates the manifest)
 * is deliberately NOT duplicated here — it costs ~6s and pre-commit stage 5 runs
 * the same code on every app/ commit. It is available opt-in via
 * RUN_TESTID_MAP_E2E=1, asserted with `it.skip` rather than an early return so
 * an unrun proof reports as PENDING and can never be mistaken for a green one.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import {
  buildAttribution,
  diffAttribution,
  parseMap,
  runFreshnessCheck,
  BrokenInputError,
} from "../../maestro/tools/testid-map-freshness.cjs";

const MANIFEST = path.resolve(__dirname, "../../maestro/tools/testid-manifest.cjs");

/** A manifest in the real on-disk shape: keys are relative to app/, no prefix. */
const manifest = (screens: Record<string, { id: string; line: number }[]>) => ({
  total: Object.values(screens).flat().length,
  screens,
});

const attributionOf = (m: ReturnType<typeof manifest>) => buildAttribution(m);

describe("parseMap — a corrupt map must not masquerade as a stale one", () => {
  it("accepts the real shape", () => {
    const m = parseMap(JSON.stringify(manifest({ "profile/index.tsx": [{ id: "a.b", line: 3 }] })), "m");
    expect(buildAttribution(m).get("a.b")).toEqual({ file: "profile/index.tsx", line: 3 });
  });

  it("rejects unparseable JSON", () => {
    expect(() => parseMap("{not json", "m")).toThrow(BrokenInputError);
  });

  it("rejects a map with no screens object", () => {
    expect(() => parseMap(JSON.stringify({ total: 0 }), "m")).toThrow(BrokenInputError);
    expect(() => parseMap(JSON.stringify({ total: 0, screens: null }), "m")).toThrow(BrokenInputError);
  });

  it("rejects a screens value that is not an array", () => {
    expect(() => parseMap(JSON.stringify({ total: 1, screens: { "a.tsx": { id: "a.b" } } }), "m")).toThrow(
      BrokenInputError
    );
  });

  it("rejects an entry with no string id", () => {
    // Without this guard an entryless map builds an empty attribution table and
    // reports every real id as `vanished` — a corrupt file would read exactly
    // like a stale one, and the remedy printed (regenerate) would not fix it.
    expect(() =>
      parseMap(JSON.stringify({ total: 1, screens: { "a.tsx": [{ line: 3 }] } }), "m")
    ).toThrow(BrokenInputError);
  });
});

describe("diffAttribution — the four ways a map can stop matching app/", () => {
  it("reports nothing for two identical maps", () => {
    const m = manifest({
      "a.tsx": [{ id: "x.one", line: 3 }],
      "b.tsx": [{ id: "y.two", line: 9 }],
    });
    const d = diffAttribution(attributionOf(m), attributionOf(m));
    expect(d).toEqual({ vanished: [], unrecorded: [], moved: [], lineDrift: [] });
  });

  it("flags an id the map records but app/ no longer has (renamed or deleted)", () => {
    // The case this gate is actually for: of the map's 1107 ids, 1016 are
    // selected by no flow, so stage 3 never inspects them — renaming one leaves
    // flow-xcheck at exit 0 (verified) while the map describes an element that
    // no longer exists.
    const from = attributionOf(manifest({ "a.tsx": [{ id: "x.one", line: 3 }] }));
    const to = attributionOf(manifest({ "a.tsx": [{ id: "x.one-v2", line: 3 }] }));
    const d = diffAttribution(from, to);
    expect(d.vanished).toEqual(["x.one (map says a.tsx:3)"]);
    expect(d.unrecorded).toEqual(["x.one-v2 (a.tsx:3)"]);
    expect(d.moved).toEqual([]);
  });

  it("flags an id attributed to a different file than the map claims", () => {
    // Renaming a screen file moves every id it owns; the id SET is unchanged, so
    // a set-only comparison would pass this. Stage 3 catches the 91 flow-selected
    // ids this way; for the other 1016 nothing does.
    const from = attributionOf(manifest({ "a.tsx": [{ id: "x.one", line: 3 }] }));
    const to = attributionOf(manifest({ "b.tsx": [{ id: "x.one", line: 3 }] }));
    const d = diffAttribution(from, to);
    expect(d.moved).toEqual(["x.one: a.tsx -> b.tsx"]);
    expect(d.vanished).toEqual([]);
    expect(d.unrecorded).toEqual([]);
  });

  it("reports line drift separately, and it is not one of the blocking kinds", () => {
    // Inserting three comment lines above an element moves its id and changes
    // nothing about which selectors resolve. Blocking here would fail every
    // cosmetic app/ edit.
    const from = attributionOf(manifest({ "a.tsx": [{ id: "x.one", line: 3 }] }));
    const to = attributionOf(manifest({ "a.tsx": [{ id: "x.one", line: 6 }] }));
    const d = diffAttribution(from, to);
    expect(d.lineDrift).toEqual(["x.one: a.tsx:3 -> 6"]);
    expect(d.vanished).toEqual([]);
    expect(d.unrecorded).toEqual([]);
    expect(d.moved).toEqual([]);
  });
});

describe("testid-manifest.cjs env overrides — the sandbox contract stage 5 depends on", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "testid-manifest-env-"));
  afterAll(() => fs.rmSync(sandbox, { recursive: true, force: true }));

  it("keys the manifest relative to the app root, not to its parent", () => {
    // REGRESSION GUARD for a bug this gate shipped with twice. checkout-index
    // preserves the full index path, so the caller lays blobs out as
    // <sandbox>/app/... and must pass <sandbox>/app as the root. Point it one
    // level too high or too low and every key comes back as "app/..." or
    // "app/app/...", which the committed map does not use — the diff then
    // reports all 1107 ids as `moved` and the gate is unusable.
    fs.mkdirSync(path.join(sandbox, "app", "(auth)"), { recursive: true });
    fs.writeFileSync(
      path.join(sandbox, "app", "(auth)", "_layout.tsx"),
      '<View><Pressable testID="_layout.set-theme" /></View>',
      "utf8"
    );

    const out = path.join(sandbox, "out.json");
    execFileSync(process.execPath, [MANIFEST], {
      env: { ...process.env, TESTID_MAP_APP_ROOT: path.join(sandbox, "app"), TESTID_MAP_OUT: out },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    const map = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(map.total).toBe(1);
    expect(Object.keys(map.screens)).toEqual(["(auth)/_layout.tsx"]);
  });

  it("leaves the real map untouched when pointed at a sandbox", () => {
    // The whole reason the overrides exist: regeneration must never clobber the
    // committed manifest. A fault-injection harness that reverts the generator
    // would silently write the real map instead, which is exactly what happened
    // once while this gate was being verified.
    const real = path.resolve(__dirname, "../../maestro/tools/testid-map.json");
    expect(fs.existsSync(real)).toBe(true);
    expect(fs.existsSync(path.join(sandbox, "out.json"))).toBe(true);
  });
});

describe("runFreshnessCheck — module contract", () => {
  const e2eIt = process.env.RUN_TESTID_MAP_E2E === "1" ? it : it.skip;

  e2eIt(
    "reports the shipped tree as self-consistent",
    () => {
      const r = runFreshnessCheck();
      const stats = r.stats as Record<string, number>;
      expect(r.ok).toBe(true);
      expect(stats.vanished).toBe(0);
      expect(stats.unrecorded).toBe(0);
      expect(stats.moved).toBe(0);
      expect(stats.mapIds).toBe(stats.appIds);
    },
    120000
  );

  it("leaves no sandbox behind", () => {
    const before = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("testid-map-fresh-"));
    // Nothing to inject a failure into here (the check takes no options and
    // reads the live index), so this asserts the steady state rather than a
    // cleanup path: the temp dir must be empty of this gate's leftovers.
    const after = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("testid-map-fresh-"));
    expect(after.length).toBe(before.length);
  });
});

// ── --head-vs-worktree (stage 5 in CI) ─────────────────────────────────────────────
// The CI mode's whole value is WHAT it reads — the map at HEAD and the working
// tree instead of the index — which unit fixtures cannot reach. So the SHIPPED
// CLI is copied into a throwaway git repo (it resolves ROOT and MANIFEST from
// __dirname, so a copy is a valid instance) and run exactly as the
// `maestro-drift` job runs it. Each blocking case is PAIRED with a
// fault-injected copy whose comparison is neutralised, asserting the outcome
// flips: a gate that has become a no-op must FAIL this suite, not pass it.
// The child env sets NODE_PATH to the repo's node_modules because the copied
// testid-manifest.cjs requires `typescript`, which a tmpdir tree cannot see.
describe("testid-map-freshness: --head-vs-worktree (stage 5 in CI)", () => {
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
   * A committed map STALE for the committed tree: the tree declares "x.one",
   * the map claims "x.gone" (vanished) and never records "x.one" (unrecorded).
   * `fault` string-replaces the comparison in the copied tool.
   */
  const makeRepo = (fault?: { from: string; to: string }): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fresh-hvw-"));
    fs.mkdirSync(path.join(root, "maestro", "tools"), { recursive: true });
    fs.mkdirSync(path.join(root, "app"), { recursive: true });
    for (const f of ["testid-map-freshness.cjs", "testid-manifest.cjs"]) {
      let src = fs.readFileSync(path.join(TOOLS, f), "utf8");
      if (fault && f === "testid-map-freshness.cjs") {
        expect(src).toContain(fault.from); // the injection point must exist
        src = src.replace(fault.from, fault.to);
      }
      fs.writeFileSync(path.join(root, "maestro", "tools", f), src);
    }
    fs.writeFileSync(
      path.join(root, "app", "a.tsx"),
      'import { View } from "react-native";\nexport function A() {\n  return <View testID="x.one" />;\n}\n'
    );
    fs.writeFileSync(
      path.join(root, "maestro", "tools", "testid-map.json"),
      JSON.stringify({ total: 1, screens: { "a.tsx": [{ id: "x.gone", line: 1 }] } })
    );
    git(root, ["init", "-q"]);
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "fixture"]);
    return root;
  };

  // stdout is the --json result and stderr the banners — kept separate because
  // the failure path writes both, and only stdout is parseable JSON.
  const run = (root: string): { code: number; stdout: string; stderr: string } => {
    try {
      const stdout = execFileSync(
        process.execPath,
        ["maestro/tools/testid-map-freshness.cjs", "--head-vs-worktree", "--json"],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: CHILD_ENV }
      );
      return { code: 0, stdout, stderr: "" };
    } catch (err) {
      const e = err as { status: number; stdout?: string; stderr?: string };
      return { code: e.status, stdout: e.stdout || "", stderr: e.stderr || "" };
    }
  };

  it(
    "blocks a committed map that is stale for the checked-out tree (exit 2)",
    () => {
      const root = makeRepo();
      try {
        const { code, stdout } = run(root);
        expect(code).toBe(2);
        const parsed = JSON.parse(stdout);
        expect(parsed.ok).toBe(false);
        expect(parsed.stats.mode).toBe("head-vs-worktree");
        expect(parsed.stats.vanished).toBe(1); // x.gone claimed by HEAD, absent from the tree
        expect(parsed.stats.unrecorded).toBe(1); // x.one in the tree, absent from HEAD's map
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );

  it(
    "passes when the committed map matches the checked-out tree (exit 0)",
    () => {
      const root = makeRepo();
      try {
        // Regenerate the map from the tree and commit it — the state the gate exists to accept.
        execFileSync(process.execPath, ["maestro/tools/testid-manifest.cjs"], {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          env: CHILD_ENV,
        });
        git(root, ["add", "-A"]);
        git(root, ["commit", "-q", "-m", "regen"]);
        const { code, stdout } = run(root);
        expect(code).toBe(0);
        expect(JSON.parse(stdout).ok).toBe(true);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );

  it(
    "fault pair: neutralising the comparison turns the stale fixture GREEN — the exit 2 is the detector's, not the plumbing's",
    () => {
      const root = makeRepo({
        from: "const from = buildAttribution(committed);",
        to: "const from = buildAttribution(fresh);",
      });
      try {
        const { code, stdout } = run(root);
        expect(JSON.parse(stdout).ok).toBe(true);
        expect(code).toBe(0);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    60000
  );
});