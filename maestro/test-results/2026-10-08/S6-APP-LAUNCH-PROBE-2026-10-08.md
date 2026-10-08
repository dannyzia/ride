# §6 app-launch probe — 2026-10-08

**Purpose:**     Diagnose why `run-device-day.sh` blocked at `app-launch-failed` after a clean emulator boot this session.
**Owner:**       Testing model
**Status:**      BLOCKED — com.ride.bd has no installed package on the now-booted AVD
**Source of truth:** live adb probe against emulator-5554 + `maestro/test-results/2026-10-08/driver.log`
**Related (concrete paths):**
  - `maestro/utils/run-device-day.sh` — §6 is where this blocked
  - `maestro/DEVICE-DAY-RUNBOOK.md` §6 and §10 — app launch + failure-mode table
  - `TEST-SETUP.md` §3 — dev build install prerequisite
**Last verified:** 2026-10-08, by testing model, via direct adb against emulator-5554 after `PREFLIGHT_EMULATOR=boot` reached “booted”.
**How to update:** re-run after a dev build is installed on the AVD (or on a different AVD) and §6 either passes or fails for a different reason.

## State at the §6 block

- Emulator reached `device` and `sys.boot_completed=1` in this run; the script then reached §6.
- `pm list packages com.ride.bd` returned nothing.
- `pm path com.ride.bd` returned nothing.
- `monkey -p com.ride.bd 1` returned exit 252 with:
  - stdout: `** No activities found to run, monkey aborted.`
  - stderr: `data="com.ride.bd"`
- Control probe was healthy: `monkey -p com.android.settings 1` returned exit 0 and injected 1 event; `pm path com.android.settings` returned a real APK path.

## Interpretation

This is not a monkey, permission, or launch-policy failure. It is “no matching package installed.”

`pm list packages com.ride.bd` with no output means the AVD does not have a `com.ride.bd` install. That is why `monkey -p com.ride.bd 1` says “No activities found to run” rather than “Activity not started” or some install-time refusal.

So the next blocker on this host is simply: a dev build of `com.ride.bd` must be installed on Medium_Phone before §6 can proceed.

## What changed versus prior attempts this session

- Earlier attempts failed at §1B (`emulator-not-present`, then `emulator-died`) before reaching app launch at all.
- This run reached §6 and failed cleanly for the obvious reason: no app present.

## Next step if continuing this session

Install a dev build of `com.ride.bd` on the AVD, then re-run §6 (or the full device day). If the session is not going to do a native build now, then the device day stays blocked here and should be recorded as “no dev build installed on AVD”, not “emulator won’t boot.”
