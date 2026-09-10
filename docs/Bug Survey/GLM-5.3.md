# RIDE — Independent Possible-Bug Survey

**Status:** Theoretical catalogue. No codebase access. Every entry below is a **hypothesis to verify**, not an assertion that a defect exists. All language is hedged by design.

**Ratings legend:** Severity (CRITICAL/HIGH/MEDIUM/LOW) · Likelihood (VERY HIGH→VERY LOW) · Detection difficulty (VERY HARD→VERY EASY). Likelihood estimates the probability the *architectural condition* produces the failure at production scale, not that the code is wrong.

---

## 1. FULL BUG CATALOGUE

Format note: all required fields are preserved; presented as compact records for readability.

---

### 1.1 Authentication, Authorization, Roles, Tenancy

**BUG-AUTH-001 · Security/Fraud · Auth/Profiles — Cross-profile token misuse (rider ↔ driver)**
- **Possible bug:** A user holding both rider and driver profiles could have one profile's session accepted by endpoints intended for the other, if authorization checks authentication but not the active profile binding.
- **Trigger / scenario:** Driver onboarded on the same phone number opens the rider app mid-shift; a session minted under the rider profile is used against driver-action endpoints.
- **Why plausible:** Multi-profile accounts commonly split "who you are" from "what you can do"; claim staleness after onboarding is a classic gap.
- **Impact:** Driver actions performed and audited under the wrong identity; earnings/dispatch confusion.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Auth, Ride-hailing, Fleet, Audit.

**BUG-AUTH-002 · Security/Fraud · Admin/Multi-tenancy — Tenant-scope leakage via object references**
- **Possible bug:** Fleet-scoped objects could be readable or mutable by another tenant's admin if ownership filtering is not applied consistently across the very large admin surface.
- **Trigger / scenario:** A tenant admin supplies another tenant's vehicle or driver identifier in a lookup/update call.
- **Why plausible:** With roughly 205 admin routes, per-route object-scope checks are easy to miss on less-used paths.
- **Impact:** Cross-tenant PII and financial data exposure; cross-tenant mutation.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Admin, Fleet, Marketplace.

**BUG-AUTH-003 · Security/Fraud · Auth/RBAC — Stale role claims after demotion**
- **Possible bug:** A demoted or deactivated fleet role could remain effective until session expiry if roles are baked into tokens and revocation isn't pushed.
- **Trigger / scenario:** Fleet owner demotes a dispatcher; the dispatcher's live session keeps mutating fleet settings for hours.
- **Why plausible:** Stateless sessions without a revocation check are a common default.
- **Impact:** Unauthorized administrative changes after privilege removal.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Auth, Fleet, Admin.

**BUG-AUTH-004 · Concurrency · Fleet/Auth — Driver deactivation mid-ride**
- **Possible bug:** Deactivating a driver mid-ride could leave the ride orphaned, or credit earnings to an account the driver can no longer access.
- **Trigger / scenario:** Fleet admin deactivates a driver while the driver is completing a trip; payout routing and ride state diverge.
- **Why plausible:** Revocation flows and ride-lifecycle flows are owned by different services.
- **Impact:** Stuck rides, stranded riders, undeliverable earnings.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / MEDIUM / MEDIUM · **Affected:** Fleet, Ride-hailing, Payouts.

**BUG-AUTH-005 · Security/Fraud · Auth — Phone number recycling**
- **Possible bug:** If local operators recycle phone numbers, a new SIM owner could receive OTPs for the previous owner's account and take it over, including wallet balance.
- **Trigger / scenario:** Number reassigned by the operator; new owner requests OTP login; account has dormant wallet balance.
- **Why plausible:** Number recycling is common in dense mobile markets; OTP-only recovery offers no other binding.
- **Impact:** Full account takeover with financial loss to the original user.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Auth, Wallet, Trust & Safety.

**BUG-AUTH-006 · Security/Fraud · Auth/OTP — OTP replay window with multiple valid codes**
- **Possible bug:** Older OTPs might remain valid after a new one is issued, widening the interception window; SMS delivery delays make users act on stale codes.
- **Trigger / scenario:** User requests OTP twice due to slow SMS; both codes accepted.
- **Why plausible:** Invalidation-on-issue is easy to omit; provider latency makes it visible.
- **Impact:** Account takeover if any single OTP leaks.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Auth, SMS provider.

**BUG-AUTH-007 · Functional · Ride-hailing/OTP — Ride-start OTP confused with login OTP**
- **Possible bug:** If ride OTPs and login OTPs share format and validation is only format-based, a login OTP could start a ride (or vice versa).
- **Trigger / scenario:** Driver prompts OTP; rider pastes the login code received moments earlier.
- **Why plausible:** Two OTP systems on one phone with identical length.
- **Impact:** Ride started without correct rider verification — safety risk.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / MEDIUM / EASY · **Affected:** Ride-hailing, Auth.

**BUG-AUTH-008 · Security/Fraud · Ride-hailing/PIN — Ride PIN brute force**
- **Possible bug:** Ride PIN verification might lack attempt limits or lockout, letting a malicious driver guess the PIN and start a trip without the rider.
- **Trigger / scenario:** Driver enters repeated guesses on a 4-digit PIN with no throttling.
- **Why plausible:** Safety PINs are often added late; rate limiting on a per-ride scope is easy to miss.
- **Impact:** Rider impersonation, unauthorized trip start, safety incident.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / EASY · **Affected:** Ride-hailing, Trust & Safety.

**BUG-AUTH-009 · Security/Fraud · Auth — Password reset doesn't revoke other devices**
- **Possible bug:** A reset performed on one device might not invalidate sessions on other devices if revocation is per-token rather than per-session-family.
- **Trigger / scenario:** User resets password after suspicious login; attacker's session survives.
- **Why plausible:** Device-scoped logout is the simpler implementation.
- **Impact:** Continued attacker access post-reset.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Auth.

**BUG-AUTH-010 · Security/Fraud · Fleet/RBAC — Over-broad "viewer"-style roles**
- **Possible bug:** Read-only roles could inherit mutation capability on some paths if route guards check coarse role groups rather than specific permissions.
- **Trigger / scenario:** Fleet viewer role passes the guard on an update path grouped with read paths.
- **Why plausible:** RBAC matrices of this size drift; route grouping by prefix is a common shortcut.
- **Impact:** Unauthorized fleet changes; audit confusion.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Admin, Fleet, RBAC.

**BUG-AUTH-011 · Fraud · Fleet — Shared driver credentials**
- **Possible bug:** Multiple drivers sharing one account could interleave location streams and split incentives, defeating per-driver safety checks.
- **Trigger / scenario:** Two drivers log in as the same driver from different devices in different cities.
- **Why plausible:** Account sharing is economically attractive and hard to prevent without device binding.
- **Impact:** Safety (unknown actual driver), incentive fraud, rating corruption.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Fleet, Incentives, Trust & Safety.

---

### 1.2 Dispatch & Matching

**BUG-DISPATCH-001 · Concurrency · Dispatch — One driver matched to two riders**
- **Possible bug:** Two matching computations could both see a driver as available and assign different riders, if availability is a read-then-write flag without atomic reservation.
- **Trigger / scenario:** Two riders request in the same H3 cell within the same instant.
- **Why plausible:** Check-then-act on an availability flag is the default naive design.
- **Impact:** Two riders told the same driver is en route; double cancellations and fees; severe rider trust damage.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Dispatch, Rider app, Driver app.

**BUG-DISPATCH-002 · Concurrency · Dispatch — Auto-accept vs manual accept race**
- **Possible bug:** An auto-accept job could commit a ride to a driver at the same moment the driver manually accepts a different offer, leaving the driver double-committed.
- **Trigger / scenario:** Auto-accept timer expires while the driver is tapping accept on another broadcast.
- **Why plausible:** Two acceptance paths (scheduled and human) writing the same commitment state.
- **Impact:** Overlapping rides; no-show cascades.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Dispatch, Driver app.

**BUG-DISPATCH-003 · Concurrency · Dispatch — First-accept double acknowledgement**
- **Possible bug:** With offers broadcast to N drivers, two near-simultaneous accepts could both be acknowledged (ack sent before deduplication) and one driver revoked only after being told they won.
- **Trigger / scenario:** Two drivers accept within the same processing window under load.
- **Why plausible:** Acknowledgement-before-serialization is a classic race under broadcast fan-out.
- **Impact:** A driver already driving to the pickup gets yanked; cancellation-fee disputes.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Dispatch, Notifications.

**BUG-DISPATCH-004 · Concurrency · Dispatch — Redispatch without notifying the original driver**
- **Possible bug:** A re-dispatch timeout job could reassign the rider while the original driver, still en route, is not notified (or is notified too late).
- **Trigger / scenario:** Driver in traffic; availability-timeout fires; rider matched elsewhere; original driver arrives to nobody.
- **Why plausible:** Timeout jobs and notification fan-out are separate failure domains.
- **Impact:** Wasted driver time, two drivers converging on one rider, fare disputes.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Dispatch, Notifications, Rider app.

**BUG-DISPATCH-005 · Functional · Dispatch/Location — Matching on stale location**
- **Possible bug:** Driver GPS older than a freshness threshold could still drive matching and ETA, producing wildly wrong assignments.
- **Trigger / scenario:** Driver's location stream stalls in a dense urban canyon; last-known point used.
- **Why plausible:** Freshness checks may exist in one consumer but not all.
- **Impact:** Bad ETAs, false "driver nearby", cascading cancellations.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Dispatch, Location, ETA.

**BUG-DISPATCH-006 · Functional · Dispatch/H3 — Resolution or neighbour mismatch across services**
- **Possible bug:** Matching, ETA, and fare-zone logic could use different H3 resolutions or neighbour definitions, so a pair considered "near" by one service is "far" by another.
- **Trigger / scenario:** Rider and driver near a cell boundary at coarse resolution; ETA service uses fine resolution.
- **Why plausible:** H3 parameters are easy to set independently per consuming service.
- **Impact:** Inconsistent matching vs ETA vs zone-based fare; hard-to-explain rider experiences.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Dispatch, Location, Fare.

**BUG-DISPATCH-007 · Concurrency · Cross-vertical — Non-atomic cross-vertical availability (double-booking)**
- **Possible bug:** Driver/resource availability might be tracked per vertical (ride-hail, delivery, rental, emergency), so an assignment in one vertical might not atomically block the others.
- **Trigger / scenario:** Delivery assignment and ride-hail match commit concurrently for the same driver.
- **Why plausible:** Verticals built at different times often keep local availability with at-best eventual sync.
- **Impact:** Driver double-booked across services; one rider/order left waiting; SLA breaches.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Dispatch, Delivery, Rental, Emergency.

**BUG-DISPATCH-008 · Concurrency · Dispatch/Presence — Assignment at the instant the driver goes offline**
- **Possible bug:** A match committed just as the driver toggles offline could leave a ride assigned to an unavailable driver until timeout.
- **Trigger / scenario:** Presence flip and match commit interleave; neither rolls back.
- **Why plausible:** Presence and matching are separate write paths.
- **Impact:** Rider waits out a timeout; dispatch waste.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Dispatch, Presence, Rider app.

**BUG-DISPATCH-009 · Business Logic · Dispatch/Fare — Surge computed at quote vs dispatch**
- **Possible bug:** Rider fare quoted pre-surge but settled post-surge (or driver paid on the other basis) if surge is sampled at different pipeline stages.
- **Trigger / scenario:** Demand spikes between quote and match.
- **Why plausible:** Quote, dispatch, and settlement each read demand state at their own time.
- **Impact:** Charge ≠ quote; margin leakage or rider overcharge; disputes.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Dispatch, Fare, Payments.

**BUG-DISPATCH-010 · Distributed/Async · Dispatch/Scheduler — Scheduled ride dispatched twice**
- **Possible bug:** A retrying dispatch job could emit the dispatch event twice, assigning two drivers to one scheduled ride.
- **Trigger / scenario:** Job timeout → retry; both runs execute.
- **Why plausible:** At-least-once job semantics without a per-request dispatch idempotency guard.
- **Impact:** Two drivers for one rider; one driver's wasted trip; fee confusion.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Dispatch, Scheduler, Notifications.

**BUG-DISPATCH-011 · Concurrency · Ride/Dispatch — Rider cancel vs driver accept write race**
- **Possible bug:** A cancellation and an acceptance processed concurrently could overwrite each other, e.g., ride left ACCEPTED while rider believes it cancelled, or cancelled while driver believes accepted.
- **Trigger / scenario:** Rider taps cancel as driver taps accept on a laggy connection.
- **Why plausible:** Terminal-state writes from two actors with no single arbiter.
- **Impact:** Driver drives to nobody; cancellation fee charged to a rider who cancelled validly; support burden.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Ride, Dispatch, Fees.

**BUG-DISPATCH-012 · Business Logic · Dispatch — Auto-accept during an active multi-stop ride**
- **Possible bug:** Auto-accept could fire while the driver still has an active trip (especially multi-stop), creating overlapping commitments.
- **Trigger / scenario:** Auto-accept enabled; multi-stop ride nearing final stop; new broadcast accepted.
- **Why plausible:** Capacity checks may consider only "idle" vs "busy", not in-progress-with-stops.
- **Impact:** Overlapping rides; late pickups; safety pressure on driver.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Dispatch, Multi-stop rides.

**BUG-DISPATCH-013 · Stale data · Dispatch/Fleet — Stale vehicle-type binding**
- **Possible bug:** Matching could use the vehicle the driver started the shift with, even after a mid-shift vehicle change.
- **Trigger / scenario:** Driver swaps bike→car; matching cache still returns bike.
- **Why plausible:** Driver-vehicle bindings cached for the session.
- **Impact:** Wrong vehicle class dispatched; fare mismatch.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Dispatch, Fleet, Fare.

