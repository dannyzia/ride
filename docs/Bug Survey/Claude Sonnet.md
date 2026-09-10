# RIDE — Independent Possible-Bug Survey

*Theoretical failure-mode catalogue. No codebase access was used to produce this document — every entry describes a **possible** or **plausible** bug based on architectural reasoning about the described system, not a confirmed defect. All findings must be verified against the actual implementation before any engineering action is taken. Hedging language is used throughout intentionally.*

---

## How to read this document

Each bug entry uses this compact schema (all fields from the brief are preserved, just laid out vertically instead of as a wide table for readability):

```
### BUG-<MODULE>-<NUM> — <one-line title>
Category:      ...
Module:        ...
Possible bug:  ...
Trigger:       ...
Why plausible: ...
Impact:        ...
Severity:      CRITICAL | HIGH | MEDIUM | LOW
Likelihood:    VERY HIGH | HIGH | MEDIUM | LOW | VERY LOW
Detection:     VERY HARD | HARD | MEDIUM | EASY | VERY EASY
Affected:      ...
```

Sections follow the "Key Domains" structure from the brief. Financial bugs receive disproportionate coverage per instructions.

---

## SECTION 1 — CORE (Auth, Lifecycle, Dispatch, Cancellation, PIN, Scheduled Rides)

### BUG-AUTH-001 — Session token reuse after role change
Category: Security/Authorization
Module: Auth / Session
Possible bug: A user's session token could remain valid with old role/permission claims after an admin changes their role (e.g., demotes a driver, revokes fleet-manager access), if token validation checks a cached claim rather than re-reading current role each request.
Trigger: Admin revokes a user's elevated role while the user has an active session/app instance; user continues issuing requests with the old token.
Why plausible: Systems commonly cache authorization claims in JWTs or session objects for performance, and invalidation-on-role-change is easy to omit.
Impact: Privilege escalation window; a demoted user (or fleet driver removed from a tenant) could act with stale permissions until token expiry.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Auth, Fleet, Admin

### BUG-AUTH-002 — Multi-tenancy cross-tenant data leak via shared driver ID
Category: Authorization / Multi-tenancy
Module: Fleet / Auth
Possible bug: A driver associated with multiple fleet tenants could have a request scoped incorrectly, returning or modifying data belonging to a different tenant than intended if tenant context is inferred from the driver ID alone rather than an explicit tenant-scoped session.
Trigger: Driver switches between two fleet operators' apps/accounts in the same underlying driver record.
Why plausible: Multi-tenant systems that share a driver identity across tenants are prone to context-bleed if tenant_id isn't enforced at every query boundary.
Impact: Tenant A sees Tenant B's driver stats, vehicle assignment, or earnings; potential data-privacy/compliance issue.
Severity: HIGH
Likelihood: LOW
Detection: HARD
Affected: Fleet, Admin, Auth

### BUG-OTP-003 — OTP replay / reuse window
Category: Security
Module: Auth / OTP
Possible bug: An OTP could be accepted a second time within its validity window if the "used" flag is set asynchronously or the check-and-consume isn't atomic.
Trigger: User (or attacker with a leaked OTP) submits the same OTP twice in rapid succession before the first request commits the "consumed" state.
Why plausible: Classic read-then-write race on a single-use token; common when OTP validation and marking-as-used are separate statements/transactions.
Impact: Duplicate login/verification, or duplicate ride confirmation triggered by a single OTP.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Auth, Ride-hailing

### BUG-AVAIL-004 — Driver availability toggle race with dispatch assignment
Category: Concurrency / State Machine
Module: Ride-hailing / Driver Availability
Possible bug: A driver could go offline at the exact moment dispatch assigns them a ride, resulting in a ride assigned to an offline driver who never receives the notification.
Trigger: Driver taps "Go Offline" while a dispatch cycle has already selected them as the best match but not yet committed/notified.
Why plausible: Availability state and matching/assignment are likely separate services/tables; without a lock or optimistic-concurrency check at commit time, a stale "available" read can be acted on after the fact.
Impact: Ride stuck in "searching"/"assigned" limbo, rider experiences a phantom match, requires timeout/re-dispatch.
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Ride-hailing/Dispatch, Notifications

### BUG-DISPATCH-005 — Double assignment from concurrent dispatch cycles
Category: Concurrency
Module: Ride-hailing / Dispatch
Possible bug: Two overlapping dispatch cycles (e.g., a retry after perceived timeout plus the original cycle) could both select and assign the same driver to two different rides simultaneously.
Trigger: Dispatch service times out waiting for a driver-selection sub-call, retries the entire cycle, but the original cycle also completes and commits an assignment.
Why plausible: Distributed dispatch systems often use best-effort matching without a global lock per driver; retries without idempotency keys are a known source of duplicate side effects.
Impact: Driver receives two ride requests, accepts one, the other rider is left with a "confirmed" driver who never arrives.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Dispatch, Notifications, Rider app

### BUG-DISPATCH-006 — H3 cell boundary causes eligible driver exclusion
Category: Functional / Location
Module: Ride-hailing / Matching
Possible bug: A driver physically closer to the rider than others could be excluded from the candidate pool if their GPS coordinate falls just across an H3 cell boundary from the rider's cell and the search radius doesn't include adjacent rings correctly.
Trigger: Rider and nearest driver sit on opposite sides of an H3 cell edge; ring-expansion logic under- or over-shoots.
Why plausible: H3 ring search requires deliberate k-ring expansion; off-by-one errors in ring radius are common and easy to miss in testing since most requests aren't near a boundary.
Impact: Longer ETA, suboptimal matches, occasional "no drivers found" despite nearby supply.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Dispatch/Matching, Location services

### BUG-DISPATCH-007 — Auto-accept race with manual driver decline
Category: Concurrency / State Machine
Module: Ride-hailing / Dispatch
Possible bug: If a driver has auto-accept enabled but also manually taps "decline" within the same offer window, both actions could be processed, leaving the ride simultaneously accepted and declined depending on processing order.
Trigger: Auto-accept timer fires server-side at nearly the same instant the driver's manual decline reaches the server.
Why plausible: Auto-accept is likely a scheduled/background action while manual decline is a synchronous API call; no mutual exclusion guarantees ordering.
Impact: Ride shows "accepted" to rider while driver app shows "declined"/removed, or vice versa; driver forced into a ride they tried to reject.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Dispatch, Driver app, Rider app

### BUG-DISPATCH-008 — Auto-redispatch storms after mass driver disconnect
Category: Distributed/Async
Module: Ride-hailing / Dispatch
Possible bug: A network blip affecting many drivers in one zone could trigger simultaneous auto-redispatch for many rides at once, overwhelming the matching service and causing cascading timeouts.
Trigger: A cell-tower or ISP outage drops many drivers' connections at once; all affected rides hit "driver unreachable" simultaneously.
Why plausible: Auto-redispatch is typically triggered independently per ride without global rate-limiting or backpressure awareness.
Impact: Matching service overload, degraded ETAs platform-wide, further driver drop-off due to slow responses.
Severity: HIGH
Likelihood: LOW
Detection: MEDIUM
Affected: Dispatch, Infrastructure, Notifications

### BUG-CANCEL-009 — Simultaneous rider and driver cancellation
Category: Concurrency / State Machine
Module: Ride-hailing / Cancellation
Possible bug: If rider and driver both cancel at nearly the same moment, the system could apply only one party's cancellation fee logic (or neither, or both), depending on which request wins the race.
Trigger: Driver cancels due to rider no-show at the same second the rider cancels because the driver "isn't moving."
Why plausible: Cancellation fee attribution depends on knowing "who cancelled and why," which requires a single source of truth for ride state; concurrent writes without locking can produce inconsistent attribution.
Impact: Wrong party charged/credited a cancellation fee; driver not compensated for a legitimate no-show, or rider wrongly charged.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Ride-hailing, Financial/Fare, Wallet

### BUG-CANCEL-010 — Cancellation fee charged after free-cancellation window due to clock skew
Category: Business Logic / Time
Module: Ride-hailing / Cancellation
Possible bug: If the free-cancellation timer is evaluated using server time at request-receipt versus a client-reported timestamp, a rider cancelling right at the boundary could be incorrectly charged (or incorrectly not charged).
Trigger: Rider cancels at second 179 of a 180-second free window, but network latency delays the server's receipt to second 181.
Why plausible: Boundary conditions on timers are a classic off-by-a-few-seconds bug, especially where the "cancel time" could be measured client-side vs. server-side inconsistently.
Impact: Small but frequent financial disputes; support ticket volume.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Ride-hailing, Financial/Fare

### BUG-NOSHOW-011 — No-show marked despite rider being at pickup (GPS drift)
Category: Functional / Location
Module: Ride-hailing / No-show
Possible bug: GPS drift or a stale location fix could place the rider's device outside the "arrival geofence" the driver uses to justify a no-show claim, resulting in an incorrect no-show fee even though the rider was physically present.
Trigger: Rider's phone reports a location 150m off due to urban canyon GPS multipath; driver waits and marks no-show.
Why plausible: GPS accuracy in dense urban Bangladesh environments (e.g., Dhaka high-rises) is a known real-world issue; geofence radius may not account for typical drift.
Impact: Wrongly charged no-show fee, rider dispute, driver trust erosion if reversed.
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Ride-hailing, Location, Financial

### BUG-PIN-012 — Ride PIN validated against stale cached PIN after reassignment
Category: State Machine / Concurrency
Module: Ride-hailing / PIN verification
Possible bug: If a ride is reassigned to a new driver (after original driver cancels) but the rider's app or the new driver's app caches the original PIN, PIN verification could fail for a legitimate ride start, or worse, succeed against a stale value shared with the wrong driver.
Trigger: Reassignment happens seconds before rider reads PIN aloud to arriving (new) driver; driver app hasn't refreshed ride details.
Why plausible: PIN is presumably generated once per ride and could be considered immutable, but reassignment is a significant enough event that regenerating or re-syncing it is easy to overlook.
Impact: Ride cannot start (support burden) or, in a worse case, a stale PIN known to the original (cancelled) driver still validates.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Ride-hailing, Security

### BUG-MULTISTOP_013 — Fare recalculation skipped on mid-ride stop removal
Category: Business Logic
Module: Ride-hailing / Multi-stop
Possible bug: If a rider removes a planned stop mid-ride, the fare engine could continue using the original route distance/time estimate instead of recalculating, over- or under-charging.
Trigger: Rider has a 3-stop ride, cancels stop 2 after stop 1 but before stop 3; fare was quoted for the full 3-stop route.
Why plausible: Fare quotes are often computed once upfront; a live route-mutation event may not be wired to trigger a live fare re-quote.
Impact: Rider overcharged for an unused stop, or driver undercompensated for extra distance from a stop reordering.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Ride-hailing, Financial/Fare

### BUG-SCHED_014 — Scheduled ride double-dispatch at trigger time
Category: Concurrency / Scheduler
Module: Ride-hailing / Scheduled rides
Possible bug: A scheduled-ride trigger job and a manual "dispatch now" retry (e.g., support tooling or a client resend) could both fire dispatch for the same scheduled ride at trigger time, creating two concurrent search processes.
Trigger: Scheduler cron fires at T-10min, but a backlog delay causes it to also fire a "catch-up" pass for the same ride a few minutes later before the first completes.
Why plausible: Scheduled-job catch-up/backlog-processing logic is a common source of duplicate triggers if there's no distributed lock per ride.
Impact: Two drivers offered/assigned the same scheduled ride; rider sees two different drivers en route.
Severity: HIGH
Likelihood: LOW
Detection: HARD
Affected: Scheduler, Dispatch, Notifications

### BUG-SCHED_015 — Scheduled ride silently dropped across midnight/date boundary
Category: Time / Scheduler
Module: Ride-hailing / Scheduled rides
Possible bug: A ride scheduled for just after midnight Dhaka time could be stored/queried using UTC date boundaries, causing the scheduler's "rides due today" query to miss it if UTC and Dhaka time fall on different calendar dates.
Trigger: Rider schedules a ride for 12:30 AM Dhaka time (which is 18:30 UTC the previous day); a naive "WHERE date = today" style batch job (conceptually) misses it.
Why plausible: UTC+6 offset for Bangladesh means local midnight doesn't align with UTC midnight; any date-only (not datetime) partitioning logic is a classic source of this bug.
Impact: Scheduled ride never dispatched; rider left without transportation at the scheduled time.
Severity: CRITICAL
Likelihood: MEDIUM
Detection: HARD
Affected: Scheduler, Ride-hailing, Notifications

### BUG-SESSION_016 — Driver session considered active on two devices simultaneously
Category: Concurrency / State Machine
Module: Auth / Driver session
Possible bug: A driver logging into a new device (e.g., replacement phone) without proper session invalidation could remain "logged in and available" on the old device too, causing dispatch to offer rides to a device the driver no longer uses.
Trigger: Driver's old phone is lost/broken; they log in on a new phone without formally logging out of the old one; old app resumes background location updates when reconnected to network later.
Why plausible: Single-session enforcement requires explicit server-side session eviction; without it, stale device tokens can remain "live."
Impact: Ride offered to a device the driver can't act on; missed rides, rider wait-time inflation.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Auth, Dispatch, Notifications

### BUG-CANCEL_017 — Rider cancellation fee waived twice via duplicate "goodwill credit" requests
Category: Business Logic / Idempotency
Module: Ride-hailing / Support tooling
Possible bug: A support agent (or automated goodwill flow) retrying a "waive cancellation fee" action after a slow response could apply the waiver/credit twice.
Trigger: Admin UI times out on a waiver request, agent clicks "Retry"; both requests actually succeeded server-side.
Why plausible: Admin action endpoints are often not idempotent by default, especially those wrapping a "credit wallet + update fee status" combo.
Impact: Rider wallet credited twice for a single cancellation fee waiver.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Admin, Wallet, Financial

