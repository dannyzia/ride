#!/usr/bin/env bash
# adb-env.sh — ONE adb for every script under maestro/utils/.
#
# SOURCE it, do not execute it:
#     . "$(dirname "$0")/adb-env.sh"
#
# WHY THIS EXISTS
# Two adb builds are installed side by side on this host:
#   C:\Users\callz\platform-tools\adb.exe                          v37.0.0  (first on PATH)
#   C:\Users\<user>\AppData\Local\Android\Sdk\platform-tools\adb.exe v36.0.0
# Both start a server on tcp:5037 and clients of different builds talk to
# whichever server is already up, so a mixed session produces diagnostics that
# describe the WRONG binary — the `unauthorized` state seen on 2026-10-03 was
# chased partly against the build the emulator never invoked.
#
# The defect this fixes is a CONSISTENCY one, not a "pick the newest" one:
# run-device-day.sh pinned the SDK build while bootstrap-device-day.sh and both
# adb-gps-*.sh called bare `adb` (the PATH build), so one device day drove two
# different binaries. Every script now resolves through here and gets the same one.
#
# RESOLUTION ORDER (first hit wins)
#   1. $ADB                 explicit override, e.g. ADB=/path/to/adb
#   2. PATH                 whatever the shell already resolves. This is the
#                           DEFAULT on purpose: it is the build the Android
#                           emulator client itself invokes, so pinning to some
#                           other build could desynchronise the emulator rather
#                           than fix it. Consistency is guaranteed; the specific
#                           binary is not silently changed.
#   3. Android SDK          fallback for shells with no adb on PATH.
#
# Exporting the resolved directory to the FRONT of PATH means bare `adb ...`
# calls in any script also hit the same binary, so pinning works even for code
# that was never edited to use "$ADB".
#
# Knobs: ADB=/path/to/adb     override the binary
#        ADB_ENV_QUIET=1      suppress the resolution log line

# Idempotent: safe to source from a script that also sources another copy.
if [ -n "${ADB_ENV_SOURCED:-}" ]; then
  # shellcheck disable=SC2317  # reached only when SOURCED; shellcheck cannot see it
  return 0 2>/dev/null || true
fi
ADB_ENV_SOURCED=1

# adb_env_die <code> <cause> [exit-status] [remedy]
# The status is the THIRD argument and the remedy the fourth. Getting that order
# wrong is not cosmetic: a call that puts the remedy third makes `exit` fail with
# "numeric argument required", execution CONTINUES, and the caller proceeds with
# an empty $ADB instead of stopping. Guarded because this file inherits `set -u`
# from whichever script sources it.
adb_env_die() {
  echo "ERROR: $1" >&2
  echo "       $2" >&2
  [ -n "${4:-}" ] && echo "       fix: $4" >&2
  exit "${3:-1}"
}

adb_env_resolve() {
  # 1. explicit override
  if [ -n "${ADB:-}" ]; then
    [ -x "$ADB" ] || adb_env_die "adb-missing" "ADB='$ADB' is not executable" 1
    return 0
  fi

  # 2. PATH (default: the build the emulator client itself uses)
  local on_path
  on_path="$(command -v adb 2>/dev/null || true)"
  if [ -n "$on_path" ]; then
    ADB="$on_path"
    return 0
  fi

  # 3. Android SDK fallback
  local sdk="${LOCALAPPDATA:-}/Android/Sdk/platform-tools/adb.exe"
  if [ -x "$sdk" ]; then
    ADB="$sdk"
    return 0
  fi

  adb_env_die "adb-missing" \
    "no adb found: not on PATH and not at '$sdk'" \
    1 \
    "install Android SDK platform-tools, or set ADB=/path/to/adb"
}

adb_env_resolve
export ADB

# Put the resolved build FIRST so unqualified `adb` resolves to it too.
case ":$PATH:" in
  *":$(dirname "$ADB"):"*) : ;;  # already ahead; leave PATH alone
  *) PATH="$(dirname "$ADB"):$PATH"; export PATH ;;
esac

adb_env_version() {
  "$ADB" version 2>/dev/null | sed -n '2p' | tr -d '\r'
}

# Report OTHER builds on this box. Not fatal — the run is pinned either way —
# but a silent mismatch is how the 2026-10-03 misdiagnosis happened, so it is
# always surfaced unless the caller opts out.
adb_env_warn_duplicates() {
  [ "${ADB_ENV_QUIET:-}" = "1" ] && return 0

  local mine sdk others="" v
  mine="$(adb_env_version)"

  sdk="${LOCALAPPDATA:-}/Android/Sdk/platform-tools/adb.exe"
  if [ -x "$sdk" ] && [ "$(cd "$(dirname "$sdk")" && pwd)" != "$(cd "$(dirname "$ADB")" && pwd)" ]; then
    v="$("$sdk" version 2>/dev/null | sed -n '2p' | tr -d '\r')"
    [ -n "$v" ] && [ "$v" != "$mine" ] && others="$others $v (SDK)"
  fi

  # ${USERNAME:-} is required, not defensive: USERNAME is a Git-Bash/Windows
  # variable and is unset on a Linux CI runner. Sourcing this file under the
  # caller's `set -u` there made the resolver die with "USERNAME: unbound
  # variable" even when adb had resolved perfectly.
  local legacy="/c/Users/${USERNAME:-}/platform-tools/adb.exe"
  [ -x "$legacy" ] && [ "$(cd "$(dirname "$legacy")" && pwd)" != "$(cd "$(dirname "$ADB")" && pwd)" ] && {
    v="$("$legacy" version 2>/dev/null | sed -n '2p' | tr -d '\r')"
    [ -n "$v" ] && [ "$v" != "$mine" ] && others="$others $v (legacy PATH dir)"
  }

  if [ -n "$others" ]; then
    echo "NOTE: other adb build(s) present:$others"
    echo "      pinned to $ADB ($mine) for this run. Both bind tcp:5037, so mixing"
    echo "      them makes diagnostics describe the wrong binary. Override with ADB=/path/to/adb."
  fi
}

if [ "${ADB_ENV_QUIET:-}" != "1" ]; then
  echo "adb:          $ADB ($(adb_env_version))"
fi
adb_env_warn_duplicates