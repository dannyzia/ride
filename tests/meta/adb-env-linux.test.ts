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

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import glob from 'glob';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAESTRO = join(ROOT, '..', 'maestro');
const ADB_ENV = join(MAESTRO, 'utils', 'adb-env.sh');
const CMD = join(MAESTRO, 'utils', 'run-device-day.sh');

describe('adb-env.sh Linux-only variable guard', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'adb-env-'));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  async function shell(
    source: string,
    options: {
      cwd: string;
      env: Node.ProcessEnv;
      input?: string;
      maxBuffer?: number;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const cmd = `bash -c 'set -uo pipefail; source "${source}" "$@"' _`;
    const proc = await fs.execFileSync('bash', ['-c', cmd, 'bash', source], {
      cwd: options.cwd,
      env: options.env,
      input: options.input,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      encoding: 'utf8',
    });
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  it('resolves the pinned adb and prints its version without dying on a Linux env', async () => {
    const adbBin = join(tmp, 'adb');
    await fs.writeFile(
      adbBin,
      '#!/bin/sh\necho "adb version 36.1.10\n"',
      'utf8'
    );
    await fs.chmod(adbBin, 0o755);

    const env: Node.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: join(tmp, 'bin') + ':' + '/usr/bin:/bin',
    };

    const resolved = await shell(ADB_ENV, { cwd: MAESTRO, env });
    expect(resolved.exitCode).toBe(0);
    expect(resolved.stdout).toMatch(/adb version/);
  });

  it('flags a bare $USERNAME in adb-env.sh as a Linux-only variable under set -u', async () => {
    const faulted = ADB_ENV.replace('${USERNAME:-}', '$USERNAME');
    const faultedPath = join(tmp, 'adb-env-faulted.sh');
    await fs.writeFile(faultedPath, faulted, 'utf8');

    const adbBin = join(tmp, 'adb');
    await fs.writeFile(adbBin, '#!/bin/sh\necho "adb version 36.1.10\n"', 'utf8');
    await fs.chmod(adbBin, 0o755);

    const env: Node.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: join(tmp, 'bin') + ':' + '/usr/bin:/bin',
    };

    let threw = false;
    try {
      await shell(faultedPath, { cwd: MAESTRO, env });
    } catch (err: unknown) {
      threw = true;
      const msg = err instanceof Error ? err.message : String(err);
      expect(msg).toMatch(/unbound variable|USERNAME/);
    }
    expect(threw).toBe(true);
  });

  it('flags a bare $LOCALAPPDATA in run-device-day.sh as a Linux-only variable under set -u', async () => {
    const faulted = CMD.replace('${LOCALAPPDATA:-}', '$LOCALAPPDATA');
    const faultedPath = join(tmp, 'run-device-day-faulted.sh');
    await fs.writeFile(faultedPath, faulted, 'utf8');

    const adbBin = join(tmp, 'adb');
    await fs.writeFile(adbBin, '#!/bin/sh\necho "adb version 36.1.10\n"', 'utf8');
    await fs.chmod(adbBin, 0o755);

    const env: Node.ProcessEnv = {
      ...process.env,
      USERNAME: undefined,
      LOCALAPPDATA: undefined,
      USERPROFILE: undefined,
      ADB: undefined,
      PATH: join(tmp, 'bin') + ':' + '/usr/bin:/bin',
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

  it('pins the class statically across every shell script under maestro/', async () => {
    const files = await glob(join(MAESTRO, '**', '*.sh'), { absolute: true });
    const windowsOnly: string[] = [];
    for (const file of files) {
      const src = await fs.readFile(file, 'utf8');
      if (/(^|[^:\w])USERNAME([^:\w]|$)/.test(src)) windowsOnly.push(file);
      if (/(^|[^:\w])LOCALAPPDATA([^:\w]|$)/.test(src)) windowsOnly.push(file);
      if (/(^|[^:\w])USERPROFILE([^:\w]|$)/.test(src)) windowsOnly.push(file);
    }
    expect(windowsOnly).toEqual([]);
  });
});
