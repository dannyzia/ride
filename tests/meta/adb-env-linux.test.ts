/**
 * tests/meta/adb-env-linux.test.ts
 *
 * Guards the maestro/utils shell scripts against the CI-gate bug class: a resolver
 * that works perfectly on Git-Bash/Windows but dies on a Linux runner because
 * it reads a Windows-only environment variable without a default.
 *
 * WHY THIS FILE EXISTS. .github/workflows/device-preflight.yml runs on
 * ubuntu-latest and executes `bash maestro/utils/run-device-day.sh --check`,
 * which runs under `set -uo pipefail` (run-device-day.sh:40) and sources
 * adb-env.sh. The resolver's duplicate-build warning expanded a bare
 * `$USERNAME` — always set by Git Bash, never set on a Linux runner. Under
 * `set -u` that expansion is fatal: "USERNAME: unbound variable", the source
 * aborts, and the resolver is dead even though adb itself resolved perfectly.
 * That is what the first simulated-ubuntu run found, and it is invisible to
 * every check that only ever runs on Windows.
 *
 * HOW. Spawn bash with a Linux-like environment — USERNAME, LOCALAPPDATA,
 * USERPROFILE and ADB removed, PATH reduced to a temp bin plus /usr/bin:/bin —
 * put a fake `adb` in that bin, and source the REAL resolver under
 * `set -uo pipefail`, the same shell options as the CI caller (NOT a plain
 * `bash file.sh`, under which the bug does not reproduce). The fake adb
 * answers `version`, so one run exercises resolution, version lookup, the
 * duplicate-build scan and the final report line.
 *
 * NON-VACUITY. Two fault-injected copies restore the pre-fix shape of each
 * Windows-only variable (bare `${USERNAME}` / bare `${LOCALAPPDATA}`) and
 * assert the run FAILS with an unbound-variable error: proof the healthy case
 * can actually catch a regression rather than passing because nothing ran.
 * `$USERNAME` reproduces the exact historical bug (f44a29c); the
 * `$LOCALAPPDATA` copy is the same class applied to the second Windows-only
 * variable the resolver reads. The sandbox copies are sed'ed in a temp dir —
 * the repo's script is never written to.
 *
 * CLASS SCAN. The three runtime cases above prove adb-env.sh's behavior; the
 * final block pins the class STATICALLY across every shell script under
 * maestro/, where the boot-path sites live too (run-device-day.sh's AVD probe
 * and emulator launch expanded bare $USERPROFILE / $LOCALAPPDATA and died the
 * same way before 2026-10-05). The scan's fault pairs restore those exact
 * pre-fix shapes and must flip the outcome.
 *
 * Related (concrete paths):
 *   - maestro/utils/adb-env.sh — the resolver under test
 *   - maestro/utils/run-device-day.sh — the CI caller (`set -uo pipefail`)
 *   - .github/workflows/device-preflight.yml — the ubuntu gate that found it
 *   - maestro/utils/adb-env-selftest.sh — the device-side selftest (its case 6
 *     covers the sibling class: a `die` that leaks a shell error instead of
 *     reporting adb-missing cleanly)
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const REPO = path.resolve(__dirname, "..", "..");
/** Resolver path, relative to the repo root the harness spawns in. */
const RESOLVER = "maestro/utils/adb-env.sh";

/**
 * Pretends to be adb. `version` must print the build line on line 2 — the
 * resolver reads it as `adb version | sed -n '2p' | tr -d '\r'`.
 */
const FAKE_ADB =
  [
    "#!/bin/sh",
    'if [ "$1" = version ]; then',
    "  printf 'Android Debug Bridge version 1.0.41\\nVersion 37.0.0-fake\\n'",
    "fi",
  ].join("\n") + "\n";

/**
 * The script that sources the resolver. `set -uo pipefail` mirrors
 * run-device-day.sh — under `set -u` the bare-`${VAR}` class is fatal.
 */
