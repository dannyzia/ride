#!/bin/bash
# run-device-day.sh — unattended driver for maestro/DEVICE-DAY-RUNBOOK.md §1B–§8.
#
# One command, bring-up to evidence, no interaction. Replaces hand-running the
# runbook sections; the runbook stays the prose authority and this script is its
# executable form. Every step names its own failure and remedy via die().
#
#   bash maestro/utils/run-device-day.sh [--avd NAME] [--windowed] [--keep-emulator]
#   bash maestro/utils/run-device-day.sh --check
#
# Exit codes:
#   0  all key flows passed twice   (or, with --check, every precondition passed)
#   1  BLOCKED — a bring-up step failed; see the BLOCKED reason + evidence dir
#      (or, with --check, a precondition failed)
#   2  DAY INCOMPLETE — bring-up succeeded but a flow failed (§7 stop-the-day)
#
# --check validates preconditions and exits: it resolves adb, checks the Maestro
# CLI, the AVD, the emulator binary and every key-flow file, reports any attached
# device, and stops. It does NOT boot the emulator, start Metro/utils-server, or
# run a single flow, and it creates no evidence directory. That matters because
# the normal path installs `trap cleanup EXIT`, which kills any running qemu and
# stops the adb server — so a "check" that went through it could tear down an
# emulator someone was using for other work. --check therefore exits before the
# trap is installed.
#
# PREFLIGHT_DEVICE=required|optional (default: required)
#   required  the emulator binary and the AVD are hard preconditions. Correct on
#             a device-day host: you cannot start the day without them.
#   optional  those two degrade to SKIP when absent. This is what
#             .github/workflows/device-preflight.yml uses to run this same
#             script on a CI runner, which owns no emulator and no AVD. Every
#             other check (adb resolution, Maestro CLI, key-flow files) stays
#             blocking under both modes, so CI still catches adb, Maestro and
#             flow drift — it just does not fail for having no device.
#
# Why explicit die() instead of `set -e`: a bare non-zero exit tells you nothing.
# Every blocker below has a known cause and a known fix, so the script prints both
# and where the evidence landed. `set -e` also aborts on incidental non-zero exits
# (adb pm grant on an absent permission, etc.) that are expected and harmless.
set -uo pipefail

_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$_ROOT" || { echo "FATAL: cannot cd to repo root" >&2; exit 1; }
ROOT="$PWD"

# ── config ────────────────────────────────────────────────────────────────────
AVD="Medium_Phone"
WINDOWED=0
KEEP_EMULATOR=0
CHECK=0
APP_ID="com.ride.bd"
MAESTRO_BIN="${MAESTRO_BIN:-$(command -v maestro || echo /c/maestro/bin/maestro)}"
BOOT_TIMEOUT_S="${BOOT_TIMEOUT_S:-300}"     # §1B cold boot
SERVER_TIMEOUT_S="${SERVER_TIMEOUT_S:-180}" # §4 Metro/utils-server readiness
FLOW_TIMEOUT_S="${FLOW_TIMEOUT_S:-420}"     # §7 per-run (runbook §10 keyguard landmine)
RUNS_PER_FLOW="${RUNS_PER_FLOW:-2}"         # §7 the ×2
# required = emulator + AVD must exist (device-day host, the default).
# optional = they may be absent and are reported as SKIP (CI runner, see header).
PREFLIGHT_DEVICE="${PREFLIGHT_DEVICE:-required}"
# Boot the emulator in §1B by default on a device-day host. On this host the
# manual cold-start deep-link path is the working one (DEV-BUILD LOAD HOP in
# maestro/flows/shared/auth/_login-rider.yaml), so set PREFLIGHT_EMULATOR=skip
# when you want the script to stop after §4 and leave the bring-up to the
# operator. "boot" and "skip" are the only values; anything else is fatal.
PREFLIGHT_EMULATOR="${PREFLIGHT_EMULATOR:-boot}"

ADB_ENV_SH="$(dirname "$0")/adb-env.sh"

