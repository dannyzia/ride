<memory_save>
{"type": "topic", "name": "Ride platform context", "content": "User runs 'Ride', a Bangladesh-focused multi-service platform (ride-hailing, marketplace, rental bidding, delivery, courier, food, ambulance, fleet, admin). Current engagement: theoretical possible-bug survey with no codebase access; hedging language required.", "tags": ["ride", "bangladesh", "bug-survey", "platform"]}
</memory_save>

# RIDE — Independent Possible-Bug Survey

This is a **theoretical failure-mode catalogue**. No codebase access was available, so every entry is a **hypothesis** — a condition that *could* produce a defect if the implementation matches a common or plausible pattern. Nothing below asserts a confirmed bug. Hedging language is used throughout; every item should be treated as an investigation lead, not a finding.

---

# PART 1 — FULL BUG CATALOGUE

## A. Core Auth, Access Control, Multi-Tenancy

**BUG-AUTH-001**

| Field | Value |
|---|---|
| CATEGORY | Security / Authorization |
| SERVICE / MODULE | Auth / RBAC |
| POSSIBLE BUG | A user retains a role's cached permissions after the role is revoked mid-session; token claims are not re-evaluated. |
| TRIGGER / SCENARIO | Admin demotes a driver to a vendor account; the driver's existing session continues to call fleet/driver endpoints. |
| WHY PLAUSIBLE | Long-lived tokens + permission evaluation only at login is a common pattern. |
| IMPACT | Unauthorized access to admin/financial endpoints. |
| SEVERITY | CRITICAL |
| LIKELIHOOD | MEDIUM |
| DETECTION | HARD |
| AFFECTED | Auth, Admin, Fleet |

**BUG-AUTH-002** — Tenant isolation leak in fleet: a driver of fleet A could fetch fleet B's vehicle/earnings data if queries key on `driverId` alone without a `fleetId` scoping check.

| CATEGORY | Security |
|---|---|
| MODULE | Fleet / Multi-tenancy |
| POSSIBLE BUG | Cross-tenant data exposure through missing ownership scoping on nested resources. |
| TRIGGER | A driver transfers fleets but an old cached link (booking, alert, invoice) still resolves into the old fleet's data store. |
| IMPACT | Data breach, wrong billing, compliance failure. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-AUTH-003** — Deleted/soft-deleted user re-authenticates and resurrects orphan state.

| POSSIBLE BUG | Soft-deleted rider account re-logs-in; child records (wallets, passes) were not soft-deleted, so the account becomes active with stale entitlements. |
| TRIGGER | Rider requests deletion, returns after a promo period, re-registers with same phone; old wallet balance/pass reappears. |
| IMPACT | Stale credits usable; inconsistent lifecycle. |
| SEVERITY | HIGH | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-AUTH-004** — OTP replay/race: two concurrent OTP verifications for the same phone both succeed, creating two sessions.

**BUG-AUTH-005** — Session invalidation is eventually consistent: logout/kick on one device doesn't invalidate WebSocket auth on another device for some window.

**BUG-AUTH-006** — Password/PIN reset does not invalidate existing ride-related security tokens (ride PIN, SOS contacts), leaving them usable.

**BUG-AUTH-007** — Role inheritance is evaluated only at login; a role's permission graph changes mid-day and some users retain elevated access until re-login.

**BUG-AUTH-008** — Admin "impersonate user" feature could leave the impersonation session active in background jobs that later act on the impersonator's behalf.

---

## B. Ride Lifecycle — State Machine

**BUG-RIDE-001**

| Field | Value |
|---|---|
| CATEGORY | State Machine |
| MODULE | Ride-hailing / Ride lifecycle |
| POSSIBLE BUG | A ride in a terminal state (COMPLETED/CANCELLED) is transitioned back to ACTIVE by a delayed background event (e.g., a stale scheduled-ride activation job or a late WebSocket reconcile). |
| TRIGGER | Rider cancels; a scheduler job that was already enqueued executes afterward and re-activates or re-dispatches the ride record. |
| WHY PLAUSIBLE | Background jobs that read state at execution time, not enqueue time, are a classic stale-state race. |
| IMPACT | Phantom ride, duplicate dispatch, driver goes to a cancelled pickup. |
| SEVERITY | HIGH | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-RIDE-002** — Double completion: rider and driver both trigger completion (app retry + server callback), double payout or double rating.

