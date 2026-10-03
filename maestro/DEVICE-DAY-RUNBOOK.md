# Device-Day Bring-Up Runbook — Key Flows ×2 (Unattended)

**Purpose:**     Step-by-step bring-up + execution checklist so the ENV-blocked key-flows-×2 run executes unattended from a cold machine (or from the currently half-warm one). Covers the physical-device unlock workaround, the Maestro driver-APK `INSTALL_FAILED_USER_RESTRICTED` workaround, Metro/utils-server startup, and the GPS host scripts.
**Owner:**       Testing model (this session) — Zia owns physical device state (unlock, dev-mode toggles)
**Status:**      ACTIVE
**Source of truth:** `TEST-SETUP.md` §1–2 (IP sync + startup order) — this runbook extends it for Maestro unattended runs, it does not replace it
**Related (concrete paths):**
  - `maestro/utils/run-device-day.sh` — **executable form of §1B–§8 below** (one unattended command)
  - `maestro/utils/adb-env.sh` — **single-adb resolver every device script sources** (see "One adb, one build")
  - `maestro/utils/adb-env-selftest.sh` — proves all device scripts resolve the same adb
  - `maestro/utils/run-flow-twice.sh` — **the §7 ×N harness itself** (repeat, timeout, log, FAIL screenshot, matrix row); run it directly for an ad-hoc flow
  - `maestro/utils/section7-preflight-gate.sh` — proves the §7 preflight gate below still fails fast
  - `.github/workflows/device-preflight.yml` — **CI gate** that runs this runbook's preflight on `ubuntu-latest` (which owns no device) so adb / AVD / key-flow drift fails a PR instead of the next device day
  - `maestro/utils/bootstrap-device-day.sh` — automated steps 1–5 of this runbook
  - `maestro/utils/adb-gps-banani.sh`, `maestro/utils/adb-gps-gulshan.sh` — GPS seeding (emulator only)
  - `maestro/COVERAGE-MANIFEST.md` §7 G-02 / round notes — what the key-flows-×2 run must produce
  - `TEST-SETUP.md` §5 — failure modes table (splash-hang, black screen, stale IP)
  - `scripts/dev-env-sync.js` — the LAN-IP sync every session depends on
**Last verified:** 2026-10-03, by testing model (adb dual-build pinning now centralised in `adb-env.sh` + proven by `adb-env-selftest.sh`, the §7 preflight gate proven by `section7-preflight-gate.sh`, headless-emulator image name, and the `adb-unauthorized` blocker all confirmed live). Device-day preflight is now ALSO run in CI by `.github/workflows/device-preflight.yml` under `PREFLIGHT_DEVICE=optional` — verified locally against a simulated `ubuntu-latest` (no `LOCALAPPDATA`/`USERPROFILE`/`USERNAME`, no AVD, stub `adb`+`maestro` on a minimal PATH): exit 0 healthy, exit 1 for a missing adb or a missing Maestro. Two defects that would have made that gate fail on a real runner are fixed — `adb-env.sh` died with `USERNAME: unbound variable` (that variable does not exist on Linux), and `adb_env_die` was called with the remedy text in its exit-status slot, so `exit` failed and the resolver carried on with an empty `$ADB` instead of stopping. `adb-env-selftest.sh` case 6 now guards the second one. The first real GitHub runner execution is still unproven
**How to update:** after every device day, append newly hit failure modes to the table at the bottom and correct any step that drifted.

---

## One adb, one build

Two adb builds are installed side by side on this host (`platform-tools/adb.exe`
v37 on PATH, and `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` v36). Both
start a server on **tcp:5037**, so a session that mixes them produces
diagnostics describing whichever binary answered — the `unauthorized` state on
2026-10-03 was partly chased against the build the emulator never invoked.

**All device tooling resolves one adb through `maestro/utils/adb-env.sh`.** Every
script under `maestro/utils/` sources it and calls `"$ADB"`, so one device day
cannot drive two binaries:

