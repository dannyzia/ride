# **RIDE PLATFORM — THEORETICAL BUG/FAILURE-MODE CATALOGUE**

*No codebase access. All findings are hypothetical and framed with hedging language (e.g., "could happen if," "possible failure," "risk").*

---

---

## **1. FULL BUG CATALOGUE**

### **1.1 Core Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-CORE-001** | State Machine | Auth / Session Management | User session remains active after logout due to stale token cache. | User logs out; server-side token cache not invalidated; new requests use old token. | Token cache TTL longer than session lifetime. | Unauthorized access to user data. | CRITICAL | MEDIUM | HARD | Auth, Sessions, RBAC |
| **BUG-CORE-002** | Concurrency | Ride-hailing / Dispatch | Two riders matched to the same driver due to race condition in H3 matching. | Rider A and Rider B request rides simultaneously; driver accepts both before system updates state. | H3 indexing + async dispatch could allow overlapping assignments if locks are missing. | Driver double-booked; one rider left stranded. | CRITICAL | HIGH | HARD | Dispatch, Matching, Rider/Driver Flows |
| **BUG-CORE-003** | State Machine | Ride-hailing / Ride Lifecycle | Ride stuck in "dispatched" state indefinitely due to missing driver acknowledgment. | Driver never receives dispatch request; system waits indefinitely for acknowledgment. | No timeout or fallback mechanism for unacknowledged dispatches. | Rider stranded; driver unavailable for new rides. | HIGH | MEDIUM | MEDIUM | Dispatch, Ride State |
| **BUG-CORE-004** | Concurrency | Ride-hailing / Ride Lifecycle | Rider cancels ride after driver accepts, but cancellation fails due to race with ride start. | Rider cancels at T=0; driver starts ride at T=0.001; system processes both events. | No atomic check for ride state before cancellation. | Driver paid for cancelled ride; rider charged. | CRITICAL | MEDIUM | HARD | Ride State, Payments |
| **BUG-CORE-005** | State Machine | Ride-hailing / Ride Lifecycle | Ride marked as "completed" but payment remains "pending" indefinitely. | Ride finishes, but payment webhook fails silently; no retry logic. | Async payment callback failure + no state reconciliation. | Rider charged but ride not settled; driver unpaid. | CRITICAL | MEDIUM | MEDIUM | Ride State, Payments, Wallet |
| **BUG-CORE-006** | Functional | Ride-hailing / PIN Verification | Driver enters incorrect PIN, but ride starts due to missing PIN validation. | Driver inputs wrong PIN; system skips validation and starts ride. | PIN verification bypassed in edge cases (e.g., offline mode). | Unauthorized ride start; security risk. | HIGH | LOW | MEDIUM | Ride State, Security |
| **BUG-CORE-007** | Concurrency | Ride-hailing / Multi-Stop | Multi-stop ride skips a stop due to driver manually marking it complete before arrival. | Driver marks stop as "completed" in app before reaching; system doesn’t validate GPS. | No GPS validation for manual stop completion. | Rider stranded; complaints; refunds. | MEDIUM | HIGH | MEDIUM | Multi-Stop, GPS, Ride Lifecycle |
| **BUG-CORE-008** | State Machine | Ride-hailing / Scheduled Rides | Scheduled ride dispatched early due to timezone mismatch (UTC vs. Dhaka). | Ride scheduled for 2:00 AM Dhaka time; server uses UTC and dispatches at 8:00 AM. | Timezone not normalized in scheduler logic. | Rider wakes up to unexpected ride; driver confused. | MEDIUM | MEDIUM | MEDIUM | Scheduled Rides, Scheduler |
| **BUG-CORE-009** | Concurrency | Ride-hailing / No-Show | Driver marked as no-show, but ride was accepted by another driver in parallel. | Rider requests ride; Driver A accepts but doesn’t show; Driver B accepts same ride. | No atomic check for ride assignment during no-show processing. | Double assignment; rider confusion. | HIGH | MEDIUM | HARD | Dispatch, Ride State |
| **BUG-CORE-010** | State Machine | Ride-hailing / SOS | SOS alert triggered twice for the same ride due to WebSocket retry. | Rider presses SOS; network drops; client retries; server processes both alerts. | Missing idempotency in SOS endpoint. | Emergency services overwhelmed; false alarms. | HIGH | MEDIUM | MEDIUM | SOS, Notifications, Emergency |

---

### **1.2 Financial Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-FIN-001** | Retry/Idempotency | Payments / Wallet | Duplicate wallet debit due to client retry after timeout. | User tops up wallet; network times out; user retries; server processes both requests. | Missing idempotency keys in wallet top-up API. | User loses money; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Wallet, Ledger, Payments |
| **BUG-FIN-002** | Financial | Ride-hailing / Fare Calc | Fare calculated using stale GPS data (e.g., rider picked up but driver GPS lags). | Rider starts trip, but driver’s GPS hasn’t updated; fare uses old location. | GPS drift/stale data + fare tied to real-time location. | Rider overcharged or undercharged; driver earnings incorrect. | CRITICAL | HIGH | MEDIUM | Fare Calc, Location, Payments |
| **BUG-FIN-003** | Financial | Ride-hailing / Fare Calc | Fare miscalculated due to incorrect H3 cell boundary for pickup/drop-off. | Ride starts/ends near H3 cell edge; fare logic assigns wrong cell. | H3 boundary misalignment + fare tied to cell. | Rider/driver charged incorrectly. | HIGH | MEDIUM | HARD | Fare Calc, H3, Location |
| **BUG-FIN-004** | Financial | Promotions / Coupons | Coupon applied twice to the same ride due to retry after timeout. | Rider applies coupon; network times out; rider retries; server processes both. | Missing idempotency in coupon redemption. | Platform loses revenue; rider gets unfair discount. | HIGH | MEDIUM | HARD | Promotions, Payments, Ride-hailing |
| **BUG-FIN-005** | Financial | Ride-hailing / Tipping | Tip added to fare before tax calculation, leading to incorrect tax amount. | Rider tips driver; system adds tip to fare before tax logic runs. | Tax calculation order not enforced. | Platform overpays/underpays tax. | HIGH | MEDIUM | HARD | Tipping, Tax, Payments |
| **BUG-FIN-006** | Financial | Wallet / Ledger | Wallet balance and ledger out of sync after failed refund reversal. | Refund processed; ledger updated; wallet update fails; manual reversal only updates ledger. | Non-atomic wallet/ledger transactions. | User sees incorrect balance; accounting discrepancies. | HIGH | MEDIUM | HARD | Wallet, Ledger, Accounting |
| **BUG-FIN-007** | Financial | Payments / Refunds | Refund amount exceeds original payment due to currency conversion error. | Payment in BDT; refund calculated in paisa; conversion logic misapplies decimal places. | Unit mismatch (BDT vs. paisa) in refund logic. | User receives excess refund; financial loss to platform. | CRITICAL | LOW | HARD | Refunds, Payments, Currency Handling |
| **BUG-FIN-008** | Financial | Tax / Accounting | Tax calculated on pre-discount fare instead of post-discount fare. | Promotion applied; tax logic uses original fare amount. | Tax calculation decoupled from discount application. | Platform overpays tax; financial reporting incorrect. | HIGH | MEDIUM | HARD | Tax, Promotions, Financial Reports |
| **BUG-FIN-009** | Retry/Idempotency | Payments / Callbacks | Payment callback processed twice due to retry after timeout. | Payment succeeds; callback fails; payment provider retries; server processes both. | Missing idempotency in callback handler. | User charged twice; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Payments, Wallet, Ledger |
| **BUG-FIN-010** | Financial | Driver Earnings / Payouts | Driver earnings miscalculated due to overlapping ride intervals. | Driver completes Ride A (10:00-10:30) and Ride B (10:25-10:45); earnings logic double-counts 10:25-10:30. | No check for overlapping intervals in earnings calculation. | Driver overpaid/underpaid; accounting errors. | HIGH | MEDIUM | HARD | Driver Earnings, Payments |
| **BUG-FIN-011** | Financial | Subscriptions / Billing | Fleet subscription charged twice in the same billing cycle due to scheduler duplicate. | Scheduler job for subscription renewal runs twice; no deduplication. | Non-idempotent scheduler job. | Fleet owner overcharged; accounting discrepancies. | HIGH | LOW | HARD | Fleet, Subscriptions, Billing |
| **BUG-FIN-012** | Financial | Double-Entry Accounting | Debit/credit entries mismatched in ledger due to race condition. | Two transactions update ledger simultaneously; one fails mid-write. | Non-atomic ledger updates. | Accounting inconsistencies; audit failures. | CRITICAL | LOW | VERY HARD | Ledger, Accounting |
| **BUG-FIN-013** | Financial | Ride-hailing / Waiting Charges | Waiting charges applied incorrectly due to GPS drift. | Driver waits at pickup; GPS drifts; system calculates waiting time based on incorrect location. | GPS inaccuracies + waiting charge logic tied to location. | Rider overcharged; driver underpaid. | MEDIUM | HIGH | MEDIUM | Waiting Charges, GPS, Fare Calc |
| **BUG-FIN-014** | Financial | Promotions / Passes | Monthly ride pass activated twice due to retry after timeout. | User activates pass; network times out; user retries; server processes both. | Missing idempotency in pass activation. | User gets unlimited rides; platform loses revenue. | HIGH | MEDIUM | HARD | Promotions, Payments |
| **BUG-FIN-015** | Financial | Ride-hailing / Dynamic Pricing | Surge pricing applied inconsistently between rider and driver apps. | Rider sees surge pricing; driver app shows normal fare due to stale config. | Feature flag inconsistency between rider/driver apps. | Driver rejects rides; rider sees incorrect fares. | HIGH | LOW | MEDIUM | Dynamic Pricing, Feature Flags |

