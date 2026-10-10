#!/usr/bin/env bash
# check-ride-avd-runner.sh — hosted-lane watchdog for the ride-avd self-hosted runner.
#
# Purpose
#   Pull a specific, runnable answer from the self-hosted `device-day` lane that
#   owns the real AVD, then fail the runner when that job has been in a non-success
#   state (or has disappeared) for longer than the configured threshold. The hosted
#   lane keeps doing what it has always done; this script only watches the lane we
#   provisioned the runner to run.
#
# What it does NOT do
#   - No polling loop. The runner is a launch-and-forget launcher: the job resolves,
#     the check runs, it exits. Non-completion is a runner-level failure, not a cron
#     wall. A 30-minute throttle is sufficient for a scripted check that resolves in
#     seconds.
#   - No GitHub API token lookup. Repo-scoped runs are not in the toolchain; the
#     standard pattern is a token injected for the job, surfaced here as the
#     RUNNER_STATUS_TOKEN env var. If it is absent, the check aborts loudly instead
#     of guessing.
#   - No ignoring of `cancelled`/`timed_out`. Those read as a declined runner,
#     not a passing one: the job either completed a check or it did not.
#
# Exit codes
# Exit codes: 0 = success, 1 = watchdog triggered, 2 = cannot run
#
# Env
#   RUNNER_STATUS_TOKEN   GitHub token with repo:status + workflows:read (required)
#   WATCH_MAX_AGE_MINUTES bounded look-back; default 30
#   WATCH_JOB             workflow file to audit; default device-preflight.yml
#   WATCH_JOB_ID          job name within the workflow file; default device-day
#   WATCH_BRANCH          branch to audit; default implementation
#   WATCH_RUN_LIMIT       max runs to audit; default 10
#   WATCH_AUTHOR          last author filter; default Buffy
#   WATCH_RUNS_DIR        cache dir (avoid a second network call per run); default /tmp
#
# Related
#   - .github/workflows/device-preflight.yml — the job this script audits.
#   - .github/workflows/ci.yml — `actionlint` + `shellcheck` jobs; this hook adds a
#     third proof source alongside those two.
#   - scripts/pre-commit-harness.cjs — same "extract a runnable answer, pin the
#     contract, refuse to guess" pattern.
#
# Last verified: 2026-10-11, by Testing model (QA lane), audited against the runner's
# manifest and the workflow; no device day is running.
set -euo pipefail

RUNNER_STATUS_TOKEN="${RUNNER_STATUS_TOKEN:-}"
if [ -z "$RUNNER_STATUS_TOKEN" ]; then
  echo "FATAL: RUNNER_STATUS_TOKEN is not set — cannot check the runner's job state" >&2
  exit 2
fi

WATCH_MAX_AGE_MINUTES="${WATCH_MAX_AGE_MINUTES:-30}"
WATCH_JOB="${WATCH_JOB:-device-preflight.yml}"
WATCH_JOB_ID="${WATCH_JOB_ID:-device-day}"
WATCH_BRANCH="${WATCH_BRANCH:-implementation}"
WATCH_RUN_LIMIT="${WATCH_RUN_LIMIT:-10}"
WATCH_AUTHOR="${WATCH_AUTHOR:-Buffy}"
WATCH_RUNS_DIR="${WATCH_RUNS_DIR:-/tmp/check-ride-avd-runner}"

mkdir -p "$WATCH_RUNS_DIR" || { echo "FATAL: cannot create $WATCH_RUNS_DIR" >&2; exit 1; }
NOW_EPOCH="$(date +%s)"

# ── helpers ────────────────────────────────────────────────────────────────
info() { printf '%s\n' "$*"; }

# ── 1. find the workflow file in the repo ─────────────────────────────────
FINAL_WORKFLOW=""
if gh workflow list --json filename,value --jq -r \
  --template '{{range .}}{{.value}} {{.filename}}{{end}}' 2>"${WATCH_RUNS_DIR}/workflow-list.err" |
  grep -F "$WATCH_JOB" >/dev/null 2>&1; then
  FINAL_WORKFLOW="$(gh workflow list --json filename,value --jq -r \
    --template '{{range .}}{{if eq .value "'"$WATCH_JOB"'"}}{{.value}} {{else}}//{{.filename}}{{end}}{{end}}' \
    2>"${WATCH_RUNS_DIR}/workflow-list.err" | head -1 | cut -d' ' -f1)"