**BUG-RIDE-003** — Cancellation fee applied to a ride that was already refunded; state reversal after financial side-effect.

**BUG-RIDE-004** — No-show marked twice by driver retry after timeout; passenger charged twice.

**BUG-RIDE-005** — Ride PIN verified on the wrong ride after rider switches vehicles mid-flow; PIN check keyed only on rider, not (rider, ride).

**BUG-RIDE-006** — Scheduled ride fires, gets cancelled by rider, but the driver notification was already sent — driver arrives for a dead ride.

**BUG-RIDE-007** — Multi-stop ride: stop 1 completed, then the whole ride cancelled — stop-1 partial fare calculation is skipped or double-counted.

**BUG-RIDE-008** — A cancellation after pickup switches to a different fee table than the pre-pickup fee the rider was shown (quote-vs-settlement mismatch).

**BUG-RIDE-009** — Auto-redispatch reassigns a ride without clearing the previous driver's lock; both drivers see the same trip.

**BUG-RIDE-010** — Ride state update succeeds but the corresponding driver-session state update fails — driver's session stays "on-trip" while ride is "completed."

---

## C. Dispatch & Matching

**BUG-DISPATCH-001**

| CATEGORY | Concurrency |
| MODULE | Ride-hailing / Dispatch |
| POSSIBLE BUG | Two drivers accept the same ride simultaneously; the first-accept lock is released before the assignment is persisted, so the second accept overwrites it. |
| TRIGGER | Near-simultaneous accept from two drivers via slow mobile networks; latency masks the race. |
| IMPACT | Double assignment — a scarce resource committed twice. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | VERY HARD |

**BUG-DISPATCH-002** — Auto-accept and auto-redispatch race: redispatch timer fires while auto-accept is still writing the first assignment.

**BUG-DISPATCH-003** — H3 matching uses a stale driver cell after the driver moved; driver is dispatched to a pickup far away or in the wrong zone.

**BUG-DISPATCH-004** — Driver offline/on-line toggle races with an in-flight dispatch: offline driver still receives a job.

**BUG-DISPATCH-005** — A ride is dispatched, times out, and is re-dispatched — but the first driver is never informed of the timeout, so both show the ride as "theirs."

**BUG-DISPATCH-006** — Matching reads driver location from a cache that is seconds older than the rider's fare quote, producing a fare-distance mismatch.

**BUG-DISPATCH-007** — Priority/queue starvation: a slow driver repeatedly re-inserted at the head of the match queue (retry bug) blocks others.

**BUG-DISPATCH-008** — Zone-boundary rider dispatched to a driver priced for the adjacent zone; cross-zone fare inconsistent.

---

## D. Financial — Fares, Wallet, Ledger, Payments, Refunds

**BUG-FIN-001**

| CATEGORY | Business Logic / Financial |
| MODULE | Financial / Wallet-Ledger |
| POSSIBLE BUG | Wallet credit and ledger entry are written non-atomically; a crash between them leaves wallet ≠ ledger. |
| TRIGGER | Payment succeeds, wallet balance increments, ledger insert fails (DB error/timeout). |
| IMPACT | Balance/ledger mismatch, reconciliation impossible, free credit. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | VERY HARD |

**BUG-FIN-002** — Duplicate payment callback processed twice → double wallet credit.

**BUG-FIN-003** — Refund issued for more than the original charge (fee recalculation on refund path differs from capture path).

**BUG-FIN-004** — Double refund: user requests refund, retries after timeout; two refund rows created, one not idempotently deduplicated.

**BUG-FIN-005** — Payment succeeded but no ride/order entitlement created (payment-first flow): paid-for service never bookable.

**BUG-FIN-006** — Fare quote in BDT shown to rider, settlement in paisa to driver; unit conversion error at a boundary (e.g., ৳1.005 rounding) loses/gains paisa per trip.

**BUG-FIN-007** — Waiting charge accrues while ride is actually cancelled but the timer keeps running against the stale record.

**BUG-FIN-008** — Tip applied after payment settlement; tip is credited to driver but the rider's card is never charged (order-of-operations bug).

**BUG-FIN-009** — Promotion applies at quote time but not at settlement (or vice versa) — rider charged full, promo recorded as used.

**BUG-FIN-010** — Pass-based discount bypasses fare validation; negative fare possible if pass value > fare and validation missing.

**BUG-FIN-011** — Tax computed on pre-discount vs post-discount inconsistently across report and invoice.

