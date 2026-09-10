# RIDE — Independent Possible-Bug Survey  
**Scope:** Theoretical failure-mode catalogue only.  
**Constraint:** No codebase access. Nothing below is a confirmed defect. All items are possible failure modes that should be investigated against the real implementation.  
**Conventions:**  
- **S / L / D** = Severity / Likelihood / Detection difficulty.  
- Severity: **CRITICAL / HIGH / MEDIUM / LOW**  
- Likelihood: **VERY HIGH / HIGH / MEDIUM / LOW / VERY LOW**  
- Detection: **VERY HARD / HARD / MEDIUM / EASY / VERY EASY**  
- Some entries are “cluster” findings: one possible bug pattern that could cover several related implementation paths.

---

## 1. Full Bug Catalogue

### A) Auth, RBAC, Sessions, Multi-Tenancy

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| AUTH-001 | Authorization | Auth / RBAC | Possible bug: stale permission cache could preserve elevated rights after demotion. Trigger: role changed while user session is active. Plausible if authorization decisions are cached or propagated asynchronously. | Unauthorized actions in admin, fleet, or marketplace modules. | HIGH / MEDIUM / HARD | Auth, Admin, Fleet, Marketplace |
| AUTH-002 | Session management | Auth / Sessions | Possible bug: old session/device could remain usable after password change, logout-all, or credential revocation. Trigger: session invalidation races with in-flight requests. Plausible if revocation is not enforced at every resource boundary. | Account takeover persistence, unauthorized ride or wallet actions. | HIGH / MEDIUM / HARD | Auth, Rider, Driver, Wallet |
| AUTH-003 | Multi-tenancy | Auth / Tenant isolation | Possible bug: cross-tenant object access could occur if tenant scope is omitted from object lookup. Trigger: user from tenant A requests object belonging to tenant B. Plausible in shared multi-tenant platforms with many object types. | Data leakage, unauthorized fleet/marketplace/admin operations. | CRITICAL / MEDIUM / HARD | Fleet, Admin, Marketplace, Ride |
| AUTH-004 | OTP abuse | Auth / OTP | Possible bug: OTP reuse, brute force, or concurrent verification race could allow account takeover. Trigger: repeated OTP attempts, resend loops, or verification before rate limit is enforced. Plausible in phone-number-first systems. | Account takeover, driver onboarding fraud. | HIGH / MEDIUM / MEDIUM | Auth, Rider, Driver |
| AUTH-005 | Token race | Auth / Token lifecycle | Possible bug: concurrent refresh/replay of session tokens could create inconsistent login states or allow an invalidated device to continue briefly. Trigger: multiple devices refreshing simultaneously. Plausible if token rotation is not atomic. | Session confusion, temporary unauthorized access. | MEDIUM / LOW / HARD | Auth, Mobile clients |
| AUTH-006 | Presence inconsistency | Driver availability | Possible bug: driver could appear available after switching device, re-login, or network recovery when server-side availability is stale. Trigger: old presence state outlives new session state. Plausible with real-time presence systems. | Dispatch to unavailable driver, ghost drivers, rider delays. | HIGH / HIGH / HARD | Dispatch, Driver, Ride |
| AUTH-007 | Support/admin scope | Admin / Impersonation | Possible bug: support or admin impersonation scope could be broader than intended. Trigger: support user accesses a tenant, rider, driver, or wallet outside necessary scope. Plausible in large admin surfaces. | Privacy exposure, unauthorized refunds/adjustments. | HIGH / LOW / HARD | Admin, Wallet, Ride, Marketplace |
| AUTH-008 | Object-level authz | Ride / Order / Wallet | Possible bug: object-level authorization could be missing, allowing IDOR-style access to another user’s ride, order, invoice, wallet, or support case. Trigger: direct object ID access. Plausible with many object types and roles. | Data leakage, unauthorized actions, financial abuse. | CRITICAL / MEDIUM / HARD | Ride, Marketplace, Wallet, Admin |

---