KEY_FLOWS=(
  "maestro/flows/auth/02-rider-login.yaml"
  "maestro/flows/auth/04-driver-login.yaml"
  "maestro/flows/rider/booking/01-basic-ride-request.yaml"
  "maestro/flows/driver/home/02-go-online.yaml"
  "maestro/flows/driver/rides/02-accept-offer.yaml"
  "maestro/flows/driver/rides/09-complete-ride.yaml"
)

while [ $# -gt 0 ]; do
  case "$1" in
    --avd) AVD="${2:-}"; shift 2 ;;
    --windowed) WINDOWED=1; shift ;;
    --keep-emulator) KEEP_EMULATOR=1; shift ;;
    --check) CHECK=1; shift ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

case "$PREFLIGHT_DEVICE" in
  required|optional) : ;;
  *) echo "FATAL: PREFLIGHT_DEVICE must be 'required' or 'optional' (got '$PREFLIGHT_DEVICE')" >&2; exit 1 ;;
esac

case "$PREFLIGHT_EMULATOR" in
  boot|skip) : ;;
  *) echo "FATAL: PREFLIGHT_EMULATOR must be 'boot' or 'skip' (got '$PREFLIGHT_EMULATOR')" >&2; exit 1 ;;
esac

# ── helpers ──────────────────────────────────────────────────────────────────
# Source adb-env.sh once, idempotently, the same way in both the --check and the
# real-run path. adb-env.sh is idempotent itself, but on this host it can already
# be sourced before this script starts (BASH_ENV), so guard that here too: if
# $ADB is already set from an earlier source, a second source is a safe no-op and
# we skip the whole thing rather than re-running the resolution/fallback.
source_adb_env() {
  # shellcheck source=maestro/utils/adb-env.sh
  if [ -n "${ADB:-}" ]; then
    return 0
  fi
  if [ -f "$ADB_ENV_SH" ]; then
    . "$ADB_ENV_SH"
  fi
}