---

### **1.3 Location & Demand Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-LOC-001** | Location & Demand | Ride-hailing / Matching | Driver matched to rider outside their H3 cell due to boundary miscalculation. | Rider at H3 cell edge; driver in adjacent cell; matching logic includes both cells. | H3 cell boundary errors + fuzzy matching. | Driver/rider mismatched; long wait times. | MEDIUM | HIGH | MEDIUM | Matching, Location, Dispatch |
| **BUG-LOC-002** | Location & Demand | Ride-hailing / GPS | Ride fare calculated using spoofed GPS location. | Driver uses GPS spoofing app to fake location; fare uses spoofed data. | No GPS spoofing detection. | Rider overcharged; driver fraudulently increases earnings. | HIGH | MEDIUM | HARD | GPS, Fare Calc, Fraud Detection |
| **BUG-LOC-003** | Location & Demand | Ride-hailing / ETA | ETA for ride is inaccurate due to stale traffic data. | Traffic data provider lags; ETA calculated using outdated traffic conditions. | Dependency on external traffic data + no fallback. | Rider/driver frustrated; missed rides. | MEDIUM | HIGH | MEDIUM | ETA, Traffic Data, Dispatch |
| **BUG-LOC-004** | Location & Demand | Ride-hailing / Zone Boundaries | Ride fare miscalculated due to incorrect zone assignment. | Rider picked up near zone boundary; system assigns wrong zone. | Zone boundary logic not precise. | Rider/driver charged incorrectly. | MEDIUM | MEDIUM | HARD | Zone Boundaries, Fare Calc |
| **BUG-LOC-005** | Location & Demand | Ride-hailing / H3 Indexing | H3 cell index corrupted due to concurrent updates. | Multiple rides update H3 index simultaneously; corruption occurs. | Non-thread-safe H3 index updates. | Matching fails; rides not dispatched. | HIGH | LOW | VERY HARD | H3 Indexing, Matching |
| **BUG-LOC-006** | Location & Demand | Ride-hailing / Live Tracking | Live tracking shows incorrect driver location due to GPS drift. | Driver’s GPS drifts; live tracking uses drifted coordinates. | No GPS drift correction. | Rider/driver confusion; safety risk. | MEDIUM | HIGH | MEDIUM | Live Tracking, GPS |
| **BUG-LOC-007** | Location & Demand | Ride-hailing / Geofencing | Driver incorrectly marked as "outside service area" due to geofence misconfiguration. | Driver near geofence boundary; geofence logic misclassifies location. | Geofence boundaries not aligned with actual service area. | Driver loses rides; rider wait times increase. | MEDIUM | MEDIUM | MEDIUM | Geofencing, Dispatch |

---

### **1.4 Fleet & Resources Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-FLEET-001** | Concurrency | Fleet / Vehicle Assignment | Driver assigned to two simultaneous rentals (e.g., truck rental + delivery). | Driver accepts rental bid; system assigns them to delivery before rental confirmation completes. | Cross-vertical exclusivity not enforced; race between rental/delivery assignment. | Driver overcommitted; one service fails. | HIGH | MEDIUM | HARD | Fleet, Rentals, Delivery |
| **BUG-FLEET-002** | State Machine | Fleet / Vehicle Assignment | Vehicle assigned to driver after driver’s subscription expires. | Driver’s subscription expires; system doesn’t revoke assignment; driver continues using vehicle. | No real-time subscription validation. | Fleet owner loses revenue; unauthorized vehicle use. | HIGH | MEDIUM | HARD | Fleet, Subscriptions, Vehicle Assignment |
| **BUG-FLEET-003** | Concurrency | Fleet / Vehicle Assignment | Vehicle double-assigned to two drivers due to race condition. | Driver A and Driver B request same vehicle; system assigns to both before updating state. | Missing locks in vehicle assignment. | Vehicle overcommitted; driver conflict. | HIGH | MEDIUM | HARD | Fleet, Vehicle Assignment |
| **BUG-FLEET-004** | Functional | Fleet / Roles | Fleet admin retains access to tenant after role revocation due to cached permissions. | Admin role revoked; cache not invalidated; admin still accesses tenant data. | Permission cache TTL too long + no real-time revocation checks. | Data breach; unauthorized actions. | CRITICAL | MEDIUM | HARD | Auth, Fleet, RBAC |
| **BUG-FLEET-005** | Concurrency | Fleet / Subscriptions | Fleet subscription limits bypassed due to race condition. | Two vehicles added to fleet simultaneously; both bypass subscription limit. | Non-atomic subscription limit check. | Fleet owner exceeds subscription; billing errors. | MEDIUM | LOW | HARD | Fleet, Subscriptions, Billing |
| **BUG-FLEET-006** | State Machine | Fleet / Vehicle Assignment | Vehicle marked as "available" but already assigned to a driver. | Driver ends ride; system fails to update vehicle state; new assignment uses stale state. | No atomic state update for vehicle availability. | Double assignment; driver conflict. | HIGH | MEDIUM | HARD | Fleet, Vehicle Assignment |
| **BUG-FLEET-007** | Functional | Fleet / Alerts | Fleet admin does not receive alerts for low vehicle battery due to notification failure. | Vehicle battery low; alert triggered; notification fails silently. | No retry or fallback for failed notifications. | Vehicle breaks down; service disruption. | MEDIUM | MEDIUM | MEDIUM | Fleet, Notifications, Alerts |

---

### **1.5 Marketplace Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-MKT-001** | Distributed/Async | Marketplace / Sealed-Bid | Sealed-bid winner receives award, but bid deadline extended due to clock skew. | Bidder submits at T=0:00:00; server clock lags; system accepts late bid. | Time synchronization issues between servers/devices. | Unfair advantage; bid integrity compromised. | HIGH | LOW | VERY HARD | Marketplace, Bidding, Notifications |
| **BUG-MKT-002** | Concurrency | Marketplace / RFQs | RFQ awarded to two suppliers due to race condition. | Supplier A and Supplier B submit bids; system awards to both before updating state. | Missing locks in RFQ award logic. | Suppliers confused; duplicate orders. | HIGH | LOW | HARD | Marketplace, RFQs, Orders |
| **BUG-MKT-003** | State Machine | Marketplace / Orders | Order marked as "shipped" but inventory not deducted. | Order shipped; inventory update fails; system doesn’t roll back order state. | Non-atomic order/inventory updates. | Inventory oversold; customer receives out-of-stock item. | HIGH | MEDIUM | HARD | Marketplace, Orders, Inventory |
| **BUG-MKT-004** | Concurrency | Marketplace / Rentals | Rental bidding deadline extended for some bidders due to inconsistent clock sync. | Bidders use devices with different clock times; system accepts late bids for some. | Clock skew between client devices and server. | Unfair bidding; legal disputes. | HIGH | LOW | VERY HARD | Marketplace, Rentals, Bidding |
| **BUG-MKT-005** | State Machine | Marketplace / Rentals | Rental award revoked, but driver continues to receive ride requests. | Rental award revoked; system doesn’t update driver’s availability; driver gets new requests. | No compensation for cross-service state changes. | Driver overcommitted; service conflicts. | MEDIUM | LOW | HARD | Marketplace, Rentals, Ride-hailing |
| **BUG-MKT-006** | Distributed/Async | Marketplace / Food Delivery | Food delivery order bridged to wrong driver due to stale state. | Order assigned to Driver A; Driver A cancels; system bridges to Driver B but uses stale order state. | No state reconciliation after driver cancellation. | Driver B receives incorrect order details. | MEDIUM | MEDIUM | HARD | Marketplace, Food Delivery, Orders |
| **BUG-MKT-007** | Concurrency | Marketplace / Food Delivery | Food delivery order marked as "picked up" but restaurant cancels order; state not rolled back. | Restaurant cancels order after driver picks up; system doesn’t revert delivery state. | No compensation for cross-service state changes. | Driver paid for undeliverable order; customer unsatisfied. | HIGH | MEDIUM | MEDIUM | Marketplace, Food Delivery, Orders |
| **BUG-MKT-008** | Financial | Marketplace / Courier | Courier delivery fee miscalculated due to wrong distance (GPS drift). | Courier delivery distance calculated using drifted GPS. | GPS inaccuracies + fee tied to distance. | Customer/driver charged incorrectly. | MEDIUM | HIGH | MEDIUM | Marketplace, Courier, GPS |
| **BUG-MKT-009** | State Machine | Marketplace / Rentals | Rental vehicle returned, but system still marks it as "assigned" to driver. | Driver returns vehicle; system fails to update state; vehicle remains assigned. | No atomic state update for vehicle return. | Vehicle unavailable for new rentals; billing errors. | MEDIUM | MEDIUM | HARD | Marketplace, Rentals, Fleet |
| **BUG-MKT-010** | Concurrency | Marketplace / Bidding | Bidder sees competitor’s bid due to visibility leak in sealed-bid auction. | Bidder A submits bid; system temporarily exposes bid to Bidder B due to race condition. | Missing isolation in sealed-bid logic. | Unfair auction; collusion risk. | HIGH | LOW | VERY HARD | Marketplace, Bidding |