---

### 1.3 Ride Lifecycle, Cancellation, No-show, OTP/PIN, Multi-stop, Scheduled

**BUG-RIDE-001 · State Machine · Ride — Completion applied after cancellation (out-of-order events)**
- **Possible bug:** A delayed completion event (offline queue, async backlog) could flip a cancelled ride to completed and charge the rider.
- **Trigger / scenario:** Driver loses connectivity near drop-off; rider cancels due to silence; driver's queued completion replays later.
- **Why plausible:** Event ordering is not guaranteed across queues; terminal-state guards may key on event type, not sequence.
- **Impact:** Rider charged for a ride they cancelled; ghost ride in records.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Ride, Payments, Support.

**BUG-RIDE-002 · Retry/Idempotency · Ride — Double completion → double charge**
- **Possible bug:** Tapping "complete" twice with a flaky network could produce two completion records and two charges if completion lacks an idempotency guard.
- **Trigger / scenario:** First request times out client-side but succeeds server-side; client retries.
- **Why plausible:** Standard timeout-retry without idempotency key.
- **Impact:** Double fare, double ledger entries, refund cost.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Ride, Fare, Ledger.

**BUG-RIDE-003 · Concurrency · Ride — Mutual no-show claims**
- **Possible bug:** Rider marks driver no-show while driver marks rider no-show; both decisions processed, charging the rider a no-show fee and crediting the driver, or double-cancelling free, depending on write order.
- **Trigger / scenario:** Pickup confusion; both parties tap their no-show button within the dispute window.
- **Why plausible:** Two symmetric flows with no cross-check.
- **Impact:** Wrong fee; trust damage; support load.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Ride, Fees, Support.

**BUG-RIDE-004 · Business Logic · Ride/Fees — Cancellation fee from stale arrival state**
- **Possible bug:** The fee decision could read driver-arrival state captured before the arrival event landed, charging a within-free-window fee (or waiving a post-arrival fee).
- **Trigger / scenario:** Arrival event queued; cancellation processed concurrently from a snapshot.
- **Why plausible:** Fee logic consumes a state snapshot, not a point-in-time join with the event stream.
- **Impact:** Systematic mis-charging at the boundary; disputes.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Ride, Fees, Wallet.

**BUG-RIDE-005 · Concurrency · Ride — Waiting timer double-start**
- **Possible bug:** Geofence auto-arrival and manual "arrived" could both start waiting timers, doubling waiting minutes (or the second start could zero the first).
- **Trigger / scenario:** Driver taps arrived while auto-detection also fires.
- **Why plausible:** Two arrival sources writing the same timer state.
- **Impact:** Waiting charge doubled or lost; fare dispute.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Ride, Waiting charges, Fare.

**BUG-RIDE-006 · Business Logic · Ride/Multi-stop — Stop change mid-ride fare recompute**
- **Possible bug:** Removing/adding a stop after quote could recompute fare from scratch, double-counting traveled distance, or not recompute at all.
- **Trigger / scenario:** Rider removes the last stop mid-ride; recalculation path differs from incremental path.
- **Why plausible:** Two fare paths (pre-quote vs in-ride adjustment) rarely share logic exactly.
- **Impact:** Over/undercharge; margin drift.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Multi-stop, Fare, Ledger.

**BUG-RIDE-007 · Business Logic · Ride/Location — GPS gap interpolation overcharge**
- **Possible bug:** Signal loss in tunnels/underpasses could be bridged by straight-line interpolation across rivers or buildings, inflating distance fare.
- **Trigger / scenario:** Dense-city route with flyovers/metro segments; long GPS gap mid-ride.
- **Why plausible:** Interpolation is the default gap-filler; plausibility bounds on jumps are easy to omit.
- **Impact:** Recurring overcharges; complaint pattern tied to specific corridors.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Ride, Fare, Location.

**BUG-RIDE-008 · Concurrency · Ride/Location — Out-of-order location events inflate distance**
- **Possible bug:** If location points from WebSocket and batch ingestion aren't ordered by timestamp, path distance could zigzag and overcount.
- **Trigger / scenario:** Batch upload arrives after live socket points for the same segment.
- **Why plausible:** Dual ingestion channels with independent ordering.
- **Impact:** Distance fare inflation; ETA noise.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Ride, Location, Fare.

**BUG-RIDE-009 · Security · Ride/OTP — OTP accepted for the wrong (previous) ride**
- **Possible bug:** After re-dispatch, the driver could start the new ride using the OTP from the previous one if validation scopes to the driver, not the specific ride.
- **Trigger / scenario:** Re-dispatch; driver's app still shows the old OTP input.
- **Why plausible:** OTP context binding is easy to scope too loosely.
- **Impact:** Trip started without the correct rider's verification.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / MEDIUM / MEDIUM · **Affected:** Ride, OTP, Trust & Safety.

**BUG-RIDE-010 · Time · Ride/Scheduled — Local-midnight boundary for scheduled rides**
- **Possible bug:** A ride scheduled just after local midnight could land in the wrong UTC day and be missed or double-fired by day-window jobs.
- **Trigger / scenario:** 00:30 Dhaka ride; day-boundary job runs at UTC midnight (06:00 local).
- **Why plausible:** UTC storage with local-day business logic is endemic.
- **Impact:** Missed scheduled rides; angry riders at odd hours.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Scheduled rides, Scheduler.

**BUG-RIDE-011 · Business Logic · Ride/Tips — Tip credited to the pre-reassignment driver**
- **Possible bug:** A tip added after a mid-ride driver change could credit the original driver if the tip flow reads the ride's initial driver.
- **Trigger / scenario:** Rider tips post-completion after a reassignment occurred.
- **Why plausible:** Tip capture flows often denormalize driver at creation.
- **Impact:** Wrong payout; driver support cases.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Tips, Payouts.

**BUG-RIDE-012 · Concurrency · Ride — Second active ride location cross-talk**
- **Possible bug:** A rider creating a second ride while the first is active could have their location stream associated with the wrong ride, sending the wrong pickup position to a driver.
- **Trigger / scenario:** Rider books a ride for a family member from the same account.
- **Why plausible:** Location subscription keyed by user, ride association resolved implicitly.
- **Impact:** Driver sent to wrong pickup; cancellations.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Ride, Location, Dispatch.

**BUG-RIDE-013 · Stale data · Ride — Premature "arrived" from stale geofence trigger**
- **Possible bug:** A stale driver position just inside the pickup geofence could trigger arrival while the driver is actually far away, starting waiting charges early.
- **Trigger / scenario:** Last-known location inside geofence; driver rerouted around a block.
- **Why plausible:** Arrival auto-detection may trust last-known point without freshness gate.
- **Impact:** Rider billed waiting time while driver absent; disputes.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Ride, Waiting charges, Location.

**BUG-RIDE-014 · Time/Distributed · Ride/Fees — Free-window cancellation missed due to queue delay**
- **Possible bug:** A cancellation sent inside the free window could be processed after the window because server-side processing time (not client send time) decides the boundary.
- **Trigger / scenario:** Rider cancels at 2:59; queue lag processes at 3:01; fee applied.
- **Why plausible:** Boundary logic often uses processing timestamp.
- **Impact:** Wrong cancellation fees at boundaries; chargebacks.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Ride, Fees, Wallet.

**BUG-RIDE-015 · Business Logic · Ride/Fare — Peak/off-peak tariff boundary split**
- **Possible bug:** A ride crossing a tariff-change boundary could be charged entirely on the old or new rate instead of being split, in either direction.
- **Trigger / scenario:** Ride spanning the peak→off-peak transition.
- **Why plausible:** Split logic is fiddly; whole-ride rate selection is the lazy fallback.
- **Impact:** Systematic over/undercharge for boundary rides.
- **Severity/Likelihood/Detection:** MEDIUM / LOW-MEDIUM / HARD · **Affected:** Fare, Ledger, Reports.

---

### 1.4 Financial (wallet, payments, refunds, promotions, passes, tax, earnings, payouts)

**BUG-FIN-001 · Distributed/Async · Payments/Wallet — Duplicate top-up credit on provider retry**
- **Possible bug:** A retried payment callback carrying a different event identifier for the same underlying transaction could credit the wallet twice if deduplication keys on event ID rather than transaction ID.
- **Trigger / scenario:** Provider timeout → provider retries success notification with a fresh event ID.
- **Why plausible:** Providers legitimately regenerate event IDs; dedup on the wrong key is a classic.
- **Impact:** Free wallet balance; direct financial loss.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Wallet, Ledger, Reconciliation.

**BUG-FIN-002 · Distributed/Async · Payments/Wallet — Credit on "pending" before failure arrives**
- **Possible bug:** Wallet credit could be granted on a provisional callback, with a later failure event not reversing it if failure handling doesn't cover that state.
- **Trigger / scenario:** Pending callback processed; final failure event lands after rider already spent the balance.
- **Why plausible:** Optimistic credit improves UX and is easy to leave unreconciled.
- **Impact:** Balance without money; negative margin.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Wallet, Payments, Reconciliation.

**BUG-FIN-003 · Concurrency · Payments — Dual payment path executes both**
- **Possible bug:** A wallet debit and a direct gateway charge could both execute for one ride if a fallback/switch between payment paths races the primary path's confirmation.
- **Trigger / scenario:** Wallet path slow; fallback triggers gateway charge; wallet debit then completes.
- **Why plausible:** Failover logic written per-flow rather than globally.
- **Impact:** Rider double-charged for one trip.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / HARD · **Affected:** Payments, Wallet, Ride.

**BUG-FIN-004 · Business Logic · Refunds — Refund stacking exceeds original**
- **Possible bug:** Cancellation refund, dispute refund, and promo reversal could each be granted independently, summing above the original charge.
- **Trigger / scenario:** Support issues a manual refund while an automated refund for the same ride also runs.
- **Why plausible:** Refund sources in different flows without a shared "total refunded" guard.
- **Impact:** Net payout exceeding revenue; fraud magnet.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Refunds, Wallet, Support tooling.

**BUG-FIN-005 · Retry/Idempotency · Refunds — Double refund on retry**
- **Possible bug:** A retried refund call could execute twice if the refund operation lacks an idempotency key.
- **Trigger / scenario:** Refund request times out; support/automation retries.
- **Why plausible:** Refunds often go through support tooling outside the app's idempotency discipline.
- **Impact:** Double money returned.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Refunds, Gateway, Wallet.

**BUG-FIN-006 · Distributed/Async · Refunds — Gateway refund and wallet adjustment diverge**
- **Possible bug:** The gateway-side refund could succeed while the internal wallet/ledger adjustment fails (or vice versa), leaving books inconsistent with actual money movement.
- **Trigger / scenario:** Gateway refund completes; internal write fails transiently; no compensation.
- **Why plausible:** External and internal legs are separate transactions by nature.
- **Impact:** Wallet shows spendable balance for returned money (or money taken but never refunded).
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Refunds, Wallet, Ledger, Accounting.

**BUG-FIN-007 · Data consistency · Wallet/Ledger — Balance and ledger non-atomic drift**
- **Possible bug:** Wallet balance update and double-entry ledger insert could partially fail, so balance ≠ ledger sum over time.
- **Trigger / scenario:** Crash or partial failure between the two writes.
- **Why plausible:** Two stores, one logical operation, no transaction spanning them.
- **Impact:** Silent accounting corruption; audit failures much later.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Wallet, Ledger, Accounting.

**BUG-FIN-008 · Concurrency/Fraud · Wallet — Double withdrawal (TOCTOU)**
- **Possible bug:** Two concurrent withdrawal requests could both pass a sufficient-balance check and both execute, draining the wallet negative.
- **Trigger / scenario:** Two devices (or a script) submit withdrawals simultaneously.
- **Why plausible:** Check-then-act balance validation without row-level serialization.
- **Impact:** Direct cash loss; primary cash-out path for account-takeover fraud.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Wallet, Withdrawals, Fraud.

**BUG-FIN-009 · Concurrency · Wallet — Concurrent debits drive negative balance**
- **Possible bug:** Ride fee, marketplace order, and pass purchase debits landing together could each pass validation against the same stale balance.
- **Trigger / scenario:** Rider with a small balance completes a ride while a marketplace order charges.
- **Why plausible:** Optimistic balance checks are common for throughput.
- **Impact:** Negative balances; unrecovered debt.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Wallet, Ride, Marketplace.

**BUG-FIN-010 · Config · Finance — Paisa/BDT unit mismatch**
- **Possible bug:** One component could interpret a money value in BDT while another treats it as paisa, producing 100× errors in a fee, tax, or promotion.
- **Trigger / scenario:** A constant or config value added by one team in major units, consumed in minor units.
- **Why plausible:** Mixed-unit ecosystems are notorious; conversions at boundaries.
- **Impact:** 100× over/undercharges on a specific path.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / EASY (once triggered) · **Affected:** Fare, Tax, Promotions, Ledger.

**BUG-FIN-011 · Concurrency · Promotions — Single-use coupon concurrent redemption**
- **Possible bug:** The same single-use coupon could be redeemed twice if usage counting is check-then-act across two devices/sessions.
- **Trigger / scenario:** Two carts check out simultaneously with one coupon code.
- **Why plausible:** Usage counters updated after order creation.
- **Impact:** Promo budget overrun; abuse vector.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Promotions, Marketplace, Ride.

**BUG-FIN-012 · Distributed/Async · Referrals — Double referral credit (event + job)**
- **Possible bug:** A reward event handler and a periodic reconciliation/reward job could both credit a referral reward.
- **Trigger / scenario:** Event processed; job also sees unmarked reward and pays.
- **Why plausible:** Belt-and-braces reward designs double-pay when flags disagree.
- **Impact:** Duplicate wallet credits at scale.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Referrals, Wallet, Scheduler.