**BUG-FIN-012** — Double-entry accounting: debit leg succeeds, credit leg fails — books no longer balance.

**BUG-FIN-013** — Payout to driver/vendor triggered before earnings are final (cancelled/reversed), producing over-payout.

**BUG-FIN-014** — Wallet top-up credited but payment provider later reverses it (chargeback) — top-up not clawed back.

**BUG-FIN-015** — Referral/loyalty reward credited twice on duplicate account-creation events.

**BUG-FIN-016** — Coupon applied to two concurrent orders because usage-count check is read-then-write, not atomic.

**BUG-FIN-017** — Mid-ride fare renegotiation (multi-stop add) recalculates on stale distance, under/over-charging.

---

## E. Promotions, Passes, Call Packages

**BUG-PROMO-001** — Pass activation is not idempotent: retry creates two pass activations, doubling entitlements.

**BUG-PROMO-002** — A pass is used and consumed on a ride that is later refunded — entitlement not restored.

**BUG-PROMO-003** — Promo eligibility evaluated at quote but flag/pass expires between quote and settlement — rider charged without discount while UI showed discount.

**BUG-PROMO-004** — Concurrent use of the same single-use pass from two devices.

**BUG-PROMO-005** — Call package minutes decremented on a call that never connected (network failure).

---

## F. Location & H3 Geospatial

**BUG-LOC-001**

| CATEGORY | Data / Geospatial |
| MODULE | Location / H3 |
| POSSIBLE BUG | H3 cell resolution mismatch between services — one service uses resolution 7, another resolution 8 — rider and driver considered "in different cells" despite being adjacent. |
| IMPACT | Missed matches, wrong zone pricing, failed eligibility. |
| SEVERITY | HIGH | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-LOC-002** — GPS spoofing: driver fakes location to be inside a surge zone, inflating fare/pickup assignment.

**BUG-LOC-003** — Stale GPS: driver location not refreshed for N minutes; dispatch still uses the stale point.

**BUG-LOC-004** — GPS drift across a zone boundary at quote-vs-ride time changes fare zone.

**BUG-LOC-005** — ETA computed from a cached location while distance/fare computed from a fresher one — inconsistent trip metadata.

**BUG-LOC-006** — Snap-to-road failure on bridges/rivers in Dhaka produces wildly wrong pickup points.

---

## G. Marketplace — Shops, Products, Orders, RFQ, Rental Bidding

**BUG-MKT-001**

| CATEGORY | Concurrency / State Machine |
| MODULE | Marketplace / Rental bidding |
| POSSIBLE BUG | Sealed-bid deadline race: two bids submitted just before deadline; one processed after the deadline but still accepted (or vice versa, a valid on-time bid rejected). |
| TRIGGER | Server clock skew between app nodes; deadline check on a different node than bid ingest. |
| IMPACT | Unfair award, grievance, wrong winner. |
| SEVERITY | HIGH | LIKELIHOOD | MEDIUM | DETECTION | VERY HARD |

**BUG-MKT-002** — Sealed-bid visibility leak: bids exposed in a listing/detail endpoint before deadline (missing field masking).

**BUG-MKT-003** — Double award: two bidders both marked winner after a retry/race.

**BUG-MKT-004** — Old winner keeps receiving events after award revocation/demotion.

**BUG-MKT-005** — Driver/vehicle changed after rental award; old vehicle still assigned in downstream delivery.

**BUG-MKT-006** — Inventory decrement is non-atomic: two orders for the last item both succeed.

**BUG-MKT-007** — Shop soft-delete while orders in flight; order still fulfills against deleted shop.

**BUG-MKT-008** — RFQ expiry fires while bids are still being accepted due to clock boundary.

**BUG-MKT-009** — Cross-vertical exclusivity: same driver simultaneously eligible for rental, delivery, and emergency dispatch — resource committed twice.

**BUG-MKT-010** — Order refund after delivery began; driver earnings already settled.

---

## H. Delivery, Courier, Food Bridge

**BUG-DELIVERY-001**

| CATEGORY | Cross-service / State Machine |
| MODULE | Food delivery bridge |
| POSSIBLE BUG | Food order → delivery request bridge created twice (retry), producing duplicate delivery legs for one order. |
| IMPACT | Double driver assignment, double delivery fee, duplicate payout. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-DELIVERY-002** — Order cancelled but delivery leg still active; driver picks up food that was already refunded.

