#!/usr/bin/env node
/**
 * testid-map-freshness.cjs — proves maestro/tools/testid-map.json matches the
 * app/ tree that the commit is about to contain, so stage 3 (flow-xcheck) can
 * never pass a flow against a stale map.
 *
 * Usage:
 *   node maestro/tools/testid-map-freshness.cjs        # gate: exit 0 / 2 / 1
 *   node maestro/tools/testid-map-freshness.cjs --json # machine-readable summary
 *
 * Also importable:
 *   const { runFreshnessCheck } = require("./maestro/tools/testid-map-freshness.cjs");
 *   const r = runFreshnessCheck();  // -> { ok, violations, advisories, stats }  (never exits)
 *
 * WHY THIS EXISTS
 * MEASURED, not assumed: flow-xcheck is NOT defeated by a stale map on its own.
 * Its MAP DRIFT check re-reads the app/ file the map attributes each selector to
 * (flow-xcheck.cjs, "check 2"), so renaming a testID a flow actually uses still
 * trips it — verified: renaming a flow-referenced id gives exit 2, "id absent
 * from the file the map attributes it to".
 *
 * The hole is everything else. Flows reference 91 of the map's 1107 ids; the
 * other 1016 are never inspected by any gate, because stage 3 only asks about
 * selectors it finds in a flow. Verified: renaming an unreferenced id leaves
 * flow-xcheck at exit 0 — "every id: selector resolves" — while the map now
 * describes an element that no longer exists. The rot accumulates silently and
 * surfaces incidentally, months later, to whoever selects that id — where it
 * reads as a flow bug in an unrelated commit.
 *
 * The map is also a REWIRING and audit artifact (see testid-manifest.cjs) that
 * humans and agents read; nothing verified its freshness outside a flow commit.
 * tsc and eslint do not read testIDs, and the idempotence gate proves the
 * codemod's fixed-point property, not the manifest.
 *
 * WHY THE INDEX, NOT THE WORKING TREE
 * The question a pre-commit gate must answer is "is the tree I am about to
 * commit self-consistent?", so both sides are read from the INDEX:
 *   - app/ content  — materialised with `git checkout-index` from the staged blobs
 *   - the map        — `git show :maestro/tools/testid-map.json` (the staged blob)
 * Comparing against the working tree instead would be wrong in both directions.
 * It would demand a map regenerated from code that is not in this commit (a
 * developer's unrelated in-flight edits), and it would pass a commit whose
 * staged .tsx differs from the staged map, because the worktree happened to be
 * regenerated already. It also misses deletions outright: a deleted screen drops
 * out of the regenerated map and only a stale committed map can say so.
 *
 * WHAT IS COMPARED — ATTRIBUTION ONLY
 * An id -> owning-file table, which is exactly the resolution flow-xcheck does
 * (`idOwner` built from map.screens[*][*].id; it never reads `line`). Three
 * blocking differences, because each one makes stage 3 lie:
 *   vanished   id is in the map but not in app/   — selector points at nothing
 *   unrecorded id is in app/ but not in the map   — app/ id no flow can be built against
 *   moved      id is in both, attributed to a different file — MAP DRIFT's own case
 * Line-number drift is reported but NOT blocking: nothing downstream reads
 * `line`, and requiring it would make every cosmetic app/ edit fail the commit.
 *
 * WHY A SANDBOX
 * Regeneration must not touch the real app/ tree or the real map. The staged
 * blobs are written to a temp dir (checkout-index never writes the worktree)
 * and testid-manifest.cjs is pointed at it through TESTID_MAP_APP_ROOT /
 * TESTID_MAP_OUT, the same contract add-testids.cjs offers via APP_TESTIDS_ROOT.
 * The real tree and the real map are only ever READ.
 *
 * KNOWN LIMIT
 * Two files claiming the same id collapse to one owner here, so this gate says
 * nothing about duplicate testIDs across screens. That is a different defect
 * with a different fix, and inventing a check for it inside a freshness gate
 * would blur what a red exit means.
 *
 * WHY `.cjs` AND WHY IT IS A MODULE
 * Same reason as its sibling testid-idempotence.cjs: the jest transform covers
 * `*.ts`/`*.js` but not a bare `require()` of a `.cjs`, and exporting the check
 * lets the CLI and tests/meta/testid-map-freshness.test.ts share one
 * implementation, so the proof that gates every commit is the code under test.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(__dirname, "testid-manifest.cjs");
const MAP_RELPATH = "maestro/tools/testid-map.json";

/** Errors that mean "this run cannot be trusted", as opposed to "the map is stale". */
class BrokenInputError extends Error {}

function git(args, opts = {}) {
  const { input } = opts;
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      ...(input === undefined ? {} : { input }),
    });
  } catch (err) {
    throw new BrokenInputError(
      `git ${args[0]} failed (exit ${err.status}):\n${err.stderr || err.stdout || ""}`
    );
  }
}