### B) Ride-Hailing Dispatch, Lifecycle, State Machines

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| DISP-001 | Retry/idempotency | Ride creation | Possible bug: client timeout/retry could create duplicate ride requests. Trigger: rider app retries after network failure while first request succeeded. Plausible if creation is not idempotent. | Duplicate dispatch attempts, double cancellation fees, driver confusion. | HIGH / HIGH / MEDIUM | Rider, Dispatch, Billing |
| DISP-002 | Concurrency | Driver acceptance | Possible bug: two riders could be matched to the same driver if acceptance is not atomic. Trigger: driver receives two offers and accepts both near-simultaneously, or auto-assign overlaps with manual accept. Plausible in high-throughput dispatch. | Double assignment, rider abandonment, fare disputes. | CRITICAL / MEDIUM / HARD | Dispatch, Ride, Driver |
| DISP-003 | Concurrency | Auto-accept/manual accept | Possible bug: auto-accept job and driver manual accept could both assign the same offer. Trigger: driver taps accept while auto-accept timer fires. Plausible if assignment lock is missing or short-lived. | Duplicate assignment, inconsistent ride state. | HIGH / MEDIUM / HARD | Dispatch, Driver, Rider |
| DISP-004 | State race | Rider cancel vs driver accept | Possible bug: rider cancellation could race with driver acceptance, causing active ride, wrongful cancellation fee, or driver already dispatched after rider believes cancelled. Trigger: cancellation request arrives during accept processing. Plausible with asynchronous state transitions. | Wrong fee, driver displacement, rider charge dispute. | HIGH / HIGH / HARD | Ride, Billing, Dispatch |
| DISP-005 | State race | Rider cancel vs driver cancel | Possible bug: simultaneous rider and driver cancellation could produce ambiguous fee/no-show responsibility. Trigger: both press cancel within same window. Plausible if cancellation is not serialized per ride. | Wrong cancellation fee, unfair driver penalty, support disputes. | HIGH / HIGH / HARD | Ride, Billing, Trust & Safety |
| DISP-006 | Expiry race | Offer acceptance | Possible bug: driver/rider could accept an expired dispatch offer due to stale client state or delayed server acceptance. Trigger: delayed network delivery of accept after TTL. Plausible if server does not revalidate offer validity. | Assignment to unavailable rider/driver, ghost rides. | HIGH / MEDIUM / HARD | Dispatch, Ride |
| DISP-007 | Timezone/schedule | Scheduled rides | Possible bug: scheduled rides could dispatch at wrong local time if UTC/Dhaka conversion or date boundary is mishandled. Trigger: ride scheduled near midnight or month boundary. Plausible in systems storing UTC but rendering local time. | Early/late dispatch, missed scheduled rides. | HIGH / MEDIUM / HARD | Ride, Scheduler, Rider |
| DISP-008 | Multi-stop logic | Ride lifecycle | Possible bug: multi-stop ride could allow skipped stops, incorrect stop completion order, or fare recalculation mismatch. Trigger: driver/rider changes stops mid-ride or network loss hides stop events. Plausible with complex ride state. | Incorrect fare, rider dispute, driver earnings mismatch. | MEDIUM / MEDIUM / HARD | Ride, Billing, Rider, Driver |
| DISP-009 | Geofence/no-show | No-show fees | Possible bug: no-show timer could start from stale or inaccurate arrival detection. Trigger: GPS drift, delayed location event, or old geofence entry. Plausible if arrival is inferred from last location only. | Wrong no-show fee, rider complaints, driver penalty. | HIGH / HIGH / HARD | Ride, Billing, Location |
| DISP-010 | Ride PIN | Ride security | Possible bug: ride PIN could be bypassed, reused, or validated against stale ride state. Trigger: driver starts ride without fresh PIN verification. Plausible if PIN check is client-assisted or cached. | Unauthorized ride start, safety/fraud risk. | HIGH / LOW / HARD | Ride, Safety, Rider |
| DISP-011 | Location validation | Ride start | Possible bug: ride could be started without reliable proximity between driver and rider. Trigger: GPS spoofing, stale location, or missing server-side geofence check. Plausible in location-dependent systems. | Fake rides, safety risk, wrongful fare start. | HIGH / MEDIUM / HARD | Ride, Location, Safety |
| DISP-012 | Location validation | Ride completion | Possible bug: ride could be completed before reaching destination if stale/spoofed location passes completion checks. Trigger: driver app sends old or manipulated location. Plausible if completion relies on last event only. | Fare loss, rider safety issue, dispute. | HIGH / MEDIUM / HARD | Ride, Billing, Safety |
| DISP-013 | Redispatch loop | Dispatch | Possible bug: auto-redispatch after cancellation could loop, reassign a previously cancelled driver, or select a driver no longer eligible. Trigger: rapid cancellations and retries. Plausible in event-driven dispatch pipelines. | Rider delays, driver confusion, wasted dispatch capacity. | MEDIUM / MEDIUM / HARD | Dispatch, Ride |
| DISP-014 | Presence staleness | Dispatch | Possible bug: dispatch could continue targeting a driver whose app is offline or backgrounded due to stale presence. Trigger: socket disconnect not propagated to matching pool. Plausible in real-time systems. | Failed pickup, rider ETA mismatch. | HIGH / HIGH / HARD | Dispatch, Driver, Rider |
| DISP-015 | Multi-device conflict | Driver session | Possible bug: same driver could be active on multiple devices or fleet contexts, causing conflicting assignments. Trigger: driver logs in on new phone without old session invalidated. Plausible with mobile reconnects. | Double assignment, missing events, payout confusion. | HIGH / MEDIUM / HARD | Driver, Dispatch, Fleet |
| DISP-016 | Event ordering | Ride state | Possible bug: delayed or replayed event could modify a ride after it reached a newer state. Trigger: old “driver assigned” event arrives after cancellation. Plausible in async event systems without version guards. | State reversal, impossible states, billing errors. | HIGH / MEDIUM / HARD | Ride, Billing, Events |
| DISP-017 | State machine | Ride lifecycle | Possible bug: ride could enter impossible combinations such as active+cancelled, completed+refunded, or assigned+expired. Trigger: concurrent transitions, partial job failure, or missing invariant checks. Plausible in large state machines. | Financial inconsistency, operational stuck rides. | HIGH / MEDIUM / HARD | Ride, Billing, Admin |
| DISP-018 | Cancellation logic | Fee policy | Possible bug: cancellation reason could be misclassified, causing fee waiver when fee should apply or fee when rider should be protected. Trigger: client sends wrong reason, or timeout race changes actor attribution. Plausible with many cancellation paths. | Revenue leakage, unfair charges, support load. | MEDIUM / HIGH / MEDIUM | Ride, Billing, Trust |
| DISP-019 | Eligibility staleness | Driver dispatch | Possible bug: driver with expired documents, vehicle inspection, or certification could remain dispatchable due to stale eligibility cache. Trigger: expiry job delayed or cache not invalidated. Plausible with many eligibility rules. | Compliance risk, unsafe dispatch, regulatory exposure. | HIGH / MEDIUM / HARD | Dispatch, Fleet, Trust |
| DISP-020 | Queue backlog | Dispatch | Possible bug: dispatch offer could be sent after ride is already cancelled due to backlog or delayed worker. Trigger: high load or retry queue lag. Plausible in asynchronous matching systems. | Driver sent to cancelled ride, poor experience. | MEDIUM / MEDIUM / MEDIUM | Dispatch, Ride |

---

