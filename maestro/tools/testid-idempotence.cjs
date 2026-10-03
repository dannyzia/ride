#!/usr/bin/env node
/**
 * testid-idempotence.cjs — B-1 fingerprint proof, reusable.
 *
 * Usage:
 *   node maestro/tools/testid-idempotence.cjs        # gate: exit 0 / 2 / 1
 *   node maestro/tools/testid-idempotence.cjs --json # machine-readable summary
 *
 * Also importable:
 *   const { runIdempotenceCheck } = require("./maestro/tools/testid-idempotence.cjs");
 *   const r = runIdempotenceCheck();  // -> { ok, violations, stats }  (never exits)
 *
 * WHY THIS EXISTS
 * B-1 (2026-09-28) was a codemod that was NOT idempotent: a write-mode re-run
 * double-prefixed every testID (`_layout.set-theme` → `_layout._layout.set-theme`)
 * across 221 files. It shipped once, was caught only by reading the diff, and
 * the fix was verified by hand — which is exactly how the class recurs: the next
 * person edits the preserve-branch, re-breaks it, and nothing complains.
 *
 * Nothing else in the pipeline can catch it. tsc and eslint do not read testIDs.
 * flow-xcheck only asks whether a selector is in the map, and a SELF-CONSISTENT
 * wrong map passes it by construction.
 *
 * THE THREE PROPERTIES (the "fingerprint proof")
 *   1. RE-RUN IS A NO-OP. A second write-mode run must touch zero files. This is
 *      the exact B-1 failure: any non-zero count means the preserve-branch no
 *      longer recognises its own output.
 *   2. STRIP → REGEN ROUND-TRIPS. `--strip` deletes every testID attribute; a
 *      regen must then reproduce the tree byte-for-byte. Catches a derivation
 *      that depends on the value it is replacing, and drift between the codemod
 *      and the tree it describes.
 *   3. NO DOUBLE-PREFIXED IDs. No ID may repeat a path segment. B-1's literal
 *      signature, checked on the real tree so it holds even if the codemod is
 *      never re-run.
 *
 * WHY A SANDBOX IS NOT OPTIONAL
 * Property 2 runs `--strip`, which DELETES every testID in whatever tree it is
 * pointed at. Pointing it at app/ would destroy uncommitted work. The codemod
 * honours APP_TESTIDS_ROOT (see add-testids.cjs) and every sandboxed invocation
 * here sets it. The real tree is only ever READ.
 *
 * WHY `.cjs` AND WHY IT IS A MODULE
 * The sibling tools under maestro/tools/ are CommonJS scripts; jest transforms
 * `*.ts`/`*.js` but a bare `require()` of this file from a test needs the
 * extension to be unambiguous. Exporting `runIdempotenceCheck` lets the CLI and
 * tests/meta/testid-idempotence.test.ts share ONE implementation, so the proof
 * that runs in CI is the same code the unit tests exercise — a gate whose logic
 * can only be reached through a subprocess is hard to test and easy to let rot.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_APP = path.join(ROOT, "app");
const DEFAULT_CODEMOD = path.join(ROOT, "maestro", "tools", "add-testids.cjs");

/** Errors that mean "this run cannot be trusted", as opposed to "B-1 is back". */
class BrokenInputError extends Error {}

/**
 * Run the codemod against `root`, returning its parsed counters.
 * Throws BrokenInputError on a crash; a nonzero codemod exit (cross-file ID
 * collisions) is returned, not thrown — the caller decides it is fatal.
 */
