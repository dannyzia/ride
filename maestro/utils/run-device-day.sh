#!/usr/bin/env bash
# run-device-day.sh — unattended driver for maestro/DEVICE-DAY-RUNBOOK.md §1B–§8.
#
# One command, bring-up to evidence, no interaction. Replaces hand-running the
# runbook sections; the runbook stays the prose authority and this script is its
# executable form. Every step names its own failure and remedy via die().
#
#   bash maestro/utils/run-device-day.sh [--avd NAME] [--windowed] [--keep-emulator]
#
# Exit codes:
#   0  all key flows passed twice
#   1  BLOCKED — a bring-up step failed; see the BLOCKED reason + evidence dir
#   2  DAY INCOMPLETE — bring-up succeeded but a flow failed (§7 stop-the-day)
#
# Why explicit die() instead of `set -e`: a bare non-zero exit tells you nothing.
# Every blocker below has a known cause and a known fix, so the script prints both
# and where the evidence landed. `set -e` also aborts on incidental non-zero exits
# (adb pm grant on an absent permission, etc.) that are expected and harmless.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || { echo "FATAL: cannot cd to repo root" >&2; exit 1; }

# ── config ────────────────────────────────────────────────────────────────────
AVD="Medium_Phone"
WINDOWED=0
KEEP_EMULATOR=0
APP_ID="com.ride.bd"
MAESTRO_BIN="${MAESTRO_BIN:-$(command -v maestro || echo /c/maestro/bin/maestro)}"
BOOT_TIMEOUT_S="${BOOT_TIMEOUT_S:-300}"     # §1B cold boot
SERVER_TIMEOUT_S="${SERVER_TIMEOUT_S:-180}" # §4 Metro/utils-server readiness
FLOW_TIMEOUT_S="${FLOW_TIMEOUT_S:-420}"     # §7 per-run (runbook §10 keyguard landmine)
RUNS_PER_FLOW="${RUNS_PER_FLOW:-2}"         # §7 the ×2

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
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 1 ;;
  esac
done

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