**BUG-DELIVERY-003** — Delivery fee calculated on stale distance; shop customer charged wrong fee.

**BUG-DELIVERY-004** — Food order completed but delivery leg stuck "in-progress" — driver cannot take next job.

**BUG-DELIVERY-005** — Courier package marked delivered via driver app retry after rider disputed non-delivery.

**BUG-DELIVERY-006** — Truck rental: vehicle returned late but billing uses scheduled return time.

---

## I. Emergency / Ambulance

**BUG-AMB-001**

| CATEGORY | Safety / State Machine |
| MODULE | Emergency / Ambulance |
| POSSIBLE BUG | Certification expiry/revocation not immediately reflected in dispatch eligibility; a de-certified provider still receives emergency broadcasts due to cached eligibility. |
| IMPACT | Unqualified provider dispatched for medical emergency — safety-critical. |
| SEVERITY | CRITICAL | LIKELIHOOD | LOW-MEDIUM | DETECTION | VERY HARD |

**BUG-AMB-002** — First-accept race on an emergency: two ambulances both commit to the same call.

**BUG-AMB-003** — Emergency broadcast sent to stale provider list including offline/dead providers.

**BUG-AMB-004** — Wrong geographic radius: emergency broadcast limited to a radius computed from a stale incident location.

**BUG-AMB-005** — Scheduled ambulance trip and urgent dispatch diverge: the same vehicle is double-booked.

**BUG-AMB-006** — Emergency request cancelled but provider notification already sent; provider arrives and treats a non-existent patient.

---

## J. Fleet & Multi-Tenancy

**BUG-FLEET-001** — Double vehicle assignment: two drivers assigned the same vehicle in overlapping windows.

**BUG-FLEET-002** — Reassignment race: admin moves vehicle while driver is mid-ride; stale vehicle pointer on active ride.

**BUG-FLEET-003** — Subscription limit exceeded: fleet adds drivers beyond paid tier because limit check is non-atomic.

**BUG-FLEET-004** — Fleet role downgrade doesn't revoke per-driver capabilities immediately.

**BUG-FLEET-005** — Fleet billing runs on a driver count snapshot taken before a late deletion — overcharge.

**BUG-FLEET-006** — Alerts (e.g., vehicle service due) generated from stale odometer data after vehicle transfer.

---

## K. Scheduler & Background Jobs

**BUG-JOB-001**

| CATEGORY | Distributed / Async |
| MODULE | Scheduler |
| POSSIBLE BUG | Duplicate job execution when a job is picked up by two workers before the lease/lock is recorded (or lock is released on timeout while the first worker is still running). |
| IMPACT | Double payouts, double dispatches, double notifications. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | VERY HARD |

**BUG-JOB-002** — Job runs on stale state: reads a ride that has since been cancelled and acts on the old state.

**BUG-JOB-003** — Missed schedule: node restarts and a due job is skipped, leaving rides stuck.

**BUG-JOB-004** — Backlog cascading delay: one slow job blocks a queue, causing later time-sensitive jobs (no-show timers, promos) to fire late.

**BUG-JOB-005** — Overlapping runs: the same cron job runs twice because the previous run exceeded its interval.

**BUG-JOB-006** — Partial execution: multi-step job fails midway (e.g., wallet credited but pass not activated).

**BUG-JOB-007** — Scheduler and user action race: job fires "no-show" while user is simultaneously completing the ride.

---

## L. WebSocket / Events / Notifications

**BUG-EVENT-001** — Duplicate event emission on reconnect: client replays and receives the same push twice.

**BUG-EVENT-002** — Out-of-order events: a stale event (status=ACTIVE) arrives after a newer one (status=CANCELLED) and the client renders the older state.

**BUG-EVENT-003** — Missing event: connection drop means the driver never learns of cancellation, keeps driving.

**BUG-EVENT-004** — Wrong recipient: event broadcast to an old subscriber after reassignment.

**BUG-EVENT-005** — Notification sent after cancellation (post-cancellation push) with a stale deep link.

**BUG-EVENT-006** — Multi-device inconsistency: rider's two phones show different ride states for a long window.

**BUG-EVENT-007** — Push and in-app state diverge: app was backgrounded and missed the authoritative event, then local state replay conflicts.

---

## M. Time, Units, Config, Feature Flags

**BUG-CONFIG-001**