### BUG-LIFECYCLE_018 — Completed ride reopened by delayed location update
Category: State Machine / Distributed
Module: Ride-hailing / Ride lifecycle
Possible bug: A driver's location-update event queued before ride completion but delivered afterward could be processed by logic that assumes "still in-ride," inadvertently reverting or duplicating ride state (e.g., re-triggering "near destination" notifications after the ride is already marked complete).
Trigger: Poor connectivity delays a location ping by tens of seconds; ride completes via a separate faster path; the stale ping arrives and is processed against the now-completed ride.
Why plausible: Out-of-order event delivery is inherent to any system using independent event streams (location vs. ride-state) without sequence numbers or state guards.
Impact: Spurious notifications, potential fare/ETA recalculation against a closed ride, log/analytics corruption.
Severity: LOW
Likelihood: HIGH
Detection: HARD
Affected: Ride-hailing, Location, Notifications

---

## SECTION 2 — FINANCIAL (Fare, Wallet, Ledger, Payments, Refunds, Tax, Payouts)

*(Given disproportionate financial-risk weighting per the brief.)*

### BUG-FARE-019 — Surge multiplier applied using stale zone demand snapshot
Category: Business Logic
Module: Financial / Fare
Possible bug: Fare could be calculated using a cached surge multiplier for a zone that has since de-surged (or vice versa), if surge value is read from a cache with a longer TTL than the demand-recalculation interval.
Trigger: Demand spikes and recedes within a cache-refresh window; a ride requested at the tail end of the spike is quoted the old, higher multiplier.
Why plausible: Real-time surge pricing is expensive to compute per-request, so caching with a refresh interval is a natural design that can lag actual demand.
Impact: Riders overcharged (or undercharged) relative to "true" real-time demand; reputational/financial exposure at scale.
Severity: MEDIUM
Likelihood: HIGH
Detection: HARD
Affected: Financial/Fare, Location/Demand

### BUG-FARE-020 — Quote-to-settlement mismatch after route deviation
Category: Business Logic
Module: Financial / Fare
Possible bug: If actual driven distance/route diverges from the originally quoted route (traffic diversion, road closure, rider-directed detour) but settlement logic re-derives fare from a route-matching algorithm expecting the original path, the final charge could be wrong in either direction.
Trigger: Driver takes a longer route due to road closure; settlement engine flags/ignores the deviation inconsistently.
Why plausible: Any fare engine using route-matching or "expected vs actual" heuristics is vulnerable to real-world route changes.
Impact: Rider overcharged for a driver-caused detour, or driver undercompensated for a legitimate longer route; dispute volume.
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Financial/Fare, Ride-hailing

### BUG-FARE-021 — Waiting-charge timer double-counts paused/resumed waiting
Category: Business Logic / State Machine
Module: Financial / Fare
Possible bug: If a waiting-charge timer can be paused (e.g., rider messages "coming in 2 min") and resumed, a race between the pause and resume events (or a missed resume event) could cause double-counted or never-ending waiting time.
Trigger: Driver taps "pause wait timer," then network delay causes the "resume" tap to be processed out of order or lost.
Why plausible: Timer pause/resume state machines are a common source of double-counting when events can arrive out of order or be dropped silently.
Impact: Rider overcharged for waiting time that was already paused/refunded conceptually, or driver undercompensated.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Fare, Ride-hailing

### BUG-TIP-022 — Tip applied to wrong ride after rapid sequential rides with same driver
Category: Functional
Module: Financial / Tips
Possible bug: If a rider takes two rides back-to-back with the same driver and tips shortly after the second ride completes, a tip-attribution query that matches "most recent completed ride with this driver" using a lax time window could misattribute the tip to the first ride.
Trigger: Rider completes ride A, immediately books ride B with same driver, tips after B; tip-matching logic resolves to A due to a race or ambiguous lookup key.
Why plausible: "Most recent ride with driver X" is an easy but fragile matching heuristic if the tip flow doesn't carry an explicit ride ID end-to-end.
Impact: Tip credited to the wrong ride's earnings record; driver payout misattribution, though total driver earnings may still be correct in aggregate (audit-trail issue).
Severity: LOW
Likelihood: LOW
Detection: HARD
Affected: Financial/Tips, Driver earnings

### BUG-PROMO-023 — Promotion code redeemable multiple times via concurrent requests
Category: Concurrency / Fraud
Module: Financial / Promotions
Possible bug: A single-use promo code could be redeemed more than once by a user if two redemption requests are sent concurrently (e.g., double-tap, or two devices) and the "already used" check-and-set isn't atomic.
Trigger: User double-taps "Apply Promo" due to UI lag; both requests pass the "not yet used" check before either commits the "used" flag.
Why plausible: Classic TOCTOU (time-of-check-to-time-of-use) race on a uniqueness constraint that isn't enforced by a database-level unique constraint or atomic increment.
Impact: Promotional discount/credit applied multiple times; direct financial loss at scale if the code is popular.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Promotions, Wallet

### BUG-PROMO-024 — Referral reward granted for self-referral via multiple accounts on shared device/payment method
Category: Fraud
Module: Financial / Referral
Possible bug: If referral-eligibility checks only dedupe on phone number or device ID independently (not both, and not payment instrument), a user could create multiple accounts with different SIMs on the same device (or same SIM in different devices) to farm referral rewards.
Trigger: User buys cheap SIM cards, registers multiple "new" accounts referred by their main account, cashes out multiple sign-up + referral bonuses.
Why plausible: Fraud-prevention dedup keys are frequently incomplete (missing device fingerprint + payment method cross-checks), especially in emerging-market ride platforms with SIM-based identity.
Impact: Direct financial loss from fraudulent referral payouts at scale.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Financial/Promotions, Fraud/Trust & Safety

### BUG-PASS-025 — Ride pass usage counter not decremented on failed-but-charged ride
Category: State Machine / Financial
Module: Financial / Passes
Possible bug: If a ride pass entitlement is consumed (counter decremented) at ride-request time but the ride subsequently fails to complete (e.g., driver cancels, no match found), the pass usage might not be restored, effectively charging the rider a pass credit for a ride that never happened.
Trigger: Rider uses ride-pass credit to book, driver cancels before pickup, no successful re-dispatch within timeout, ride is voided — but the pass counter isn't rolled back.
Why plausible: Consuming an entitlement "optimistically" at request time is common for UX responsiveness, but the compensating rollback on failure paths is easy to miss, especially across multiple failure branches (cancel, timeout, no-driver-found).
Impact: Rider loses a paid pass ride for nothing; support/refund burden; reputational damage.
Severity: HIGH
Likelihood: HIGH
Detection: MEDIUM
Affected: Financial/Passes, Ride-hailing

### BUG-WALLET-026 — Wallet balance and ledger diverge after concurrent top-up + debit
Category: Concurrency / Financial
Module: Financial / Wallet & Ledger
Possible bug: A wallet top-up (credit) and a simultaneous ride-fare debit could both read the pre-transaction balance and write back independently, causing the wallet's cached/denormalized balance field to diverge from the sum of ledger entries (lost update problem).
Trigger: User tops up wallet via payment gateway callback at the same moment a ride fare is auto-debited from the wallet.
Why plausible: If wallet balance is stored as a mutable column updated via read-modify-write rather than derived strictly from the ledger (or updated via atomic increment/decrement), concurrent writers can lose an update.
Impact: Wallet balance shown to user doesn't match actual entitlement; could allow spending beyond true balance or incorrectly block legitimate spending.
Severity: CRITICAL
Likelihood: MEDIUM
Detection: HARD
Affected: Financial/Wallet, Ledger, Accounting

### BUG-WALLET-027 — Duplicate wallet top-up credit from payment gateway webhook retry
Category: Idempotency / Distributed
Module: Financial / Payment callbacks
Possible bug: A payment gateway that retries webhook delivery (per its own retry policy) on a slow or timed-out acknowledgment could cause the platform to credit the wallet twice for a single successful payment if the webhook handler isn't idempotent on the gateway's transaction ID.
Trigger: Platform's webhook endpoint takes >X seconds to respond (e.g., due to load), gateway times out and retries the same webhook; both are processed as new credits.
Why plausible: This is one of the most common real-world payment bugs; webhook idempotency requires storing and checking a unique gateway transaction/event ID before crediting, which is easy to omit under time pressure.
Impact: Direct financial loss (free money credited to users); reconciliation nightmare against payment gateway settlement reports.
Severity: CRITICAL
Likelihood: HIGH
Detection: MEDIUM
Affected: Financial/Wallet, Payment, Accounting

### BUG-WALLET-028 — Wallet withdrawal processed despite insufficient balance due to race with pending debit
Category: Concurrency / Financial
Module: Financial / Wallet
Possible bug: A withdrawal request and a ride-fare debit initiated near-simultaneously could both pass a "sufficient balance" check against the same stale balance snapshot, allowing the wallet to go negative (or the platform to pay out more than available).
Trigger: Driver requests payout of full earnings balance at the same moment a new ride fare/commission debit posts against that balance.
Why plausible: "Check balance, then debit" is not atomic unless implemented with proper row-locking or compare-and-swap; a naive implementation is vulnerable.
Impact: Negative balance, over-payout, financial loss for platform; potential downstream accounting break.
Severity: CRITICAL
Likelihood: MEDIUM
Detection: HARD
Affected: Financial/Wallet, Payouts, Accounting

### BUG-REFUND-029 — Double refund from duplicate cancellation events
Category: Idempotency
Module: Financial / Refunds
Possible bug: If a ride cancellation triggers a refund workflow and the cancellation event is emitted more than once (e.g., from both a user-facing API call and a reconciliation job that independently detects "ride cancelled, payment captured"), the refund could be issued twice.
Trigger: Cancellation API succeeds and emits an event; a nightly reconciliation job also flags the same ride as "cancelled with captured payment, needs refund" and issues a second refund.
Why plausible: Multiple independent triggers for the same compensating action, without a single source-of-truth refund-status flag checked atomically before issuing, is a common pattern that leads to duplicate remediation.
Impact: Rider refunded twice; direct financial loss.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Refunds, Ledger, Accounting

### BUG-REFUND-030 — Refund amount exceeds original charge after promo was applied
Category: Business Logic
Module: Financial / Refunds
Possible bug: If a refund is calculated as "full fare" without accounting for a promotion/discount that was applied at charge time, the refunded amount could exceed what the rider actually paid.
Trigger: Rider pays a discounted fare (promo applied), then requests a refund for a service issue; refund logic uses the pre-discount fare as the base.
Why plausible: Refund and charge logic are often implemented separately (different code paths/times), so keeping them in sync on "what was actually collected" requires explicit care.
Impact: Rider refunded more than they paid; direct financial loss; also breaks accounting reconciliation (refund > payment on the ledger entry).
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Refunds, Promotions, Accounting

### BUG-REFUND-031 — Refund issued to wrong payment method after user changed default method
Category: Functional
Module: Financial / Refunds
Possible bug: If a rider changes their default payment method between the original ride and a later refund, the refund could be routed to the currently-default method instead of the original charge method (or vice versa, fail to route to a since-removed card).
Trigger: Rider pays via Card A, later sets Card B as default, then a delayed refund (e.g., driver-side dispute resolved days later) is issued.
Why plausible: Refund routing logic might reference "user's payment method" generically instead of the specific instrument used for the original transaction.
Impact: Refund sent to the wrong destination, or failed refund to a removed/expired card, requiring manual intervention.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Refunds, Payment