function runCodemod(codemod, root, args, label) {
  let stdout;
  let status = 0;
  try {
    stdout = execFileSync(process.execPath, [codemod, ...args], {
      env: { ...process.env, APP_TESTIDS_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (err.status === 2) return { stdout: `${err.stdout || ""}${err.stderr || ""}`, code: 2, counters: {} };
    throw new BrokenInputError(
      `codemod ${label} crashed (exit ${err.status}):\n${err.stderr || err.stdout || ""}`
    );
  }
  const counters = {};
  for (const k of ["filesTouched", "idsAssigned", "crossFileCollisions"]) {
    const hit = new RegExp(`${k}=(\\d+)`).exec(stdout);
    counters[k] = hit ? Number(hit[1]) : null;
  }
  return { stdout, code: 0, counters };
}

/** Every file's bytes under `root`, keyed by POSIX-style relative path. */
function snapshot(root, filter = () => true) {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else {
        const rel = path.relative(root, p).split(path.sep).join("/");
        if (filter(rel)) out.set(rel, fs.readFileSync(p, "utf8"));
      }
    }
  };
  walk(root);
  return out;
}

/**
 * Property 3, isolated so it can be unit-tested against source strings without
 * touching the filesystem.
 *
 * Parses with the TypeScript AST rather than grepping, and that is not stylistic:
 * a regex also matches `testID="..."` inside a JSX COMMENT, which is where
 * onboarding/index.tsx:1314 documents this very pipeline's behaviour — the naive
 * scan reported a double-prefixed ID there that does not exist. Same parser the
 * codemod uses, and only string-literal initialisers count, so a computed
 * `testID={f.testId}` is ignored exactly as testid-manifest.cjs ignores it.
 */
function findDoublePrefixed(fileName, content) {
  const ts = require("typescript");
  const sf = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  let scanned = 0;
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const attr = node.attributes.properties.find(
        (p) => ts.isJsxAttribute(p) && p.name.getText(sf) === "testID"
      );
      if (attr?.initializer && ts.isStringLiteral(attr.initializer)) {
        scanned++;
        const segs = attr.initializer.text.split(".");
        for (let i = 1; i < segs.length; i++) {
          if (segs[i] === segs[i - 1]) {
            found.push(attr.initializer.text);
            break;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { scanned, doublePrefixed: found };
}

/**
 * Run all three properties.
 * @returns {{ok: boolean, violations: string[], stats: object}}
 *   Never calls process.exit — the CLI wrapper owns the exit code.
 */
function runIdempotenceCheck({
  app = DEFAULT_APP,
  codemod = DEFAULT_CODEMOD,
  tsxOnly = true,
} = {}) {
  for (const p of [app, codemod]) {
    if (!fs.existsSync(p)) throw new BrokenInputError(`missing required path: ${p}`);
  }

  const violations = [];
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "testid-idem-"));
  const sandboxApp = path.join(sandbox, "app");

  try {
    fs.cpSync(app, sandboxApp, { recursive: true });

    const committed = snapshot(sandboxApp);
    const stats = { files: committed.size, idsScanned: 0, doublePrefixed: 0 };

    // ── 1. re-run is a no-op ──────────────────────────────────────────────
    const first = runCodemod(codemod, sandboxApp, [], "run-1 (write)");
    if (first.code === 2) {
      violations.push(
        `codemod reports cross-file ID collisions on the committed tree:\n${first.stdout}`
      );
    }
    const afterFirst = snapshot(sandboxApp);
    let drifted = 0;
    for (const [rel, content] of afterFirst) if (committed.get(rel) !== content) drifted++;
    if (drifted > 0) {
      violations.push(
        `${drifted} app file(s) changed on a single write-mode run: the committed tree is NOT a ` +
          `fixed point of the codemod. Fix: node maestro/tools/add-testids.cjs, then commit the result.`
      );
    }

    const second = runCodemod(codemod, sandboxApp, [], "run-2 (write, B-1 probe)");
    stats.run1FilesTouched = first.counters.filesTouched;
    stats.run2FilesTouched = second.counters.filesTouched;
    stats.run2IdsAssigned = second.counters.idsAssigned;
    if (second.counters.filesTouched !== 0) {
      violations.push(
        `B-1 REGRESSION: a second write-mode run touched ${second.counters.filesTouched} file(s) ` +
          `(idsAssigned=${second.counters.idsAssigned}). A re-run MUST be a no-op — a non-zero count ` +
          `means the codemod no longer recognises its own output, which is how every ID got ` +
          `double-prefixed (_layout._layout.set-theme) in the first place.`
      );
    }

    // ── 2. strip -> regen round-trips ─────────────────────────────────────
    runCodemod(codemod, sandboxApp, ["--strip"], "--strip");
    const stripped = snapshot(sandboxApp);
    let stripRemoved = 0;
    for (const [rel, content] of stripped) {
      const before = (committed.get(rel) || "").match(/testID=/g)?.length ?? 0;
      const after = content.match(/testID=/g)?.length ?? 0;
      if (before !== after) stripRemoved++;
    }
    runCodemod(codemod, sandboxApp, [], "regen after --strip");
    const afterRegen = snapshot(sandboxApp);

    const mismatches = [];
    for (const [rel, content] of committed) if (afterRegen.get(rel) !== content) mismatches.push(rel);
    stats.strippedFiles = stripRemoved;
    stats.roundTripMismatches = mismatches.length;
    if (mismatches.length) {
      violations.push(
        `strip→regen did not round-trip: ${mismatches.length} file(s) differ from the committed tree ` +
          `after stripping every testID and regenerating. First: ${mismatches.slice(0, 5).join(", ")}` +
          `${mismatches.length > 5 ? " …" : ""}. The derivation depends on something it replaced.`
      );
    }
    // A no-op strip would make property 2 vacuously true, so assert the
    // intermediate state really changed. Under a broken preserve-branch this
    // fires, which is how the gate proves its own sanity check is live.
    if (stripRemoved === 0) {
      violations.push(
        `--strip removed nothing, so the round-trip check above was vacuous. The codemod's ` +
          `strip branch is not doing its job.`
      );
    }

    // ── 3. no double-prefixed IDs in the REAL tree ───────────────────────
    const real = snapshot(app, (rel) => (tsxOnly ? rel.endsWith(".tsx") : true));
    const dupes = [];
    let scanned = 0;
    for (const [rel, content] of real) {
      const r = findDoublePrefixed(rel, content);
      scanned += r.scanned;
      for (const id of r.doublePrefixed) dupes.push(`${rel}: ${id}`);
    }
    stats.idsScanned = scanned;
    stats.doublePrefixed = dupes.length;
    if (dupes.length) {
      violations.push(
        `B-1 REGRESSION: ${dupes.length} testID(s) repeat a path segment. ` +
          `First: ${dupes.slice(0, 5).join("; ")}`
      );
    }

    return { ok: violations.length === 0, violations, stats };
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const asJson = process.argv.includes("--json");
  let result;
  try {
    result = runIdempotenceCheck();
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
      `testid idempotence: run-1 filesTouched=${s.run1FilesTouched} | ` +
        `run-2 filesTouched=${s.run2FilesTouched} (must be 0) | ` +
        `strip→regen mismatches=${s.roundTripMismatches} (${s.strippedFiles} files stripped) | ` +
        `ids scanned=${s.idsScanned}, double-prefixed=${s.doublePrefixed}`
    );
  }

  if (!result.ok) {
    if (!asJson) {
      console.error("");
      result.violations.forEach((v) => console.error(`  • ${v}`));
      console.error("");
    }
    console.error("❌ testID codemod idempotence gate failed — commit blocked.");
    process.exit(2);
  }
  if (!asJson) {
    console.log("✅ codemod is idempotent: re-run is a no-op, strip→regen round-trips, no double-prefixed IDs.");
  }
}

module.exports = { runIdempotenceCheck, findDoublePrefixed, BrokenInputError };