| CATEGORY | Config / Unit |
| MODULE | Cross-cutting |
| POSSIBLE BUG | Unit mismatch: one service treats distance as metres, another as kilometres — fare/ETA grossly wrong at scale. |
| IMPACT | Wrong fare, wrong dispatch radius, wrong ETA. |
| SEVERITY | HIGH | LIKELIHOOD | LOW-MEDIUM | DETECTION | MEDIUM |

**BUG-CONFIG-002** — Time stored in UTC but compared in Dhaka (+6); midnight expiry fires 6 hours off.

**BUG-CONFIG-003** — Countdown timers drift because client clock, not server clock, drives expiry.

**BUG-CONFIG-004** — Percent stored as decimal in one place (0.15) and percentage in another (15) — a 100× promo discount.

**BUG-CONFIG-005** — Feature flag enabled in API but not in mobile client (or vice versa) — different behavior layers.

**BUG-CONFIG-006** — Money stored as float in one ledger path and integer paisa in another — rounding drift.

**BUG-CONFIG-007** — Midnight/month-end boundary: subscription or pass expires during the boundary and two paths disagree about validity.

---

## N. Mobile / Network

**BUG-MOBILE-001**

| CATEGORY | Distributed / Async |
| MODULE | Mobile client |
| POSSIBLE BUG | Server completed the ride but the client never received the response (timeout) — client retries completion, creating a duplicate completion request. |
| IMPACT | Double rating, double payout, duplicate ledger entry. |
| SEVERITY | HIGH | LIKELIHOOD | MEDIUM | DETECTION | HARD |

**BUG-MOBILE-002** — Local queue replay after backgrounding replays an old cancellation that overrides a newer action.

**BUG-MOBILE-003** — Reconnect triggers full-state resync that clobbers an in-flight user action.

**BUG-MOBILE-004** — Client-side fare display cached from quote while server re-quotes — user pays more than shown.

**BUG-MOBILE-005** — Two devices both submit conflicting ride actions (cancel + rebook).

---

## O. Cross-Service & Data Consistency

**BUG-DATA-001**

| CATEGORY | Cross-service |
| MODULE | Ride → Payment → Wallet → Ledger |
| POSSIBLE BUG | Chain of "A succeeds, B fails": payment captured but wallet not credited; wallet credited but ledger not written — leaving partial states that no reconciliation job covers. |
| IMPACT | Financial inconsistency, unreconciled money. |
| SEVERITY | CRITICAL | LIKELIHOOD | MEDIUM | DETECTION | VERY HARD |

**BUG-DATA-002** — Orphan records: a ride row exists with no payment row, or a payment with no ride, after a partial transaction.

**BUG-DATA-003** — Mismatched counters: ride count on driver ≠ actual ride count (increment/decrement paths diverge).

**BUG-DATA-004** — Soft-delete leaves child records active (ride soft-deleted but its payment/wallet rows remain "active").

**BUG-DATA-005** — Cache staleness: balance shown to user is a cached value seconds behind the ledger.

**BUG-DATA-006** — Tax/accounting report generated from a different snapshot than the wallet — figures don't reconcile.

---

## P. Security & Fraud

**BUG-SEC-001** — Refund abuse: user triggers refund and chargeback simultaneously, recovering twice.

**BUG-SEC-002** — Promotion abuse via concurrent coupon redemption (read-then-write usage counter).

**BUG-SEC-003** — Location spoofing inflates surge fare or grabs high-value dispatches.

**BUG-SEC-004** — Replay attack on ride PIN/SOS endpoint with a captured request.

**BUG-SEC-005** — Price manipulation via client-supplied fare parameters if any endpoint trusts client values.

**BUG-SEC-006** — Collusion: driver and rider fake a ride to harvest incentives/pass benefits.

**BUG-SEC-007** — OTP brute-force or rate-limit bypass; per-phone limiting only.

**BUG-SEC-008** — Wallet negative balance reached via concurrent debits (non-atomic balance check).

---

# PART 2 — TOP 100 BUGS TO INVESTIGATE FIRST

Prioritized by financial damage, security, safety, likelihood, and cross-service blast radius. IDs map to Part 1; **bold** = highest combined priority.