### BUG-TAX-032 — Tax computed on gross fare instead of net fare after discount
Category: Business Logic / Tax
Module: Financial / Tax
Possible bug: Applicable tax (e.g., VAT) could be calculated on the pre-discount fare rather than the actual amount paid, resulting in over-collection of tax relative to the true taxable amount (or under-collection if computed the other way when it shouldn't be).
Trigger: Any ride with an active promotion/discount that is processed through a tax calculation step referencing the base fare field instead of the final payable amount.
Why plausible: Tax rules frequently get bolted onto fare-calculation pipelines after the fact, and it's easy to compute tax against the wrong intermediate value in a multi-step fare pipeline (base → discount → surge → tax → total).
Impact: Regulatory/compliance risk (incorrect tax remittance), plus rider-facing over/undercharging.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Financial/Tax, Accounting, Compliance

### BUG-LEDGER-033 — Double-entry ledger imbalance from partial transaction failure
Category: Distributed/Financial
Module: Financial / Ledger
Possible bug: If a financial transaction requires writing two ledger entries (debit one account, credit another) as separate statements rather than a single atomic transaction, a failure between the two writes could leave the ledger unbalanced.
Trigger: Database connection drops or a service crashes after writing the debit entry for a driver payout but before writing the corresponding credit entry to the platform's payable account.
Why plausible: True double-entry integrity requires both legs of a transaction to commit atomically; any implementation using two separate write calls (even to the same DB) without a wrapping transaction is at risk, especially across service boundaries (e.g., Ledger service called from Payment service).
Impact: Ledger no longer balances; financial reporting/accounting reconciliation breaks; potential for unnoticed fund leakage.
Severity: CRITICAL
Likelihood: LOW
Detection: VERY HARD
Affected: Ledger, Accounting, Financial/Payouts

### BUG-EARNINGS-034 — Driver earnings computed before platform commission change takes effect, applied retroactively
Category: Business Logic / Config
Module: Financial / Driver earnings
Possible bug: If commission-rate changes are applied via a config/feature-flag update that isn't versioned per-ride, a batch payout job running after the change could recompute earnings for already-completed rides using the new rate instead of the rate in effect at ride time.
Trigger: Admin updates commission from 20% to 25% mid-day; nightly payout batch recalculates the day's earnings using the new rate for rides completed before the change.
Why plausible: Storing "current commission rate" as a single mutable config value instead of snapshotting the rate at transaction time is a common shortcut that breaks under any rate change.
Impact: Drivers underpaid (or platform undercharged) for rides completed under the old rate; large-scale, hard-to-detect financial distortion; erodes driver trust.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Financial/Earnings, Payouts, Config/Feature flags

### BUG-PAYOUT-035 — Driver payout batch processes a driver twice due to pagination bug under concurrent writes
Category: Distributed/Batch
Module: Financial / Payouts
Possible bug: A payout batch job paginating through "drivers with pending earnings" could process the same driver twice if new pending-earnings records are inserted for that driver between pages, shifting the pagination offset and causing an overlap.
Trigger: Offset-based pagination on a mutable table; new ride-completion earnings are inserted mid-batch-run, shifting row positions.
Why plausible: Offset/limit pagination is not stable against concurrent inserts; without a keyset/cursor-based approach or a fixed snapshot, double-processing is a known class of bug in batch financial jobs.
Impact: Driver paid twice for the same earnings; direct financial loss at potentially large scale (systemic, not per-incident).
Severity: CRITICAL
Likelihood: LOW
Detection: VERY HARD
Affected: Financial/Payouts, Scheduler/Batch jobs

### BUG-PAYOUT-036 — Payout sent for earnings later reversed by a chargeback
Category: Business Logic / Financial
Module: Financial / Payouts, Chargebacks
Possible bug: If driver payout batches run on a faster cadence than payment-gateway chargeback windows, a driver could be paid out for a ride whose payment is later reversed via chargeback, with no clawback mechanism.
Trigger: Rider disputes a card charge with their bank days after the ride; payout already occurred before the chargeback was known.
Why plausible: Payout timing is typically optimized for driver satisfaction (fast payouts), which inherently conflicts with payment finality windows; without a reserve/holdback policy, this exposure is structural.
Impact: Platform absorbs the loss without recovering from the driver (or attempts clawback, damaging driver trust); potential negative driver balance.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Payouts, Payment, Accounting

### BUG-CALLPKG-037 — Call/SMS package minutes not decremented atomically across concurrent calls
Category: Concurrency
Module: Financial / Call packages
Possible bug: If a rider/driver call-masking package has a usage cap (minutes or call count) and two calls are initiated concurrently (e.g., call + retry after a dropped connection), both could pass a "quota remaining" check based on the same stale read.
Trigger: Call drops immediately after connecting and the app auto-retries; both the original and retry call sessions decrement quota independently but were authorized against the same pre-check.
Why plausible: Usage-quota checks are frequently implemented as read-then-decrement rather than atomic decrement-with-floor.
Impact: Quota over-consumption beyond what was purchased; minor financial leakage, moderate support burden.
Severity: LOW
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Call packages, Telephony integration

### BUG-CURRENCY-038 — Paisa/Taka unit mismatch causes 100x fare error
Category: Functional / Units
Module: Financial / Fare, Config
Possible bug: A value stored in paisa (smallest unit) could be misinterpreted as Taka (or vice versa) at a service boundary (e.g., between fare-calculation service and payment-gateway integration), resulting in a fare that is off by a factor of 100.
Trigger: A new fare component (e.g., a new fee type, or a new promo discount amount) is configured by an admin without clarity on unit convention, or a new microservice integration assumes the wrong unit.
Why plausible: This is one of the most common integration bugs in fintech-adjacent systems, precisely the kind the brief calls out ("do not assume integer-paisa storage eliminates bugs") — unit mismatches at boundaries are a structural risk regardless of internal storage precision.
Impact: Massive overcharge or undercharge (e.g., BDT 5 charged as BDT 500, or 50000); could cause large-scale financial and reputational damage if it reaches production undetected even briefly.
Severity: CRITICAL
Likelihood: LOW
Detection: EASY (once it occurs, very visible) but VERY HARD to catch pre-emptively via testing alone
Affected: Financial/Fare, Payment, Config

### BUG-COUPON-039 — Coupon stacking allows compounding multiple "single-use" discounts
Category: Business Logic / Fraud
Module: Financial / Promotions
Possible bug: If discount application logic checks eligibility for each coupon independently without checking whether another coupon has already been applied to the same fare component, two coupons intended to be mutually exclusive could both apply, resulting in an unintended compounded discount (or a negative fare).
Trigger: User applies a "first ride free" coupon and a separate "10% off" campaign coupon that isn't flagged as mutually exclusive with sign-up offers.
Why plausible: Coupon/promotion systems tend to grow additively (each new campaign added independently) without centralized stacking rules, especially as marketing campaigns multiply.
Impact: Fare reduced to zero or negative (potentially triggering an erroneous credit to the rider); direct financial loss.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Financial/Promotions, Fare

### BUG-VENDOR_040 — Marketplace vendor payout miscalculated when order is partially refunded
Category: Business Logic / Financial
Module: Financial / Marketplace vendor earnings
Possible bug: A partial refund on a multi-item order (e.g., one item out of stock, refunded) could fail to proportionally adjust the vendor's payout and platform commission, resulting in the vendor being paid for the full original order despite a partial refund to the customer.
Trigger: Customer orders 3 items, 1 is refunded post-fulfillment-attempt; vendor payout batch runs using the original order total rather than the net (order − refund) amount.
Why plausible: Payout calculation pipelines that snapshot "order total" at order-creation time rather than dynamically deriving from order + refund history are prone to this drift, especially when refunds and payouts are handled by different subsystems on different schedules.
Impact: Platform absorbs the refunded amount without clawing it back from the vendor, or double-charges the vendor later via a separate reconciliation adjustment that confuses vendor accounting.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Marketplace, Financial/Payouts, Accounting

---

## SECTION 3 — LOCATION & DEMAND (GPS, Zones, H3)

### BUG-LOC-041 — Stale GPS fix used for fare-relevant distance calculation
Category: Functional / Location
Module: Location services / Fare
Possible bug: If a driver's app fails to acquire a fresh GPS fix in a tunnel/underpass/dense area and the backend uses the last-known (stale) location for distance-traveled calculation, the recorded trip distance could be shorter or longer than actual.
Trigger: Ride passes through an area with poor GPS signal (elevated highway underpass, dense downtown Dhaka); location pings stop updating for a stretch, then jump.
Why plausible: Mobile GPS reliability in dense urban environments is inherently imperfect; systems relying on point-to-point distance summation (rather than map-matched route distance) are especially vulnerable to gaps and jumps.
Impact: Fare miscalculation (usually undercharging due to missed distance, but a GPS "jump" could also overcharge via a spurious large delta).
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Location, Financial/Fare

### BUG-LOC-042 — GPS spoofing enables fraudulent surge-zone driver positioning
Category: Security/Fraud
Module: Location services
Possible bug: A driver using a mock-location app could report a false position inside a high-surge zone to receive higher-value ride offers, then physically travel to the real pickup once matched, without any check cross-referencing GPS speed/plausibility against recent movement history.
Trigger: Driver enables developer/mock-location tools, reports a location several km from actual position, in a currently-surging zone.
Why plausible: Basic GPS spoofing is technically trivial on many Android devices; without plausibility checks (e.g., implausible speed between consecutive points, mock-location API flags), it's straightforward to exploit for financial gain.
Impact: Riders in the surge zone matched with distant drivers (long ETA despite "nearby" claim), platform pays surge earnings for a not-actually-available driver, rider dissatisfaction.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Location, Dispatch, Fraud/Trust & Safety

### BUG-LOC-043 — Zone boundary fare/eligibility flip mid-ride
Category: Business Logic / Location
Module: Location / Zones
Possible bug: If pickup and drop zones determine eligibility for certain fare rules or driver categories (e.g., airport zone surcharge, city-limit rules), a ride whose route crosses a zone boundary at a point where zone assignment is ambiguous (e.g., pickup coordinate exactly on a boundary) could apply the wrong zone's rules.
Trigger: Rider requests pickup from a point exactly on the boundary between "Zone A" (with airport surcharge) and "Zone B" (without), and the point-in-polygon check has floating-point boundary ambiguity.
Why plausible: Polygon boundary checks are subject to floating-point precision edge cases; a coordinate essentially on the line can be classified inconsistently depending on which service/library performs the check.
Impact: Incorrect surcharge applied/omitted; rider dispute; potential regulatory issue if zone determines legal fare caps.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Location/Zones, Financial/Fare

### BUG-LOC-044 — ETA calculation ignores real-time zone congestion flag, causing systematic underestimate
Category: Functional
Module: Location / ETA
Possible bug: If ETA is computed from a base routing-provider estimate without applying a live congestion multiplier that the platform maintains separately (e.g., a "Dhaka traffic factor" per zone/time-of-day), riders could be shown systematically optimistic ETAs during known peak congestion windows.
Trigger: Rush hour in a dense Dhaka zone; routing provider's baseline estimate doesn't reflect hyper-local, platform-observed congestion.
Why plausible: Third-party routing providers may not have granular enough local data; if the platform's own congestion-adjustment layer isn't consistently applied across all ETA-consuming surfaces (search results, in-ride tracking, driver app), estimates can silently diverge.
Impact: Rider frustration from consistently wrong ETAs; potential cancellations due to perceived unreliability.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Location/ETA, Rider app

### BUG-LOC-045 — H3 resolution mismatch between matching and pricing services
Category: Functional / Architecture
Module: Location / H3 indexing
Possible bug: If the matching service uses one H3 resolution (e.g., resolution 8) and the pricing/surge service uses a different resolution (e.g., resolution 9) for the "same" zone concept, a rider could be matched based on one zone's driver supply but priced based on a different, smaller/larger zone's demand, causing inconsistent surge application.
Trigger: Two services independently configured with different H3 resolution constants, either due to differing historical defaults or an incomplete migration.
Why plausible: H3 resolution is a configuration parameter that must be kept consistent across all consuming services; without a shared, enforced constant, resolution drift between services deployed/updated independently is plausible.
Impact: Surge pricing applied inconsistently with actual local driver availability; rider-perceived unfairness ("I was charged surge but saw many nearby cars").
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Location/H3, Dispatch, Financial/Fare

### BUG-LOC-046 — Duplicate location pings inflate distance-based earnings
Category: Idempotency / Financial
Module: Location / Driver earnings
Possible bug: If the driver app retries a location-ping upload after a slow network ack (believing it failed) and the server processes both, a distance-accumulation algorithm summing consecutive ping deltas could double-count a segment, inflating recorded trip distance.
Trigger: Poor connectivity causes ping upload to time out client-side and retry, but server actually received and processed the original.
Why plausible: Location-ping ingestion pipelines are a classic candidate for at-least-once delivery without deduplication (e.g., no ping-sequence-number check).
Impact: Slightly inflated fares and driver earnings on affected rides; systemic small-scale financial leakage.
Severity: LOW
Likelihood: MEDIUM
Detection: HARD
Affected: Location, Financial/Fare, Driver earnings

### BUG-LOC-047 — Cross-zone eligibility incorrectly blocks legitimate outstation ride
Category: Functional
Module: Location / Zones
Possible bug: A rider requesting an intercity/outstation ride that legitimately crosses multiple operational zones could be incorrectly rejected if eligibility logic requires both pickup and drop to be in the same zone (missing an explicit "outstation" ride type carve-out).
Trigger: Rider requests a ride from a Dhaka zone to a neighboring district outside normal zone boundaries.
Why plausible: Zone-based eligibility rules are often designed for intra-city rides first, with outstation/intercity support bolted on later; interaction bugs between the two are plausible if not explicitly tested.
Impact: Legitimate ride requests rejected or mispriced; lost revenue and rider frustration.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: EASY
Affected: Location/Zones, Ride-hailing, Financial/Fare

### BUG-LOC-048 — Location sharing continues briefly after ride completion, leaking rider location to driver
Category: Security/Privacy
Module: Location / Live tracking
Possible bug: If live-location sharing is torn down based on a client-side "ride completed" event rather than a server-enforced cutoff, a delayed or missed teardown signal could let the driver's app continue receiving the rider's location updates for a short period post-completion (or vice versa).
Trigger: Ride completes, but the driver app's live-tracking WebSocket subscription isn't explicitly closed server-side, only client-side; a race or dropped message leaves it open.
Why plausible: Real-time subscription teardown is easy to implement client-side-only, which is not trustworthy for a privacy-sensitive channel; server-side enforcement is the "hard part" that's easy to skip.
Impact: Privacy leak (short window of unauthorized location visibility) — moderate depending on duration; regulatory/trust concern if discovered.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Location, WebSocket/real-time infra, Security

---

## SECTION 4 — FLEET & RESOURCES

### BUG-FLEET-049 — Vehicle double-assigned to two drivers in the same fleet
Category: Concurrency / State Machine
Module: Fleet / Vehicle assignment
Possible bug: Two fleet-manager actions (or a manager action racing an automated re-assignment job) could both assign the same vehicle to two different drivers if the assignment check-and-set isn't atomic per vehicle.
Trigger: Fleet manager reassigns Vehicle X to Driver B via the admin panel at the same moment a scheduled "auto-assign idle vehicles" job assigns Vehicle X to Driver A.
Why plausible: Vehicle assignment is a classic scarce-resource allocation problem; without a unique constraint or locking on "one active driver per vehicle," concurrent assignment paths can conflict.
Impact: Both drivers believe they're authorized to operate the vehicle; potential real-world conflict, insurance/liability ambiguity, scheduling chaos.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Fleet, Admin

### BUG-FLEET-050 — Stale vehicle-assignment pointer after vehicle decommissioned
Category: Data Consistency
Module: Fleet / Vehicle lifecycle
Possible bug: If a vehicle is marked "decommissioned"/"sold" but the driver's active-assignment record isn't cleared as part of the same operation, the driver could continue to appear as actively assigned to a vehicle that no longer exists in service, affecting dispatch eligibility or reporting.
Trigger: Fleet admin removes a vehicle from the fleet without going through a "reassign driver first" guided flow (e.g., direct deletion or bulk deactivation).
Why plausible: Cascading state updates across related entities (vehicle ↔ driver ↔ assignment) are easy to leave incomplete if the deactivation flow wasn't designed with all downstream references in mind.
Impact: Driver blocked from being assigned a new vehicle (system thinks they're still assigned), or dispatch/reporting shows a phantom active vehicle.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Fleet, Dispatch, Reporting

### BUG-FLEET-051 — Subscription seat-limit race allows over-provisioning drivers
Category: Concurrency / Business Logic
Module: Fleet / Subscriptions
Possible bug: If a fleet's subscription plan caps the number of active drivers (e.g., "up to 20 drivers"), concurrent "add driver" requests near the limit could both pass a "count < limit" check before either commits, resulting in more active drivers than the plan allows.
Trigger: Fleet admin bulk-imports drivers via CSV upload, triggering many near-simultaneous "add driver" calls when the fleet is at 19/20 capacity.
Why plausible: Classic TOCTOU race on a count-based limit check without a database-level constraint or serialized transaction.
Impact: Fleet operates over its paid entitlement without being billed correctly; revenue leakage, or conversely a fleet that legitimately should be allowed the drivers is incorrectly blocked if the race resolves the other way.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Fleet, Billing/Subscriptions

### BUG-FLEET-052 — Fleet billing charged for driver removed mid-billing-cycle without proration
Category: Business Logic / Billing
Module: Fleet / Billing
Possible bug: If a fleet removes a driver mid-cycle, the billing calculation could either fail to prorate (overcharging the fleet for the full period) or incorrectly prorate to zero (undercharging), depending on whether the billing job reads "current driver count" versus "driver-days" for the period.
Trigger: Fleet removes 5 of 20 drivers on day 15 of a 30-day billing cycle; monthly invoice generation runs at cycle end.
Why plausible: Proration logic is inherently more complex than flat "current count × rate" and is a common area to under-implement, especially for less-common cases like mid-cycle changes.
Impact: Billing disputes with fleet customers; revenue leakage or overcharging (customer trust issue either way).
Severity: MEDIUM
Likelihood: MEDIUM
Detection: EASY
Affected: Fleet, Billing

### BUG-FLEET-053 — Role/access mismatch lets removed fleet manager retain admin-panel access
Category: Security/Authorization
Module: Fleet / Roles
Possible bug: Similar to BUG-AUTH-001 but specific to fleet managers: removing a manager's role from a fleet's roster might not immediately revoke an already-issued admin-panel session/token, letting them continue viewing/editing fleet data (vehicles, drivers, billing) after removal.
Trigger: Fleet owner removes a manager for cause; manager's existing browser session in the admin panel remains valid.
Why plausible: Session/token invalidation-on-role-change is frequently implemented as "best effort" (short token TTL) rather than immediate revocation, especially for lower-traffic admin surfaces.
Impact: Unauthorized continued access to sensitive fleet/financial data by a removed manager; potential for malicious action (e.g., changing bank details) during the window.
Severity: HIGH
Likelihood: LOW
Detection: HARD
Affected: Fleet, Admin, Auth

### BUG-FLEET-054 — Multi-tenancy alert routed to wrong fleet's notification channel
Category: Functional / Multi-tenancy
Module: Fleet / Alerts
Possible bug: A vehicle-health or compliance alert (e.g., "insurance expiring") could be routed to the wrong tenant's notification list if the alert-generation job resolves tenant context via a stale or incorrectly joined vehicle-to-fleet mapping (relevant if vehicles can be transferred between fleets).
Trigger: Vehicle transferred from Fleet A to Fleet B; an alert-generation batch job still has Fleet A cached/joined for that vehicle at alert time.
Why plausible: Batch/scheduled alert jobs that join against a "vehicle → fleet" mapping table are vulnerable to staleness if the mapping changes between the last full refresh and alert generation.
Impact: Fleet B misses a compliance alert for their own vehicle (Fleet A gets an irrelevant alert instead); potential compliance/safety consequence.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Fleet, Notifications, Compliance

### BUG-FLEET-055 — Fleet driver simultaneously eligible for two mutually-exclusive fleet vehicle bookings
Category: Concurrency / Cross-vertical
Module: Fleet / Scheduling
Possible bug: A fleet driver marked available for both a scheduled fleet job and general ride-hailing dispatch could be assigned to both simultaneously if the two subsystems (fleet scheduling vs. platform dispatch) maintain independent availability states without cross-checking.
Trigger: Fleet operator schedules a driver for a corporate contract ride at 3 PM; platform dispatch also matches the same driver (still shown "available") to a ride-hailing request at 2:55 PM with a 20-minute trip.
Why plausible: Fleet-specific scheduling and general-purpose dispatch availability likely originate from different subsystems; without a unified availability source of truth, double-booking across verticals is structurally possible.
Impact: Driver physically cannot fulfill both commitments; one rider/customer stranded; contract SLA breach for fleet operator.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Fleet, Dispatch, Scheduling

### BUG-FLEET-056 — Vehicle document (fitness/insurance) expiry not enforced at dispatch time
Category: Business Logic / Compliance
Module: Fleet / Compliance
Possible bug: A vehicle whose fitness certificate or insurance has expired could still be dispatched for rides if the "eligible for dispatch" check reads a cached "compliant" flag rather than re-validating expiry dates at request time.
Trigger: Vehicle's insurance expires at midnight; a batch job that recomputes compliance flags runs only once daily and hasn't executed yet when a ride is dispatched at 1 AM.
Why plausible: Compliance-flag caching for performance is common, but the refresh cadence may not align tightly enough with the actual expiry timestamp granularity.
Impact: Regulatory violation, safety risk, and potential liability exposure if an incident occurs during the non-compliant window.
Severity: CRITICAL
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Fleet, Compliance, Dispatch

---

## SECTION 5 — MARKETPLACE (Shops, Orders, RFQs, Rentals/Bidding, Food Delivery, Courier)

### BUG-MKT-057 — Inventory oversold due to concurrent checkout race
Category: Concurrency
Module: Marketplace / Inventory
Possible bug: Two customers checking out the last unit of a product simultaneously could both succeed if stock-decrement isn't atomic (check-then-decrement race), resulting in an oversold item.
Trigger: Last unit of a popular product; two customers complete checkout within milliseconds of each other.
Why plausible: This is one of the most well-known e-commerce concurrency bugs; without row-level locking or atomic decrement-with-floor-at-zero, it recurs easily.
Impact: One order cannot be fulfilled, requiring cancellation/refund and customer-service intervention; reputational damage.
Severity: MEDIUM
Likelihood: HIGH
Detection: EASY
Affected: Marketplace/Inventory, Orders

### BUG-MKT-058 — Order status regresses after delayed courier webhook
Category: State Machine / Distributed
Module: Marketplace / Order-Delivery bridge
Possible bug: An order marked "delivered" by a real-time courier-app action could be reverted to "out for delivery" if a delayed webhook/event from the courier system (reflecting an earlier state) arrives and is processed without an out-of-order guard.
Trigger: Courier's device sends "picked up" and "delivered" events in quick succession, but "picked up" is delayed in transit and arrives after "delivered" has already been processed.
Why plausible: Independent event streams without sequence numbers or monotonic state-transition guards (i.e., "don't apply an earlier-state event over a later one") are prone to this.
Impact: Customer sees delivery status regress, confusing UX; possible incorrect SLA-breach flagging; support burden.
Severity: LOW
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace, Courier, Notifications

### BUG-RFQ-059 — RFQ visible to vendor after quote deadline due to clock skew
Category: Time / State Machine
Module: Marketplace / RFQ
Possible bug: A vendor's client-side clock running behind server time could allow them to submit a quote after the RFQ deadline if deadline enforcement happens client-side or uses a lenient grace window inconsistently.
Trigger: Vendor's device clock is 3 minutes slow; they submit at what they believe is 1 minute before deadline, but server-side it's 2 minutes after.
Why plausible: Deadline enforcement must be server-authoritative; any client-timestamp trust (even partial) creates this class of bug.
Impact: Unfair advantage to late quoters, buyer disputes, fairness/integrity concerns in a competitive bidding process.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: EASY
Affected: Marketplace/RFQ

### BUG-RENTAL-060 — Sealed-bid rental award race allows two winners
Category: Concurrency / State Machine
Module: Marketplace / Rental bidding
Possible bug: If the "select winning bid" process (deadline-triggered) runs concurrently with a manual admin "award now" override, both could independently select and confirm a winner, potentially picking two different winning bidders for the same rental.
Trigger: Deadline auto-award job fires at the same moment an admin manually finalizes the same RFQ/rental due to a support escalation.
Why plausible: Sealed-bid award is a "commit exactly once" operation; without a lock or an idempotent "already awarded" guard checked atomically, two initiators can both succeed.
Impact: Two vendors both believe they won the rental; resource (vehicle) double-booked; contractual/financial dispute.
Severity: HIGH
Likelihood: LOW
Detection: HARD
Affected: Marketplace/Rental, Fleet

### BUG-RENTAL-061 — Losing bidder's data (price) leaked via premature visibility
Category: Security / Sealed-bid integrity
Module: Marketplace / Rental bidding
Possible bug: If bid amounts are stored/queried in a way that a competing bidder's API call (e.g., a status-check endpoint) can be crafted or timed to reveal aggregate bid statistics before the sealed-bid deadline, effective sealedness could be broken.
Trigger: A "current lowest bid" or "number of bids so far" field is exposed via a status endpoint intended for buyers but also reachable by bidders, updating in real time before the deadline.
Why plausible: Sealed-bid systems require deliberate design to prevent any signal leakage before the reveal; a shared status API serving both buyer and vendor views is a plausible source of accidental leakage.
Impact: Bid-sniping / unfair advantage for bidders who can infer competitive pressure; undermines the sealed-bid integrity guarantee.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Marketplace/Rental

### BUG-RENTAL-062 — Old (demoted) winner continues to receive award-related events after re-award
Category: State Machine / Notifications
Module: Marketplace / Rental bidding
Possible bug: If a rental award is reversed (e.g., original winner fails confirmation/SLA and a new winner is selected), the original winner's app/session might continue receiving push notifications or WebSocket events tied to the "won" state if their client subscription wasn't explicitly torn down.
Trigger: Winner A fails to confirm within the SLA window; system re-awards to Vendor B; Vendor A's app was still subscribed to the rental's event channel.
Why plausible: Real-time subscriptions tied to an entity ID rather than a specific "role in this entity" are prone to leaking updates to now-irrelevant parties if not explicitly unsubscribed on state change.
Impact: Vendor A receives confusing/incorrect notifications (e.g., "pickup confirmed" for a rental they no longer have); potential for Vendor A to show up expecting to fulfill the rental, causing an on-the-ground conflict with Vendor B.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Rental, Notifications, WebSocket

### BUG-RENTAL-063 — Driver/vehicle swapped after award without re-validating eligibility
Category: Business Logic
Module: Marketplace / Rental fulfillment
Possible bug: If the awarded vendor is allowed to substitute a different vehicle/driver than what was bid (e.g., due to a breakdown), the system might not re-validate that the substitute meets the original RFQ's requirements (capacity, vehicle type, driver certification).
Trigger: Vendor swaps in a smaller/older vehicle than what was quoted, and the swap-approval flow doesn't cross-check against the original RFQ spec.
Why plausible: Substitution is often handled as a simple "update assignment" operation without re-running the original eligibility/matching validation.
Impact: Customer receives a vehicle/service that doesn't meet the contracted specification; dispute, potential safety issue if capacity/type mismatch is significant.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Rental, Fleet

### BUG-RENTAL-064 — Rental SLA expiry and confirmation race causes wrongful cancellation
Category: Concurrency / Time
Module: Marketplace / Rental
Possible bug: A vendor confirming their award at the last second could have their confirmation processed after (or concurrently with) an SLA-expiry job that auto-cancels unconfirmed awards, resulting in a valid confirmation being discarded or a race where both "confirmed" and "expired/cancelled" states are briefly true.
Trigger: Vendor confirms at T=SLA-1 second; expiry sweep job also evaluates at T=SLA, processing near-simultaneously.
Why plausible: Deadline-boundary races between a user action and a scheduled sweep are a recurring pattern throughout time-boxed workflows in this system.
Impact: Legitimate award wrongly cancelled, requiring manual reinstatement; vendor frustration and potential lost business.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Rental, Scheduler

### BUG-EXCL-065 — Same driver simultaneously eligible for rental, delivery, and ride-hailing dispatch
Category: Cross-vertical / Concurrency
Module: Marketplace, Fleet, Ride-hailing
Possible bug: A driver/vehicle registered across multiple verticals (ride-hailing, rental fulfillment, courier/delivery) could be matched by more than one vertical's independent matching engine at the same time if there's no shared "currently engaged" flag enforced across all verticals.
Trigger: Driver is idle and eligible in all three verticals simultaneously; ride-hailing dispatch and a courier-delivery match both fire within the same short window.
Why plausible: Each vertical likely evolved its own matching/dispatch service; a single cross-vertical mutual-exclusion mechanism is architecturally nontrivial and easy to have gaps in, especially at vertical boundaries.
Impact: Driver double-booked across verticals; one commitment is broken, damaging trust in whichever vertical loses; support/dispute burden.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Marketplace, Fleet, Ride-hailing, Courier

### BUG-FOOD-066 — Food delivery order-to-delivery bridge creates duplicate delivery legs
Category: Idempotency / Cross-service
Module: Marketplace / Food delivery bridge
Possible bug: If the "create delivery leg for this food order" bridging step is retried after a perceived timeout (but the original request actually succeeded), two delivery legs could be created for a single food order, potentially dispatching two different couriers.
Trigger: Order-service calls delivery-service to create a leg; response is slow/times out; order-service retries without an idempotency key tied to the order ID.
Why plausible: Cross-service bridge calls are a classic candidate for missing idempotency keys, especially when the two services were integrated after being built somewhat independently (ride-hailing courier infra bridged to a newer food-delivery product).
Impact: Two couriers dispatched for one order; customer confusion, one wasted courier trip, potential double-charging for delivery fee.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Food delivery, Courier, Financial

### BUG-FOOD-067 — Delivery fee mismatch between quoted (order time) and settled (delivery time) amount
Category: Business Logic
Module: Marketplace / Food delivery
Possible bug: If delivery fee is quoted based on estimated distance/zone at order time but courier assignment later routes through a different/longer path (e.g., restaurant substitution or address correction), the settled fee might not reconcile with what was actually charged to the customer, causing the platform or courier to absorb an unaccounted difference.
Trigger: Customer's delivery address is corrected post-order (e.g., wrong building number caught by courier), extending the real delivery distance beyond the quoted estimate.
Why plausible: Quote-vs-settlement mismatches recur throughout this platform (see BUG-FARE-020); food delivery fee calculation is architecturally analogous to ride fare calculation and likely shares the same class of risk.
Impact: Courier undercompensated for extra distance, or platform absorbs the gap silently, masking a systemic pricing/economics issue.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Food delivery, Financial

### BUG-COURIER-068 — Courier package handoff (multi-leg) loses custody-tracking on driver reassignment
Category: State Machine / Data Consistency
Module: Marketplace / Courier
Possible bug: A multi-leg courier delivery (e.g., pickup by Courier A, handoff to Courier B for the final leg) could lose an accurate custody/chain-of-tracking record if the handoff event isn't atomically linked to both legs, leaving ambiguity about which courier currently has the package if a reassignment happens mid-handoff.
Trigger: Courier A is reassigned away mid-handoff due to an unrelated issue (vehicle breakdown), and a new Courier A' takes over, but the handoff-to-Courier-B leg was already initiated against the original Courier A's leg ID.
Why plausible: Multi-leg logistics tracking requires careful state-machine design across leg transitions; reassignment mid-transition is an edge case likely to be under-tested.
Impact: Package tracking shows inconsistent/ambiguous custody; if the package is lost, it's unclear which leg/courier is accountable — operational and possibly liability issue.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Marketplace/Courier, Fleet

### BUG-ORDER-069 — Orphaned order record after payment success but order-creation failure
Category: Data Consistency / Distributed
Module: Marketplace / Orders, Payment
Possible bug: If payment capture and order-record creation are not part of a single atomic transaction (potentially across service boundaries), a successful payment could occur while the order record fails to be created (e.g., due to a downstream validation error), resulting in a charged customer with no visible order.
Trigger: Payment gateway confirms charge; immediately after, the order-service throws an unrelated validation error (e.g., a malformed cart item) before persisting the order.
Why plausible: Payment and order-creation are commonly implemented as sequential steps rather than a saga with compensating actions; a failure after the point-of-no-return (payment capture) is a structurally likely gap.
Impact: Customer charged with no order to show for it; requires manual refund or order recovery; erodes trust, generates support tickets.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace/Orders, Payment, Financial

### BUG-ORDER-070 — Shop order counter (analytics/inventory) diverges from actual order count after cancellation race
Category: Data Consistency
Module: Marketplace / Orders
Possible bug: A denormalized "total orders" or "units sold" counter incremented at order-creation and decremented at cancellation could drift from the true count if increment/decrement operations aren't atomic relative to concurrent cancellations, or if a cancellation for an order that was never successfully counted (due to a prior bug) attempts to decrement anyway (going negative).
Trigger: High-concurrency flash-sale scenario with many simultaneous orders and cancellations.
Why plausible: Denormalized counters maintained outside the authoritative orders table are a very common source of drift under concurrency, especially without periodic reconciliation against the source of truth.
Impact: Incorrect analytics/reporting for vendors and admin dashboards; potential incorrect low-stock/restock triggers.
Severity: LOW
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Marketplace, Admin/Reporting

### BUG-BID-071 — Bidder able to submit multiple bids by exploiting missing per-vendor uniqueness constraint
Category: Business Logic / Fraud
Module: Marketplace / Rental bidding
Possible bug: If the rental-bidding system doesn't enforce "one active bid per vendor per RFQ" at the database level, a vendor could submit multiple bids (perhaps via retries or multiple staff logins) and effectively hedge or manipulate the award outcome depending on tie-breaking logic.
Trigger: Two staff members of the same vendor company, using separate logins under the same vendor account, both submit bids for the same RFQ.
Why plausible: Uniqueness constraints across "vendor + RFQ" combinations are easy to omit if the system was designed assuming one bid submission flow, without considering multi-user vendor accounts.
Impact: Unfair bidding advantage, potential award-selection confusion (which of the vendor's bids is binding), integrity concern for the sealed-bid process.
Severity: MEDIUM
Likelihood: LOW
Detection: MEDIUM
Affected: Marketplace/Rental

---

## SECTION 6 — EMERGENCY / AMBULANCE

### BUG-EMRG-072 — Ambulance dispatched to wrong geographic radius during zone misconfiguration
Category: Business Logic / Location
Module: Emergency / Dispatch
Possible bug: If the emergency dispatch radius is configured per-zone and a zone boundary/config error causes an undersized search radius to be applied, the system could fail to find an actually-available nearby ambulance, incorrectly reporting "none available."
Trigger: A zone's dispatch-radius config value is left at a default/testing value (e.g., 2km instead of intended 10km) after a configuration update.
Why plausible: Per-zone configuration values are a common source of "forgot to update one zone" errors, and emergency dispatch's life-safety criticality makes even a narrow config bug high-impact.
Impact: Life-threatening delay in emergency response due to false "no ambulance available" result despite actual nearby availability.
Severity: CRITICAL
Likelihood: LOW
Detection: HARD
Affected: Emergency/Ambulance, Location, Config

### BUG-EMRG-073 — Certification expiry not enforced at the moment of emergency dispatch
Category: Compliance / Business Logic
Module: Emergency / Provider eligibility
Possible bug: An ambulance/provider whose medical-staff certification has expired could still be included in the emergency-dispatch candidate pool if eligibility is checked via a periodically-refreshed cache rather than real-time validation at dispatch time.
Trigger: Certification expires at midnight; a daily eligibility-refresh batch job hasn't run yet when an emergency request comes in at 2 AM.
Why plausible: Same caching-staleness pattern as BUG-FLEET-056, applied to a more safety-critical context.
Impact: Uncertified provider dispatched to a medical emergency; serious safety and legal/regulatory exposure.
Severity: CRITICAL
Likelihood: LOW
Detection: MEDIUM
Affected: Emergency/Ambulance, Compliance

### BUG-EMRG-074 — First-accept race broadcasts emergency request to already-committed providers
Category: Concurrency
Module: Emergency / Dispatch
Possible bug: If an emergency request is broadcast to multiple nearby providers simultaneously (first-accept-wins model) but the "already accepted by someone else" state isn't propagated with sufficiently low latency, two providers could both believe they've accepted and dispatch, or a provider who already accepted a different emergency could be re-offered this one before their availability is updated.
Trigger: Two providers tap "Accept" within the propagation-delay window of the broadcast system.
Why plausible: Broadcast-to-many-then-lock-first-winner patterns inherently have a race window proportional to the real-time system's propagation latency; under emergency load (e.g., a mass-casualty event with many concurrent requests), this window's impact scales up.
Impact: Two ambulances dispatched to one emergency (wasted resource, potential confusion at the scene) or a provider double-booked across two emergencies (worse: one emergency left uncovered).
Severity: CRITICAL
Likelihood: LOW
Detection: HARD
Affected: Emergency/Ambulance, Dispatch

### BUG-EMRG-075 — Scheduled non-urgent ambulance booking silently deprioritized behind urgent dispatch queue indefinitely
Category: Business Logic / Scheduler
Module: Emergency / Scheduling
Possible bug: If scheduled (non-urgent, e.g., pre-booked hospital transfer) ambulance requests share a resource pool with urgent dispatch and are always deprioritized when any urgent request exists, a scheduled booking could be indefinitely delayed/starved during a period of sustained urgent demand, missing its committed time window without any escalation/alerting.
Trigger: A hospital pre-books a non-urgent transfer for 3 PM; from 2 PM onward, a continuous stream of urgent requests keeps consuming all available ambulances, and the scheduled booking has no priority floor or escalation trigger as its window approaches.
Why plausible: Naive priority queues (urgent always beats scheduled) without an aging/escalation mechanism are a classic starvation bug pattern.
Impact: Missed scheduled medical transport (e.g., a dialysis patient's transfer), which itself can be a serious health/safety issue; no visibility into the miss until after the fact.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Emergency/Ambulance, Scheduler

### BUG-EMRG-076 — Emergency request duplicated by client retry due to poor connectivity, dispatching two ambulances
Category: Idempotency
Module: Emergency / Request creation
Possible bug: A panicked user experiencing poor connectivity might tap "Request Ambulance" multiple times (or the app auto-retries on a perceived failure), and without an idempotency key tied to the request, two separate emergency requests/dispatches could be created for the same incident.
Trigger: User in a low-signal area taps the request button repeatedly out of urgency/anxiety; each tap is a genuinely new-looking request to the backend.
Why plausible: Emergency UX design often prioritizes "let the user act" over strict request-deduplication UI, and backend idempotency for a "new emergency" concept is inherently harder to define (is a second tap 10 seconds later the same emergency, or a new one?).
Impact: Two ambulances dispatched for one real emergency — wasteful and potentially confusing at the scene, but on the safer side of failure modes (over-provisioning rather than under-).
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Emergency/Ambulance, Dispatch

### BUG-EMRG-077 — Broadcast reaches providers who went offline moments before, showing a phantom acceptance option
Category: Distributed / Stale state
Module: Emergency / Dispatch
Possible bug: An emergency broadcast built from a slightly-stale snapshot of "online providers" could reach a provider who went offline in the interim, and if that provider's app doesn't gracefully handle "accept" against a now-invalid session, the acceptance could either silently fail (leaving the requester waiting) or be processed anyway with the provider in an inconsistent (offline-but-assigned) state.
Trigger: Provider goes off-duty (e.g., shift ends, vehicle issue) between snapshot-build and broadcast-delivery for a given emergency dispatch cycle.
Why plausible: Any snapshot-then-broadcast architecture has an inherent staleness window; emergency dispatch is no exception, and the stakes are higher here than in general ride-hailing.
Impact: Delayed emergency response if the "accepted" provider can't actually respond; potential for an emergency to be marked "assigned" when it effectively is not.
Severity: CRITICAL
Likelihood: LOW
Detection: HARD
Affected: Emergency/Ambulance, Dispatch

### BUG-EMRG-078 — Ambulance workshop/maintenance status not checked before dispatch eligibility
Category: Business Logic
Module: Emergency / Fleet integration
Possible bug: A vehicle currently flagged "in workshop for maintenance" (part of the marketplace workshop feature) could still be considered dispatch-eligible for emergency requests if the emergency-dispatch eligibility check doesn't cross-reference the workshop/maintenance status maintained by a different subsystem.
Trigger: Ambulance is checked into a partner workshop for a routine service; its "available" flag in the dispatch system isn't updated because the workshop check-in is a separate feature/table.
Why plausible: Cross-feature status synchronization (workshop status ↔ dispatch eligibility) is exactly the kind of cross-service interaction gap the brief highlights; features built at different times by different teams often don't share a single "is this vehicle usable right now" source of truth.
Impact: Emergency dispatched to a vehicle physically in a workshop, unable to respond; life-safety delay.
Severity: CRITICAL
Likelihood: LOW
Detection: HARD
Affected: Emergency/Ambulance, Marketplace/Workshops, Fleet

---

## SECTION 7 — INFRASTRUCTURE (Scheduler/Jobs, WebSocket/Events, Notifications, Feature Flags, Time)

### BUG-SCHED-079 — Overlapping scheduler runs process the same batch twice
Category: Distributed / Scheduler
Module: Infrastructure / Scheduler
Possible bug: If a scheduled job (e.g., nightly payout, hourly compliance check) takes longer to run than its scheduling interval under high load, the next run could start before the previous one finishes, processing overlapping data sets and potentially duplicating side effects.
Trigger: A payout job normally takes 20 minutes but runs 70 minutes during a high-volume day, overlapping with the next hourly-triggered instance.
Why plausible: Without a distributed lock (e.g., "job X is already running, skip this trigger") many cron-style schedulers will happily fire a new instance regardless of prior completion.
Impact: Duplicate financial transactions, duplicate notifications, or duplicate compliance actions, depending on which job overlaps; potential large blast radius since it affects the "batch" set, not a single record.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Infrastructure/Scheduler, Financial, Notifications

### BUG-SCHED-080 — Missed scheduler run after deployment causes silent backlog
Category: Distributed / Scheduler
Module: Infrastructure / Scheduler
Possible bug: If a scheduler service restarts during a deployment at the exact moment a job was due, and there's no "catch-up on missed triggers" logic, that cycle's job (e.g., an hourly reconciliation) could simply never run, with no alert raised.
Trigger: Deployment/restart of the scheduler service coincides with a job's trigger time.
Why plausible: Many simple cron-based schedulers don't persist "last successful run" state robustly enough to detect and backfill a missed trigger; without active monitoring/alerting on job execution, this fails silently.
Impact: Silent data drift (e.g., a missed reconciliation job means a growing, undetected ledger/wallet mismatch); delayed discovery increases remediation cost.
Severity: HIGH
Likelihood: MEDIUM
Detection: VERY HARD
Affected: Infrastructure/Scheduler, all downstream jobs

### BUG-SCHED-081 — Cascading delay from one slow job pushes downstream dependent jobs past their SLA
Category: Distributed / Scheduler
Module: Infrastructure / Scheduler
Possible bug: If Job B logically depends on Job A's output (e.g., "compute earnings" then "generate payouts") but they're scheduled independently by fixed time rather than by explicit dependency/completion signal, a delay in Job A could cause Job B to run against incomplete data.
Trigger: Job A (earnings computation) is delayed due to a slow upstream data source; Job B (payout generation) fires at its fixed scheduled time regardless, using partial/stale earnings data.
Why plausible: Time-based scheduling of logically-dependent jobs (instead of event-driven "trigger B when A completes") is a common architectural shortcut that breaks under load variance.
Impact: Incomplete or incorrect payouts processed; some drivers/vendors missed from a run, requiring a manual makeup run (itself a source of duplicate-processing risk).
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Infrastructure/Scheduler, Financial/Payouts

### BUG-SCHED-082 — Backlog-processing job races with a record being concurrently updated by a live user action
Category: Concurrency / Scheduler
Module: Infrastructure / Scheduler
Possible bug: A backlog-catch-up job re-processing "stuck" records (e.g., rides stuck in a pending state) could act on a record at the exact moment a live user action (e.g., the rider manually cancels) updates the same record, with whichever write occurs last silently overwriting the other's intent.
Trigger: A stuck-ride-recovery job picks up a ride to force-complete it just as the rider taps cancel in the app.
Why plausible: Recovery/backlog jobs are often written to directly update records based on their own read, without considering that the record might be concurrently modified by the very live-traffic path the backlog job exists to complement.
Impact: User's explicit action (e.g., cancellation) silently overridden by an automated recovery job, or vice versa; confusing, hard-to-reproduce state for support to diagnose.
Severity: MEDIUM
Likelihood: LOW
Detection: VERY HARD
Affected: Infrastructure/Scheduler, Ride-hailing

### BUG-WS-083 — WebSocket reconnect causes duplicate delivery of buffered events
Category: Distributed / Real-time
Module: Infrastructure / WebSocket
Possible bug: If a client reconnects after a brief drop and the server replays a buffer of "missed" events without deduplication against what the client may have already partially received before the drop, the client could process some events twice (e.g., a "ride status changed" event applied twice, potentially re-triggering a UI action or a client-side side effect).
Trigger: Brief network blip causes a WebSocket disconnect/reconnect within the event-buffer retention window; some events were delivered just before the drop but not yet acknowledged.
Why plausible: At-least-once delivery semantics without client-side dedup (e.g., event ID de-duplication) is a very common source of double-processing in real-time systems.
Impact: UI glitches, duplicate client-side actions (e.g., duplicate local notification), or in worse cases, duplicate submission if a client action is naively triggered by an event handler.
Severity: LOW
Likelihood: HIGH
Detection: MEDIUM
Affected: Infrastructure/WebSocket, Rider/Driver apps

### BUG-WS-084 — Event delivered to wrong recipient after rapid role/session switch
Category: Functional / Real-time
Module: Infrastructure / WebSocket
Possible bug: If a WebSocket connection is keyed by a session/connection ID that isn't immediately invalidated when a user logs out and a different user logs in on the same device (e.g., shared tablet at a fleet office, or quick account switch), residual server-side event routing could briefly deliver events intended for User A to User B's now-active session on the same connection.
Trigger: Quick logout/login cycle on a shared device without the app fully tearing down and re-establishing the WebSocket connection.
Why plausible: WebSocket connection lifecycle management independent from application-level auth state is a known source of cross-user leakage if not carefully synchronized.
Impact: Privacy/security issue — one user briefly sees another's real-time data (e.g., ride status, notifications).
Severity: HIGH
Likelihood: LOW
Detection: VERY HARD
Affected: Infrastructure/WebSocket, Auth, Security

### BUG-NOTIF-085 — Notification sent after ride cancellation due to async pipeline lag
Category: Distributed / Notifications
Module: Infrastructure / Notifications
Possible bug: A notification queued before a ride is cancelled (e.g., "your driver is 2 minutes away") could still be delivered after the cancellation completes if the notification pipeline is decoupled and doesn't check current ride state at send-time (only at enqueue-time).
Trigger: Ride is cancelled 1 second after a proximity-triggered notification is enqueued but before it's actually pushed.
Why plausible: Async notification queues typically prioritize delivery throughput and may not re-validate business-relevant state immediately before sending, especially under load-induced queue delay.
Impact: Confusing/contradictory notification (rider told driver is arriving for a ride that's already cancelled); minor trust erosion, support inquiries.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Infrastructure/Notifications, Ride-hailing

### BUG-NOTIF-086 — Duplicate notification sent to multiple devices for the same account without dedup
Category: Functional
Module: Infrastructure / Notifications
Possible bug: A user logged into the same account on two devices (e.g., old and new phone during a transition) could receive the same notification on both, and if any notification-triggered action (e.g., "tap to auto-accept ride") isn't idempotent, action could be taken twice from two devices.
Trigger: User hasn't logged out of their old device; both devices are registered for push notifications on the same account.
Why plausible: Multi-device notification fan-out without any single-device "primary" designation or action idempotency is a common gap, especially for platforms that don't strictly enforce single-device sessions.
Impact: Confusing duplicate notifications at minimum; at worst, duplicate irreversible actions if the notification includes a quick-action button lacking idempotency.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Infrastructure/Notifications, Auth

### BUG-NOTIF-087 — Deep link in notification stale after entity ID reused/changed
Category: Functional
Module: Infrastructure / Notifications
Possible bug: A notification containing a deep link with an entity ID (e.g., ride ID, order ID) delivered with significant delay (due to queue backlog) could route the user to a screen showing stale or, in a worst case, a since-repurposed/different entity if IDs are ever reused (unlikely but possible in some ID schemes) or if the entity's state has moved on significantly.
Trigger: Notification delayed by minutes due to push-provider backlog; by the time it's tapped, the underlying ride/order has completed or moved to a very different state than what the notification text describes.
Why plausible: Any system with meaningful delivery-delay variance (which push notification infrastructure inherently has) risks notification content going stale relative to current entity state.
Impact: Confusing UX (notification says "arriving now" but ride ended 10 minutes ago); low severity but high frequency annoyance.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Infrastructure/Notifications

### BUG-FLAG-088 — Feature flag enabled in API layer but not in mobile client, causing inconsistent behavior
Category: Config / Cross-layer
Module: Infrastructure / Feature flags
Possible bug: A feature flag toggled on server-side (e.g., enabling a new fare component or new cancellation rule) without a corresponding client-side flag/version gate could cause the backend to apply new logic that the (older, un-updated) mobile app doesn't expect or display correctly, leading to a mismatch between what the app shows and what actually happens.
Trigger: Backend flag enabled globally; a meaningful percentage of users are on an older app version that doesn't render the new fare breakdown fields.
Why plausible: Feature flags are often designed and toggled with a "backend-first" mentality, and cross-layer consistency (ensuring the client can handle the new behavior) requires explicit coordination that's easy to skip, especially for a fast-moving flag system.
Impact: Fare shown to user doesn't match fare charged, confusing/misleading UX, support tickets, possible perception of overcharging.
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Infrastructure/Feature flags, Mobile apps, Financial

### BUG-FLAG-089 — Stale feature-flag cache on one service instance causes inconsistent behavior across a fleet of servers
Category: Distributed / Config
Module: Infrastructure / Feature flags
Possible bug: If feature-flag values are cached locally per service instance with a refresh interval, and a flag is toggled (e.g., disabling a buggy promo) during an incident, some instances could continue serving the old flag value until their cache refreshes, causing inconsistent behavior across concurrent requests.
Trigger: On-call engineer disables a problematic promo flag mid-incident; some app server instances haven't refreshed their local flag cache yet.
Why plausible: Distributed caching without a push-based invalidation mechanism (relying on TTL-based refresh instead) inherently has a propagation-delay window.
Impact: Incident remediation appears ineffective for a period (some requests still exhibit the bug), confusing on-call response and potentially prolonging financial exposure (e.g., a runaway promo).
Severity: MEDIUM
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Infrastructure/Feature flags, all services

### BUG-TIME-090 — Percent vs. decimal unit mismatch inflates a discount/commission by 100x
Category: Functional / Units
Module: Infrastructure / Config
Possible bug: A rate field intended to represent "0.15" (15%) could be misinterpreted as "15" (1500%) — or vice versa — at a service boundary or admin-input form if there's no strict validation/labeling of the expected unit convention, causing a wildly incorrect discount or commission calculation.
Trigger: Admin enters "15" into a commission-rate field expecting it to mean 15%, but the backend treats the raw number as a decimal multiplier (1500%).
Why plausible: Percent/decimal unit mismatches are one of the most common configuration-input bugs in any system with admin-editable numeric business rules, especially when the same field type is reused across features with different conventions.
Impact: Massively incorrect commission/discount applied platform-wide until caught; potentially large, rapid financial exposure.
Severity: CRITICAL
Likelihood: LOW
Detection: EASY (once triggered) 
Affected: Infrastructure/Config, Financial, Admin

### BUG-TIME-091 — Countdown timer displayed to user drifts from server-authoritative deadline
Category: Functional / Time
Module: Infrastructure / Client-server sync
Possible bug: A client-rendered countdown (e.g., "driver arriving in 4:32," "confirm within 60 seconds") computed from a locally-cached deadline without periodic re-sync against server time could drift due to device clock inaccuracy or app backgrounding, showing time remaining that doesn't match the actual server-enforced deadline.
Trigger: User backgrounds the app for a while during a countdown (e.g., rental confirmation window), then returns; the client's timer, paused/resumed inconsistently by the OS, no longer matches server state.
Why plausible: Client-side timers are convenience UI and easy to implement without robust re-sync logic, especially across app backgrounding/foregrounding lifecycle events that vary by OS.
Impact: User sees a countdown showing time remaining when the action has already expired server-side (or vice versa), leading to a failed action attempt and confusion.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Infrastructure, Mobile apps, Marketplace/Rental, Ride-hailing

### BUG-TIME-092 — Month-end billing job miscounts days due to timezone-aware date boundary error
Category: Time / Billing
Module: Infrastructure / Billing scheduler
Possible bug: A billing-period job that determines "last day of month" using UTC date arithmetic instead of Dhaka-local dates could include or exclude an extra few hours' worth of transactions at the boundary, causing a transaction that occurred late on the last local day to be counted in the wrong billing period.
Trigger: A transaction at 11:30 PM Dhaka time on the 30th (which is already the 31st, or the 1st of the next month, in UTC depending on the month) gets attributed to the wrong billing cycle.
Why plausible: Same UTC/Dhaka-local mismatch risk as BUG-SCHED-015, applied to billing-period boundaries specifically.
Impact: Transactions attributed to the wrong invoice period; billing disputes, revenue recognition/accounting period misstatement.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Infrastructure, Financial/Billing, Accounting

---

## SECTION 8 — DATA & CROSS-SERVICE CONSISTENCY

### BUG-DATA-093 — Orphaned ride record after rider account deletion mid-ride
Category: Data Consistency
Module: Data / Account lifecycle
Possible bug: If a rider requests account deletion (e.g., GDPR-style data-erasure request, if supported) while an active or recently-completed ride references their account, the ride record could become orphaned (referencing a deleted rider ID) or the deletion could be blocked in an inconsistent, partially-applied way.
Trigger: Rider submits an account-deletion request seconds after completing a ride, before all downstream financial/rating records referencing that ride have settled.
Why plausible: Account deletion touching many related tables (rides, payments, ratings, referrals) is a classic "did we get every foreign key" problem, especially for accounts with recent activity still being processed asynchronously.
Impact: Broken referential integrity, reports/analytics errors, potential compliance issue if deletion wasn't actually complete despite reporting success to the user.
Severity: MEDIUM
Likelihood: LOW
Detection: HARD
Affected: Data/Account lifecycle, Compliance, Reporting

### BUG-DATA-094 — Cache staleness shows outdated driver rating after a new low rating is submitted
Category: Data Consistency / Caching
Module: Data / Ratings
Possible bug: A driver's aggregate rating shown to riders (likely cached/denormalized for performance) could fail to reflect a very recent rating submission if the cache-invalidation trigger isn't reliably fired on every rating write, especially under concurrent rating submissions for the same driver from different rides.
Trigger: Two riders submit ratings for the same driver within the same cache-refresh window; only one triggers (or neither reliably triggers) a cache invalidation.
Why plausible: Denormalized aggregate fields (like average rating) updated via triggers or async recalculation jobs are prone to invalidation gaps, particularly under concurrent writes.
Impact: Riders see a stale (possibly more favorable) rating than current reality; minor trust/quality-control issue, though not typically severe.
Severity: LOW
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Data/Ratings, Rider app

### BUG-DATA-095 — Soft-deleted record still returned by a report/analytics query that doesn't filter deleted_at
Category: Data Consistency
Module: Data / Reporting
Possible bug: A soft-deleted entity (e.g., a cancelled/removed promotion, a deactivated vehicle) could still appear in certain reporting or admin-list queries if not every query consistently filters on the soft-delete flag, especially in newer reports added after the soft-delete convention was established.
Trigger: A new admin report is built querying the vehicles table directly without including the standard "WHERE deleted_at IS NULL" (or equivalent) filter used elsewhere.
Why plausible: Soft-delete conventions rely on every single query author remembering to filter; this is one of the most common real-world data-consistency bugs in systems using soft deletes without a shared query-layer enforcement (e.g., a default-scoped ORM model).
Impact: Confusing/incorrect admin reports showing "ghost" entities; potential incorrect business decisions based on inflated counts.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Data/Reporting, Admin

### BUG-DATA-096 — Wallet balance and ledger sum diverge after a failed migration/backfill script
Category: Data Consistency
Module: Data / Wallet-Ledger
Possible bug: A one-time data migration or backfill script (e.g., to add a new wallet feature or correct historical data) that partially fails partway through (processing some accounts but not others) could leave a subset of wallets with balances that no longer match the sum of their ledger entries, without any obvious immediate error.
Trigger: A migration script processing all wallets in batches encounters an unexpected data shape for a subset of accounts (e.g., accounts with an unusual currency or legacy format) and silently skips or partially applies changes to them.
Why plausible: Large one-time migrations against production financial data are inherently risky, especially without a strict "all-or-nothing per batch, verified against ledger sum" design; partial failures are a very common real-world incident pattern.
Impact: A subset of users has an incorrect wallet balance until discovered via reconciliation or a user complaint; potential financial loss or user-facing error (blocked spending, or ability to overspend).
Severity: HIGH
Likelihood: LOW
Detection: VERY HARD
Affected: Data, Financial/Wallet, Ledger

### BUG-DATA-097 — Cross-service chain partial failure: Payment succeeds, Wallet credit fails silently
Category: Distributed / Cross-service
Module: Ride → Payment → Wallet chain
Possible bug: In the chain Ride → Payment → Wallet → Ledger → Tax → Accounting, if the Payment step succeeds but the subsequent Wallet-credit call fails (network error, service down) without a retry/compensation mechanism or alerting, the customer could be charged without receiving the corresponding wallet credit (for a top-up) or without their ride being marked paid (for a ride payment), while downstream services are never made aware anything went wrong.
Trigger: Wallet service is briefly unavailable (deploy, restart, or overload) at the exact moment Payment service calls it after a successful charge.
Why plausible: This is the canonical "distributed transaction across service boundaries without a saga/compensation pattern" bug; the more services in a chain, the higher the chance any single hop fails independently of the others succeeding.
Impact: Customer paid without receiving the entitlement (credit/ride-paid status); direct customer harm and, if undetected, direct financial/trust loss; also risks each downstream service (Tax, Accounting) building on an incomplete state.
Severity: CRITICAL
Likelihood: MEDIUM
Detection: HARD
Affected: Payment, Financial/Wallet, Ledger, Tax, Accounting

### BUG-DATA-098 — "A and B execute simultaneously" — concurrent admin edit and user self-service edit overwrite each other
Category: Concurrency
Module: Data / Admin + Self-service
Possible bug: If an admin support agent edits a user's ride/order record (e.g., correcting an address) at the same time the user independently edits it via the app, a naive "last write wins" save (without optimistic concurrency / version checking) could silently discard one of the two edits without either party being informed.
Trigger: Support agent is mid-edit on a ticket while the customer, unaware, updates the same record from their app.
Why plausible: Most CRUD update endpoints don't implement optimistic locking (e.g., a version field checked on write) unless specifically designed to handle concurrent editors, which is easy to overlook for admin-tooling built as an afterthought.
Impact: One party's correction is silently lost, potentially reintroducing the very error the support agent was trying to fix, without any error surfaced to either party.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Data, Admin, Ride-hailing/Orders

### BUG-DATA-099 — Denormalized driver "total completed rides" counter drifts from actual count over time
Category: Data Consistency
Module: Data / Driver stats
Possible bug: A denormalized counter used for driver-tier/badge eligibility could drift upward or downward from the true count of completed rides due to any of: double-counted retries, uncounted rides from edge-case completion paths (e.g., rides completed via an admin override that bypasses the normal completion code path), or race conditions on the increment.
Trigger: Over months of operation, various edge-case completion paths (support-forced completion, disputed-then-resolved rides, etc.) each have a small chance of not correctly updating the counter, accumulating drift.
Why plausible: Denormalized counters are inherently a maintenance liability; any code path that can mark a ride "completed" without going through the single canonical increment logic will cause drift, and multiple such paths tend to accumulate over a system's life.
Impact: Drivers incorrectly qualify or fail to qualify for tier-based incentives/badges; disputes, perceived unfairness in incentive programs.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Data, Driver incentives/Reporting

### BUG-DATA-100 — Reporting mismatched with financial ledger due to timezone-inconsistent date bucketing
Category: Data / Time
Module: Data / Financial reporting
Possible bug: If financial reports bucket transactions by UTC date while the ledger's authoritative transaction timestamps are stored and reconciled in Dhaka local time (or vice versa, inconsistently across different reports), the daily/monthly totals shown in different reports could disagree even though they're drawing from the same underlying data.
Trigger: Two different reporting queries/dashboards were built at different times by different engineers, one bucketing by UTC date and the other converting to Dhaka time first.
Why plausible: Without an enforced single convention for "business day" boundaries, timezone-bucketing inconsistency across reports is extremely common in systems operating in a single non-UTC timezone.
Impact: Confusing/contradictory internal reports, wasted investigation time, potential incorrect business/financial decisions based on which report is trusted.
Severity: LOW
Likelihood: HIGH
Detection: EASY
Affected: Data/Reporting, Accounting

---

## SECTION 9 — MOBILE / NETWORK

### BUG-MOB-101 — Client believes ride-booking failed and retries, while server actually created the ride
Category: Idempotency / Mobile
Module: Mobile / Ride creation
Possible bug: A "create ride" API call could succeed server-side, but the response is lost in transit (timeout on the client side); the client, believing the request failed, either shows an error and lets the user retry manually, or auto-retries, creating a second ride if the request isn't idempotent.
Trigger: Poor mobile network conditions cause the response to a successful ride-creation call to be lost; user taps "Book" again.
Why plausible: This is the single most common client-server distributed-systems bug pattern, explicitly called out in the brief's Retry/Idempotency framework, and mobile networks (especially in areas with inconsistent 3G/4G coverage) make it a realistic frequent occurrence.
Impact: Duplicate ride created and potentially dispatched to two different drivers for a single intended booking; rider confusion, wasted driver time, potential double-charge if payment is tied to ride creation.
Severity: HIGH
Likelihood: HIGH
Detection: MEDIUM
Affected: Mobile apps, Ride-hailing, Dispatch, Financial

### BUG-MOB-102 — App backgrounding pauses location updates mid-ride, causing an inaccurate fare/ETA on foreground resume
Category: Functional / Mobile lifecycle
Module: Mobile / Location updates
Possible bug: If the OS suspends or throttles background location updates for the driver's app (common iOS/Android battery-optimization behavior) during a ride, a burst of location updates on foreground-resume could be processed without properly reconstructing the actual path traveled during the gap, affecting distance-based fare calculation.
Trigger: Driver's app is backgrounded (e.g., they switch to a maps app or receive a phone call) for several minutes during an active ride, then resumes.
Why plausible: OS-level background execution limits are a well-known real-world constraint that backend systems assuming continuous location streams often don't gracefully handle.
Impact: Inaccurate fare due to a distance/time gap in tracking data; potential rider or driver dispute.
Severity: MEDIUM
Likelihood: HIGH
Detection: MEDIUM
Affected: Mobile apps, Location, Financial/Fare

### BUG-MOB-103 — Local action queue replays a stale cancellation after connectivity is restored
Category: Idempotency / Mobile
Module: Mobile / Offline queue
Possible bug: If the mobile app queues user actions locally during an offline period and replays them on reconnect, a queued "cancel ride" action could be replayed against a ride that has, in the interim, already completed (e.g., the driver used an offline-capable path to complete it, or another device completed it), causing an already-completed ride to be incorrectly cancelled or to enter a confusing partially-cancelled state.
Trigger: Rider taps "cancel" while offline; before connectivity returns, the ride actually completes via the driver's connection; rider's queued cancel action then replays against the completed ride.
Why plausible: Offline-first mobile architectures that queue-and-replay actions without re-validating current server state before applying are a known source of "server completed but phone thinks failed" (and the inverse) style bugs explicitly flagged in the brief.
Impact: A legitimately completed ride shows as cancelled (or a conflicting state) to the rider, financial/rating implications, support burden to untangle.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Mobile apps, Ride-hailing

### BUG-MOB-104 — Push-notification-triggered background fetch causes app to show pre-action state after user already acted via a different channel
Category: Functional / Mobile
Module: Mobile / Sync
Possible bug: If a driver accepts a ride via a push-notification quick-action, but the main app's UI is refreshed from a slightly-stale background-fetch response that was already in flight before the accept was processed, the app could briefly (or persistently, if not corrected) show the ride as still "pending" even though it was already accepted.
Trigger: Push notification quick-action ("Accept") and a coincidental background app-refresh fetch race against each other.
Why plausible: Multiple concurrent data-fetching paths (push actions, background fetch, foreground poll) without a single reconciling source of truth on the client are prone to showing whichever response arrives last, regardless of true recency.
Impact: Confusing UI state for the driver; potential for the driver to "accept" again, redundantly, if the UI misleads them into thinking the first attempt didn't register.
Severity: LOW
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Mobile apps, Notifications, Dispatch

### BUG-MOB-105 — Wallet top-up payment completes on payment-gateway side but app shows failure due to a timeout shorter than gateway processing time
Category: Idempotency / Mobile-Payment
Module: Mobile / Payment integration
Possible bug: If the mobile app's client-side timeout for a payment-confirmation call is shorter than the actual (occasionally slow) processing time of the payment gateway/bank, the user could see a "payment failed, please try again" message and retry, resulting in two separate successful charges if the original request does eventually complete server-side.
Trigger: Bank/payment-gateway processing is slow (e.g., due to bank-side congestion) and exceeds the app's configured timeout, even though the transaction ultimately succeeds.
Why plausible: Client-side timeout values are often chosen for UX responsiveness rather than tuned to the true tail-latency of third-party payment providers; this mismatch is a structurally common source of "double charge, please refund" support tickets.
Impact: Customer charged twice for a single intended top-up/payment; direct financial harm to the customer, refund/support burden.
Severity: HIGH
Likelihood: MEDIUM
Detection: MEDIUM
Affected: Mobile apps, Payment, Financial/Wallet

### BUG-MOB-106 — Multi-device inconsistency: rider accepts a fare-change/renegotiation on one device, driver's app on a stale session shows the old fare
Category: Data Consistency / Mobile
Module: Mobile / Multi-device sync
Possible bug: In a scenario where fare details can be adjusted mid-ride (e.g., an added stop) and a rider has the app open on two devices (phone + tablet, or a family member's device logged into the same account), an acceptance/change made on one device might not propagate correctly to whichever device the driver's corresponding view depends on, if server-to-client sync for that specific field isn't robust to the "which device is authoritative" question.
Trigger: Rider adds a stop from a tablet while their phone (also logged in) remains the "active" ride-tracking device from the driver's perspective.
Why plausible: True multi-device support requires careful real-time sync design; ride-hailing apps are not always built assuming simultaneous multi-device sessions per rider account, making this an edge case likely to be under-tested.
Impact: Driver operates on stale fare/route information; potential dispute over the correct fare or route at trip end.
Severity: LOW
Likelihood: LOW
Detection: HARD
Affected: Mobile apps, Financial/Fare, Ride-hailing

---

## SECTION 10 — SECURITY / FRAUD (Cross-Cutting)

### BUG-FRAUD-107 — Collusion between rider and driver to farm promotional/referral value via fake short rides
Category: Fraud
Module: Cross-cutting / Promotions, Ride-hailing
Possible bug: If minimum-ride-value thresholds for promotions (e.g., "get BDT 50 off your first ride") aren't cross-checked against implausible ride patterns (extremely short distance/duration, repeated pickup/drop pairs between the same two accounts), a rider and driver could collude to generate many qualifying "rides" purely to extract promotional value without genuine transportation occurring.
Trigger: A rider and driver repeatedly book trivial (e.g., 100-meter) rides between each other's accounts to trigger a per-ride referral/promo payout multiple times.
Why plausible: Promotional-abuse detection requires deliberate anomaly-detection logic (pattern/velocity checks) that is easy to under-invest in relative to the promotion feature itself, especially early in a promotion's life.
Impact: Direct financial loss from fraudulent promotional payouts, potentially at meaningful scale if the pattern isn't caught quickly.
Severity: HIGH
Likelihood: MEDIUM
Detection: HARD
Affected: Fraud/Trust & Safety, Financial/Promotions, Ride-hailing

### BUG-FRAUD-108 — Price manipulation via app-layer request tampering on client-supplied fare parameters
Category: Security
Module: Cross-cutting / API
Possible bug: If any part of the fare calculation trusts a client-supplied value (e.g., an estimated distance, a promo code's discount amount, or a "waiting time" duration) without full server-side recomputation/validation, a modified client request (e.g., via a rooted device or intercepted/replayed API call) could manipulate the final charged fare.
Trigger: A technically sophisticated user intercepts and modifies the ride-completion API request to submit an artificially low distance/duration value.
Why plausible: Any API design that accepts a client-reported value as authoritative for a financially-relevant calculation (rather than treating client input as a hint to be independently verified) is inherently exploitable; this class of bug is common when performance optimizations lead a team to "trust the client" for values that are expensive to fully re-derive server-side.
Impact: Direct fare underpayment (or, less likely, overpayment) exploitable at scale by technically capable bad actors; potential systemic revenue loss if the exploit is shared.
Severity: HIGH
Likelihood: LOW
Detection: VERY HARD
Affected: Security, Financial/Fare, API

### BUG-FRAUD-109 — Rating/review manipulation via rapid-fire duplicate ride creation and cancellation
Category: Fraud
Module: Cross-cutting / Ratings
Possible bug: If a driver's or vendor's rating is influenced by rides/orders, a bad actor could create and immediately cancel/self-fulfill many trivial rides/orders specifically to submit many 5-star self-ratings (via a second, colluding account) faster than any per-day rating-count anomaly detection can react, inflating a rating score before detection.
Trigger: Coordinated pair of accounts rapidly complete many trivial transactions and mutually rate each other favorably.
Why plausible: Similar velocity-abuse pattern to BUG-FRAUD-107, applied to reputation systems instead of financial ones; reputation-system abuse is a very well-documented category of platform fraud.
Impact: Inflated/manipulated ratings mislead other users into choosing a lower-quality driver/vendor; erosion of platform trust signal integrity.
Severity: MEDIUM
Likelihood: MEDIUM
Detection: HARD
Affected: Fraud/Trust & Safety, Ratings

### BUG-FRAUD-110 — SOS alert spoofed or suppressed due to unauthenticated or replayable trigger mechanism
Category: Security / Safety
Module: Ride-hailing / SOS
Possible bug: If the SOS-trigger endpoint or mechanism doesn't strongly bind the alert to an authenticated, current ride/session (e.g., relying on a predictable or reusable trigger token), it could theoretically be spoofed (false alarm flooding a safety team) or, in a worse failure mode, a legitimate SOS signal could fail to be distinguished from a replay/duplicate and be de-prioritized or deduplicated away as a "duplicate" during a real emergency.
Trigger: A malicious actor replays a captured SOS-trigger request to flood the safety-response team with false alarms, degrading their ability to respond to a genuine concurrent SOS; or, a legitimate second SOS press during a real emergency is incorrectly deduplicated as "already received."
Why plausible: Safety-critical trigger mechanisms are sometimes designed for simplicity/speed (a single low-friction "SOS" button) which can be in tension with robust authentication/anti-replay/anti-dedup-suppression design; the two failure directions (too permissive vs. too aggressive deduplication) are both plausible depending on which was over-optimized for.
Impact: Either false-alarm flooding degrading real emergency response capacity, or a genuine, repeated SOS signal being wrongly suppressed as a duplicate — both are safety-critical failure modes.
Severity: CRITICAL
Likelihood: LOW
Detection: VERY HARD
Affected: Ride-hailing/SOS, Security, Trust & Safety

---

## PART B — TOP 100 BUGS TO INVESTIGATE FIRST

*Prioritized by a composite of financial damage potential, security/safety impact, likelihood, detection difficulty, and cross-service blast radius. All 110 catalogued bugs above are candidates; the following ordering represents the recommended investigation sequence. IDs not listed in the top tier below should still be investigated but are lower relative priority.*

**Tier 1 — Investigate immediately (safety-critical or high-value financial, hard to detect):**
BUG-EMRG-078, BUG-EMRG-074, BUG-EMRG-073, BUG-EMRG-077, BUG-EMRG-072, BUG-FRAUD-110, BUG-WALLET-026, BUG-WALLET-027, BUG-WALLET-028, BUG-LEDGER-033, BUG-PAYOUT-035, BUG-CURRENCY-038, BUG-TIME-090, BUG-DATA-097, BUG-SCHED-015, BUG-FLEET-056, BUG-EMRG-075

**Tier 2 — Investigate next (high financial/operational impact, moderate-to-high likelihood):**
BUG-PROMO-023, BUG-PROMO-024, BUG-PASS-025, BUG-REFUND-029, BUG-REFUND-030, BUG-TAX-032, BUG-EARNINGS-034, BUG-PAYOUT-036, BUG-COUPON-039, BUG-VENDOR-040, BUG-DISPATCH-005, BUG-DISPATCH-008, BUG-CANCEL-009, BUG-SCHED-014, BUG-FLEET-049, BUG-FLEET-051, BUG-RENTAL-060, BUG-EXCL-065, BUG-ORDER-069, BUG-MOB-101, BUG-MOB-105, BUG-FRAUD-107, BUG-FRAUD-108, BUG-SCHED-079, BUG-SCHED-080, BUG-SCHED-081, BUG-WS-084, BUG-AUTH-001, BUG-AUTH-002, BUG-FLEET-053

**Tier 3 — Investigate as part of normal hardening cycle (moderate impact, or high likelihood but lower severity):**
BUG-OTP-003, BUG-AVAIL-004, BUG-DISPATCH-006, BUG-DISPATCH-007, BUG-CANCEL-010, BUG-NOSHOW-011, BUG-PIN-012, BUG-MULTISTOP-013, BUG-SESSION-016, BUG-CANCEL-017, BUG-LIFECYCLE-018, BUG-FARE-019, BUG-FARE-020, BUG-FARE-021, BUG-TIP-022, BUG-LOC-041, BUG-LOC-042, BUG-LOC-043, BUG-LOC-044, BUG-LOC-045, BUG-LOC-046, BUG-LOC-047, BUG-LOC-048, BUG-FLEET-050, BUG-FLEET-052, BUG-FLEET-054, BUG-FLEET-055, BUG-MKT-057, BUG-MKT-058, BUG-RFQ-059, BUG-RENTAL-061, BUG-RENTAL-062, BUG-RENTAL-063, BUG-RENTAL-064, BUG-FOOD-066, BUG-FOOD-067, BUG-COURIER-068, BUG-ORDER-070, BUG-BID-071, BUG-EMRG-076, BUG-SCHED-082, BUG-WS-083, BUG-NOTIF-085, BUG-NOTIF-086, BUG-NOTIF-087, BUG-FLAG-088, BUG-FLAG-089, BUG-TIME-091, BUG-TIME-092, BUG-DATA-093, BUG-DATA-094, BUG-DATA-095, BUG-DATA-096, BUG-DATA-098, BUG-DATA-099, BUG-DATA-100, BUG-MOB-102, BUG-MOB-103, BUG-MOB-104, BUG-MOB-106, BUG-CALLPKG-037, BUG-FRAUD-109

*(This tiering, combined, covers all 110 catalogued items — the "Top 100" in the strictest numeric sense corresponds to Tiers 1 and 2 plus the highest-priority items from Tier 3; the full ordering above should be read as the complete prioritized investigation queue.)*

---

## PART C — TOP 30 RARE-BUT-SEVERE BUGS

*Selected for the combination of low/very-low likelihood, high/critical severity, and hard/very-hard detection difficulty — the profile most likely to escape ordinary QA and surface only in production, often via a specific rare timing window, multi-actor interaction, or provider-side failure.*

1. BUG-LEDGER-033 — Double-entry ledger imbalance from partial transaction failure
2. BUG-PAYOUT-035 — Driver payout batch double-processes via pagination bug
3. BUG-CURRENCY-038 — Paisa/Taka unit mismatch causes 100x fare error
4. BUG-TIME-090 — Percent vs. decimal unit mismatch inflates commission by 100x
5. BUG-DATA-097 — Payment succeeds, Wallet credit fails silently (cross-service chain)
6. BUG-DATA-096 — Wallet/ledger divergence from a failed migration/backfill script
7. BUG-EMRG-078 — Ambulance dispatched despite being in workshop maintenance
8. BUG-EMRG-077 — Broadcast reaches providers who went offline moments before
9. BUG-EMRG-074 — First-accept race broadcasts emergency to already-committed providers
10. BUG-EMRG-072 — Wrong dispatch radius config causes false "no ambulance available"
11. BUG-FRAUD-110 — SOS alert spoofed or wrongly suppressed as duplicate
12. BUG-FRAUD-108 — Price manipulation via client-supplied fare parameter tampering
13. BUG-WS-084 — Real-time event delivered to wrong recipient after rapid session switch
14. BUG-AUTH-002 — Cross-tenant data leak via shared driver identity
15. BUG-FLEET-053 — Removed fleet manager retains admin-panel access
16. BUG-AUTH-001 — Stale session retains elevated role after demotion
17. BUG-SCHED-080 — Missed scheduler run after deployment causes silent backlog
18. BUG-SCHED-082 — Backlog-recovery job races with a concurrent live user action
19. BUG-RENTAL-060 — Sealed-bid rental award race allows two winners
20. BUG-DISPATCH-005 — Double assignment from concurrent dispatch cycles
21. BUG-SCHED-015 — Scheduled ride silently dropped across midnight/UTC-Dhaka boundary
22. BUG-EXCL-065 — Same driver simultaneously eligible across three verticals
23. BUG-LOC-048 — Live-location sharing leaks briefly after ride completion
24. BUG-COURIER-068 — Multi-leg courier custody-tracking ambiguity on reassignment
25. BUG-RENTAL-061 — Sealed-bid integrity broken via premature bid-statistics leakage
26. BUG-FLEET-056 — Expired vehicle compliance document not enforced at dispatch time
27. BUG-PIN-012 — Stale ride PIN validated after driver reassignment
28. BUG-PAYOUT-036 — Payout later reversed by chargeback with no clawback path
29. BUG-EMRG-075 — Scheduled non-urgent ambulance booking starved indefinitely by urgent queue
30. BUG-DISPATCH-008 — Auto-redispatch storm after mass driver disconnect

---

## PART D — SELF-CRITIQUE

This survey was built from the domain description alone, without codebase access, so the following limitations and likely gaps should be flagged for a follow-up pass (ideally one with actual code/schema visibility):

- **Missed or under-covered subsystems:** Driver onboarding/KYC verification flows, vehicle inspection/photo-verification workflows, in-app chat/messaging between rider and driver, insurance-claim processing, tax-authority reporting/filing integrations, loyalty-tier recalculation, and admin RBAC permission-matrix edge cases (~205 routes were mentioned but only a handful of authorization scenarios were explored here) all likely warrant a dedicated deeper pass.
- **Race conditions likely under-explored:** Concurrent admin bulk-operations (e.g., bulk driver deactivation, bulk fare-rule updates) racing against live traffic; concurrent operations across the ~57 scheduler jobs beyond the handful of interaction patterns illustrated here (only a sample of job-pair interactions was analyzed, not the full combinatorial space); WebSocket fan-out races during high-concurrency events (e.g., a viral promotion or major city event).
- **Financial paths not fully covered:** Multi-currency handling (if applicable for cross-border marketplace vendors), tax-exempt or B2B invoice-specific edge cases, corporate/business-account billing (if fleet billing extends to ride-hailing corporate accounts), and interest/float on wallet balances (if applicable) were not explored in depth.
- **Cross-service interactions to revisit:** The full Ride → Payment → Wallet → Ledger → Tax → Accounting → Fleet → Notification chain was only spot-checked at a few links (Payment→Wallet, primarily); every adjacent pair in that chain deserves the same "A succeeds, B fails" and "A and B execute simultaneously" treatment this document applied selectively.
- **Security/fraud cases likely incomplete:** Account-takeover scenarios via SIM-swap (a documented real-world risk in SIM-based-identity markets like Bangladesh), API rate-limit bypass via distributed/rotating requests, and driver-side collusion to manipulate surge pricing (e.g., mass-declining rides to artificially trigger surge) were not covered and should be added.
- **Scheduler/mobile failure modes to expand:** Job-queue poison-message handling (a malformed record permanently stuck and retried forever, blocking a queue), and mobile OS-specific push-notification delivery guarantees (differences between delivery reliability/timing on the two major mobile platforms) were only lightly touched.
- **Duplicate/overlapping findings merged or flagged:** Several bugs across sections share the same underlying root-cause pattern (e.g., TOCTOU races on single-use tokens/limits: BUG-OTP-003, BUG-PROMO-023, BUG-FLEET-051, BUG-BID-071; UTC/Dhaka timezone boundary errors: BUG-SCHED-015, BUG-TIME-092; quote-vs-settlement mismatches: BUG-FARE-020, BUG-FOOD-067; stale-cache-vs-real-time-check errors: BUG-AUTH-001, BUG-FLEET-053, BUG-FLEET-056, BUG-EMRG-073). A remediation effort could reasonably treat these as a smaller number of *systemic patterns* (e.g., "audit all single-use-token/limit checks for atomicity," "audit all timezone-sensitive date boundaries," "audit all quote-then-settle financial calculations") rather than fixing each instance independently, which would likely be both faster and more thorough than a bug-by-bug approach.