/**
 * Every app/ path currently in the INDEX. A path staged for deletion is simply
 * not listed, which is the whole point: the regenerated map must not see it, so
 * its ids come back `vanished` against a committed map that still claims them.
 */
function indexAppFiles() {
  return git(["ls-files", "-z", "--", "app"]).split("\0").filter(Boolean);
}

/** Write the index's blobs for `files` under `destRoot`. Never touches the worktree. */
function materializeIndex(destRoot, files) {
  // checkout-index creates files, not the directories between them, so every
  // parent has to exist first (app/ alone is not enough — it nests four deep).
  const dirs = new Set(files.map((f) => path.dirname(path.join(destRoot, f))));
  for (const d of dirs) fs.mkdirSync(d, { recursive: true });
  // --prefix requires a trailing separator, and --stdin -z is the only input
  // form that survives the spaces, parens and @ signs in Expo Router paths.
  git(["checkout-index", "-z", "--stdin", `--prefix=${destRoot}${path.sep}`], {
    input: `${files.join("\0")}\0`,
  });
}

/** The map blob this commit will contain. Throws if it is not in the index at all. */
function indexMapJson() {
  try {
    return git(["show", `:${MAP_RELPATH}`]);
  } catch (err) {
    throw new BrokenInputError(
      `${MAP_RELPATH} is not in the index, so this commit ships no testID map and stage 3 ` +
        `would resolve every selector against nothing. Generate and stage it: ` +
        `node maestro/tools/testid-manifest.cjs && git add ${MAP_RELPATH}\n${err.message}`
    );
  }
}

/**
 * Parse and shape-check a manifest. A corrupt map is a hard error rather than
 * a diff: without this guard a truncated or hand-mangled file yields an empty
 * attribution table and reports every real id as `vanished`, which reads as a
 * stale map when the map is simply unreadable.
 */
function parseMap(json, label) {
  let map;
  try {
    map = JSON.parse(json);
  } catch (err) {
    throw new BrokenInputError(`${label} is not valid JSON (${err.message})`);
  }
  if (!map || typeof map !== "object" || typeof map.screens !== "object" || map.screens === null) {
    throw new BrokenInputError(
      `${label} has no "screens" object — regenerate it: node maestro/tools/testid-manifest.cjs`
    );
  }
  for (const [file, entries] of Object.entries(map.screens)) {
    if (!Array.isArray(entries)) {
      throw new BrokenInputError(`${label}: screens["${file}"] is not an array`);
    }
    for (const e of entries) {
      if (!e || typeof e.id !== "string" || !e.id) {
        throw new BrokenInputError(
          `${label}: screens["${file}"] has an entry without a string id — regenerate it`
        );
      }
    }
  }
  return map;
}

/** id -> { file, line }. The same resolution flow-xcheck performs. */
function buildAttribution(map) {
  const attr = new Map();
  for (const [file, entries] of Object.entries(map.screens)) {
    for (const e of entries) attr.set(e.id, { file, line: e.line });
  }
  return attr;
}

/**
 * Compare two attribution tables. Split out from the git plumbing so the
 * interesting logic is unit-testable against fixtures, with no repo state.
 */
function diffAttribution(fromMap, toMap) {
  const vanished = [];
  const unrecorded = [];
  const moved = [];
  const lineDrift = [];
  for (const [id, from] of fromMap) {
    const to = toMap.get(id);
    if (!to) {
      vanished.push(`${id} (map says ${from.file}:${from.line})`);
    } else if (to.file !== from.file) {
      moved.push(`${id}: ${from.file} -> ${to.file}`);
    } else if (from.line !== to.line) {
      lineDrift.push(`${id}: ${to.file}:${from.line} -> ${to.line}`);
    }
  }
  for (const [id, to] of toMap) {
    if (!fromMap.has(id)) unrecorded.push(`${id} (${to.file}:${to.line})`);
  }
  return { vanished, unrecorded, moved, lineDrift };
}

