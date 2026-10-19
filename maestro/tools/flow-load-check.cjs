#!/usr/bin/env node
/**
 * flow-load-check.cjs — Gate 10: Maestro flow LOAD validation (permanent).
 *
 * Usage:  node maestro/tools/flow-load-check.cjs [--all] [--no-engine] [--json] [<flow.yaml> ...]
 * Exit:   0 = pass; 2 = blocking findings (listed); 1 = broken tool input.
 *
 * ── WHY THIS GATE EXISTS ─────────────────────────────────────────────────────
 * Every Maestro flow defect found during S6 (2026-10-15) was a LOAD defect: it
 * failed before a single step ran, on device, with no test having executed. Two
 * classes, both invisible to every other gate in the pipeline:
 *
 *   1. WRONG-DEPTH REFERENCES. `runFlow` and `runScript.file` paths are resolved
 *      relative to the REFERENCING flow FILE, and the number of `../` must equal
 *      the number of directory segments under maestro/flows. A flow at
 *      maestro/flows/delivery/x.yaml loads `../shared/…` and fails `../../shared/…`
 *      with `Invalid File Path` reported at the step's own line/column. CWD-relative
 *      references never work. MEASURED 2026-10-15: 98 wrong-depth refs across 36
 *      files (1 at depth 1, 97 at depth 2), including three flows on the device-day
 *      preflight list. REPRODUCIBLE from any checkout: `git archive HEAD` -> extract,
 *      then run this tool with FLOW_LOAD_ROOT pointed at the extracted tree; the only
 *      other tool in this class, `fix-runflow-paths.cjs --dry-run`, independently
 *      names the same 36 files. An earlier sweep of this class recorded "95 / 35"
 *      with a "24 correct" split; that does NOT reproduce (21 of the same 119 refs
 *      ARE correct at HEAD), so it is superseded here rather than reconciled
 *      silently — the reproducible figure is the one above.
 *   2. INVALID `runScript` FORM. The repo's counterpart-call construct was
 *      `- runScript:` + `when:` + `commands:` (a shell list). Maestro 2.6.1 has no
 *      shell step at all — `runScript` runs a JavaScript FILE (GraalJS sandbox),
 *      and `commands:` is a `runFlow` field, never a `runScript` one. 26 sites
 *      across 16 files, zero of them using the valid `file:` form.
 *
 * flow-xcheck (stage 3) validates `id:` selectors and copy; the testID gates
 * validate the map. NONE of them parse Maestro's own schema or resolve a path, so
 * both classes shipped through every "gates green" report in S3–S6. This gate is
 * the missing consumer.
 *
 * ── WHAT THIS GATES ──────────────────────────────────────────────────────────
 *  A. REFS      (blocking) every `runFlow` reference — scalar form
 *               (`- runFlow: ../shared/x.yaml`) and map form
 *               (`- runFlow: { file: … }`, including nested under `commands:` —
 *               resolves, relative to the referencing file, to an existing file.
 *  B. RUNSCRIPT (blocking) every `runScript` step references a `file:` and carries
 *               NO `commands:` list. Inline commands are banned repo-wide
 *               (ruling 2026-10-15): the construct cannot load on 2.6.1, so it can
 *               only ever look like a passing test while being unrunnable.
 *  C. WHEN      (blocking) every `when:` is a condition MAP. `when: true` (scalar)
 *               and `when:` + an indented bare `true` (a map whose `true` value is
 *               a boolean, not an expression) are both rejected by the engine with
 *               `Incorrect Format: when`. The accepted boolean form is
 *               `when: { true: ${EXPR} }`.
 *  D. ENGINE    (blocking when it can run) the Maestro engine itself parses the
 *               given flows. This is the only check that sees classes the three
 *               checks above do not model (MEASURED: `- wait: 10000` in
 *               rider-login-v2.yaml — `wait` is not a 2.6.1 command). It runs
 *               `maestro test` with a SENTINEL `--udid`, which guarantees no flow
 *               can execute even on a machine with a device attached, and reads
 *               the engine's own verdict by PARSING not by exit code: Maestro
 *               exits 1 for a parse error AND for an absent device (MEASURED), so
 *               only a positive "device missing" marker counts as load-clean.
 *               Anything else — including an unrecognised message — is REFUSED
 *               (exit 2) rather than passed, so a wording change in a future
 *               Maestro fails this gate loudly instead of blinding it.
 *
 * ── MEASURED COSTS AND SCOPING ───────────────────────────────────────────────
 * Native checks  A–C are regex/indent based, dependency-free and repo-wide
 * (~0.5s for the whole corpus — 118 flows as of 2026-10-16; the S6 note read 111
 * before the S7.1 pass added 11 flows and moved four scratch files OUT of the
 * corpus) — the same choice stage 3 documents for the same
 * reason: the invariant is repo-wide, so a red gate anywhere should block
 * anywhere. The engine step costs ~11s for the whole tree (JVM startup dominates;
 * `maestro check-syntax` is ~8s PER FILE, which is why this gate does not use it
 * as the per-file witness). The hook therefore runs the engine over the STAGED
 * flows, while CI (`--all`) runs it over the whole tree.
 *
 * Maestro is NOT a project dependency (like shellcheck), so a machine without it
 * SKIPS the engine step with a loud WARN — but checks A–C still run and still
 * block, so the gate is never a no-op. The CI `maestro-drift` job installs
 * maestro and therefore always exercises step D.
 *
 * Overrides (used by tests/meta/flow-load-check.test.ts):
 *   FLOW_LOAD_ROOT   flow tree root (default: <repo>/maestro/flows)
 *   MAESTRO_BIN      maestro executable (default: maestro on PATH)
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FLOWS_ROOT = process.env.FLOW_LOAD_ROOT
  ? path.resolve(process.env.FLOW_LOAD_ROOT)
  : path.join(REPO_ROOT, "maestro", "flows");
const MAESTRO_BIN = process.env.MAESTRO_BIN || "maestro";
const SENTINEL_UDID = "__flow_load_check__";
// CI sets this: the engine step is the ONLY check that sees the classes A-C do
// not model (MEASURED: `- wait:` and `- scrollUntil:` in rider-login-v2.yaml),
// so a CI run must REFUSE rather than pass when the engine cannot be reached.
// The hook leaves it unset, where maestro's absence is a WARN by design
// (maestro is not a project dependency and the native checks still block).
const REQUIRE_ENGINE = process.env.FLOW_LOAD_REQUIRE_ENGINE === "1";

const argv = process.argv.slice(2);
const ALL = argv.includes("--all");
const NO_ENGINE = argv.includes("--no-engine");
const JSON_OUT = argv.includes("--json");
const targets = argv.filter((a) => !a.startsWith("--"));

// ── discovery ────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".yaml") || e.name.endsWith(".yml")) out.push(p);
  }
  return out;
}

function rel(p) {
  return path.relative(REPO_ROOT, p).split(path.sep).join("/");
}

/** Depth = directory segments under maestro/flows, i.e. the required `../` count. */
function requiredUps(file) {
  return path.relative(FLOWS_ROOT, path.dirname(file)).split(path.sep).filter(Boolean).length;
}

