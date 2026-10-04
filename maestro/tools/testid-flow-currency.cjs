#!/usr/bin/env node
/**
 * testid-flow-currency.cjs — Gate 6: a testID a flow selects must not disappear
 * without a flow being updated in the SAME commit.
 *
 * ── The gap this closes ──────────────────────────────────────────────────────
 * Stage 5 (`testid-map-freshness.cjs`) enforces that the staged map agrees with
 * the staged app/ tree. It does NOT and cannot enforce that the FLOWS agree.
 * Consider the rename `foo` -> `bar`, committed correctly:
 *
 *   app/foo.tsx        testID "foo"  ->  "bar"
 *   testid-map.json    foo  ->  bar            <- regenerated, so stage 5 PASSES
 *   maestro/flows/...  id: "foo"   (untouched) <- now a DEAD selector
 *
 * Every existing gate is silent on that commit. Stage 3 (flow-xcheck) only runs
 * when a `maestro/flows/**.yaml` is staged, and this commit stages none. Stage 5
 * is green because the map really was regenerated. Nothing else reads flows. The
 * breakage therefore surfaces later, in an UNRELATED commit that happens to
 * touch the flow — where it reads as a flow bug and sends the next agent hunting
 * for a selector problem instead of at the rename that caused it.
 *
 * ── Why this blocks only on flow-REFERENCED removals ─────────────────────────
 * Only 93 of the map's ~1108 ids are selected by a flow; the rest rot with no
 * signal at all. Blocking on every removed id would fire on the overwhelming
 * majority of legitimate app/ edits (renaming an id no flow uses is harmless).
 * So the gate intersects: removed ids ∩ ids some flow actually selects. An empty
 * intersection is a PASS, and that is the common case. This is deliberately not
 * "app/ changed testIDs" -> "block"; it is "app/ deleted something a flow points
 * at" -> "block", which is the subset that is actually broken.
 *
 * ── Why a staged flow makes it pass ──────────────────────────────────────────
 * If ANY flow YAML is staged, the author is demonstrably in the flow tree, and
 * stage 3 (`flow-xcheck.cjs`) then performs the AUTHORITATIVE check: every `id:`
 * selector must resolve, and must resolve in its own app file. Re-verifying here
 * would duplicate that with a weaker implementation. This gate exists purely for
 * the case stage 3 structurally cannot see — the flow-side change is MISSING
 * entirely. Requiring "some flow staged" rather than "the specific referencing
 * flow staged" is deliberate: it is the conservative direction, and it avoids
 * false blocks when one edit legitimately touches several flows.
 *
 * ── Both sides come from the INDEX ───────────────────────────────────────────
 * The pre-commit map is HEAD's; the post-commit map is the index's. The question
 * is "what does THIS commit delete", so the diff is between the committed state
 * and the state being committed. Reading the worktree instead would credit the
 * commit with a rename the author has not staged yet.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────────
 * Two `git show` and one `git grep --cached`. No `checkout-index`, no map
 * regeneration, no temp dirs — this stage is materially cheaper than stage 5 and
 * runs on the same trigger, so it does not move the hook's budget.
 *
 * Exit codes: 0 = pass, 1 = blocked (dead flow selector), 2 = broken input
 * (git failed, map unreadable — NOT the same as "clean", see runCurrencyCheck).
 *
 * Usage:  node maestro/tools/testid-flow-currency.cjs
 */
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const MAP_RELPATH = "maestro/tools/testid-map.json";
const FLOWS_RELPATH = "maestro/flows";

/**
 * Same selector grammar flow-xcheck.cjs uses, so the two gates cannot drift into
 * disagreeing about what an `id:` selector IS. Leading whitespace is trimmed
 * rather than excluded from the pattern, because `git grep -o` echoes the whole
 * match and the line indent is not part of the selector.
 */