### C) Financial: Fare, Wallet, Ledger, Payments, Refunds, Tax

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| FIN-001 | Fare integrity | Quote vs settlement | Possible bug: final fare could diverge from quoted fare due to late route, toll, waiting, zone, or price-version mismatch. Trigger: quote cached, settlement recalculated differently. Plausible with dynamic pricing. | Rider disputes, refunds, revenue leakage. | HIGH / HIGH / HARD | Ride, Billing |
| FIN-002 | Waiting charges | Fare calculation | Possible bug: waiting charges could double-count during GPS loss, app backgrounding, or repeated arrival/departure events. Trigger: geofence flapping. Plausible with location-based timers. | Wrong fare, complaints. | HIGH / MEDIUM / HARD | Ride, Billing, Location |
| FIN-003 | Cancellation fee | Pickup fee | Possible bug: pickup or cancellation fee could be charged after driver cancels before arrival. Trigger: actor attribution race or stale cancellation source. Plausible with many cancellation paths. | Wrong rider charge, support refunds. | HIGH / MEDIUM / MEDIUM | Ride, Billing |
| FIN-004 | Tip routing | Driver tip | Possible bug: tip could be attached to wrong ride/driver due to stale context or retry. Trigger: rider tips after switching screens or app restarts. Plausible with delayed tip submission. | Wrong earnings, driver dispute. | HIGH / LOW / MEDIUM | Wallet, Driver, Ride |
| FIN-005 | Duplicate credit | Tip | Possible bug: duplicate tip could be created by client retry or webhook replay. Trigger: payment success retry after timeout. Plausible if tip creation lacks idempotency. | Double charge or double driver credit. | HIGH / MEDIUM / MEDIUM | Payments, Wallet |
| FIN-006 | Rounding | Ledger precision | Possible bug: rounding rules could create one-paisa/taka drift across many transactions. Trigger: repeated split, tax, discount, or refund rounding. Plausible even with minor-unit storage. | Ledger imbalance at scale, reconciliation issues. | LOW / HIGH / HARD | Ledger, Billing, Reports |
| FIN-007 | Tax base | Tax calculation | Possible bug: tax could be calculated on inconsistent base: gross fare, discounted fare, wallet-funded portion, tip, or pass-covered amount. Trigger: promotion or pass applied late. Plausible with many fare components. | Tax reporting error, regulatory risk. | HIGH / MEDIUM / HARD | Tax, Billing, Admin |
| FIN-008 | Webhook duplication | Wallet top-up | Possible bug: duplicate payment/top-up webhook could credit wallet twice. Trigger: provider retries callback after timeout. Plausible if idempotency key is not honored. | Financial loss, balance inflation. | CRITICAL / HIGH / HARD | Wallet, Payments, Ledger |
| FIN-009 | Payment race | Method switch | Possible bug: payment callback for old method could arrive after user switched method, causing double charge or wrong entitlement. Trigger: user retries with new payment while first provider completes. Plausible with slow gateways. | Double charge, ledger mismatch. | CRITICAL / MEDIUM / HARD | Payments, Ride, Wallet |
| FIN-010 | Refund race | Over-refund | Possible bug: concurrent partial and full refund attempts could over-refund. Trigger: support agent and automated job both refund same object. Plausible without refund locking. | Direct financial loss. | CRITICAL / MEDIUM / HARD | Refunds, Wallet, Admin |
| FIN-011 | Refund destination | Wallet refund | Possible bug: refund to closed, inactive, or missing wallet could create dangling credit or silent failure. Trigger: user account state changed after original payment. Plausible in lifecycle-heavy systems. | Lost refunds, support escalations. | HIGH / LOW / HARD | Wallet, Refunds |
| FIN-012 | Cash reconciliation | Driver earnings | Possible bug: cash ride earnings could be credited before cash collection reconciliation. Trigger: completion event triggers payout while cash status is unresolved. Plausible with async settlement. | Payout for uncollected cash. | HIGH / MEDIUM / HARD | Driver earnings, Finance |
| FIN-013 | Payout integrity | Chargeback/reversal | Possible bug: driver/vendor payout could include later reversed, refunded, or chargeback rides. Trigger: payout snapshot taken before reversal events settle. Plausible with delayed payment provider events. | Overpayment, clawback complexity. | HIGH / MEDIUM / HARD | Payouts, Finance |
| FIN-014 | Promotion stacking | Discount abuse | Possible bug: coupon, pass, promotion, or loyalty benefit could stack unintentionally, producing excessive discount. Trigger: multiple eligibility checks pass due to cached flags. Plausible with many promo types. | Revenue leakage, abuse. | HIGH / HIGH / MEDIUM | Promotions, Billing |
| FIN-015 | Duplicate activation | Pass/package | Possible bug: pass or call package could activate twice after retry. Trigger: client retry after timeout while server already activated. Plausible without idempotent activation. | Duplicate benefits or duplicate charge. | HIGH / MEDIUM / MEDIUM | Passes, Wallet |
| FIN-016 | Expiry cache | Pass benefit | Possible bug: expired pass could still provide benefit due to cached eligibility. Trigger: pass expires while active quote/ride remains open. Plausible if eligibility cached at quote time only. | Free/discounted rides after expiry. | MEDIUM / MEDIUM / HARD | Passes, Billing |
| FIN-017 | Wallet holds | Negative balance | Possible bug: wallet balance could go negative if hold, debit, refund, and top-up race. Trigger: concurrent payment authorization and balance update. Plausible without strong balance locking. | Financial loss, accounting mismatch. | CRITICAL / MEDIUM / HARD | Wallet, Payments |
| FIN-018 | Double-entry integrity | Ledger | Possible bug: double-entry ledger could become imbalanced if one leg succeeds and compensating leg fails. Trigger: partial transaction failure, timeout, or retry. Plausible in distributed financial flows. | Accounting mismatch, reconciliation failure. | CRITICAL / MEDIUM / HARD | Ledger, Finance |
| FIN-019 | Admin adjustment | Manual credit | Possible bug: manual wallet/ledger adjustment could be duplicated if admin action retried or double-submitted. Trigger: admin UI retry or bulk action rerun. Plausible without idempotency keys. | Wrong balances, fraud risk. | HIGH / MEDIUM / MEDIUM | Admin, Wallet |
| FIN-020 | Payment intent reuse | Payment linkage | Possible bug: same payment intent/token could be reused across different rides/orders. Trigger: client replay after failure or stale checkout session. Plausible if intent is not bound to order/ride. | Payment without entitlement, duplicate capture. | HIGH / LOW / HARD | Payments, Ride, Marketplace |
| FIN-021 | Webhook security | Callback replay | Possible bug: payment callback could be replayed or spoofed if signature, nonce, timestamp, or state validation is weak. Trigger: attacker or provider retry. Plausible wherever external callbacks exist. | Fraudulent credits, false success. | CRITICAL / LOW / HARD | Payments, Wallet |
| FIN-022 | Earnings split | Driver/vehicle change | Possible bug: earnings split could use stale driver, vehicle, fleet, or subscription data after mid-ride reassignment. Trigger: resource changes during active ride. Plausible with fleet/resource management. | Wrong payout, fleet disputes. | HIGH / LOW / HARD | Fleet, Driver earnings |
| FIN-023 | Commission tiers | Fleet subscription | Possible bug: commission could use stale subscription tier after upgrade/downgrade. Trigger: tier change during billing cycle or active ride. Plausible with cached billing config. | Wrong commission, fleet billing disputes. | MEDIUM / MEDIUM / HARD | Fleet, Billing |
| FIN-024 | Tax date boundary | Tax rate | Possible bug: tax rate or report date could be selected incorrectly around midnight/month-end. Trigger: transaction completion crosses date boundary. Plausible with UTC/local divergence. | Tax report errors. | HIGH / LOW / HARD | Tax, Reports |
| FIN-025 | Hold/release | Payment holds | Possible bug: hold could remain stuck or be released twice if release is non-idempotent. Trigger: payment timeout then late success/failure callback. Plausible with payment provider retries. | Stuck customer funds or double spend. | HIGH / MEDIUM / HARD | Wallet, Payments |

---

### D) Promotions, Passes, Referrals, Loyalty, Fraud

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| PROMO-001 | Referral abuse | Referral rewards | Possible bug: referral reward could be credited before qualifying action completes or duplicated by retry. Trigger: event replay or premature qualification flag. Plausible in reward pipelines. | Fraudulent credits, marketing cost leakage. | HIGH / HIGH / MEDIUM | Promotions, Wallet |
| PROMO-002 | Coupon reuse | Coupons | Possible bug: coupon could be reused across accounts/devices if user scoping or device fingerprint is weak. Trigger: same code shared across multiple accounts. Plausible with phone/SIM churn. | Discount abuse. | HIGH / HIGH / MEDIUM | Promotions, Billing |
| PROMO-003 | Eligibility staleness | First-ride promo | Possible bug: first-ride or new-user eligibility could be stale, allowing repeated first-ride benefits. Trigger: account state cached before first ride completes. Plausible with async ride completion. | Revenue leakage. | MEDIUM / HIGH / MEDIUM | Promotions, Rider |
| PROMO-004 | Negative fare | Promo interaction | Possible bug: combination of promotion, pass, tip, incentive, or refund could produce zero/negative fare. Trigger: discounts applied after fare floor check. Plausible with many fare modifiers. | Financial loss, ledger anomalies. | HIGH / LOW / HARD | Billing, Promotions |
| PROMO-005 | Geo-promo spoofing | Location-based promo | Possible bug: location-based promotion could be triggered by spoofed pickup/delivery location. Trigger: fake GPS or stale geofence. Plausible in mobile location systems. | Marketing abuse, wrong zone pricing. | MEDIUM / MEDIUM / HARD | Promotions, Location |
| PROMO-006 | Pass expiry boundary | Scheduled rides | Possible bug: pass benefit could apply to scheduled ride performed after pass expiry if eligibility is checked at booking time only. Trigger: booking before expiry, ride after expiry. Plausible with scheduled services. | Unintended free/discounted rides. | MEDIUM / MEDIUM / HARD | Passes, Ride |
| PROMO-007 | Loyalty replay | Loyalty points | Possible bug: loyalty points could be double-counted due to event replay or duplicate completion event. Trigger: ride completion event reprocessed. Plausible in async reward systems. | Excess rewards, cost leakage. | MEDIUM / MEDIUM / MEDIUM | Loyalty, Wallet |
| PROMO-008 | Cancellation restore | Promo lifecycle | Possible bug: cancellation/refund could restore a used promotion repeatedly, creating a promo loop. Trigger: refund event and promo restore event both retry. Plausible without idempotency. | Discount abuse. | MEDIUM / LOW / HARD | Promotions, Refunds |

---

