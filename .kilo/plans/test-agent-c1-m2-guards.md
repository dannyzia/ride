**Purpose:**     Test-agent dispatch: the two outstanding regression-test asks from the 2026-09-07 audit round — C1's end-to-end guard and M2's 403. Test files only.
**Owner:**       Orchestrator → test agent
**Status:**      CLOSED 2026-09-09 — both tests landed in commit `2db2964`; ISSUE-23 closed as satisfied (see Close-out below)
**Related (concrete paths):**
  - `app/api/rental/assignments/[id]/pick+api.ts`, `utils-server/rentalDispatchChain.ts:180-191` — C1 surface (fixed, verified at `5fb43a8`/`2fc3c0f`)
  - `app/api/rental/bids/[id]/complete+api.ts:89-108` — M2 surface (winning-bid gate, fixed)
  - `tests/api/rental/race-condition.test.ts`, `tests/api/rental/rental.test.ts` (or a new focused file) — where these land
  - `.kilo/plans/audit-marketplace-round.md` — the skeptic's close-out (residual 1 names these two as "the real guards")
**Last verified:** 2026-09-07, by Orchestrator

---

# Test dispatch: C1 + M2 regression guards

Two tests. Both were code-verified by the skeptic but lack their behavioral guard. Pick the harness shape you judge best (mock-chain with shared sequential-call state, per your race-condition suite) — the invariants below are the contract.

## Test 1 — C1: branch-(b) demote releases the born-fulfilled assignment and re-award succeeds

Invariant (from the skeptic's ask): tracking accept → no ack → `demoteWinner(req, "fleet_ack_timeout")` commits → the live assignment IS released, request is `collecting`, and a **subsequent `accept-bid` for a standing bid SUCCEEDS** (no `awarded_bid_assignments_live_idx` unique violation → no 500).

Shape:
1. State: request `awarded`, tracking assignment live with `assigned_driver_user_id` set (born-fulfilled), standing superseded bid exists.
2. Call `demoteWinner(requestId, "fleet_ack_timeout")` — assert `{ok: true, nextStatus: "collecting"}` and the assignment UPDATE carries `released_at` (predicate: WHERE has NO `assigned_driver_user_id IS NULL` guard — that guard's absence IS the fix; assert the rendered WHERE keys on `request_id` + `released_at IS NULL` only).
3. Then invoke the accept-bid handler against the post-demote mock state — assert 200 (not 500/23505) and the new assignment row written.

## Test 2 — M2: only the winning-bid fleet can complete

Invariant: `complete+api.ts` returns **403** when the caller is staff of a bid that is NOT the request's awarded bid (`winning_bid_id !== bid.id`); 200 for the winning fleet; 200 for the assigned-driver path (regression).

Shape: three cases — losing-fleet staff (403 + zero writes), winning-fleet staff (200), assigned driver (200). Mirror the existing auth-failure zero-write assertions in `rfq-actions.test.ts` / `rental.test.ts`.

## Constraints

- Test files only — no production code. If a test exposes a REAL defect, file a finding and stop (lane rule).
- The M7 suppression test already landed green (`2fc3c0f`) — do not duplicate.
- Active-lanes row before the commit; pathspec only; standard gates (tsc 0/0, lint 0, full jest green + the 2 new).

## Report

Verdict-first: 2 tests landed (file:line), suite counts, gates, commit SHA. These close the audit round's last open items — after this, the only post-freeze work is device smoke + hosted load test (+ the data-repair SQL Zia runs from `.kilo/plans/data-repair-stranded-assignments.sql.md`).

---

## Close-out (2026-09-09, Buffy — ISSUE-23 triage)

**Both asks in this dispatch are satisfied by commit `2db2964`** ("test(rental): C1 end-to-end + M2 winning-fleet gate regression tests", 2026-09-08, on `implementation`, already pushed). This file's Status was left ACTIVE because the closing commit was never recorded here — corrected now.

**Test 1 — C1 end-to-end regression** (ask: end-to-end 23505 on double-assign attempt):
- `tests/api/rental/race-condition.test.ts` — describe "C1 close-out — branch-(b) demote releases; re-award succeeds" (line ~952)
- Covers: tracking accept → no ack → `fleet_ack_timeout` demote → release UPDATE asserted to key on `request_id` + `released_at IS NULL` ONLY (`expect(rendered.sql).not.toContain("assigned_driver_user_id")` — the over-guard WAS the C1 defect) → re-accept of the standing bid returns **200** with a new assignment row. Pre-CAE fix this path 500'd on `awarded_bid_assignments_live_idx` (23505).

**Test 2 — M2 403 authz regression** (ask: 403 for non-winning-bid authz):
- `tests/api/rental/security-fix.test.ts` — describe "M2 — complete is gated to the awarded bid's fleet" (line ~1021)
- Covers: staff of a LOSING bid's fleet → **403** `forbidden` "Only the awarded fleet can complete this ride" + **zero writes** (requireFleetMember passes; only the winning-bid gate rejects); winning-fleet staff → 200 + completed; assigned driver → 200 (regression).

**Verification on current tree (2026-09-09):** `npx jest tests/api/rental/race-condition.test.ts tests/api/rental/security-fix.test.ts` → 2 suites, **77/77 pass**.

**Rhizome:** ISSUE-23 closed `done` citing `2db2964`. Parent epic ISSUE-16 already `done`.