// NOTE: this is JAVASCRIPT regex, not grep. It uses \s, not the POSIX
// [[:space:]] class — in JS that bracket expression means "one of [ : s p a c e
// followed by a literal ]", so a POSIX class here fails to match a plain
// indent and the gate silently sees zero selectors and always passes. The
// git grep -E pattern below is the one place POSIX/ERE syntax belongs.
const SELECTOR_RE = /^\s*(?:- )?id:\s*["']?([^"'\s#]+)/;

/** Failures that mean "this run cannot be trusted", as opposed to "flows are stale". */
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
 * The map as it exists in HEAD. Returns null when the commit does not exist yet
 * (first commit on a branch) or the map was never committed — in both cases there
 * is no "before" state, so there is nothing to have gone stale, and the gate
 * passes. This must NOT throw: a missing HEAD map is normal, not broken input.
 */
function headMapJson() {
  try {
    return git(["show", `HEAD:${MAP_RELPATH}`]);
  } catch (err) {
    if (/unknown revision|does not exist|ambiguous|bad revision/i.test(String(err.message))) {
      return null;
    }
    throw new BrokenInputError(`could not read HEAD:${MAP_RELPATH}\n${err.message}`);
  }
}

/** The map blob this commit will contain. Throws if it is not in the index at all. */
function indexMapJson() {
  try {
    return git(["show", `:${MAP_RELPATH}`]);
  } catch (err) {
    throw new BrokenInputError(
      `${MAP_RELPATH} is not in the index, so this commit ships no testID map. Generate and ` +
        `stage it: node maestro/tools/testid-manifest.cjs && git add ${MAP_RELPATH}\n${err.message}`
    );
  }
}

/**
 * Parse and shape-check a manifest. A corrupt map is a hard error rather than a
 * diff: a truncated file yields an empty id set, every real id reads as removed,
 * and the gate would block a commit over a parse artefact. Same reasoning as
 * stage 5's parseMap, kept deliberately separate so neither tool can regress the
 * other's error handling.
 */
function parseMap(json, label) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new BrokenInputError(`${label} is not valid JSON: ${err.message}`);
  }
  if (!data || typeof data !== "object" || !data.screens || typeof data.screens !== "object") {
    throw new BrokenInputError(`${label} has no \`screens\` map — cannot compare testIDs.`);
  }
  const ids = new Set();
  for (const [screen, list] of Object.entries(data.screens)) {
    if (!Array.isArray(list)) {
      throw new BrokenInputError(`${label}: screens["${screen}"] is not an array.`);
    }
    for (const entry of list) {
      const id = entry && typeof entry === "object" ? entry.id : entry;
      if (typeof id !== "string" || !id) {
        throw new BrokenInputError(`${label}: screens["${screen}"] holds a non-string id.`);
      }
      ids.add(id);
    }
  }
  return ids;
}

/**
 * Every `id:` selector the INDEX's flows select, mapped to the flows selecting
 * it. Read with `git grep --cached` (one subprocess for the whole tree) rather
 * than by walking files, so it sees the committed state and never the worktree.
 *
 * `git grep` exits 1 when nothing matches. That is a legitimate empty result,
 * not a failure, so it is handled here instead of being allowed to surface as a
 * BrokenInputError — otherwise the very first commit with no flows would fail.
 */
function flowSelectors() {
  const used = new Map(); // id -> Set(flow relpaths)
  let out;
  try {
    // -z makes git grep emit NUL-separated triplets (path \0 line \0 match), which
    // removes colon ambiguity entirely. The obvious `path:line:match` split is
    // WRONG here and silently yields zero selectors: the match itself starts with
    // `id:` and usually contains no further colon, so splitting from the right
    // cuts INSIDE the match and every line is discarded. That failure is silent
    // (an empty map reads as "no flow selects anything"), which would turn this
    // gate into a no-op that always passes. -z makes the parse total.
    out = git([
      "grep",
      "--cached",
      "-z",
      "-n",
      "-o",
      "-E",
      "^[[:space:]]*(- )?id:[[:space:]]*[\"']?[^\"'[:space:]#]+",
      "--",
      FLOWS_RELPATH,
    ]);
  } catch (err) {
    if (err.status === 1) return used; // no selectors anywhere — see docstring
    throw new BrokenInputError(`git grep over ${FLOWS_RELPATH} failed:\n${err.message}`);
  }
  // Record separator is a NEWLINE; only the path/line/match fields inside a
  // record are NUL-separated. Splitting the whole output on \0 instead would
  // glue the next record's path onto this record's match, because the \n stays
  // attached to the match. So: split on \n into records first, then \0 within.
  for (const record of out.split("\n")) {
    if (!record) continue;
    const parts = record.split("\0");
    if (parts.length < 3) continue;
    const file = parts[0];
    const m = SELECTOR_RE.exec(parts[2]);
    if (!file || !m) continue;
    const id = m[1]; // group 1: `(?:- )` is non-capturing, so the id IS the first group
    if (!used.has(id)) used.set(id, new Set());
    used.get(id).add(file);
  }
  return used;
}

