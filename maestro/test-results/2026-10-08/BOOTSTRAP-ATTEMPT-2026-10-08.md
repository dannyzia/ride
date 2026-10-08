# Emulator bootstrap attempt — 2026-10-08

**Purpose:**     Record the 2026-10-08 emulator-boot attempt and why it did not reach §7.
**Owner:**       Testing model
**Status:**      BLOCKED — emulator died during boot; §7 not reached
**Source of truth:** `maestro/test-results/2026-10-08/emulator-boot.log`, `maestro/test-results/2026-10-08/driver.log`
**Related (concrete paths):**
  - `maestro/utils/run-device-day.sh` — the script that drove this attempt
  - `maestro/DEVICE-DAY-RUNBOOK.md` §1B / §10 — emulator path and this host's known failure modes
  - `maestro/COVERAGE-MANIFEST.md` §7 G-02 — pending device-day ×2 status
**Last verified:** 2026-10-08, by testing model, via live run of `run-device-day.sh --check` (green) and one `PREFLIGHT_EMULATOR=boot` attempt (BLOCKED).
**How to update:** append a new round note only after a day actually reaches §7; this note is a bootstrap-attempt note, not a green day.

## Attempt

- **Command:** `bash utils/run-device-day.sh` with `PREFLIGHT_EMULATOR=boot`, `ADB=/c/Users/callz/platform-tools/adb`, default AVD `Medium_Phone`, headless.
- **Precheck first:** `--check` exited 0 — adb pinned, Maestro 2.6.1, emulator + AVD found, all 6 key-flow files present.
- **§1B:** emulator launched `-avd Medium_Phone -no-snapshot -no-boot-anim -gpu swiftshader_indirect -port 5554 -no-window -no-audio`.
- **Device state during boot:** absent → offline → device (at t+58s). So the AVD did come up far enough to register on adb.
- **Result:** BLOCKED at `emulator-died` — qemu exited during boot before `sys.boot_completed` could be confirmed and before any flow could start.
- **Witness at script end:** adb had already stopped listing the emulator; no qemu process remained. So the AVD did not stay up.

## Evidence

- `maestro/test-results/2026-10-08/emulator-boot.log` — emulator client log from this attempt.
- `maestro/test-results/2026-10-08/driver.log` — script log through §0/§1B.
- No §4–§7 artifacts exist from this attempt (no Metro/utils-server start, no flows).

## Diagnosis so far

This host's existing failure-mode table (DEVICE-DAY-RUNBOOK.md §10) already records the two emulators-most-relevant blockers on this box:
- `unauthorized` (2026-10-03) — not the cause this time; the device reached `device` state.
- `-wipe-data` / windowed guest crash (`UpdateLayeredWindowIndirect failed`) — the script already avoids windowed mode here.

The present failure is different: the AVD registered on adb and then the qemu process exited before a usable boot. The emulator client log is the right place to read the actual shutdown cause; the script already dumps it to `emulator-boot.log` for exactly that.

## Next step

Do not re-run the day against this AVD until the emulator log is read and the host can either boot Medium_Phone cleanly or the day is routed to a different AVD/managed emulator session. If this host cannot boot an emulator unattended, the §7 key-flows-×2 run stays ENV-blocked pending either a working emulator boot or an interactive session that can complete the emulator lifecycle.

## Round-note status

**Not green.** This note documents a bootstrap failure, not a completed device day. No manifest round-note row is appended yet — that happens only after a day reaches §7.