---
---
### **1.6 Emergency/Ambulance Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-EMG-001** | Security/Fraud | Emergency / Ambulance | Uncertified ambulance dispatched due to stale certification cache. | Ambulance certification expires; cache not invalidated; dispatch uses cached data. | Cache staleness + lack of real-time certification checks. | Patient receives unqualified service; legal/liability risk. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch, Certifications |
| **BUG-EMG-002** | Concurrency | Emergency / Ambulance | First-accept race: multiple ambulances accept the same emergency request. | Ambulance A and Ambulance B accept same request; system assigns to both. | No atomic check for request assignment. | Ambulances dispatched unnecessarily; patient confusion. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch |
| **BUG-EMG-003** | Location & Demand | Emergency / Ambulance | Ambulance dispatched to wrong geographic radius due to H3 cell error. | Emergency request in Cell A; ambulance in Cell B; system matches due to cell boundary error. | H3 cell misalignment + emergency dispatch logic. | Delayed response; patient at risk. | CRITICAL | LOW | VERY HARD | Emergency, H3, Dispatch |
| **BUG-EMG-004** | State Machine | Emergency / Ambulance | Emergency request marked as "completed" but ambulance never arrived. | Ambulance marked as arrived; system updates state; ambulance never actually arrived. | No GPS validation for arrival confirmation. | Patient left without help; false completion. | CRITICAL | LOW | HARD | Emergency, GPS, Dispatch |
| **BUG-EMG-005** | Concurrency | Emergency / Ambulance | Emergency request broadcast to stale providers (e.g., offline ambulances). | Request broadcast to Ambulance A (offline); system doesn’t detect offline state. | No real-time provider availability check. | Delayed response; patient at risk. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch, Provider Management |
| **BUG-EMG-006** | State Machine | Emergency / Ambulance | Scheduled ambulance dispatch diverges from urgent dispatch logic. | Urgent request uses scheduled dispatch logic; ambulance assigned incorrectly. | Logic reuse between scheduled/urgent dispatches. | Delayed response; patient at risk. | CRITICAL | LOW | HARD | Emergency, Dispatch, Scheduler |
| **BUG-EMG-007** | Security/Fraud | Emergency / Ambulance | Ambulance certification revoked, but system still allows dispatch. | Certification revoked; system doesn’t sync revocation; ambulance dispatched. | No real-time certification validation. | Patient receives unqualified service; legal risk. | CRITICAL | LOW | HARD | Emergency, Certifications, Dispatch |
| **BUG-EMG-008** | Infrastructure | Emergency / Ambulance | Emergency SOS notifications delayed due to WebSocket backlog. | SOS triggered; WebSocket queue backlogged; notification delayed. | WebSocket queue not prioritized for SOS. | Delayed emergency response; patient at risk. | CRITICAL | LOW | HARD | Emergency, WebSockets, Notifications |

---
---
### **1.7 Infrastructure Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-INFRA-001** | Infrastructure | Scheduler / Jobs | Scheduled ride reminder sent 24 hours late due to job backlog. | Scheduler job for reminders delayed by 24h; no monitoring/alerts. | Job queue backlog + no SLA monitoring. | Rider misses ride; trust in platform eroded. | HIGH | LOW | HARD | Scheduler, Notifications |
| **BUG-INFRA-002** | Infrastructure | Scheduler / Jobs | Scheduler job processes stale ride state (e.g., ride already completed). | Ride completed; scheduler job runs later and updates stale state. | No state versioning or timestamp checks in jobs. | Ride state corrupted; billing errors. | HIGH | MEDIUM | HARD | Scheduler, Ride State |
| **BUG-INFRA-003** | Infrastructure | WebSocket / Events | WebSocket event delivered out of order due to network latency. | Event A sent at T=0; Event B sent at T=1; Event B received before Event A. | No sequence numbering or ordering in WebSocket. | Client state corrupted; UI inconsistencies. | MEDIUM | HIGH | HARD | WebSockets, Events |
| **BUG-INFRA-004** | Infrastructure | WebSocket / Events | WebSocket reconnect causes duplicate event processing. | Client disconnects; reconnects; server replays events; client processes duplicates. | No idempotency or deduplication in WebSocket events. | Duplicate actions (e.g., double payment). | HIGH | MEDIUM | HARD | WebSockets, Events |
| **BUG-INFRA-005** | Infrastructure | Notifications | Push notification sent to wrong user due to device ID mix-up. | Rider A and Rider B share device ID (e.g., shared phone); notification routed to both. | Device ID not uniquely tied to user session. | Privacy breach; confusion. | MEDIUM | LOW | EASY | Notifications, User Sessions |
| **BUG-INFRA-006** | Infrastructure | Notifications | Notification for cancelled ride sent after cancellation. | Ride cancelled; notification triggered later due to delayed event processing. | No state check before sending notifications. | User confusion; support overhead. | MEDIUM | MEDIUM | MEDIUM | Notifications, Ride State |
| **BUG-INFRA-007** | Infrastructure | Feature Flags | Feature flag for "surge pricing" enabled for riders but not drivers. | Admin enables surge pricing for riders; driver app flag not updated due to stale config. | Inconsistent feature flag propagation. | Drivers reject rides; riders see incorrect fares. | HIGH | LOW | MEDIUM | Feature Flags, Fare Calc, Dispatch |
| **BUG-INFRA-008** | Infrastructure | Feature Flags | Feature flag change not propagated to all services due to cache staleness. | Flag updated in Admin; other services use stale cached value. | Flag cache TTL too long. | Inconsistent behavior across services. | HIGH | MEDIUM | HARD | Feature Flags, All Services |
| **BUG-INFRA-009** | Infrastructure | Time Handling | Ride expiration countdown incorrect due to UTC/Dhaka timezone mismatch. | Ride expires at midnight Dhaka time; server uses UTC and expires at wrong time. | Timezone not normalized in expiration logic. | Ride expires prematurely/late; billing errors. | MEDIUM | MEDIUM | MEDIUM | Time Handling, Ride State |
| **BUG-INFRA-010** | Infrastructure | Time Handling | Monthly subscription renewal fails at month-end due to boundary condition. | Subscription renews at 23:59:59; logic fails at month-end edge case. | Time boundary not handled in renewal logic. | Subscription lapses; service disruption. | MEDIUM | LOW | HARD | Subscriptions, Billing |
| **BUG-INFRA-011** | Infrastructure | WebSocket / Events | WebSocket event lost due to client disconnect/reconnect. | Client disconnects during event transmission; event lost; no retry. | No event persistence or retry for disconnected clients. | Client state inconsistent; missed updates. | MEDIUM | HIGH | HARD | WebSockets, Events |
| **BUG-INFRA-012** | Infrastructure | Scheduler / Jobs | Scheduler job overlaps with another job, causing resource contention. | Job A and Job B run simultaneously; both use same resource (e.g., database lock). | No job coordination or resource locking. | Jobs fail or corrupt data. | HIGH | LOW | HARD | Scheduler, All Services |
| **BUG-INFRA-013** | Infrastructure | Cache | Cache staleness causes user to see outdated ride status. | Ride status updated; cache not invalidated; user sees old status. | Cache TTL too long + no real-time invalidation. | User confusion; support overhead. | MEDIUM | HIGH | MEDIUM | Cache, Ride State |
| **BUG-INFRA-014** | Infrastructure | Cache | Cache eviction storm causes temporary data unavailability. | Cache evicts many keys simultaneously; system falls back to slow DB queries. | No staggered cache eviction. | Performance degradation; timeouts. | MEDIUM | LOW | HARD | Cache, Performance |

