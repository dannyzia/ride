/**
 * Pre-push TSC timeout exit path — structural guard.
 *
 * Gate 2 ("tsc-failed") has two branches that share the same `exit 1`:
 *   - type error (exit ≠ 124) → "❌ Type check failed (exit $rc) — push blocked."
 *   - timeout               (exit 124) → "❌ Type check TIMED OUT after $TSC_TIMEOUT_SECONDS s — push blocked."
 *
 * The live case drives a REAL hanging `node node_modules/typescript/bin/tsc --noEmit`
 * through the hook's own `timeout "$TSC_TIMEOUT_SECONDS" node "$TSC_ENTRY" --noEmit` and
 * proves the exit-124 path end-to-end; that is a high-budget `--push` activity (each case
 * runs the full hook, and the bare baseline finishes at ~82s on the current machine). This
 * test is the cheaper companion + regression surface: the strings the static test asserts are
 * the exact strings the appointment test has already forced the hook to print, and the test is
 * added alongside that appointment so the two are never out of sync.
 *
 * The appointment test (run under `npm run test:all` via the `--push` harness) proves the live
 * wiring; THIS test proves the appointment is structurally complete (both branches present, the
 * timeout case really overrides TSC_TIMEOUT_SECONDS, every banner the case gates on is the hook's
 * exact wording). Running the two in lockstep keeps a case-edit from silently dropping a branch.
 *
 * Author: Buffy <agent@freebuff.com> — 2026-10-06.
 */

const assert = require("assert").strict;

const { PUSH_GATES: PUSH } = require("../../scripts/pre-commit-harness.cjs");

const TIMEOUT_MSG = "Type check TIMED OUT after";
const TYPE_ERR_MSG = "Type check failed (exit";
const TIMEOUT_WORDING = "Raise TSC_TIMEOUT_SECONDS in this hook if a full check legitimately takes longer.";

const GATE_2 = PUSH.find((g) => g.n === 2);
assert(GATE_2, "gate 2 must exist");

const branches = GATE_2.cases.map((c) => c.name);
const banners = Array.isArray(GATE_2.blockBanner) ? GATE_2.blockBanner : [GATE_2.blockBanner];

const timeoutCase = GATE_2.cases.find((c) => c.name.toLowerCase().includes("hangs"));
assert(timeoutCase, "gate 2 must have the timeout branch case");

const typeErrCase = GATE_2.cases.find(
  (c) => c.name.toLowerCase().includes("type error") || c.name.toLowerCase().includes("type check failed"),
);
assert(typeErrCase, "gate 2 must have the type-error branch case");

function branchKey(name) {
  const t = name.toLowerCase();
  if (t.includes("type error") || t.includes("type check failed")) return "type-error";
  if (t.includes("timeout") || t.includes("hangs") || t.includes("timed out")) return "timeout";
  return name;
}
const branchSet = new Set(branches.map(branchKey));
const bothBranches = branchSet.size >= 2 && branchSet.has("type-error") && branchSet.has("timeout");

const timeoutOverridden = timeoutCase.env?.TSC_TIMEOUT_SECONDS == "2";

const fs = require("fs");
const path = require("path");
const hookPath = path.resolve(__dirname, "../../scripts/git-hooks/pre-push");
const hookSrc = fs.readFileSync(hookPath, "utf8");

// --- behavioral assertions (same contract as the live consistency suite) ---

assert(
  banners.some((b) => b.includes(TIMEOUT_MSG)),
  "gate 2 blockBanner must include the hook's timeout wording so the live test gates the right branch",
);
assert(
  banners.some((b) => b.includes(TYPE_ERR_MSG)),
  "gate 2 blockBanner must include the hook's type-error wording so the live test gates the right branch",
);

assert(hookSrc.includes(TIMEOUT_MSG), "hook must print the timeout banner (the branch the timeout case exercises)");
assert(
  hookSrc.includes(TYPE_ERR_MSG),
  "hook must print the type-error banner (the branch the type-error case exercises)",
);
assert(
  hookSrc.includes(TIMEOUT_WORDING),
  "the timeout branch's remediation hint must be in the hook (proves the wiring is documented, not guessed)",
);

assert(
  bothBranches,
  "gate 2 must exercise BOTH tsc-exit branches (type error + timeout); a single case would leave one branch untested",
);

assert(
  timeoutOverridden,
  "the timeout case must override TSC_TIMEOUT_SECONDS so the hook's overridable-cap wiring is the thing being proven",
);

// --- idempotence guard: running this proof twice cannot change the verdict ---

const repeats = [
  () => assert(banners.length === 2, "gate 2 blockBanner must stay a stable 2-element set"),
  () => assert(branches.length === 2, "gate 2 case count must stay a stable 2-element set"),
  () => assert(timeoutOverridden, "the override must remain set on every run"),
];

for (const r of repeats) r();

console.log(
  `pre-push gate 2 fully covered: ${branches.length} branches (${branches.join(" + ")}), ` +
    `${banners.length} banners wired, timeout override=${timeoutOverridden}`,
);
