#!/usr/bin/env bash
# bootstrap-device-day.sh — Phase 3 self-run bootstrap, in TEST-SETUP.md §2 order.
# 1) dev-env-sync (LAN IP → .env.local; env is inlined at BUNDLE time, no fallback)
# 2) utils-server (port 3001, INSTANCE_COUNT=1) — REQUIRED for V1 dispatch/V2/V4/V6/V7
# 3) Metro (port 8081) — MUST start AFTER env sync
# 4) emulator + com.ride.bd launch + permission grants (§15)
# Usage: bash maestro/utils/bootstrap-device-day.sh [--no-emulator]
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1

# Port-in-use check, portable: lsof is absent on Windows Git Bash (silent
# misbehavior in unattended runs) — netstat works on both. Args: PORT.
port_listening() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    netstat -an 2>/dev/null | grep -q ":$1 .*LISTEN"
  fi
}

echo "== 1) env sync =="
node scripts/dev-env-sync.js || exit 1

echo "== 2) utils-server (ws://0.0.0.0:3001, INSTANCE_COUNT=1) =="
if port_listening 3001; then
  echo "utils-server already listening on 3001 — reusing"
else
  (cd utils-server && npm run dev > ../utils-server-test.log 2>&1 &)
  sleep 5
  grep -q "listening" utils-server-test.log || echo "WARN: utils-server not yet confirmed; check utils-server-test.log"
fi

echo "== 3) Metro (port 8081) =="
if port_listening 8081; then
  echo "Metro already listening on 8081 — reusing"
else
  (npx expo start --port 8081 > metro-test.log 2>&1 &)
  echo "Waiting for Metro to accept connections…"
  for _ in $(seq 1 60); do
    port_listening 8081 && break
    sleep 2
  done
fi

if [ "${1:-}" != "--no-emulator" ]; then
  echo "== 4) emulator + app =="
  # One adb for the whole session (adb-env.sh), so this script cannot drive a
  # different build than run-device-day.sh / adb-gps-*.sh. Both installs on this
  # box bind tcp:5037; mixing them is what made the 2026-10-03 `unauthorized`
  # diagnosis ambiguous. Override with ADB=/path/to/adb.
  . "$ROOT/maestro/utils/adb-env.sh"
  "$ADB" start-server >/dev/null 2>&1 || true
  "$ADB" devices | grep -q "emulator\|device" || echo "WARN: no device attached — start the emulator (04 Emulator Android.bat) and re-run"
  # Permission boot config (§15)
  for PERM in \
    android.permission.ACCESS_FINE_LOCATION \
    android.permission.CAMERA \
    android.permission.READ_EXTERNAL_STORAGE \
    android.permission.POST_NOTIFICATIONS \
    android.permission.READ_MEDIA_IMAGES; do
    "$ADB" shell pm grant com.ride.bd "$PERM" >/dev/null 2>&1 || true
  done
  "$ADB" shell am force-stop com.ride.bd || true
  "$ADB" shell monkey -p com.ride.bd 1 || true
fi

echo "== bootstrap done =="
echo "Run a flow:  maestro test maestro/flows/auth/02-rider-login.yaml"
