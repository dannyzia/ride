**Purpose:**     R3.3 auto-redispatch design — resolves the 8 items flagged "dangerously underspecified" in `.kilo/plans/1788246222101-completion-plan-critique-v2.md` §C1. Read before implementing or reviewing R3.3.
**Owner:**       Architect
**Status:**      ACTIVE
**Source of truth:** This file, for R3.3 design decisions. `.kilo/plans/1788246222101-completion-plan-critique-v2.md` §C1 remains the source of the *original 8 gaps* being closed.
**Related (concrete paths):**
  - `app/api/ride/[id]/cancel+api.ts` — owns the cancellation claim transaction; the re-land adds status-transition, attempt-cap gating, and the `!canRedispatch` fee gate per §1/§7/§9 (a partial on-disk implementation exists today but is being fully reverted to clean-absence before tests — see §11 ruling)
  - `utils-server/index.ts:672-742` — `/internal/ride/cancelled` HTTP handler; the re-land teaches it to act on the `redispatch` flag (`runRedispatchTrigger`, §2/§9) — this is the primary wiring gap this spec closes
  - `utils-server/index.ts:1074-1090` (`startup()`) — the one-time, boot-only stuck-`dispatching` sweep this design relies on for TD-15 recovery
  - `utils-server/dispatchChain.ts` — sequential chain primitives (`registerChain`, `abortChain`, `getChain`, `runSequentialChain`) — unmodified, reused as-is
  - `utils-server/dispatch.ts` (`buildCandidateList`) — candidate pool builder; already excludes every driver with an existing `dispatch_offers` row for the ride — this is what makes "pool rebuild" free
  - `utils-server/leadBilling.ts` — offer-time debit; unmodified, reused as-is
  - `lib/platformConfig.ts` — `PLAN05_CONFIG_KEYS`/`DEFAULTS`; this spec requires `auto_redispatch_enabled`, `auto_redispatch_delay_ms`, and the new `auto_redispatch_max_attempts` (§7) — the re-land re-adds any of these the revert removes; `auto_redispatch_checkin_minutes` remains inert (§9)
  - `src/db/schema.ts` (`rides` table) — `redispatch_started_at` / `redispatch_attempts` columns already exist, inert until this spec
  - `utils-server/redispatch.ts` — **new file**, proposed by this spec (§9), extracts the redispatch trigger into a dependency-injected, jest-testable function (same rationale as `dispatchChain.ts`'s own header comment)
  - `tests/api/ride/pickup-move.test.ts` — mock-chain test pattern this design's tests follow
**Last verified:** 2026-09-03, by Architect, upon orchestrator verdict APPROVED-with-amendments: state-divergence ruled (orchestrator error, `fea4dea` wholesale-commit scope miss; on-disk partial in `cancel+api.ts` being fully reverted to clean-absence), Amendment 2 fee gate folded into §1/§9/§10. On-disk partial code is NOT ground truth — this spec is the design the re-land rebuilds from.
**How to update:** Re-read the files above against disk before trusting any claim in this file. As of the 2026-09-03 ruling, the pre-existing partial implementation in `cancel+api.ts` is scheduled for full revert to clean-absence and must be treated as absent — the code shapes in §1/§7/§8 are what the re-land rebuilds, not ratified code.

---

## 0. North-star behavior

When the assigned driver cancels a matched ride, the rider's app silently keeps searching (same "finding driver" UI as the original request) while a push notification tells them their driver cancelled and a new one is being found; the departing driver sees a normal `ride:cancelled` confirmation and owes nothing further; the next candidate driver receives an ordinary `ride:offer` with no indication it's a re-dispatch; and in the background the platform bills the new offer through the same `leadBilling.ts` path, never re-offers a driver already billed on this ride (across every prior attempt, not just the last one), and gives up after a capped number of attempts by putting the ride into the same `expired` / `ride:expired` state a normal no-drivers-found dispatch already uses.

## 1. Decision — Status transition writer (critique item 1)

### Decision
[`app/api/ride/[id]/cancel+api.ts`](app/api/ride/[id]/cancel+api.ts:141) writes the `rides.status` transition, inside the same atomic claim `UPDATE` that already exclusively owns every other cancel-time state change.

### Reasoning
The claim `UPDATE` (`WHERE status IN CANCELLABLE_STATUSES`) is already the sole exactly-once guard for cancellation; a second writer (the WS server) racing the same row would need its own conditional update and would duplicate the guard for no benefit — one transaction, one owner, matches the existing M-28 convention documented inline in that file.

### Exact code shape
This code shape is the design the re-land rebuilds in this file (ruling 1, §11: the on-disk partial was orchestrator-reverted to clean-absence; treat it as absent):
```ts
// app/api/ride/[id]/cancel+api.ts, inside the transaction's claim UPDATE
const [claimedRide] = await tx.update(rides)
  .set({
    status: newStatus, // 'dispatching' when canRedispatch, else 'cancelled' or 'expired' (§7)
    cancelled_by: canRedispatch ? null : cancelled_by,
    cancel_reason: canRedispatch ? null : (reason ?? null),
    updated_at: new Date(),
    ...(canRedispatch ? { redispatch_started_at: new Date(), redispatch_attempts: sql`${rides.redispatch_attempts} + 1`, driver_id: null } : {}),
  })
  .where(and(eq(rides.id, rideId), inArray(rides.status, CANCELLABLE_STATUSES)))
  .returning({ id: rides.id });
```
Two changes accompany this shape in the re-land: (i) the attempt-cap gate on `canRedispatch` (§7), and (ii) **Amendment 2** — the entire cancellation-fee block (`evaluateCancellation`'s fee stamp, compensation credit via `createCancellationCreditInTx`, rider deduction, and the `payment_event` write) is gated on `!canRedispatch`, so a redispatching ride writes no fee events: if an admin ever seeds a driver-cancel cancellation policy, a redispatched ride that later completes must not have charged the rider a cancellation fee or compensated the departing driver. Adding `rider_user_id` to the `/internal/ride/cancelled` POST body is unchanged from §9.

### Edge cases covered
- Rider cancels the same ride in the same instant as the driver: only one of the two role-scoped requests can own `ride.driver_id`, so they cannot both be "the driver cancel" — see §5 for the rider-side race.
- Two rapid driver actions on the same ride: impossible — a matched ride has exactly one assigned driver, and the ownership check (`ride.driver_id !== driver.id → 403`) means only that one identity can ever reach the claim.

### Edge cases explicitly NOT covered (and why)
- Driver cancelling via a stale/duplicate HTTP retry: covered for free by the claim `UPDATE`'s `WHERE status IN CANCELLABLE_STATUSES` — the second retry finds the ride already `dispatching`/`cancelled` and 409s. Not R3.3-specific.

### Test cases that prove this
- `driver cancel on matched ride with auto_redispatch_enabled=true → rides.status set to 'dispatching', driver_id null, redispatch_started_at set`
- `driver cancel on matched ride with auto_redispatch_enabled=false → rides.status set to 'cancelled' (unchanged legacy behavior)`
- `duplicate cancel request (second call) → 409 ride_not_cancellable, zero writes`
- `driver cancel with canRedispatch=true → zero fee writes: evaluateCancellation/createCancellationCreditInTx/rider-deduction/payment_event paths never invoked (Amendment 2)`
- `driver cancel with canRedispatch=false (legacy/exhausted path) → existing fee block still runs exactly as before the re-land`

## 2. Decision — New chain vs. resume (critique item 2)

### Decision
A **new** chain is registered under the **same `ride_id`** by calling the existing `dispatchRidePipeline(ride, false)` again — never a "resume" of the aborted chain, which no longer exists in the `chains` Map by the time redispatch fires.

### Reasoning
`dispatchChain.ts`'s `runSequentialChain` deletes the ride's entry from `chains` in its `finally` block on every terminal outcome, so by the time a matched ride's driver cancels, no chain object survives to resume; re-entering via the same public pipeline function `index.ts` already uses for `/internal/dispatch` avoids inventing a second candidate-building/offer-loop code path.

### Exact code shape
New file `utils-server/redispatch.ts` (rationale for the extraction is in §9/§10 — `index.ts` cannot be imported under jest):
```ts
export interface RedispatchTriggerDeps {
  getRide(rideId: string): Promise<typeof rides.$inferSelect | null>;
  dispatchPipeline(ride: typeof rides.$inferSelect): Promise<void>; // bind to (r) => dispatchRidePipeline(r, false)
  notifyRider(userId: string, msg: Record<string, unknown>): void;
  delayMs: number;
}

export async function runRedispatchTrigger(
  rideId: string,
  riderUserId: string | null,
  deps: RedispatchTriggerDeps,
): Promise<void> {
  if (riderUserId) {
    deps.notifyRider(riderUserId, { type: "ride:status", ride_id: rideId, status: "dispatching" });
  }
  if (deps.delayMs > 0) await new Promise((r) => setTimeout(r, deps.delayMs));
  const ride = await deps.getRide(rideId);
  if (!ride || ride.status !== "dispatching") return; // rider cancelled during the delay — no-op (§5)
  await deps.dispatchPipeline(ride);
}
```
`utils-server/index.ts`'s `/internal/ride/cancelled` handler calls this when `redispatch === true` (full wiring in §9).

### Edge cases covered
- Chain-registration collision: `registerChain` returns `false` only if a live chain already exists for `rideId`; since the prior chain was deleted on `matched`, and no other path can register a chain for a `matched`/now-`dispatching` ride concurrently, collision cannot occur here.
- Ride mutated during the pre-dispatch delay (rider cancel) — re-fetches the ride and checks `status === 'dispatching'` immediately before dispatching (§5).

### Edge cases explicitly NOT covered (and why)
- A ride re-entering `dispatchRidePipeline` a second time due to TD-15 crash recovery *while* a redispatch's own delay timer is also pending: the in-memory `setTimeout` is lost on crash exactly like chain state; on restart only the startup sweep's `dispatchRidePipeline` call survives (§6) — the delay is simply skipped on the recovery path, which is acceptable (redispatch already happened once for this attempt).

### Test cases that prove this
- `runRedispatchTrigger with a ride that is still 'dispatching' after the delay → dispatchPipeline called once with the fresh ride row`
- `runRedispatchTrigger with a ride that flipped to 'cancelled' during the delay → dispatchPipeline never called`
- `runRedispatchTrigger with riderUserId → notifyRider called with type 'ride:status', status 'dispatching', before the delay`
- `runRedispatchTrigger with delayMs=0 → dispatchPipeline called without waiting a tick`

## 3. Decision — Pool rebuild strategy (critique item 3)

### Decision
The pool is always rebuilt fresh via the existing [`buildCandidateList()`](utils-server/dispatch.ts:108) call inside `dispatchRidePipeline` — never reused from the prior chain.

### Reasoning
`buildCandidateList` already queries `dispatch_offers WHERE ride_id = X` and excludes every driver with a row there (`alreadyOffered`, [`utils-server/dispatch.ts:239`](utils-server/dispatch.ts:239)), and that set accumulates across **every** redispatch attempt for the ride (rows are never deleted) — so "rebuild" and "exclude previously-billed drivers" are the same DB read, not two separate mechanisms to design.

### Exact code shape
No new code — this is the existing `buildCandidateList(ride.id, ...)` signature, called with the same `ride.id` on every redispatch attempt exactly as it's called on the first dispatch. Driver location freshness comes for free too: the H3 index it reads from is a live, continuously heartbeat-updated in-memory structure, not a snapshot.

### Edge cases covered
- A driver who was offered and rejected on attempt 1 must not be re-offered on attempt 2: covered by the cumulative `dispatch_offers` exclusion.
- A driver who newly came online between attempts is eligible on the new attempt: covered because the H3 index and `drivers.is_online` are read live, not cached from attempt 1.

### Edge cases explicitly NOT covered (and why)
- The departing driver (who just cancelled) re-entering their own re-dispatched ride's pool: already impossible — they have a `dispatch_offers` row (`outcome='accepted'`) for this ride from their own match, so `alreadyOffered` excludes them; no special-case code needed.

### Test cases that prove this
- `buildCandidateList called twice for the same ride_id (simulating attempt 1 then attempt 2) → drivers offered in attempt 1 are absent from attempt 2's candidate list`
- `driver who went online between attempt 1 and attempt 2 → present in attempt 2's candidate list, absent from attempt 1's`

## 4. Decision — Rider notification spec (critique item 4)

### Decision
Two channels fire synchronously inside the cancel request itself, before any re-dispatch attempt starts: the push notification (`ride:driver_cancelled`, rebuilt by the re-land inside the same `canRedispatch` branch per §1) and a new realtime WS `ride:status` message (`status: 'dispatching'`) sent to the rider's live socket from `runRedispatchTrigger` (§2).

### Reasoning
Both fire from the synchronous cancel-request code path (push) or the very first line of the async trigger before the configured delay (WS), so the 5-second rule is met with margin regardless of dispatch outcome; reusing the existing `ride:status` message type means the rider's live-tracking screen needs zero new client-side event handling to reflect "searching again."

### Exact code shape
Push (rebuilt by the re-land in `app/api/ride/[id]/cancel+api.ts`; shape unchanged — line numbers will shift after the revert):
```ts
if (canRedispatch) {
  sendNotification(ride.user_id, 'ride:driver_cancelled', 'Finding a new driver…',
    'Your driver cancelled. We are finding a new driver for you.', { ride_id: rideId }, { priority: 'high' });
}
```
WS (new, inside `runRedispatchTrigger`, §2): `notifyRider(userId, { type: "ride:status", ride_id: rideId, status: "dispatching" })`, called before the `delayMs` wait.

### Edge cases covered
- Rider app backgrounded (no live socket): push notification still lands via the existing `lib/notify.ts` channel — the WS message is best-effort additive, not the only channel.
- Rider app foregrounded and subscribed via `ride:subscribe`: receives the WS message immediately, no polling needed.

### Edge cases explicitly NOT covered (and why)
- A distinct rider-facing "driver cancelled" toast (as opposed to the generic `ride:status: dispatching` the tracking screen already renders): left to the existing push notification's title/body; a dedicated WS payload for this is v2 polish, not required to meet the 5-second rule.

### Test cases that prove this
- `runRedispatchTrigger calls notifyRider before deps.delayMs elapses (fake timers)`
- `cancel+api.ts POST with canRedispatch=true → sendNotification called with type 'ride:driver_cancelled', priority high`
- `cancel+api.ts POST with canRedispatch=false, cancelled_by='driver' → sendNotification called with type 'ride:cancel_survey' instead (unchanged legacy branch)`

## 5. Decision — Concurrent rider cancel handling (critique item 5)

### Decision
No new code is required: the rider's cancel goes through the same atomic claim `UPDATE` (`status IN CANCELLABLE_STATUSES`, which includes `'dispatching'`), and both the WS-side `abortChain` call and the redispatch trigger's own re-check (§2) independently make a same-`ride_id` mid-flight rider cancel safe.

### Reasoning
Because the redispatch chain is registered under the identical `ride_id`, the existing unconditional [`abortChain(ride_id)`](utils-server/index.ts:685) call inside `/internal/ride/cancelled` finds and aborts it exactly as it would any other chain — this is what "same `ride_id`, new chain" (§2) buys for free; and even if the rider cancel lands during `runRedispatchTrigger`'s pre-dispatch delay (before any chain exists to abort), the trigger's own `ride.status !== 'dispatching'` check (§2) or, failing that, `runSequentialChain`'s per-offer `isRideDispatching()` re-check ([`utils-server/dispatchChain.ts:224`](utils-server/dispatchChain.ts:224) call site in `index.ts`'s `isRideDispatching` dep) catches it before any offer is sent.

### Exact code shape
No new code beyond §1's status write and §2's re-check — this decision is a proof, not an implementation.

### Edge cases covered
- Rider cancels while a redispatch chain has an outstanding offer: `abortChain` resolves it `'cancelled'`, the offered driver gets `offer:lost`, the lead stays billed (ruling 8, unchanged).
- Rider cancels during the pre-dispatch delay, before any chain exists: `runRedispatchTrigger`'s status re-check no-ops; zero drivers ever billed for this attempt.
- Rider cancels in the narrow window between the delay ending and `registerChain` executing: `runSequentialChain`'s first-candidate `isRideDispatching()` check (which runs before the first offer, every time) catches it — self-healing, no gap.

### Edge cases explicitly NOT covered (and why)
None identified — this is the one critique item fully closed by composing two already-existing mechanisms; flagged in §11 only insofar as it depends on §2's "same `ride_id`" decision holding.

### Test cases that prove this
- `rider cancel while ride.status='dispatching' (post-redispatch, chain live) → abortChain called, pending driver receives offer:lost reason 'cancelled'`
- `rider cancel while ride.status='dispatching' (post-redispatch, chain not yet registered) → claim succeeds, subsequent runRedispatchTrigger no-ops on status check`

## 6. Decision — TD-15 crash recovery (critique item 6)

### Decision
Redispatch reuses the existing one-time, boot-only stuck-`dispatching` sweep in [`startup()`](utils-server/index.ts:1074) unmodified for v1; no new periodic scheduler job is added.

### Reasoning
The sweep's query (`status='dispatching' AND updated_at < now() - interval '60 seconds'`) doesn't distinguish a ride's dispatch origin, so a crash mid-redispatch is recovered identically to a crash mid-initial-dispatch the moment the process restarts — adding a *periodic* version of the same sweep would be using existing infrastructure (the scheduler job framework), not new infrastructure, but is deferred to keep this spec's blast radius to the 8 critique items; the brief's own test-harness notes anticipate this exact extraction as a follow-up.

### Exact code shape
No change. For traceability, the existing recovery code:
```ts
// utils-server/index.ts startup(), unmodified
const stuckRides = await db.select().from(rides).where(
  and(eq(rides.status, "dispatching"), sql`updated_at < now() - interval '60 seconds'`));
for (const stuck of stuckRides) dispatchRidePipeline(stuck).catch(...);
```

### Edge cases covered
- utils-server crashes mid-redispatch (any point after §1's status write, before a match): next restart's sweep re-enters `dispatchRidePipeline`, and `buildCandidateList`'s cumulative `dispatch_offers` exclusion (§3) prevents any double-billing.
- utils-server never crashes but a single redispatch trigger silently fails (e.g. the fire-and-forget internal HTTP call from `cancel+api.ts` times out because utils-server was transiently unreachable): **not** covered — the ride sits in `dispatching` until the next process restart. Recorded as an accepted gap in §11, not silently glossed over.

### Edge cases explicitly NOT covered (and why)
- Periodic (non-restart) recovery: deferred to a follow-up round per the brief's own suggestion ("the orchestrator can extract a `runStuckRideSweep` export as a follow-up") — out of scope for this spec to avoid inventing a scheduler job number without verifying the next free slot in `utils-server/scheduler.ts` against disk.

### Test cases that prove this
TD-15 behavior has no public function to call today (per the brief's own test-harness note) — this spec does not add one. **Recommended API surface for a follow-up round** (not built here): export `dispatchRidePipeline` and extract the sweep query into `runStuckDispatchSweep(staleSeconds: number): Promise<{ recovered: number }>` from `utils-server/index.ts`, so a future test can assert `recovered === 1` for a synthetic stuck-`dispatching` row without booting the HTTP/WS server.

## 7. Decision — Attempt tracking storage (critique item 7)

### Decision
`rides.redispatch_attempts` (existing `integer NOT NULL DEFAULT 0` column) is the sole counter, incremented once per driver-cancel-triggered redispatch, checked against a new `auto_redispatch_max_attempts` platform-config key (default `3`) **before** `canRedispatch` is decided.

### Reasoning
A DB column survives the exact crash TD-15 already accounts for, matching the critique's own reasoning for rejecting in-memory-only tracking; `rides.redispatch_started_at` (also already present) is retained as a timestamp of the *current* re-dispatch window's start but is not itself the bound — the bound is attempt count, per the brief's explicit instruction that `auto_redispatch_max_attempts` is the terminating condition.

### Exact code shape
```ts
// lib/platformConfig.ts — add to PLAN05_CONFIG_KEYS and DEFAULTS
'auto_redispatch_max_attempts', // add to the const array
auto_redispatch_max_attempts: '3', // add to DEFAULTS

// app/api/ride/[id]/cancel+api.ts — gate canRedispatch with the cap
const maxAttempts = await getPlan05Int('auto_redispatch_max_attempts', 3);
const attemptsExhausted = (ride.redispatch_attempts ?? 0) >= maxAttempts;
const canRedispatch = isDriverCancel && autoRedispatchEnabled && !ride.scheduled_at && !attemptsExhausted;
// newStatus: 'dispatching' when canRedispatch; 'expired' (not 'cancelled') when attemptsExhausted; else 'cancelled' (§ cross-cutting, below)
...
.set({
  status: newStatus,
  ...(canRedispatch ? { redispatch_started_at: new Date(), redispatch_attempts: sql`${rides.redispatch_attempts} + 1`, driver_id: null } : {}),
  ...
})
```

### Edge cases covered
- Concurrent double-increment: structurally impossible — only the single assigned driver can own the claim `UPDATE` for a matched ride (§1's reasoning), so there is exactly one writer of `redispatch_attempts` per attempt.
- Attempts counter surviving a crash between increment and the next driver's cancel: the column is committed in the same transaction as the status flip — no partial-write window.

### Edge cases explicitly NOT covered (and why)
- Resetting `redispatch_attempts` on eventual successful match: not needed — the counter's only consumer is the cap check on a ride still in an active dispatch/matched lifecycle; once a ride reaches `completed`/`cancelled`/`expired` it is terminal and the column is never read again.

### Test cases that prove this
- `driver cancel with redispatch_attempts=2, max=3 → canRedispatch true, redispatch_attempts becomes 3`
- `driver cancel with redispatch_attempts=3, max=3 → canRedispatch false, status set to 'expired' not 'cancelled'`
- `auto_redispatch_max_attempts absent from platform_config → getPlan05Int falls back to default 3`

## 8. Decision — Scheduled-ride interaction (critique item 8)

### Decision
Scheduled rides are excluded from auto-redispatch entirely — `!ride.scheduled_at` is one of the four `canRedispatch` conditions (§7).

### Reasoning
The re-land re-adds this condition to `cancel+api.ts` per §1's code shape (ruling 1, §11: the on-disk partial was reverted; the condition itself is exactly the brief's hard rule — "v1 rider-cancel-scheduled path emits a notification and waits; the platform does not auto-dispatch").

### Exact code shape
No change beyond §7's shape — existing condition: `const canRedispatch = isDriverCancel && autoRedispatchEnabled && !ride.scheduled_at && !attemptsExhausted;`. A scheduled ride's driver cancel falls through to the pre-existing `cancelled_by === 'driver'` branch, which sends the Phase G `ride:cancel_survey` notification — the rider is told, not auto-matched.

### Edge cases covered
- Scheduled ride, driver cancels close to `scheduled_at`: still excluded — no time-proximity exception exists or is proposed.

### Edge cases explicitly NOT covered (and why)
- Auto-redispatch for scheduled rides is explicitly v2 territory per the brief; not designed here at all, not even a stub.

### Test cases that prove this
- `driver cancel on a ride with scheduled_at set, auto_redispatch_enabled=true → canRedispatch false, status 'cancelled', ride:cancel_survey notification sent`

## 9. Wiring — Cross-cutting decisions

- **`auto_redispatch_max_attempts`**: new platform-config key, default `3`, read via `getPlan05Int` (§7) — the only new config key this spec introduces. `auto_redispatch_checkin_minutes` has zero readers anywhere in the codebase (before or after the revert); this spec does **not** consume it — it is reserved for a future rider check-in feature that is not part of R3.3's 8 critique items and is explicitly out of scope (§11). `auto_redispatch_delay_ms` (default `15000`) **is** consumed by this spec, as `deps.delayMs` in `runRedispatchTrigger` (§2).
- **File ownership**: `app/api/ride/[id]/cancel+api.ts` gains the attempt-cap gate (§7), the `!canRedispatch` fee-block gate (§1, Amendment 2), and one new field (`rider_user_id`) in its existing fire-and-forget POST to `/internal/ride/cancelled`. `utils-server/index.ts`'s `/internal/ride/cancelled` handler gains a call to the new `runRedispatchTrigger` (from the new `utils-server/redispatch.ts`) when `body.redispatch === true`, reading `body.rider_user_id`. `dispatchChain.ts`, `dispatch.ts`, `leadBilling.ts` are untouched, exactly as the brief requires.
- **AGENTS.md write-ownership matrix**: no update needed. `rides.status`/`redispatch_started_at`/`redispatch_attempts` writes stay inside `app/api/ride/[id]/cancel+api.ts`'s existing transaction (§1); `dispatchRidePipeline`'s own writes (via `leadBilling.ts`, `dispatchOffers` terminal-outcome stamps) are the same sole-writer paths every other dispatch already uses. No new writer is introduced to `call_ledger` or `dispatch_offers`.
- **Order of operations for the coding-model implementation**:
  1. Add `auto_redispatch_max_attempts` to `lib/platformConfig.ts` (§7).
  2. In `app/api/ride/[id]/cancel+api.ts` (§7): gate `canRedispatch` on the attempt cap and set `newStatus = 'expired'` on exhaustion; gate the entire cancellation-fee block — fee stamp, `createCancellationCreditInTx` compensation credit, rider deduction, `payment_event` write — on `!canRedispatch` (Amendment 2), so the redispatch branch writes zero fee events; add `rider_user_id` to the `/internal/ride/cancelled` POST body.
  3. Create `utils-server/redispatch.ts` with `runRedispatchTrigger` (§2), unit-testable in isolation.
  4. Wire `utils-server/index.ts`'s `/internal/ride/cancelled` handler to call it when `redispatch === true`, binding real deps (`db`-backed `getRide`, `dispatchRidePipeline` bound with `allowDowngrade=false`, `sendToRider`, `getPlan05Int('auto_redispatch_delay_ms', 15000)`).
  5. Write `tests/api/ride/auto-redispatch.test.ts` and `tests/utils-server/redispatch.test.ts` per §10.
- **Explicit out-of-scope for v1** (do not gold-plate):
  - Rider check-in / re-confirmation flow after N minutes of unsuccessful redispatch (the inert `auto_redispatch_checkin_minutes` key).
  - Scheduled-ride auto-redispatch.
  - A periodic (non-restart) TD-15 sweep for redispatch specifically (§6).
  - Any change to cancellation-fee or compensation-credit logic beyond the `!canRedispatch` gate itself (`evaluateCancellation`, `createCancellationCreditInTx` internals) — flagged, not touched (§11).
  - A dedicated WS event type beyond reusing `ride:status` (§4).

## 10. Test plan

**`tests/utils-server/redispatch.test.ts`** (new file — `utils-server/redispatch.ts` has no `db`/WS-server imports, so this needs only plain jest, no mock-chain harness):
- `describe('runRedispatchTrigger')`
  - `it('notifies the rider before the delay elapses')` — fake timers, assert `notifyRider` called pre-`advanceTimersByTime`.
  - `it('calls dispatchPipeline with the fresh ride row after the delay when still dispatching')` — mock `getRide` returns `{status:'dispatching', ...}`.
  - `it('does not call dispatchPipeline when the ride is no longer dispatching after the delay')` — mock `getRide` returns `{status:'cancelled'}`.
  - `it('does not call dispatchPipeline when getRide returns null')` — ride deleted/missing edge case.
  - `it('skips the delay entirely when delayMs is 0')`.
  - `it('does not call notifyRider when riderUserId is null')`.

**`tests/api/ride/auto-redispatch.test.ts`** (new file, mock-chain pattern per `tests/api/ride/pickup-move.test.ts`, importing the real `POST as cancelRide` from `app/api/ride/[id]/cancel+api.ts`, mocking `@/src/db`, `@/lib/auth`, `@/lib/notify`, `@/lib/platformConfig` exactly as that file does):
- `describe('driver cancel — auto-redispatch gating')`
  - `it('sets status dispatching, clears driver_id, stamps redispatch_started_at, increments redispatch_attempts when enabled and under cap')` — mock `getPlan05Int` (`auto_redispatch_max_attempts`→3), `getConfigValue` (`auto_redispatch_enabled`→'true'), ride with `redispatch_attempts: 1`; assert the `tx.update(rides).set(...)` predicate via rendered-where assertions (existing pattern).
  - `it('sets status expired (not cancelled) when redispatch_attempts >= max_attempts')`.
  - `it('sets status cancelled when auto_redispatch_enabled is false (legacy path unchanged)')`.
  - `it('sets status cancelled when ride.scheduled_at is set, regardless of auto_redispatch_enabled')`.
  - `it('posts to /internal/ride/cancelled with redispatch:true and rider_user_id set, on successful redispatch gating')` — assert the fetch body shape (mock global `fetch`).
  - `it('sends ride:driver_cancelled push notification on successful redispatch gating, ride:cancel_survey on exhausted/legacy driver-cancel paths')`.
  - `it('writes zero fee events when canRedispatch is true (Amendment 2)')` — mock the cancel route's fee dependencies (`evaluateCancellation` / `createCancellationCreditInTx` / the rider-deduction + `payment_event` writers); assert none are called when the redispatch gate succeeds; assert the fee block **is** invoked on the `canRedispatch=false` legacy driver-cancel path so the gate is proven bidirectional (no regression of the dormant policy path).

**Chain-lifecycle coverage** (per the brief: real `dispatchChain.ts` exports, not mocked) belongs in a follow-up round once `dispatchRidePipeline` is extracted/exported per §6's recommendation — this spec's §2/§5 proofs rely on `dispatchChain.ts`'s *existing*, already-real behavior (`registerChain`/`abortChain` same-`ride_id` semantics) and do not require new chain-level tests to be written now; flagging this as deferred rather than silently skipped.

**New test pattern needed, flagged per instructions**: none for `utils-server/redispatch.ts` (plain function, no DB/WS import) or `auto-redispatch.test.ts` (existing mock-chain pattern suffices). A genuinely new pattern — importing `utils-server/index.ts` under jest — remains impossible and is not attempted; see §6's recommended `runStuckDispatchSweep` extraction as the eventual unlock.

## 11. Risks and explicit rejections

- **State divergence — RULED (ruling 1, orchestrator verdict 2026-09-03), RESOLVED.** The partial REST-route half in `app/api/ride/[id]/cancel+api.ts` was the ride-hailing lane's in-flight work that landed via another lane's wholesale commit (`fea4dea`); the earlier revert round scoped only the WS-server files and missed it — an orchestrator error, not a prior interrupted round. Resolution: it is being fully reverted to clean-absence before any tests are written. Consequently, every code shape in §1/§7/§8 of this spec is "the design the re-land will rebuild," not ratified on-disk code — the on-disk partial must be treated as deleted from all reasoning, and the coding model must not assume any of it survives the revert. (The §2 same-`ride_id` proof and §5 concurrency proof were independently re-checked against the chain mechanics by the orchestrator and hold.)
- **Cancellation-fee interaction — RULED (ruling 2, Amendment 2), now IN scope for the re-land.** Verified: `evaluateCancellation` filters by `canceller_role` and no driver-cancel policies are seeded today (the fee path is dormant), BUT the fee stamp / compensation credit / rider deduction / `payment_event` block in the cancel route runs regardless of the redispatch branch — so an admin-created driver-cancel policy would charge the rider a cancellation fee and compensate the departing driver on a ride that then completes. Ruling: the entire fee block gates on `!canRedispatch`; a redispatching ride writes no fee events. Folded into §1's code shape, §9 step 2, and §10's zero-fee-writes test. The dormant-policy nuance is preserved by the bidirectional assertion in §10 (fee block still runs on the legacy path).
- **Transient internal-call failure gap — ACCEPTED for v1 as documented (ruling 3).** If the fire-and-forget POST from `cancel+api.ts` to `/internal/ride/cancelled` fails (utils-server transiently down) but the process never crashes, the ride is stuck in `dispatching` until the next deploy/restart. A periodic stuck-`dispatching` sweep is scheduler-ADR Phase 3 territory (admission control, four declared properties), explicitly ruled NOT this spec; §6's boot-only sweep and the follow-up `runStuckDispatchSweep` extraction recommendation stand unchanged.
- **`redispatch_started_at` is stored but has no v1 consumer** beyond being a timestamp of record — nothing reads it back (the attempt *count*, not elapsed time, is the bound, per §7). This is intentional, not an oversight: it's provisioned for the explicitly-out-of-scope check-in feature.
- **Rejected: reusing the aborted chain object instead of a new `dispatchRidePipeline` call.** Considered and rejected — `runSequentialChain`'s `finally` block always deletes the chain on any terminal outcome, so nothing exists to "resume"; re-entering the same public pipeline function is simpler and reuses 100% existing code (§2).
- **Rejected: a dedicated `ride:driver_redispatch_started` WS event type.** Considered; rejected in favor of reusing `ride:status`/`status:'dispatching'` to avoid new client-side wiring — noted as a v2 nicety in §4/§9, not a hard requirement.