**Tier 1 — Critical financial/security/safety (investigate immediately)**
1. BUG-FIN-001 (wallet≠ledger atomicity)
2. BUG-FIN-002 (duplicate payment callback)
3. BUG-FIN-003 (refund > original)
4. BUG-FIN-004 (double refund)
5. BUG-FIN-012 (double-entry imbalance)
6. BUG-FIN-013 (over-payout before final)
7. BUG-DISPATCH-001 (double dispatch)
8. BUG-AUTH-001 (stale role permissions)
9. BUG-AUTH-002 (fleet tenant leak)
10. BUG-AMB-001 (de-certified provider dispatch)
11. BUG-JOB-001 (duplicate job execution)
12. BUG-DATA-001 (payment-wallet-ledger partial chain)
13. BUG-SEC-001 (refund + chargeback double recovery)
14. BUG-SEC-008 (concurrent debit → negative wallet)
15. BUG-FIN-005 (payment without entitlement)
16. BUG-FIN-010 (negative fare via pass)
17. BUG-SEC-005 (client-supplied price manipulation)
18. BUG-MKT-001 (sealed-bid deadline race)
19. BUG-MKT-003 (double rental award)
20. BUG-DELIVERY-001 (duplicate food-delivery bridge)

**Tier 2 — High-impact state/concurrency**
21. BUG-RIDE-001 (terminal→active reversal)
22. BUG-RIDE-002 (double completion)
23. BUG-RIDE-003 (cancellation fee after refund)
24. BUG-RIDE-004 (double no-show charge)
25. BUG-RIDE-009 (auto-redispatch lock leak)
26. BUG-DISPATCH-002 (auto-accept vs redispatch)
27. BUG-DISPATCH-004 (offline driver receives job)
28. BUG-DISPATCH-005 (timeout not broadcast)
29. BUG-MKT-002 (sealed-bid visibility leak)
30. BUG-MKT-004 (old winner receives events)
31. BUG-MKT-005 (vehicle changed after award)
32. BUG-MKT-006 (last-item double order)
33. BUG-DELIVERY-002 (cancelled order, active delivery)
34. BUG-DELIVERY-004 (delivery stuck in-progress)
35. BUG-AMB-002 (first-accept race)
36. BUG-AMB-005 (scheduled vs urgent double-book)
37. BUG-FLEET-001 (double vehicle assignment)
38. BUG-FLEET-002 (reassignment mid-ride)
39. BUG-JOB-002 (job on stale state)
40. BUG-JOB-007 (job vs user action race)

**Tier 3 — Financial logic**
41. BUG-FIN-006 (BDT/paisa rounding)
42. BUG-FIN-007 (waiting charge on cancelled)
43. BUG-FIN-008 (tip credited, card not charged)
44. BUG-FIN-009 (promo quote-vs-settlement)
45. BUG-FIN-011 (tax base inconsistency)
46. BUG-FIN-014 (top-up chargeback clawback)
47. BUG-FIN-015 (referral double credit)
48. BUG-FIN-016 (coupon concurrent use)
49. BUG-FIN-017 (multi-stop re-quote)
50. BUG-PROMO-001 (pass double activation)
51. BUG-PROMO-002 (refunded ride, lost entitlement)
52. BUG-PROMO-003 (promo expiry between quote/settle)
53. BUG-PROMO-004 (same pass two devices)
54. BUG-PROMO-005 (call package decremented on failed call)
55. BUG-MKT-010 (refund after delivery began)

**Tier 4 — Location/matching**
56. BUG-LOC-001 (H3 resolution mismatch)
57. BUG-LOC-002 (location spoofing)
58. BUG-LOC-003 (stale GPS dispatch)
59. BUG-LOC-004 (zone drift quote-vs-ride)
60. BUG-LOC-005 (ETA vs distance inconsistency)
61. BUG-LOC-006 (bridge/river snap-to-road)
62. BUG-DISPATCH-003 (stale H3 cell)
63. BUG-DISPATCH-006 (cached location vs fare quote)
64. BUG-DISPATCH-007 (queue starvation)
65. BUG-DISPATCH-008 (cross-zone fare)

**Tier 5 — Event/notification/mobile**
66. BUG-EVENT-001 (duplicate reconnect push)
67. BUG-EVENT-002 (out-of-order events)
68. BUG-EVENT-003 (missing cancellation event)
69. BUG-EVENT-004 (wrong recipient)
70. BUG-EVENT-005 (post-cancellation push)
71. BUG-EVENT-006 (multi-device inconsistency)
72. BUG-EVENT-007 (push vs in-app divergence)
73. BUG-MOBILE-001 (duplicate completion retry)
74. BUG-MOBILE-002 (queue replay override)
75. BUG-MOBILE-003 (resync clobbers action)
76. BUG-MOBILE-004 (cached fare vs re-quote)
77. BUG-MOBILE-005 (two-device conflict)