---
---
### **1.8 Data & Cross-Service Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-DATA-001** | Data Consistency | Wallet / Ledger | Wallet balance and ledger out of sync due to failed transaction rollback. | Payment fails mid-transaction; wallet updated but ledger not rolled back. | Non-atomic wallet/ledger updates. | User sees incorrect balance; accounting errors. | CRITICAL | MEDIUM | HARD | Wallet, Ledger, Accounting |
| **BUG-DATA-002** | Data Consistency | Ride-hailing / Orders | Orphaned ride record remains after ride cancellation. | Ride cancelled; ride record not deleted; system retains orphan. | No cleanup for cancelled rides. | Data bloat; reporting errors. | MEDIUM | HIGH | MEDIUM | Ride State, Data Cleanup |
| **BUG-DATA-003** | Data Consistency | Marketplace / Inventory | Inventory counter mismatched due to race condition. | Item A sold; two transactions decrement inventory simultaneously; counter goes negative. | Non-atomic inventory updates. | Overselling; customer dissatisfaction. | HIGH | MEDIUM | HARD | Marketplace, Inventory |
| **BUG-DATA-004** | Data Consistency | Ride-hailing / Ratings | Ride rating applied to wrong driver due to stale state. | Rider rates Driver A; system applies to Driver B due to stale ride-driver mapping. | No atomic check for ride-driver state. | Driver reputation affected; unfair ratings. | MEDIUM | MEDIUM | HARD | Ratings, Ride State |
| **BUG-DATA-005** | Data Consistency | Ride-hailing / Ride State | Ride state updated by background job after user action. | User cancels ride; background job updates ride state to "completed." | No state versioning or conflict detection. | Ride marked as completed after cancellation; billing errors. | HIGH | LOW | HARD | Ride State, Scheduler |
| **BUG-DATA-006** | Cross-Service | Ride → Payment → Wallet | Ride completed, but payment fails; wallet not refunded. | Ride completes; payment fails; system doesn’t trigger refund. | No compensation for failed payment after ride completion. | Rider charged but ride not paid; driver unpaid. | CRITICAL | MEDIUM | HARD | Ride, Payment, Wallet |
| **BUG-DATA-007** | Cross-Service | Order → Delivery → Payment | Order delivered, but payment fails; inventory not restored. | Order delivered; payment fails; system doesn’t restore inventory. | No compensation for failed payment after delivery. | Inventory oversold; customer charged for undelivered item. | HIGH | LOW | HARD | Marketplace, Orders, Inventory, Payment |
| **BUG-DATA-008** | Cross-Service | Ride → SOS → Emergency | SOS triggered for ride, but emergency service not notified. | SOS triggered; emergency notification fails; no retry. | No fallback for failed emergency notifications. | Delayed emergency response; patient at risk. | CRITICAL | LOW | HARD | SOS, Emergency, Notifications |
| **BUG-DATA-009** | Data Consistency | Ride-hailing / Soft Deletes | Soft-deleted ride record still appears in active ride list. | Ride soft-deleted; query for active rides includes soft-deleted records. | No filter for soft-deleted records in active ride queries. | User sees cancelled rides; confusion. | MEDIUM | HIGH | EASY | Ride State, Data Queries |
| **BUG-DATA-010** | Cross-Service | Fleet → Ride-hailing | Fleet vehicle assigned to ride despite subscription expiry. | Vehicle subscription expires; ride assignment doesn’t check subscription. | No real-time subscription validation in ride assignment. | Fleet owner loses revenue; unauthorized vehicle use. | HIGH | MEDIUM | HARD | Fleet, Ride-hailing, Subscriptions |
| **BUG-DATA-011** | Data Consistency | Ride-hailing / Counters | Ride counter (e.g., total rides) mismatched due to race condition. | Two rides complete simultaneously; counter increments incorrectly. | Non-atomic counter updates. | Reporting errors; analytics inaccurate. | MEDIUM | MEDIUM | HARD | Ride State, Counters |
| **BUG-DATA-012** | Cross-Service | Wallet → Ledger → Accounting | Wallet top-up succeeds, but ledger and accounting not updated. | Wallet top-up processed; ledger/accounting update fails. | Non-atomic wallet/ledger/accounting updates. | Accounting discrepancies; audit failures. | CRITICAL | LOW | VERY HARD | Wallet, Ledger, Accounting |
| **BUG-DATA-013** | Data Consistency | Ride-hailing / Ride History | Ride history shows incorrect fare due to stale fare calculation. | Fare recalculated post-ride; history not updated. | No real-time update for ride history. | Rider/driver sees incorrect fare; disputes. | MEDIUM | HIGH | MEDIUM | Ride History, Fare Calc |
| **BUG-DATA-014** | Cross-Service | Ride → Notification → User | Ride completion notification sent, but ride was cancelled. | Ride cancelled; notification triggered later due to stale state. | No state check before sending notifications. | User confusion; support overhead. | MEDIUM | MEDIUM | MEDIUM | Notifications, Ride State |

---
---
### **1.9 Mobile/Network Domain**

| **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **POSSIBLE BUG** | **TRIGGER / SCENARIO** | **WHY PLAUSIBLE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **AFFECTED AREAS** |
|------------|--------------|----------------------|------------------|-------------------------|-------------------|------------|--------------|---------------|---------------------------|---------------------|
| **BUG-MOB-001** | Mobile/Network | Ride-hailing / Client Retries | Client retries ride request after timeout, creating duplicate rides. | User requests ride; network times out; user retries; server processes both. | Missing idempotency in ride creation. | Duplicate rides; driver confusion. | HIGH | HIGH | HARD | Ride-hailing, Client |
| **BUG-MOB-002** | Mobile/Network | Ride-hailing / Stale State | Client shows stale ride state due to network latency. | Ride state updated on server; client doesn’t receive update due to latency. | No real-time state sync between client and server. | User acts on stale state (e.g., cancels completed ride). | MEDIUM | HIGH | MEDIUM | Ride State, Client |
| **BUG-MOB-003** | Mobile/Network | Ride-hailing / Backgrounding | Client app backgrounded; ride state not synced on foreground. | User backgrounds app; ride state changes; app doesn’t sync on foreground. | No state sync on app foreground. | User sees stale state; missed updates. | MEDIUM | HIGH | MEDIUM | Client, Ride State |
| **BUG-MOB-004** | Mobile/Network | Ride-hailing / Local Queue Replay | Client replays local queue after reconnect, causing duplicate actions. | Client disconnects; reconnects; replays local queue; server processes duplicates. | No deduplication for local queue replay. | Duplicate payments, cancellations, etc. | HIGH | MEDIUM | HARD | Client, Ride State |
| **BUG-MOB-005** | Mobile/Network | Ride-hailing / Server-Client Desync | Server completes ride, but client thinks ride failed; user retries. | Server processes ride; client doesn’t receive confirmation; user retries. | No client-side confirmation for server actions. | Duplicate rides; user charged twice. | HIGH | MEDIUM | HARD | Client, Ride State |
| **BUG-MOB-006** | Mobile/Network | Ride-hailing / Offline Mode | Client creates ride in offline mode; ride not synced to server. | User creates ride offline; app doesn’t sync when online; ride lost. | No offline ride persistence or sync. | Ride lost; user frustration. | MEDIUM | MEDIUM | MEDIUM | Client, Ride State |
| **BUG-MOB-007** | Mobile/Network | Ride-hailing / Push Notifications | Push notification for ride update not received due to device sleep. | Ride update occurs; device asleep; notification not delivered. | No retry for undelivered push notifications. | User misses updates; support overhead. | MEDIUM | HIGH | MEDIUM | Notifications, Client |
| **BUG-MOB-008** | Mobile/Network | Ride-hailing / Multi-Device | User logged in on two devices; actions on one not synced to the other. | User cancels ride on Device A; Device B still shows ride as active. | No real-time state sync across devices. | User confusion; duplicate actions. | MEDIUM | HIGH | MEDIUM | Client, Ride State |
| **BUG-MOB-009** | Mobile/Network | Ride-hailing / Network Retries | Client retries payment after timeout; server processes both. | User pays; network times out; user retries; server processes both. | Missing idempotency in payment endpoint. | User charged twice; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Payments, Client |
| **BUG-MOB-010** | Mobile/Network | Ride-hailing / GPS | Client GPS drift causes incorrect pickup location. | User requests ride; client GPS drifts; pickup location incorrect. | No GPS drift correction on client. | Driver can’t find rider; long wait times. | MEDIUM | HIGH | MEDIUM | GPS, Ride-hailing |

---