# ── --check: validate preconditions, then stop ───────────────────────────────
# Deliberately placed BEFORE the evidence dir is created and before cleanup is
# trapped, so checking is side-effect free and cannot kill a running emulator.
if [ "$CHECK" = 1 ]; then
  fails=0
  skips=0
  ok_()   { printf '  \342\234\223  %s\n' "$1"; }
  bad_()  { printf '  \342\234\227  %s\n' "$1"; fails=$((fails + 1)); }
  # A check that could not run here and whose absence is EXPECTED on this host.
  # Deliberately not bad_: a skip never blocks the run, but it is still counted
  # and printed, so the transcript records what this preflight did not cover.
  skip_() { printf '  \342\212\030  %s\n' "$1"; skips=$((skips + 1)); }
  # The device-bound preconditions — the emulator binary and the AVD — are hard
  # failures by default, but report as SKIP under PREFLIGHT_DEVICE=optional.
  device_fail() {
    if [ "$PREFLIGHT_DEVICE" = "optional" ]; then skip_ "$1"; else bad_ "$1"; fi
  }
  head_() { printf '\n== %s ==\n' "$1"; }

  head_ "repo"
  ok_ "root:            $ROOT"

  head_ "adb (single pinned build)"
  source_adb_env
  if [ -n "${ADB:-}" ]; then
    ok_ "adb:             $ADB ($("$ADB" version 2>/dev/null | sed -n '2p' | tr -d '\r'))"
  else
    bad_ "adb not resolvable — set ADB=/path/to/adb or install platform-tools"
  fi

  head_ "maestro CLI"
  if [ -f "$MAESTRO_BIN" ] || command -v maestro >/dev/null 2>&1; then
    ok_ "maestro:         $( (maestro --version 2>/dev/null || "$MAESTRO_BIN" --version 2>/dev/null) | head -1)"
  else
    bad_ "maestro CLI not found (tried '$MAESTRO_BIN' and PATH) — set MAESTRO_BIN=/path/to/maestro"
  fi

  head_ "emulator + AVD"
  # Resolve the emulator binary portably: PATH first (same precedence adb-env.sh
  # gives adb), then the SDK roots, then the Windows default. This used to be
  # hardcoded to %LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe, so on a
  # Linux runner LOCALAPPDATA is empty and it reported the nonsense path
  # "/Android/Sdk/emulator/emulator.exe" as a real failure.
  EMU_EXE=""
  for _emu_cand in \
    "$(command -v emulator 2>/dev/null || true)" \
    "${ANDROID_HOME:-}/emulator/emulator" \
    "${ANDROID_SDK_ROOT:-}/emulator/emulator" \
    "${LOCALAPPDATA:-}/Android/Sdk/emulator/emulator.exe"; do
    if [ -n "$_emu_cand" ] && [ -x "$_emu_cand" ]; then EMU_EXE="$_emu_cand"; break; fi
  done
  if [ -n "$EMU_EXE" ]; then ok_ "emulator:        $EMU_EXE"
  else device_fail "emulator binary not found (looked on PATH, \$ANDROID_HOME, \$ANDROID_SDK_ROOT, %LOCALAPPDATA%)"; fi

  # An AVD is a per-machine artefact: the device-day host has one, a CI runner
  # has none. Probe the standard per-user location, then ask the emulator.
  AVD_DIR="${ANDROID_AVD_HOME:-${USERPROFILE:-$HOME}/.android}/avd"
  if [ -f "$AVD_DIR/$AVD.ini" ]; then ok_ "avd:             $AVD"
  elif [ -n "$EMU_EXE" ] && "$EMU_EXE" -list-avds 2>/dev/null | grep -qx "$AVD"; then ok_ "avd:             $AVD (via -list-avds)"
  else device_fail "AVD '$AVD' not found — 'emulator -list-avds', or pass --avd <name>"; fi

  head_ "key flow files (§7)"
  missing_flows=0
  for f in "${KEY_FLOWS[@]}"; do
    if [ -f "$f" ]; then ok_ "$f"; else bad_ "missing: $f"; missing_flows=$((missing_flows + 1)); fi
  done

  head_ "attached device (informational)"
  # Read-only. A device being absent is EXPECTED before a boot, so this never
  # counts as a failure — it only tells you whether one is already up.
  if [ -n "${ADB:-}" ]; then
    st="$("$ADB" devices 2>/dev/null | awk '/emulator-[0-9]+|device-/{print $1" "$2; exit}')"
    if [ -n "$st" ]; then
      printf '  \342\224\250  %s\n' "${st}  (already attached; --check does not use it)"
    else
      printf '  \342\224\250  none attached — expected, --check does not boot one\n'
    fi
  fi

  head_ "planned run"
  printf '  avd=%s runs/flow=%s boot-timeout=%ss flow-timeout=%ss\n' \
    "$AVD" "$RUNS_PER_FLOW" "$BOOT_TIMEOUT_S" "$FLOW_TIMEOUT_S"
  printf '  %d key flows, %d runs total\n' "${#KEY_FLOWS[@]}" "$(( ${#KEY_FLOWS[@]} * RUNS_PER_FLOW ))"
  printf '  emulator=%s  (PREFLIGHT_EMULATOR=%s)\n' "$AVD" "$PREFLIGHT_EMULATOR"

  printf '\n'
  if [ "$fails" -eq 0 ]; then
    printf '\342\234\223 preconditions OK — nothing was booted and no flow was run.\n'
    [ "$skips" -gt 0 ] && printf '   %d device-bound check(s) skipped (PREFLIGHT_DEVICE=optional).\n' "$skips"
    exit 0
  fi
  printf '\342\234\227 %d precondition(s) failed — do not start the day.\n' "$fails"
  exit 1
fi

DATE="$(date +%F)"
EVIDENCE="maestro/test-results/$DATE"
mkdir -p "$EVIDENCE" || { echo "FATAL: cannot create $EVIDENCE" >&2; exit 1; }
LOG="$EVIDENCE/driver.log"

# ── output ───────────────────────────────────────────────────────────────────
# Every line goes to the transcript AND the log; §8 requires a per-run record.
log()  { printf '%s\n' "$*" | tee -a "$LOG"; }
step() { printf '\n=== %s ===\n' "$*" | tee -a "$LOG"; }

# die BLOCKER_CODE "cause" "remedy" — the single loud failure path.
die() {
  {
    printf '\n############################################################\n'
    printf '## BLOCKED at: %s\n' "$1"
    printf '## cause:    %s\n' "$2"
    printf '## remedy:   %s\n' "$3"
    printf '## evidence: %s\n' "$EVIDENCE"
    printf '############################################################\n'
  } | tee -a "$LOG"
  exit 1
}