### E) Location, H3, Geofencing, ETA/Zone Effects

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| GEO-001 | GPS drift | Arrival/waiting | Possible bug: GPS drift could falsely mark driver arrived or departed, starting waiting/no-show charges. Trigger: urban canyon, tunnel, or low-accuracy location. Plausible in dense areas. | Wrong charges, disputes. | HIGH / HIGH / HARD | Ride, Billing, Location |
| GEO-002 | H3 mismatch | Matching/pricing | Possible bug: different H3 precision or zone mapping could cause matching, surge, fare, or eligibility mismatch. Trigger: pickup and dispatch use different geospatial resolution. Plausible with multiple geo services. | Wrong driver selection, wrong fare. | HIGH / MEDIUM / HARD | Dispatch, Billing |
| GEO-003 | Zone flip-flop | Surge/fare | Possible bug: rider/driver location could oscillate across zone boundary, changing surge/fare mid-request. Trigger: boundary precision and moving GPS. Plausible with geofence edge cases. | Fare instability, complaints. | HIGH / MEDIUM / HARD | Billing, Dispatch |
| GEO-004 | Stale location | Dispatch | Possible bug: last known location after reconnect could be used for dispatch even if outdated. Trigger: driver app backgrounded, then reconnects with old buffer. Plausible with mobile networks. | Wrong ETA, wrong driver chosen. | HIGH / HIGH / HARD | Dispatch, Location |
| GEO-005 | Spoofing | Fraud | Possible bug: spoofed location could enable fake trips, incentive farming, out-of-zone dispatch, or false arrival. Trigger: modified client or mock location. Plausible in mobile ecosystems. | Fraud, safety risk, financial loss. | HIGH / MEDIUM / HARD | Safety, Billing, Dispatch |
| GEO-006 | Route distance | Fare recalculation | Possible bug: route/distance recomputed at settlement could differ materially from estimate due to provider fallback or route choice. Trigger: map provider timeout or polyline mismatch. Plausible with external map services. | Fare disputes, quote mistrust. | MEDIUM / HIGH / HARD | Billing, Maps |

---

### F) Fleet, Vehicles, Subscriptions, Resource Assignment

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| FLEET-001 | Resource conflict | Vehicle assignment | Possible bug: same vehicle could be assigned to two drivers/services simultaneously. Trigger: concurrent assignment or stale assignment pointer. Plausible when vehicles are scarce resources. | Operational conflict, double dispatch. | CRITICAL / MEDIUM / HARD | Fleet, Dispatch |
| FLEET-002 | Cross-vertical conflict | Driver resource | Possible bug: same driver could be simultaneously eligible for ride-hailing, delivery, rental, emergency, or marketplace tasks. Trigger: vertical availability flags not mutually exclusive. Plausible in multi-service platforms. | Missed jobs, double assignment, SLA breaches. | HIGH / MEDIUM / HARD | Fleet, Dispatch, Marketplace |
| FLEET-003 | Subscription limit | Fleet billing | Possible bug: subscription seat/vehicle limit could be exceeded through concurrent add operations. Trigger: multiple admins add resources before counter updates. Plausible without atomic quota check. | Billing leakage, unfair charges later. | MEDIUM / LOW / MEDIUM | Fleet, Billing |
| FLEET-004 | Tenant isolation | Fleet visibility | Possible bug: fleet owner could see or act on another tenant’s drivers/vehicles if tenant scoping is missing in fleet queries. Trigger: role/tenant confusion. Plausible in multi-tenant fleet systems. | Privacy leak, unauthorized fleet control. | CRITICAL / LOW / HARD | Fleet, Admin |
| FLEET-005 | Stale vehicle status | Maintenance | Possible bug: vehicle under maintenance or inspection could remain dispatchable due to stale status cache. Trigger: status update delayed or not propagated to dispatch. Plausible with separate fleet and dispatch models. | Safety/compliance risk. | HIGH / MEDIUM / HARD | Fleet, Dispatch |
| FLEET-006 | Reassignment race | Active ride pointer | Possible bug: vehicle/driver reassignment during active ride could leave financial or operational pointer to old resource. Trigger: fleet admin changes assignment while ride is live. Plausible with mutable resources. | Wrong payout, audit confusion. | HIGH / LOW / HARD | Fleet, Billing |
| FLEET-007 | Billing count | Inactive resources | Possible bug: fleet subscription/invoice could count inactive, deleted, or unassigned resources. Trigger: soft-delete not reflected in billing snapshot. Plausible with lifecycle changes. | Wrong fleet billing. | MEDIUM / LOW / MEDIUM | Fleet, Billing |
| FLEET-008 | Fleet exit | Active obligations | Possible bug: driver leaving fleet during active ride/rental could create payout routing or responsibility ambiguity. Trigger: fleet membership ends before obligation closes. Plausible with long-lived rides/rentals. | Wrong earnings, disputes. | HIGH / LOW / HARD | Fleet, Payouts |

---

### G) Marketplace, Rental Bidding, Food Delivery Bridge, Courier

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| MKT-001 | Retry/idempotency | Order creation | Possible bug: marketplace order could duplicate after client retry. Trigger: payment/order request timeout while server succeeded. Plausible without idempotent order creation. | Duplicate orders, inventory/payment issues. | HIGH / HIGH / MEDIUM | Marketplace, Payments |
| MKT-002 | Inventory race | Oversell | Possible bug: concurrent purchases could oversell inventory. Trigger: two users buy last item simultaneously. Plausible if stock decrement is not atomic. | Failed fulfillment, refunds, reputation damage. | HIGH / HIGH / MEDIUM | Marketplace, Inventory |
| MKT-003 | Price staleness | Cart/checkout | Possible bug: price could change between cart and checkout, causing wrong charge. Trigger: shop price update or promotion expiry during checkout. Plausible with cached cart prices. | Over/undercharge, disputes. | HIGH / HIGH / MEDIUM | Marketplace, Billing |
| MKT-004 | Shop status cache | Disabled shop | Possible bug: disabled/unapproved shop could remain visible or orderable due to stale cache. Trigger: shop suspension not propagated to search/checkout. Plausible with cached storefronts. | Orders from invalid shops, fulfillment failure. | MEDIUM / MEDIUM / MEDIUM | Marketplace, Admin |
| MKT-005 | Deadline race | RFQ/bids | Possible bug: bid could be accepted after deadline due to clock skew or delayed event. Trigger: bid submitted near deadline and processed late. Plausible with distributed clocks. | Unfair award, vendor disputes. | HIGH / LOW / HARD | Rental, RFQ |
| MKT-006 | Bid confidentiality | Sealed-bid leak | Possible bug: sealed-bid data could become visible before deadline through query, cache, event payload, or permission mistake. Trigger: premature read access. Plausible if bid visibility rules are complex. | Bid manipulation, unfair competition. | HIGH / LOW / HARD | Rental, Trust |
| MKT-007 | Duplicate award | Rental award | Possible bug: rental/RFQ award could be duplicated by double-click, retry, or webhook replay. Trigger: award action not idempotent. Plausible in async workflows. | Multiple providers assigned, payment confusion. | CRITICAL / LOW / HARD | Rental, Marketplace |
| MKT-008 | Stale winner events | Award reversal | Possible bug: old winner could continue receiving events after decline, disqualification, or reassignment. Trigger: award state changes but event subscription remains. Plausible with event-driven notifications. | Wrong provider arrives, data leakage. | HIGH / LOW / HARD | Rental, Notifications |
| MKT-009 | SLA race | Demotion/confirmation | Possible bug: SLA expiry demotion could race with late confirmation/acceptance. Trigger: provider accepts just as scheduler demotes. Plausible with timer-based workflows. | Wrong winner, SLA dispute. | HIGH / LOW / HARD | Rental, Scheduler |
| MKT-010 | Post-award change | Driver/vehicle update | Possible bug: driver/vehicle changed after award but permissions, notifications, or geofences not updated. Trigger: fleet replacement after award. Plausible with mutable assignments. | Unauthorized provider, failed handoff. | HIGH / LOW / HARD | Rental, Fleet |
| MKT-011 | Exclusivity gap | Cross-vertical | Possible bug: same driver/resource could be active in rental, delivery, emergency, and ride-hailing simultaneously. Trigger: availability not globally exclusive. Plausible in multi-vertical platform. | SLA breach, double assignment. | HIGH / MEDIUM / HARD | Fleet, Dispatch |
| MKT-012 | Cancellation timing | Fulfillment | Possible bug: order cancellation after fulfillment started could leave inventory, payment, and courier state inconsistent. Trigger: customer cancels while shop already preparing/dispatching. Plausible with multiple lifecycle owners. | Wrong refunds, lost stock, courier waste. | HIGH / HIGH / HARD | Marketplace, Delivery |
| MKT-013 | Partial refund | Shop ledger | Possible bug: partial shop/order refund could create ledger mismatch if item-level amounts, taxes, delivery fees, or vendor splits are not updated consistently. Trigger: partial cancel/refund. Plausible with complex order amounts. | Vendor payout errors. | HIGH / MEDIUM / HARD | Marketplace, Ledger |
| MKT-014 | Bridge duplication | Food delivery | Possible bug: food order-to-delivery bridge could create duplicate delivery requests on retry or order update. Trigger: order event reprocessed. Plausible when two systems exchange lifecycle events. | Two drivers dispatched, cost leakage. | HIGH / MEDIUM / HARD | Food delivery, Dispatch |
| MKT-015 | Lifecycle divergence | Food order/delivery | Possible bug: food order status and delivery leg status could diverge, e.g. delivered while order still preparing. Trigger: independent state machines and delayed sync. Plausible with bridge pattern. | Customer confusion, wrong completion, refunds. | HIGH / HIGH / HARD | Food delivery, Marketplace |
| MKT-016 | Courier/truck state | Status duplication | Possible bug: courier or truck rental status could duplicate, reverse, or overlap due to out-of-order events or time-window conflicts. Trigger: provider app retries or scheduler overlap. Plausible with many status transitions. | Wrong SLA, billing, dispatch. | MEDIUM / MEDIUM / HARD | Courier, Rental |