---
---
## **2. TOP 100 BUGS TO INVESTIGATE FIRST**
*(Prioritized by **financial damage**, **security/safety**, **likelihood**, **detection difficulty**, **recovery difficulty**, and **cross-service blast radius**.)*

### **Tier 1: CRITICAL (Investigate Immediately)**
| **Rank** | **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **BLAST RADIUS** |
|----------|------------|--------------|----------------------|------------|--------------|---------------|---------------------------|------------------|
| 1 | **BUG-PAYMENT-003** | Retry/Idempotency | Payments / Wallet | User loses money; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Wallet, Ledger, Payments |
| 2 | **BUG-FIN-007** | Financial | Payments / Refunds | User receives excess refund; financial loss to platform. | CRITICAL | LOW | HARD | Refunds, Payments, Currency |
| 3 | **BUG-DISPATCH-001** | Concurrency | Ride-hailing / Dispatch | Driver double-booked; one rider left stranded. | CRITICAL | HIGH | HARD | Dispatch, Matching, Rider/Driver |
| 4 | **BUG-EMG-001** | Security/Fraud | Emergency / Ambulance | Patient receives unqualified service; legal/liability risk. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch, Certifications |
| 5 | **BUG-EMG-002** | Concurrency | Emergency / Ambulance | Ambulances dispatched unnecessarily; patient confusion. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch |
| 6 | **BUG-EMG-003** | Location & Demand | Emergency / Ambulance | Delayed response; patient at risk. | CRITICAL | LOW | VERY HARD | Emergency, H3, Dispatch |
| 7 | **BUG-FIN-009** | Retry/Idempotency | Payments / Callbacks | User charged twice; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Payments, Wallet, Ledger |
| 8 | **BUG-DATA-012** | Cross-Service | Wallet → Ledger → Accounting | Accounting discrepancies; audit failures. | CRITICAL | LOW | VERY HARD | Wallet, Ledger, Accounting |
| 9 | **BUG-AUTH-011** | Security/Fraud | Auth / RBAC | Data breach; unauthorized actions. | CRITICAL | MEDIUM | HARD | Auth, Fleet, RBAC |
| 10 | **BUG-EMG-008** | Cross-Service | Ride → SOS → Emergency | Delayed emergency response; patient at risk. | CRITICAL | LOW | HARD | SOS, Emergency, Notifications |
| 11 | **BUG-FIN-001** | Retry/Idempotency | Payments / Wallet | User loses money; ledger/wallet mismatch. | CRITICAL | HIGH | HARD | Wallet, Ledger, Payments |
| 12 | **BUG-STATE-004** | State Machine | Ride-hailing / Ride Lifecycle | Rider charged but ride not settled; driver unpaid. | CRITICAL | MEDIUM | MEDIUM | Ride State, Payments, Wallet |
| 13 | **BUG-FLEET-004** | Security/Fraud | Fleet / Roles | Data breach; unauthorized actions. | CRITICAL | MEDIUM | HARD | Auth, Fleet, RBAC |
| 14 | **BUG-DATA-001** | Data Consistency | Wallet / Ledger | User sees incorrect balance; accounting errors. | CRITICAL | MEDIUM | HARD | Wallet, Ledger, Accounting |
| 15 | **BUG-DATA-006** | Cross-Service | Ride → Payment → Wallet | Rider charged but ride not paid; driver unpaid. | CRITICAL | MEDIUM | HARD | Ride, Payment, Wallet |
| 16 | **BUG-EMG-004** | State Machine | Emergency / Ambulance | Patient left without help; false completion. | CRITICAL | LOW | HARD | Emergency, GPS, Dispatch |
| 17 | **BUG-FIN-002** | Financial | Ride-hailing / Fare Calc | Rider overcharged or undercharged; driver earnings incorrect. | CRITICAL | HIGH | MEDIUM | Fare Calc, Location, Payments |
| 18 | **BUG-CORE-004** | Concurrency | Ride-hailing / Ride Lifecycle | Driver paid for cancelled ride; rider charged. | CRITICAL | MEDIUM | HARD | Ride State, Payments |
| 19 | **BUG-DATA-008** | Cross-Service | Ride → SOS → Emergency | Delayed emergency response; patient at risk. | CRITICAL | LOW | HARD | SOS, Emergency, Notifications |
| 20 | **BUG-FIN-012** | Financial | Double-Entry Accounting | Accounting inconsistencies; audit failures. | CRITICAL | LOW | VERY HARD | Ledger, Accounting |

---

### **Tier 2: HIGH (Investigate Next)**
| **Rank** | **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **BLAST RADIUS** |
|----------|------------|--------------|----------------------|------------|--------------|---------------|---------------------------|------------------|
| 21 | **BUG-FLEET-001** | Concurrency | Fleet / Vehicle Assignment | Driver overcommitted; one service fails. | HIGH | MEDIUM | HARD | Fleet, Rentals, Delivery |
| 22 | **BUG-FIN-008** | Financial | Tax / Accounting | Platform overpays tax; financial reporting incorrect. | HIGH | MEDIUM | HARD | Tax, Promotions, Financial Reports |
| 23 | **BUG-MKT-001** | Distributed/Async | Marketplace / Sealed-Bid | Unfair advantage; bid integrity compromised. | HIGH | LOW | VERY HARD | Marketplace, Bidding, Notifications |
| 24 | **BUG-SOS-009** | Concurrency | Ride-hailing / SOS | Emergency services overwhelmed; false alarms. | HIGH | MEDIUM | MEDIUM | SOS, Notifications, Emergency |
| 25 | **BUG-FIN-006** | Financial | Wallet / Ledger | User sees incorrect balance; accounting discrepancies. | HIGH | MEDIUM | HARD | Wallet, Ledger, Accounting |
| 26 | **BUG-FIN-010** | Financial | Driver Earnings / Payouts | Driver overpaid/underpaid; accounting errors. | HIGH | MEDIUM | HARD | Driver Earnings, Payments |
| 27 | **BUG-MKT-007** | State Machine | Marketplace / Food Delivery | Driver paid for undeliverable order; customer unsatisfied. | HIGH | MEDIUM | MEDIUM | Marketplace, Food Delivery, Orders |
| 28 | **BUG-FIN-014** | Financial | Promotions / Passes | User gets unlimited rides; platform loses revenue. | HIGH | MEDIUM | HARD | Promotions, Payments |
| 29 | **BUG-FIN-004** | Financial | Promotions / Coupons | Platform loses revenue; rider gets unfair discount. | HIGH | MEDIUM | HARD | Promotions, Payments, Ride-hailing |
| 30 | **BUG-CORE-002** | Concurrency | Ride-hailing / Dispatch | Driver double-booked; one rider left stranded. | HIGH | HIGH | HARD | Dispatch, Matching, Rider/Driver |
| 31 | **BUG-FIN-005** | Financial | Ride-hailing / Tipping | Platform overpays/underpays tax. | HIGH | MEDIUM | HARD | Tipping, Tax, Payments |
| 32 | **BUG-MOB-009** | Mobile/Network | Ride-hailing / Network Retries | User charged twice; ledger/wallet mismatch. | HIGH | HIGH | HARD | Payments, Client |
| 33 | **BUG-MOB-001** | Mobile/Network | Ride-hailing / Client Retries | Duplicate rides; driver confusion. | HIGH | HIGH | HARD | Ride-hailing, Client |
| 34 | **BUG-MKT-002** | Concurrency | Marketplace / RFQs | Suppliers confused; duplicate orders. | HIGH | LOW | HARD | Marketplace, RFQs, Orders |
| 35 | **BUG-FLEET-002** | State Machine | Fleet / Vehicle Assignment | Fleet owner loses revenue; unauthorized vehicle use. | HIGH | MEDIUM | HARD | Fleet, Subscriptions, Vehicle Assignment |
| 36 | **BUG-FLEET-003** | Concurrency | Fleet / Vehicle Assignment | Vehicle overcommitted; driver conflict. | HIGH | MEDIUM | HARD | Fleet, Vehicle Assignment |
| 37 | **BUG-DATA-003** | Data Consistency | Marketplace / Inventory | Overselling; customer dissatisfaction. | HIGH | MEDIUM | HARD | Marketplace, Inventory |
| 38 | **BUG-DATA-007** | Cross-Service | Order → Delivery → Payment | Inventory oversold; customer charged for undelivered item. | HIGH | LOW | HARD | Marketplace, Orders, Inventory, Payment |
| 39 | **BUG-INFRA-002** | Infrastructure | Scheduler / Jobs | Ride state corrupted; billing errors. | HIGH | MEDIUM | HARD | Scheduler, Ride State |
| 40 | **BUG-INFRA-004** | Infrastructure | WebSocket / Events | Duplicate actions (e.g., double payment). | HIGH | MEDIUM | HARD | WebSockets, Events |