// ── indentation scanner ──────────────────────────────────────────────────────
// Dependency-free line model, in the spirit of flow-xcheck.cjs. Each entry is a
// step or key with its own indent; `children` holds the block lines that belong
// to it (indent greater than its own). Good enough to find `runFlow:`,
// `runScript:` and `when:` wherever they sit — top level or nested in `commands:`.

/** Split a file into top-level step blocks: [{line, key, value, bodyStart, bodyEnd}] */
function stepBlocks(lines) {
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)-\s+([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)$/.exec(lines[i]);
    if (m) {
      if (cur) blocks.push(cur);
      cur = { line: i, indent: m[1].length, key: m[2], inline: m[3].trim(), start: i + 1, end: lines.length };
      continue;
    }
    if (cur) {
      const t = lines[i].trim();
      // A new top-level key inside the flow header/body ends the previous block
      // only when it is LESS indented than the step marker.
      if (t && !t.startsWith("#")) {
        const ind = lines[i].length - lines[i].trimStart().length;
        if (ind <= cur.indent) {
          cur.end = i;
          blocks.push(cur);
          cur = null;
        }
      }
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

/**
 * Does this step block have a DIRECT child key `name:`? Returns {line, value} or
 * null. Direct means the key sits exactly one level deeper than the `- key:`
 * marker (`- runScript:` at indent 2 -> its keys at indent 4). Matching any
 * deeper line would attribute a NESTED step's `file:`/`commands:` to its parent
 * and report the same reference twice — measured before this was pinned.
 */
function childKey(lines, block, name) {
  // The key indent is not derivable from the `- key:` marker alone: a sequence
  // item's content may sit at `indent + 2` or, as in this repo's style, at
  // `indent + 4`. The first deeper line that looks like a key DEFINES the level,
  // and every key of this step must sit at exactly that level — which is also
  // what keeps a NESTED step's `file:` from being attributed to its parent.
  let keyIndent = -1;
  for (let i = block.start; i < block.end; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith("#")) continue;
    const ind = lines[i].length - lines[i].trimStart().length;
    if (ind <= block.indent) break;
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(t)) keyIndent = ind;
    break;
  }
  if (keyIndent < 0) return null;
  const re = new RegExp(`^\\s+${name}\\s*:(.*)$`);
  for (let i = block.start; i < block.end; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const ind = lines[i].length - lines[i].trimStart().length;
    if (ind !== keyIndent) continue;
    return { line: i, value: m[1].trim() };
  }
  return null;
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

// ── checks A–C ───────────────────────────────────────────────────────────────

const findings = []; // {kind, file, line, message}

function record(kind, file, line, message) {
  findings.push({ kind, file: rel(file), line: line + 1, message });
}

function checkRef(file, lines, block, rawTarget, line) {
  const target = stripQuotes(rawTarget.replace(/#.*$/, "").trim());
  if (!target) return;
  if (/^\$\{|^\{\{/.test(target)) return; // runtime-interpolated — not statically resolvable
  const resolved = path.resolve(path.dirname(file), target);
  if (!fs.existsSync(resolved)) {
    const ups = requiredUps(file);
    const expected = "../".repeat(ups) + target.replace(/^(\.\.\/)+/, "");
    record(
      "REFS",
      file,
      line,
      `unresolved reference '${target}' -> ${rel(resolved)} does not exist. ` +
        `Paths resolve relative to the flow FILE, so this directory needs ${ups} '../' ` +
        `— expected '${expected}'`,
    );
  }
}

function checkFile(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  for (const block of stepBlocks(lines)) {
    if (block.key === "runFlow") {
      if (block.inline) {
        checkRef(file, lines, block, block.inline, block.line);
      } else {
        const f = childKey(lines, block, "file");
        if (f) checkRef(file, lines, block, f.value, f.line);
      }
    }

    if (block.key === "runScript") {
      const cmds = childKey(lines, block, "commands");
      const f = childKey(lines, block, "file");
      if (cmds) {
        record(
          "RUNSCRIPT",
          file,
          cmds.line,
          "`commands:` is not a runScript field (it belongs to runFlow) and inline shell steps are " +
            "banned — Maestro 2.6.1 has no shell step. Use `runScript: { file: <path>, env: {...} }`",
        );
      } else if (!f && !block.inline) {
        record("RUNSCRIPT", file, block.line, "runScript without `file:` — the engine rejects this (`Config Field Required: file`)");
      } else if (block.inline) {
        const target = stripQuotes(block.inline);
        if (!/^\$\{/.test(target)) {
          const resolved = path.resolve(path.dirname(file), target);
          if (!fs.existsSync(resolved)) {
            record("RUNSCRIPT", file, block.line, `unresolved script path '${target}' -> ${rel(resolved)} does not exist`);
          }
        }
      } else if (f) {
        const target = stripQuotes(f.value);
        if (!/^\$\{/.test(target)) {
          const resolved = path.resolve(path.dirname(file), target);
          if (!fs.existsSync(resolved)) {
            record("RUNSCRIPT", file, f.line, `unresolved script path '${target}' -> ${rel(resolved)} does not exist`);
          }
        }
      }
    }
  }

  // Check C — `when:` must be a condition map. Scan raw lines: the key can sit on
  // a step, a sub-step, or anywhere inside a block.
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)when\s*:(.*)$/.exec(lines[i]);
    if (!m) continue;
    const inline = m[2].trim();
    if (inline && !inline.startsWith("#")) {
      if (/^(true|false)$/i.test(stripQuotes(inline))) {
        record("WHEN", file, i, `bare boolean \`when: ${inline}\` — the engine rejects it. Use \`when: { true: \${EXPR} }\``);
      }
      continue;
    }
    // Block form: the first meaningful deeper line must be a condition KEY. Both
    // shapes the engine rejects land here — an indented bare `true` (a scalar where
    // a map is required) and `true:` with a boolean value (a map whose condition
    // value is not an expression). MEASURED: the bare-scalar shape is the one the
    // 26 counterpart sites used, so missing it here would leave the gate blind to
    // the exact construct that motivated it.
    const indent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (!t || t.startsWith("#")) continue;
      const ind = lines[j].length - lines[j].trimStart().length;
      if (ind <= indent) break;
      if (/^(true|false)\s*$/i.test(t)) {
        record(
          "WHEN",
          file,
          j,
          `\`when:\` + an indented bare \`${t}\` is a scalar where the engine requires a condition map ` +
            "(`Incorrect Format: when`). Use `when: { true: ${EXPR} }`, or drop the `when:` when the step is unconditional",
        );
        break;
      }
      const km = /^([A-Za-z_][A-Za-z0-9_]*)\s*:(.*)$/.exec(t);
      if (!km) break;
      if (km[1] === "true" && /^(true|false)\s*$/i.test(km[2].trim())) {
        record(
          "WHEN",
          file,
          j,
          "`when:` + `true:` with a boolean value — the condition value must be a JavaScript expression. " +
            "Use `when: { true: ${EXPR} }` or drop the `when:`",
        );
      }
      break;
    }
  }
}

// ── check D — the engine ─────────────────────────────────────────────────────

/**
 * Run the Maestro CLI. `shell: true` is REQUIRED, not incidental: the installed
 * binary is a shell wrapper (`maestro` / `maestro.bat`), which spawnSync cannot
 * execute with shell:false — MEASURED: the engine step reported "maestro not
 * found" on a machine where `maestro --version` works in the shell, which would
 * have silently skipped the only check that sees classes A-C do not model. Args
 * are quoted here because with shell:true Node does not escape them, and this
 * repo's own path contains spaces.
 */
function runMaestro(args) {
  const quoted = args.map((a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
  return spawnSync(`${MAESTRO_BIN} ${quoted}`, {
    encoding: "utf8",
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
}

function engineCheck(files) {
  if (NO_ENGINE) return { status: "skipped", detail: "--no-engine" };
  const probe = runMaestro(["--version"]);
  if (probe.error || probe.status !== 0) {
    return { status: "absent", detail: `maestro not found (${MAESTRO_BIN})` };
  }
  if (files.length === 0) return { status: "skipped", detail: "no files given" };
  // Windows caps a command line at ~8k characters, and the engine is invoked
  // through a shell (see runMaestro), so 111 file paths arrive as one string and
  // fail with "The command line is too long" — MEASURED on --all, which then
  // reported a refusal instead of a verdict. Above the cap, hand the engine the
  // ROOT DIRECTORY instead: it takes a folder and parses everything under it, so
  // the verdict is the same and only the scope is wider (still sound for a gate).
  let targets = files;
  if (targets.join(" ").length > 6000) targets = [FLOWS_ROOT];
  const res = runMaestro(["test", "--no-ansi", `--udid=${SENTINEL_UDID}`, ...targets]);
  const out = `${res.stdout || ""}\n${res.stderr || ""}`.trim();
  if (res.status === 0) return { status: "pass", detail: "" };
  // Maestro exits 1 for BOTH a load error and an absent device, so the verdict is
  // read from the message. Only a positive "device missing" marker is load-clean;
  // anything else is refused so message drift fails loudly instead of passing.
  if (/not connected|0 devices connected|no devices connected|Missing \d+ device/i.test(out)) {
    return { status: "pass", detail: "" };
  }
  return { status: "refuse", detail: out };
}

// ── main ─────────────────────────────────────────────────────────────────────

if (!fs.existsSync(FLOWS_ROOT)) {
  console.error(`flow-load-check: flow root not found: ${FLOWS_ROOT}`);
  process.exit(1);
}

const allFlows = walk(FLOWS_ROOT).sort();
for (const f of allFlows) checkFile(f);

let engine = { status: "skipped", detail: "" };
if (ALL) {
  engine = engineCheck(allFlows);
} else if (targets.length) {
  engine = engineCheck(targets.map((t) => path.resolve(t)));
} else {
  engine = engineCheck(allFlows);
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ findings, engine, checked: allFlows.length }, null, 2) + "\n");
} else {
  if (engine.status === "absent") {
    // Wording note: the CI pre-commit replay fails on any line matching the
    // lowercase words "skipped"/"skipping" (it reads them as a stage that proved
    // nothing). This is not a stage skip — native checks A-C still ran and still
    // block — so the notice avoids that vocabulary entirely.
    console.log(`WARN  Maestro engine step did NOT run — ${engine.detail}`);
    console.log("      Native checks A-C still ran and still block; install maestro for the full load gate.");
  }
  if (findings.length) {
    console.log(`FAIL  ${findings.length} flow load defect(s):`);
    for (const f of findings) {
      console.log(`  ${f.kind}  ${f.file}:${f.line}`);
      console.log(`        ${f.message}`);
    }
  }
  if (engine.status === "refuse") {
    console.log("FAIL  Maestro engine rejected the flow graph:");
    console.log(
      engine.detail
        .split("\n")
        .map((l) => `      ${l}`)
        .join("\n"),
    );
  }
  if (!findings.length && engine.status !== "refuse") {
    // The pass message must not overstate what ran: with the engine skipped or
    // absent, saying "engine load-clean" would be a claim no check supports.
    const enginePart =
      engine.status === "pass" ? "engine load-clean" : "engine step did NOT run — load verdict is native-only";
    console.log(`OK    ${allFlows.length} flows: references resolve, runScript forms valid, when: shapes valid, ${enginePart}.`);
  }
}

if (REQUIRE_ENGINE && engine.status !== "pass") {
  console.error(
    `flow-load-check: FLOW_LOAD_REQUIRE_ENGINE=1 but the engine step did not run (${engine.status}` +
      `${engine.detail ? `: ${engine.detail}` : ""}) — refusing, because without it the only check that\n` +
      "sees unknown-command classes is missing.",
  );
  process.exit(2);
}
if (findings.length || engine.status === "refuse") process.exit(2);
process.exit(0);
