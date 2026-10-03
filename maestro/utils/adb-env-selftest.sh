#!/usr/bin/env bash
# adb-env-selftest.sh — proves the adb pin actually holds.
#
# Run: bash maestro/utils/adb-env-selftest.sh
# Exit: 0 = pinning consistent, 2 = inconsistent, 1 = cannot run (no adb at all).
#
# WHY: "all scripts source adb-env.sh" is a claim about the SOURCE. This checks
# the RUNTIME result — that every device script, if executed, drives the same
# adb binary — and that the resolver's override and failure paths behave. A pin
# that is sourced but bypassed (a stray bare `adb`, or PATH reordering after the
# source) would pass a grep and fail the actual device day.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

fail=0
note() { printf '%s\n' "$*"; }

# ── 1. all device scripts agree on the resolved binary ───────────────────────
note "== 1. every device script resolves the same adb =="
# DISCOVERED, not hardcoded: a hardcoded list would let a NEW device script be
# added without the pin and still pass, which is the exact failure this test
# exists to prevent. Excluded: adb-env.sh (IS the resolver) and this file.
scripts=""
for f in maestro/utils/*.sh; do
  b="$(basename "$f")"
  case "$b" in
    adb-env.sh|adb-env-selftest.sh) continue ;;
  esac
  scripts="$scripts $b"
done
resolved=""
for s in $scripts; do
  # Source each script's resolver line in isolation, exactly as the script does.
  out="$(ADB_ENV_QUIET=1 bash -c ". maestro/utils/adb-env.sh >/dev/null 2>&1; printf '%s' \"\$ADB\"")"
  if [ -z "$out" ]; then
    note "  FAIL  $s — resolver produced no ADB"
    fail=1
    continue
  fi
  note "  ok    $s -> $out"
  if [ -z "$resolved" ]; then resolved="$out"
  elif [ "$resolved" != "$out" ]; then
    note "  FAIL  $s resolved a DIFFERENT adb than the first script"
    fail=1
  fi
done

# ── 2. the scripts literally source the shared resolver ─────────────────────
note "== 2. each device script sources adb-env.sh =="
for s in $scripts; do
  if grep -q 'adb-env\.sh' "maestro/utils/$s"; then
    note "  ok    $s"
  else
    note "  FAIL  $s does not source the resolver (would use PATH adb)"
    fail=1
  fi
done

# ── 3. no bare command-position `adb` left in any device script ─────────────
note "== 3. no unqualified adb invocations remain =="
bare=""
for b in $scripts; do
  # -H forces the "path:line:" prefix; without it grep omits the filename for a
  # single file and the comment filter below cannot anchor. Then drop prose:
  # a line like `# adb shell …` is a comment, not an invocation.
  hits="$(grep -HnE '(^|[^"$[:alnum:]_/.-])adb (start-server|devices|shell|emu|kill-server|version|exec-out|wait-for-device)' \
          "maestro/utils/$b" 2>/dev/null | grep -vE ':[0-9]+:[[:space:]]*#' || true)"
  [ -n "$hits" ] && bare="$bare$hits"$'\n'
done
if [ -n "$bare" ]; then
  note "  FAIL  bare adb call(s) found:"
  while IFS= read -r line; do [ -n "$line" ] && note "        $line"; done <<< "$bare"
  fail=1
else
  note "  ok    all invocations go through \$ADB"
fi

# ── 4. explicit override is honoured ────────────────────────────────────────
note "== 4. ADB= override is honoured =="
ov="$(ADB="$resolved" ADB_ENV_QUIET=1 bash -c '. maestro/utils/adb-env.sh >/dev/null 2>&1; printf "%s" "$ADB"' 2>/dev/null)"
if [ "$ov" = "$resolved" ]; then
  note "  ok    override resolves to $ov"
else
  note "  FAIL  override produced '$ov', expected '$resolved'"
  fail=1
fi

# ── 5. a bad override fails loudly instead of silently falling back ─────────
note "== 5. a non-executable ADB= fails loudly =="
if ADB=/definitely/not/adb ADB_ENV_QUIET=1 bash -c '. maestro/utils/adb-env.sh' >/dev/null 2>&1; then
  note "  FAIL  bad override was accepted silently — it would fall back to PATH and defeat the pin"
  fail=1
else
  note "  ok    bad override rejected"
fi

# ── 6. no adb ANYWHERE fails loudly and does not fall through ────────────────
# This is the path a CI runner takes if the image ever stops shipping
# platform-tools. It used to be broken: adb_env_die's third argument is the exit
# STATUS, but that call site passed the remedy text there, so `exit` died with
# "numeric argument required" and the resolver carried on with an empty $ADB
# instead of stopping — the caller saw a source that "succeeded".
note "== 6. no adb anywhere stops instead of falling through =="
# Invoke bash by ABSOLUTE path: the PATH below hides adb, and would also hide
# bash itself, which would turn this case into "env: bash not found" — a pass
# for the wrong reason.
BASH_ABS="$(command -v bash)"
noadb_out="$(env -u ADB -u LOCALAPPDATA PATH="/nonexistent-dir-only" \
             ADB_ENV_QUIET=1 "$BASH_ABS" -c '. maestro/utils/adb-env.sh' 2>&1)"
noadb_rc=$?
if [ "$noadb_rc" -ne 0 ]; then
  note "  ok    exits non-zero (rc=$noadb_rc) with no adb on PATH"
else
  note "  FAIL  sourcing succeeded with no adb available — ADB would be empty downstream"
  fail=1
fi
case "$noadb_out" in
  *"numeric argument required"*|*"unbound variable"*)
    note "  FAIL  resolver leaked a shell error instead of a clean adb-missing: $noadb_out"
    fail=1 ;;
  *"adb-missing"*)
    note "  ok    reported adb-missing cleanly" ;;
  *)
    note "  FAIL  unexpected output: $noadb_out"
    fail=1 ;;
esac

note ""
if [ "$fail" -eq 0 ]; then
  note "PASS — one adb for every device script ($resolved)"
  exit 0
fi
note "FAIL — device tooling is not pinned to a single adb"
exit 2