---
---
### **Tier 3: MEDIUM (Investigate After Tier 1-2)**
| **Rank** | **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **IMPACT** | **SEVERITY** | **LIKELIHOOD** | **DETECTION DIFFICULTY** | **BLAST RADIUS** |
|----------|------------|--------------|----------------------|------------|--------------|---------------|---------------------------|------------------|
| 41 | **BUG-LOC-002** | Location & Demand | Ride-hailing / GPS | Rider overcharged; driver fraudulently increases earnings. | HIGH | MEDIUM | HARD | GPS, Fare Calc, Fraud Detection |
| 42 | **BUG-CORE-005** | State Machine | Ride-hailing / Ride Lifecycle | Rider charged but ride not settled; driver unpaid. | CRITICAL | MEDIUM | MEDIUM | Ride State, Payments, Wallet |
| 43 | **BUG-MKT-003** | State Machine | Marketplace / Orders | Inventory oversold; customer receives out-of-stock item. | HIGH | MEDIUM | HARD | Marketplace, Orders, Inventory |
| 44 | **BUG-MKT-006** | Distributed/Async | Marketplace / Food Delivery | Driver B receives incorrect order details. | MEDIUM | MEDIUM | HARD | Marketplace, Food Delivery, Orders |
| 45 | **BUG-MKT-010** | Concurrency | Marketplace / Bidding | Unfair auction; collusion risk. | HIGH | LOW | VERY HARD | Marketplace, Bidding |
| 46 | **BUG-INFRA-001** | Infrastructure | Scheduler / Jobs | Rider misses ride; trust in platform eroded. | HIGH | LOW | HARD | Scheduler, Notifications |
| 47 | **BUG-INFRA-008** | Infrastructure | Feature Flags | Inconsistent behavior across services. | HIGH | MEDIUM | HARD | Feature Flags, All Services |
| 48 | **BUG-DATA-004** | Data Consistency | Ride-hailing / Ratings | Driver reputation affected; unfair ratings. | MEDIUM | MEDIUM | HARD | Ratings, Ride State |
| 49 | **BUG-DATA-005** | Data Consistency | Ride-hailing / Ride State | Ride marked as completed after cancellation; billing errors. | HIGH | LOW | HARD | Ride State, Scheduler |
| 50 | **BUG-MOB-002** | Mobile/Network | Ride-hailing / Stale State | User acts on stale state (e.g., cancels completed ride). | MEDIUM | HIGH | MEDIUM | Ride State, Client |
| 51 | **BUG-MOB-004** | Mobile/Network | Ride-hailing / Local Queue Replay | Duplicate payments, cancellations, etc. | HIGH | MEDIUM | HARD | Client, Ride State |
| 52 | **BUG-MOB-005** | Mobile/Network | Ride-hailing / Server-Client Desync | Duplicate rides; user charged twice. | HIGH | MEDIUM | HARD | Client, Ride State |
| 53 | **BUG-LOC-001** | Location & Demand | Ride-hailing / Matching | Driver/rider mismatched; long wait times. | MEDIUM | HIGH | MEDIUM | Matching, Location, Dispatch |
| 54 | **BUG-LOC-003** | Location & Demand | Ride-hailing / ETA | Rider/driver frustrated; missed rides. | MEDIUM | HIGH | MEDIUM | ETA, Traffic Data, Dispatch |
| 55 | **BUG-LOC-004** | Location & Demand | Ride-hailing / Zone Boundaries | Rider/driver charged incorrectly. | MEDIUM | MEDIUM | HARD | Zone Boundaries, Fare Calc |
| 56 | **BUG-LOC-006** | Location & Demand | Ride-hailing / Live Tracking | Driver/rider confusion; safety risk. | MEDIUM | HIGH | MEDIUM | Live Tracking, GPS |
| 57 | **BUG-LOC-007** | Location & Demand | Ride-hailing / Geofencing | Driver loses rides; rider wait times increase. | MEDIUM | MEDIUM | MEDIUM | Geofencing, Dispatch |
| 58 | **BUG-CORE-003** | State Machine | Ride-hailing / Ride Lifecycle | Rider stranded; driver unavailable for new rides. | HIGH | MEDIUM | MEDIUM | Dispatch, Ride State |
| 59 | **BUG-CORE-006** | Functional | Ride-hailing / PIN Verification | Unauthorized ride start; security risk. | HIGH | LOW | MEDIUM | Ride State, Security |
| 60 | **BUG-CORE-007** | Concurrency | Ride-hailing / Multi-Stop | Rider stranded; complaints; refunds. | MEDIUM | HIGH | MEDIUM | Multi-Stop, GPS, Ride Lifecycle |
| 61 | **BUG-CORE-008** | State Machine | Ride-hailing / Scheduled Rides | Rider wakes up to unexpected ride; driver confused. | MEDIUM | MEDIUM | MEDIUM | Scheduled Rides, Scheduler |
| 62 | **BUG-CORE-009** | Concurrency | Ride-hailing / No-Show | Double assignment; rider confusion. | HIGH | MEDIUM | HARD | Dispatch, Ride State |
| 63 | **BUG-CORE-010** | State Machine | Ride-hailing / SOS | Emergency services overwhelmed; false alarms. | HIGH | MEDIUM | MEDIUM | SOS, Notifications, Emergency |
| 64 | **BUG-FIN-013** | Financial | Ride-hailing / Waiting Charges | Rider overcharged; driver underpaid. | MEDIUM | HIGH | MEDIUM | Waiting Charges, GPS, Fare Calc |
| 65 | **BUG-FIN-015** | Financial | Ride-hailing / Dynamic Pricing | Driver rejects rides; rider sees incorrect fares. | HIGH | LOW | MEDIUM | Dynamic Pricing, Feature Flags |
| 66 | **BUG-FLEET-005** | Concurrency | Fleet / Subscriptions | Fleet owner exceeds subscription; billing errors. | MEDIUM | LOW | HARD | Fleet, Subscriptions, Billing |
| 67 | **BUG-FLEET-006** | State Machine | Fleet / Vehicle Assignment | Double assignment; driver conflict. | HIGH | MEDIUM | HARD | Fleet, Vehicle Assignment |
| 68 | **BUG-FLEET-007** | Functional | Fleet / Alerts | Vehicle breaks down; service disruption. | MEDIUM | MEDIUM | MEDIUM | Fleet, Notifications, Alerts |
| 69 | **BUG-MKT-004** | Concurrency | Marketplace / Rentals | Unfair bidding; legal disputes. | HIGH | LOW | VERY HARD | Marketplace, Rentals, Bidding |
| 70 | **BUG-MKT-005** | State Machine | Marketplace / Rentals | Driver overcommitted; service conflicts. | MEDIUM | LOW | HARD | Marketplace, Rentals, Ride-hailing |
| 71 | **BUG-MKT-008** | Financial | Marketplace / Courier | Customer/driver charged incorrectly. | MEDIUM | HIGH | MEDIUM | Marketplace, Courier, GPS |
| 72 | **BUG-MKT-009** | State Machine | Marketplace / Rentals | Vehicle unavailable for new rentals; billing errors. | MEDIUM | MEDIUM | HARD | Marketplace, Rentals, Fleet |
| 73 | **BUG-EMG-005** | Concurrency | Emergency / Ambulance | Delayed response; patient at risk. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch, Provider Management |
| 74 | **BUG-EMG-006** | State Machine | Emergency / Ambulance | Delayed response; patient at risk. | CRITICAL | LOW | HARD | Emergency, Dispatch, Scheduler |
| 75 | **BUG-EMG-007** | Security/Fraud | Emergency / Ambulance | Patient receives unqualified service; legal risk. | CRITICAL | LOW | HARD | Emergency, Certifications, Dispatch |
| 76 | **BUG-INFRA-003** | Infrastructure | WebSocket / Events | Client state corrupted; UI inconsistencies. | MEDIUM | HIGH | HARD | WebSockets, Events |
| 77 | **BUG-INFRA-005** | Infrastructure | Notifications | Privacy breach; confusion. | MEDIUM | LOW | EASY | Notifications, User Sessions |
| 78 | **BUG-INFRA-006** | Infrastructure | Notifications | User confusion; support overhead. | MEDIUM | MEDIUM | MEDIUM | Notifications, Ride State |
| 79 | **BUG-INFRA-007** | Infrastructure | Feature Flags | Drivers reject rides; riders see incorrect fares. | HIGH | LOW | MEDIUM | Feature Flags, Fare Calc, Dispatch |
| 80 | **BUG-INFRA-009** | Infrastructure | Time Handling | Ride expires prematurely/late; billing errors. | MEDIUM | MEDIUM | MEDIUM | Time Handling, Ride State |
| 81 | **BUG-INFRA-010** | Infrastructure | Time Handling | Subscription lapses; service disruption. | MEDIUM | LOW | HARD | Subscriptions, Billing |
| 82 | **BUG-INFRA-011** | Infrastructure | WebSocket / Events | Client state inconsistent; missed updates. | MEDIUM | HIGH | HARD | WebSockets, Events |
| 83 | **BUG-INFRA-012** | Infrastructure | Scheduler / Jobs | Jobs fail or corrupt data. | HIGH | LOW | HARD | Scheduler, All Services |
| 84 | **BUG-INFRA-013** | Infrastructure | Cache | User confusion; support overhead. | MEDIUM | HIGH | MEDIUM | Cache, Ride State |
| 85 | **BUG-INFRA-014** | Infrastructure | Cache | Performance degradation; timeouts. | MEDIUM | LOW | HARD | Cache, Performance |
| 86 | **BUG-DATA-002** | Data Consistency | Ride-hailing / Orders | Data bloat; reporting errors. | MEDIUM | HIGH | MEDIUM | Ride State, Data Cleanup |
| 87 | **BUG-DATA-009** | Data Consistency | Ride-hailing / Ride State | User sees cancelled rides; confusion. | MEDIUM | HIGH | EASY | Ride State, Data Queries |
| 88 | **BUG-DATA-011** | Data Consistency | Ride-hailing / Counters | Reporting errors; analytics inaccurate. | MEDIUM | MEDIUM | HARD | Ride State, Counters |
| 89 | **BUG-DATA-013** | Data Consistency | Ride-hailing / Ride History | Rider/driver sees incorrect fare; disputes. | MEDIUM | HIGH | MEDIUM | Ride History, Fare Calc |
| 90 | **BUG-DATA-014** | Cross-Service | Ride → Notification → User | User confusion; support overhead. | MEDIUM | MEDIUM | MEDIUM | Notifications, Ride State |
| 91 | **BUG-MOB-003** | Mobile/Network | Ride-hailing / Backgrounding | User sees stale state; missed updates. | MEDIUM | HIGH | MEDIUM | Client, Ride State |
| 92 | **BUG-MOB-006** | Mobile/Network | Ride-hailing / Offline Mode | Ride lost; user frustration. | MEDIUM | MEDIUM | MEDIUM | Client, Ride State |
| 93 | **BUG-MOB-007** | Mobile/Network | Ride-hailing / Push Notifications | User misses updates; support overhead. | MEDIUM | HIGH | MEDIUM | Notifications, Client |
| 94 | **BUG-MOB-008** | Mobile/Network | Ride-hailing / Multi-Device | User confusion; duplicate actions. | MEDIUM | HIGH | MEDIUM | Client, Ride State |
| 95 | **BUG-LOC-005** | Location & Demand | Ride-hailing / H3 Indexing | Matching fails; rides not dispatched. | HIGH | LOW | VERY HARD | H3 Indexing, Matching |
| 96 | **BUG-FLEET-007** | Functional | Fleet / Alerts | Vehicle breaks down; service disruption. | MEDIUM | MEDIUM | MEDIUM | Fleet, Notifications, Alerts |
| 97 | **BUG-MKT-004** | Concurrency | Marketplace / Rentals | Unfair bidding; legal disputes. | HIGH | LOW | VERY HARD | Marketplace, Rentals, Bidding |
| 98 | **BUG-EMG-005** | Concurrency | Emergency / Ambulance | Delayed response; patient at risk. | CRITICAL | MEDIUM | HARD | Emergency, Dispatch, Provider Management |
| 99 | **BUG-INFRA-008** | Infrastructure | Feature Flags | Inconsistent behavior across services. | HIGH | MEDIUM | HARD | Feature Flags, All Services |
| 100 | **BUG-DATA-007** | Cross-Service | Order → Delivery → Payment | Inventory oversold; customer charged for undelivered item. | HIGH | LOW | HARD | Marketplace, Orders, Inventory, Payment |

