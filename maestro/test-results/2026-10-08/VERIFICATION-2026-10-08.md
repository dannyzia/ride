# Verification run — 2026-10-08

**Purpose:**     Machine-verifiable summary of this session’s device-day attempt and diagnosis, for the manifest round note and for the next session’s starting point.
**Owner:**       Testing model
**Status:**      BLOCKED — emulator now boots on this host, but §6 stops because `com.ride.bd` has no installed package on the AVD
**Source of truth:** this file, `maestro/test-results/2026-10-08/driver.log`, `maestro/test-results/2026-10-08/emulator-boot.log`, and the two probe notes below
**Related (concrete paths):**
  - `maestro/utils/run-device-day.sh`
  - `maestro/DEVICE-DAY-RUNBOOK.md` §1B, §6, §10
  - `maestro/COVERAGE-MANIFEST.md` §7 G-02
  - `maestro/test-results/2026-10-08/BOOTSTRAP-ATTEMPT-2026-10-08.md`
  - `maestro/test-results/2026-10-08/S6-APP-LAUNCH-PROBE-2026-10-08.md`
**Last verified:** 2026-10-08, by testing model, by running `run-device-day.sh --check` live and by running one `PREFLIGHT_EMULATOR=boot` attempt plus a direct `pm list packages` / `pm path` / `monkey` probe against the booted AVD.
**How to update:** overwrite only after a later attempt reaches a different final state; do not append green-day rows until §7 actually runs.

## What I did this session

1. Ran `bash utils/run-device-day.sh --check` with pinned adb and default AVD.
   - Exit 0.
   - adb pinned to `/c/Users/callz/platform-tools/adb` (v37.0.0-14910828), duplicate v36.0.0 build reported.
   - Maestro 2.6.1 present.
   - Emulator binary resolved to `C:\Users\callz\AppData\Local\Android\sdk\emulator\emulator`.
   - AVD `Medium_Phone` present.
   - All 6 §7 key-flow files present.

2. Ran `bash utils/run-device-day.sh` with `PREFLIGHT_EMULATOR=boot` several times.
   - First two boots: emulator never reached a usable state (`emulator-not-present`, then `emulator-died`).
   - Later boot: emulator reached `device` and `sys.boot_completed=1` (`emulator-5554`), so §1B passed.
   - After that boot, the script reached §4 (Metro + utils-server), §5 (GPS seeded), and then §6.

3. Ran a direct §6 probe against the booted AVD.
   - `pm list packages com.ride.bd` → empty.
   - `pm path com.ride.bd` → empty.
   - `monkey -p com.ride.bd 1` → exit 252, `** No activities found to run, monkey aborted.`
   - Control probe was healthy: `monkey -p com.android.settings 1` → exit 0, `pm path com.android.settings` → real APK path.

## Outcome

**Not green.** The run did not reach §7.

- The blocker that prevented earlier boots (emulator not present / emulator died during boot) finally cleared on a later boot: the AVD did reach `device` + `boot_completed=1`.
- The blocker that stopped the run was the next one down: **no `com.ride.bd` dev build installed on the AVD**, so there is nothing for §6 to launch.

That is a clean, concrete failure rather than a vague hang:
- `monkey` itself works on this AVD.
- `pm` itself works on this AVD (it can list packages and resolve `com.android.settings`).
- The AVD simply does not contain `com.ride.bd`.

## Evidence written this session

- `maestro/test-results/2026-10-08/BOOTSTRAP-ATTEMPT-2026-10-08.md` — records the emulator-boot attempt that died during boot.
- `maestro/test-results/2026-10-08/S6-APP-LAUNCH-PROBE-2026-10-08.md` — records the §6 diagnosis that `com.ride.bd` is absent from the booted AVD.
- Runbook §10 updated with the new failure mode: “emulator boots to `device` but `pm list packages com.ride.bd` is empty”.

## What still needs to happen for a green day

1. Get a dev build of `com.ride.bd` onto Medium_Phone (or another working AVD on this host).
2. Re-run either §6 directly or the full device day.
3. If §6 passes, continue into §7 (6 key flows ×2) and capture the manifest-required evidence per DEVICE-DAY-RUNBOOK.md §8.

## What did not change this session

- No `app/` code changed.
- No flow YAML changed.
- No `utils/` device script changed for behavior; only the runbook’s failure-mode table is augmented.
- No manifest round-note row is appended yet, because the day did not reach §7.

## Bottom line for the manifest

This session turned the emulator-layer blocker into a more useful answer: on this host, Medium_Phone CAN boot to `device`, but the AVD has no `com.ride.bd` install, so the device day still cannot start §6 from this session.