```bash
. maestro/utils/adb-env.sh        # prints the resolved binary + version
ADB=/path/to/adb bash maestro/utils/bootstrap-device-day.sh   # explicit override
```

Resolution order: `$ADB` → PATH → Android SDK. **PATH wins by default on
purpose** — it is the build the emulator client itself invokes, so pinning to a
different build could desynchronise the emulator rather than fix it. The pin
guarantees *consistency*, not a different binary. Any other build found is
reported; override with `ADB=` if you need the other one.

Verify after editing any device script:

```bash
bash maestro/utils/adb-env-selftest.sh    # exit 0 = one adb everywhere
```

It checks all device scripts resolve identically, that none is left calling bare
`adb`, that `ADB=` is honoured, and that a bad `ADB=` fails loudly instead of
silently falling back to PATH.

---

## One-command path (recommended)

`maestro/utils/run-device-day.sh` is this runbook in executable form — §1B through §8, unattended, in order:

```bash
bash maestro/utils/run-device-day.sh                      # default AVD, headless
bash maestro/utils/run-device-day.sh --avd Pixel_6a      # different AVD
bash maestro/utils/run-device-day.sh --windowed           # show the emulator window
bash maestro/utils/run-device-day.sh --keep-emulator      # leave the emulator up afterwards
```

Exit codes: **0** all key flows passed ×2 · **1** BLOCKED at a bring-up step · **2** bring-up OK but a flow failed (§7 stop-the-day).

**Check first, without touching anything:**

```bash
bash maestro/utils/run-device-day.sh --check          # preconditions only
bash maestro/utils/run-device-day.sh --check --avd Pixel_6a
```

`--check` validates and exits **0** when everything is ready, **1** when a
precondition fails. It resolves and reports the pinned adb, checks the Maestro
CLI, the emulator binary, the AVD, and every §7 key-flow file, and reports any
already-attached device. It does **not** boot an emulator, start
Metro/utils-server, or run a single flow, and it creates no evidence directory.
It also exits before the `trap cleanup EXIT` is installed — the normal path
kills any running `qemu` and stops the adb server, so a "check" that went
through that trap could tear down an emulator you were using for something
else. Worth running before a device day, and when a flow misbehaves, to tell
"environment is wrong" apart from "the flow is wrong".

### The same preflight in CI

`--check` has one knob, `PREFLIGHT_DEVICE`, because a CI runner is not a
device-day host. It owns no emulator and no AVD, so those two preconditions
are reported as `⊘` SKIP rather than failing; **everything else stays
blocking** — pinned-adb resolution, the Maestro CLI, and every §7 key-flow file:

```bash
PREFLIGHT_DEVICE=required bash maestro/utils/run-device-day.sh --check  # device-day host (default)
PREFLIGHT_DEVICE=optional bash maestro/utils/run-device-day.sh --check  # CI runner, no device
```

`.github/workflows/device-preflight.yml` runs the `optional` form on
`ubuntu-latest` on every push/PR touching `maestro/**`, then runs
`adb-env-selftest.sh` (a new script calling bare `adb`, or one that stops
sourcing `adb-env.sh`, fails there — discovery is dynamic, so nothing has
to be registered) and `section7-preflight-gate.sh`. The workflow calls these
scripts; it never re-implements them, because a copy here would be exactly
the drift the gate exists to catch.

So CI catches: a renamed or deleted key flow, a broken adb resolver, an
unpinned device script, a drifted §7 gate, a rotted Maestro install recipe.
It deliberately does NOT claim to catch AVD state — an AVD is a per-machine
artefact that only the device-day host has, so its absence on a runner is
reported, never treated as a failure.


It **fails loudly at the first blocked step**: each step calls `die BLOCKER "cause" "remedy"`, printing the blocker name, what caused it, how to fix it, and where the evidence landed — then exits non-zero. It deliberately does *not* use `set -e`, because a bare exit code tells you nothing and `set -e` also aborts on incidental non-zero exits (`adb pm grant` on an absent permission) that are expected.

Things it does that the manual sections do not, all of which bit us on 2026-10-03:

- **Pins one adb build** and warns when two disagree (both bind tcp:5037 → misleading `unauthorized`).
- **Aborts on the `unauthorized` state immediately** instead of burning the boot timeout, with the full "this is not fixable from the shell" diagnosis.
- **Defaults to headless** (`-no-window`); window creation is what crashed the emulator on this host.
- **Kills the right process on cleanup** — the headless image is `qemu-system-x86_64-headless.exe`, so matching only the windowed name silently leaks an emulator between runs.
- Writes `maestro/test-results/<date>/` with a per-run log, failure screenshots, a pass matrix, and a `RESULT.md`.

The sections below remain authoritative for *why* each step matters and for manual/fallback execution. Overridable via env: `BOOT_TIMEOUT_S`, `SERVER_TIMEOUT_S`, `FLOW_TIMEOUT_S`, `RUNS_PER_FLOW`, `MAESTRO_BIN`.

---

## 0. Context: what is blocked and why

The key-flows-×2 run (each key flow executed twice consecutively to prove repeatability) was ENV-blocked on 2026-09-27:

1. **Physical Samsung 24261JEGR10296 is pattern-locked.** `adb shell input keyevent 82` (MENU) does not dismiss the pattern lock; screen sits on `systemui` keyguard. Unattended unlock of a pattern-locked device is impossible over plain adb — only an owner-entered pattern or a one-time dev-mode relaxation works.
2. **Maestro's driver APK install was refused** on that device with `INSTALL_FAILED_USER_RESTRICTED` — MIUI/HyperOS-style restriction ("USB install" / "Install via USB" toggle), not a signature or space problem.
3. **No emulator was running** (`adb devices` → empty).

⇒ **Unattended path = emulator, not the physical phone.** The phone path needs a one-time owner step (§1A); the emulator path needs none (§1B) and is the default for this runbook.

**Key flows to execute ×2** (fixed list; repeat each twice, resetting state between repeats per §7):
- `maestro/flows/auth/02-rider-login.yaml`
- `maestro/flows/auth/04-driver-login.yaml`
- `maestro/flows/rider/booking/01-basic-ride-request.yaml`
- `maestro/flows/driver/home/02-go-online.yaml` (includes the launch_free first-run wallet-card assertion)
- `maestro/flows/driver/rides/02-accept-offer.yaml`
- `maestro/flows/driver/rides/09-complete-ride.yaml`

**Pass criteria for the day:** every listed flow passes twice in a row; `maestro test` exit 0 each time; screenshots + logs archived per §8; manifest round note appended.

---

## 1A. Physical Samsung 24261JEGR10296 — one-time owner steps (NOT unattended)

Skip this section entirely if running the emulator path (§1B).