/** Is any flow file part of this commit? If so stage 3 owns the verification. */
function anyFlowStaged() {
  const out = git([
    "diff",
    "--cached",
    "--name-only",
    "-z",
    "--diff-filter=ACMRD",
    "--",
    FLOWS_RELPATH,
  ]);
  return out.split("\0").filter(Boolean).length > 0;
}

/**
 * Ids present in the pre-commit map and absent from the staged one — i.e. what
 * this commit deletes or renames away. Attribute-only changes are deliberately
 * NOT included: re-pointing an id at a different file does not break a selector,
 * which still resolves, so including it would block correct commits.
 */
function diffRemoved(beforeIds, afterIds) {
  const removed = [];
  for (const id of beforeIds) if (!afterIds.has(id)) removed.push(id);
  return removed.sort();
}

/**
 * Run the gate.
 * @returns {{blocked:boolean, reason:string, removed:string[], dead:string[], deadFiles:Map<string,string[]>, flowStaged:boolean, flowSelectorCount:number}}
 */
function runCurrencyCheck() {
  const headJson = headMapJson();
  const stagedJson = indexMapJson();
  const beforeIds = headJson ? parseMap(headJson, `HEAD:${MAP_RELPATH}`) : null;
  const afterIds = parseMap(stagedJson, `staged ${MAP_RELPATH}`);

  // No pre-commit map (initial commit): there is no "before", so nothing can have
  // been orphaned by this commit. Stage 5 still guards the map's self-consistency.
  if (!beforeIds) {
    return {
      blocked: false,
      reason: "no HEAD map to compare against (initial commit) — nothing could be orphaned",
      removed: [],
      dead: [],
      deadFiles: new Map(),
      flowStaged: anyFlowStaged(),
      flowSelectorCount: 0,
    };
  }

  const removed = diffRemoved(beforeIds, afterIds);
  const selectors = flowSelectors();
  const deadFiles = new Map();
  for (const id of removed) {
    const files = selectors.get(id);
    if (files) deadFiles.set(id, [...files].sort());
  }
  const dead = [...deadFiles.keys()].sort();
  const flowStaged = anyFlowStaged();

  if (dead.length === 0) {
    return {
      blocked: false,
      reason:
        removed.length === 0
          ? "this commit changes no testID identity — no selector can be orphaned"
          : `${removed.length} testID(s) removed, none selected by any flow`,
      removed,
      dead: [],
      deadFiles,
      flowStaged,
      flowSelectorCount: selectors.size,
    };
  }

  // A flow is in this commit, so stage 3 runs and authoritatively verifies every
  // selector. Standing down here avoids duplicating it with a weaker check.
  if (flowStaged) {
    return {
      blocked: false,
      reason: `a flow is staged; stage 3 verifies its selectors authoritatively`,
      removed,
      dead,
      deadFiles,
      flowStaged,
      flowSelectorCount: selectors.size,
    };
  }

  return {
    blocked: true,
    reason: `${dead.length} removed testID(s) are still selected by flows, and this commit stages no flow`,
    removed,
    dead,
    deadFiles,
    flowStaged,
    flowSelectorCount: selectors.size,
  };
}

function main() {
  let r;
  try {
    r = runCurrencyCheck();
  } catch (err) {
    if (err instanceof BrokenInputError) {
      // Exit 2, never 0: an unreadable map or a git failure must not read as a
      // clean pass. This is the same lesson as the check-date-in-sql silent-pass.
      console.error(`❌ testID flow-currency gate could not run:\n${err.message}`);
      console.error("   Refusing to report a pass. Resolve the error above and retry.");
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  if (r.blocked) {
    console.error("❌ a testID selected by a Maestro flow was removed without updating any flow.");
    console.error("");
    for (const id of r.dead) {
      console.error(`   ${id}`);
      for (const f of r.deadFiles.get(id)) console.error(`       selected by ${f}`);
    }
    console.error("");
    console.error(
      "   Flows are only checked against testIDs when a flow is staged, so committing this"
    );
    console.error(
      "   rename alone leaves dead selectors that surface later as an unrelated failure."
    );
    console.error("   Fix: update the flow(s) above to the new testID and stage them in this");
    console.error("         commit, or restore the testID if the rename was not intended.");
    process.exitCode = 1;
    return;
  }

  console.log(
    `✅ flow currency gate: clean (${r.flowSelectorCount} flow-selected testIDs; ${r.reason})`
  );
  process.exitCode = 0;
}

if (require.main === module) main();

module.exports = {
  runCurrencyCheck,
  diffRemoved,
  flowSelectors,
  parseMap,
  anyFlowStaged,
  SELECTOR_RE,
  BrokenInputError,
};