# The headless emulator's image is qemu-system-x86_64-headless.exe, NOT the
# windowed qemu-system-x86_64.exe — matching only the latter leaves a headless
# emulator running after cleanup (verified 2026-10-03). Try both.
# shellcheck disable=SC2329  # invoked from cleanup(), which is trap-installed
kill_emulator() {
  adb emu kill >/dev/null 2>&1 || true
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
  adb kill-server >/dev/null 2>&1 || true
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
sh_() { adb shell "$@" 2>/dev/null | tr -d '\r'; }

device_state() { adb devices 2>/dev/null | awk '/emulator-[0-9]+/ {print $2; exit}'; }

# ── §0 preflight ─────────────────────────────────────────────────────────────
step "§0 preflight"
log "repo:        $ROOT"
log "avd:         $AVD"
log "evidence:    $EVIDENCE"
log "date:        $(date)"

[ -f "$MAESTRO_BIN" ] || command -v maestro >/dev/null 2>&1 \
  || die "maestro-missing" "Maestro CLI not found (tried '$MAESTRO_BIN' and PATH)" \
          "install Maestro 2.6.x or set MAESTRO_BIN=/path/to/maestro"
log "maestro:     $( (maestro --version 2>/dev/null || "$MAESTRO_BIN" --version 2>/dev/null) | head -1)"

# §10 row: two adb builds both binding tcp:5037 produce misleading `unauthorized`.
# Pin ONE for the whole run and say so, rather than diagnosing against the wrong server.
SDK_ADB="${LOCALAPPDATA:-}/Android/Sdk/platform-tools/adb.exe"
if [ -x "$SDK_ADB" ]; then
  SDK_V="$("$SDK_ADB" version 2>/dev/null | sed -n '2p' | tr -d '\r')"
  PATH_V="$(adb version 2>/dev/null | sed -n '2p' | tr -d '\r')"
  PATH_PREFIX="$(dirname "$SDK_ADB")"
  export PATH="$PATH_PREFIX:$PATH"
  log "adb:         pinned SDK build ($SDK_V) ahead of PATH build (${PATH_V:-unknown})"
  [ "$SDK_V" != "$PATH_V" ] && log "NOTE: two adb builds present; SDK one is now first on PATH for this run"
else
  log "adb:         $(command -v adb)"
fi
command -v adb >/dev/null 2>&1 || die "adb-missing" "adb not on PATH" "add Android SDK platform-tools to PATH"

ls "$USERPROFILE/.android/avd/$AVD.ini" >/dev/null 2>&1 \
  || die "avd-missing" "AVD '$AVD' does not exist" \
          "run 'emulator -list-avds' and re-run with --avd <name>"

# ── §1B emulator ─────────────────────────────────────────────────────────────
step "§1B emulator boot ($AVD)"
EMU_ARGS=(-avd "$AVD" -no-snapshot -no-boot-anim -gpu swiftshader_indirect -port 5554)
# Windowed mode is opt-in: on this host a wiped/windowed guest died with
# "UpdateLayeredWindowIndirect failed … A device attached to the system is not
# functioning" (§10). Headless survives; adb + Maestro work fine without a window.
[ "$WINDOWED" = "1" ] || EMU_ARGS+=(-no-window -no-audio)
log "launching: emulator ${EMU_ARGS[*]}"
nohup "$LOCALAPPDATA/Android/Sdk/emulator/emulator.exe" "${EMU_ARGS[@]}" \
  > "$EVIDENCE/emulator-boot.log" 2>&1 &
disown 2>/dev/null || true

adb start-server >/dev/null 2>&1 || true

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
log "booted: $(adb devices | grep emulator | tr -d '\r')"

# ── §2 env sync ──────────────────────────────────────────────────────────────
step "§2 env sync"
node scripts/dev-env-sync.js >>"$LOG" 2>&1 \
  || die "env-sync-failed" "scripts/dev-env-sync.js exited non-zero" \
          "EXPO_PUBLIC_* is inlined at BUNDLE time — a stale IP hangs the app at splash with a Retry button and every post-login flow times out"
node scripts/dev-env-sync.js --check >>"$LOG" 2>&1 \
  || die "env-drift" ".env.local does not match the current network after sync" \
          "fix the network, then re-run; Metro must be RESTARTED afterwards to pick up a new IP"
HOST_IP="$(node -e 'const fs=require("fs");const t=fs.readFileSync(".env.local","utf8");const m=t.match(/EXPO_PUBLIC_SERVER_URL=https?:\/\/([^:\/]+)/);console.log(m?m[1]:"?")' 2>/dev/null || echo '?')"
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
  || die "gps-seed-failed" "adb-gps-banani.sh failed (adb shell emu geo fix)" \
          "GPS must be seeded BEFORE app launch; the JS layer caches the first fix"
log "gps:         banani 90.4066 23.7937 seeded"

# ── §6 app launch + permissions ──────────────────────────────────────────────
step "§6 app launch + permissions"
for PERM in android.permission.ACCESS_FINE_LOCATION android.permission.CAMERA \
           android.permission.READ_EXTERNAL_STORAGE android.permission.POST_NOTIFICATIONS \
           android.permission.READ_MEDIA_IMAGES; do
  adb shell pm grant "$APP_ID" "$PERM" >/dev/null 2>&1 || true  # absent on some API levels
done
log "granted:     location, camera, storage, notifications"

adb shell am force-stop "$APP_ID" >/dev/null 2>&1 || true
adb shell monkey -p "$APP_ID" 1 >/dev/null 2>&1 \
  || die "app-launch-failed" "could not launch $APP_ID via monkey" \
          "confirm a dev build is installed: adb shell pm list packages | grep com.ride.bd"

# Splash-to-real-screen within ~15s of bundle completion (TEST-SETUP.md §2).
log "waiting for $APP_ID to pass splash…"
APP_UP=0
for i in $(seq 1 30); do
  if adb shell dumpsys activity activities 2>/dev/null | grep -q "$APP_ID"; then APP_UP=1; break; fi
  sleep 3
done
[ "$APP_UP" = "1" ] || die "app-not-foreground" \
  "$APP_ID never reached the foreground within 90s" \
          "99% a stale LAN IP — re-run §2, RESTART Metro, then relaunch. Never debug deeper before re-checking the IP (TEST-SETUP.md §5)"
adb exec-out screencap -p > "$EVIDENCE/06-app-launched.png" 2>/dev/null || true
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

run_twice() {
  local flow="$1" name i rc
  local -a st=() codes=()
  name="$(basename "$flow" .yaml)"
  [ -f "$flow" ] || die "flow-missing" "flow not found: $flow" "check the path against maestro/COVERAGE-MANIFEST.md §6"
  for i in $(seq 1 "$RUNS_PER_FLOW"); do
    log "  → $name run $i/$RUNS_PER_FLOW"
    # `maestro test` blocks on its own; the timeout guards the keyguard hang (runbook §10).
    timeout "$FLOW_TIMEOUT_S" "$MAESTRO_BIN" test "$flow" \
      > "$EVIDENCE/$name-run$i.log" 2>&1
    rc=$?
    codes+=("$rc")
    if [ "$rc" = "0" ]; then
      st+=("PASS")
    else
      st+=("FAIL")
      DAYS_STATUS=2
      adb exec-out screencap -p > "$EVIDENCE/$name-run$i-FAIL.png" 2>/dev/null || true
      log "    FAIL (exit $rc) — screenshot $name-run$i-FAIL.png"
    fi
    sleep 3
  done
  # Matrix row is built from the arrays so it stays correct for any RUNS_PER_FLOW.
  local row="$name"
  local s c
  for s in "${st[@]}"; do row=$(printf '%-46s %-6s' "$row" "$s"); done
  for c in "${codes[@]}"; do row="$row $c"; done
  printf '%s\n' "$row" | tee -a "$MATRIX"
}

for f in "${KEY_FLOWS[@]}"; do
  run_twice "$f"
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
      "$AVD" "$("$MAESTRO_BIN" --version 2>/dev/null | head -1)" "$(adb version 2>/dev/null | sed -n '2p' | tr -d '\r')" "$HOST_IP"
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