qemu_running() { tasklist 2>/dev/null | grep -qi "qemu"; }

# One adb for the whole run, via the shared resolver every device script uses
# (adb-env.sh). Sourced HERE, before cleanup() is defined, because cleanup runs
# from `trap ... EXIT` and can fire on a preflight die() before the §0 section —-
# so $ADB must already exist by then.
#
# This REPLACES an earlier inline pin that put the SDK build ahead of PATH: that
# pinned a DIFFERENT binary than bootstrap-device-day.sh and the adb-gps-*.sh
# scripts used, so a single device day drove two builds that both bind tcp:5037.
# The resolver defaults to the PATH build — the one the emulator client itself
# invokes — and reports any other build found.
source_adb_env

# The headless emulator's image is qemu-system-x86_64-headless.exe, NOT the
# windowed qemu-system-x86_64.exe — matching only the latter leaves a headless
# emulator running after cleanup (verified 2026-10-03). Try both.
# shellcheck disable=SC2329  # invoked from cleanup(), which is trap-installed
kill_emulator() {
  "$ADB" emu kill >/dev/null 2>&1 || true
  taskkill //F //IM qemu-system-x86_64.exe >/dev/null 2>&1 || true
  taskkill //F //IM qemu-system-x86_64-headless.exe >/dev/null 2>&1 || true
  for _ in 1 2 3 4 5; do
    qemu_running || return 0
    sleep 2
  done
  return 1
}

# shellcheck disable=SC2329  # installed via `trap cleanup EXIT` below
cleanup() {
  if [ "$KEEP_EMULATOR" = "1" ]; then
    log "cleanup: --keep-emulator set, leaving the emulator up"
    return
  fi
  log "cleanup: stopping emulator + adb server (--keep-emulator to skip)"
  if kill_emulator; then
    log "cleanup: emulator stopped"
  else
    log "WARN: a qemu process is still running — kill it manually before the next run"
  fi
  "$ADB" kill-server >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── helpers ──────────────────────────────────────────────────────────────────
# lsof is absent on Windows Git Bash — netstat works on both (bootstrap-device-day.sh §2).
port_listening() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    netstat -an 2>/dev/null | grep -q ":$1 .*LISTEN"
  fi
}

# adb shell emits CRLF on Windows; strip before comparing.
sh_() { "$ADB" shell "$@" 2>/dev/null | tr -d '\r'; }

device_state() { "$ADB" devices 2>/dev/null | awk '/emulator-[0-9]+/ {print $2; exit}'; }

# ── §0 preflight ─────────────────────────────────────────────────────────────
step "§0 preflight"
log "repo:        $ROOT"
log "avd:         $AVD"
log "evidence:    $EVIDENCE"
log "date:        $(date)"
log "emulator:    $PREFLIGHT_EMULATOR  (PREFLIGHT_EMULATOR=$PREFLIGHT_EMULATOR)"

[ -f "$MAESTRO_BIN" ] || command -v maestro >/dev/null 2>&1 \
  || die "maestro-missing" "Maestro CLI not found (tried '$MAESTRO_BIN' and PATH)" \
          "install Maestro 2.6.x or set MAESTRO_BIN=/path/to/maestro"
log "maestro:     $( (maestro --version 2>/dev/null || "$MAESTRO_BIN" --version 2>/dev/null) | head -1)"

adb_env_warn_duplicates

# ${USERPROFILE:-$HOME} is required, not defensive: USERPROFILE is a
# Git-Bash/Windows variable, unset on a Linux runner, and this script runs
# under `set -uo pipefail` — the bare expansion died with "USERPROFILE: unbound
# variable" off Windows. Same fallback shape as the AVD probe in --check above.
ls "${USERPROFILE:-$HOME}/.android/avd/$AVD.ini" >/dev/null 2>&1 \
  || die "avd-missing" "AVD '$AVD' does not exist" \
          "run 'emulator -list-avds' and re-run with --avd <name>"