**BUG-FIN-013 · Business Logic · Promotions — Coupon usage not restored on refund**
- **Possible bug:** Refunding an order could fail to decrement coupon usage, leaving a single-use coupon consumed with nothing gained.
- **Trigger / scenario:** Order refunded after coupon applied.
- **Why plausible:** Refund reversal paths rarely enumerate all side-effects.
- **Impact:** User-visible unfairness; support cost.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Promotions, Refunds.

**BUG-FIN-014 · Business Logic · Promotions — Eligibility at quote vs settlement drift**
- **Possible bug:** Promo eligibility checked at quote time could be invalid by settlement (zone/time window changed), yet still applied — or valid and denied.
- **Trigger / scenario:** Time-window promo expiring mid-ride.
- **Why plausible:** Two evaluations of the same predicate at different instants.
- **Impact:** Invalid discounts granted or valid ones denied.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Promotions, Fare, Settlement.

**BUG-FIN-015 · Retry/Idempotency · Passes — Pass activation charged twice, one entitlement**
- **Trigger / scenario:** Activation request retried on timeout; two charges, one pass.
- **Why plausible:** Activation is a payment + entitlement pair; retry can double the payment leg only.
- **Impact:** Double charge; refund cost.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Passes, Payments, Wallet.

**BUG-FIN-016 · Business Logic · Passes — Overlapping passes double-discount**
- **Possible bug:** Two simultaneously active passes could both apply to one ride, stacking discounts.
- **Trigger / scenario:** Old pass not expired when a new one activates (boundary or upgrade path).
- **Why plausible:** Precedence rules are easy to define loosely.
- **Impact:** Margin leak; fare below cost.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Passes, Fare.

**BUG-FIN-017 · Time · Passes/Subscriptions — Month-end proration errors**
- **Possible bug:** Proration/expiry could be off by a day at month boundaries (28/29/30/31) or when local month-end crosses UTC.
- **Trigger / scenario:** Pass purchased on the 31st; renewal math in fixed 30-day months.
- **Why plausible:** Calendar arithmetic is deceptively hard.
- **Impact:** Wrong charges/expiries clustered at month-ends.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Passes, Subscriptions, Billing.

**BUG-FIN-018 · Distributed/Async · Waiting charges — Waiting fee computed by both a periodic job and the completion event**
- **Possible bug:** Two wait-time summarizers could both add waiting minutes to the final fare.
- **Trigger / scenario:** Job writes minutes; completion event independently recomputes and adds.
- **Why plausible:** Progressive calculation for UX + final calculation for billing, both authoritative.
- **Impact:** Doubled waiting fees on affected rides.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Waiting charges, Fare, Ledger.

**BUG-FIN-019 · Business Logic · Fare — Pickup fee charged on both the original and re-dispatched ride**
- **Possible bug:** A re-dispatch that creates a new ride record could re-apply the pickup fee already charged on the first.
- **Trigger / scenario:** System-initiated re-dispatch mid-ride.
- **Why plausible:** Fee logic attached to ride creation, blind to re-dispatch lineage.
- **Impact:** Double fee for one trip.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / MEDIUM / MEDIUM · **Affected:** Fare, Dispatch, Wallet.

**BUG-FIN-020 · Business Logic · Fees — Cancellation-fee split computed on inconsistent bases with rounding drift**
- **Possible bug:** Rider fee, platform share, and driver share could each round independently and/or be computed on different bases (fee vs fee+tax), so legs don't reconcile.
- **Trigger / scenario:** Volume of cancellations with odd amounts.
- **Why plausible:** Per-line rounding accumulates; split logic duplicated across payout and ledger.
- **Impact:** Chronic small discrepancies; reconciliation noise masking real bugs.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Fees, Payouts, Ledger, Accounting.

**BUG-FIN-021 · Business Logic · Earnings — No clawback when a completed ride is later refunded**
- **Possible bug:** Driver earnings credited at completion could remain when a rider dispute refunds the fare, leaving the platform to absorb it.
- **Trigger / scenario:** Refund issued days later; payout already made.
- **Why plausible:** Earning and refund lifecycles are disconnected in time.
- **Impact:** Margin loss per dispute; inconsistent policy enforcement.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Earnings, Refunds, Payouts.

**BUG-FIN-022 · Concurrency · Payouts — Payout job overlap pays twice**
- **Possible bug:** A long-running payout job overlapping its next scheduled trigger (no distributed lock) could pay the same earnings twice.
- **Trigger / scenario:** Data volume growth pushes runtime past the schedule interval.
- **Why plausible:** Overlap guards are invisible until data grows.
- **Impact:** Direct double cash-out to drivers/vendors.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Payouts, Scheduler, Accounting.

**BUG-FIN-023 · Distributed/Async · Payouts — Payout snapshot includes disputed/refunded rides**
- **Possible bug:** The payout snapshot could be taken before a dispute/refund lands, paying out money later reversed.
- **Trigger / scenario:** Dispute resolution racing the payout cutoff.
- **Why plausible:** Cutoff semantics unclear across teams.
- **Impact:** Overpayment requiring manual recovery.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Payouts, Disputes, Refunds.

**BUG-FIN-024 · Business Logic · Tax — Tax computed differently at quote vs settlement**
- **Possible bug:** VAT could be computed at quote with one rounding/rate version and at settlement with another, so invoice lines never match collected amounts.
- **Trigger / scenario:** Rate change deployed between quote and settlement (or per-line vs total rounding).
- **Why plausible:** Quote and settlement are separate code paths.
- **Impact:** Tax filing discrepancies; audit exposure.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Tax, Invoicing, Accounting.

**BUG-FIN-025 · State Machine · Ledger/Tax — Refund reverses customer leg but not tax/commission legs**
- **Possible bug:** A refund entry could reverse the customer debit without mirror entries for tax and platform commission, breaking double-entry symmetry.
- **Trigger / scenario:** Refund flow added later, composing only the visible legs.
- **Why plausible:** Refunds are the most commonly hand-rolled compound entry.
- **Impact:** Books out of balance per refund; discovered at audit.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Ledger, Tax, Refunds, Accounting.

**BUG-FIN-026 · Config · Tax — VAT inclusive vs exclusive inconsistent across verticals**
- **Possible bug:** Ride-hailing might treat prices as VAT-inclusive while marketplace treats them as exclusive, so cross-vertical reports double-count or under-count tax.
- **Trigger / scenario:** Consolidated financial report across verticals.
- **Why plausible:** Verticals evolved separately.
- **Impact:** Misstated tax liability.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Tax, Reports, Accounting.

**BUG-FIN-027 · Concurrency · Incentives — Driver incentive double-award**
- **Possible bug:** A trip-counter job and a payout job could both award a bonus when the counter is updated after the payout read.
- **Trigger / scenario:** Driver crosses the threshold exactly at the incentive evaluation instant.
- **Why plausible:** Two jobs sharing mutable counters.
- **Impact:** Duplicate bonuses at threshold boundaries.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Incentives, Scheduler, Wallet.

**BUG-FIN-028 · Business Logic · Call packages — Minutes deducted for failed/concurrent calls**
- **Possible bug:** Call-minute deduction could occur for unanswered calls, or two concurrent calls could each deduct the full duration.
- **Trigger / scenario:** Rider on a package makes back-to-back/concurrent driver calls.
- **Why plausible:** Metering is provider-side and reconciled loosely.
- **Impact:** Over-deduction; refund cost; distrust.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Call packages, Billing, Telephony provider.

**BUG-FIN-029 · Business Logic · Wallet/Ride — Ride completes despite insufficient funds**
- **Possible bug:** Balance checked at ride request but debited at completion could let riders repeatedly ride with insufficient funds by requesting while solvent and completing after other debits.
- **Trigger / scenario:** Small balance + marketplace purchase mid-ride.
- **Why plausible:** Request-time validation is the intuitive design.
- **Impact:** Recoverable but growing rider debt.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Wallet, Ride, Marketplace.

**BUG-FIN-030 · Business Logic · Fare — Quote vs settlement margin drift (rider ≠ driver)**
- **Possible bug:** Rider charge and driver payout could be computed from different snapshots (surge, toll, waiting), so platform margin silently drifts per ride.
- **Trigger / scenario:** Dynamic components change between the rider-side and driver-side computations.
- **Why plausible:** Two consumers of the fare pipeline with independent timing.
- **Impact:** Chronic revenue leakage or overpayment; invisible without margin monitoring.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Fare, Payments, Earnings, Accounting.

**BUG-FIN-031 · Distributed/Async · Payments — Authorization captured after cancellation**
- **Possible bug:** A ride paid by authorize-then-capture could still be captured after cancellation if the cancel path doesn't void the authorization.
- **Trigger / scenario:** Rider cancels between authorization and capture; capture job proceeds on schedule.
- **Why plausible:** Void-on-cancel is an easy cross-flow requirement to miss.
- **Impact:** Rider charged for a cancelled ride; refund costs.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Payments, Ride, Refunds.

---

### 1.5 Location, Zones, H3

**BUG-LOC-001 · Security/Fraud · Location — Driver GPS spoofing**
- **Possible bug:** A mocked location stream could fabricate arrival (triggering waiting charges), inflate distance, or farm online-hours incentives.
- **Trigger / scenario:** Driver runs a location-mocking app.
- **Why plausible:** Consumer apps can't fully detect mock providers; plausibility checks may be absent.
- **Impact:** Rider overcharge; incentive fraud; false arrival events.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Location, Fare, Incentives, Trust & Safety.

**BUG-LOC-002 · Fraud · Location — Rider location spoofing for cheaper zone**
- **Possible bug:** A rider could set a fake pickup inside a cheaper fare zone, with the fare finalized from the spoofed origin.
- **Trigger / scenario:** Zone-boundary pricing difference is known; rider fakes GPS.
- **Why plausible:** Zone-from-client-location without cross-checks.
- **Impact:** Systematic undercharge.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Location, Fare, Zones.

**BUG-LOC-003 · Stale data · Location — Stale GPS used for arrival detection**
- **Possible bug:** Arrival auto-detection could fire on a stale position (see RIDE-013) generally wherever freshness gates are missing.
- **Trigger / scenario:** Any geofence consumer lacking a timestamp check.
- **Why plausible:** Freshness is a cross-cutting concern applied inconsistently.
- **Impact:** Wrong arrivals, wrong waiting fees, wrong ETAs.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / HIGH / EASY · **Affected:** Location, Ride, Dispatch.

**BUG-LOC-004 · Business Logic · Zones — Pickup vs drop zone evaluated at different times**
- **Possible bug:** Zone-based fare components could mix pickup-zone-at-request with drop-zone-at-completion, producing fares matching neither policy.
- **Trigger / scenario:** Zone boundary changes or GPS drift near boundary mid-ride.
- **Why plausible:** Zone resolution happens in different pipeline stages.
- **Impact:** Fare inconsistencies near boundaries.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Zones, Fare, H3.

**BUG-LOC-005 · Stale data · Zones/H3 — Cell/zone mapping updated mid-ride**
- **Possible bug:** A zone-to-cell mapping refresh could re-zone an in-flight ride, so completion zone differs from quote zone.
- **Trigger / scenario:** Ops updates zone polygons while rides are active.
- **Why plausible:** Reference data is usually treated as static.
- **Impact:** Fare recomputation surprises; zone reports that don't sum.
- **Severity/Likelihood/Detection:** LOW-MEDIUM / MEDIUM / HARD · **Affected:** Zones, Fare, H3.

**BUG-LOC-006 · Concurrency · Dispatch/Zones — Driver zone flip mid-broadcast**
- **Possible bug:** A driver crossing a zone boundary during offer broadcast could be considered local in two zones, or neither, depending on which read wins.
- **Trigger / scenario:** Driver on a boundary road; two zone broadcasts read position at different instants.
- **Why plausible:** Position is moving state sampled by independent consumers.
- **Impact:** Mismatched dispatch quality; double counting in zone metrics.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Dispatch, Zones, Metrics.

**BUG-LOC-007 · Data consistency · Location/Distance — Non-monotonic events inflate distance**
- **Possible bug:** Reordered points (see RIDE-008) could inflate distance wherever ordering isn't enforced per-stream.
- **Trigger / scenario:** Reconnect replay mixing old and new points.
- **Why plausible:** Ordering is a per-consumer discipline.
- **Impact:** Fare inflation; dispute patterns after reconnects.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Location, Distance, Fare.

**BUG-LOC-008 · Data consistency · Location — Duplicate ingestion (socket + batch)**
- **Possible bug:** Points delivered both via socket and a batch upload could double-count segments if dedup by timestamp is missing.
- **Trigger / scenario:** Reconnect triggers a catch-up batch of already-streamed points.
- **Why plausible:** Catch-up sync is a standard reconnect feature.
- **Impact:** Doubled distance on affected rides.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Location, Distance, Fare.

---

### 1.6 Fleet, Vehicles, Subscriptions

**BUG-FLEET-001 · Concurrency · Fleet — Vehicle double assignment**
- **Possible bug:** An admin assignment and a driver self-selection could both bind the same vehicle to different drivers.
- **Trigger / scenario:** Admin assigns while driver claims the vehicle in-app.
- **Why plausible:** Two write paths to the same binding without a uniqueness guard.
- **Impact:** Two drivers operating one vehicle record; compliance and earnings chaos.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Fleet, Dispatch, Earnings.

**BUG-FLEET-002 · Business Logic · Fleet — Driver in two fleets, seat limits miscounted**
- **Possible bug:** A driver enrolled in two fleets could be counted against subscription seats in both, or neither, depending on which fleet's view is queried.
- **Trigger / scenario:** Driver moonlights across fleets.
- **Why plausible:** Seat counting per-fleet without a global identity view.
- **Impact:** Billing unfairness; limit bypass.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Fleet, Subscriptions, Billing.