---

### H) Emergency / Ambulance

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| EMS-001 | Certification expiry | Ambulance eligibility | Possible bug: expired or revoked certification could remain dispatchable due to stale eligibility cache. Trigger: certification expiry job delayed. Plausible with cached compliance flags. | Safety/regulatory risk. | CRITICAL / LOW / HARD | Emergency, Trust |
| EMS-002 | Revocation propagation | Scheduled emergency | Possible bug: certification revocation could fail to propagate to already scheduled or active emergency assignments. Trigger: provider credential revoked after assignment. Plausible with long-lived requests. | Unsafe dispatch, compliance breach. | CRITICAL / LOW / HARD | Emergency, Fleet |
| EMS-003 | First-accept race | Emergency dispatch | Possible bug: multiple emergency providers could accept simultaneously, causing duplicate assignment or conflicting ownership. Trigger: broadcast to many providers. Plausible without atomic claim. | Dangerous confusion during emergency. | CRITICAL / MEDIUM / HARD | Emergency, Dispatch |
| EMS-004 | Radius/stale pool | Emergency broadcast | Possible bug: emergency request could be broadcast to stale providers or wrong geographic radius. Trigger: stale provider location or unit mismatch. Plausible with geo-radius calculations. | Delayed emergency response. | CRITICAL / LOW / HARD | Emergency, Location |
| EMS-005 | Scheduled vs urgent | Resource conflict | Possible bug: same ambulance/provider could be double-booked between scheduled service and urgent dispatch. Trigger: urgent request preempts scheduled assignment. Plausible with shared resource pool. | Missed urgent response, scheduling chaos. | HIGH / MEDIUM / HARD | Emergency, Scheduler |
| EMS-006 | Cancellation propagation | Provider en route | Possible bug: emergency cancellation could fail to reach provider already en route, or fare/status could remain active. Trigger: event lost or delayed. Plausible with real-time dependencies. | Unnecessary dispatch, wrong charge. | HIGH / MEDIUM / HARD | Emergency, Billing |

---

### I) Scheduler, Jobs, Async Processing

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| JOB-001 | Duplicate execution | Scheduler | Possible bug: duplicate scheduler run could repeat cancellations, expiries, charges, refunds, or notifications. Trigger: overlapping instances or retry without idempotency. Plausible with many scheduled jobs. | Financial and state damage. | HIGH / MEDIUM / HARD | Scheduler, Billing, Ride |
| JOB-002 | Missed execution | Lock/timeout | Possible bug: missed or locked job could leave rides/orders/payments stuck in intermediate state. Trigger: scheduler lock fails or worker crashes. Plausible in distributed job systems. | Operational backlog, stuck records. | HIGH / MEDIUM / HARD | Scheduler, Ride, Marketplace |
| JOB-003 | Stale-state job | Delayed processing | Possible bug: delayed job could act on outdated state after manual admin/user resolution. Trigger: job backlog processes old expiry/cancellation after state changed. Plausible without state version check. | Wrong cancellation, refund, or notification. | HIGH / MEDIUM / HARD | Scheduler, Ride, Wallet |
| JOB-004 | Overlapping job | Partial updates | Possible bug: two overlapping executions of same job could partially update records, causing inconsistent counters/statuses. Trigger: long-running job exceeds schedule interval. Plausible without exclusive lock. | Data inconsistency. | MEDIUM / MEDIUM / HARD | Scheduler, Data |
| JOB-005 | Backlog cascade | Expiry/grace | Possible bug: backlog could cause expiry/no-show/cleanup jobs to run after grace period, creating unfair charges or lost refunds. Trigger: high load or dependency outage. Plausible with time-sensitive jobs. | Customer harm, financial disputes. | HIGH / MEDIUM / HARD | Scheduler, Billing |
| JOB-006 | Retry duplication | Async side effects | Possible bug: retries of failed jobs could duplicate side effects such as charges, payouts, notifications, or state transitions. Trigger: job retry after partial success. Plausible without idempotency. | Duplicate financial impact. | HIGH / HIGH / HARD | Scheduler, Payments |
| JOB-007 | Timezone job | Scheduled dispatch | Possible bug: scheduled dispatch job could use wrong timezone/date boundary, dispatching too early/late. Trigger: UTC vs Dhaka conversion error. Plausible for scheduled services. | Missed pickups, poor reliability. | HIGH / LOW / HARD | Scheduler, Ride |
| JOB-008 | Reporting cutoff | Month-end | Possible bug: month-end aggregation could include/exclude transactions incorrectly around cutoff. Trigger: timezone, settlement date vs event date mismatch. Plausible in financial reporting. | Wrong reports, tax/payout errors. | MEDIUM / LOW / HARD | Reports, Finance |

---

### J) Real-Time Events, Notifications, Config, Data, Mobile, Security, Admin, Safety