**Tier 6 — Scheduler/jobs**
78. BUG-JOB-003 (missed schedule)
79. BUG-JOB-004 (backlog cascading delay)
80. BUG-JOB-005 (overlapping cron)
81. BUG-JOB-006 (partial execution)

**Tier 7 — Config/units/time**
82. BUG-CONFIG-001 (unit mismatch)
83. BUG-CONFIG-002 (UTC vs Dhaka)
84. BUG-CONFIG-003 (client clock countdown)
85. BUG-CONFIG-004 (percent vs decimal)
86. BUG-CONFIG-005 (flag layer mismatch)
87. BUG-CONFIG-006 (float vs integer money)
88. BUG-CONFIG-007 (midnight/month-end expiry)

**Tier 8 — Data consistency / security**
89. BUG-DATA-002 (orphan records)
90. BUG-DATA-003 (mismatched counters)
91. BUG-DATA-004 (soft-delete children)
92. BUG-DATA-005 (cache staleness)
93. BUG-DATA-006 (tax vs wallet snapshot)
94. BUG-SEC-002 (coupon abuse)
95. BUG-SEC-003 (location spoof surge)
96. BUG-SEC-004 (PIN/SOS replay)
97. BUG-SEC-006 (fake ride collusion)
98. BUG-SEC-007 (OTP brute force)
99. BUG-AUTH-003 (soft-delete resurrection)
100. BUG-FLEET-005 (billing snapshot overcharge)

---

# PART 3 — TOP 30 RARE BUT SEVERE BUGS

Bugs most likely to escape ordinary QA because they require rare timing, multiple actors, provider failure, retries, multiple devices, or scheduler interaction.

| # | ID | Why it escapes testing | Type |
|---|---|---|---|
| 1 | BUG-RIDE-001 | Scheduler running concurrently with user cancellation | stale background modification |
| 2 | BUG-DISPATCH-001 | Two drivers on slow networks, ms-level race | double-accept |
| 3 | BUG-JOB-001 | Two workers + lock-release-on-timeout | duplicate job |
| 4 | BUG-FIN-001 | Crash between wallet and ledger writes | non-atomic chain |
| 5 | BUG-FIN-004 | User retry after timeout on refund | double refund |
| 6 | BUG-MKT-001 | Deadline exactly at node clock skew | sealed-bid boundary |
| 7 | BUG-AUTH-001 | Role change while session lives | stale permission |
| 8 | BUG-EVENT-002 | Reconnect delivers stale event after fresh one | out-of-order events |
| 9 | BUG-MOBILE-001 | Server success, client timeout, retry | duplicate completion |
| 10 | BUG-JOB-007 | Cron no-show fires during user completion | actor/job race |
| 11 | BUG-DATA-001 | Payment OK, wallet write fails mid-chain | cross-service partial |
| 12 | BUG-PROMO-003 | Promo expiry lands between quote and settle | boundary quote |
| 13 | BUG-AMB-005 | Scheduled and urgent dispatch interleave | resource conflict |
| 14 | BUG-FLEET-002 | Admin reassigns vehicle during active ride | pointer race |
| 15 | BUG-MKT-004 | Old winner receives post-revocation events | ghost event stream |
| 16 | BUG-DELIVERY-001 | Bridge retry duplicates the order bridge | duplicate bridge |
| 17 | BUG-FIN-008 | Tip and settlement ordering flips | financial ordering |
| 18 | BUG-SEC-001 | Refund + chargeback overlap window | double recovery |
| 19 | BUG-CONFIG-004 | 0.15 vs 15 — a 100× discount | unit confusion |
| 20 | BUG-DISPATCH-002 | Auto-accept and auto-redispatch interleave | dual automations |
| 21 | BUG-EVENT-004 | Reassignment broadcasts to old subscriber | stale recipient |
| 22 | BUG-JOB-005 | Cron overlaps because run exceeds interval | overlap |
| 23 | BUG-MOBILE-002 | Background replay overrides newer action | stale replay |
| 24 | BUG-FIN-016 | Concurrent coupon redemption | read-then-write |
| 25 | BUG-MKT-007 | Shop deleted while order in flight | soft-delete drift |
| 26 | BUG-DATA-004 | Soft-deleted parent with live children | orphan children |
| 27 | BUG-FIN-014 | Chargeback after top-up | provider reversal |
| 28 | BUG-AUTH-002 | Driver transfers fleets, old link resolves | stale tenant pointer |
| 29 | BUG-CONFIG-002 | UTC/Dhaka at expiry boundary | timezone boundary |
| 30 | BUG-AMB-003 | Broadcast uses stale provider list | stale eligibility |