---

---
---
## **3. TOP 30 RARE BUT SEVERE BUGS**
*(Most likely to escape ordinary testing due to **rare timing**, **multiple actors**, **provider failure**, **retry**, **stale state**, **scheduler interaction**, or **unusual data**.)*

| **Rank** | **BUG ID** | **CATEGORY** | **SERVICE / MODULE** | **WHY RARE** | **SEVERITY** | **IMPACT** | **DETECTION DIFFICULTY** |
|----------|------------|--------------|----------------------|--------------|--------------|------------|---------------------------|
| 1 | **BUG-EMG-003** | Location & Demand | Emergency / Ambulance | Requires H3 cell boundary error + emergency dispatch. | CRITICAL | Delayed response; patient at risk. | VERY HARD |
| 2 | **BUG-DATA-012** | Cross-Service | Wallet → Ledger → Accounting | Requires partial failure in atomic transaction. | CRITICAL | Accounting discrepancies; audit failures. | VERY HARD |
| 3 | **BUG-MKT-001** | Distributed/Async | Marketplace / Sealed-Bid | Requires clock skew between bidder and server. | HIGH | Unfair advantage; bid integrity compromised. | VERY HARD |
| 4 | **BUG-INFRA-012** | Infrastructure | Scheduler / Jobs | Requires overlapping jobs + resource contention. | HIGH | Jobs fail or corrupt data. | VERY HARD |
| 5 | **BUG-EMG-008** | Cross-Service | Ride → SOS → Emergency | Requires SOS failure + emergency notification failure. | CRITICAL | Delayed emergency response; patient at risk. | VERY HARD |
| 6 | **BUG-FIN-012** | Financial | Double-Entry Accounting | Requires race condition in ledger updates. | CRITICAL | Accounting inconsistencies; audit failures. | VERY HARD |
| 7 | **BUG-LOC-005** | Location & Demand | Ride-hailing / H3 Indexing | Requires concurrent H3 index updates. | HIGH | Matching fails; rides not dispatched. | VERY HARD |
| 8 | **BUG-MKT-010** | Concurrency | Marketplace / Bidding | Requires race condition in sealed-bid visibility. | HIGH | Unfair auction; collusion risk. | VERY HARD |
| 9 | **BUG-MKT-004** | Concurrency | Marketplace / Rentals | Requires clock skew between bidders. | HIGH | Unfair bidding; legal disputes. | VERY HARD |
| 10 | **BUG-EMG-006** | State Machine | Emergency / Ambulance | Requires logic reuse between scheduled/urgent dispatches. | CRITICAL | Delayed response; patient at risk. | HARD |
| 11 | **BUG-INFRA-011** | Infrastructure | WebSocket / Events | Requires client disconnect/reconnect during event transmission. | MEDIUM | Client state inconsistent; missed updates. | HARD |
| 12 | **BUG-DATA-005** | Data Consistency | Ride-hailing / Ride State | Requires background job to run after user action. | HIGH | Ride marked as completed after cancellation; billing errors. | HARD |
| 13 | **BUG-FLEET-005** | Concurrency | Fleet / Subscriptions | Requires race condition in subscription limit check. | MEDIUM | Fleet owner exceeds subscription; billing errors. | HARD |
| 14 | **BUG-FIN-007** | Financial | Payments / Refunds | Requires currency conversion error (BDT vs. paisa). | CRITICAL | User receives excess refund; financial loss to platform. | HARD |
| 15 | **BUG-EMG-007** | Security/Fraud | Emergency / Ambulance | Requires certification revocation + stale cache. | CRITICAL | Patient receives unqualified service; legal risk. | HARD |
| 16 | **BUG-MOB-004** | Mobile/Network | Ride-hailing / Local Queue Replay | Requires client disconnect/reconnect + local queue replay. | HIGH | Duplicate payments, cancellations, etc. | HARD |
| 17 | **BUG-INFRA-002** | Infrastructure | Scheduler / Jobs | Requires scheduler job to process stale state. | HIGH | Ride state corrupted; billing errors. | HARD |
| 18 | **BUG-DATA-008** | Cross-Service | Ride → SOS → Emergency | Requires SOS failure + emergency notification failure. | CRITICAL | Delayed emergency response; patient at risk. | HARD |
| 19 | **BUG-FIN-009** | Retry/Idempotency | Payments / Callbacks | Requires payment callback retry after timeout. | CRITICAL | User charged twice; ledger/wallet mismatch. | HARD |
| 20 | **BUG-CORE-004** | Concurrency | Ride-hailing / Ride Lifecycle | Requires race condition between rider cancellation and ride start. | CRITICAL | Driver paid for cancelled ride; rider charged. | HARD |
| 21 | **BUG-MKT-002** | Concurrency | Marketplace / RFQs | Requires race condition in RFQ award logic. | HIGH | Suppliers confused; duplicate orders. | HARD |
| 22 | **BUG-EMG-002** | Concurrency | Emergency / Ambulance | Requires first-accept race between ambulances. | CRITICAL | Ambulances dispatched unnecessarily; patient confusion. | HARD |
| 23 | **BUG-INFRA-004** | Infrastructure | WebSocket / Events | Requires WebSocket reconnect + event replay. | HIGH | Duplicate actions (e.g., double payment). | HARD |
| 24 | **BUG-FLEET-003** | Concurrency | Fleet / Vehicle Assignment | Requires race condition in vehicle assignment. | HIGH | Vehicle overcommitted; driver conflict. | HARD |
| 25 | **BUG-MOB-005** | Mobile/Network | Ride-hailing / Server-Client Desync | Requires server to complete ride but client to think it failed. | HIGH | Duplicate rides; user charged twice. | HARD |
| 26 | **BUG-DATA-003** | Data Consistency | Marketplace / Inventory | Requires race condition in inventory updates. | HIGH | Overselling; customer dissatisfaction. | HARD |
| 27 | **BUG-FIN-006** | Financial | Wallet / Ledger | Requires failed refund reversal. | HIGH | User sees incorrect balance; accounting discrepancies. | HARD |
| 28 | **BUG-MKT-006** | Distributed/Async | Marketplace / Food Delivery | Requires stale order state after driver cancellation. | MEDIUM | Driver B receives incorrect order details. | HARD |
| 29 | **BUG-INFRA-008** | Infrastructure | Feature Flags | Requires stale feature flag cache. | HIGH | Inconsistent behavior across services. | HARD |
| 30 | **BUG-DATA-007** | Cross-Service | Order → Delivery → Payment | Requires payment failure after delivery. | HIGH | Inventory oversold; customer charged for undelivered item. | HARD |