**BUG-FLEET-003 · Concurrency · Fleet/Payouts — Subscription expiry mid-shift breaks payout routing**
- **Possible bug:** Expiry revoking access mid-shift could strand a completed ride's earnings in a payout route the driver can no longer access.
- **Trigger / scenario:** Ride completes hours after expiry.
- **Why plausible:** Entitlement and earnings lifecycles disconnected.
- **Impact:** Driver unpaid; support escalation.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / MEDIUM / HARD · **Affected:** Fleet, Subscriptions, Payouts.

**BUG-FLEET-004 · Concurrency · Fleet/Ride — Vehicle deactivated mid-ride**
- **Possible bug:** Deactivating a vehicle mid-ride could orphan the ride or complete it against an invalid vehicle, corrupting compliance reports.
- **Trigger / scenario:** Fleet admin acts on a maintenance flag while a trip runs.
- **Why plausible:** Admin actions not gated on active trips.
- **Impact:** Compliance reporting errors; stuck rides.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Fleet, Ride, Compliance.

**BUG-FLEET-005 · Business Logic · Fleet/Compliance — Document expiry window**
- **Possible bug:** Expired vehicle documents (fitness, insurance, tax token) could remain dispatchable between the expiry instant and the daily expiry job, or if backdating bypasses the check.
- **Trigger / scenario:** Document expires mid-day; job runs at day boundary.
- **Why plausible:** Daily batch enforcement leaves an intra-day gap.
- **Impact:** Regulatory exposure; insurance invalid during incidents.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / EASY · **Affected:** Fleet, Compliance, Dispatch.

**BUG-FLEET-006 · Concurrency · Fleet/Subscriptions — Seat-limit check-then-act**
- **Possible bug:** Two concurrent driver additions could both pass the seat-limit check, exceeding the plan.
- **Trigger / scenario:** Two admins onboard drivers simultaneously at the limit.
- **Why plausible:** Limit validation without serialization.
- **Impact:** Over-limit tenants; billing disputes.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Fleet, Subscriptions.

**BUG-FLEET-007 · Concurrency · Fleet/Billing — Plan-change invoice race**
- **Possible bug:** An invoice for the old plan could be issued after a plan switch, or a payment intended for the old plan applied to the new period.
- **Trigger / scenario:** Upgrade concurrent with billing cycle run.
- **Why plausible:** Billing snapshots vs live plan state.
- **Impact:** Wrong invoices; payment misapplication.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Fleet, Billing, Payments.

**BUG-FLEET-008 · Retry/Idempotency · Fleet/Billing — Duplicate invoice on billing job retry**
- **Possible bug:** A retried billing run could issue duplicate subscription invoices if per-cycle idempotency is absent.
- **Trigger / scenario:** Billing job times out and retries.
- **Why plausible:** Job retry semantics without idempotency keys.
- **Impact:** Double billing of fleets.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Billing, Scheduler, Payments.

**BUG-FLEET-009 · Stale data · Fleet/Alerts — Alerts routed to the previous tenant**
- **Possible bug:** Vehicle reassignment could leave alert subscriptions pointing at the old tenant's admins.
- **Trigger / scenario:** Vehicle transferred; alert fires on offline event.
- **Why plausible:** Subscription cleanup on transfer is easy to miss.
- **Impact:** Information leakage; missed alerts for the new owner.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Fleet, Alerts, Notifications.

**BUG-FLEET-010 · Security · Fleet/RBAC — Role-creation escalation**
- **Possible bug:** If fleets can define custom roles, a manager-level role might be able to create an owner-equivalent role if hierarchy constraints aren't enforced.
- **Trigger / scenario:** Manager creates a role with all permissions.
- **Why plausible:** Role editors often check permission lists, not role hierarchy.
- **Impact:** Tenant takeover by a sub-admin.
- **Severity/Likelihood/Detection:** HIGH / LOW-MEDIUM / HARD · **Affected:** Fleet, RBAC, Admin.

---

### 1.7 Marketplace (shops, products, orders, RFQ)

**BUG-MKT-001 · Concurrency · Marketplace/Inventory — Oversell of last item**
- **Possible bug:** Two orders for the final stock unit could both confirm if decrement is check-then-act.
- **Trigger / scenario:** Two buyers check out the last item simultaneously.
- **Why plausible:** Stock decrement at order time without reservation locking.
- **Impact:** Undeliverable orders; forced refunds.
- **Severity/Likelihood/Detection:** HIGH / HIGH / EASY · **Affected:** Marketplace, Inventory, Orders.

**BUG-MKT-002 · Concurrency · Marketplace/Inventory — Reservation TTL releases stock during payment**
- **Possible bug:** A stock reservation could expire while payment is still processing, releasing the unit to another buyer.
- **Trigger / scenario:** Slow payment; TTL job fires in between.
- **Why plausible:** TTL-based reservations are blind to payment state.
- **Impact:** Double-sell; cancelled-after-accepted orders.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Inventory, Payments, Orders.

**BUG-MKT-003 · Business Logic · Marketplace — Cart vs checkout price drift**
- **Possible bug:** The charge could use stale cart prices or new prices inconsistently across quote and charge paths.
- **Trigger / scenario:** Merchant changes price while buyer is checking out.
- **Why plausible:** Two snapshots of a mutable price.
- **Impact:** Charge ≠ displayed price; disputes.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Marketplace, Pricing, Payments.

**BUG-MKT-004 · Concurrency · Marketplace/Shop — Order accepted as shop goes offline**
- **Possible bug:** An order could be accepted in the instant a shop toggles offline, with no merchant ever notified and later auto-refund.
- **Trigger / scenario:** Shop closes for the day as an order lands.
- **Why plausible:** Availability flag and order intake are separate writes.
- **Impact:** Ghost orders; wasted delivery dispatch.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Marketplace, Shops, Delivery.

**BUG-MKT-005 · Retry/Idempotency · Marketplace/RFQ — Duplicate RFQ submissions**
- **Possible bug:** A retried RFQ submission could create duplicate requests, each gathering quotes and possibly awards.
- **Trigger / scenario:** Client timeout on submit; buyer retries.
- **Why plausible:** RFQ creation may lack an idempotency key.
- **Impact:** Duplicate vendor effort; duplicate award risk.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** RFQ, Marketplace, Vendors.

**BUG-MKT-006 · Data consistency · Marketplace — Refund of a soft-deleted product uses current price**
- **Possible bug:** Refund logic could reference the product's live (changed or deleted) price instead of the price at purchase.
- **Trigger / scenario:** Product price edited or removed after purchase.
- **Why plausible:** Order lines often rejoin product data instead of freezing it.
- **Impact:** Wrong refund amounts.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Marketplace, Refunds, Orders.

**BUG-MKT-007 · State Machine · Marketplace/Delivery — Merchant cancel vs courier delivered**
- **Possible bug:** A merchant cancellation processed after courier delivery could reverse a delivered order, or be rejected with the wrong final state.
- **Trigger / scenario:** Cancel request races the delivery-completion event.
- **Why plausible:** Two terminal writers from different verticals.
- **Impact:** Impossible states; charge-and-refund confusion.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Marketplace, Delivery, Orders.

**BUG-MKT-008 · Business Logic · Marketplace/Commission — Commission base inconsistent (pre- vs post-discount)**
- **Possible bug:** Vendor commission could be computed on a different base than rider charge in some flows (e.g., including or excluding promo subsidy).
- **Trigger / scenario:** Promo partially funded by platform.
- **Why plausible:** Subsidy attribution rules duplicated per flow.
- **Impact:** Chronic settlement drift between platform and vendors.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / HARD · **Affected:** Commission, Vendors, Ledger.

**BUG-MKT-009 · Concurrency · Marketplace/Cart — Multi-device cart merge duplicates**
- **Possible bug:** Logging in on a second device could merge carts by adding quantities rather than unioning items.
- **Trigger / scenario:** User adds item on phone, then opens tablet.
- **Why plausible:** Merge strategy "sum" is the naive choice.
- **Impact:** Double quantity orders.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Cart, Orders.

**BUG-MKT-010 · Cross-service · Marketplace/Delivery — Cancellation doesn't propagate to delivery leg**
- **Possible bug:** Cancelling a marketplace order might not cancel the spawned delivery request, dispatching a courier for a dead order and charging delivery fees.
- **Trigger / scenario:** Buyer cancels right after order→delivery bridging.
- **Why plausible:** Bridge is one-way by design; reverse propagation is an extra requirement.
- **Impact:** Wasted dispatch; phantom fees.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Marketplace, Delivery, Fees.

**BUG-MKT-011 · Time · Marketplace/RFQ — Award on an expired quote**
- **Possible bug:** An RFQ award could be granted against a vendor quote whose validity window already lapsed.
- **Trigger / scenario:** Award processing delayed past quote validity.
- **Why plausible:** Validity checked at submission, not at award.
- **Impact:** Vendor refuses; re-tender churn.
- **Severity/Likelihood/Detection:** MEDIUM / LOW-MEDIUM / MEDIUM · **Affected:** RFQ, Awards.

---

### 1.8 Rental Bidding (sealed-bid)

**BUG-RENT-001 · Security/Fraud · Rental/Bidding — Sealed-bid leak before deadline**
- **Possible bug:** Bid contents could be exposed to other bidders via overly broad API responses or event fan-out before the deadline.
- **Trigger / scenario:** A bidder enumerates or subscribes to bid-related data mid-auction.
- **Why plausible:** Sealed-bid integrity requires explicit field-level and event-level filtering — easy to miss.
- **Impact:** Auction integrity destroyed; collusive/strategic bidding.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Rental bidding, Authorization.

**BUG-RENT-002 · Time/Async · Rental/Bidding — Late bid accepted due to processing delay**
- **Possible bug:** A bid received before the deadline but processed after could be accepted (or rejected) depending on which clock governs.
- **Trigger / scenario:** Queue backlog at deadline; bid in flight.
- **Why plausible:** Receive-time vs process-time semantics undefined.
- **Impact:** Unfair awards; bidder disputes.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Rental bidding, Time.

**BUG-RENT-003 · Retry/Idempotency · Rental/Bidding — Duplicate award on job retry**
- **Possible bug:** A retried award job could award two bidders (or notify both) for one request.
- **Trigger / scenario:** Award job timeout → retry.
- **Why plausible:** Award without per-request single-winner guard.
- **Impact:** Two "winners" dispatched to one asset; fee chaos.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Rental bidding, Scheduler, Dispatch.

**BUG-RENT-004 · Concurrency · Rental/Bidding — SLA-expiry demotion races winner confirmation**
- **Possible bug:** The winner's confirmation could be accepted at the same time an SLA-expiry job demotes them, leaving the assignment both confirmed and reassigned.
- **Trigger / scenario:** Confirmation submitted in the final seconds of the SLA window.
- **Why plausible:** Expiry job and confirmation are independent writers of assignment state.
- **Impact:** Two parties believe they own the asset; on-site conflict.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Rental bidding, Scheduler, Dispatch.

**BUG-RENT-005 · Stale data · Rental/Bidding — Old winner continues receiving events**
- **Possible bug:** After demotion/reassignment, the previous winner's event subscriptions might not be revoked, so they keep receiving assignment updates.
- **Trigger / scenario:** Demotion while the old winner's client is connected.
- **Why plausible:** Subscription lifecycle tied to session, not assignment.
- **Impact:** Old driver drives to the asset; duplicate dispatch.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Rental bidding, Events, Dispatch.

**BUG-RENT-006 · Concurrency · Rental/Fleet — Vehicle or driver removed after award**
- **Possible bug:** Fleet-side removal of the awarded driver/vehicle could race automatic reassignment and manual reassignment, leaving zero or two successors.
- **Trigger / scenario:** Fleet admin deactivates awarded vehicle; ops manually reassigns.
- **Why plausible:** Two reassignment paths for the same trigger.
- **Impact:** Rental unfulfilled or double-assigned.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Rental, Fleet, Dispatch.

**BUG-RENT-007 · Security · Rental/Bidding — Client-supplied bid amount trusted**
- **Possible bug:** The bid amount could be taken from the client without server-side revalidation, allowing tampered values.
- **Trigger / scenario:** Modified client submits a manipulated amount.
- **Why plausible:** Trust-the-client patterns leak into bid submission.
- **Impact:** Invalid awards; direct financial distortion.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Rental bidding, Authorization.

**BUG-RENT-008 · Distributed · Rental/Bidding — Deadline extension not propagated**
- **Possible bug:** An auction extension applied server-side might not reach all bidder clients, who see a closed auction.
- **Trigger / scenario:** Extension decided near deadline; event delivery lags.
- **Why plausible:** Extension is a rare path with weak propagation testing.
- **Impact:** Lost bids; vendor distrust.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Rental bidding, Events, Clients.

**BUG-RENT-009 · Functional · Rental/Bidding — Tie at identical winning amount**
- **Possible bug:** Equal top bids could cause an exception, both-awarded, or nondeterministic winner depending on sort stability.
- **Trigger / scenario:** Two bidders submit the same amount.
- **Why plausible:** Ties are untested edge cases.
- **Impact:** Award failure or double award.
- **Severity/Likelihood/Detection:** MEDIUM / LOW / HARD · **Affected:** Rental bidding.

**BUG-RENT-010 · Business Logic · Rental/Bidding — Auction cancelled after award, bid-security refunds mishandled**
- **Possible bug:** Cancelling an auction after award could refund bid security twice, or not at all, depending on which path processes it.
- **Trigger / scenario:** Ops cancels a live awarded auction.
- **Why plausible:** Cancel-after-award is a rare compound flow.
- **Impact:** Financial loss or vendor lockout of funds.
- **Severity/Likelihood/Detection:** MEDIUM / LOW-MEDIUM / MEDIUM · **Affected:** Rental bidding, Refunds, Wallet.