/** Regenerate a manifest from `appRoot` into `outPath` using the real generator. */
function generateMap(appRoot, outPath) {
  try {
    execFileSync(process.execPath, [MANIFEST], {
      env: { ...process.env, TESTID_MAP_APP_ROOT: appRoot, TESTID_MAP_OUT: outPath },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    throw new BrokenInputError(
      `testid-manifest.cjs crashed (exit ${err.status}):\n${err.stderr || err.stdout || ""}`
    );
  }
}

const sample = (items, n = 5) =>
  items.slice(0, n).join("; ") + (items.length > n ? ` … (+${items.length - n} more)` : "");

/**
 * Regenerate the map from the staged app/ tree and diff it against the staged map.
 * @returns {{ok: boolean, violations: string[], advisories: string[], stats: object}}
 *   Never calls process.exit — the CLI wrapper owns the exit code.
 */
function runFreshnessCheck() {
  if (!fs.existsSync(MANIFEST)) {
    throw new BrokenInputError(`missing required path: ${MANIFEST}`);
  }

  const appFiles = indexAppFiles();
  if (appFiles.length === 0) {
    throw new BrokenInputError(
      "the git index has no files under app/ — is this the Ride repo root, and is the " +
        "index populated? (an empty index means nothing is staged to check)"
    );
  }

  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "testid-map-fresh-"));
  try {
    // Layout: checkout-index preserves the full index path, so writing at <sandbox>
    // puts the blobs at <sandbox>/app/... exactly as the repo lays them out. The
    // generator then runs with <sandbox>/app as its root, and its keys come out
    // as path.relative(app) — i.e. "(auth)/_layout.tsx", matching the committed
    // map. Both halves matter: pointing either at the other root yields "app/..."
    // or "app/app/..." keys and reports all 1107 ids as moved.
    materializeIndex(sandbox, appFiles);

    const committed = parseMap(indexMapJson(), `staged ${MAP_RELPATH}`);
    const freshOut = path.join(sandbox, "regenerated-testid-map.json");
    generateMap(path.join(sandbox, "app"), freshOut);
    const fresh = parseMap(
      fs.readFileSync(freshOut, "utf8"),
      "manifest regenerated from the staged app/ tree"
    );

    const from = buildAttribution(committed);
    const to = buildAttribution(fresh);
    const d = diffAttribution(from, to);

    const violations = [];
    if (d.vanished.length) {
      violations.push(
        `${d.vanished.length} id(s) are recorded in ${MAP_RELPATH} but do not exist in the ` +
          `app/ tree this commit contains: ${sample(d.vanished)}. Nothing else verifies ids ` +
          `that no flow selects, so this rots with no signal until someone rewires or ` +
          `audits a flow against the map.`
      );
    }
    if (d.unrecorded.length) {
      violations.push(
        `${d.unrecorded.length} testID(s) in the staged app/ tree are absent from ` +
          `${MAP_RELPATH}: ${sample(d.unrecorded)}. The manifest is the index used to rewrite ` +
          `and audit flows, so an id it does not record is one no consumer can find.`
      );
    }
    if (d.moved.length) {
      violations.push(
        `${d.moved.length} id(s) are attributed to different app/ files than the map ` +
          `claims: ${sample(d.moved)}. This is the MAP DRIFT condition stage 3 detects for the ` +
          `91 ids flows actually select; for the rest it is silent until read.`
      );
    }

    const advisories = [];
    if (d.lineDrift.length) {
      advisories.push(
        `${d.lineDrift.length} id(s) moved line(s) only: ${sample(d.lineDrift)}. Not ` +
          `blocking — nothing downstream reads the map's line numbers — but regenerating ` +
          `keeps the manifest honest about where its ids live.`
      );
    }

    const stats = {
      stagedAppFiles: appFiles.length,
      mapScreens: Object.keys(committed.screens).length,
      appScreens: Object.keys(fresh.screens).length,
      mapIds: from.size,
      appIds: to.size,
      vanished: d.vanished.length,
      unrecorded: d.unrecorded.length,
      moved: d.moved.length,
      lineDrift: d.lineDrift.length,
    };

    return { ok: violations.length === 0, violations, advisories, stats };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const asJson = process.argv.includes("--json");
  let result;
  try {
    result = runFreshnessCheck();
  } catch (err) {
    if (err instanceof BrokenInputError) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const s = result.stats;
    console.log(
      `testid map freshness: staged map ${s.mapIds} ids / ${s.mapScreens} screens vs ` +
        `staged app/ ${s.appIds} ids / ${s.appScreens} screens | ` +
        `vanished=${s.vanished} unrecorded=${s.unrecorded} moved=${s.moved} ` +
        `(line-only drift=${s.lineDrift}, not blocking)`
    );
    result.advisories.forEach((a) => console.warn(`  ⚠ ${a}`));
  }

  if (!result.ok) {
    if (!asJson) {
      console.error("");
      result.violations.forEach((v) => console.error(`  • ${v}`));
      console.error("");
    }
    console.error("❌ testid map is stale for the app/ tree this commit contains — commit blocked.");
    console.error(
      "   Fix:  node maestro/tools/testid-manifest.cjs && git add maestro/tools/testid-map.json"
    );
    console.error(
      "   The generator reads your WORKING TREE while this gate compares the INDEX, so stage"
    );
    console.error(
      "   any other app/ edits first (or commit them separately) — a map regenerated from"
    );
    console.error("   unstaged code would describe a tree this commit does not contain.");
    process.exit(2);
  }
  if (!asJson) {
    console.log("✅ testid-map.json matches the staged app/ tree (id -> file attribution).");
  }
}

module.exports = { runFreshnessCheck, diffAttribution, buildAttribution, parseMap, BrokenInputError };