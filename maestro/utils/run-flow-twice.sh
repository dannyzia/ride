#!/usr/bin/env bash
# run-flow-twice.sh — the §7 key-flow harness, as a reusable script.
#
# This is the loop that used to live inline in run-device-day.sh (§7). It is now
# here so an ad-hoc flow gets the SAME harness as the six key flows: the ×N
# repeat, the per-run timeout that guards the keyguard hang (runbook §10), the
# per-run log, the FAIL screenshot, and the pass-matrix row.
#
# DUAL MODE — one implementation, two ways in.
#
#   1) Executed directly, for an ad-hoc flow:
#        bash maestro/utils/run-flow-twice.sh maestro/flows/rider/booking/02-all-vehicle-types.yaml
#        bash maestro/utils/run-flow-twice.sh --runs 1 --evidence /tmp/scratch a.yaml b.yaml
#
#   2) Sourced by run-device-day.sh, which needs the matrix row appended to ITS
#      matrix and the failure to set ITS stop-the-day status:
#        . maestro/utils/run-flow-twice.sh
#        run_flow_twice maestro/flows/auth/02-rider-login.yaml
#
# Sourcing matters: a subprocess could not write the parent's matrix or flip the
# parent's DAYS_STATUS, so the two modes share one body rather than duplicating
# it — a duplicated harness is exactly how they would drift.
#
# Exit codes (standalone mode):
#   0  every run of every flow passed
#   1  at least one run FAILED  (bring-up was fine; the flow did not pass)
#   2  usage / precondition error (bad args, flow file missing, maestro missing)
#
# In sourced mode the caller owns the exit code; run_flow_twice sets DAYS_STATUS
# and returns 0 always, matching the previous inline behaviour where a failure
# was recorded rather than aborting the day.
set -uo pipefail

# BASH_SOURCE, not $0. When SOURCED, $0 is the PARENT script (run-device-day.sh),
# so `$0/../..` resolves to the wrong directory — measured: it cd'd to
# /d/My Projects instead of the repo root, and every flow then read as missing.
# BASH_SOURCE[0] is this file in both sourced and executed mode.
_THIS="${BASH_SOURCE[0]:-$0}"
ROOT="$(cd "$(dirname "$_THIS")/../.." && pwd)"
cd "$ROOT" || { echo "FATAL: cannot cd to repo root" >&2; exit 1; }

# ── fallbacks so the body works standalone ───────────────────────────────────
# When sourced by run-device-day.sh these already exist and must NOT be replaced.
if ! declare -F log >/dev/null 2>&1; then
  log() { printf '%s\n' "$*"; }
fi
if ! declare -F die >/dev/null 2>&1; then
  die() { printf 'BLOCKED at: %s\n  cause:  %s\n  remedy: %s\n' "$1" "$2" "$3" >&2; exit 2; }
fi
# ADB is needed only for FAIL screenshots; resolve it without failing the run
# when adb is absent (screenshot is a nicety, not the verdict).
if [ -z "${ADB:-}" ]; then
  # shellcheck source=maestro/utils/adb-env.sh
  ADB_ENV_QUIET=1 . "$(dirname "$_THIS")/adb-env.sh" 2>/dev/null || ADB=""
fi

