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
 */

import fs from "fs";
import path from "path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promises as fsp } from "node:fs";
import { spawnSync } from "node:child_process";
import glob from "glob";

const ROOT = process.cwd();
const MAESTRO = path.join(ROOT, "maestro");
const ADB_ENV = path.join(MAESTRO, "utils", "adb-env.sh");

/**
 * The sandbox runs under Git Bash on the Windows dev host (the environment that
 * owns the device scripts) and plain bash on CI. System32\bash.exe on Windows
 * is WSL — a DIFFERENT Linux with /mnt/* drive mappings the scripts never see —
 * so on win32 we spawn the Git Bash binary explicitly and translate sandbox
 * paths to MSYS drive form (/d/...), while node's own fsp calls keep using the
 * Windows spelling of the same physical file.
 */
const GIT_BASH = "C:\\Program Files\\Git\\bin\\bash.exe";
const BASH =
  process.platform === "win32" && fs.existsSync(GIT_BASH) ? GIT_BASH : "bash";

function toSandboxPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_m, d: string) => `/${d.toLowerCase()}`);
}

/**
 * node's fsp.chmod cannot set the MSYS executable attribute on Windows/DrvFS,
 * and without it Git Bash refuses to exec the stub (empty output). Write the
 * two-line fake `adb version` payload, then set the exec bit FROM Git Bash —
 * the same way the real device scripts end up executable.
 */
async function writeExecutableStub(binDir: string, adbBin: string): Promise<void> {
  await fsp.mkdir(binDir, { recursive: true });
  await fsp.writeFile(
    adbBin,
    "#!/bin/sh\necho \"Android Debug Bridge version 1.0.41\"\necho \"Version 36.1.10-fake\"\n",
    "utf8"
  );
  spawnSync(BASH, ["-c", `chmod +x '${toSandboxPath(adbBin)}'`]);
}

describe("adb-env.sh Linux-only variable guard", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "adb-env-"));
  });

  afterEach(async () => {
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  async function shell(
    source: string,
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      input?: string;
      maxBuffer?: number;
      /** shell fragment run between `set -u` and the source, e.g. `unset USERNAME` */
      prelude?: string;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const sandboxSource = toSandboxPath(source);
    // MSYS2 re-synthesizes Windows variables (USERNAME, ...) from the Windows
    // token no matter what the parent env omits — the only way to observe the
    // Linux-runner condition locally is an explicit unset inside the sandbox.
    const parts = ["set -uo pipefail"];
    if (options.prelude) parts.push(options.prelude);
    parts.push(`source '${sandboxSource}'`);
    const proc = spawnSync(
      BASH,
      ["-c", parts.join("; ")],
      {
        cwd: options.cwd,
        env: options.env,
        input: options.input,
        maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
        encoding: "utf8",
      }
    );
    const stdout = proc.stdout ?? "";
    const stderr = proc.stderr ?? "";
    const exitCode = proc.status ?? (proc.error ? -1 : 0);
    if (exitCode !== 0) {
      throw new Error(
        `adb-env sandbox exited ${exitCode} (spawn error: ${proc.error?.message ?? "none"})\n${stdout}\n${stderr}`
      );
    }
    return { stdout, stderr, exitCode };
  }

  it("resolves the pinned adb and prints its version without dying on a Linux env", async () => {
    const binDir = join(tmp, "bin");
    const adbBin = join(binDir, "adb");
    await writeExecutableStub(binDir, adbBin);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: toSandboxPath(binDir) + ":/usr/bin:/bin",
    };

    const resolved = await shell(ADB_ENV, { cwd: MAESTRO, env });
    expect(resolved.exitCode).toBe(0);
    // adb-env.sh reports `adb: <path> (<sed -n '2p' of "adb version">)`; the
    // two-line fake adb makes that the stub's second line.
    expect(resolved.stdout).toMatch(/Version 36\.1\.10-fake/);
  });

  it("flags a bare $USERNAME in adb-env.sh as a Linux-only variable under set -u", async () => {
    // Read the REAL resolver content — ADB_ENV is a path string, not content.
    // replaceAll is load-bearing: the file mentions ${USERNAME:-} in a COMMENT
    // before the code line, and a first-only replace would fault the comment
    // while leaving the actual code line guarded (the fault never fires).
    const faulted = (await fsp.readFile(ADB_ENV, "utf8")).replaceAll(
      "${USERNAME:-}",
      "$USERNAME"
    );
    const faultedPath = join(tmp, "adb-env-faulted.sh");
    await fsp.writeFile(faultedPath, faulted, "utf8");

    const binDir = join(tmp, "bin");
    const adbBin = join(binDir, "adb");
    await writeExecutableStub(binDir, adbBin);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: toSandboxPath(binDir) + ":/usr/bin:/bin",
    };

    let threw = false;
    try {
      // `unset USERNAME` reproduces the Linux runner (MSYS2 would otherwise
      // re-synthesize USERNAME from the Windows token, masking the fault).
      await shell(faultedPath, { cwd: MAESTRO, env, prelude: "unset USERNAME" });
    } catch (err: unknown) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unbound variable|USERNAME/);
    }
    expect(threw).toBe(true);
  });

  it("flags a bare $LOCALAPPDATA in adb-env.sh as a Linux-only variable under set -u", async () => {
    // The LOCALAPPDATA line is adb-env.sh's resolution step 3 (the SDK
    // fallback), reached only when adb is NOT on PATH — so this sandbox has
    // NO stub bin on PATH. Faulting the guarded expansion makes set -u abort
    // at that line instead of dying the ordinary "no adb found" way.
    const faulted = (await fsp.readFile(ADB_ENV, "utf8")).replaceAll(
      "${LOCALAPPDATA:-}",
      "$LOCALAPPDATA"
    );
    const faultedPath = join(tmp, "adb-env-faulted-localappdata.sh");
    await fsp.writeFile(faultedPath, faulted, "utf8");

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: "/usr/bin:/bin",
    };

    let threw = false;
    try {
      await shell(faultedPath, { cwd: MAESTRO, env });
    } catch (err: unknown) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unbound variable|LOCALAPPDATA/);
    }
    expect(threw).toBe(true);
  });

  it("pins the class statically across every shell script under maestro/", async () => {
    const files = await glob(join(MAESTRO, "**", "*.sh"), { absolute: true });
    const windowsOnly: string[] = [];
    for (const file of files) {
      const src = await fsp.readFile(file, "utf8");
      if (/(^|[^:\w])USERNAME([^:\w]|$)/.test(src)) windowsOnly.push(file);
      if (/(^|[^:\w])LOCALAPPDATA([^:\w]|$)/.test(src)) windowsOnly.push(file);
      if (/(^|[^:\w])USERPROFILE([^:\w]|$)/.test(src)) windowsOnly.push(file);
    }
    expect(windowsOnly).toEqual([]);
  });
});