**BUG-RENT-011 · Cross-service · Rental/Dispatch — Rental awarded while driver is mid ride-hail trip**
- **Possible bug:** Award-time eligibility might not account for an in-progress ride-hail trip, booking a driver who is currently transporting a rider.
- **Trigger / scenario:** Rental auction closes while the winning driver is on a trip.
- **Why plausible:** Cross-vertical exclusivity is a global invariant, rarely enforced atomically.
- **Impact:** Rental SLA breach; rider trip interrupted pressure.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Rental, Dispatch, Ride.

---

### 1.9 Delivery / Courier / Food Bridge

**BUG-DELIV-001 · Retry/Idempotency · Delivery bridge — Duplicate delivery creation**
- **Possible bug:** An order-service retry could spawn a second delivery request, dispatching two couriers for one order.
- **Trigger / scenario:** Bridge call times out; retry succeeds twice.
- **Why plausible:** Cross-service creation without idempotency key.
- **Impact:** Two couriers, one picks up; fee double-charge risk.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Delivery, Marketplace, Dispatch.

**BUG-DELIV-002 · State Machine · Food bridge — Lifecycle mapping mismatches**
- **Possible bug:** Status mapping between food order states and delivery leg states could be incomplete, mapping "cancelled" to something terminal-wrong, stranding legs or completing prematurely.
- **Trigger / scenario:** Any uncommon food-order status encountered by the bridge.
- **Why plausible:** Two state machines joined by a mapping table that drifts.
- **Impact:** Stuck deliveries; fees charged for nothing; support load.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Food delivery, Delivery, Orders.

**BUG-DELIV-003 · Business Logic · Delivery/Payouts — Refund after delivery, courier still paid**
- **Possible bug:** A customer refund after marked delivery could leave courier payout intact, absorbed by the platform.
- **Trigger / scenario:** Dispute resolved post-payout.
- **Why plausible:** Refund and courier earnings are separate ledgers.
- **Impact:** Margin loss per dispute.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Delivery, Refunds, Payouts.

**BUG-DELIV-004 · Concurrency · Delivery — Overlapping legs cross-wire location events**
- **Possible bug:** A courier on two overlapping legs could have location updates attributed to both or the wrong leg, corrupting ETA and completion detection.
- **Trigger / scenario:** Leg 2 starts before leg 1 completes.
- **Why plausible:** Location association resolved by courier identity, not active leg.
- **Impact:** Wrong completion triggers; wrong fees.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Delivery, Location, Events.

**BUG-DELIV-005 · Security · Delivery — Reassignment handover without verification**
- **Possible bug:** Handover to a new courier after reassignment might lack a PIN/OTP equivalent, allowing wrong-party pickup.
- **Trigger / scenario:** Merchant hands package to whoever arrives.
- **Why plausible:** Handover verification is a later addition to reassignment flows.
- **Impact:** Wrong delivery; theft vector.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Delivery, Trust & Safety.

**BUG-DELIV-006 · Functional · Delivery/Geocoding — Ambiguous addresses**
- **Possible bug:** Duplicate or unnamed roads could geocode pickups to the wrong area entirely.
- **Trigger / scenario:** Common road names across the city; imprecise pin.
- **Why plausible:** Geocoder ambiguity is inherent; disambiguation UI may be weak.
- **Impact:** Failed pickups; disputes; wasted dispatch.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Delivery, Geocoding, Map provider.

**BUG-DELIV-007 · State Machine · Delivery — Multi-leg completed out of order**
- **Possible bug:** A later leg could be marked complete before an earlier one, corrupting chain state.
- **Trigger / scenario:** Courier scans/completes out of sequence.
- **Why plausible:** Ordering constraints rarely enforced on completion events.
- **Impact:** Chain stuck or fees misattributed.
- **Severity/Likelihood/Detection:** MEDIUM / LOW-MEDIUM / EASY · **Affected:** Delivery, Orders.

**BUG-DELIV-008 · Business Logic · Delivery/Fees — Shop-set fee vs platform-computed fee mismatch**
- **Possible bug:** The customer could be charged one delivery fee while the courier is paid on a different formula.
- **Trigger / scenario:** Shop-configured fee differs from platform calculation.
- **Why plausible:** Two fee authorities (shop and platform) coexist.
- **Impact:** Margin drift; courier underpayment disputes.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Delivery, Fees, Earnings.

**BUG-DELIV-009 · Distributed · Delivery — "Delivered" proof upload fails silently**
- **Possible bug:** Marking delivered could succeed while the proof photo upload fails, leaving disputes unresolvable.
- **Trigger / scenario:** Weak network at delivery moment.
- **Why plausible:** Proof is an attachment to a terminal event; failure handled as non-fatal.
- **Impact:** Disputes decided without evidence; refunds granted wrongly.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Delivery, Media, Disputes.

**BUG-DELIV-010 · Concurrency · Delivery — Courier accept overwrites customer cancellation**
- **Possible bug:** A courier accept landing after customer cancellation could revive the delivery.
- **Trigger / scenario:** Accept in flight during cancellation.
- **Why plausible:** Terminal-state writers in different services.
- **Impact:** Courier dispatched for a dead request; fee charged.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Delivery, Orders, Dispatch.

---

### 1.10 Emergency / Ambulance

**BUG-EMRG-001 · Concurrency · Emergency — Certification expires between eligibility check and dispatch**
- **Possible bug:** A provider whose certification lapses in the window between broadcast-list construction and acceptance could still be dispatched.
- **Trigger / scenario:** Cert expiry during an active request cycle.
- **Why plausible:** Eligibility snapshotted at request creation.
- **Impact:** Non-compliant provider dispatched to an emergency.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Emergency, Compliance, Dispatch.

**BUG-EMRG-002 · Stale data · Emergency — Revoked provider still in broadcast list**
- **Possible bug:** A provider revoked mid-shift could still receive emergency broadcasts if lists are cached or built pre-revocation.
- **Trigger / scenario:** Revocation during an active broadcast cycle.
- **Why plausible:** Broadcast lists are hot-path cached.
- **Impact:** Unqualified responder sent to a patient; safety-critical.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Emergency, Compliance, Dispatch.

**BUG-EMRG-003 · Concurrency · Emergency — First-accept race dispatches two ambulances**
- **Possible bug:** Two providers accepting within the same window could both be acknowledged and dispatched.
- **Trigger / scenario:** High-pressure simultaneous accepts (very plausible in emergencies).
- **Why plausible:** Broadcast + first-accept-wins without strict serialization (see DISPATCH-003).
- **Impact:** Two units to one patient; one wrongly penalized/cancelled; cost confusion.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Emergency, Dispatch, Billing.

**BUG-EMRG-004 · Config · Emergency — Urgent dispatch uses scheduled-service radius/SLA**
- **Possible bug:** Config reuse could make urgent dispatch inherit the scheduled ambulance's search radius or SLA, producing coverage gaps or over-broadcast.
- **Trigger / scenario:** Shared config defaults across dispatch paths.
- **Why plausible:** Config keys shared to avoid duplication.
- **Impact:** No ambulance found in a true emergency, or mass broadcast.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / HARD · **Affected:** Emergency, Dispatch, Config.

**BUG-EMRG-005 · Cross-service · Emergency — Provider committed elsewhere still eligible**
- **Possible bug:** Emergency eligibility might not exclude providers currently committed to rental/delivery, dispatching an occupied unit.
- **Trigger / scenario:** Cross-vertical exclusivity not enforced (see DISPATCH-007/RENT-011).
- **Why plausible:** Global busy-state invariant missing.
- **Impact:** Delayed emergency response.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Emergency, Dispatch, Rental, Delivery.

**BUG-EMRG-006 · Infrastructure · Emergency — Queue starvation behind normal backlog**
- **Possible bug:** Emergency requests queued behind a backlog of normal jobs could wait intolerably long if the queue isn't preemptive/prioritized.
- **Trigger / scenario:** Load spike or job backlog; emergency arrives.
- **Why plausible:** Shared worker queues without strict priority.
- **Impact:** Delayed life-critical dispatch.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / MEDIUM · **Affected:** Emergency, Queueing, Scheduler.

**BUG-EMRG-007 · Functional · Emergency — Location-less request broadcasts to zero or wrong region**
- **Possible bug:** An emergency request without coordinates (GPS off) could match zero providers or fall back to a default region.
- **Trigger / scenario:** Caller's location unavailable.
- **Why plausible:** Null-coordinate handling is a rare path.
- **Impact:** No dispatch on a genuine emergency.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Emergency, Location, Dispatch.

**BUG-EMRG-008 · Business Logic · Emergency — Scheduled ambulance routed via ride-hail matching**
- **Possible bug:** Scheduled ambulance bookings could pass through the standard ride-hail matching path, ignoring medical equipment/qualification flags.
- **Trigger / scenario:** Scheduled flow reuses generic dispatch.
- **Why plausible:** Vertical reusing core dispatch for speed-to-market.
- **Impact:** Wrong vehicle class for a medical need.
- **Severity/Likelihood/Detection:** HIGH / LOW-MEDIUM / HARD · **Affected:** Emergency, Dispatch, Scheduling.

---

### 1.11 SOS

**BUG-SOS-001 · Stale data · SOS — Post-ride SOS routed to the previous driver**
- **Possible bug:** An SOS raised shortly after ride completion could resolve its "current ride/driver" context to the finished ride, alerting the wrong responder.
- **Trigger / scenario:** Rider triggers SOS minutes after drop-off.
- **Why plausible:** SOS context resolution reuses ride association logic.
- **Impact:** Emergency response misdirected; delays.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** SOS, Ride, Ops.

**BUG-SOS-002 · Retry/Idempotency · SOS — Duplicate SOS events double-escalate**
- **Possible bug:** Client retries could create multiple active SOS records with conflicting resolution states.
- **Trigger / scenario:** Panic taps with weak network.
- **Why plausible:** SOS creation may forego idempotency for latency.
- **Impact:** Ops confusion; conflicting closures.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** SOS, Ops tooling.

**BUG-SOS-003 · Security · SOS — Driver able to dismiss rider's SOS**
- **Possible bug:** An authorization gap could let the ride's driver (or another party) close the rider's SOS.
- **Trigger / scenario:** Driver dismisses alert to avoid escalation.
- **Why plausible:** Close-permission scoped to ride participants rather than ops.
- **Impact:** Suppressed safety incident.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / MEDIUM · **Affected:** SOS, Authorization, Trust & Safety.

**BUG-SOS-004 · Stale data · SOS — Deep link opens reassigned ride context**
- **Possible bug:** Responders following a notification could land on the ride's *current* (reassigned) state rather than the state at SOS time.
- **Trigger / scenario:** Re-dispatch between SOS and response.
- **Why plausible:** Links resolve to live objects.
- **Impact:** Responder sees wrong driver/location.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** SOS, Notifications, Ride.

**BUG-SOS-005 · Infrastructure · SOS — Silent drop when push permission off**
- **Possible bug:** SOS alerting could depend solely on push, failing silently if the responder's channel is disabled.
- **Trigger / scenario:** Ops device with notifications off.
- **Why plausible:** No SMS/call fallback on the critical path.
- **Impact:** Unacknowledged emergency alert.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / EASY · **Affected:** SOS, Notifications, Ops.

**BUG-SOS-006 · Stale data · SOS — Stale last-known location misdirects responders**
- **Possible bug:** SOS could attach last-known coordinates that are minutes old, sending responders to the wrong place.
- **Trigger / scenario:** GPS stale at SOS time.
- **Why plausible:** Best-effort location attach without freshness gating.
- **Impact:** Response delay in a safety incident.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** SOS, Location, Ops.

---

### 1.12 Scheduler / Jobs

**BUG-SCHED-001 · Concurrency · Scheduler — Job overlap without a distributed lock**
- **Possible bug:** Long-running jobs overlapping their next trigger could double-execute payouts, expiries, or invoices.
- **Trigger / scenario:** Data growth or slow dependencies extend runtime past the interval.
- **Why plausible:** Single-instance assumptions silently broken by scale or deploy topology.
- **Impact:** Duplicate financial effects; duplicated notifications.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Scheduler, Payouts, Billing, Expiries.

**BUG-SCHED-002 · Infrastructure · Scheduler — Missed run during deploy/outage leaves stuck states**
- **Possible bug:** A missed job cycle could leave records awaiting a transition that now never comes until manual intervention.
- **Trigger / scenario:** Deploy window over a job's trigger time.
- **Why plausible:** Fire-at-interval semantics don't backfill.
- **Impact:** Stuck rides/subscriptions/orders accumulating silently.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Scheduler, all lifecycle owners.

**BUG-SCHED-003 · Concurrency · Scheduler — Read-then-write on a record the user just changed**
- **Possible bug:** An expiry job could read state, the user acts (completes/extends), then the job writes expiry over the newer state.
- **Trigger / scenario:** Expiry instant coinciding with user action.
- **Why plausible:** Long read-process-write windows without optimistic concurrency checks.
- **Impact:** Completed rides marked expired; valid subscriptions revoked.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Scheduler, Ride, Subscriptions.

**BUG-SCHED-004 · Retry/Idempotency · Scheduler — Partial batch + full retry duplicates the prefix**
- **Possible bug:** A batch failing halfway could be retried in full, reprocessing the successful prefix (duplicate payouts/notifications).
- **Trigger / scenario:** Mid-batch failure of any large job.
- **Why plausible:** Retry granularity is the whole batch, not the unit.
- **Impact:** Duplicates proportional to batch prefix.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Scheduler, Payouts, Notifications.

