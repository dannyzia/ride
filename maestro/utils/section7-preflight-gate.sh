#!/usr/bin/env bash
# section7-preflight-gate.sh — verifies the runbook §7 preflight gate.
#
# Run: bash maestro/utils/section7-preflight-gate.sh
# Exit: 0 = gate behaves correctly, 2 = it does not, 1 = cannot run.
#
# WHY: the §7 gate is a bash snippet living in a MARKDOWN file, which nothing
# else in this repo executes or lints. A regression — inverted condition, wrong
# field, `offline` misread as fatal — would sit there until someone ran a real
# device day and burned flow timeouts anyway. This extracts the gate, runs it
# against a STUB adb for each device state, and checks the verdict.
#
# The stub is a shell script on PATH; it never touches a real device.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

# Extract the gate's bash block from the runbook so we test the DOCUMENTED
# snippet, not a copy that can drift from it.
RUNBOOK="maestro/DEVICE-DAY-RUNBOOK.md"
GATE="$(awk '
  /^### §7 preflight gate/ { grab=1 }
  grab && /^```bash/ { inblock=1; next }
  inblock && /^```/ { exit }
  inblock { print }
' "$RUNBOOK")"

if [ -z "$GATE" ]; then
  echo "FAIL: could not extract the §7 gate from $RUNBOOK"
  echo "      (heading '### §7 preflight gate' followed by a \`\`\`bash block)"
  exit 1
fi

fail=0
note_line() { printf '%s\n' "$1"; }

# stub_adb STATE [BOOTED] — a fake adb that prints a fixed `adb devices` table
# and a fixed sys.boot_completed.
make_stub() {
  local dir="$1" state="$2" booted="${3:-}"
  mkdir -p "$dir"
  cat > "$dir/adb" <<STUB
#!/usr/bin/env bash
case "\$1" in
  devices)
    printf 'List of devices attached\n'
    printf 'emulator-5554\t%s\n' "$state"
    printf '\n'
    ;;
  shell)
    # only getprop sys.boot_completed is consulted
    printf '%s\n' "$booted"
    ;;
  *) : ;;
esac
exit 0
STUB
  chmod +x "$dir/adb"
}

# run_gate STATE BOOTED -> prints verdict, returns gate exit code
run_gate() {
  local state="$1" booted="$2" tmp
  tmp="$(mktemp -d)"
  make_stub "$tmp/bin" "$state" "$booted"
  # Prepend the stub so `adb` inside the gate resolves to it; the gate's own
  # `. maestro/utils/adb-env.sh` would otherwise pick the real adb from PATH.
  ( PATH="$tmp/bin:$PATH" ADB="$tmp/bin/adb" ADB_ENV_QUIET=1 bash -c "$GATE" ) 2>&1
  local rc=$?
  rm -rf "$tmp"
  return $rc
}

expect() {
  local desc="$1" want_rc="$2" want_grep="$3" state="$4" booted="$5"
  local out rc
  out="$(run_gate "$state" "$booted")"; rc=$?
  local ok=1
  [ "$rc" = "$want_rc" ] || ok=0
  if [ -n "$want_grep" ]; then
    echo "$out" | grep -qi "$want_grep" || ok=0
  fi
  if [ "$ok" = 1 ]; then
    echo "  ok    $desc (exit $rc)"
  else
    echo "  FAIL  $desc — expected exit $want_rc / '$want_grep', got exit $rc"
    while IFS= read -r l; do note_line "          $l"; done <<< "$out"
    fail=1
  fi
}

echo "== §7 preflight gate verdicts by device state =="
# The auth case needs its own assertion. Matching the auth branch's OUTPUT is
# not enough: deleting its `exit 1` still prints every "adb auth failed" echo,
# and the run then falls through to the not-ready branch — same exit code, same
# text, wrong cause. The signal that distinguishes them is whether the gate
# reached the SECOND check at all, so assert the not-ready message is absent.
auth_out="$(run_gate unauthorized "")"; auth_rc=$?
if [ "$auth_rc" = 1 ] \
   && echo "$auth_out" | grep -qi "adb auth failed" \
   && ! echo "$auth_out" | grep -qi "not ready"; then
  echo "  ok    unauthorized aborts AT the auth gate (never reaches the ready check)"
else
  echo "  FAIL  unauthorized must abort at the auth gate — got exit $auth_rc"
  echo "$auth_out" | while IFS= read -r l; do note_line "          $l"; done
  fail=1
fi
expect "healthy device proceeds"                  0 "preflight OK"  device       1
expect "absent device aborts as not-ready"         1 "not ready"     absent       ""
expect "device but not booted aborts as not-ready" 1 "not ready"     device       ""
# offline is a normal early-boot state, NOT the auth signature: it must stop the
# gate (flows must not start) but must never be reported as an auth failure.
expect "offline stops the gate but is not called an auth failure" 1 "not ready" offline ""
if run_gate offline "" | grep -qi "adb auth failed"; then
  echo "  FAIL  offline was misdiagnosed as the adb-auth blocker"
  fail=1
else
  echo "  ok    offline is not misdiagnosed as an adb auth failure"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS — §7 gate fails fast on auth failure and does not block normal boot"
  exit 0
fi
echo "FAIL — §7 gate does not behave as documented"
exit 2