const INNER =
  [
    "set -uo pipefail",
    '. "$1"',
    "printf 'ADB=%s\\n' \"$ADB\"",
    "printf 'USERNAME=%s\\n' \"${USERNAME-UNSET}\"",
    "printf 'LOCALAPPDATA=%s\\n' \"${LOCALAPPDATA-UNSET}\"",
  ].join("\n") + "\n";

interface Case {
  /** Argument passed to the inner script: the resolver to source. */
  target: string;
  /** Optional harness step that produces an injected copy in $tmp. */
  prepare: string;
}

const HEALTHY: Case = { target: RESOLVER, prepare: "" };

/** Restores the pre-fix expansion; the sed runs against a COPY. */
const BARE_USERNAME: Case = {
  target: '"$tmp/bare-username.sh"',
  prepare: `sed 's/\${USERNAME:-}/\${USERNAME}/g' ${RESOLVER} > "$tmp/bare-username.sh"`,
};

/** Same class, second Windows-only variable. */
const BARE_LOCALAPPDATA: Case = {
  target: '"$tmp/bare-localappdata.sh"',
  prepare: `sed 's/\${LOCALAPPDATA:-}/\${LOCALAPPDATA}/g' ${RESOLVER} > "$tmp/bare-localappdata.sh"`,
};

function harness({ target, prepare }: Case): string {
  return [
    "set -uo pipefail",
    'tmp="$(mktemp -d)"',
    'trap \'rm -rf "$tmp"\' EXIT',
    "",
    'mkdir -p "$tmp/bin"',
    'cat > "$tmp/bin/adb" <<\'FAKE_ADB\'',
    FAKE_ADB + "FAKE_ADB",
    'chmod +x "$tmp/bin/adb"',
    "",
    'cat > "$tmp/inner.sh" <<\'INNER\'',
    INNER + "INNER",
    "",
    prepare,
    "",
    'bash_abs="$(command -v bash)"',
    "env -u USERNAME -u LOCALAPPDATA -u USERPROFILE -u ADB \\",
    '  PATH="$tmp/bin:/usr/bin:/bin" "$bash_abs" "$tmp/inner.sh" ' + target,
  ].join("\n");
}

function runCase(c: Case) {
  const r = spawnSync("bash", ["-c", harness(c)], { cwd: REPO, encoding: "utf8" });
  if (r.error) {
    // Not skipped on purpose: CI always has bash, and the dev environment that
    // owns the device scripts is Git Bash. A skip here would hide the guard.
    throw new Error(
      `adb-env-linux.test.ts could not spawn bash (${r.error.message}). ` +
        `This test needs Git Bash on Windows or bash in CI; it must not be skipped.`
    );
  }
  return r;
}

describe("adb-env.sh on a Linux-like env (CI-gate regression guard)", () => {
  it("resolves adb and exits 0 with USERNAME and LOCALAPPDATA unset", () => {
    const r = runCase(HEALTHY);
    expect(r.status).toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    // The failure mode this guard exists for, in either shell's wording.
    expect(out).not.toMatch(/unbound variable/);
    expect(out).not.toMatch(/numeric argument required/);
    // The full tail ran — not silenced by ADB_ENV_QUIET and not cut short.
    expect(r.stdout).toMatch(/^adb:/m);
    expect(r.stdout).toContain("Version 37.0.0-fake");
    // Resolved through the fake adb on the controlled PATH, not a system build.
    const adb = /^ADB=(.+)$/m.exec(r.stdout)?.[1] ?? "";
    expect(adb.endsWith("/bin/adb")).toBe(true);
    // The env really was Linux-like at the point of the expansions.
    expect(r.stdout).toContain("USERNAME=UNSET");
    expect(r.stdout).toContain("LOCALAPPDATA=UNSET");
  });

  it("fault injection: a bare ${USERNAME} dies — the guard is not vacuous", () => {
    const r = runCase(BARE_USERNAME);
    expect(r.status).not.toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain("unbound variable");
    expect(out).toContain("USERNAME");
    // Died inside the source: the inner script's post-source markers never ran.
    expect(r.stdout).not.toContain("USERNAME=UNSET");
  });

  it("fault injection: a bare ${LOCALAPPDATA} dies — the guard is not vacuous", () => {
    const r = runCase(BARE_LOCALAPPDATA);
    expect(r.status).not.toBe(0);
    const out = `${r.stdout}${r.stderr}`;
    expect(out).toContain("unbound variable");
    expect(out).toContain("LOCALAPPDATA");
    expect(r.stdout).not.toContain("LOCALAPPDATA=UNSET");
  });
});