**BUG-SCHED-005 · Time · Scheduler — Daily job boundaries in UTC vs Dhaka**
- **Possible bug:** "Daily" jobs and reports anchored to UTC midnight would partition the local day at 06:00 Dhaka, misassigning early-morning activity.
- **Trigger / scenario:** Any daily expiry/report touching 00:00–06:00 local.
- **Why plausible:** Default UTC scheduling with local business semantics.
- **Impact:** Wrong expiries, wrong daily reports (financial statements off).
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Scheduler, Reports, Expiries.

**BUG-SCHED-006 · Infrastructure · Scheduler — Backlog cascade across dependent jobs**
- **Possible bug:** One slow job could delay jobs scheduled behind it, cascading delays to expiry/billing chains.
- **Trigger / scenario:** Shared worker pool saturation.
- **Why plausible:** Implicit ordering assumptions between jobs.
- **Impact:** Timeouts morph into expiry/no-show misfires.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Scheduler, all job consumers.

**BUG-SCHED-007 · Retry/Idempotency · Scheduler — No per-run idempotency key**
- **Possible bug:** Any job retried after an ambiguous failure could double-apply its effect.
- **Trigger / scenario:** Timeout where the first run actually completed.
- **Why plausible:** Run identity not carried into effects.
- **Impact:** Duplicate effects across arbitrary jobs.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Scheduler, all effect owners.

**BUG-SCHED-008 · Time · Scheduler — Inclusive/exclusive expiry boundary off-by-one**
- **Possible bug:** Expiry conditions could be off by one unit (minute/hour/day) at boundaries, charging or revoking one unit early/late.
- **Trigger / scenario:** Records created exactly at boundary instants.
- **Why plausible:** Boundary operators chosen inconsistently across jobs.
- **Impact:** Small but systematic fee/entitlement errors.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Scheduler, Fees, Subscriptions.

**BUG-SCHED-009 · Concurrency · Scheduler — Job races event handler on the same transition**
- **Possible bug:** A no-show timeout job and a driver arrival event could both process the same ride transition, the job's outcome overwriting the event's.
- **Trigger / scenario:** Driver arrives just as the no-show timer fires.
- **Why plausible:** Timeout jobs and live events are parallel writers.
- **Impact:** Riders charged no-show fees despite driver-late arrivals (or vice versa).
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Scheduler, Ride, Fees.

---

### 1.13 WebSocket / Real-time Events

**BUG-WS-001 · Concurrency · WebSocket — Duplicate subscription on reconnect**
- **Possible bug:** A client resubscribing after reconnect could hold two subscriptions, receiving every event twice, prompting double UI actions (double accept/complete attempts).
- **Trigger / scenario:** Flaky connection; reconnect without server-side dedup.
- **Why plausible:** Subscription cleanup on drop is best-effort.
- **Impact:** Duplicate actions; races downstream.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** WebSocket, Driver/Rider apps, Dispatch.

**BUG-WS-002 · Security · WebSocket — Wrong recipient via reused room/subscription keys**
- **Possible bug:** Subscriptions keyed by ride/user identifiers could leak events to previous participants after reassignment or ID reuse.
- **Trigger / scenario:** Reassignment followed by new party joining the same logical room.
- **Why plausible:** Room lifecycle vs ride lifecycle mismatch.
- **Impact:** Rider/driver data (location, phone, destination) exposed to strangers.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** WebSocket, Ride, Privacy.

**BUG-WS-003 · Distributed · WebSocket — Out-of-order events drive stale actions**
- **Possible bug:** A cancellation delivered after a reassignment offer could cause the driver to act on the newer offer, then see "cancelled" for the wrong ride.
- **Trigger / scenario:** Event reordering during broker backlog.
- **Why plausible:** Ordering guarantees often relaxed for throughput.
- **Impact:** Confused drivers, wrong trips accepted.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** WebSocket, Dispatch, Driver app.

**BUG-WS-004 · Distributed · WebSocket — Reconnect gap without state resync**
- **Possible bug:** After reconnect, clients that only resume events (no snapshot) could act on stale beliefs, e.g., a driver serving a ride that was reassigned.
- **Trigger / scenario:** Disconnect during reassignment window.
- **Why plausible:** Resume-from-event-id designs lack full-state reconciliation.
- **Impact:** Ghost assignments; driver arrives to nobody.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** WebSocket, Dispatch, Driver app.

**BUG-WS-005 · Stale data · Presence — Killed app remains "online"**
- **Possible bug:** Presence heartbeats stopping might take too long (or never) to flip availability, so matching assigns offline drivers.
- **Trigger / scenario:** App killed by OS; socket close not detected promptly.
- **Why plausible:** Presence TTLs tuned long for flaky networks.
- **Impact:** Dead-air dispatch; rider wait timeouts.
- **Severity/Likelihood/Detection:** HIGH / HIGH / EASY · **Affected:** Presence, Dispatch, Rider app.

**BUG-WS-006 · Distributed · WebSocket — Delayed replay of old events onto new state**
- **Possible bug:** After a broker backlog clears, old events could be applied to state that has since changed (e.g., a cancel keyed by user applied to a new ride).
- **Trigger / scenario:** Long outage; replay without per-object version checks.
- **Why plausible:** At-least-once delivery with no state-version guards.
- **Impact:** New rides cancelled by old events; financial side-effects re-applied.
- **Severity/Likelihood/Detection:** HIGH / LOW-MEDIUM / HARD · **Affected:** Events, Ride, Wallet.

**BUG-WS-007 · Concurrency · Presence/Dispatch — Presence flip races match commit**
- **Possible bug:** (Generalization of DISPATCH-008) presence updates and match decisions could interleave inconsistently in either direction.
- **Trigger / scenario:** Offline toggle during matching.
- **Why plausible:** Two independent write paths to availability.
- **Impact:** Mismatched availability beliefs across services.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Presence, Dispatch.

---

### 1.14 Notifications / Push / SMS

**BUG-NOTIF-001 · Distributed · Notifications — Post-cancellation messages from delayed queues**
- **Possible bug:** "Your driver is arriving" could be delivered after cancellation due to queue lag.
- **Trigger / scenario:** Notification backlog or provider delay.
- **Why plausible:** Notification pipelines are async by design.
- **Impact:** User confusion; accidental re-booking; support load.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Notifications, Ride.

**BUG-NOTIF-002 · Concurrency · Notifications — Multi-device duplicate pushes drive double actions**
- **Possible bug:** Users on multiple devices could receive the same actionable push twice; tapping both triggers a second action attempt that fails confusingly.
- **Trigger / scenario:** Phone + tablet logged in; actionable notification.
- **Why plausible:** Fan-out per-device without action-level dedup.
- **Impact:** Confusing errors; in worst cases duplicate effects on non-idempotent actions.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Notifications, Clients.

**BUG-NOTIF-003 · Security · Notifications — Wrong recipient resolution**
- **Possible bug:** Broadcast or templated sends could resolve recipients too broadly (other tenants, unrelated users).
- **Trigger / scenario:** A fleet-wide or ops broadcast with a recipient-resolution defect.
- **Why plausible:** Template/recipient composition is a common defect surface.
- **Impact:** Information leakage; panic (e.g., payment-failure notices to wrong users).
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / MEDIUM · **Affected:** Notifications, Fleet, Privacy.

**BUG-NOTIF-004 · Functional · Notifications — Stale deep links**
- **Possible bug:** Pushes opened late could deep-link into expired promos or reassigned rides, erroring or showing wrong context.
- **Trigger / scenario:** User opens a notification hours later.
- **Why plausible:** Links resolve live state without expiry guards.
- **Impact:** Poor UX; wrong-context actions.
- **Severity/Likelihood/Detection:** LOW-MEDIUM / HIGH / EASY · **Affected:** Notifications, Promos, Ride.

**BUG-NOTIF-005 · Security · Notifications/SMS — Late OTP SMS creates confusion window**
- **Possible bug:** Delayed OTP messages arriving after a retry could lead users to enter the wrong (older) code, or enlarge the valid-code window.
- **Trigger / scenario:** SMS provider latency under load.
- **Why plausible:** Delivery latency is common in the region.
- **Impact:** Login failures; slightly wider replay window.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** SMS, Auth.

**BUG-NOTIF-006 · Security · Notifications — Template variable mix-up between users**
- **Possible bug:** Payment or SOS templates could interpolate another user's details if context objects are shared/mis-scoped per send.
- **Trigger / scenario:** Batch send with a context-assignment defect.
- **Why plausible:** Batch templating bugs are a recurring industry pattern.
- **Impact:** PII leakage across users.
- **Severity/Likelihood/Detection:** MEDIUM-HIGH / LOW-MEDIUM / HARD · **Affected:** Notifications, Privacy.

**BUG-NOTIF-007 · Infrastructure · Notifications — No dedup on event retry → spam → users disable notifications**
- **Possible bug:** Retried events could each generate a push; users silence the app; later critical alerts (SOS, dispatch) are missed.
- **Trigger / scenario:** Event retries + no send-level dedup.
- **Why plausible:** Dedup is per-consumer discipline.
- **Impact:** Cascading: notification fatigue converts into missed safety alerts.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Notifications, Events, SOS.

---

### 1.15 Config / Feature Flags / Units / Time

**BUG-CFG-001 · Config · Waiting time — seconds vs milliseconds**
- **Possible bug:** A waiting-time threshold expressed in seconds but read as milliseconds (or vice versa) could produce 1000× waiting fees or none.
- **Trigger / scenario:** Config authored by a different team than the reader.
- **Why plausible:** Unit conventions differ per team.
- **Impact:** Immediate, dramatic mischarging.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / EASY · **Affected:** Waiting charges, Config, Fare.

**BUG-CFG-002 · Config · Dispatch radius — metres vs kilometres**
- **Possible bug:** A search radius in the wrong unit could broadcast to the entire city or to nobody.
- **Trigger / scenario:** Radius config migrated between formats.
- **Why plausible:** Same unit-family trap as CFG-001.
- **Impact:** Dispatch failure or mass broadcast.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / EASY · **Affected:** Dispatch, Config.

**BUG-CFG-003 · Config · Surge — percent vs decimal**
- **Possible bug:** 15 (meaning 15%) read as a multiplier, or 0.15 read as percent, could yield 15× or near-zero surge.
- **Trigger / scenario:** Surge config edited via a different tool than the reader expects.
- **Why plausible:** Percent/decimal duality is endemic.
- **Impact:** Extreme mispricing visible to all riders.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / EASY · **Affected:** Surge, Fare, Config.

**BUG-CFG-004 · Config · Money — BDT vs paisa constant**
- **Possible bug:** A hard-coded amount in one unit consumed in the other could 100× a fee (related to FIN-010 but config-sourced).
- **Trigger / scenario:** New config entry added during an incident.
- **Why plausible:** Money constants are frequently hand-entered.
- **Impact:** Immediate mischarge on the affected path.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / EASY · **Affected:** Config, Fees.

**BUG-CFG-005 · Config · Feature flags — Enabled in API, disabled in worker**
- **Possible bug:** A flag could be enabled for the API layer but not the async worker, e.g., tips accepted and charged but never credited to driver earnings.
- **Trigger / scenario:** Flag rollout touching multiple layers with separate flag stores/caches.
- **Why plausible:** Flags are consumed per-service; a partial rollout is easy.
- **Impact:** Money taken without entitlement delivered.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Feature flags, Tips, Workers.

**BUG-CFG-006 · Config — Cache TTL split-brain across services**
- **Possible bug:** Different config cache TTLs could give services contradictory views of the same flag/value mid-operation.
- **Trigger / scenario:** Config changed while rides are in flight.
- **Why plausible:** Per-service cache settings.
- **Impact:** Inconsistent behavior that "can't be reproduced" later.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Config, all consumers.

**BUG-CFG-007 · Config — Update without invalidation on some nodes**
- **Possible bug:** Some nodes could serve stale config indefinitely after an update if no invalidation is broadcast.
- **Trigger / scenario:** Partial invalidation coverage.
- **Why plausible:** Invalidation fan-out is another distributed-systems problem.
- **Impact:** Split behavior across identical requests.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Config, all consumers.

**BUG-TIME-001 · Time — UTC midnight is 06:00 Dhaka**
- **Possible bug:** Day-boundary logic (promos, reports, expiries) anchored to UTC could expire "today" promotions at 06:00 local or include the wrong local day.
- **Trigger / scenario:** Anything labeled "daily" evaluated against UTC days.
- **Why plausible:** Bangladesh's fixed +6 offset makes the bug silent — no DST symptom ever forces awareness.
- **Impact:** Promos ending mid-peak; daily financial reports misstated.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Promotions, Reports, Scheduler.

**BUG-TIME-002 · Time — Month-end boundary handling**
- **Possible bug:** Proration, expiry, and billing could mishandle 28/29/30/31-day months (see FIN-017, generalized to any monthly logic).
- **Trigger / scenario:** Month-ends, leap Februaries.
- **Why plausible:** Calendar arithmetic assumptions.
- **Impact:** Off-by-a-day charges/expiries.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Billing, Passes, Reports.

**BUG-TIME-003 · Time — Client clock skew drives countdowns**
- **Possible bug:** Bid deadlines or OTP expiry rendered from device clocks could show expired-while-server-accepts (or vice versa).
- **Trigger / scenario:** User device clock off by minutes.
- **Why plausible:** Client-rendered countdowns without server-time anchoring.
- **Impact:** Missed bids; user-perceived unfairness.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Rental bidding, Clients.

**BUG-TIME-004 · Time — Server clock skew reorders events**
- **Possible bug:** Timestamps from different nodes could order first-accept or bid arrival incorrectly.
- **Trigger / scenario:** NTP drift between app servers.
- **Why plausible:** Wall-clock ordering across nodes is not total.
- **Impact:** Wrong first-accept winner; disputed awards.
- **Severity/Likelihood/Detection:** HIGH / LOW-MEDIUM / HARD · **Affected:** Dispatch, Rental bidding, Time.

