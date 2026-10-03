# Device day 2026-10-03 — BLOCKED at bring-up (§1B emulator path)

**Outcome: STOPPED THE DAY. No flow was executed. Not green.**
Key-flows-×2 (§7) never started: the emulator never reached adb `device` state, so
`sys.boot_completed` is unreadable, Metro is unreachable from the device, and
`maestro test` cannot attach. Everything downstream of §1B is therefore unverified.

## Pass matrix

| Flow | run 1 | run 2 | Maestro exit |
|---|---|---|---|
| `auth/02-rider-login.yaml` | NOT RUN | NOT RUN | — |
| `auth/04-driver-login.yaml` | NOT RUN | NOT RUN | — |
| `rider/booking/01-basic-ride-request.yaml` | NOT RUN | NOT RUN | — |
| `driver/home/02-go-online.yaml` | NOT RUN | NOT RUN | — |
| `driver/rides/02-accept-offer.yaml` | NOT RUN | NOT RUN | — |
| `driver/rides/09-complete-ride.yaml` | NOT RUN | NOT RUN | — |

## Blocking symptom

`adb devices` reports `emulator-5554  unauthorized` indefinitely. The emulator
process itself stays alive (qemu ~2.3 GB RSS) and the adb server starts cleanly,
but the guest never accepts the host key, so it never leaves `offline`/`unauthorized`
and `getprop sys.boot_completed` can never return `1`.

## Remedies attempted (all failed)

| # | Attempt | Result |
|---|---|---|
| 1 | `-avd Medium_Phone` normal boot | `unauthorized` |
| 2 | `-no-snapshot-save -no-boot-anim` cold boot | `unauthorized` |
| 3 | `-wipe-data` full wipe | emulator process **crashed**: `UpdateLayeredWindowIndirect failed … (A device attached to the system is not functioning.)` |
| 4 | `-no-window -no-audio -gpu swiftshader_indirect` (headless) | process survives, still `unauthorized` |
| 5 | Unified two conflicting adb builds (SDK v36 vs PATH v37) onto one binary | `unauthorized` |
| 6 | `adb disconnect` + `reconnect` | `unauthorized` |
| 7 | Fresh scoped keyring via `ADB_VENDOR_KEYS` + `adb keygen` (user's `~/.android/adbkey` left untouched) | `unauthorized` — error confirms the scoped key WAS in use |
| 8 | **Second AVD** `-avd Pixel_6a`, headless | `unauthorized` — identical |

Attempt 8 is the decisive one: two independent AVDs fail the same way, so this is
**not a corrupt image**. The emulator's adb-authorization path is non-functional
in this environment. Attempt 3's windowing error hints at the likely cause — no
usable interactive desktop session for the guest's key-confirmation, which is
also what the runbook already records for the physical device (§1A/§10).

## Environment notes for whoever picks this up

- Two adb installs are on this box and disagree: `C:\Users\callz\platform-tools\adb.exe`
  (**v37.0.0**, first on PATH, and the one the emulator client invokes) and
  `C:\Users\callz\AppData\Local\Android\Sdk\platform-tools\adb.exe` (**v36.0.0**).
  Both start servers on tcp:5037. Pin one before any device work — this alone
  caused a misleading `unauthorized` earlier in the session.
- `~/.android/adbkey` + `.pub` exist and were **not** modified.
- Teardown performed: qemu killed, `adb kill-server` issued. Machine left clean.
- `maestro --version` → 2.6.1 present at `C:/maestro/bin/maestro`; not exercised.
- §2 env sync / §4 Metro + utils-server / §5 GPS / §6 permissions were **not**
  reached — they are all downstream of a booted device. Metro (8081) and
  utils-server (3001) state was not probed this session.

## Files in this directory

- `bringup-diagnostic.txt` — adb/server/emulator/AVD state, verbatim
- `emulator-boot.log` — Medium_Phone boot transcript (attempt 4, headless)
- `emulator-boot-Pixel_6a.log` — Pixel_6a boot transcript (attempt 8)