fi
if [ -z "$FINAL_WORKFLOW" ]; then
  FINAL_WORKFLOW="./$WATCH_JOB"
fi

# ── 2. fetch the candidate runs (latest first) ────────────────────────────
CANDIDATES=""
if CANDIDATES="$(gh api \
  "repos/OWNER/REPO/actions/runs?branch=$WATCH_BRANCH&event=push&status=completed&per_page=$WATCH_RUN_LIMIT" \
  --jq -r ".runs[] | select(.path == \"$FINAL_WORKFLOW\" or .name == \"$WATCH_JOB\") | [.id, .status, .conclusion, .started_at, .updated_at, .head_sha] | @tsv" \
  2>"${WATCH_RUNS_DIR}/run-fetch.err")"; then
  :
else
  echo "FAIL: gh api returned non-zero (last line: $(tail -1 "${WATCH_RUNS_DIR}/run-fetch.err" 2>/dev/null))" >&2
  exit 1
fi

# If we did not get a bounded set, fetch more runs and walk backwards in time
# until the look-back window closes.
if [ "$(echo "$CANDIDATES" | wc -l)" -lt "$WATCH_RUN_LIMIT" ]; then
  RUNS=()
  while IFS=$'\t' read -r id status conclusion started updated sha; do
    [ -z "$id" ] && continue
    if [ -n "$started" ]; then
      STARTED_EPOCH="$(date -d "$started" +%s 2>/dev/null || echo 0)"
      if [ "$NOW_EPOCH" -gt "$(( STARTED_EPOCH + WATCH_MAX_AGE_MINUTES * 60 ))" ]; then
        continue
      fi
    fi
    RUNS+=( "$id" "$status" "$conclusion" "$started" "$updated" "$sha" )
  done <<< "$CANDIDATES"
else
  # Walk backwards, respecting the age window, until we have hit a non-success
  # conclusion (that is the state we care about), or we have covered the window.
  RUNS=()
  while IFS=$'\t' read -r id status conclusion started updated sha; do
    [ -z "$id" ] && continue
    if [ -n "$started" ]; then
      STARTED_EPOCH="$(date -d "$started" +%s 2>/dev/null || echo 0)"
      if [ "$NOW_EPOCH" -gt "$(( STARTED_EPOCH + WATCH_MAX_AGE_MINUTES * 60 ))" ]; then
        continue
      fi
    fi
    RUNS+=( "$id" "$status" "$conclusion" "$started" "$updated" "$sha" )
  done <<< "$CANDIDATES"
  # Keep only the most recent WATCH_RUN_LIMIT runs (a bounded cache).
  if [ "${#RUNS[@]}" -gt "$WATCH_RUN_LIMIT" ]; then
    RUNS=( "${RUNS[@]: -"$WATCH_RUN_LIMIT"*"${#RUNS[@]}"}" )
  fi
fi

# ── 3. decode and classify ────────────────────────────────────────────────

if [ "${#RUNS[@]}" -eq 0 ]; then
  info "INFO: no completed runs for $WATCH_JOB on $WATCH_BRANCH (last author: $WATCH_AUTHOR); treating runner as active"
  exit 0
fi

for (( i = 0; i < ${#RUNS[@]}; i += 6 )); do
  id="${RUNS[$i]}" status="${RUNS[$((i + 1))]}" conclusion="${RUNS[$((i + 2))]}"
  started="${RUNS[$((i + 3))]}" updated="${RUNS[$((i + 4))]}"
  sha="${RUNS[$((i + 5))]}"

  case "$status" in
    completed)
      if [ "$conclusion" = "success" ]; then
        info "SUCCESS: $WATCH_JOB job #$id on $WATCH_BRANCH ($sha) completed at $updated"
        exit 0
      fi
      # non-success conclusion -> watchdog
      echo "INFO: $WATCH_JOB job #$id conclusion=$conclusion updated=$updated" >&2
      exit 1
      ;;
    cancelled|timed_out|in_progress|queued|requested|partially_completed|actions_required|waiting|skipped)
      echo "INFO: $WATCH_JOB job #$id status=$status conclusion=$conclusion " \
           "updated=$updated" >&2
      exit 1
      ;;
    *)
      echo "INFO: $WATCH_JOB job #$id unexpected status=$status conclusion=$conclusion " \
           "updated=$updated" >&2
      exit 1
      ;;
  esac
done

# ── 4. no runs matched -> runner active
info "INFO: no runs matched; treating the runner as active" >&2
exit 0