---

---
---
## **4. SELF-CRITIQUE**

### **4.1 Potential Gaps in Coverage**
1. **Missing Subsystems**:
   - **Cross-vertical resource conflicts**: E.g., a driver simultaneously assigned to a **ride-hailing trip**, **food delivery**, and **emergency ambulance** request due to lack of global resource locking.
   - **Third-party integrations**: Failures in **map providers** (e.g., incorrect route calculations), **payment gateways** (e.g., partial refunds), or **SMS providers** (e.g., OTP delivery failures) not fully explored.
   - **Taxation edge cases**: Complex scenarios like **partial refunds**, **multi-leg rides with different tax jurisdictions**, or **promotions spanning tax periods**.
   - **Multi-tenancy in Fleet**: Conflicts between **fleet admins** and **platform admins** (e.g., fleet admin overrides platform-level restrictions).
   - **Driver device constraints**: E.g., **low battery**, **storage full**, or **app crashes** causing local state corruption.

2. **Races Not Covered**:
   - **Scheduler + WebSocket races**: E.g., a **scheduled job** updates ride state while a **WebSocket event** is being processed, leading to inconsistent client/server states.
   - **Payment webhook + ride state races**: E.g., payment webhook arrives **after** ride is marked as "completed," but **before** payout is processed, causing double payouts.
   - **Cache + database races**: E.g., cache invalidation for **fleet vehicle availability** fails while a **ride assignment** is in progress, leading to double assignments.
   - **Mobile app + server races**: E.g., client **retries a failed action** (e.g., ride cancellation) while the server **processes the original request**, causing duplicate cancellations.

3. **Financial Paths Not Explored**:
   - **Partial payments**: E.g., rider pays **50% of fare** due to wallet balance constraints, but system **marks ride as fully paid**.
   - **Currency conversion in multi-vertical transactions**: E.g., **ride fare in BDT**, **delivery fee in USD** (for international courier), leading to mismatched ledger entries.
   - **Promotion stacking**: E.g., rider applies **two promotions** to the same ride, but system **only validates one**, leading to excessive discounts.
   - **Driver earnings for multi-stop rides**: E.g., **waiting charges** and **detours** not correctly attributed to the ride’s total earnings.

4. **Cross-Service Interactions Not Mapped**:
   - **Ride → Marketplace**: E.g., a **ride-hailing driver** picks up a **food delivery order** mid-ride, but the **ride fare calculation** doesn’t account for the detour.
   - **Fleet → Emergency**: E.g., a **fleet vehicle** is assigned to an **emergency request**, but the **fleet’s subscription tier** doesn’t permit emergency services.
   - **Wallet → Subscriptions**: E.g., **wallet auto-top-up** fails during **subscription renewal**, causing service disruption.
   - **SOS → Fleet**: E.g., SOS triggered for a **fleet vehicle**, but the **fleet admin** is not notified due to **RBAC misconfiguration**.

5. **Security Cases Not Addressed**:
   - **Session fixation**: E.g., attacker **fixes a user’s session ID** before login, leading to session hijacking.
   - **JWT token manipulation**: E.g., modifying **JWT claims** (e.g., `role: admin`) to escalate privileges.
   - **Replay attacks on OTPs**: E.g., **OTP reuse** due to missing **one-time-use validation**.
   - **API rate limiting bypass**: E.g., attacker **distributes requests across IPs** to bypass rate limits on **payment endpoints**.

6. **Scheduler/Mobile Failures Not Considered**:
   - **Scheduler job timeouts**: E.g., a **long-running job** (e.g., monthly payout calculation) **times out**, leaving data in an inconsistent state.
   - **Mobile app crashes during critical actions**: E.g., app crashes **mid-payment**, but server **still processes the payment**.
   - **Background job failures in low-connectivity areas**: E.g., **ride completion sync** fails in rural areas, leading to **unpaid drivers**.
   - **Push notification throttling**: E.g., **SOS notifications** are **throttled** during high-load periods, delaying emergency responses.

7. **Edge Cases in Data**:
   - **Floating-point precision in fare calculations**: E.g., **rounding errors** in **distance-based fares** leading to **1 paisa discrepancies** over millions of rides.
   - **Timezone DST transitions**: E.g., **Bangladesh does not observe DST**, but **server assumes UTC DST rules**, causing **incorrect ride expirations**.
   - **Leap seconds/years**: E.g., **ride scheduled for Feb 29, 2024** (leap year) fails due to **date parsing errors**.
   - **Unicode in user data**: E.g., **Bangla characters in rider/driver names** causing **encoding errors** in notifications or receipts.

---

### **4.2 Potential Duplicates or Overlaps**
- **BUG-DISPATCH-001** (Concurrency in Dispatch) and **BUG-FLEET-001** (Concurrency in Fleet Assignment) both cover **double assignment** but in different contexts. These could be merged into a **general "resource double assignment"** bug with domain-specific triggers.
- **BUG-PAYMENT-003** (Duplicate Wallet Debit) and **BUG-FIN-009** (Duplicate Payment Callback) are similar but focus on different **payment flows**. Consider consolidating under a **"duplicate financial transaction"** category.
- **BUG-EMG-001** (Uncertified Ambulance) and **BUG-EMG-007** (Revoked Certification) both relate to **certification staleness**. Merge into a **single "stale certification"** bug with multiple triggers.
- **BUG-MOB-001** (Client Retries Ride Request) and **BUG-MOB-009** (Client Retries Payment) are **retry-related** and could be generalized into a **"client retry causing duplicates"** bug.

---
### **4.3 Recommendations for Improvement**
1. **Add a "Cross-Vertical Resource Conflicts" Section**:
   - Explicitly analyze scenarios where **one physical resource (driver/vehicle)** is eligible for **multiple services simultaneously** (e.g., ride-hailing + delivery + emergency).

2. **Expand Third-Party Integration Failures**:
   - Document **failure modes for map providers** (e.g., incorrect ETA, route errors), **payment gateways** (e.g., partial captures, failed refunds), and **SMS providers** (e.g., OTP delivery failures).

3. **Deep Dive into Taxation Edge Cases**:
   - Explore **multi-leg rides with different tax jurisdictions**, **promotions affecting taxable amounts**, and **refund tax implications**.

4. **Add Mobile-Specific Edge Cases**:
   - **App crashes**, **offline mode**, **background sync failures**, and **device-specific bugs** (e.g., iOS vs. Android differences).

5. **Include More Scheduler + Async Combos**:
   - E.g., **scheduler job processes a ride that was concurrently cancelled by a WebSocket event**, leading to **zombie ride states**.

6. **Security Hardening**:
   - Add **OWASP Top 10** scenarios (e.g., **SQL injection**, **XSS**, **CSRF**) tailored to the Ride platform’s **APIs and WebSockets**.

7. **Data Corruption Scenarios**:
   - E.g., **database transaction rollback failures**, **partial writes**, or **corrupted indexes** leading to **inconsistent queries**.

---
---
**Final Note**:
This catalogue is **theoretical** and designed to **guide incident investigations** or **codebase audits**. Every bug assumes **no mitigations exist** (e.g., locks, idempotency, retries). In practice, many may already be handled by the system’s design. **Verification against the actual codebase is mandatory**.