/** Windows-only variables: always set by Git Bash, never set on a Linux runner. */
const WINDOWS_ONLY_VARS = [
  "LOCALAPPDATA",
  "USERPROFILE",
  "USERNAME",
  "APPDATA",
  "HOMEDRIVE",
  "HOMEPATH",
  "COMSPEC",
  "USERDOMAIN",
  "ProgramData",
  "ProgramFiles",
  "SystemRoot",
  "windir",
  "ALLUSERSPROFILE",
  "OneDrive",
];

interface BareHit {
  line: number;
  text: string;
}

/**
 * Flag every expansion of a Windows-only variable with NO shell default.
 * Braced-with-default (`${VAR:-…}`, `${VAR-…}`, `${VAR:+…}`, …) is set -u safe;
 * bare `$VAR` and braced-without-default `${VAR}` are the bug. Comment lines
 * are skipped — the comments document the class by name on purpose.
 */
function findBareWindowsVarExpansions(src: string): BareHit[] {
  const hits: BareHit[] = [];
  const re = new RegExp(`\\$\\{?(${WINDOWS_ONLY_VARS.join("|")})\\b`, "g");
  src.split("\n").forEach((line, i) => {
    if (/^\s*#/.test(line)) return;
    for (const m of line.matchAll(re)) {
      const after = line.slice((m.index ?? 0) + m[0].length);
      if (m[0].includes("{") && /^[:?+=-]/.test(after)) continue;
      hits.push({ line: i + 1, text: line.trim() });
    }
  });
  return hits;
}

function walkSh(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkSh(p, out);
    else if (e.name.endsWith(".sh")) out.push(p);
  }
  return out;
}

const RUN_DEVICE_DAY = fs.readFileSync(path.resolve(REPO, "maestro/utils/run-device-day.sh"), "utf8");

describe("Windows-only env vars under set -u, across all maestro/ shell scripts", () => {
  it("no script expands a Windows-only variable without a shell default", () => {
    const files = walkSh(path.join(REPO, "maestro"));
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.flatMap((f) => {
      const hits = findBareWindowsVarExpansions(fs.readFileSync(f, "utf8"));
      return hits.length ? [{ file: path.relative(REPO, f).replace(/\\/g, "/"), hits }] : [];
    });
    expect(offenders).toEqual([]);
  });

  it("fault injection: bare $USERPROFILE at the AVD probe is flagged (guard not vacuous)", () => {
    const faulted = RUN_DEVICE_DAY.replace(
      '"${USERPROFILE:-$HOME}/.android/avd/$AVD.ini"',
      '"$USERPROFILE/.android/avd/$AVD.ini"'
    );
    // The anchor must exist — proves the site under test is real, not a no-op replace.
    expect(faulted).not.toBe(RUN_DEVICE_DAY);
    expect(findBareWindowsVarExpansions(faulted).some((h) => h.text.includes("$USERPROFILE/.android"))).toBe(true);
  });

  it("fault injection: bare $LOCALAPPDATA at the emulator launch is flagged (guard not vacuous)", () => {
    const faulted = RUN_DEVICE_DAY.replace(
      '"${LOCALAPPDATA:-}/Android/Sdk/emulator/emulator.exe"',
      '"$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe"'
    );
    expect(faulted).not.toBe(RUN_DEVICE_DAY);
    expect(findBareWindowsVarExpansions(faulted).some((h) => h.text.includes("$LOCALAPPDATA/Android"))).toBe(true);
  });
});