**BUG-TIME-005 · Time — Peak/off-peak boundary crossing rides**
- **Possible bug:** (RIDE-015, listed here for boundary-family completeness) boundary rides could be rated wholly on old/new tariffs.
- **Trigger / scenario:** Ride spanning tariff switch.
- **Why plausible:** Split vs whole-rate ambiguity.
- **Impact:** Systematic boundary mispricing.
- **Severity/Likelihood/Detection:** MEDIUM / LOW-MEDIUM / HARD · **Affected:** Fare, Tariffs.

---

### 1.16 Data Consistency / Cross-Service

**BUG-DATA-001 · Data consistency — Orphan records from mid-write crashes**
- **Possible bug:** A crash between related writes could leave a ride without a payment record, an order without a delivery leg, etc.
- **Trigger / scenario:** Process/host failure during multi-store operations.
- **Why plausible:** No transaction spans services.
- **Impact:** Support-visible ghosts; reconciliation burden.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / HARD · **Affected:** Ride, Payments, Delivery.

**BUG-DATA-002 · Data consistency — Counter drift (trips, ratings)**
- **Possible bug:** Denormalized counters could drift from source tables, corrupting incentive thresholds and driver tiering.
- **Trigger / scenario:** Any counter increment lost or duplicated.
- **Why plausible:** Counters are write-amplification optimizations without reconciliation.
- **Impact:** Wrong bonuses/demotions.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Incentives, Ratings, Fleet.

**BUG-DATA-003 · Data consistency/Security — Soft-deleted user keeps wallet and session**
- **Possible bug:** A soft-deleted user could retain a live wallet and valid tokens, and reports could include/exclude them inconsistently.
- **Trigger / scenario:** Deletion mid-lifecycle with active token.
- **Why plausible:** Soft delete rarely cascades to auth, wallet, and reporting uniformly.
- **Impact:** Post-deletion financial activity; audit inconsistencies.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / HARD · **Affected:** Auth, Wallet, Reports.

**BUG-DATA-004 · Financial — Wallet-vs-ledger reconciliation tolerance masks drift**
- **Possible bug:** A reconciliation job with a tolerance (or per-day netting) could mask accumulating small discrepancies from any of the FIN bugs above.
- **Trigger / scenario:** Small duplicate/missing entries below tolerance.
- **Why plausible:** Tolerances are added to quiet noise.
- **Impact:** Slow silent balance corruption.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Wallet, Ledger, Accounting.

**BUG-DATA-005 · Data — Duplicate accounts from +880 vs 0-prefix phone formats**
- **Possible bug:** The same subscriber could exist twice if normalization of local vs international formats differs across registration paths, splitting wallets and promo eligibility.
- **Trigger / scenario:** User registers once with "01…" and once with "+8801…".
- **Why plausible:** Number normalization is notoriously inconsistent.
- **Impact:** Double promo abuse; support confusion; wallet fragmentation.
- **Severity/Likelihood/Detection:** HIGH / HIGH / EASY · **Affected:** Auth, Wallet, Promotions.

**BUG-DATA-006 · Stale data — Cached decision inputs (rating, vehicle, zone)**
- **Possible bug:** Decisions (matching priority, dispatch eligibility) could consume cached values that changed.
- **Trigger / scenario:** Cache TTL vs change frequency mismatch.
- **Why plausible:** Caching for read throughput.
- **Impact:** Decisions on stale facts; hard-to-reproduce complaints.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Dispatch, Ratings, Fleet.

**BUG-DATA-007 · Cross-service — "A succeeds, B fails" partial chains**
- **Possible bug:** In the Ride→Payment→Wallet→Ledger chain, any middle hop could fail after the earlier committed, leaving paid-but-unrecorded or recorded-but-unpaid states.
- **Trigger / scenario:** Transient failure mid-chain without compensation.
- **Why plausible:** Distributed transactions are absent by design; compensation is per-flow work.
- **Impact:** Financial inconsistency requiring manual repair.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / HARD · **Affected:** Ride, Payments, Wallet, Ledger.

**BUG-DATA-008 · Reporting — Snapshots taken during in-flight transactions**
- **Possible bug:** Financial reports reading while transactions are mid-flight could produce totals that don't match a later re-run, eroding trust in all numbers.
- **Trigger / scenario:** Report generation during business hours.
- **Why plausible:** No consistent snapshot discipline.
- **Impact:** Audit confusion; false bug reports internally.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Reports, Accounting.

---

### 1.17 Mobile / Network / Client

**BUG-MOB-001 · Retry/Idempotency · Clients — Ride request double-submitted**
- **Possible bug:** A retried ride request without an idempotency key could create two rides, two drivers, one visible to the rider.
- **Trigger / scenario:** Timeout on request; client auto- or user-retry.
- **Why plausible:** App-level retry is standard; server-side idempotency is not.
- **Impact:** Duplicate dispatch; one driver stranded; fee disputes.
- **Severity/Likelihood/Detection:** HIGH / HIGH / EASY · **Affected:** Rider app, Dispatch, Ride.

**BUG-MOB-002 · Mobile — "Server completed, phone thinks failed"**
- **Possible bug:** A cancel request that succeeds server-side but times out client-side could lead the rider to re-cancel/re-book, producing a ghost ride with a driver en route.
- **Trigger / scenario:** Mobile network drop after send.
- **Why plausible:** Response loss is indistinguishable from failure.
- **Impact:** Ghost rides; duplicate charges at boundaries.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Rider app, Ride, Dispatch.

**BUG-MOB-003 · Mobile — Backgrounded driver app stops location**
- **Possible bug:** OS backgrounding could silently stop location updates, breaking arrival detection and no-show logic while the driver believes everything is fine.
- **Trigger / scenario:** Driver switches apps mid-trip.
- **Why plausible:** Background-execution restrictions vary by OS/version.
- **Impact:** Mis-declared no-shows; wrong waiting fees; failed auto-arrival.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Driver app, Location, Ride.

**BUG-MOB-004 · Mobile — Offline queued actions replay out of order**
- **Possible bug:** Actions queued offline (e.g., completion) could replay after the server has since accepted a cancellation, reviving dead state.
- **Trigger / scenario:** Long connectivity gap spanning a cancellation.
- **Why plausible:** Local queues replay in arbitrary order without server-side sequence guards.
- **Impact:** Completed-after-cancelled rides; charges for dead trips.
- **Severity/Likelihood/Detection:** HIGH / LOW-MEDIUM / HARD · **Affected:** Driver app, Ride, Events.

**BUG-MOB-005 · Mobile — Notification permission denied while auto-accept on**
- **Possible bug:** A driver could enable auto-accept with push notifications disabled, so riders see "accepted" while the driver never learns of the ride.
- **Trigger / scenario:** Fresh install, permissions skipped.
- **Why plausible:** Auto-accept assumes notification delivery.
- **Impact:** Rider waits on a driver who never departs.
- **Severity/Likelihood/Detection:** HIGH / MEDIUM / EASY · **Affected:** Driver app, Dispatch, Notifications.

**BUG-MOB-006 · Mobile — Stale wallet display drives failed payments**
- **Possible bug:** A cached wallet balance could encourage orders that then fail on authoritative check, in confusing sequences.
- **Trigger / scenario:** Balance recently spent on another device.
- **Why plausible:** Display caching for speed.
- **Impact:** UX failures; retry storms; support load.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / EASY · **Affected:** Wallet, Clients.

**BUG-MOB-007 · Mobile — App version skew with new enum values**
- **Possible bug:** Older app versions receiving new status enum values (of ~47 enums) could render or act wrongly.
- **Trigger / scenario:** New enum shipped server-side before app update saturation.
- **Why plausible:** Version skew windows are inevitable.
- **Impact:** Mis-rendered states; wrong client actions on unknown values.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Clients, all status enums.

---

### 1.18 Ratings

**BUG-RATE-001 · Stale data · Ratings — Rating submitted for the wrong ride**
- **Possible bug:** After reassignment, a rating could attach to the pre-reassignment driver/ride from stale client context.
- **Trigger / scenario:** Rating flow opened from a stale screen.
- **Why plausible:** Rating context denormalized at flow start.
- **Impact:** Wrong driver penalized.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / EASY · **Affected:** Ratings, Ride.

**BUG-RATE-002 · Retry · Ratings — Duplicate rating events skew averages**
- **Possible bug:** Retried rating submissions could count twice if not deduplicated per ride per rater.
- **Trigger / scenario:** Timeout + retry.
- **Why plausible:** Ratings feel low-stakes; idempotency often skipped.
- **Impact:** Skewed averages affecting tiers/matching.
- **Severity/Likelihood/Detection:** LOW-MEDIUM / MEDIUM / MEDIUM · **Affected:** Ratings.

**BUG-RATE-003 · Data consistency · Ratings — Count/average mismatch corrupts thresholds**
- **Possible bug:** Cached averages vs live counts could diverge, flipping drivers across demotion thresholds incorrectly.
- **Trigger / scenario:** Counter drift (see DATA-002) plus threshold checks.
- **Why plausible:** Thresholds evaluated on denormalized data.
- **Impact:** Unfair driver deactivation/matching penalties.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Ratings, Fleet, Dispatch.

---

### 1.19 Fraud & Abuse

**BUG-FRAUD-001 · Fraud — Driver-rider collusion fake trips**
- **Possible bug:** Colluding pairs could complete fabricated trips to farm incentives, completing the full ride state machine with spoofed or trivial routes.
- **Trigger / scenario:** Incentive thresholds exceed trip costs.
- **Why plausible:** The state machine is satisfiable by two cooperating parties.
- **Impact:** Direct payout fraud.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Incentives, Ride, Trust & Safety.

**BUG-FRAUD-002 · Fraud — Online-hours farming via location spoofing**
- **Possible blob:** Spoofed presence/location could farm availability-based incentives without driving.
- **Trigger / scenario:** Online-hours bonus programs.
- **Why plausible:** Presence is self-reported by the client.
- **Impact:** Incentive leakage.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Incentives, Location, Fleet.

**BUG-FRAUD-003 · Fraud — Referral farms on recycled numbers/devices**
- **Possible bug:** Re-registering accounts (possibly leveraging recycled numbers, see AUTH-005) could multiply referral rewards.
- **Trigger / scenario:** Referral bonus exceeds SIM/device cost.
- **Why plausible:** Identity binding is phone+device only.
- **Impact:** Coupon/referral budget drained.
- **Severity/Likelihood/Detection:** HIGH / HIGH / MEDIUM · **Affected:** Referrals, Auth, Promotions.

**BUG-FRAUD-004 · Concurrency/Fraud — Coupon race stacking**
- **Possible bug:** Beyond FIN-011's double redemption, concurrent carts could stack incompatible coupons if compatibility is validated per-item rather than per-cart.
- **Trigger / scenario:** Two coupons applied in parallel edits.
- **Why plausible:** Compatibility checks are hard to serialize with cart editing.
- **Impact:** Below-cost orders.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Promotions, Cart.

**BUG-FRAUD-005 · Security/Fraud — Payout method change without re-verification**
- **Possible bug:** An account takeover followed by payout-method change could cash out wallet/earnings before the legitimate owner notices, if changes don't require re-verification or a delay.
- **Trigger / scenario:** Compromised session; withdrawal + method change in quick succession.
- **Why plausible:** Low-friction payout config is the default for driver experience.
- **Impact:** Irreversible cash loss.
- **Severity/Likelihood/Detection:** CRITICAL / MEDIUM / MEDIUM · **Affected:** Wallet, Payouts, Auth.

**BUG-FRAUD-006 · Fraud — Forged documents pass during approval backlog**
- **Possible bug:** Backdated or forged vehicle/driver documents could pass while the verification backlog is long, and the expiry job may never re-check backdated entries.
- **Trigger / scenario:** Verification queue slower than document expiry cycles.
- **Why plausible:** Manual verification cadence vs automated expiry assumptions.
- **Impact:** Unqualified drivers/vehicles dispatched; liability.
- **Severity/Likelihood/Detection:** MEDIUM / MEDIUM / MEDIUM · **Affected:** Fleet, Compliance, Trust & Safety.

**BUG-FRAUD-007 · Security — Client-computed fare or distance trusted on some completion path**
- **Possible bug:** A completion path (e.g., offline completion sync) could trust driver-client-computed distance/fare without server recomputation.
- **Trigger / scenario:** Modified client submitting a completion offline.
- **Why plausible:** Offline paths often accept client data for availability.
- **Impact:** Arbitrary fare manipulation.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / HARD · **Affected:** Ride, Fare, Trust & Safety.

**BUG-FRAUD-008 · Security — Webhook replay without timestamp/nonce checks**
- **Possible bug:** An old signed "payment success" callback could be replayed to re-credit a wallet if signatures are valid indefinitely without freshness checks.
- **Trigger / scenario:** Captured webhook replayed later.
- **Why plausible:** Signature validation without replay protection is common.
- **Impact:** Direct wallet inflation.
- **Severity/Likelihood/Detection:** CRITICAL / LOW-MEDIUM / MEDIUM · **Affected:** Payments, Wallet, Security.

**BUG-FRAUD-009 · Fraud — Cash rides misreported to dodge commission**
- **Possible bug:** Driver-rider pairs settling cash off-platform while reporting cancellation/no-show could avoid commission while farming availability stats.
- **Trigger / scenario:** Cash-trip culture; weak cash reconciliation.
- **Why plausible:** Cash flows are inherently unverifiable server-side.
- **Impact:** Revenue leakage; distorted metrics.
- **Severity/Likelihood/Detection:** HIGH / HIGH / HARD · **Affected:** Ride, Cash fares, Trust & Safety.