# ── §1B emulator ─────────────────────────────────────────────────────────────
# On this host the working device-day path is a MANUAL cold-start deep-link cycle:
# the operator boots the emulator and runs the dev-build load hop themselves
# (maestro/flows/shared/auth/_login-rider.yaml, DEV-BUILD LOAD HOP). The script
# still supports the old auto-boot path for the other device-day host via
# PREFLIGHT_EMULATOR=boot; on this host leave it at skip and do §2–§6 against the
# already-running emulator the operator started.
if [ "$PREFLIGHT_EMULATOR" = "skip" ]; then
  step "§1B emulator ($AVD) — operator-managed (PREFLIGHT_EMULATOR=skip)"
  ST="$(device_state)"
  if [ -z "$ST" ] || [ "$ST" = "offline" ]; then
    die "emulator-not-present" \
      "PREFLIGHT_EMULATOR=skip but no emulator is attached ($ST)" \
      "start the emulator manually, or set PREFLIGHT_EMULATOR=boot to let this script boot it"
  fi
  log "emulator:   $ST  (operator-managed; §1B boot skipped)"
else
  step "§1B emulator boot ($AVD)"
  EMU_ARGS=(-avd "$AVD" -no-snapshot -no-boot-anim -gpu swiftshader_indirect -port 5554)
  # Windowed mode is opt-in: on this host a wiped/windowed guest died with
  # "UpdateLayeredWindowIndirect failed … A device attached to the system is not
  # functioning" (§10). Headless survives; adb + Maestro work fine without a window.
  [ "$WINDOWED" = "1" ] || EMU_ARGS+=(-no-window -no-audio)
  log "launching: emulator ${EMU_ARGS[*]}"
  # ${LOCALAPPDATA:-} is required, not defensive — same Windows-only variable
  # class as above and as adb-env.sh's guards: bare, it is fatal under `set -u`
  # off Windows. (Off Windows this resolves to a path that does not exist, which
  # fails loudly at nohup instead of killing the shell at expansion time.)
  nohup "${LOCALAPPDATA:-}/Android/Sdk/emulator/emulator.exe" "${EMU_ARGS[@]}" \
    > "$EVIDENCE/emulator-boot.log" 2>&1 &
  disown 2>/dev/null || true

  "$ADB" start-server >/dev/null 2>&1 || true

  log "waiting for boot (timeout ${BOOT_TIMEOUT_S}s)…"
  DEADLINE=$(( $(date +%s) + BOOT_TIMEOUT_S ))
  BOOTED=0
  LAST_STATE="(none)"
  while [ "$(date +%s)" -lt "$DEADLINE" ]; do
    # The emulator process dying is terminal — stop waiting on a corpse.
    if ! qemu_running; then
      die "emulator-died" "qemu process exited during boot (see $EVIDENCE/emulator-boot.log)" \
          "if the log shows 'UpdateLayeredWindowIndirect failed', the host has no usable desktop session — keep -no-window, or run on a machine with one"
    fi
    ST="$(device_state)"
    [ "$ST" != "$LAST_STATE" ] && { LAST_STATE="$ST"; log "  t+$(( BOOT_TIMEOUT_S - (DEADLINE - $(date +%s)) ))s device state: ${ST:-absent}"; }
    if [ "$ST" = "unauthorized" ]; then
      # Exact signature from the 2026-10-03 blocked day. Diagnose now, loudly,
      # instead of burning the whole boot timeout.
      die "adb-unauthorized" \
          "emulator booted but adb reports 'unauthorized' — the guest never accepted the host key. Verified 2026-10-03 to be NOT fixed by: cold boot, -wipe-data, headless -no-window, unifying the two adb builds, or a fresh ADB_VENDOR_KEYS keyring, and it reproduces on two independent AVDs (so the image is not corrupt). The authorization path is unavailable on this host — most likely no interactive desktop session to show the key-confirmation." \
          "needs an interactive desktop session, or a device/emulator host that can complete adb auth. Unattended shell fixes do not exist for this one."
    fi
    if [ "$ST" = "device" ] && [ "$(sh_ getprop sys.boot_completed)" = "1" ]; then
      BOOTED=1; break
    fi
    sleep 5
  done
  [ "$BOOTED" = "1" ] || die "emulator-boot-timeout" \
    "device did not reach 'device' + sys.boot_completed=1 within ${BOOT_TIMEOUT_S}s (last state: ${LAST_STATE})" \
    "raise BOOT_TIMEOUT_S for a cold first boot, or check $EVIDENCE/emulator-boot.log"
  log "booted: $("$ADB" devices | grep emulator | tr -d '\r')"