| BUG ID | CATEGORY | SERVICE / MODULE | POSSIBLE BUG / TRIGGER / WHY PLAUSIBLE | IMPACT | S / L / D | AFFECTED AREAS |
|---|---|---|---|---|---|---|
| EVENT-001 | Event ordering | WebSocket/events | Possible bug: duplicate, missing, delayed, or out-of-order events could cause client UI to show stale or reversed state. Trigger: reconnect, replay, or queue lag. Plausible in real-time systems. | User takes wrong action; state confusion. | HIGH / HIGH / HARD | Ride, Marketplace, Mobile |
| EVENT-002 | Subscription staleness | Event routing | Possible bug: stale subscription or cached session could route events to wrong recipient, tenant, driver, or device. Trigger: role/device change without resubscription. Plausible with persistent sockets. | Privacy leak, wrong dispatch action. | HIGH / LOW / HARD | Notifications, Dispatch |
| NOTIF-001 | Notification lifecycle | Push/SMS/deep links | Possible bug: notification could be sent after cancellation/completion, or deep link could open stale/expired object. Trigger: delayed notification queue. Plausible with async notification pipelines. | Confusion, wrong acceptance, safety risk. | MEDIUM / HIGH / MEDIUM | Rider, Driver, Marketplace |
| NOTIF-002 | Multi-device inconsistency | Push/actionability | Possible bug: multiple devices could show actionable notifications after one device has already acted. Trigger: push fan-out without action-state invalidation. Plausible with multi-device login. | Duplicate accept/cancel attempts. | MEDIUM / HIGH / HARD | Driver, Rider |
| CFG-001 | Feature-flag mismatch | API/mobile/job | Possible bug: feature could be enabled in one layer but not another, creating unsupported flows. Trigger: flag config not synchronized across API, mobile, scheduler, or admin. Plausible with many flags. | Broken flows, partial features. | HIGH / MEDIUM / HARD | Platform-wide |
| CFG-002 | Unit mismatch | Config values | Possible bug: config unit mismatch could corrupt timeouts, distances, discounts, or amounts: seconds vs ms, metres vs km, percent vs decimal, BDT vs paisa. Trigger: admin/config entry or migration. Plausible in large config surface. | Severe fare, dispatch, or safety errors. | CRITICAL / LOW / HARD | Platform-wide |
| CFG-003 | Time boundary | UTC/Dhaka | Possible bug: expiry, scheduling, reports, or promotions could mishandle UTC/Dhaka conversion, midnight, or month-end boundaries. Trigger: time-sensitive action near boundary. Plausible in multi-timezone systems. | Wrong expiry, missed dispatch, report errors. | HIGH / MEDIUM / HARD | Scheduler, Billing, Reports |
| DATA-001 | Cross-service consistency | Ride/payment/wallet/ledger | Possible bug: one service succeeds while another fails, e.g. ride completed but payment failed, wallet credited but ledger not posted, refund recorded but gateway failed. Trigger: partial distributed transaction. Plausible without robust compensation. | Financial inconsistency, entitlement without payment. | CRITICAL / HIGH / HARD | Payments, Wallet, Ledger |
| DATA-002 | Cache/soft-delete | Stale/orphan data | Possible bug: cache staleness, soft-delete leakage, orphaned child records, or mismatched counters could produce wrong visible state. Trigger: update/delete partial failure or delayed invalidation. Plausible with many related entities. | Wrong actions, reports, or object visibility. | MEDIUM / HIGH / HARD | Data, Ride, Marketplace |
| MOB-001 | Client retry | Mobile/network | Possible bug: client timeout/retry/offline queue could replay stale actions after server state changed. Trigger: poor network, app backgrounding, or local queue flush. Plausible in mobile apps. | Duplicate requests, invalid state transitions. | HIGH / HIGH / HARD | Rider, Driver, Marketplace |
| MOB-002 | Client/server divergence | State perception | Possible bug: server may have completed action while phone thinks it failed, or vice versa. Trigger: response lost after server commit. Plausible with unreliable mobile networks. | User retries, cancels, or pays twice. | HIGH / HIGH / HARD | Payments, Ride, Orders |
| SEC-001 | Replay/spoofing | Payments/location | Possible bug: replayed requests, spoofed callbacks, or spoofed location could cause fraud or false state. Trigger: weak nonce/signature/location validation. Plausible in external-facing mobile platforms. | Fraud, unsafe dispatch, financial loss. | CRITICAL / LOW / HARD | Security, Payments, Location |
| ADMIN-001 | Admin concurrency | Admin actions | Possible bug: admin action could race with user action, scheduler, or payment callback; bulk updates could bypass validations applied to single updates; reports could use inconsistent timezone/cutoff. Trigger: support intervention during active lifecycle. Plausible with large admin surface. | State corruption, wrong refunds/reports. | HIGH / MEDIUM / HARD | Admin, Finance, Ride |
| SAFETY-001 | SOS lifecycle | Safety alerts | Possible bug: SOS could be duplicated, sent to stale emergency contacts, or cancellation could not propagate to safety responders. Trigger: alert retry, contact update, or network loss. Plausible in safety-critical flows. | Delayed or confused emergency response. | CRITICAL / LOW / HARD | Safety, Ride |
| SAFETY-002 | Location sharing | Ride share link | Possible bug: live location sharing could remain accessible after ride end or be exposed too broadly. Trigger: link expiry/authorization not enforced. Plausible with shareable URLs. | Privacy/safety exposure. | HIGH / LOW / HARD | Safety, Rider |

---

## 2. Top 100 Bugs to Investigate First

**Prioritization basis:** possible financial damage, safety/security impact, likelihood in production, detection difficulty, recovery difficulty, and cross-service blast radius. Ranking is hypothetical and should be re-scored after codebase review.

### Ranks 1–10
1. **AUTH-003** — Cross-tenant access risk is a severe isolation failure.  
2. **FIN-010** — Concurrent refunds could over-refund.  
3. **FIN-008** — Duplicate wallet top-up webhook could create free balance.  
4. **FIN-009** — Payment callback after method switch could double-charge.  
5. **DISP-002** — Driver double acceptance could double-assign rides.  
6. **FLEET-001** — Vehicle double assignment is a scarce-resource conflict.  
7. **MKT-002** — Inventory oversell directly harms fulfillment.  
8. **EMS-003** — Emergency first-accept race has safety impact.  
9. **SEC-001** — Replay/spoofing could enable payment or location fraud.  
10. **DATA-001** — Cross-service partial success can create money/entitlement mismatches.

### Ranks 11–20
11. **FIN-017** — Wallet negative balance from hold/debit race.  
12. **FIN-018** — Double-entry imbalance from failed compensation.  
13. **FIN-019** — Duplicate manual admin credit adjustment.  
14. **FIN-020** — Payment intent reuse across rides/orders.  
15. **FIN-021** — Payment webhook replay/signature weakness.  
16. **FIN-025** — Stuck or double-released payment holds.  
17. **FIN-013** — Payout including reversed/chargeback rides.  
18. **FIN-014** — Coupon/pass stacking causing excessive discount.  
19. **FIN-015** — Duplicate pass/package activation.  
20. **FIN-011** — Refund to closed/missing wallet creating dangling credit.

### Ranks 21–30
21. **DISP-004** — Rider cancellation vs driver acceptance race.  
22. **DISP-005** — Simultaneous rider/driver cancellation ambiguity.  
23. **DISP-016** — Stale event reversing newer ride state.  
24. **DISP-017** — Impossible ride state combinations.  
25. **DISP-010** — Ride PIN bypass/reuse risk.  
26. **DISP-011** — Ride start without reliable proximity validation.  
27. **DISP-012** — Premature ride completion risk.  
28. **DISP-009** — No-show fee from stale arrival detection.  
29. **DISP-001** — Duplicate ride creation from client retry.  
30. **AUTH-008** — Object-level IDOR risk across rides/orders/wallets.