**BUG-FRAUD-010 · Fraud — Cancellation-fee farming**
- **Possible bug:** Drivers could accept-then-stall to induce rider cancellations and collect cancellation fees.
- **Trigger / scenario:** Fee structure favors driver on rider-cancel.
- **Why plausible:** Incentive design without behavioral guards.
- **Impact:** Rider churn; fee disputes.
- **Severity/Likelihood/Detection:** MEDIUM / HIGH / MEDIUM · **Affected:** Ride, Fees, Trust & Safety.

---

## 2. TOP 100 BUGS TO INVESTIGATE FIRST

Ranked in priority tiers (each tier internally ordered). Prioritization weighs financial damage, safety, security, likelihood, detection difficulty (harder-to-see severe bugs rank higher for *proactive* investigation), and cross-service blast radius.

**Tier 1 — Financial-critical, direct-loss potential**
1. FIN-001 — duplicate top-up credit; silent direct loss.
2. FIN-002 — credit-before-confirmation; free balance.
3. FIN-004 — refund stacking beyond original; fraud magnet.
4. FIN-005 — double refund on retry.
5. FIN-007 — balance/ledger drift; corrupts accounting foundation.
6. FIN-008 — double withdrawal TOCTOU; primary cash-out fraud path.
7. FIN-022 — payout job overlap; double cash-out at scale.
8. FIN-030 — quote-vs-settlement margin drift; chronic leakage.
9. FIN-031 — capture-after-cancel; charging cancelled rides.
10. DISPATCH-007 — cross-vertical double-booking; affects every vertical.

**Tier 2 — Financial-state and fee integrity**
11. RIDE-001 — completion after cancellation; ghost charges.
12. FIN-029 — rides completing on insufficient balance.
13. FIN-009 — concurrent debits → negative wallets.
14. FIN-011 — single-use promo double redemption.
15. DISPATCH-011 — cancel/accept race; wrong cancellation fees.
16. FIN-018 — waiting charge double-count.
17. FIN-021 — earnings without refund clawback.
18. FIN-025 — incomplete double-entry reversal.
19. FIN-003 — dual payment path double charge.
20. FIN-023 — payout of disputed earnings.

**Tier 3 — Safety-critical**
21. EMRG-002 — revoked provider in emergency broadcast.
22. EMRG-003 — two ambulances dispatched.
23. EMRG-005 — emergency dispatch onto committed provider.
24. EMRG-004 — urgent dispatch on scheduled config.
25. EMRG-001 — cert expiry during dispatch cycle.
26. SOS-005 — SOS silently dropped without push.
27. SOS-006 — stale SOS location misdirects responders.
28. SOS-003 — driver can dismiss rider SOS.
29. AUTH-008 — ride PIN brute force.
30. RIDE-009 — OTP for wrong ride.

**Tier 4 — Security, authorization, fraud**
31. AUTH-002 — tenant-scope leakage across admin surface.
32. AUTH-001 — rider/driver profile token misuse.
33. AUTH-010 — over-broad fleet viewer role.
34. FRAUD-005 — payout method change after takeover.
35. FRAUD-007 — client-computed fare trusted.
36. FRAUD-008 — webhook replay.
37. AUTH-005 — phone number recycling takeover.
38. AUTH-006 — OTP replay window.
39. FRAUD-001 — collusion fake trips.
40. AUTH-003 — stale role after demotion.

**Tier 5 — Core dispatch races**
41. DISPATCH-001 — one driver, two riders.
42. DISPATCH-003 — first-accept double acknowledgement.
43. DISPATCH-004 — redispatch strands original driver.
44. DISPATCH-002 — auto-accept vs manual accept.
45. DISPATCH-010 — scheduled ride double dispatch.
46. DISPATCH-008 — assignment to driver going offline.
47. DISPATCH-009 — surge quote/dispatch mismatch.
48. DISPATCH-012 — auto-accept during active ride.
49. RIDE-002 — double completion double charge.
50. WS-005 — killed app remains "online".

**Tier 6 — Config/units/time (cheap to verify, catastrophic if present)**
51. CFG-001 — waiting time seconds/ms.
52. CFG-002 — radius m/km.
53. CFG-003 — surge percent/decimal.
54. CFG-004 — BDT/paisa constant.
55. CFG-005 — flag on in API, off in worker.
56. TIME-001 — UTC day boundary vs Dhaka day.
57. CFG-006 — config cache split-brain.
58. SCHED-005 — daily jobs on UTC boundaries.
59. TIME-002 — month-end arithmetic.
60. FIN-010 — paisa/BDT unit mismatch in money paths.

**Tier 7 — Scheduler/async duplication and races**
61. SCHED-001 — job overlap without lock.
62. SCHED-003 — expiry job overwriting user action.
63. SCHED-004 — partial batch + full retry.
64. SCHED-007 — no per-run idempotency.
65. SCHED-009 — timeout job vs arrival event.
66. FIN-027 — incentive double-award.
67. FIN-012 — referral double credit.
68. SCHED-002 — missed runs, stuck states.
69. FIN-020 — fee-split rounding drift.
70. SCHED-006 — backlog cascade.

**Tier 8 — Mobile/real-time client-state integrity**
71. MOB-001 — ride request double-submit.
72. MOB-002 — cancel "failed" but succeeded.
73. MOB-003 — backgrounded app stops location.
74. MOB-005 — auto-accept without notifications.
75. WS-004 — reconnect without state resync.
76. WS-001 — duplicate subscription, duplicate events.
77. MOB-004 — offline queue out-of-order replay.
78. WS-003 — out-of-order events drive stale actions.
79. RIDE-014 — free-window cancellation missed by queue delay.
80. MOB-006 — stale wallet display.

**Tier 9 — Marketplace / rental / delivery integrity**
81. MKT-001 — inventory oversell.
82. MKT-002 — reservation release during payment.
83. MKT-010 — cancellation not propagated to delivery.
84. DELIV-001 — duplicate delivery bridge.
85. DELIV-002 — lifecycle mapping mismatches.
86. DELIV-008 — fee mismatch shop vs platform.
87. RENT-003 — duplicate award.
88. RENT-004 — demotion vs confirmation race.
89. RENT-001 — sealed-bid leak.
90. RENT-005 — old winner keeps events.

**Tier 10 — Data consistency, fleet compliance, location**
91. DATA-004 — reconciliation tolerance masks drift.
92. DATA-005 — +880/0 duplicate accounts.
93. DATA-007 — partial cross-service chains.
94. FLEET-005 — document expiry window.
95. FLEET-008 — duplicate invoice.
96. LOC-001 — driver GPS spoofing.
97. LOC-003 — stale GPS in arrival detection.
98. RIDE-007 — GPS gap interpolation overcharge.
99. RIDE-013 — premature arrival, early waiting fees.
100. DATA-003 — soft-deleted user keeps wallet/session.

---

## 3. TOP 30 RARE BUT SEVERE BUGS

These are the entries most likely to escape ordinary testing because they require rare timing, multiple actors, provider failures, retries, stale state, multiple devices, scheduler interaction, or unusual data.

1. **FIN-031** — Auth-capture after cancel: requires cancellation landing in the authorization-capture gap; nobody tests cancel-during-payment.
2. **RENT-004** — SLA demotion vs winner confirmation: requires a confirmation in the final seconds of the SLA window plus job timing.
3. **DISPATCH-007** — Cross-vertical double-booking: requires simultaneous assignment in two verticals; per-vertical tests never exercise it.
4. **FIN-030** — Quote-vs-settlement drift: needs dynamic fare components changing between two computations of the same ride.
5. **WS-006** — Delayed event replay onto new state: needs a broker backlog, then an old event keyed loosely enough to hit new state.
6. **MOB-004** — Offline queue replay out of order: needs a long offline window spanning a server-side cancellation.
7. **SCHED-004** — Partial batch + full retry: needs a mid-batch failure; retried prefix duplicates silently.
8. **FIN-006** — Gateway refund succeeds, wallet adjust fails: needs the exact one-leg-succeeds split across an external boundary.
9. **RENT-005** — Old winner keeps receiving events: needs demotion while the old winner's connection is live.
10. **EMRG-004** — Urgent dispatch inheriting scheduled config: a config-reuse defect visible only in an emergency request path.
11. **FRAUD-008** — Webhook replay: needs an attacker with a captured payload; signature-valid-but-stale is rarely tested.
12. **TIME-004** — Server clock skew reordering first-accepts/bids: needs NTP drift across nodes exactly during a tie.
13. **AUTH-005** — Phone number recycling: depends on carrier behavior outside the system; months-long dormancy required.
14. **DATA-005** — +880/0 duplicate accounts: needs the same user registering via two formats on different paths.
15. **TIME-001** — UTC-midnight = 06:00 Dhaka: silent because no DST exists to expose it; only visible on day-boundary promotions/reports.
16. **RIDE-015** — Peak/off-peak boundary rides: only rides straddling the tariff switch; each mispriced slightly.
17. **CFG-005** — Flag on in API, off in worker (e.g., tips charged but never credited): requires a multi-layer rollout mismatch.
18. **WS-002** — Room reuse leaks events to previous participants: needs reassignment plus subscription lifecycle mismatch.
19. **FIN-018** — Waiting charge computed by both job and completion event: two authoritative calculators, only both-fire rarely.
20. **MKT-002** — Reservation TTL releases stock during payment: needs slow payment exactly spanning the TTL.
21. **RIDE-001** — Completion applied after cancellation: needs an offline/queued completion replaying after a cancel.
22. **DISPATCH-010** — Scheduled ride dispatched twice: needs a job retry where the first run actually committed.
23. **EMRG-006** — Emergency starvation behind normal backlog: needs a load spike coinciding with an emergency.
24. **SOS-001** — Post-ride SOS routed to previous driver: needs SOS in the minutes after completion.
25. **FLEET-003** — Subscription expiry mid-shift stranding payouts: needs expiry during an active trip and payout routing keyed to entitlement.
26. **FIN-017** — Month-end proration: clusters on month boundaries; each error is small and individually refundable.
27. **DELIV-004** — Overlapping legs cross-wire location events: needs a courier on two legs whose events resolve by courier, not leg.
28. **RENT-011** — Rental awarded to a driver mid-trip: needs auction close during an active ride-hail trip.
29. **EMRG-005** — Emergency dispatched onto a rental/delivery-committed provider: needs the exclusivity invariant missing plus commitment overlap.
30. **NOTIF-006** — Template variable mix-up across users in batch sends: needs a batch-send context defect; leaks PII with no functional symptom.

---

## 4. SELF-CRITIQUE

**Gaps I know I missed or under-covered:**
- **Admin breadth.** With ~205 routes and ~47 enums, I sampled authorization failure *patterns* (AUTH-002/010) rather than hypothesizing per-route. A verifier should sweep route-by-route for missing guards and enum-value drift.
- **Workshops, truck rental, RFQ award flows** received thin treatment relative to their stated presence; the rental-bidding section partially covers sealed-bid mechanics but workshop booking state machines are unexplored.
- **Rider-driver chat / support tooling / dispute workflows** (if present) are unexamined; dispute outcomes are financial side-effect sources (see FIN-004).
- **Provider-specific behaviors** for mobile-financial-service payment providers (statement timing, reference-number reuse, double-notification habits) are treated generically; the highest-value verification is provider-by-provider callback contract tests.
- **Map-provider failure modes** beyond geocoding (quota exhaustion, stale ETA data) are unexamined; degraded-map mode could interact with arrival detection.
- **Extended-outage recovery** (long power/network events, regionally plausible): broker replays, cold caches, backlog drain ordering — only touched via WS-006/SCHED-006.
- **Migration/ops hazards:** schema migrations racing live traffic, direct data fixes by ops bypassing state machines, seed data leaking via flags, secrets in config — all plausible, all unlisted above.
- **Audit-log integrity** (immutable, complete, per-actor) unexamined; several bugs above would be invisible or unattributable without it.
- **Bengali/English duality** in addresses, names, and SMS templates could interact with geocoding and template interpolation; unexamined.

**Likely duplicates / root-cause clusters (merge during verification):**
- **No global resource-exclusivity invariant:** DISPATCH-007, RENT-011, EMRG-005, and partially FLEET-001 are one systemic gap seen from four angles. Verify once as "is there a single authoritative busy-state?"
- **Client retry without idempotency:** RIDE-002, MOB-001, FIN-005, FIN-015, MKT-005, DELIV-001, SCHED-004/007, FRAUD-008 (replay variant), RATE-002, SOS-002. One root cause, ten symptoms — audit idempotency-key coverage as a single workstream.
- **Terminal-state writers without an arbiter:** DISPATCH-011, RIDE-001, MKT-007, DELIV-010, RENT-004, SCHED-003/009. Verify state-machine concurrency guards once per object type.
- **Unit mismatches:** CFG-001..004 and FIN-010; TIME-001/002; SCHED-005/008 boundary family. One audit of config typing and boundary operators covers them.
- **Stale location/freshness gates:** DISPATCH-005, RIDE-013, LOC-003, SOS-006, EMRG-007. One freshness-contract audit.
- **Overlapping authoritative calculators:** FIN-018, FIN-024, FIN-030, DISPATCH-009 — quote/settlement/job each recomputing the same quantity.

**Method limitations:** All likelihood ratings are informed guesses without code; several "MEDIUM/HIGH" entries may collapse to nothing under a single lock or constraint, and LOW-likelihood entries may be certain given an unlucky implementation. The catalogue should be read as a **verification checklist ordered by expected value of finding something**, not as a list of suspected defects. The single highest-leverage verifications, in order: (1) idempotency coverage on money-movement operations, (2) existence and atomicity of a cross-vertical busy-state, (3) state-machine concurrency guards on terminal transitions, (4) job locking and per-run idempotency, (5) config unit typing, (6) webhook dedup key choice and replay protection.