| # | Action | Where | Verification |
|---|---|---|---|
| 1 | Unlock the screen with the pattern (owner's finger) | on device | `adb shell dumpsys window` shows `mDreamingLockscreen=false` |
| 2a | (Preferred, permanent) Settings → Developer options → enable **USB debugging (Security settings)** AND **Install via USB** | on device | `adb install -r -t ~/.maestro/…/driver.apk` succeeds (§3) |
| 2b | (Alternative) Settings → Developer options → enable **Wireless debugging**; then pair once: `adb pair <ip:port>` (owner types the 6-digit code) | on device + host | `adb devices` shows the phone with `device` state after `adb connect <ip:port>` |
| 3 | Set screen timeout to 30 min (Settings → Display) so the lock never re-engages mid-run | on device | screen stays on through a 10-min idle test |

Without 2a or 2b, the phone remains owner-attended-only: use it for spot checks, never for the unattended run.

## 1B. Emulator path (default, fully unattended)

```bash
# One command — starts Medium_Phone AVD (no owner interaction needed):
"C:\Users\callz\AppData\Local\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone &
# (repo-root .bat equivalent: "04 Emulator Andoid.bat")
```

Then wait for boot and verify:

```bash
adb wait-for-device
adb devices                       # expect: emulator-5554   device
adb shell getprop sys.boot_completed   # expect: 1 (retry ~5s until it prints 1)
```

⚠️ The emulator image is Google-API/Play — it boots **unlocked**. If the AVD was saved in a locked state: `adb emu avd hostmicon` won't help; instead cold-boot it: `emulator -avd Medium_Phone -no-snapshot-save` (fresh boot, no lockscreen).

---

## 2. Env sync (NEVER skip — the #1 silent killer)

The laptop moves between broadband WiFi (`192.168.0.x`) and hotspot (`172.x.x.x`). `EXPO_PUBLIC_*` is inlined at Metro bundle time; a stale IP = app hangs at splash with a Retry button, and every flow after login times out.

```bash
node scripts/dev-env-sync.js        # patches .env.local to the CURRENT LAN IP
node scripts/dev-env-sync.js --check  # verify: exit 0 = no drift
adb shell ip addr show wlan0        # phone/emulator IP — MUST be same subnet as the laptop IP dev-env-sync just wrote
```

If `--check` fails or the emulator has no matching subnet: with Android emulators use the **host alias** — the emulator reaches the host at `10.0.2.2`; if `.env.local` was written with the laptop LAN IP and the flow still can't reach the API, set it manually: `node scripts/dev-env-sync.js --ip 10.0.2.2` and restart Metro (§4). On a physical device this override is WRONG — fix the network instead (same WiFi/hotspot, or `adb reverse tcp:8081 tcp:8081` + `adb reverse tcp:3001 tcp:3001`).

---

## 3. Maestro driver APK — `INSTALL_FAILED_USER_RESTRICTED` workaround

Maestro 2.6.1 (`C:/maestro/bin/maestro`) pushes its own driver APK (`ios-deviceInstaller`/`android-deviceInstaller` from `~/.maestro/`) before the first `maestro test`. On the physical device this hit `INSTALL_FAILED_USER_RESTRICTED`. Unattended workarounds, in order of preference:

1. **Emulator (default path):** no restriction exists — let Maestro install normally. Nothing to do; this note exists so the first `maestro test`'s ~30–60s driver-install delay isn't mistaken for a hang.
2. **Physical device, pre-install manually (after §1A step 2a):** locate the cached APK and install it yourself with extra flags; Maestro then skips its own install:
   ```bash
   find ~/.maestro -name "*.apk"    # e.g. ~/.maestro/deps/.../driver.apk
   adb install -r -t -g <driver.apk>
   ```
   (`-t` allows test packages, `-g` grants runtime perms.) Verify: `adb shell pm list packages | grep maestro` shows the driver package.
3. **Physical device without the toggle:** not unattended-eligible. Record `INSTALL_FAILED_USER_RESTRICTED` again and route the day through the emulator.

Sanity probe that Maestro itself is alive (no device interaction):

```bash
maestro --version    # expect: 2.6.x
```

---

## 4. Metro + utils-server startup (order matters)

`bash maestro/utils/bootstrap-device-day.sh` automates steps 2–5 of this section (env sync → utils-server → Metro → device check → app launch). It now uses `netstat` for port checks (lsof does not exist on this Windows Git Bash) and **reuses** already-listening servers instead of double-starting them.

Manual equivalent:

```bash
# 1. env sync (§2 — if not already done)
node scripts/dev-env-sync.js

# 2. utils-server — REQUIRED for dispatch/offers (driver flows die without it)
netstat -an | grep ":3001 .*LISTEN" || ( cd utils-server && npm run dev > ../utils-server-test.log 2>&1 & )
sleep 5 && grep -q "listening" utils-server-test.log && echo "utils-server OK on 3001"
# INSTANCE_COUNT=1 always (utils-server/.env) — two instances = split brain

# 3. Metro — start AFTER env sync (env inlined at bundle time)
netstat -an | grep ":8081 .*LISTEN" || npx expo start --dev-client --port 8081 &
# wait for readiness (don't poll the socket only — /status proves the bundler answers):
curl -sf http://localhost:8081/status | grep -q "packager-status:running" && echo "Metro OK on 8081"
# first cold start bundles ~2654 modules (~80s); don't launch the app mid-build
```

**Machine state at the time this runbook was written:** Metro (8081) already running from a previous session and healthy; utils-server (3001) down → step 2 will start it. The bootstrap script handles both cases.

---

## 5. GPS seeding (host scripts — emulator only)

The location subflows (`maestro/flows/shared/location/_set-gps-*.yaml`) are **no-op markers** — Maestro 2.6.1 rejects subflow `runScript: { when: true, commands: [...] }`. GPS must be seeded from the host BEFORE the flows that depend on it. `adb shell emu geo fix` only works against an **emulator** (physical devices need a mock-location app or dev settings — out of scope for unattended).

```bash
# Pickup origin (Banani) — before rider booking flows:
bash maestro/utils/adb-gps-banani.sh       # → "gps seeded: banani 90.4066 23.7937"

# Destination side (Gulshan-2) — if a flow asserts destination-zone behavior:
bash maestro/utils/adb-gps-gulshan.sh      # → "gps seeded: gulshan 90.4152 23.7956"

# Verify from the host:
adb shell dumpsys location | grep -m2 "last location"
```

Seed GPS **before** `com.ride.bd` launches (or restart the app after seeding) — the JS layer caches the first location fix.

---

## 6. App launch + permissions

```bash
adb shell pm grant com.ride.bd android.permission.ACCESS_FINE_LOCATION    2>/dev/null || true
adb shell pm grant com.ride.bd android.permission.CAMERA                  2>/dev/null || true
adb shell pm grant com.ride.bd android.permission.READ_EXTERNAL_STORAGE   2>/dev/null || true
adb shell pm grant com.ride.bd android.permission.POST_NOTIFICATIONS      2>/dev/null || true
adb shell pm grant com.ride.bd android.permission.READ_MEDIA_IMAGES       2>/dev/null || true

adb shell am force-stop com.ride.bd
adb shell monkey -p com.ride.bd 1        # launch
```

**Pass criteria** (TEST-SETUP.md §2): app passes splash to a real screen (login or home map) within ~15s of bundle completion; `adb shell dumpsys connectivity | grep -i "8081\|3001"` (or netstat on the host) shows established connections from the device.

If it hangs at splash / black screen → TEST-SETUP.md §5 table: 99% stale IP. Fix = §2 again → restart Metro → relaunch app. Never debug deeper before re-checking the IP.

---

## 7. Executing key flows ×2 (unattended loop)

> Executed automatically by `maestro/utils/run-device-day.sh` (see "One-command path"). The loop below is the manual/equivalent form and stays authoritative for the reset-between-runs semantics.

### Running one ad-hoc flow on the same harness

The ×N loop below is implemented in `maestro/utils/run-flow-twice.sh` and sourced
by `run-device-day.sh`, so an ad-hoc flow gets the identical treatment rather than
a hand-rolled copy:

```bash
# one flow, twice, default evidence dir
bash maestro/utils/run-flow-twice.sh maestro/flows/rider/booking/02-all-vehicle-types.yaml

# once only, scratch evidence, append a matrix row
bash maestro/utils/run-flow-twice.sh --runs 1 --evidence /tmp/scratch \
     --matrix /tmp/scratch/m.txt maestro/flows/edge-cases.yaml
```

Options: `--runs N` (default 2) · `--timeout SECONDS` (default 420) ·
`--evidence DIR` · `--matrix FILE` · `--label NAME`.
Exit: **0** all runs passed · **1** a run failed (bring-up was fine) · **2**
bad usage or a missing flow file.

It assumes a device is already up — it is the §7 loop, not §1B. Run `--check`
first to confirm the environment, and the §7 preflight gate below to confirm the
device is ready.

### §7 preflight gate — run this BEFORE the loop, every time

```bash
. maestro/utils/adb-env.sh          # same pinned adb the loop will use

ST="$(adb devices | awk '/emulator-[0-9]+|device-/{print $2; exit}')"
BOOTED="$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"

if [ "$ST" = "unauthorized" ]; then
  echo "BLOCKED: adb auth failed — the guest never accepted the host key."
  echo "  No flow can run. Maestro times out per-step instead of failing fast."
  echo "  Verified 2026-10-03 NOT fixed by: cold boot, -wipe-data, headless -no-window,"
  echo "  unifying the two adb builds, or a fresh ADB_VENDOR_KEYS keyring — and it"
  echo "  reproduces on two independent AVDs, so the image is not corrupt."
  echo "  Needs an interactive desktop session to show the key confirmation."
  exit 1
fi
if [ "$ST" != "device" ] || [ "$BOOTED" != "1" ]; then
  echo "BLOCKED: device not ready (state='${ST:-absent}' sys.boot_completed='${BOOTED:-unset}')."
  echo "  Re-run the §1B boot wait; do NOT start the loop."
  exit 1
fi
echo "preflight OK: state=$ST boot_completed=$BOOTED"
```

**Why this gate exists.** `adb wait-for-device` returns immediately against an
`unauthorized` target, and `maestro test` then burns its per-step timeout on
every step of every flow — on the 2026-10-03 blocked day that is the difference
between a clear diagnosis and 6 flows × 2 runs × minutes of identical timeouts,
with logs that never mention the real cause. The gate turns that into one line.

**Two distinct outcomes, and the wording matters.** `unauthorized` is the adb
**auth** failure. Any other non-`device` state (including `offline`, which is a
normal early-boot state) is **not ready** — the gate still stops, because flows
must not start, but it must never be reported as an auth blocker. The automated
path performs the equivalent check at §1B and dies with the `adb-unauthorized`
blocker code; this is the manual equivalent, kept here so the two cannot drift.

Verify this snippet without a device (it extracts the block above and runs it
against a stub `adb`):

```bash
bash maestro/utils/section7-preflight-gate.sh    # exit 0 = gate behaves
```

Per-flow, twice, with state reset between the two runs (login flows are naturally re-runnable; booking/ride flows need the account reset or a fresh ride):

```bash
mkdir -p maestro/test-results/$(date +%F)

run_twice() {
  local flow="$1" name; name=$(basename "$flow" .yaml)
  for i in 1 2; do
    echo "== [$name] run $i/2 =="
    maestro test "$flow" \
      > "maestro/test-results/$(date +%F)/$name-run$i.log" 2>&1 \
      && echo "PASS $name run$i" || echo "FAIL $name run$i (see log)"
    sleep 3
  done
}

run_twice maestro/flows/auth/02-rider-login.yaml
run_twice maestro/flows/auth/04-driver-login.yaml
run_twice maestro/flows/rider/booking/01-basic-ride-request.yaml
run_twice maestro/flows/driver/home/02-go-online.yaml
run_twice maestro/flows/driver/rides/02-accept-offer.yaml
run_twice maestro/flows/driver/rides/09-complete-ride.yaml
```

Execution notes:
- **First `maestro test` after boot** pays the driver-APK install (§3) and a cold Android-bridge warmup — expect 1–3 min, don't abort.
- **`02-go-online.yaml`** asserts the launch_free wallet card on driver first run. If that assertion fails, check `payments_enabled` in `platform_config` (must be `false` — hides purchase UI) and whether the registered driver actually holds an active subscription (API: `GET /api/driver/subscription` or the subscriptions table).
- **Known landmine (session round notes):** if a run hangs ~420s doing nothing, the device is sitting on a keyguard — check `adb shell dumpsys window | grep mDreamingLockscreen` before killing anything. Emulator path should never hit this.
- **Between the ×2 repeats** of booking/ride flows: cancel/complete the previous ride via the app (the flows do it) — no adb data resets are scripted; if a flow lacks its own reset, re-run the logout flow first.

If any flow fails: pull `maestro/test-results/<date>/<name>-run<i>.log`, capture a screenshot (`adb exec-out screencap -p > fail.png`), and do NOT mark the day green. One failure twice = stop-the-day; file it in the manifest round note with the log path.

---

## 8. Evidence capture (manifest requirements)

The ×2 run isn't "done" until this exists:

1. **Per-run logs** — `maestro/test-results/<date>/<flow>-run{1,2}.log` (from §7).
2. **Pass matrix** — one line per flow: `PASS/FAIL run1 run2` + Maestro's own exit codes.
3. **Manifest round note** — append to `maestro/COVERAGE-MANIFEST.md` round-notes table: date, device/AVD serial, key-flows-×2 results, GPS scripts used, and any new failure modes (cross-link to this runbook's table below).
4. **Screenshots** for the driver first-run wallet-card assertion (launch_free evidence): `adb exec-out screencap -p > maestro/test-results/<date>/driver-first-run-wallet.png`.

Keep the run unattended end-to-end: no step above requires typing on the device after §1B starts the emulator.

---

## 9. Teardown (leave the machine clean for the next session)

```bash
adb emu kill                       # stop emulator (emulator path)
adb kill-server
# Metro + utils-server: leave running if Zia continues; else Ctrl-C their windows.
# Do NOT delete maestro/test-results/<date>/ — it is the QA record.
```

---

## 10. Failure modes table (append-only — new modes go here the same day)

| Symptom | Root cause | Fix |
|---|---|---|
| `INSTALL_FAILED_USER_RESTRICTED` on 24261JEGR10296 | MIUI/HyperOS-style "Install via USB" off | emulator path, or owner enables toggle (§1A 2a) + pre-install driver APK (§3) |
| `keyevent 82` doesn't unlock; screen shows systemui keyguard | pattern lock is not a menu-dismissable lock | owner enters pattern once (§1A); for unattended use emulator (§1B) |
| Maestro run hangs ~420s, no output | device sitting on keyguard during a `maestro test` | prevent re-lock (§1A 3); emulator path avoids it; check `dumpsys window` before killing |
| App hangs at splash with Retry | stale LAN IP in `.env.local` | §2 sync → restart Metro → relaunch |
| Black DevLauncher screen | bundle fetch failed (stale IP / Metro down) | §2 + §4, then relaunch |
| Rider booking flow can't find pickup | GPS not seeded or seeded after app start | §5 before app launch, or force-stop + relaunch |
| `adb shell emu geo fix` on physical phone | command is emulator-only | physical = mock-location app (out of unattended scope) |
| bootstrap says servers "already listening" but flows still fail | stale process from a previous network session | kill and restart both (Metro picks up new IP only on restart) |
| **Emulator boots but `adb devices` shows `unauthorized` forever** (2026-10-03) | emulator guest never accepts the host adb key. NOT fixed by cold boot, `-wipe-data`, headless `-no-window`, unified adb builds, or a fresh `ADB_VENDOR_KEYS` keyring. **Reproduced on two independent AVDs (Medium_Phone AND Pixel_6a)**, so it is not a corrupt image — the authorization path itself is unavailable, most likely because there is no interactive desktop session to show the key-confirmation. | stop-the-day; no unattended fix from the shell. Needs an interactive session, or a device/emulator host that can complete adb auth. Evidence: `maestro/test-results/2026-10-03/` |
| **Two different `adb` builds both on PATH** (2026-10-03) | `C:\Users\callz\platform-tools\adb.exe` (v37.0.0, first on PATH, invoked by the emulator client) and `...\Android\Sdk\platform-tools\adb.exe` (v36.0.0) both start servers on tcp:5037 | **FIXED 2026-10-03:** every script under `maestro/utils/` now resolves one adb through `adb-env.sh` ($ADB → PATH → SDK), so the session cannot mix builds. Verify with `bash maestro/utils/adb-env-selftest.sh`. The two installs remain on the box, so a manual `adb ...` typed outside these scripts is still unpinned — export it first. |
| `-wipe-data` crashes the emulator at launch with `UpdateLayeredWindowIndirect failed … (A device attached to the system is not functioning.)` | guest window creation fails; windowing is unavailable in this environment | drop `-wipe-data`; use `-no-window -no-audio -gpu swiftshader_indirect` (process survives headless, though adb auth still failed here) |