fi

# ── §2 env sync ──────────────────────────────────────────────────────────────
step "§2 env sync"
node scripts/dev-env-sync.js >>"$LOG" 2>&1 \
  || die "env-sync-failed" "scripts/dev-env-sync.js exited non-zero" \
          "EXPO_PUBLIC_* is inlined at BUNDLE time — a stale IP hangs the app at splash with a Retry button and every post-login flow times out"
node scripts/dev-env-sync.js --check >>"$LOG" 2>&1 \
  || die "env-drift" ".env.local does not match the current network after sync" \
          "fix the network, then re-run; Metro must be RESTARTED afterwards to pick up a new IP"
HOST_IP="$(node -e 'const fs=require("fs");const t=fs.readFileSync(".env.local","utf8");const m=t.match(/EXPO_PUBLIC_SERVER_URL=https?:\/\/([^:\/\]+)/);console.log(m?m[1]:"?")' 2>/dev/null || echo '?')"
log "env:        EXPO_PUBLIC_SERVER_URL host = $HOST_IP (emulator reaches the host at 10.0.2.2)"

# ── §3 Maestro driver APK ────────────────────────────────────────────────────
step "§3 maestro driver"
log "on the emulator path there is no install restriction; the first 'maestro test'"
log "pays a ~30-60s driver-APK install. That delay is NOT a hang (runbook §3)."

# ── §4 Metro + utils-server ──────────────────────────────────────────────────
step "§4 Metro + utils-server"
if port_listening 3001; then
  log "utils-server: already listening on 3001 — reusing"
else
  log "utils-server: starting (INSTANCE_COUNT=1; two instances = split brain)"
  (cd utils-server && nohup npm run dev > "$ROOT/utils-server-test.log" 2>&1 &) 
  sleep 5
fi
for i in $(seq 1 "$(( SERVER_TIMEOUT_S / 5 ))"); do
  port_listening 3001 && break
  sleep 5
done
port_listening 3001 || die "utils-server-down" \
  "nothing listening on 3001 after ${SERVER_TIMEOUT_S}s (see utils-server-test.log)" \
  "driver flows die without the dispatch server; check INSTANCE_COUNT=1 in utils-server/.env"

# Metro MUST start after §2 — env is inlined at bundle time.
if port_listening 8081; then
  log "metro:       already listening on 8081 — reusing"
  curl -sf http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running" \
    || log "WARN: 8081 is listening but /status did not confirm the bundler is running"
else
  log "metro:       starting (cold start bundles ~2654 modules, ~80s)"
  nohup npx expo start --dev-client --port 8081 > "$ROOT/metro-test.log" 2>&1 &
  disown 2>/dev/null || true
fi
METRO_OK=0
for i in $(seq 1 "$(( SERVER_TIMEOUT_S / 5 ))"); do
  if curl -sf http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running"; then
    METRO_OK=1; break
  fi
  sleep 5
done
[ "$METRO_OK" = "1" ] || die "metro-down" \
  "bundler did not answer /status on 8081 after ${SERVER_TIMEOUT_S}s (see metro-test.log)" \
  "kill and restart Metro — it only re-reads EXPO_PUBLIC_* on restart (§10 stale-process row)"

# ── §5 GPS seeding ───────────────────────────────────────────────────────────
step "§5 GPS seeding"
bash maestro/utils/adb-gps-banani.sh  >>"$LOG" 2>&1 \
  || die "gps-seed-failed" "adb-gps-banani.sh failed (\"$ADB\" shell emu geo fix)" \
          "GPS must be seeded BEFORE app launch; the JS layer caches the first fix"
log "gps:         banani 90.4066 23.7937 seeded"

# ── §6 app launch + permissions ──────────────────────────────────────────────
step "§6 app launch + permissions"
for PERM in android.permission.ACCESS_FINE_LOCATION android.permission.CAMERA \
           android.permission.READ_EXTERNAL_STORAGE android.permission.POST_NOTIFICATIONS \
           android.permission.READ_MEDIA_IMAGES; do
  "$ADB" shell pm grant "$APP_ID" "$PERM" >/dev/null 2>&1 || true  # absent on some API levels