---

# PART 4 — SELF-CRITIQUE

**Coverage gaps / missed subsystems.** The catalogue is strong on ride, financial, marketplace, and scheduler interactions, but under-weights several areas that a verification pass should expand:

- **Tax & financial reporting**: VAT/SD calculation across multi-stop and cross-zone rides, tax on tips vs fare, and invoice-vs-ledger reconciliation are only lightly covered (BUG-FIN-011, BUG-DATA-006). A deeper pass should treat tax as its own domain.
- **Trust & safety (non-SOS)**: rider/driver blocking, harassment reporting, follow-up workflow, and the interaction of blocks with active rides are absent.
- **Referral/loyalty as a system**: covered piecemeal (BUG-FIN-015, BUG-PROMO-*) but the full reward lifecycle — claim, expiry, clawback on return, stacking rules — is not mapped end-to-end.
- **Payout/settlement pipeline**: driver/vendor payout batching, failed payout retries, and partial payout states are only touched (BUG-FIN-013); deserves its own analysis.
- **Workshops (repair service)**: listed in scope but not analyzed at all — appointment booking, parts ordering, job status, and payment have their own races.
- **Rating system**: mutual ratings, retaliation, and the race where a rating fires on a cancelled ride are unaddressed.
- **Admin actions racing normal operations**: e.g., admin force-cancels a ride while the rider is mid-payment — only indirectly implied.

**Missed races.**
- **Driver ↔ vehicle physical pairing**: a driver appears on two vehicles (or a vehicle appears on two drivers) through partial reassignment — only lightly covered via fleet.
- **Clock skew across nodes** as a first-class cause, rather than buried in a few entries (sealed-bid, UTC).
- **Idempotency-key collisions** when the same key is reused across different logical operations.

**Missed financial paths.**
- Chargeback **fee** pass-through to driver (not just clawback).
- Wallet **negative-balance** transitions during concurrent credit+debit.
- **Currency/unit drift** in stored tax percentages across services.
- Ledger **reversal** paths that only reverse one leg (half-reversal).

**Missed cross-service interactions.**
- Notification ↔ ride state: notifying a rider that a driver arrived for a ride that was re-dispatched.
- Fleet ↔ marketplace: a fleet vehicle reserved for a rental is dispatched on a ride-hail trip.
- Pass ↔ promo stacking rules across verticals (ride + food + rental in one pass).

**Missed security cases.**
- Internal API misuse by a fleet admin against parent-platform data.
- Webhook signature replay from a payment provider.
- Exported admin reports leaking PII through missing row-level policy.

**Likely duplicates to merge in a later pass.**
- BUG-RIDE-009 / BUG-DISPATCH-005 / BUG-DISPATCH-002 all describe variations of "lock released before assignment is final" — could be consolidated under one root condition.
- BUG-FIN-002 / BUG-JOB-001 / BUG-EVENT-001 share "duplicate processing of a retried/redelivered event" — a single idempotency audit would cover them.
- BUG-DATA-004 / BUG-AUTH-003 / BUG-MKT-007 share "soft-delete with live children" — one root cause to check.
- BUG-LOC-003 / BUG-DISPATCH-003 / BUG-DISPATCH-006 share "stale location used for a real decision."

**Honest limitation.** Because no codebase was inspected, the real defects are likely a *subset* of this catalogue, concentrated in whichever subsystem lacks idempotency keys, atomic transactions, or optimistic concurrency control. The verification model should first grep for those three primitives (idempotency, transactions, version checks) and map every absence back to the corresponding catalogue entries — that mapping would convert this theoretical survey into a concrete audit plan with dramatically higher precision.

---

**Summary of deliverables:** full catalogue (16 domains, ~120 hypothetical findings), top 100 prioritized leads, top 30 rare-but-severe leads, and a self-critique identifying gaps, duplicate merges, and the highest-leverage verification strategy (audit idempotency/atomicity/versioning primitives first). All findings remain hedged — none are confirmed against implementation.