### Ranks 31–40
31. **AUTH-004** — OTP reuse/brute-force race risk.  
32. **AUTH-006** — Stale driver availability after device switch.  
33. **AUTH-007** — Excessive support impersonation scope.  
34. **FLEET-002** — Same driver active across multiple verticals.  
35. **FLEET-004** — Cross-tenant fleet visibility risk.  
36. **FLEET-005** — Stale maintenance status enabling dispatch.  
37. **FLEET-006** — Reassignment leaving stale financial pointer.  
38. **FLEET-008** — Driver leaving fleet during active obligation.  
39. **DISP-014** — Dispatch to stale/offline driver presence.  
40. **DISP-015** — Multi-device/dual fleet assignment conflict.

### Ranks 41–50
41. **MKT-001** — Duplicate marketplace order from retry.  
42. **MKT-003** — Price change between cart and checkout.  
43. **MKT-005** — Late bid accepted due to clock skew.  
44. **MKT-006** — Sealed-bid visibility leak.  
45. **MKT-007** — Duplicate rental/RFQ award.  
46. **MKT-008** — Old award events after decline/reaward.  
47. **MKT-009** — SLA expiry vs confirmation race.  
48. **MKT-010** — Post-award driver/vehicle change with stale permissions.  
49. **MKT-011** — Cross-vertical exclusivity gap.  
50. **MKT-012** — Cancellation after fulfillment inconsistency.

### Ranks 51–60
51. **MKT-013** — Partial shop refund ledger mismatch.  
52. **MKT-014** — Duplicate food-delivery bridge request.  
53. **MKT-015** — Food order and delivery leg divergence.  
54. **FIN-001** — Quote-vs-settlement fare mismatch.  
55. **FIN-002** — Waiting charge double-count risk.  
56. **FIN-003** — Pickup fee after driver cancellation.  
57. **FIN-004** — Tip routed to wrong driver/ride.  
58. **FIN-005** — Duplicate tip from retry.  
59. **FIN-007** — Tax base inconsistency.  
60. **FIN-022** — Earnings split after mid-ride resource change.

### Ranks 61–70
61. **FIN-016** — Pass benefit after expiry from cached eligibility.  
62. **FIN-024** — Tax rate/date boundary risk.  
63. **PROMO-001** — Premature/duplicate referral reward.  
64. **PROMO-002** — Coupon reuse across accounts.  
65. **PROMO-003** — Stale first-ride eligibility.  
66. **PROMO-004** — Negative fare from promo/incentive interaction.  
67. **PROMO-005** — Geo promotion spoofing.  
68. **GEO-001** — GPS drift causing false arrival/waiting charges.  
69. **GEO-002** — H3 precision mismatch affecting matching/fare.  
70. **GEO-003** — Zone boundary flip-flop affecting surge/fare.

### Ranks 71–80
71. **GEO-004** — Stale location after reconnect used for dispatch.  
72. **GEO-005** — Location spoofing enabling fake trips/incentives.  
73. **EMS-001** — Expired certification still dispatchable.  
74. **EMS-002** — Revocation not propagated to scheduled emergency.  
75. **EMS-004** — Stale provider broadcast/wrong radius.  
76. **EMS-005** — Scheduled vs urgent emergency resource conflict.  
77. **EMS-006** — Emergency cancellation not propagated to en-route provider.  
78. **JOB-001** — Duplicate scheduler execution with financial side effects.  
79. **JOB-002** — Missed/locked job leaving objects stuck.  
80. **JOB-003** — Delayed job acting on stale state.

### Ranks 81–90
81. **JOB-005** — Backlog causing expiries after grace period.  
82. **JOB-006** — Non-idempotent retries duplicating charges/notifications.  
83. **JOB-007** — Scheduled dispatch timezone mismatch.  
84. **EVENT-001** — Out-of-order/duplicate/missing real-time events.  
85. **EVENT-002** — Stale subscription/wrong recipient event leakage.  
86. **CFG-001** — Feature flag mismatch across layers.  
87. **CFG-002** — Unit mismatch in config values.  
88. **CFG-003** — UTC/Dhaka/date-boundary mismatch.  
89. **DATA-002** — Cache staleness/soft-delete/orphan inconsistency.  
90. **MOB-001** — Client timeout/retry duplicating actions.

### Ranks 91–100
91. **MOB-002** — Server succeeded but client thinks failed.  
92. **ADMIN-001** — Admin concurrent override/bulk/report inconsistency.  
93. **SAFETY-001** — SOS stale/duplicate/cancellation propagation risk.  
94. **AUTH-001** — Stale permission cache after demotion.  
95. **AUTH-002** — Session revocation race after credential change.  
96. **DISP-003** — Auto-accept plus manual accept conflict.  
97. **DISP-006** — Expired offer accepted due stale client/state.  
98. **DISP-008** — Multi-stop skip/fare recalculation risk.  
99. **NOTIF-001** — Post-cancellation or stale deep-link notification risk.  
100. **DISP-019** — Stale driver eligibility documents/vehicle at dispatch.

---

## 3. Top 30 Rare but Severe Bugs

These are the types of incidents most likely to escape ordinary testing because they require unusual timing, multiple actors, retries, provider failures, stale state, scheduler interaction, or rare data combinations.

| Rank | BUG ID | RARE TRIGGER / PERFECT STORM | WHY SEVERE | DETECTION |
|---:|---|---|---|---|
| 1 | FIN-010 | Support refund and automated refund run simultaneously for same order/ride. | Could over-refund money directly. | HARD |
| 2 | FIN-009 | Rider changes payment method while first provider sends delayed success callback. | Could double-charge or grant unpaid entitlement. | HARD |
| 3 | FIN-017 | Wallet hold, debit, refund, and top-up happen in same second. | Could produce negative balance or stuck funds. | VERY HARD |
| 4 | FIN-018 | First ledger leg succeeds, second leg times out, retry replays only one side. | Could break double-entry accounting. | VERY HARD |
| 5 | FIN-021 | Payment provider retries callback; replay protection or state check is weak. | Could credit wallet or complete order fraudulently. | HARD |
| 6 | FIN-025 | Payment timeout followed by late success and release retry. | Could release hold twice or strand customer funds. | HARD |
| 7 | DISP-002 | Driver receives two offers and both acceptance paths overlap. | Could assign same driver to two riders. | HARD |
| 8 | DISP-003 | Auto-accept timer fires exactly as driver manually accepts. | Could create duplicate assignment or inconsistent ride ownership. | HARD |
| 9 | DISP-004 | Rider cancels while driver accept is being processed. | Could cause wrongful fee or ghost active ride. | HARD |
| 10 | DISP-005 | Rider and driver cancel within same narrow window. | Could misattribute fault, fee, or no-show. | HARD |
| 11 | DISP-016 | Delayed event arrives after ride reached later state. | Could revert state and trigger wrong billing/notification. | VERY HARD |
| 12 | DISP-017 | Two transitions complete partially due to async failure. | Could leave impossible state requiring manual cleanup. | HARD |
| 13 | DISP-006 | Offer expires but accept packet arrives late. | Could assign unavailable resource. | HARD |
| 14 | DISP-009 | Driver arrival geofence flaps due to GPS drift. | Could start no-show/waiting fee unfairly. | HARD |
| 15 | FLEET-001 | Two assignment workflows select same vehicle concurrently. | Could create operational double dispatch. | HARD |
| 16 | FLEET-006 | Fleet admin reassigns vehicle/driver during active ride. | Could route earnings to wrong resource. | HARD |
| 17 | MKT-002 | Two buyers purchase last inventory item simultaneously. | Could oversell and force refunds/cancellations. | MEDIUM |
| 18 | MKT-007 | Rental award action retried after apparent timeout. | Could award same rental twice. | HARD |
| 19 | MKT-008 | Winner declines but old subscription/events continue. | Could send wrong provider or leak bid data. | HARD |
| 20 | MKT-009 | SLA expiry job demotes bidder while late acceptance arrives. | Could create contested award. | HARD |
| 21 | MKT-014 | Food order update retries bridge creation. | Could dispatch two delivery riders. | HARD |
| 22 | MKT-015 | Order status and delivery leg progress independently under network lag. | Could mark delivered while order unresolved. | HARD |
| 23 | EMS-003 | Multiple ambulance providers accept urgent broadcast simultaneously. | Could cause emergency-response confusion. | HARD |
| 24 | EMS-004 | Emergency radius calculated with stale provider locations or wrong unit. | Could delay critical response. | HARD |
| 25 | JOB-001 | Scheduler duplicate run processes cancellation/expiry twice. | Could double-charge or cancel incorrectly. | HARD |
| 26 | JOB-003 | Delayed job executes after admin/user already fixed object. | Could undo correct state or create wrong fee. | HARD |
| 27 | EVENT-001 | Reconnect replays old events out of order. | Could make client act on stale/reversed state. | VERY HARD |
| 28 | EVENT-002 | Socket subscription not refreshed after role/tenant/device change. | Could send events to wrong recipient. | HARD |
| 29 | CFG-002 | Admin/config value uses wrong unit, e.g. seconds vs ms or percent vs decimal. | Could cause massive fare/dispatch/timer errors. | HARD |
| 30 | DATA-001 | Ride succeeds, payment fails, wallet credits, ledger post missing, or any mixed partial success. | Could create entitlement without payment or money without service. | VERY HARD |