done
log "granted:     location, camera, storage, notifications"

"$ADB" shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
"$ADB" shell monkey -p "$APP_ID" 1 >/dev/null 2>&1 \
  || die "app-launch-failed" "could not launch $APP_ID via monkey" \
          "confirm a dev build is installed: \"$ADB\" shell pm list packages | grep com.ride.bd\""

# Splash-to-real-screen within ~15s of bundle completion (TEST-SETUP.md §2).
log "waiting for $APP_ID to pass splash…"
APP_UP=0
for i in $(seq 1 30); do
  if "$ADB" shell dumpsys activity activities 2>/dev/null | grep -q "$APP_ID"; then APP_UP=1; break; fi
  sleep 3
done
[ "$APP_UP" = "1" ] || die "app-not-foreground" \
  "$APP_ID never reached the foreground within 90s" \
          "99% a stale LAN IP — re-run §2, RESTART Metro, then relaunch. Never debug deeper before re-checking the IP (TEST-SETUP.md §5)"
"$ADB" exec-out screencap -p > "$EVIDENCE/06-app-launched.png" 2>/dev/null || true
log "app:         foregrounded (screenshot: 06-app-launched.png)"

# ── §7 key flows ×N ──────────────────────────────────────────────────────────
step "§7 key flows ×$RUNS_PER_FLOW"
MATRIX="$EVIDENCE/pass-matrix.txt"
{
  hdr="FLOW"
  for i in $(seq 1 "$RUNS_PER_FLOW"); do hdr=$(printf '%-46s run%d' "$hdr" "$i"); done
  printf '%-46s %s\n' "$hdr" "EXITS"
} > "$MATRIX"
DAYS_STATUS=0   # 0 = all green, 2 = stop-the-day

# The ×N harness lives in run-flow-twice.sh so an ad-hoc flow gets the SAME
# loop (repeat, per-run timeout, per-run log, FAIL screenshot, matrix row).
# Sourced, not executed: it has to append to THIS script's $MATRIX and set THIS
# script's DAYS_STATUS, which a subprocess could not do.
# shellcheck source=maestro/utils/run-flow-twice.sh
. "$(dirname "$0")/run-flow-twice.sh"

for f in "${KEY_FLOWS[@]}"; do
  run_flow_twice "$f" || true  # failure is recorded in DAYS_STATUS, not fatal here
done

# ── §8 evidence ──────────────────────────────────────────────────────────────
step "§8 evidence"
log "logs:        $EVIDENCE/<flow>-run<N>.log"
log "matrix:      $MATRIX"
log "emulator:    $EVIDENCE/emulator-boot.log"
log "driver log:  $LOG"

if [ "$DAYS_STATUS" = "0" ]; then
  {
    printf '\n## Device day %s — GREEN\n\n' "$DATE"
    printf -- '- AVD: %s\n- Maestro: %s\n- adb: %s\n- env host: %s\n- GPS: banani 90.4066 23.7937\n\n' \
      "$AVD" "$("$MAESTRO_BIN" --version 2>/dev/null | head -1)" "$("$ADB" version 2>/dev/null | sed -n '2p' | tr -d '\r')" "$HOST_IP"
    cat "$MATRIX"
  } > "$EVIDENCE/RESULT.md"
  log ""
  log "RESULT: GREEN — all $RUNS_PER_FLOW runs of ${#KEY_FLOWS[@]} key flows passed."
  log "Append a round note to maestro/COVERAGE-MANIFEST.md (§8.3)."
else
  {
    printf '\n## Device day %s — INCOMPLETE (do NOT mark green)\n\n' "$DATE"
    printf 'Bring-up succeeded; at least one flow failed. Runbook §7: one failure twice = stop-the-day.\n\n'
    cat "$MATRIX"
  } > "$EVIDENCE/RESULT.md"
  log ""
  log "RESULT: INCOMPLETE — bring-up OK, flow failures recorded. NOT green."
  log "File it in the manifest round note with the log paths (§8.3)."
fi

exit "$DAYS_STATUS"