# ── the harness ──────────────────────────────────────────────────────────────
# run_flow_twice <flow.yaml> [label]
#
# Environment it honours (all optional; defaults suit standalone use):
#   EVIDENCE         dir for <label>-run<N>.log and FAIL screenshots
#   MATRIX           file to append the pass-matrix row to
#   RUNS_PER_FLOW    repeats per flow (default 2)
#   FLOW_TIMEOUT_S   per-run timeout (default 420)
#   MAESTRO_BIN      maestro executable
#   DAYS_STATUS      mutated to 2 on any failure when already declared
run_flow_twice() {
  local flow="$1" label="${2:-}"
  local name i rc s c row
  local -a st=() codes=()

  local runs="${RUNS_PER_FLOW:-2}"
  local timeout_s="${FLOW_TIMEOUT_S:-420}"
  local evidence="${EVIDENCE:-maestro/test-results/$(date +%F)}"
  local maestro_bin="${MAESTRO_BIN:-maestro}"

  [ -n "$label" ] || label="$(basename "$flow" .yaml)"
  name="$label"

  if [ ! -f "$flow" ]; then
    die "flow-missing" "flow not found: $flow" \
        "check the path against maestro/COVERAGE-MANIFEST.md §6"
  fi
  if ! command -v "$maestro_bin" >/dev/null 2>&1 && [ ! -f "$maestro_bin" ]; then
    die "maestro-missing" "maestro executable not found: $maestro_bin" \
        "set MAESTRO_BIN=/path/to/maestro"
  fi

  mkdir -p "$evidence" 2>/dev/null || true

  for i in $(seq 1 "$runs"); do
    log "  → $name run $i/$runs"
    # `maestro test` blocks on its own; the timeout guards the keyguard hang
    # (runbook §10 — a run that hangs ~420s doing nothing is a locked screen).
    timeout "$timeout_s" "$maestro_bin" test "$flow" \
      > "$evidence/$name-run$i.log" 2>&1
    rc=$?
    codes+=("$rc")
    if [ "$rc" = "0" ]; then
      st+=("PASS")
    else
      st+=("FAIL")
      [ -n "${DAYS_STATUS+x}" ] && DAYS_STATUS=2
      if [ -n "${ADB:-}" ]; then
        "$ADB" exec-out screencap -p > "$evidence/$name-run$i-FAIL.png" 2>/dev/null || true
      fi
      log "    FAIL (exit $rc) — screenshot $name-run$i-FAIL.png"
    fi
    sleep 3
  done

  # Row is built from the arrays so it stays correct for any RUNS_PER_FLOW.
  row="$name"
  for s in "${st[@]}"; do row=$(printf '%-46s %-6s' "$row" "$s"); done
  for c in "${codes[@]}"; do row="$row $c"; done

  if [ -n "${MATRIX:-}" ]; then
    printf '%s\n' "$row" >> "$MATRIX"
  else
    printf '%s\n' "$row"
  fi

  # Non-zero return signals a failure to a standalone caller; in sourced mode
  # run-device-day.sh ignores it (it reads DAYS_STATUS), so recording a failure
  # here can never abort the day early the way the old inline body did not.
  local failed=0
  for s in "${st[@]}"; do [ "$s" = "FAIL" ] && failed=1; done
  return $failed
}

# ── CLI ──────────────────────────────────────────────────────────────────────
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  EVIDENCE="maestro/test-results/$(date +%F)"
  MATRIX=""
  LABEL=""
  ARGS=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --evidence) EVIDENCE="${2:-}"; shift 2 ;;
      --matrix)   MATRIX="${2:-}"; shift 2 ;;
      --label)    LABEL="${2:-}"; shift 2 ;;
      --runs)     RUNS_PER_FLOW="${2:-2}"; shift 2 ;;
      --timeout)  FLOW_TIMEOUT_S="${2:-420}"; shift 2 ;;
      -h|--help)  sed -n '2,30p' "$0"; exit 0 ;;
      -*)         echo "unknown arg: $1" >&2; exit 2 ;;
      *)          ARGS+=("$1"); shift ;;
    esac
  done
  if [ ${#ARGS[@]} -eq 0 ]; then
    echo "usage: bash maestro/utils/run-flow-twice.sh [options] <flow.yaml> [flow.yaml ...]" >&2
    exit 2
  fi

  overall=0
  for f in "${ARGS[@]}"; do
    log ""
    log "== $(basename "$f" .yaml) =="
    run_flow_twice "$f" "$LABEL" || overall=1
  done

  echo ""
  if [ "$overall" = 0 ]; then
    printf '\342\234\223 all runs passed — logs in %s\n' "$EVIDENCE"
    exit 0
  fi
  printf '\342\234\227 at least one run FAILED — bring-up was fine, the flow did not pass.\n'
  printf '    logs: %s/<flow>-run<N>.log\n' "$EVIDENCE"
  exit 1
fi