---

## 4. Self-Critique

### 4.1 What this catalogue may still miss

Even though the catalogue covers many domains, the following areas could contain additional failure modes and should be explicitly investigated:

#### A. Missing or underrepresented subsystems
- **KYC/document verification:** document upload failures, expired documents, forged documents, verification provider callback races, re-verification after rejection.
- **Driver onboarding and device binding:** phone number recycling, SIM swap, device change, OTP interception, multiple driver profiles per person.
- **Payout rails:** bank/wallet payout failure, payout retry, partial payout, reversed payout, payout to closed account, payout cutoff races.
- **Chargebacks and disputes:** payment dispute after payout, evidence submission deadline, reverse refund, provisional credit.
- **Insurance, tolls, fuel, fines:** allocation of tolls, ferry fees, fuel advances, traffic fines, insurance claims, and responsibility splits.
- **Marketplace returns/warranties:** return window races, return refund after replacement, warranty claim after order completion, partial return inventory mismatch.
- **Rental inspection/handover:** inspection status vs rental start, damage claims after return, deposit hold/release races, late return billing.
- **Search/ranking:** stale search index showing disabled shops/drivers, ranking bias from cached score, search result authorization leakage.
- **Ratings/reviews:** rating after cancellation, rating for wrong ride/order, review extortion, driver/rating count mismatch after state reversal.
- **Notification providers:** SMS/push provider outage, delayed SMS fallback, provider callback spoofing, template mismatch, sender ID filtering.
- **Map/payment provider degradation:** timeout fallback, degraded geocoding, wrong route polyline, payment provider partial outage, callback delay spikes.
- **Data migration/backfill:** historical backfill accidentally re-triggering side effects, wrong idempotency keys during migration, timezone conversion errors.
- **Backup/restore/archive:** archived records still referenced, restore creates duplicate IDs, soft-deleted records resurrected.
- **Analytics/reporting:** operational dashboard stale data, finance report double-count due to event replay, tax report based on wrong timestamp.

#### B. Additional race combinations that should be tested
- **Admin + scheduler + payment webhook** acting on the same ride/order simultaneously.
- **WebSocket reconnect burst + payment callback + rider retry** causing duplicate actions.
- **Driver reassignment + refund + notification** occurring in the same incident.
- **Rental award + payment capture + vehicle assignment + certification revocation** in close sequence.
- **SOS + ride cancellation + refund + emergency contact notification** happening concurrently.
- **Pass activation + fare quote + payment authorization + pass expiry** in a narrow window.
- **Wallet top-up + withdrawal request + hold + refund** for the same wallet.
- **Scheduled ride modification + dispatch job + rider cancellation** near dispatch time.
- **Food order item change + delivery assignment + restaurant cancellation** during preparation.
- **Courier address correction + driver departure + zone re-pricing** during delivery.

#### C. Financial paths that need deeper review
- Driver wallet withdrawal, not just earnings credit.
- Fleet owner settlement vs driver payout split.
- Pass refund and pass benefit clawback.
- Subscription proration when fleet size changes mid-cycle.
- Tax credit notes and corrected invoices.
- Refund of tips, tolls, waiting charges, and delivery fees.
- Partial wallet-funded, partially gateway-funded payments.
- Cash collection reconciliation with digital adjustments.
- Incentive/bonus reversal after fraud detection.
- Promotion cost allocation between platform, fleet, shop, or payment partner.

#### D. Security/fraud cases needing separate investigation
- Session fixation or token leakage in deep links.
- Sensitive data in push notification payloads.
- PII exposure in logs, events, exports, or support tools.
- SSRF or malicious URL handling if maps/address/webhook URLs are processed.
- File upload abuse for shop images, documents, or proofs.
- Rate-limit bypass through distributed devices.
- Enumeration of phone numbers, order IDs, driver IDs, or wallet IDs.
- Fraud rings using multiple rider/driver/shop accounts.
- Collusion between driver and rider for incentives.
- Fake emergency requests to obtain location or dispatch resources.

#### E. Scheduler/mobile failure modes to expand
- Android/iOS doze mode and background location restrictions.
- Permission revocation mid-ride.
- Network handoff between mobile data and Wi-Fi.
- Local notification queue replay after app update.
- Deep link opened in wrong environment, e.g. staging vs production.
- Client clock skew affecting countdowns and no-show timers.
- App crash during payment or SOS submission.
- Duplicate device registration causing push fan-out issues.
- Offline draft submission after business rules changed.

### 4.2 Duplicate / merged failure modes

Several possible bugs overlap and were intentionally merged into broader categories:

- **Cancellation races** appear across ride, marketplace, emergency, and scheduler; they should be treated as a cross-cutting cancellation-state problem.
- **Duplicate webhooks/callbacks** appear in payments, wallet top-ups, refunds, delivery bridge, and notification providers; a common idempotency/replay review is needed.
- **Stale state/cache** appears in auth, driver eligibility, vehicle status, pass expiry, shop visibility, location, and config; a general cache invalidation review is needed.
- **Event ordering/replay** appears in ride state, marketplace status, notifications, and WebSocket updates; it should be reviewed as an event-consistency problem.
- **Unit/timezone mismatches** appear in scheduling, fares, geofences, tax, reports, and config; they should be reviewed as a time/unit governance problem.
- **Resource double assignment** appears in vehicles, drivers, rentals, emergency providers, and marketplace delivery; it should be reviewed as a global scarce-resource locking problem.

### 4.3 Overall limitation

This survey is necessarily hypothetical. Without code, configuration, schema, job definitions, event contracts, provider integration details, and production incident history, the severity and likelihood scores are provisional. The next verification pass should focus on the Top 100 first, then expand to rare multi-actor incidents, financial reconciliation paths, and safety-critical emergency flows.