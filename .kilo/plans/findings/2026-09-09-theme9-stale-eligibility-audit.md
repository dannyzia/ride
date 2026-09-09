**Purpose:**     Theme 9 (T9) deferred-depth audit — does the dispatch candidate pipeline ever admit or act on stale-eligible drivers (expired suspension, calls_remaining changed mid-dispatch, stale online status)? Read-only; closes the deferred-depth sweep for ISSUE-40. Companion to the T5 time audit and T6 unit audit.
**Owner:**       Orchestrator (audit); fix lane consumes F-9.1/F-9.2
**Status:**      COMPLETE — 2026-09-09, verified on live tree (HEAD 62ca4c0)
**Source of truth:** this file for T9 findings; eligibility rules in AGENTS.md § Dispatch Logic
**Related (concrete paths):**
  - utils-server/dispatch.ts — buildCandidateList (pool construction, fresh filters)
  - utils-server/dispatchChain.ts — in-memory chain (candidate snapshot, live-socket checks)
  - utils-server/leadBilling.ts — debit tx (FOR UPDATE re-checks)
  - utils-server/index.ts — executeMatchFlow (accept boundary), /internal/driver/force-offline
  - app/api/admin/driver/suspend+api.ts — suspension writer (the F-9.2 source)
  - .kilo/plans/findings/2026-09-09-theme5-time-audit.md — sibling audit
**Last verified:** 2026-09-09 by orchestrator (full-lifecycle trace at HEAD)
**How to update:** re-trace the four boundaries after any dispatch-eligibility change; append dated findings, never edit old ones.

## Method

Traced one driver's eligibility across the four boundaries where it is consumed:
1. **Pool build** (`buildCandidateList`) — which filters read DB state fresh vs snapshot.
2. **Chain walk** (`runSequentialChain`) — what the in-memory candidate snapshot retains, what is re-checked between offers.
3. **Debit tx** (`debitLeadForOffer`) — which guards run inside the serialized transaction.
4. **Accept** (`executeMatchFlow`) — what is re-verified before the match commit.

## Verdict per eligibility dimension

**calls_remaining / daily cap — CLEAN (authoritative re-check inside the tx).**
Pool prefilter uses the query snapshot (`dispatch.ts:436-442`) but that is only ordering/pool admission. The debit tx re-resolves the active subscription fresh (`leadBilling.ts` step 1, `expires_at > now()`), takes `SELECT … FOR UPDATE` on the subscription row (step 2, Z-4 serialization), and re-runs the daily-cap (step 3) and balance (step 4) guards **on the locked row** before any write. A driver whose balance hits 0 or whose cap fills mid-chain is skipped at debit with zero writes. The AGENTS.md "defense-in-depth" claim is verified live.

**Subscription expiry mid-chain — CLEAN.** Same tx re-resolves with `expires_at > now()`; an expired-sub driver returns `billed=false` (no debit, no offer row).

**Online status — CLEAN at pool and chain level.**
Pool: `is_online = true` read fresh (`dispatch.ts:200`) + M2 heartbeat hard-exclusion ≥120s (`dispatch.ts:533`) + H3-index eviction on disconnect (30s refresh TTL bounds any linger). Chain: `isDriverConnected` checks the **live socket registry** (`readyState === OPEN`), not the snapshot — a driver who disconnects mid-chain is skipped, and their outstanding offer resolves instantly as `disconnected` (`resolvePendingOfferForDriver`). Residual: a silent partition mid-offer (no close frame) spends one TTL window (default 15s, `dispatch_offer_ttl_seconds`) before expiring; the lead stays billed per ruling 8. That is documented billing semantics, not a staleness bug.

**Ride status between offers — CLEAN.** `isRideDispatching` re-reads `rides.status` from DB between every offer; rider cancel / system expire / match-elsewhere aborts the chain before the next debit.

**Suspension — GAP (F-9.1) + unwired mitigation (F-9.2).** See findings.

## Findings

**F-9.1 (MEDIUM): driver-account status is re-verified only at pool build — never at debit or accept.**
`buildCandidateList` filters `drivers.status = 'active'` (`dispatch.ts:201`), but the candidate list then lives as an **in-memory ID snapshot** for the chain's whole walk (`dispatchChain.ts` ChainState.candidates — candidates carry only `driverId` + `auto_accept_eligible`). Two consumer gaps:
- **Debit** (`debitLeadForOffer`): checks subscription state but NOT `drivers.status` — a driver suspended after pool build is still debited 1 lead and offered the ride.
- **Accept** (`executeMatchFlow`, `index.ts:1944`): revenue guard (deduction row, :1964-1975) and ride-status atomic guard (`WHERE status='dispatching'`, :2037-2055) are present, but there is **no `drivers.status`/`is_online` re-check** before the match commit — a suspended driver who accepts can be matched.
Exposure window = chain duration (bounded per-offer by the 15s TTL, but a long pool-exhaustion walk can take minutes). A mid-chain suspension therefore lets a banned driver receive offers, spend a lead, and potentially match. Fix shape (defense-in-depth, no new writes): (a) add `drivers.status='active' AND is_online` to the debit tx (one select, `billed=false` on miss); (b) re-check driver row in `executeMatchFlow` before the atomic UPDATE and return `race_lost`-style no-match on miss.

**F-9.2 (LOW, but the cheap source-level fix): `/internal/driver/force-offline` has NO caller.**
`utils-server/index.ts:526` implements a complete force-offline endpoint (sends `admin:suspended`, closes the socket, runs `handleDriverDisconnect` — which evicts the H3 index, resolves pending offers, flips `is_online`) — and a repo-wide grep finds **zero callers**. The admin suspend writer (`app/api/admin/driver/suspend+api.ts`) updates DB state and sends `notifyAccountStatus` (push) but never notifies the dispatch server: the suspended driver's socket stays connected, their heartbeats keep flowing, they pass `isDriverConnected`, and nothing delivers the `admin:suspended` WS message. Wiring the call (POST with `WEBSOCKET_INTERNAL_SECRET` — the secret exists for exactly this class of internal call) into `suspend+api.ts` closes most of F-9.1's window at the source and activates the existing driver-facing suspension UX.

## Summary table

| Dimension | Pool | Chain | Debit tx | Accept | Verdict |
|---|---|---|---|---|---|
| calls_remaining / daily cap | snapshot | — | FOR UPDATE re-check | — | CLEAN |
| subscription expiry | `expires_at > now()` | — | fresh re-resolve | — | CLEAN |
| online status | fresh + 120s heartbeat | live socket registry | — | — | CLEAN |
| ride status | — | DB re-check between offers | — | atomic `status='dispatching'` | CLEAN |
| suspension | `status='active'` | **snapshot only** | **missing** | **missing** | F-9.1 |
| socket on suspend | — | stays connected (no caller of force-offline) | — | — | F-9.2 |

Fix routing: F-9.1 → fix lane (two small guards); F-9.2 → fix lane (one fetch call in suspend+api.ts + config). T9 CLOSED for ISSUE-40's sweep — the deferred-depth audit arc (T5, T6, T9) is complete.
