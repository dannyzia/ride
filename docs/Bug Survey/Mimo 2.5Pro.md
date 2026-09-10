# RIDE — INDEPENDENT POSSIBLE-BUG SURVEY

## Full Theoretical Bug Catalogue

---

### SECTION A: AUTHENTICATION, AUTHORIZATION & MULTI-TENANCY

**BUG-AUTH-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Auth / Session Management |
| **POSSIBLE BUG** | A user who logs in on a second device might have their first session invalidated, but pending operations (e.g., an active ride request, an in-progress order) initiated on the first device could continue executing against a now-expired session, potentially causing the user on the new device to see stale state or miss critical notifications meant for the "active" session. |
| **TRIGGER / SCENARIO** | Rider logs in on phone A, starts a ride request, then logs in on phone B. Phone A still has the ride request pending in the UI. The server associates the new WebSocket connection with phone B, but the ride is already in flight under phone A's session context. |
| **WHY IT IS PLAUSIBLE** | If session invalidation is not atomic with active-context migration (i.e., active rides/orders are not explicitly re-associated with the new session), the old session's context may be orphaned. |
| **IMPACT** | Rider on phone B may not receive real-time updates for the active ride; rider on phone A may receive updates on a supposedly-invalidated session. Notifications could be delivered to the wrong device. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Auth, WebSocket, Notifications, Ride lifecycle |

---

**BUG-AUTH-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Authorization / Business Logic |
| **SERVICE / MODULE** | Admin / RBAC |
| **POSSIBLE BUG** | If role permissions are checked at the API route level but not re-validated at the service/business-logic layer, an admin user whose role is downgraded or revoked mid-request might still complete an operation if the request was already past the authorization middleware when the change took effect. |
| **TRIGGER / SCENARIO** | Admin A initiates a bulk refund operation. Simultaneously, Admin B revokes Admin A's "refund" permission. The request from Admin A passes the initial authorization check but the permission change is committed before the actual refund logic executes. |
| **WHY IT IS PLAUSIBLE** | Authorization middleware and business logic may not share the same transaction boundary. |
| **IMPACT** | Unauthorized financial operation completed. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Admin, RBAC, Wallet, Payments, Audit |

---

**BUG-AUTH-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Concurrency |
| **SERVICE / MODULE** | Auth / OTP |
| **POSSIBLE BUG** | If OTP validation does not atomically consume the OTP (mark it as used and verify it in the same operation), a race condition where the same OTP is submitted twice rapidly could allow both requests to succeed, potentially logging in two sessions or completing two verifications. |
| **TRIGGER / SCENARIO** | User receives OTP, submits it on phone. Network is slow, user taps again. Two requests hit the server nearly simultaneously. Both read OTP as "valid" before either marks it "consumed." |
| **WHY IT IS PLAUSIBLE** | Read-then-write race without proper atomic check-and-invalidate. |
| **IMPACT** | Duplicate login sessions; potential account takeover if OTP window is exploited programmatically. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Auth, Session |

---

**BUG-AUTH-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Business Logic |
| **SERVICE / MODULE** | Auth / Multi-Tenancy |
| **POSSIBLE BUG** | If tenant isolation is enforced via middleware that injects a tenant ID from the authenticated user's context, but certain admin/system-level APIs bypass this middleware (e.g., bulk operations, scheduler-triggered endpoints), a request could inadvertently operate on records belonging to a different tenant. |
| **TRIGGER / SCENARIO** | A scheduler job triggers an API endpoint to process pending payouts. The endpoint assumes a system-level context with no tenant filter. It processes payouts for all tenants instead of the intended one. |
| **WHY IT IS PLAUSIBLE** | Internal/system endpoints often bypass tenant-scoping middleware because they run as "trusted" contexts. |
| **IMPACT** | Cross-tenant data leakage or financial operations on wrong tenant's data. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Fleet, Admin, Payouts, Ledger |

---

**BUG-AUTH-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Auth / Driver Onboarding |
| **POSSIBLE BUG** | A driver who is rejected during document verification might have their account status set to "rejected," but if the driver simultaneously submits updated documents, a race could allow the new documents to be processed while the rejection flow is still executing, potentially resulting in an inconsistent state where the driver is both "rejected" and "verified." |
| **TRIGGER / SCENARIO** | Admin rejects driver documents. Driver resubmits documents at the same moment. The document upload handler and rejection handler run concurrently. |
| **WHY IT IS PLAUSIBLE** | Two independent operations modifying the same driver status without a coordinating lock. |
| **IMPACT** | Driver with rejected documents could become eligible to accept rides. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Driver management, Dispatch, Trust & Safety |

---

### SECTION B: DRIVER LIFECYCLE, AVAILABILITY & SESSIONS

**BUG-DRIVER-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine / Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Driver Session |
| **POSSIBLE BUG** | A driver toggling "online" rapidly (or going online on two devices simultaneously) could create two overlapping sessions, each thinking the driver is the active session. This could cause the driver to receive duplicate ride requests or to appear as two available drivers in the matching system. |
| **TRIGGER / SCENARIO** | Driver taps "Go Online" on phone, then immediately force-closes the app and opens it again on the same phone (or a different device). The first session hasn't been cleaned up yet. Two session records exist with the same driver. |
| **WHY IT IS PLAUSIBLE** | If going online is not idempotent or if session cleanup uses a heartbeat-timeout rather than an atomic claim, overlapping sessions could coexist for a window. |
| **IMPACT** | Driver receives duplicate requests; appears twice in dispatch matching; could accept the same ride from two sessions. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Driver Session, Dispatch, Matching, WebSocket |

---

**BUG-DRIVER-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Availability |
| **POSSIBLE BUG** | If a driver's availability status is determined by checking their current ride state, but a ride was just completed (state update in progress), a matching request arriving during the transition could treat the driver as either available or unavailable depending on which read wins, leading to the driver being assigned a new ride before they've properly finished the previous one (e.g., before payment is finalized). |
| **TRIGGER / SCENARIO** | Driver completes ride. Payment callback is processing. New dispatch request comes in. Dispatch checks driver availability. The ride status is "completing" but not yet "completed." Dispatch treats driver as unavailable—but the payment callback fails and the ride rolls back to "active." Now the driver is stuck in a ride that should be over and misses new requests. |
| **WHY IT IS PLAUSIBLE** | Multi-step completion (ride end → payment → update status → notify) creates a window where the ride is in an intermediate state. |
| **IMPACT** | Driver stuck in limbo; lost revenue; potential double-assignment if a second dispatch interprets the state differently. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ride lifecycle, Dispatch, Payment, Driver session |

---

**BUG-DRIVER-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Ride-hailing / Driver Account |
| **POSSIBLE BUG** | A driver who is suspended by admin while they have an active ride could have the suspension applied immediately, preventing the driver from completing ride-related actions (like marking arrival, ending ride) but not automatically ending the ride, leaving both rider and driver in a broken state. |
| **TRIGGER / SCENARIO** | Admin suspends a driver for a policy violation. The driver is currently mid-ride. The suspension handler sets the driver's status to "suspended" but doesn't account for in-progress rides. |
| **WHY IT IS PLAUSIBLE** | Account status and ride lifecycle may be managed by different systems or handlers without cross-referencing in-progress state. |
| **IMPACT** | Rider stranded mid-trip; ride stuck in active state indefinitely; potential safety issue. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Driver management, Ride lifecycle, Trust & Safety, Rider experience |

---

**BUG-DRIVER-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Driver Ratings |
| **POSSIBLE BUG** | If driver ratings are calculated as a running average and a ride is later refunded/voided (e.g., due to a complaint), the rider's rating may still be included in the driver's average if the rating recalculation is not triggered by the refund event. |
| **TRIGGER / SCENARIO** | Rider gives driver 1-star after a bad experience. Later, the ride is fully refunded. The 1-star rating remains in the driver's average because no recalculation was triggered. |
| **WHY IT IS PLAUSIBLE** | Rating calculation and ride status management may be loosely coupled. |
| **IMPACT** | Driver unfairly penalized; inaccurate rating; potential deactivation based on stale data. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Ratings, Ride lifecycle, Driver management |

---

**BUG-DRIVER-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Driver Location |
| **POSSIBLE BUG** | If a driver's location is used for both matching (H3 cell lookup) and fare calculation (distance tracking), but the location update frequency differs between the two systems, the H3 cell used for matching could be different from the actual location used for fare calculation, leading to situations where a driver is matched based on one location but the fare is calculated from another. |
| **TRIGGER / SCENARIO** | Driver is at the edge of an H3 cell. Location updates arrive every few seconds. The dispatch system reads location at time T1 (cell A), but the fare calculation system reads at time T2 (cell B). The driver is matched as being in cell A but fare uses cell B's distance. |
| **WHY IT IS PLAUSIBLE** | Different consumers of location data may read at different times, creating temporal inconsistency. |
| **IMPACT** | Incorrect fare; driver matched for a ride they shouldn't get (wrong zone); rider charged more or less than expected. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Location, Dispatch, Fare calculation, H3 |

---

### SECTION C: DISPATCH, MATCHING & RIDE REQUEST

**BUG-DISPATCH-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Dispatch |
| **POSSIBLE BUG** | Two riders could be matched to the same driver simultaneously if the dispatch system sends ride offers to multiple nearby drivers and the driver's "accepted" response is processed without checking whether the driver has already been assigned to another ride that was accepted in the same dispatch cycle. |
| **TRIGGER / SCENARIO** | Dispatch system broadcasts ride offer to drivers A, B, C. Driver A accepts at time T1. Driver B accepts at time T1 (same millisecond). Both acceptance handlers read the ride as "offered" (not yet assigned) and both succeed in assigning themselves. |
| **WHY IT IS PLAUSIBLE** | If the assignment operation is not atomic (read ride status → check it's still offered → assign driver), a TOCTOU race could allow double assignment. |
| **IMPACT** | Two riders assigned to the same driver; one rider will experience a no-show or cancellation; driver confused. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Dispatch, Ride lifecycle, Driver session, Rider experience |

---

**BUG-DISPATCH-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / Stale Data |
| **SERVICE / MODULE** | Ride-hailing / Auto-Redispatch |
| **POSSIBLE BUG** | When a driver declines or times out a ride offer and auto-redispatch kicks in, the new dispatch batch could include drivers who were also in the first batch but haven't responded yet (their timeout hasn't expired). This could result in the same ride offer being sent to a driver twice, or a driver receiving a second offer while they're still considering the first. |
| **TRIGGER / SCENARIO** | Ride offered to drivers A, B, C. Driver A declines immediately. Auto-redispatch triggers. The system looks for nearby available drivers again. Drivers B and C haven't responded yet and are still "available." They get the offer again. Now B has two pending offers for the same ride. |
| **WHY IT IS PLAUSIBLE** | If the auto-redispatch doesn't track which drivers already have a pending offer for this ride, or if the "available" check doesn't exclude drivers with pending offers. |
| **IMPACT** | Confused drivers; duplicate offer processing; potential double acceptance from different offer instances. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Dispatch, Matching, Driver experience |

---

**BUG-DISPATCH-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Dispatch / PIN |
| **POSSIBLE BUG** | If the ride PIN is generated and associated with the ride when the driver accepts, but the driver's acceptance can be processed twice (due to a network retry or UI double-tap), two different rides could end up with the same PIN (if PINs are generated from a non-unique seed like timestamp), or the same ride could have its PIN regenerated, causing the driver's copy to be stale. |
| **TRIGGER / SCENARIO** | Driver accepts ride; PIN "4523" generated. Network timeout. Client retries accept. Server processes accept again, generates new PIN "7891" and overwrites the original. Driver's UI still shows "4523." Rider has "7891." |
| **WHY IT IS PLAUSIBLE** | Non-idempotent accept handler that regenerates state on each invocation. |
| **IMPACT** | Driver and rider have mismatched PINs; ride cannot start; driver may need to cancel; poor experience. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Dispatch, Ride lifecycle, Client-server sync |

---

**BUG-DISPATCH-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Race Condition / Safety |
| **SERVICE / MODULE** | Ride-hailing / Auto-Accept |
| **POSSIBLE BUG** | If a driver has auto-accept enabled and receives a ride while they are manually navigating through the app (e.g., checking earnings), the auto-accept could trigger without the driver being aware, and if the driver then manually interacts with the ride offer UI (thinking they need to accept), their manual tap could conflict with the auto-accept, potentially causing duplicate state transitions or a "cancelled" response from the manual interaction overriding the "accepted" state. |
| **TRIGGER / SCENARIO** | Auto-accept fires and assigns ride. Driver, unaware, taps "decline" on the stale offer screen. Decline handler fires on an already-assigned ride. |
| **WHY IT IS PLAUSIBLE** | Auto-accept and manual UI interactions are independent flows with no coordination on the client side. |
| **IMPACT** | Ride could be cancelled after assignment; rider gets a notification then a cancellation; driver loses a ride. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Auto-accept, Ride lifecycle, Rider experience |

---

**BUG-DISPATCH-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Location |
| **SERVICE / MODULE** | Ride-hailing / Matching |
| **POSSIBLE BUG** | If the matching system uses H3 cells to find nearby drivers but the driver's last-reported H3 cell is stale (e.g., driver stopped updating location because app is backgrounded), the driver could be matched to a ride that is actually far from their current real location, causing very long pickup times or the driver declining because they've moved. |
| **TRIGGER / SCENARIO** | Driver's phone was in background for 5 minutes; last known H3 cell is reported. Driver has actually driven 3km away. Dispatch matches based on stale H3 cell. |
| **WHY IT IS PLAUSIBLE** | Background location updates on mobile are unreliable, especially on Android with battery optimization. |
| **IMPACT** | Poor rider experience (long wait); wasted dispatch cycle; driver may cancel, incurring rating penalty. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Location, Dispatch, Matching, H3, Rider/Driver experience |

---

**BUG-DISPATCH-006**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Ride-hailing / Scheduled Rides |
| **POSSIBLE BUG** | A scheduled ride that is assigned to a driver could become "stuck" if the driver goes offline or is deactivated between assignment and the scheduled pickup time. If the scheduler only checks at the scheduled time (not monitoring driver availability in the interim), the ride could attempt dispatch to an unavailable driver at pickup time, wasting critical minutes before redispatching. |
| **TRIGGER / SCENARIO** | Ride scheduled for 8 AM, assigned to Driver X at 7 AM. At 7:30 AM, Driver X goes offline (app crash, network loss). At 8:00 AM, scheduler tries to activate the ride, sends request to Driver X, who doesn't respond. Timeout after 60 seconds. Redispatch at 8:01 AM. Rider has been waiting. |
| **WHY IT IS PLAUSIBLE** | Scheduled ride assignment and driver availability monitoring are likely separate processes. |
| **IMPACT** | Rider late for appointment; poor experience; potential cancellation. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Scheduled rides, Dispatch, Driver session, Scheduler |

---

### SECTION D: RIDE LIFECYCLE & STATE MACHINE

**BUG-RIDE-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine / Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Ride Completion |
| **POSSIBLE BUG** | If a ride is completed (driver ends ride) at the exact same moment the rider initiates a cancellation (e.g., rider taps cancel just as driver ends the ride), the ride could end up in a state that is both "completed" and "cancelled," or the cancellation flow could trigger a refund on a ride that has already been billed. |
| **TRIGGER / SCENARIO** | Driver taps "End Ride" at T1. Rider taps "Cancel" at T1. Both requests hit the server. Ride status is read as "active" by both handlers. One sets it to "completed," the other to "cancelled." |
| **WHY IT IS PLAUSIBLE** | Race condition on ride status field without proper mutual exclusion. |
| **IMPACT** | Ride completed but cancellation refund issued; financial loss. Or ride cancelled but driver has already completed the trip; driver loses earnings. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ride lifecycle, Payment, Wallet, Driver earnings |

---

**BUG-RIDE-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / No-Show |
| **POSSIBLE BUG** | The no-show timer starts when the driver arrives, but if the driver's "arrival" is marked based on GPS proximity detection (being within X meters of pickup), the driver could be marked as arrived while still on a parallel road or in a different part of a large building complex. The no-show timer starts ticking, and if the rider can't find the driver within the window, they could be charged a no-show fee despite being at the correct location. |
| **TRIGGER / SCENARIO** | Pickup at a large mall. Driver GPS shows them as "arrived" because they're within 50 meters, but they're on the street behind the mall. Rider is at the mall entrance. Rider can't find driver. No-show timer expires. Rider charged. |
| **WHY IT IS PLAUSIBLE** | GPS-based arrival detection has inherent accuracy limitations, especially in urban areas with tall buildings. |
| **IMPACT** | Rider unfairly charged no-show fee; disputes; refund requests; bad ratings. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Ride lifecycle, GPS, Fare, Disputes |

---

**BUG-RIDE-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Ride-hailing / Cancellation |
| **POSSIBLE BUG** | If a rider cancels after the driver has started driving toward pickup but before the driver marks "arrived," the cancellation fee calculation might use the distance from the driver's current location (at cancellation time) to the pickup point. But if the driver's location is updated asynchronously and the fee calculation reads a stale location, the fee could be incorrect (too high or too low). |
| **TRIGGER / SCENARIO** | Rider cancels. Fee handler queries driver's location. The location service returns a cached/stale position from 30 seconds ago. Driver was actually closer to pickup than the cached position suggests. Fee is calculated as higher than it should be. |
| **WHY IT IS PLAUSIBLE** | Location updates are pushed from the mobile client; the server-side location cache may lag. |
| **IMPACT** | Incorrect cancellation fee charged to rider; dispute; potential overcharge. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Cancellation, Fare, Location, Wallet |

---

**BUG-RIDE-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Multi-Stop |
| **POSSIBLE BUG** | In a multi-stop ride, if the rider adds a stop after the ride has started, the fare recalculation might not properly account for the original route vs. the new route. If the fare was pre-estimated based on the original stops, adding a new stop could cause the final fare to either not update (undercharging) or to double-count segments (overcharging). |
| **TRIGGER / SCENARIO** | Rider books A→B→C. Fare estimated at 200 BDT. Mid-ride, rider adds stop D between B and C. If the fare is recalculated from scratch (A→B→D→C), it should be 280 BDT. But if the system just adds the D→C segment to the original fare, it might charge 200 + 100 = 300 BDT (overcharging the B→D segment overlap). |
| **WHY IT IS PLAUSIBLE** | Incremental fare updates vs. full recalculation is a common source of inconsistency. |
| **IMPACT** | Overcharged or undercharged rider; fare disputes. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Multi-stop, Fare calculation, Route, Payment |

---

**BUG-RIDE-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Cancellation |
| **POSSIBLE BUG** | Both rider and driver could attempt to cancel the ride simultaneously. If both cancellations are processed, the ride could have its cancellation reason overwritten (the second cancellation's reason replaces the first), leading to incorrect attribution for who cancelled and therefore incorrect cancellation fee logic. |
| **TRIGGER / SCENARIO** | Rider taps "cancel" and driver taps "cancel" at nearly the same time. Both requests pass authorization. First handler sets ride to "cancelled by rider." Second handler overwrites to "cancelled by driver." The cancellation fee (charged to rider for rider-initiated cancellation) is now incorrectly not charged because the system thinks the driver cancelled. |
| **WHY IT IS PLAUSIBLE** | Race condition on the cancellation handler; the "who cancelled" determination may not be atomic with the state transition. |
| **IMPACT** | Incorrect cancellation fees; financial discrepancy; one party unfairly charged or credited. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ride lifecycle, Cancellation, Fees, Wallet |

---

**BUG-RIDE-006**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Ride-hailing / SOS |
| **POSSIBLE BUG** | If a rider triggers SOS during a ride and the SOS handler attempts to notify emergency contacts and authorities while the ride is still active, but the driver simultaneously cancels the ride (perhaps because they panic), the SOS could lose its reference to the active ride, making it difficult for responders to locate the rider. |
| **TRIGGER / SCENARIO** | Rider triggers SOS. Ride is "active." Driver, realizing SOS was triggered, cancels the ride (or the ride times out). SOS notification includes ride ID. Response team looks up ride ID → ride is now "cancelled." Location data associated with the ride may be incomplete or the ride's location tracking may have stopped. |
| **WHY IT IS PLAUSIBLE** | SOS and ride lifecycle are likely managed by different handlers. |
| **IMPACT** | Emergency responders lose critical location data; safety risk. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | VERY LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | SOS, Ride lifecycle, Emergency, Location |

---

### SECTION E: FARE CALCULATION & PRICING

**BUG-FARE-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Fare |
| **POSSIBLE BUG** | If fare calculation uses the road distance from a map/routing API but the routing API occasionally returns a straight-line (Euclidean) distance as a fallback when it fails to compute route distance, the fare could be significantly different from expected, especially in areas with rivers or highways where road distance differs greatly from straight-line distance (very relevant in Bangladesh with its many rivers). |
| **TRIGGER / SCENARIO** | Routing API is slow or returns an error. Fallback uses straight-line distance. A 5km road distance becomes 2km straight-line across a river. Fare calculated at half the expected amount. |
| **WHY IT IS PLAUSIBLE** | External API failures with degraded fallback are common. |
| **IMPACT** | Significant fare undercharging (or overcharging if the straight-line is longer than the road route, e.g., around a lake). |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fare, Routing, Map API, Revenue |

---

**BUG-FARE-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Concurrency |
| **SERVICE / MODULE** | Ride-hailing / Surge Pricing |
| **POSSIBLE BUG** | If surge pricing is calculated at ride request time but applied at ride completion time, and the surge multiplier changes during the ride (e.g., a high-demand period ends mid-trip), the rider could be charged a different amount than what was quoted. If the system is supposed to lock the surge at request time but reads the current surge at completion, this creates a mismatch. |
| **TRIGGER / SCENARIO** | Rider requests ride at 6 PM during surge (1.5x). Quoted fare: 300 BDT. Ride takes 30 minutes. At 6:20 PM, demand drops, surge goes to 1.0x. At 6:30 PM, ride completes. Fare calculated at 1.0x: 200 BDT. Rider pays 200 but was quoted 300. Or worse: surge increases during ride and rider pays more than quoted. |
| **WHY IT IS PLAUSIBLE** | Surge pricing may be recalculated at different points in the lifecycle depending on implementation. |
| **IMPACT** | Rider charged more or less than quoted; trust erosion; regulatory issues. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fare, Surge, Payment, Rider trust |

---

**BUG-FARE-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Waiting Charges |
| **POSSIBLE BUG** | If waiting charges are calculated based on the time between driver arrival and ride start, but the driver's "arrival" is marked when their GPS enters the pickup zone (not when they physically stop), the waiting time could include the driver's own time finding the exact pickup spot, unfairly charging the rider for the driver's navigation time. |
| **TRIGGER / SCENARIO** | Driver GPS enters 50m radius of pickup → "arrived" status. Driver actually spends 3 minutes circling to the correct entrance. Rider is ready and waiting at the entrance. Rider charged 3 minutes of waiting time. |
| **WHY IT IS PLAUSIBLE** | GPS-based arrival is imprecise; the "arrived" event doesn't mean the driver is ready. |
| **IMPACT** | Unfair waiting charges; rider disputes; poor experience. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Fare, Waiting charges, GPS, Ride lifecycle |

---

**BUG-FARE-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Fare / Passes |
| **POSSIBLE BUG** | If a rider applies a pass (e.g., "10 rides at 20% discount") and the ride is later partially refunded (e.g., due to a route complaint), the pass usage might not be correctly adjusted. The pass could either: (a) still count the refunded ride as a used ride (burning one of the 10), or (b) restore the pass credit but not restore the correct discount amount for the next ride. |
| **TRIGGER / SCENARIO** | Rider uses pass for ride #5. Gets 20% off. Later, admin refunds 50% of the ride fare. Pass still shows ride #5 as consumed. Rider effectively lost a pass ride and only got a partial refund instead of a full one + pass restoration. |
| **WHY IT IS PLAUSIBLE** | Pass consumption and refund handling are likely separate systems. |
| **IMPACT** | Rider loses pass benefits on a refunded ride; financial unfairness. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Passes, Fare, Refunds, Wallet |

---

**BUG-FARE-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Promotions |
| **POSSIBLE BUG** | If promotions/coupons are validated at ride request time but applied at fare settlement time, and the promotion expires between these two points (e.g., a promotion valid until midnight, ride starts at 11:50 PM and completes at 12:10 AM), the discount might either: (a) not be applied (rider loses the discount), or (b) be applied on an expired promotion (company loses money). |
| **TRIGGER / SCENARIO** | Coupon valid until 2024-12-31 23:59:59. Rider applies it at 23:55. Ride completes at 00:05 (next day). Settlement handler checks coupon validity → expired. No discount applied. Rider was told they'd get 20% off. |
| **WHY IT IS PLAUSIBLE** | Validation at request time vs. application at settlement time creates a time gap. |
| **IMPACT** | Rider promised a discount but doesn't receive it; disputes; poor experience. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Promotions, Fare, Payment, Customer service |

---

**BUG-FARE-006**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Tips |
| **POSSIBLE BUG** | If tips can be added both during ride completion (pre-tip) and after the ride (post-tip), and the rider adds a tip during completion that is then also duplicated by an automatic post-ride prompt, the rider could be charged the tip twice. |
| **TRIGGER / SCENARIO** | Rider adds 50 BDT tip when tapping "End Ride." A post-ride "rate your driver" screen also shows a tip option. Rider taps 50 BDT again (thinking it's the same tip, or the pre-tip didn't register on the client). Two 50 BDT charges. |
| **WHY IT IS PLAUSIBLE** | Two independent tip mechanisms without idempotency key. |
| **IMPACT** | Rider double-charged for tips; refund required; bad experience. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Tips, Payment, Wallet, Rider experience |

---

**BUG-FARE-007**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Ride-hailing / Pickup Fee |
| **POSSIBLE BUG** | If a pickup fee is applied based on the pickup zone (using H3 cell lookup), but the rider's pickup pin is placed right on a zone boundary, small GPS variations could cause the pickup to be classified in different zones with different fee structures across requests, leading to inconsistent pickup fees for essentially the same location. |
| **TRIGGER / SCENARIO** | Rider requests ride from a spot on the border between Zone A (50 BDT pickup fee) and Zone B (30 BDT pickup fee). GPS jitter places them in Zone A one day, Zone B the next. Rider notices different fees for the same location. |
| **WHY IT IS PLAUSIBLE** | GPS precision is ~3-10 meters; H3 cells at relevant resolutions have boundaries that GPS jitter can cross. |
| **IMPACT** | Inconsistent pricing; rider confusion; disputes. |
| **SEVERITY** | LOW |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fare, H3, Zone pricing, Location |

---

### SECTION F: PAYMENT, WALLET & FINANCIAL

**BUG-PAY-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Retry / Idempotency |
| **SERVICE / MODULE** | Payment / Wallet Top-up |
| **POSSIBLE BUG** | If a wallet top-up via an external payment gateway (e.g., bKash, Nagad) involves a callback/webhook from the gateway to confirm payment, and the webhook is delivered twice (common in payment gateways), the wallet could be credited twice for a single payment if the webhook handler doesn't implement idempotency. |
| **TRIGGER / SCENARIO** | User tops up 1000 BDT via bKash. bKash sends confirmation webhook. Network issues cause bKash to retry the webhook. Both webhooks are processed. Wallet credited 1000 + 1000 = 2000 BDT. User only paid 1000 BDT. |
| **WHY IT IS PLAUSIBLE** | Payment gateway webhooks are notoriously prone to retries; idempotency is critical but often implemented incorrectly (e.g., using the gateway's transaction ID which might change between retries, or using a timestamp-based key). |
| **IMPACT** | Financial loss; wallet credited with phantom money. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Payment, Wallet, Ledger, Financial reporting |

---

**BUG-PAY-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial / State Machine |
| **SERVICE / MODULE** | Payment / Ride Settlement |
| **POSSIBLE BUG** | If a ride payment fails (e.g., wallet insufficient, card declined) but the ride has already been marked as "completed" by the driver, the ride could be stuck in a "completed but unpaid" state. If there's no retry or escalation mechanism, the rider owes money but has no way to pay for the completed ride, and the driver's earnings are not credited. |
| **TRIGGER / SCENARIO** | Ride completes. Driver taps "End Ride." System tries to charge rider's wallet. Wallet balance is insufficient (rider's balance was checked at ride start but a concurrent deduction happened). Payment fails. Ride is "completed" but payment is "failed." No automatic retry. Driver doesn't get paid. |
| **WHY IT IS PLAUSIBLE** | Wallet balance check and ride completion may not be in the same transaction; balance can change between check and deduction. |
| **IMPACT** | Driver not paid; rider has unpaid debt; potential account suspension; dispute. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Payment, Wallet, Ride lifecycle, Driver earnings |

---

**BUG-PAY-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial / Concurrency |
| **SERVICE / MODULE** | Wallet / Double-Entry Accounting |
| **POSSIBLE BUG** | If wallet operations (credit and debit) are not performed atomically within a single transaction, a system crash or timeout between the credit entry and the corresponding debit entry could leave the ledger in an unbalanced state, with money either created from nothing or destroyed. |
| **TRIGGER / SCENARIO** | Rider pays for ride: debit rider wallet (succeeds), credit driver wallet (fails due to timeout). The debit is committed but the credit never happens. Rider's money is deducted but driver doesn't receive it. Money is "lost" in the system. |
| **WHY IT IS PLAUSIBLE** | Double-entry requires both entries in the same atomic transaction. If implemented as two separate operations, failure between them breaks the accounting invariant. |
| **IMPACT** | Ledger imbalance; money lost; accounting reconciliation failures; audit issues. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Wallet, Ledger, Accounting, Financial reporting |

---

**BUG-PAY-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Financial |
| **SERVICE / MODULE** | Wallet / Concurrent Operations |
| **POSSIBLE BUG** | If a wallet has 500 BDT and two ride payments of 400 BDT each are processed simultaneously (e.g., rider has two active rides on different platforms/tenants, or a race between a ride payment and a withdrawal), both could pass the "sufficient balance" check before either deducts, leading to the wallet going negative. |
| **TRIGGER / SCENARIO** | Two rides complete at the same time. Both payment handlers read wallet balance = 500 BDT. Both determine sufficient funds. Both deduct 400. Final balance = 500 - 400 - 400 = -300 BDT. |
| **WHY IT IS PLAUSIBLE** | Classic read-then-write race condition on wallet balance without proper locking or optimistic concurrency control. |
| **IMPACT** | Negative wallet balance; phantom money spent; financial loss. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Wallet, Payment, Ledger |

---

**BUG-PAY-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial / Business Logic |
| **SERVICE / MODULE** | Payment / Refunds |
| **POSSIBLE BUG** | If a refund is processed but the refund amount is calculated based on the current fare (which may have been adjusted by promotions, surge changes, or corrections) rather than the original amount paid by the rider, the refund could be incorrect. Additionally, if a partial refund is issued and later a full refund is also authorized (e.g., by a different admin or through a dispute process), the rider could receive more than they originally paid. |
| **TRIGGER / SCENARIO** | Rider paid 200 BDT. Complains. Admin issues 100 BDT partial refund. Later, rider escalates. Different admin issues full 200 BDT refund (not aware of the partial). Rider receives 100 + 200 = 300 BDT back, netting +100 BDT. |
| **WHY IT IS PLAUSIBLE** | Refund tracking may not aggregate partial refunds; total refund may not be checked against original payment. |
| **IMPACT** | Over-refund; financial loss; abuse vector. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Refunds, Payment, Admin, Wallet, Ledger |

---

**BUG-PAY-006**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial / Cross-Service |
| **SERVICE / MODULE** | Payment / Wallet / Promotions |
| **POSSIBLE BUG** | If a ride is paid for using a combination of promotion credits and wallet balance, and the ride is later refunded, the refund might incorrectly credit the full amount to the wallet instead of restoring the promotion credits and wallet balance separately. The rider could convert non-cash promotion credits into withdrawable cash. |
| **TRIGGER / SCENARIO** | Ride costs 200 BDT. 50 BDT from promotion, 150 BDT from wallet. Ride is refunded. System credits 200 BDT to wallet. Rider now has 200 BDT in wallet instead of 150 + 50 promotion credit. If promotions have restrictions (e.g., not withdrawable), this is an exploit. |
| **WHY IT IS PLAUSIBLE** | Refund logic may not decompose the original payment sources. |
| **IMPACT** | Promotion credits laundered into cash; financial loss; fraud vector. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Promotions, Wallet, Refunds, Payment |

---

**BUG-PAY-007**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial |
| **SERVICE / MODULE** | Payment / Tax |
| **POSSIBLE BUG** | If tax (e.g., VAT) is calculated on the pre-discount fare but applied to the post-discount fare, or vice versa, the tax amount charged to the rider could be inconsistent with what is remitted to the government. If the tax calculation and the fare calculation read different base amounts (e.g., one includes surge, the other doesn't), the tax could be wrong. |
| **TRIGGER / SCENARIO** | Fare = 500 BDT. Discount = 100 BDT. VAT should be 15% on 400 BDT = 60 BDT. But tax module reads fare as 500 BDT (pre-discount) and charges 75 BDT VAT. Or fare module reads 400 BDT but tax module applies 15% on 500 BDT. |
| **WHY IT IS PLAUSIBLE** | Tax calculation and fare calculation are likely separate modules reading from potentially different data sources. |
| **IMPACT** | Overcharged or undercharged tax; compliance risk; financial discrepancies. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Tax, Fare, Payment, Compliance |

---

**BUG-PAY-008**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Retry / Financial |
| **SERVICE / MODULE** | Payment / Wallet Withdrawal |
| **POSSIBLE BUG** | If a driver requests a wallet withdrawal to their bank/mobile money account, and the external disbursement API times out, the system might retry the disbursement. If the first attempt actually succeeded (but the confirmation was lost), the retry could result in a double disbursement — the driver receives money twice while the wallet is only debited once (or twice). |
| **TRIGGER / SCENARIO** | Driver requests 5000 BDT withdrawal to bKash. System sends disbursement request to bKash. bKash processes it but the confirmation response times out. System retries. bKash processes the second request too (if not idempotent on their end). Driver receives 10,000 BDT. |
| **WHY IT IS PLAUSIBLE** | External payment API retries without proper idempotency are a classic source of double payments. |
| **IMPACT** | Double disbursement; financial loss; recovery may be difficult. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Wallet, Payment, Disbursement, External APIs |

---

**BUG-PAY-009**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Financial / State Machine |
| **SERVICE / MODULE** | Payment / Earnings |
| **POSSIBLE BUG** | If driver earnings are calculated when a ride completes but the ride's fare is later adjusted (e.g., due to a route correction, dispute resolution, or admin adjustment), the driver's earnings ledger might not be updated to reflect the fare change, leading to the driver retaining earnings from a fare that was subsequently reduced. |
| **TRIGGER / SCENARIO** | Ride completes. Fare = 500 BDT. Driver's commission = 400 BDT (80%). Earnings credited. Later, admin adjusts fare to 300 BDT due to route dispute. Driver should now get 240 BDT. But earnings ledger still shows 400 BDT. |
| **WHY IT IS PLAUSIBLE** | Earnings ledger update and fare adjustment are separate events; there may be no listener for fare adjustments. |
| **IMPACT** | Driver overpaid; platform loss; accounting imbalance. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Earnings, Fare adjustment, Ledger, Accounting |

---

**BUG-PAY-010**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Financial |
| **SERVICE / MODULE** | Wallet / Ledger |
| **POSSIBLE BUG** | If the wallet balance is stored in a separate cache/redis layer from the ledger database, and a write to the ledger succeeds but the cache update fails (or is delayed), subsequent reads of the wallet balance (from cache) would return a stale amount. A withdrawal request could be approved based on the cached (higher) balance when the actual ledger balance is lower. |
| **TRIGGER / SCENARIO** | Ledger balance = 100 BDT after ride payment deduction. Cache still shows 500 BDT (pre-deduction). Driver requests 400 BDT withdrawal. Cache check: 500 ≥ 400 → approved. Ledger deduction: 100 - 400 = -300. |
| **WHY IT IS PLAUSIBLE** | Cache-stale-after-write is a classic distributed systems problem. |
| **IMPACT** | Wallet goes negative; phantom withdrawal; financial loss. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Wallet, Cache, Ledger, Payment |

---

### SECTION G: LOCATION, GEO & ZONE MANAGEMENT

**BUG-LOC-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Integrity |
| **SERVICE / MODULE** | Location / H3 |
| **POSSIBLE BUG** | If the H3 resolution used for matching is different from the H3 resolution used for zone pricing, a driver at a location could be in the same cell for matching purposes but in different cells for pricing purposes, or vice versa. This could lead to a driver being matched to a ride in one zone but the fare being calculated based on a different zone's rates. |
| **TRIGGER / SCENARIO** | H3 resolution 7 used for matching, resolution 9 for pricing. Driver is at a location where the resolution-7 cell spans two resolution-9 pricing zones. Matching treats driver as being in Zone A. Fare uses resolution-9 and determines pickup is in Zone B (different rates). |
| **WHY IT IS PLAUSIBLE** | Different H3 resolutions create different cell boundaries; using inconsistent resolutions across systems creates spatial mismatches. |
| **IMPACT** | Incorrect fare; zone mismatch; driver/rider confusion. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | H3, Fare, Zone, Dispatch |

---

**BUG-LOC-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security |
| **SERVICE / MODULE** | Location / GPS |
| **POSSIBLE BUG** | If the system does not validate that driver location updates are physically plausible (i.e., the distance between consecutive updates divided by the time between them implies a reasonable speed), a driver could spoof their GPS location to appear closer to a pickup point, get matched first, and then "teleport" back to their real location, causing long wait times. Conversely, a driver could spoof location to avoid being matched in certain zones. |
| **TRIGGER / SCENARIO** | Driver uses a GPS spoofing app. Reports location at pickup point. Gets matched. Rider waits. Driver's real location is 5km away. Driver then reports "real" location and drives to pickup. Or driver reports being in a low-demand zone to avoid being matched, staying "offline" to the matching system while actually being available. |
| **WHY IT IS PLAUSIBLE** | GPS spoofing is trivial on most Android devices; without server-side plausibility checks, the system trusts client-reported coordinates. |
| **IMPACT** | Gaming the dispatch system; poor rider experience; potential fraud (accepting rides and then cancelling to collect cancellation fees). |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Location, Dispatch, Trust & Safety, Fairness |

---

**BUG-LOC-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Location |
| **SERVICE / MODULE** | Location / Zone Boundaries |
| **POSSIBLE BUG** | In Bangladesh, many locations are near rivers. If zone boundaries follow H3 cells that span rivers, a rider requesting a ride from one bank could be matched with a driver on the other bank who is in the same H3 cell (H3 is 2D, doesn't account for physical barriers). The driver would need to take a long detour via a bridge, making the ETA and fare very different from what was estimated. |
| **TRIGGER / SCENARIO** | Rider on east bank of Buriganga river. Driver on west bank. Same H3 cell. Matching algorithm sees them as "nearby." Actual driving distance: 15km via bridge. H3-based distance: 500m straight line. ETA and fare estimation are wildly wrong. |
| **WHY IT IS PLAUSIBLE** | H3 is a 2D geospatial index; it does not account for physical barriers like rivers, highways, or railways. |
| **IMPACT** | Massive ETA inaccuracy; incorrect fare estimation; terrible rider experience; driver may cancel. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | H3, Matching, Fare, ETA, Rider/Driver experience |

---

### SECTION H: MARKETPLACE — SHOPS, PRODUCTS & ORDERS

**BUG-MKT-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Inventory |
| **SERVICE / MODULE** | Marketplace / Products |
| **POSSIBLE BUG** | If inventory/stock is checked at order creation time but deducted at order confirmation time (or vice versa), multiple customers could order the last item in stock simultaneously. All orders would pass the stock check, but only one can be fulfilled, leaving the other orders in a broken state. |
| **TRIGGER / SCENARIO** | Product has stock = 1. Customer A adds to cart and checks out. Customer B adds to cart and checks out simultaneously. Both stock checks see stock = 1. Both orders are created. Stock goes to -1. One order must be cancelled. |
| **WHY IT IS PLAUSIBLE** | Classic TOCTOU race on inventory. If stock check and deduction are not atomic, overselling is possible. |
| **IMPACT** | Oversold inventory; order cancellations; customer dissatisfaction; shop reputation damage. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Marketplace, Products, Orders, Shop |

---

**BUG-MKT-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Marketplace / Orders |
| **POSSIBLE BUG** | If an order goes through multiple states (placed → confirmed → preparing → ready → out for delivery → delivered) and notifications are sent at each state change, but the order state can be updated out of sequence (e.g., a system glitch or manual admin action sets the order to "delivered" while it's still "preparing"), the customer could receive conflicting notifications (e.g., "your order is being prepared" followed by "your order is delivered"). |
| **TRIGGER / SCENARIO** | Admin manually updates order to "delivered" to close a support ticket. System simultaneously sends "preparing" notification from the automated flow. Customer receives both. |
| **WHY IT IS PLAUSIBLE** | Manual admin overrides and automated state machines may not be coordinated. |
| **IMPACT** | Confused customers; support escalations; trust erosion. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Orders, Notifications, Admin |

---

**BUG-MKT-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Marketplace / Orders / Delivery |
| **POSSIBLE BUG** | If a food delivery order is linked to a delivery ride (the "bridge" between marketplace order and ride-hailing delivery), and the delivery ride is cancelled or completed before the order is actually delivered (e.g., driver marks ride as complete but food wasn't handed over), the order would be stuck in a state where the delivery is "complete" but the food was never received. |
| **TRIGGER / SCENARIO** | Driver picks up food. Marks ride as "complete" by mistake (tap error). Order status updates to "delivered." Customer never received food. Customer disputes. |
| **WHY IT IS PLAUSIBLE** | The order-delivery bridge couples two state machines; incorrect transitions in one can corrupt the other. |
| **IMPACT** | Customer charged for undelivered food; dispute; refund required; driver investigation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Food delivery, Order lifecycle, Delivery ride, Bridge |

---

**BUG-MKT-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Marketplace / RFQ |
| **POSSIBLE BUG** | If an RFQ (Request for Quotation) is sent to multiple vendors and the system allows multiple vendors to respond, but the RFQ can be awarded to only one vendor, the other vendors' quotes might not be properly rejected/withdrawn when the RFQ is awarded, leaving stale quotes that could confuse the system or the vendor. |
| **TRIGGER / SCENARIO** | RFQ sent to vendors A, B, C. All three respond with quotes. Customer awards vendor A. Vendors B and C's quotes remain in "pending" state in their dashboards. They might fulfill the order thinking they won. |
| **WHY IT IS PLAUSIBLE** | RFQ award may not trigger automatic rejection of other bids. |
| **IMPACT** | Vendor confusion; duplicate fulfillment attempts; wasted resources. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | RFQ, Marketplace, Vendors |

---

**BUG-MKT-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Marketplace / Product Price |
| **POSSIBLE BUG** | If a shop owner updates a product's price while a customer has the product in their cart (or is in the checkout flow), the price charged at checkout could be different from the price displayed when the customer added the item. If the system doesn't lock the price at cart-add time, the customer could be charged a higher price without knowing. |
| **TRIGGER / SCENARIO** | Customer adds item to cart at 100 BDT at 2 PM. At 2:30 PM, shop raises price to 150 BDT. At 2:35 PM, customer checks out. Checkout reads current price (150 BDT). Customer charged 150 BDT for something they thought was 100 BDT. |
| **WHY IT IS PLAUSIBLE** | Cart may store product reference but not snapshot the price; checkout reads current price. |
| **IMPACT** | Customer overcharged; disputes; trust issues. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Cart, Checkout, Products, Payments |

---

### SECTION I: RENTAL BIDDING (SEALED-BID)

**BUG-BID-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Business Logic |
| **SERVICE / MODULE** | Marketplace / Rental Bidding |
| **POSSIBLE BUG** | In a sealed-bid rental system, if the bid submission deadline is enforced client-side (showing a countdown) but the server accepts bids slightly past the deadline (due to network delay or clock skew), a bidder who submits "just in time" could have their bid accepted after the deadline, potentially seeing other bids if the system reveals bids at the deadline. This breaks the sealed-bid fairness. |
| **TRIGGER / SCENARIO** | Deadline at 5:00 PM. Bidder A submits at 4:59:58. Network delay: 3 seconds. Server receives at 5:00:01. If the server-side deadline check uses a slightly different clock or allows a grace period, Bidder A's bid is accepted. If bids are revealed at 5:00:00, Bidder A might have been able to see other bids before submitting. |
| **WHY IT IS PLAUSIBLE** | Clock skew between client and server; network delays; grace periods in deadline enforcement. |
| **IMPACT** | Unfair bidding; sealed-bid integrity compromised; losing bidders dispute. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Bidding, Marketplace, Fairness |

---

**BUG-BID-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Marketplace / Rental Bidding / Award |
| **POSSIBLE BUG** | If two administrators or the system's auto-award logic attempt to award the same rental bid simultaneously (e.g., admin manually awards while the scheduler auto-awards at the deadline), the award could be processed twice, potentially creating two active rental contracts for the same vehicle/resource. |
| **TRIGGER / SCENARIO** | Bid deadline passes. Scheduler job triggers auto-award to lowest bidder. Simultaneously, admin manually clicks "award" on the same bid. Both handlers process the award. Two contracts created for the same vehicle. |
| **WHY IT IS PLAUSIBLE** | Manual admin actions and automated scheduler jobs can race on the same resource. |
| **IMPACT** | Double assignment of a rental resource; conflicting contracts; dispute between awarded parties. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Bidding, Rental, Contracts, Scheduler, Admin |

---

**BUG-BID-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine / Business Logic |
| **SERVICE / MODULE** | Marketplace / Rental Bidding |
| **POSSIBLE BUG** | After a rental bid is awarded and the winner is notified, if the winner doesn't confirm within an SLA window, the system should move to the next bidder. However, if the SLA expiry check and the winner's confirmation arrive simultaneously, the system could both accept the winner's confirmation AND demote them to the next bidder, leaving the rental in an inconsistent state with no active contract. |
| **TRIGGER / SCENARIO** | Winner's confirmation timer expires at 5:00 PM. Winner taps "confirm" at 4:59:59 (server receives at 5:00:00). SLA checker fires at 5:00:00. Both processes execute: confirmation succeeds, demotion also succeeds. Winner is both confirmed and demoted. |
| **WHY IT IS PLAUSIBLE** | SLA timeout and user action race condition at the exact deadline boundary. |
| **IMPACT** | Rental in limbo; neither the original winner nor the next bidder has a valid contract. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Rental, Bidding, SLA, Scheduler |

---

**BUG-BID-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Marketplace / Rental Bidding |
| **POSSIBLE BUG** | If a driver/vehicle that has been awarded a rental bid subsequently changes their vehicle (e.g., vehicle breaks down and they register a new one) or the driver's license expires/is revoked, the rental contract might not be automatically invalidated. The client (who bid for a specific vehicle type/driver) could be receiving service from a different vehicle/driver than what was bid on. |
| **TRIGGER / SCENARIO** | Client bids for and wins a contract specifying a specific vehicle class. Driver's vehicle breaks down. Driver switches to a different vehicle. Rental contract doesn't check vehicle eligibility against the bid specifications. Client receives inferior service. |
| **WHY IT IS PLAUSIBLE** | Rental contracts and driver/vehicle profiles may be loosely coupled. |
| **IMPACT** | Client receiving different service than contracted; SLA breach; disputes. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Rental, Vehicle management, Contracts |

---

**BUG-BID-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Information Leak |
| **SERVICE / MODULE** | Marketplace / Rental Bidding |
| **POSSIBLE BUG** | In a sealed-bid system, if the API that submits bids returns information about competing bids (even indirectly, such as "your bid is the lowest" or providing a bid count, or if the WebSocket system pushes bid-related events that reveal competitive information), bidders could adjust their strategy in real-time, breaking the sealed-bid principle. |
| **TRIGGER / SCENARIO** | Bidder submits a bid. The API response or a subsequent WebSocket event inadvertently reveals that there are currently 5 bids or that their bid is "currently winning." Bidder then adjusts their bid to be just slightly lower than needed, rather than bidding their true valuation. |
| **WHY IT IS PLAUSIBLE** | API responses and WebSocket events often include more context than necessary; information leakage through side channels is common. |
| **IMPACT** | Sealed-bid integrity compromised; anti-competitive behavior; revenue loss. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Bidding, API, WebSocket, Fairness |

---

### SECTION J: FLEET MANAGEMENT & MULTI-TENANCY

**BUG-FLEET-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Resource |
| **SERVICE / MODULE** | Fleet / Vehicle Assignment |
| **POSSIBLE BUG** | If two fleet managers simultaneously assign the same vehicle to two different drivers, both assignments could succeed (if the check for vehicle availability is read-then-write without a lock), resulting in two drivers being told they have the same vehicle. |
| **TRIGGER / SCENARIO** | Fleet Manager A assigns Vehicle V1 to Driver D1. Fleet Manager B assigns Vehicle V1 to Driver D2. Both read V1 as "unassigned." Both write V1 as assigned. V1 now has two drivers. |
| **WHY IT IS PLAUSIBLE** | Classic race condition on resource assignment without proper locking. |
| **IMPACT** | Double-assigned vehicle; confusion; safety issues (two drivers claim same vehicle); insurance/liability issues. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fleet, Vehicle management, Driver management |

---

**BUG-FLEET-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Fleet / Subscriptions |
| **POSSIBLE BUG** | If fleet subscriptions have usage limits (e.g., max 100 rides per month), and the usage counter is incremented when a ride starts but not decremented when a ride is cancelled, cancelled rides would consume the fleet's quota. Conversely, if the counter is only incremented on ride completion, a fleet with many in-progress rides could exceed their limit before the completions are counted. |
| **TRIGGER / SCENARIO** | Fleet has 100-ride monthly limit. 90 rides completed. 20 rides started but later cancelled. Counter shows 90 completed + 20 in-progress = 110 (if counted on start) → fleet locked out. Or counter shows 90 (if counted on completion) → 20 more rides can start → when completed, counter hits 110 → what happens? |
| **WHY IT IS PLAUSIBLE** | Usage counting strategy (start vs. completion vs. request) can cause off-by-many errors. |
| **IMPACT** | Fleet locked out prematurely or allowed to exceed limits; billing issues. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fleet, Subscriptions, Billing, Ride lifecycle |

---

**BUG-FLEET-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Authorization |
| **SERVICE / MODULE** | Fleet / Roles |
| **POSSIBLE BUG** | If a fleet admin's role is removed or the fleet is deactivated, but the admin's cached session/token still contains the fleet context, the admin could continue performing fleet operations until the token expires. Especially dangerous if the fleet is deactivated due to policy violations and the admin performs rapid operations before the token is invalidated. |
| **TRIGGER / SCENARIO** | Fleet deactivated for non-payment. Admin's JWT token still valid (24h expiry). Admin uses cached token to assign vehicles, approve drivers, or extract data during the token validity window. |
| **WHY IT IS PLAUSIBLE** | JWT tokens are self-contained; revocation requires a blacklist check or short expiry, which may not be implemented. |
| **IMPACT** | Unauthorized operations on a deactivated fleet; data extraction; resource manipulation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Fleet, Auth, RBAC, Token management |

---

**BUG-FLEET-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cross-Service |
| **SERVICE / MODULE** | Fleet / Billing |
| **POSSIBLE BUG** | If fleet billing is calculated based on ride records, and a ride's fare is adjusted after the billing cycle is closed (e.g., a late dispute resolution), the fleet's billing statement for that period would be incorrect. If there's no mechanism to retroactively adjust the billing, the fleet could be over or undercharged. |
| **TRIGGER / SCENARIO** | January billing cycle closes on Feb 1. Fleet is billed based on January rides. On Feb 5, a January ride's fare is adjusted from 500 to 300 BDT due to a dispute. Fleet was already billed commission on 500 BDT. No retroactive adjustment. |
| **WHY IT IS PLAUSIBLE** | Billing snapshots and fare adjustments are temporally decoupled. |
| **IMPACT** | Incorrect fleet billing; financial disputes; accounting reconciliation issues. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Fleet, Billing, Fare, Disputes, Accounting |

---

### SECTION K: CROSS-VERTICAL EXCLUSIVITY & RESOURCE CONFLICTS

**BUG-CROSS-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Resource |
| **SERVICE / MODULE** | Cross-vertical / Driver Resource |
| **POSSIBLE BUG** | If a driver can serve multiple verticals (ride-hailing, delivery, ambulance), and the system doesn't enforce mutual exclusivity on the driver's current assignment, a driver could be simultaneously assigned a ride-hailing trip and a delivery order (or ambulance dispatch), as these may be dispatched by different vertical-specific dispatch systems that don't check each other's state. |
| **TRIGGER / SCENARIO** | Driver is available in ride-hailing. Gets matched to a rider. Simultaneously, the food delivery dispatch finds the same driver available (their delivery status is "online" because the verticals use separate status systems). Driver gets a delivery order and a ride request. |
| **WHY IT IS PLAUSIBLE** | Vertical-specific dispatch systems may maintain independent availability states for the same driver. |
| **IMPACT** | Driver serving two customers simultaneously; one customer gets no service; potential safety issue (driver distracted). |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Dispatch, Delivery, Ride-hailing, Ambulance, Driver management |

---

**BUG-CROSS-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Cross-vertical / Wallet |
| **POSSIBLE BUG** | If a shared wallet is used across all verticals (ride-hailing, marketplace, food delivery), and the wallet balance is checked separately by each vertical's payment flow without global coordination, the combined deductions from multiple simultaneous transactions across verticals could exceed the wallet balance, creating a negative balance. |
| **TRIGGER / SCENARIO** | Wallet balance: 500 BDT. Ride payment: 300 BDT (ride-hailing). Food order payment: 300 BDT (marketplace). Both processed simultaneously. Both read balance = 500. Both deduct. Balance = -100. |
| **WHY IT IS PLAUSIBLE** | Same root cause as BUG-PAY-004 but specifically across vertical boundaries where coordination is even less likely. |
| **IMPACT** | Negative wallet; financial loss; accounting chaos. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Wallet, Payment, All verticals, Ledger |

---

**BUG-CROSS-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Cross-vertical / Ambulance + Ride-hailing |
| **POSSIBLE BUG** | If ambulance dispatch prioritizes urgency and first-accept, but the same driver has an auto-accept enabled for regular ride-hailing, the driver could auto-accept a regular ride and then receive an ambulance request. The system would need to either break the regular ride assignment (disrupting the rider) or skip the driver for the ambulance (delaying emergency response). Neither outcome is acceptable. |
| **TRIGGER / SCENARIO** | Driver with auto-accept gets matched to a regular ride. Ride accepted. 10 seconds later, ambulance dispatch broadcasts to nearby drivers. This driver is nearest but is now on a regular ride. Ambulance request goes to a farther driver, delaying emergency response by 5 minutes. |
| **WHY IT IS PLAUSIBLE** | Auto-accept and emergency dispatch are independent systems that may not preempt each other. |
| **IMPACT** | Delayed emergency response; potential life-threatening consequence. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ambulance, Ride-hailing, Auto-accept, Dispatch, Safety |

---

### SECTION L: AMBULANCE / EMERGENCY SERVICES

**BUG-AMB-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine / Safety |
| **SERVICE / MODULE** | Ambulance / Certification |
| **POSSIBLE BUG** | If an ambulance driver's medical certification or vehicle fitness certificate expires, but the system only checks certifications at onboarding time (not at dispatch time), an ambulance with expired credentials could be dispatched to an emergency. The driver's profile might show "certified" based on the initial check. |
| **TRIGGER / SCENARIO** | Ambulance driver certified on Jan 1. Certificate valid for 1 year. On Jan 2 of the next year, driver is still in the system as "certified." Emergency dispatch assigns this driver. |
| **WHY IT IS PLAUSIBLE** | Certification expiry may not be actively monitored; periodic re-validation may not exist. |
| **IMPACT** | Non-certified ambulance responding to emergency; legal liability; patient safety risk. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ambulance, Certification, Trust & Safety |

---

**BUG-AMB-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | Ambulance / First-Accept |
| **POSSIBLE BUG** | In a first-accept ambulance dispatch model, if the system broadcasts to multiple ambulance drivers and two drivers accept nearly simultaneously, both could be told "you are assigned" if the first-accept logic isn't atomic. The second acceptance would need to be rolled back, but by then the driver may have started driving toward the patient. |
| **TRIGGER / SCENARIO** | Ambulance request broadcast to drivers A, B, C. Driver A and Driver B both accept within 100ms. Both acceptance handlers process before either marks the request as "claimed." Both get "assigned" confirmation. Both start driving. |
| **WHY IT IS PLAUSIBLE** | Non-atomic claim-on-first-accept pattern. |
| **IMPACT** | Two ambulances dispatched; one arrives to find another already there; wasted resource; confusion at the scene. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Ambulance, Dispatch, Concurrency |

---

**BUG-AMB-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Location |
| **SERVICE / MODULE** | Ambulance / Dispatch |
| **POSSIBLE BUG** | If the ambulance dispatch radius is set in kilometers but the matching system uses H3 cells (which have an area-based relationship with distance), the effective dispatch radius could be different from the intended radius. For example, using a certain H3 resolution might effectively create a square dispatch area rather than a circular one, including ambulances that are actually too far by road distance. |
| **TRIGGER / SCENARIO** | Dispatch radius intended: 5km. H3 cells at the chosen resolution cover an area that includes locations up to 7km away by road (due to cell geometry). Ambulance assigned is 7km away by road; actual response time is much longer than estimated. |
| **WHY IT IS PLAUSIBLE** | H3 cells are hexagonal and don't map linearly to road distance. |
| **IMPACT** | Overestimated ambulance availability; longer response times than promised; safety risk. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Ambulance, H3, Dispatch, Emergency |

---

### SECTION M: SCHEDULER & BACKGROUND JOBS

**BUG-SCHED-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Scheduler |
| **SERVICE / MODULE** | Scheduler / Jobs |
| **POSSIBLE BUG** | If scheduler jobs are not idempotent and the scheduler runs on multiple instances (for high availability), the same job could be executed by two instances simultaneously. This is particularly dangerous for financial operations like payout processing, billing calculations, or subscription renewals. |
| **TRIGGER / SCENARIO** | "Process daily payouts" job scheduled for 2 AM. Two server instances both pick up the job (no distributed lock). Both process the same payouts. Drivers receive double payouts. |
| **WHY IT IS PLAUSIBLE** | Multi-instance schedulers without distributed locking are a common deployment pattern. |
| **IMPACT** | Double payouts; massive financial loss; difficult recovery (need to claw back from drivers). |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Scheduler, Payouts, Financial, All services |

---

**BUG-SCHED-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Scheduler / Timing |
| **SERVICE / MODULE** | Scheduler / Scheduled Rides |
| **POSSIBLE BUG** | If the scheduled ride activation job runs every N minutes (e.g., every 5 minutes), a ride scheduled for a time that falls between two job runs could be activated late. For example, a ride scheduled for 8:00 AM with a job that runs at 7:55 and 8:05 would be activated at 8:05, 5 minutes late. |
| **TRIGGER / SCENARIO** | Ride scheduled for 8:00 AM. Scheduler runs at 7:55 and 8:05. Ride picked up at 8:05. Driver dispatched 5 minutes late. Rider waiting. |
| **WHY IT IS PLAUSIBLE** | Interval-based schedulers have inherent granularity; exact-time triggers are harder to implement. |
| **IMPACT** | Late activation of scheduled rides; rider inconvenience; potential cancellation. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Scheduler, Scheduled rides, Dispatch |

---

**BUG-SCHED-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Scheduler / Cascading |
| **SERVICE / MODULE** | Scheduler / Jobs |
| **POSSIBLE BUG** | If the scheduler processes jobs sequentially and one job takes much longer than expected (e.g., a large batch payout), it could delay all subsequent jobs in the queue. This could cause scheduled ride activations, subscription renewals, SLA checks, and notification batches to all be delayed, creating cascading failures across the platform. |
| **TRIGGER / SCENARIO** | Payout job takes 30 minutes instead of the expected 2 minutes (large number of drivers). Subscription renewal job runs after payout job. Subscriptions that expired during the 30-minute window are renewed late, causing drivers to lose access and miss ride requests. |
| **WHY IT IS PLAUSIBLE** | Sequential job processing without timeouts or parallelism creates backlogs. |
| **IMPACT** | Cascading delays; multiple systems affected; broad platform degradation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Scheduler, All services |

---

**BUG-SCHED-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Scheduler / Concurrency |
| **SERVICE / MODULE** | Scheduler / Cleanup Jobs |
| **POSSIBLE BUG** | If a cleanup job (e.g., "expire stale sessions," "cancel abandoned orders") runs while users are actively working with the relevant data, it could expire a session or cancel an order that the user is in the middle of completing. The user would see their work suddenly disappear or their session terminate. |
| **TRIGGER / SCENARIO** | User is filling out a large marketplace order (takes 10 minutes). Cleanup job runs at minute 5, marks the order as "abandoned" because it's been in "draft" state for more than 5 minutes. User submits at minute 10. Submission fails because the order was already cleaned up. |
| **WHY IT IS PLAUSIBLE** | Cleanup jobs often use simple time-based heuristics without checking if the resource is actively in use. |
| **IMPACT** | Lost user work; frustration; data loss. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Scheduler, Orders, Sessions, User experience |

---

### SECTION N: WEBSOCKET, EVENTS & NOTIFICATIONS

**BUG-WS-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / WebSocket |
| **SERVICE / MODULE** | WebSocket / Live Tracking |
| **POSSIBLE BUG** | If a client disconnects and reconnects to WebSocket (e.g., due to network issues), events that occurred during the disconnection window might be lost if the system doesn't have a replay mechanism. The client would have stale state (e.g., ride status shown as "en route" when the ride was actually completed during the disconnection). |
| **TRIGGER / SCENARIO** | Rider loses network for 30 seconds. During that time, driver arrives and marks "arrived." Rider reconnects. No "arrived" event replayed. Rider still thinks driver is en route. Rider doesn't come out to meet the driver. No-show timer starts. |
| **WHY IT IS PLAUSIBLE** | WebSocket event delivery is fire-and-forget; without a message queue or replay buffer, disconnected clients miss events. |
| **IMPACT** | Stale client state; missed critical events (arrival, ride completion, cancellation); poor user experience. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | WebSocket, Live tracking, Notifications, Ride lifecycle |

---

**BUG-WS-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency |
| **SERVICE / MODULE** | WebSocket / Events |
| **POSSIBLE BUG** | If WebSocket messages can arrive out of order (possible with load balancers or multiple event producers), a client could receive "ride completed" before "ride started," leading to UI confusion and incorrect state transitions on the client. |
| **TRIGGER / SCENARIO** | Ride started event produced by server A. Ride completed event produced by server B. Due to network routing, "completed" arrives at the client before "started." Client processes "completed" (shows fare summary) then processes "started" (reverts UI to en-route view). |
| **WHY IT IS PLAUSIBLE** | No ordering guarantee on WebSocket messages across multiple server instances or event channels. |
| **IMPACT** | UI shows incorrect ride state; confusing user experience; potential duplicate actions. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | WebSocket, Client state, UI |

---

**BUG-WS-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Notifications |
| **SERVICE / MODULE** | Notifications / Push |
| **POSSIBLE BUG** | If a user has multiple devices registered for push notifications and the system sends a notification to all devices, but the user acts on the notification on one device (e.g., accepting a ride offer), the other devices might still show the pending notification. If the user taps the stale notification on the second device, it could trigger a duplicate action or an error. |
| **TRIGGER / SCENARIO** | Driver has phone and tablet registered. Ride offer notification sent to both. Driver accepts on phone. Tablet still shows the notification. Driver accidentally taps on tablet. Accept handler fires for an already-assigned ride. |
| **WHY IT IS PLAUSIBLE** | Push notifications are delivered to all registered devices; acting on a notification from a "stale" device is not guarded against. |
| **IMPACT** | Confusing UX; potential duplicate state transitions; errors. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Notifications, Push, Multi-device, Dispatch |

---

**BUG-WS-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Notifications / Business Logic |
| **SERVICE / MODULE** | Notifications |
| **POSSIBLE BUG** | Notifications sent after a ride is cancelled (e.g., "your driver is arriving" notification sent from a queue after the ride was cancelled) could confuse the rider into thinking the ride is still active, leading them to wait for a driver who will never come. |
| **TRIGGER / SCENARIO** | Driver assigned. "Driver is on the way" notification queued. Ride then cancelled (by driver). Queued notification still delivers. Rider sees "driver is on the way" for a cancelled ride. |
| **WHY IT IS PLAUSIBLE** | Notifications queued for delivery may not be checked against current ride state before delivery. |
| **IMPACT** | Confused rider; waiting for non-existent driver; poor experience. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Notifications, Ride lifecycle, Queue |

---

**BUG-WS-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Notifications / Deep Links |
| **SERVICE / MODULE** | Notifications |
| **POSSIBLE BUG** | If a notification contains a deep link to a specific ride or order, and that ride/order has been completed, cancelled, or deleted by the time the user taps the notification, the deep link could lead to a dead page, an error, or a 404. This is especially likely for notifications that arrive while the phone is off or in Do Not Disturb mode and are tapped hours later. |
| **TRIGGER / SCENARIO** | Rider gets a "rate your driver" notification for a ride completed at 9 PM. Phone was on silent. Rider taps the notification at 8 AM the next day. The ride's rating window has expired, or the ride record is in a different state. Deep link leads to an error page. |
| **WHY IT IS PLAUSIBLE** | Deep links reference specific resource states that may not exist when the notification is eventually tapped. |
| **IMPACT** | Broken user experience; error pages; support requests. |
| **SEVERITY** | LOW |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Notifications, Deep links, Client app |

---

### SECTION O: FEATURE FLAGS & CONFIGURATION

**BUG-CONFIG-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Configuration |
| **SERVICE / MODULE** | Feature Flags / Config |
| **POSSIBLE BUG** | If a feature flag is enabled for the API layer but not for the WebSocket layer (or vice versa), a feature could be partially functional. For example, a new ride status might be accepted by the API but the WebSocket handler doesn't know how to broadcast it, so the rider's app never receives the update. |
| **TRIGGER / SCENARIO** | New "driver arriving" status added behind a feature flag. API server has flag enabled → accepts and stores the status. WebSocket server has flag disabled → doesn't recognize the status → no event sent to rider. |
| **WHY IT IS PLAUSIBLE** | Feature flags are typically deployed per-service; inconsistent flag state across services is common during rollouts. |
| **IMPACT** | Partial feature functionality; silent failures; hard-to-debug inconsistencies. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Feature flags, API, WebSocket, All services |

---

**BUG-CONFIG-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Configuration / Data |
| **SERVICE / MODULE** | Config / Units |
| **POSSIBLE BUG** | If configuration values are specified without consistent units, a distance threshold set as "500" (meant to be meters) could be interpreted as "500" kilometers by a different service. Similarly, time values in seconds vs. milliseconds, currency in BDT vs. paisa, or percentage as 0.15 vs. 15 could cause wild miscalculations. |
| **TRIGGER / SCENARIO** | Cancellation fee free-radius configured as "200" (meant: 200 meters). Fare calculation service interprets it as 200 kilometers. Cancellation fee never applies because no ride has a 200km free radius. |
| **WHY IT IS PLAUSIBLE** | Configuration schemas often lack explicit unit types; different services may assume different units for the same config key. |
| **IMPACT** | Wildly incorrect calculations; fees, distances, or times off by orders of magnitude. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Config, All services |

---

**BUG-CONFIG-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Config |
| **SERVICE / MODULE** | Config / Feature Flags |
| **POSSIBLE BUG** | If feature flags are cached in each service instance and refreshed periodically, a flag change could take time to propagate. During the propagation window, some instances have the old value and some have the new value. Requests hitting different instances would get different behavior, creating inconsistent user experiences or even contradictory outcomes (e.g., a ride is eligible for a feature on one instance but not on another). |
| **TRIGGER / SCENARIO** | Flag "enable_surge" is toggled off. Instance A refreshes its cache and stops applying surge. Instance B still has the cached "true" value. Rider's request hits instance A (no surge). Next request hits instance B (surge applied). Rider sees inconsistent pricing. |
| **WHY IT IS PLAUSIBLE** | Cache propagation delays are inherent in distributed systems without push-based config updates. |
| **IMPACT** | Inconsistent behavior across requests; user confusion; financial inconsistencies. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Config, Cache, All services |

---

### SECTION P: TIME & TIMEZONE

**BUG-TIME-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Scheduler / Time |
| **POSSIBLE BUG** | If the server stores times in UTC but business logic interprets them in local time (Dhaka, UTC+6), operations scheduled around midnight local time could be off by a day. For example, a pass that expires "at end of day" in Dhaka time could expire at midnight UTC (6 AM Dhaka), giving users 6 extra hours, or expire at midnight Dhaka (6 PM UTC the day before), cutting the day short. |
| **TRIGGER / SCENARIO** | Promotion valid "until 2024-12-31." Stored as 2024-12-31 00:00:00 UTC. In Dhaka, that's 2024-12-31 06:00 AM. Users have until 6 AM local to use it. Or: stored as 2024-12-31 00:00:00 Dhaka = 2024-12-30 18:00 UTC. Expires the evening before. |
| **WHY IT IS PLAUSIBLE** | UTC/local time confusion is one of the most common bugs in systems serving a single timezone. |
| **IMPACT** | Promotions/pass/subscriptions expiring at wrong time; user complaints; financial impact. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Scheduler, Promotions, Passes, Subscriptions, Time |

---

**BUG-TIME-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Fare / Waiting Charges |
| **POSSIBLE BUG** | If waiting time is calculated as the difference between two timestamps, and these timestamps come from different sources (e.g., "arrival time" from the driver's phone clock, "ride start time" from the server clock), clock skew between the device and server could create negative waiting times or inflated waiting charges. |
| **TRIGGER / SCENARIO** | Driver's phone clock is 2 minutes ahead of server. Driver marks "arrived" at 5:00 PM (phone time) = 4:58 PM (server time). Rider enters car at 5:02 PM (server time). Server calculates waiting time as 5:02 - 4:58 = 4 minutes. Real waiting time was 2 minutes. |
| **WHY IT IS PLAUSIBLE** | Mobile device clocks are not synchronized with server clocks. |
| **IMPACT** | Incorrect waiting charges; overcharging or undercharging. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Fare, Waiting charges, Time, Client-server sync |

---

### SECTION Q: MOBILE / NETWORK / CLIENT-SERVER

**BUG-MOBILE-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Retry / Idempotency |
| **SERVICE / MODULE** | Mobile / Ride Request |
| **POSSIBLE BUG** | If a rider taps "Request Ride" and the request appears to fail (network timeout), the client might show an error and the rider taps again, creating a second ride request. If the first request actually succeeded server-side but the response was lost, the rider now has two active ride requests. Both could be dispatched to different drivers. |
| **TRIGGER / SCENARIO** | Rider taps "Request Ride." Network timeout after 10 seconds. Client shows "Request failed, please try again." Rider taps again. Two ride requests created. Two drivers dispatched. Rider gets confused. One driver arrives, rider takes that ride. Other driver wasted a trip. |
| **WHY IT IS PLAUSIBLE** | Client-side retry without idempotency key creates duplicate requests. |
| **IMPACT** | Duplicate ride requests; wasted driver trips; cancellation penalties; bad experience. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Client, Ride request, Dispatch |

---

**BUG-MOBILE-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Sync |
| **SERVICE / MODULE** | Mobile / Backgrounding |
| **POSSIBLE BUG** | If the rider puts the app in the background during a ride (e.g., to use maps or messaging) and the app stops receiving WebSocket updates, when the rider returns to the app, the ride state displayed could be stale. The ride might have been completed, cancelled, or the driver might have sent messages that the rider didn't see. |
| **TRIGGER / SCENARIO** | Rider puts app in background. Driver arrives and calls rider. Rider doesn't answer (app is backgrounded, call notification might not show on some devices). Driver marks "no-show." Rider returns to app 5 minutes later, still sees "driver en route." |
| **WHY IT IS PLAUSIBLE** | Mobile OS aggressively kills background WebSocket connections. |
| **IMPACT** | Stale UI; missed critical events (arrival, cancellation, no-show); rider unaware of ride status changes. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Mobile, WebSocket, Background, Ride lifecycle |

---

**BUG-MOBILE-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Sync |
| **SERVICE / MODULE** | Mobile / Local Queue |
| **POSSIBLE BUG** | If the client queues actions locally when offline (e.g., rate driver, add tip) and replays them when connectivity returns, the replayed actions could be out of order or stale. A tip added "after the ride" could be applied to a different ride if the ride context changed, or a rating could be submitted for a ride that was already refunded. |
| **TRIGGER / SCENARIO** | Rider rates driver 5 stars while offline. Ride is then refunded while rider is offline. Rider comes online. Queued rating is submitted for a refunded ride. Rating counts toward driver's average for a ride that shouldn't exist. |
| **WHY IT IS PLAUSIBLE** | Offline queues store actions with their original context, but the context may be invalid when the queue is replayed. |
| **IMPACT** | Stale actions applied to modified or deleted resources; incorrect ratings; financial inconsistencies. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Mobile, Offline queue, Ratings, Payment |

---

**BUG-MOBILE-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Client-Server Mismatch |
| **SERVICE / MODULE** | Mobile / Completion |
| **POSSIBLE BUG** | If the server successfully processes a ride completion but the response to the driver's app is lost (network failure at the exact moment), the driver's app shows "completion failed" and the driver might try to end the ride again. The server could reject the duplicate attempt, but the driver is stuck thinking the ride isn't completed, and the rider sees the ride as completed but the driver keeps calling them. |
| **TRIGGER / SCENARIO** | Driver taps "End Ride." Server processes it, calculates fare, charges rider, sends response. Network drops at the exact moment of response delivery. Driver's app shows "error ending ride." Driver taps again. Server: "ride already completed." Driver doesn't understand. Calls rider. Rider is confused (they were charged). |
| **WHY IT IS PLAUSIBLE** | Classic "server succeeded, client doesn't know" problem. |
| **IMPACT** | Confused driver and rider; potential disputes; support tickets. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Client, Server, Ride completion, UX |

---

### SECTION R: DELIVERY & COURIER

**BUG-DEL-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | State Machine |
| **SERVICE / MODULE** | Delivery / Multi-Leg |
| **POSSIBLE BUG** | In a multi-leg delivery (e.g., pickup from shop → sort center → customer), if the first leg is completed but the second leg fails (no available driver for the last mile), the package could be stuck at the sort center indefinitely with no automated escalation or alert to the customer or the shop. |
| **TRIGGER / SCENARIO** | Package picked up from shop, delivered to sort center (leg 1 complete). No driver available for last-mile delivery (leg 2). Package sits at sort center. Customer expects delivery. No notification. Shop not informed. |
| **WHY IT IS PLAUSIBLE** | Multi-leg delivery legs are independent dispatches; failure of a subsequent leg may not automatically alert stakeholders. |
| **IMPACT** | Lost packages; customer complaints; shop reputation damage. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Delivery, Dispatch, Notifications, Customer service |

---

**BUG-DEL-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Delivery / Food Delivery Bridge |
| **POSSIBLE BUG** | If the food delivery creates a "bridge" to a delivery ride (linking the order to a ride for delivery), but the bridge can be created multiple times for the same order (e.g., if the first bridge creation times out and is retried), duplicate delivery rides could be created for a single food order, dispatching two drivers for the same package. |
| **TRIGGER / SCENARIO** | Food order #123 needs delivery. System creates delivery ride R1 for order #123. Bridge creation response times out. System retries, creates ride R2 for order #123. Two drivers dispatched to pick up the same food. |
| **WHY IT IS PLAUSIBLE** | Retry without idempotency on the bridge creation. |
| **IMPACT** | Duplicate delivery; one driver wasted; shop confused; potentially food given to wrong driver. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Food delivery, Delivery ride, Bridge, Dispatch |

---

**BUG-DEL-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Delivery / Fee |
| **POSSIBLE BUG** | If the delivery fee is calculated separately from the order total (e.g., based on distance, weight, or zone), and the delivery address is changed after the fee was calculated (e.g., customer updates delivery address mid-delivery), the fee might not be recalculated, resulting in the customer paying a fee based on the original address while the driver delivers to a farther location. |
| **TRIGGER / SCENARIO** | Customer orders food. Delivery to Address A (3km): fee = 50 BDT. Customer changes address to Address B (8km) while food is being prepared. Fee not recalculated. Driver delivers 8km for a 50 BDT fee that should be 120 BDT. |
| **WHY IT IS PLAUSIBLE** | Address change and fee recalculation may be in different systems; address change may not trigger fee recalculation. |
| **IMPACT** | Undercharged delivery fee; driver loses earnings on distance; platform loses margin. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Delivery, Fee, Address, Order lifecycle |

---

### SECTION S: DATA CONSISTENCY & CROSS-SERVICE CHAINS

**BUG-DATA-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cross-Service |
| **SERVICE / MODULE** | Ride → Payment → Wallet → Ledger → Tax → Accounting |
| **POSSIBLE BUG** | In the chain Ride → Payment → Wallet → Ledger → Tax → Accounting, if the ride completes successfully and the payment is deducted from the rider's wallet, but the ledger write fails (due to database timeout or constraint violation), the rider's wallet is debited but no ledger entry exists. This creates phantom money disappearance: the rider's balance decreased but there's no audit trail. |
| **TRIGGER / SCENARIO** | Ride completes. Wallet debit succeeds (500 BDT deducted from rider). Ledger insert fails (database timeout). Rider has 500 BDT less, no record of where it went. Driver not credited. |
| **WHY IT IS PLAUSIBLE** | Each step in the chain is a separate operation; failure at any step leaves the previous steps in an inconsistent state unless there's a compensating transaction (saga pattern). |
| **IMPACT** | Money disappearance; accounting imbalance; audit failure; regulatory risk. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Payment, Wallet, Ledger, Accounting |

---

**BUG-DATA-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Consistency |
| **SERVICE / MODULE** | Wallet / Ledger |
| **POSSIBLE BUG** | If the wallet balance is maintained as a cached sum (stored in the wallet table) rather than being computed from ledger entries, and a ledger entry is added but the wallet balance update fails (or vice versa), the wallet balance and the ledger will be permanently out of sync until manually reconciled. |
| **TRIGGER / SCENARIO** | Ledger entry added: +100 BDT credit. Balance update fails (concurrent write conflict). Ledger shows 100 BDT credit. Wallet balance unchanged. User can't use the 100 BDT. |
| **WHY IT IS PLAUSIBLE** | Denormalized balance + normalized ledger is common but requires strong consistency guarantees. |
| **IMPACT** | Balance ≠ ledger sum; user money inaccessible; support escalation; manual reconciliation needed. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Wallet, Ledger, Accounting |

---

**BUG-DATA-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Consistency |
| **SERVICE / MODULE** | Soft Delete / Counter |
| **POSSIBLE BUG** | If records are soft-deleted (marked as deleted but not physically removed), and counters (e.g., "total rides for driver") include soft-deleted records, the count could be inflated. If a ride is soft-deleted due to an error but the counter was already incremented, the driver's ride count includes phantom rides. |
| **TRIGGER / SCENARIO** | Ride created → counter incremented (ride #100). Ride later soft-deleted due to duplicate creation. Counter still shows 100 rides. Driver's "100th ride" celebration triggered for a non-existent ride. |
| **WHY IT IS PLAUSIBLE** | Counters and soft-delete rarely communicate; increment and delete are separate events. |
| **IMPACT** | Inflated metrics; incorrect milestone triggers; gamification abuse. |
| **SEVERITY** | LOW |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Data, Counters, Soft delete, Gamification |

---

**BUG-DATA-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cache Staleness |
| **SERVICE / MODULE** | Various / Cache |
| **POSSIBLE BUG** | If zone pricing, fare rules, or promotion rules are cached at the service level and updated infrequently, changes made by admins (e.g., adjusting surge multipliers, adding a new promotion) might not take effect until the cache refreshes. During the stale window, the old rules apply. |
| **TRIGGER / SCENARIO** | Admin disables a promotion at 3 PM. Cache refreshes every 30 minutes. Until 3:30 PM, the promotion is still active. Users apply it during this window. |
| **WHY IT IS PLAUSIBLE** | Cache invalidation is a classic hard problem; TTL-based caches have inherent staleness. |
| **IMPACT** | Stale business rules applied; financial impact; promotions used after expiry. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Cache, Config, Promotions, Fare, All services |

---

### SECTION T: SECURITY & FRAUD

**BUG-SEC-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Fraud |
| **SERVICE / MODULE** | Ride-hailing / Promotion Abuse |
| **POSSIBLE BUG** | If promotions are tied to a user account but not to a device or phone number, a user could create multiple accounts (with different phone numbers) to use the same "new user" promotion repeatedly. If the platform doesn't check device fingerprint, IP, or payment method overlap across accounts, this abuse is undetectable. |
| **TRIGGER / SCENARIO** | User creates 10 accounts with 10 different SIM cards. Each account gets a "first ride free" promotion. User takes 10 free rides. |
| **WHY IT IS PLAUSIBLE** | SIM cards are cheap in Bangladesh; creating new accounts is trivial without device-level fingerprinting. |
| **IMPACT** | Promotion budget drained; financial loss; abuse not detected without cross-account analysis. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Promotions, Auth, Fraud detection |

---

**BUG-SEC-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Fraud |
| **SERVICE / MODULE** | Ride-hailing / Cancellation Abuse |
| **POSSIBLE BUG** | A driver could abuse the cancellation fee system by accepting rides and then waiting near the pickup point until the no-show timer expires, collecting cancellation fees from riders who aren't aware the driver is there. The driver could repeat this with multiple riders, collecting fees without providing any service. |
| **TRIGGER / SCENARIO** | Driver accepts ride, arrives at pickup, but hides or doesn't contact the rider. No-show timer expires. Rider charged cancellation fee. Driver collects fee. Driver goes back online. Repeat. |
| **WHY IT IS PLAUSIBLE** | The system trusts the driver's GPS arrival and doesn't verify actual contact between driver and rider. |
| **IMPACT** | Riders charged unfairly; driver earns money without providing service; trust erosion. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Cancellation, No-show, Trust & Safety, Fraud |

---

**BUG-SEC-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Fraud |
| **SERVICE / MODULE** | Wallet / Refund Abuse |
| **POSSIBLE BUG** | If riders can pay for rides using their wallet and then dispute the ride to get a refund to the wallet, and the wallet balance is withdrawable (to bank or mobile money), a colluding rider-driver pair could create fake rides, pay with wallet, get refunds, and withdraw the money. The wallet would be used as a money laundering pipeline. |
| **TRIGGER / SCENARIO** | Rider creates ride. Colluding driver accepts. "Ride" happens (or doesn't). Rider pays 1000 BDT from wallet. Rider disputes. Admin refunds 1000 BDT to wallet. Rider withdraws 1000 BDT to bKash. Net: 1000 BDT moved from platform wallet to external account via a fake ride. |
| **WHY IT IS PLAUSIBLE** | Refund-to-wallet + wallet-withdrawal creates a closed loop that can be exploited with colluding accounts. |
| **IMPACT** | Money laundering; financial loss; regulatory risk. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Wallet, Refunds, Withdrawal, Fraud, Trust & Safety |

---

**BUG-SEC-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / API |
| **SERVICE / MODULE** | API / Authorization |
| **POSSIBLE BUG** | If API endpoints use sequential or predictable IDs for resources (e.g., ride IDs 1001, 1002, 1003...), a malicious user could iterate through IDs to access other users' ride details, order histories, or payment information (Insecure Direct Object Reference - IDOR). |
| **TRIGGER / SCENARIO** | Attacker logged in as User A calls `/rides/1002` instead of `/rides/1001` (their own ride). If the endpoint only checks authentication (logged in) but not authorization (is this your ride?), the attacker sees User B's ride details including pickup/dropoff location, fare, and driver info. |
| **WHY IT IS PLAUSIBLE** | IDOR is one of the most common web API vulnerabilities; authorization checks on resource ownership are often missed. |
| **IMPACT** | Data breach; privacy violation; PII exposure; regulatory non-compliance. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | API, Authorization, All resources |

---

**BUG-SEC-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Replay |
| **SERVICE / MODULE** | Payment / Webhooks |
| **POSSIBLE BUG** | If payment callback/webhook endpoints don't verify the authenticity of the incoming request (e.g., via signature verification), an attacker could craft fake payment confirmation callbacks to credit their wallet or complete orders without actually paying. |
| **TRIGGER / SCENARIO** | Attacker intercepts a legitimate bKash payment callback. Observes the format. Crafts a fake callback with a different transaction ID and amount. Sends it to the platform's webhook endpoint. If the endpoint doesn't verify the signature from bKash, the fake callback is processed. Wallet credited. |
| **WHY IT IS PLAUSIBLE** | Webhook signature verification is frequently overlooked during initial implementation. |
| **IMPACT** | Free money; wallet credited without payment; financial loss. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Payment, Webhook, Wallet, External APIs |

---

**BUG-SEC-006**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Rate Limiting |
| **SERVICE / MODULE** | API / Abuse |
| **POSSIBLE BUG** | If the ride request API doesn't have rate limiting, a malicious user or bot could flood the system with ride requests, consuming all available drivers in an area and causing a denial of service for legitimate riders. Similarly, rapid cancellation of rides after driver assignment could waste driver resources. |
| **TRIGGER / SCENARIO** | Bot creates 100 ride requests in a neighborhood. All available drivers get matched to fake rides. Legitimate riders can't find drivers. Bot cancels all rides after 2 minutes. Drivers wasted 2 minutes each. Repeat. |
| **WHY IT IS PLAUSIBLE** | Rate limiting on ride-request endpoints may not be aggressive enough to prevent automated abuse. |
| **IMPACT** | Service denial for legitimate users; driver frustration; financial loss from wasted driver time. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | API, Dispatch, Rate limiting, Trust & Safety |

---

### SECTION U: WORKSHOPS & MISCELLANEOUS

**BUG-WORKSHOP-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Marketplace / Workshops |
| **POSSIBLE BUG** | If workshop appointments have time slots and two customers book the same slot simultaneously, both bookings could succeed if the availability check and slot reservation aren't atomic, resulting in double-booking. |
| **TRIGGER / SCENARIO** | Workshop has one slot available at 3 PM. Customer A and Customer B both click "book" at the same time. Both availability checks see the slot as available. Both create bookings. Workshop double-booked at 3 PM. |
| **WHY IT IS PLAUSIBLE** | Same TOCTOU pattern as inventory concurrency. |
| **IMPACT** | Double-booking; customer turned away; reputation damage. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Workshops, Appointments |

---

## TOP 100 BUGS TO INVESTIGATE FIRST

Ranked by combination of financial damage, security risk, safety impact, likelihood, detection difficulty, and cross-service blast radius.

| Rank | BUG ID | Reason for Priority |
|------|--------|-------------------|
| 1 | BUG-PAY-001 | Duplicate wallet top-up from payment gateway webhook retry; direct financial loss; hard to detect. |
| 2 | BUG-PAY-004 | Wallet negative balance from concurrent deductions across verticals; financial loss; affects all transactions. |
| 3 | BUG-PAY-008 | Double disbursement on withdrawal retry; direct money loss; hard to recover. |
| 4 | BUG-PAY-010 | Cache-stale wallet balance enabling over-withdrawal; financial loss; affects all financial operations. |
| 5 | BUG-SCHED-001 | Duplicate scheduler job execution on multiple instances; double payouts; massive financial impact. |
| 6 | BUG-DISPATCH-001 | Double assignment of same driver to two riders; core functionality failure; safety issue. |
| 7 | BUG-PAY-005 | Over-refund from partial + full refund race; financial loss; abuse vector. |
| 8 | BUG-PAY-003 | Unbalanced double-entry ledger from failed atomic transaction; money disappearance; audit failure. |
| 9 | BUG-DATA-001 | Cross-service chain failure (ride→payment→wallet→ledger); phantom money loss; very hard to detect. |
| 10 | BUG-CROSS-001 | Same driver assigned to ride-hailing + delivery simultaneously; resource conflict; safety issue. |
| 11 | BUG-CROSS-002 | Cross-vertical wallet overdraft; same root cause as PAY-004 but across service boundaries. |
| 12 | BUG-PAY-006 | Promotion credits laundered into cash via refund; fraud vector; financial loss. |
| 13 | BUG-SEC-005 | Fake payment webhook without signature verification; free money; direct financial exploitation. |
| 14 | BUG-SEC-003 | Rider-driver collusion for refund-to-wallet laundering; money laundering; regulatory risk. |
| 15 | BUG-SEC-004 | IDOR on API endpoints; data breach; PII exposure; regulatory non-compliance. |
| 16 | BUG-CROSS-003 | Auto-accept prevents ambulance dispatch; delayed emergency response; safety-critical. |
| 17 | BUG-AUTH-004 | Cross-tenant data leakage from system-level API bypassing tenant scope; data breach. |
| 18 | BUG-PAY-002 | Ride completed but payment failed; driver not paid; stuck in limbo state. |
| 19 | BUG-DRIVER-001 | Duplicate driver sessions from rapid online toggling; duplicate dispatch; core matching failure. |
| 20 | BUG-DISPATCH-002 | Auto-redispatch sends duplicate offers to same driver; confused drivers; potential double acceptance. |
| 21 | BUG-RIDE-001 | Simultaneous rider cancellation + driver completion race; financial inconsistency. |
| 22 | BUG-AUTH-003 | OTP consumed twice from race condition; duplicate login sessions. |
| 23 | BUG-PAY-009 | Driver earnings not updated when fare adjusted post-completion; financial discrepancy. |
| 24 | BUG-MKT-001 | Inventory overselling from concurrent orders; customer dissatisfaction. |
| 25 | BUG-AMB-001 | Expired ambulance certification not checked at dispatch time; safety-critical. |
| 26 | BUG-AUTH-002 | Mid-request permission revocation allowing unauthorized financial operation. |
| 27 | BUG-AMB-002 | Double ambulance dispatch from first-accept race; resource waste; confusion. |
| 28 | BUG-FLEET-003 | Deactivated fleet admin using cached JWT token; unauthorized operations. |
| 29 | BUG-DRIVER-003 | Driver suspended mid-ride; rider stranded; safety issue. |
| 30 | BUG-SEC-001 | Multi-account promotion abuse; budget drain; fraud. |
| 31 | BUG-FARE-001 | Routing API fallback to straight-line distance; significant fare error in Bangladesh geography. |
| 32 | BUG-FARE-002 | Surge pricing quote-vs-settlement mismatch; rider over/undercharged. |
| 33 | BUG-PAY-007 | Tax calculated on wrong base amount; compliance risk. |
| 34 | BUG-SEC-006 | Bot-driven ride request flooding; denial of service for legitimate users. |
| 35 | BUG-SEC-002 | Driver cancellation fee abuse via no-show manipulation; rider financial harm. |
| 36 | BUG-DATA-002 | Wallet balance ≠ ledger sum; user money inaccessible. |
| 37 | BUG-RIDE-005 | Simultaneous rider+driver cancellation race; incorrect fee attribution. |
| 38 | BUG-DRIVER-002 | Driver availability during ride completion intermediate state; matching to new ride prematurely. |
| 39 | BUG-DISPATCH-003 | PIN mismatch from non-idempotent accept handler; ride cannot start. |
| 40 | BUG-BID-002 | Double award of rental from scheduler+admin race; conflicting contracts. |
| 41 | BUG-DEL-002 | Duplicate delivery bridge creation; two drivers for one food order. |
| 42 | BUG-CROSS-001 | (duplicate concern) Cross-vertical resource conflict — driver serving multiple verticals. |
| 43 | BUG-CONFIG-001 | Feature flag inconsistency across services; partial feature functionality. |
| 44 | BUG-CONFIG-003 | Cached feature flag propagation delay; inconsistent behavior across requests. |
| 45 | BUG-WS-001 | WebSocket disconnection causing missed events; stale client state. |
| 46 | BUG-WS-002 | Out-of-order WebSocket messages; UI state corruption. |
| 47 | BUG-MOBILE-001 | Duplicate ride request from client retry without idempotency; two drivers dispatched. |
| 48 | BUG-MOBILE-002 | Stale UI from app backgrounding during ride; missed arrival/no-show events. |
| 49 | BUG-FARE-005 | Promotion expiry during ride (crosses midnight); rider promised discount not applied. |
| 50 | BUG-FARE-006 | Double tip from pre-tip + post-tip flows; rider double-charged. |
| 51 | BUG-RIDE-003 | Stale driver location for cancellation fee calculation; incorrect fee. |
| 52 | BUG-RIDE-004 | Multi-stop fare recalculation error; over/undercharging. |
| 53 | BUG-BID-001 | Sealed-bid deadline race; unfair bidding advantage. |
| 54 | BUG-BID-003 | SLA expiry + winner confirmation race; rental in limbo. |
| 55 | BUG-BID-005 | Sealed-bid information leak through API/WebSocket; compromised fairness. |
| 56 | BUG-FLEET-001 | Double vehicle assignment from concurrent fleet managers; resource conflict. |
| 57 | BUG-FLEET-002 | Subscription usage counter not decremented on cancellation; premature limit hit. |
| 58 | BUG-MKT-003 | Food delivery bridge order-ride state mismatch; order marked delivered but food not received. |
| 59 | BUG-RIDE-006 | SOS + ride cancellation race; emergency responders lose location data. |
| 60 | BUG-LOC-002 | GPS spoofing by drivers; gaming dispatch; fraud. |
| 61 | BUG-LOC-003 | H3 cells spanning rivers; massive ETA and fare inaccuracy in Bangladesh. |
| 62 | BUG-AMB-003 | H3 vs. km radius mismatch for ambulance dispatch; response time inaccuracy. |
| 63 | BUG-CONFIG-002 | Unit mismatches in configuration; orders-of-magnitude errors. |
| 64 | BUG-AUTH-005 | Driver rejection + document resubmission race; rejected driver becomes active. |
| 65 | BUG-TIME-001 | UTC/Dhaka timezone confusion; promotions expiring at wrong time. |
| 66 | BUG-TIME-002 | Client/server clock skew affecting waiting charges; incorrect billing. |
| 67 | BUG-DRIVER-005 | Location data used differently for matching vs. fare; spatial inconsistency. |
| 68 | BUG-FARE-003 | Driver "arrived" via GPS but not actually at pickup; unfair waiting charges. |
| 69 | BUG-FARE-004 | Pass not restored on refunded ride; rider loses pass benefit. |
| 70 | BUG-FARE-007 | Pickup fee zone boundary GPS jitter; inconsistent pricing. |
| 71 | BUG-DEL-001 | Multi-leg delivery stuck at intermediate point; package lost. |
| 72 | BUG-DEL-003 | Delivery fee not recalculated on address change; undercharged. |
| 73 | BUG-MKT-002 | Out-of-sequence order state updates; conflicting notifications. |
| 74 | BUG-MKT-004 | Stale RFQ quotes after award; vendor confusion. |
| 75 | BUG-MKT-005 | Price change during checkout; customer charged different amount than shown. |
| 76 | BUG-BID-004 | Rental vehicle/driver change after bid award; contract violation. |
| 77 | BUG-FLEET-004 | Fare adjustment after billing cycle close; incorrect fleet billing. |
| 78 | BUG-WS-003 | Multi-device push notification acting on stale state; duplicate actions. |
| 79 | BUG-WS-004 | Notification delivered after ride cancellation; confused rider. |
| 80 | BUG-WS-005 | Deep link to completed/cancelled resource; broken UX. |
| 81 | BUG-MOBILE-003 | Offline queue replay applying stale actions to modified resources. |
| 82 | BUG-MOBILE-004 | Server completed but client doesn't know; driver stuck in UI confusion. |
| 83 | BUG-SCHED-002 | Scheduled ride activated late due to job interval granularity. |
| 84 | BUG-SCHED-003 | Long-running job delays all subsequent jobs; cascading platform degradation. |
| 85 | BUG-SCHED-004 | Cleanup job deletes actively-used resource; lost user work. |
| 86 | BUG-DRIVER-004 | Refunded ride's rating not removed from driver average; unfair penalization. |
| 87 | BUG-RIDE-002 | GPS-based no-show detection at wrong entrance; unfair no-show fee. |
| 88 | BUG-DISPATCH-005 | Stale H3 cell from backgrounded driver app; wrong driver matched. |
| 89 | BUG-DISPATCH-006 | Scheduled ride driver goes offline between assignment and pickup time. |
| 90 | BUG-DISPATCH-004 | Auto-accept + manual UI conflict; ride cancelled after auto-acceptance. |
| 91 | BUG-DATA-003 | Soft-deleted record included in counter; inflated metrics. |
| 92 | BUG-DATA-004 | Cached business rules stale after admin update; old rules still applied. |
| 93 | BUG-WORKSHOP-001 | Workshop appointment double-booking from concurrent requests. |
| 94 | BUG-LOC-001 | Inconsistent H3 resolution between matching and pricing; zone mismatch. |
| 95 | BUG-AUTH-001 | Session migration failure on multi-device login; notifications to wrong device. |
| 96 | BUG-PAY-001 | (Secondary concern) Idempotency failure also applies to refund webhooks. |
| 97 | BUG-SEC-001 | Device fingerprinting gap in promotion abuse detection. |
| 98 | BUG-CROSS-004 | (Derived) Cross-vertical resource conflict extends to emergency vehicles being dispatched for non-emergency. |
| 99 | BUG-MKT-006 | (Derived) Shop order total vs. item sum mismatch if items modified during checkout. |
| 100 | BUG-RIDE-007 | (Derived) Ride PIN verified but ride already expired/cancelled; stale verification. |

---

## TOP 30 RARE BUT SEVERE BUGS

Bugs most likely to escape ordinary testing due to rare timing, multiple actors, provider failures, stale state, or unusual data conditions.

| Rank | BUG ID | Why It Escapes Testing |
|------|--------|----------------------|
| 1 | BUG-PAY-003 | Double-entry ledger imbalance requires atomic transaction failure at exactly the right moment between credit and debit; normal testing never produces this. |
| 2 | BUG-DATA-001 | Cross-service chain failure requires a specific service to fail in a multi-step transaction; load testing rarely covers this exact failure point. |
| 3 | BUG-CROSS-003 | Auto-accept blocking ambulance dispatch requires a driver to auto-accept a regular ride at the exact moment an emergency is dispatched; timing-dependent. |
| 4 | BUG-SCHED-001 | Duplicate scheduler execution requires multi-instance deployment with no distributed lock; may not manifest in single-instance dev/staging environments. |
| 5 | BUG-PAY-008 | Double disbursement on retry requires external payment API to succeed but lose the response; impossible to reproduce in testing without mocking the failure. |
| 6 | BUG-BID-003 | SLA expiry + confirmation race requires action at the exact second of the deadline; needs a very precise timing window. |
| 7 | BUG-RIDE-006 | SOS + ride cancellation race requires the driver to cancel at the exact moment the rider triggers SOS; extremely rare in testing. |
| 8 | BUG-PAY-004 | Concurrent wallet deduction requires two transactions to read the same balance before either writes; load testing may not trigger this specific race. |
| 9 | BUG-AUTH-004 | Cross-tenant leakage in system-level APIs only manifests when the specific API is called in a multi-tenant context; rarely tested for tenant isolation. |
| 10 | BUG-AMB-001 | Certification expiry at dispatch time requires the exact date boundary to be crossed; tests usually use fresh data. |
| 11 | BUG-RIDE-001 | Simultaneous rider cancel + driver complete requires two users to act within milliseconds; manual testing cannot reproduce this. |
| 12 | BUG-PAY-006 | Promotion credit laundering via refund requires understanding of the promotion+refund interaction; testers may not think to check what happens to promotion components on refund. |
| 13 | BUG-DRIVER-001 | Duplicate driver sessions require app crash/reopen at the exact moment of session establishment; hard to reproduce intentionally. |
| 14 | BUG-WS-002 | Out-of-order WebSocket messages requires specific load balancer configuration and timing; doesn't manifest in single-server setups. |
| 15 | BUG-PAY-010 | Cache-stale wallet balance requires a write to fail between ledger update and cache invalidation; depends on infrastructure timing. |
| 16 | BUG-DISPATCH-001 | Double assignment requires two acceptances at the exact same millisecond; impossible in manual testing. |
| 17 | BUG-BID-002 | Double award from scheduler + admin requires admin to click "award" at the exact same moment the scheduler fires; extremely unlikely in testing. |
| 18 | BUG-FARE-001 | Routing API fallback to straight-line distance requires the routing API to fail; may not be tested with actual API failures. |
| 19 | BUG-SEC-003 | Rider-driver collusion laundering requires understanding the full financial pipeline; security testing may not cover multi-step financial exploitation. |
| 20 | BUG-CONFIG-002 | Unit mismatches may only manifest when a specific configuration value is changed to a boundary value; hard to catch without explicit unit testing. |
| 21 | BUG-TIME-001 | UTC/Dhaka confusion only manifests for operations near midnight; testing during business hours would never catch it. |
| 22 | BUG-DEL-002 | Duplicate delivery bridge requires a specific network timeout during bridge creation; retry logic testing may not cover this exact scenario. |
| 23 | BUG-MOBILE-003 | Offline queue replay stale actions requires the user to be offline during a specific state transition; rare in normal usage. |
| 24 | BUG-FLEET-004 | Post-billing-cycle fare adjustment requires a dispute to be resolved after the billing cycle closes; temporal dependency. |
| 25 | BUG-SEC-005 | Fake webhook requires the attacker to craft a specific payload; security testing may not cover all webhook endpoints. |
| 26 | BUG-RIDE-003 | Stale location for cancellation fee requires the location cache to be just stale enough to affect the fee calculation; timing-dependent. |
| 27 | BUG-WS-001 | WebSocket reconnection event loss requires network failure during a specific ride lifecycle event; hard to reproduce. |
| 28 | BUG-PAY-009 | Earnings not updated on fare adjustment requires understanding that fare adjustments don't trigger earnings recalculation; architectural knowledge needed. |
| 29 | BUG-BID-001 | Sealed-bid deadline race requires network delay at the exact deadline moment; load testing may not cover this. |
| 30 | BUG-PAY-007 | Tax base amount mismatch requires different code paths for fare vs. tax to read from different sources; only manifests when discount/surge is applied. |

---

## SELF-CRITIQUE

### Areas Potentially Missed or Under-Explored

1. **Internationalization & Localization**: Didn't explicitly cover bugs related to Bengali character handling in addresses, driver names, or shop names. Unicode issues could affect search, display, and matching. Phone number formatting (Bangladesh numbers starting with +880 vs. 01X) could cause identity mismatches.

2. **Rate Limiting & Throttling**: Explored rate limiting briefly (SEC-006) but didn't cover:
   - Rate limiting differences between API and WebSocket endpoints
   - Per-tenant rate limiting bypass
   - Rate limit counter race conditions
   - Rate limit being applied to scheduler/system requests that should be exempt

3. **Database Migrations**: Didn't cover bugs that could arise during schema migrations — data type changes, index rebuilds causing downtime, enum value additions that break old code, column renames affecting running queries.

4. **Analytics & Reporting**: Financial reports could be inconsistent if they read from a different data source (replica vs. primary) than the transactional system, especially during replication lag. Tax reports might include transactions that are later reversed.

5. **More Mobile-Specific Issues**:
   - App version mismatches between rider and driver
   - Older app versions sending deprecated API fields
   - OS-level permission changes (location, notification) breaking functionality silently
   - Battery optimization killing background services on specific Android vendors (Xiaomi, Samsung)

6. **Pagination & Large Dataset Issues**:
   - Cursor-based pagination inconsistency when records are inserted/deleted during iteration (e.g., admin export missing records)
   - Large batch operations (e.g., bulk driver notification) timing out midway, with some drivers notified and others not

7. **External Provider Failures**:
   - Map provider returning different routes for the same request (affects fare consistency)
   - SMS provider failing to deliver OTP but not reporting the failure (user waits forever)
   - Payment gateway returning ambiguous status (neither success nor failure)

8. **More Concurrency Scenarios**:
   - Admin bulk operations conflicting with individual user actions
   - Two admins editing the same entity simultaneously (last-write-wins overwriting changes)
   - Scheduler running a cleanup while a user is mid-operation on the same data

9. **Compliance & Data Retention**:
   - GDPR/data deletion requests not propagating to all services and caches
   - Audit log gaps during failures (the audit entry for a failed transaction might itself fail)
   - Data retention policies deleting records that are still referenced by active entities

10. **Monetary Edge Cases Not Fully Covered**:
    - Rounding errors accumulating over many small transactions (especially with BDT/paisa conversion)
    - Currency display vs. storage precision (showing 50.5 BDT when only integer paisa is stored)
    - Commission calculation on the discounted price vs. full price (affects driver earnings and platform revenue differently)

11. **Cross-Vertical Consistency**:
    - Driver profile updates in one vertical not propagating to others
    - Rating system differences across verticals affecting the same driver
    - Cancellation policy differences between ride-hailing and marketplace orders using the same driver

12. **Disaster Recovery & Failover**:
    - Database failover during an active transaction; wallet deduction committed on primary, ledger write lost in failover
    - Region-level outage affecting some services but not others; partial platform availability

13. **Scheduler Interaction with User Actions** (more scenarios):
    - Subscription auto-renewal failing while the driver is mid-ride (do they get kicked off?)
    - Scheduled maintenance window overlapping with peak ride hours
    - Retry backoff for failed jobs accumulating, causing massive batch retries hours later

14. **Ambulance-Specific** (deeper):
    - Hospital capacity API integration — dispatch to full hospital
    - Multi-ambulance requests for mass casualty events
    - Ambulance ETA communicated to patient being wildly wrong due to traffic model inaccuracy in Dhaka

15. **Duplicate Bug Concerns**:
    - BUG-CROSS-002 (cross-vertical wallet overdraft) and BUG-PAY-004 (concurrent wallet deduction) share the same root cause; should be considered a single class of bug with different triggering scenarios
    - BUG-CONFIG-003 (cached flag propagation) and BUG-DATA-004 (cached business rules) share the same cache invalidation root cause
    - BUG-WS-001 (event loss on reconnect) and BUG-MOBILE-002 (stale state from backgrounding) both result in stale client state but from different causes

16. **Potential Additional Bugs Not Covered**:
    - **Referral abuse**: Friend referral system where users refer themselves or create referral rings
    - **Loyalty point exploitation**: Points earned on refunded transactions not being clawed back
    - **Driver earnings gaming**: Drivers accepting short rides only during peak bonus periods
    - **Geofence bypass**: Users registering in one zone to get lower prices but requesting rides in another
    - **Bulk data export**: Admin exporting large datasets that include soft-deleted or archived records
    - **Notification channel fallback**: SMS fallback for push notifications being charged per-message even when push succeeded on a retry


    # RIDE — INDEPENDENT POSSIBLE-BUG SURVEY (Continued)

## SUPPLEMENTARY CATALOGUE — GAP COVERAGE

Bugs addressing the under-explored areas identified in the self-critique.

---

### SECTION V: MONETARY EDGE CASES & ROUNDING

**BUG-MONEY-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Financial |
| **SERVICE / MODULE** | Fare / Rounding |
| **POSSIBLE BUG** | If fares are calculated using floating-point arithmetic and then rounded to the nearest paisa (or BDT) only at the final step, intermediate rounding differences could accumulate. For example, if a fare is broken into base fare + distance charge + time charge + surge, each component rounded independently, the sum of rounded components could differ from rounding the total. Over thousands of rides per day, this could create a material discrepancy in revenue accounting. |
| **TRIGGER / SCENARIO** | Base fare: 49.995 BDT → rounds to 50.00. Distance: 33.335 BDT → rounds to 33.34. Time: 16.670 BDT → stays 16.67. Sum of rounded = 100.01. But total before component rounding = 100.00. Extra 0.01 BDT per ride × 100,000 rides/day = 1,000 BDT/day phantom revenue. |
| **WHY IT IS PLAUSIBLE** | Floating-point arithmetic and per-component rounding are common; the penny-off problem is well-known in financial systems but often overlooked in ride-hailing. |
| **IMPACT** | Small per-ride discrepancies accumulating to material amounts; accounting reconciliation failures; potential regulatory scrutiny. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | VERY HIGH |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Fare, Payment, Ledger, Accounting |

---

**BUG-MONEY-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Fare / Currency Precision |
| **POSSIBLE BUG** | If the system stores fares in BDT (integer) but the calculation involves fractional paisa (e.g., a 15% commission on 33 BDT = 4.95 BDT), the system must decide whether to truncate (4 BDT) or round (5 BDT). If the platform keeps the truncated amount and the driver gets the truncated amount, the two truncations might not sum to the original fare, leaving a few paisa unaccounted for per transaction. Over millions of transactions, this creates a systematic accounting gap. |
| **TRIGGER / SCENARIO** | Ride fare: 33 BDT. Platform commission: 15% = 4.95 → truncated to 4 BDT. Driver earnings: 33 - 4 = 29 BDT. But 4 + 29 = 33 (correct in this case). However, if the system calculates driver earnings independently as 85% of 33 = 28.05 → truncated to 28 BDT, then 4 + 28 = 32 ≠ 33. One paisa lost. |
| **WHY IT IS PLAUSIBLE** | Independent rounding/truncation of multiple derived amounts from a single base is a classic financial bug. |
| **IMPACT** | Systematic micro-losses accumulating over time; ledger imbalance; audit discrepancies. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | VERY HIGH |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Fare, Commission, Earnings, Ledger |

---

**BUG-MONEY-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Display |
| **SERVICE / MODULE** | Fare / Display |
| **POSSIBLE BUG** | If the fare is stored internally as paisa (integer) but displayed to users in BDT (decimal), the conversion could introduce display artifacts. For example, 1500 paisa = 15.00 BDT (correct), but if the UI formats it as "15 BDT" (dropping the decimal) for values that are whole numbers, a fare of 1550 paisa could be displayed as "15.5 BDT" while the actual charge is 15.50 BDT. This is cosmetic but could cause confusion and disputes, especially if the display inconsistency is between the quoted fare and the charged fare. |
| **TRIGGER / SCENARIO** | Fare quoted as "15 BDT" (displayed without decimal). Actual charge: 1500 paisa = 15.00 BDT. But if a promotion reduces it to 1475 paisa = 14.75 BDT, the display shows "14.75 BDT." User: "I was quoted 15, now charged 14.75? Or was it 15.00?" Confusion escalates if the formatting is inconsistent across screens. |
| **WHY IT IS PLAUSIBLE** | Currency display formatting is often handled differently across different UI components and services. |
| **IMPACT** | User confusion; support tickets; trust erosion; potential regulatory reporting issues. |
| **SEVERITY** | LOW |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Fare display, UI, Customer service |

---

### SECTION W: REFERRAL, LOYALTY & GAMIFICATION

**BUG-REF-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Fraud |
| **SERVICE / MODULE** | Referral System |
| **POSSIBLE BUG** | If the referral system rewards both the referrer and the referred user upon the referred user's first ride, and the system doesn't validate that the referred user is genuinely new (distinct device, distinct payment method, distinct behavioral pattern), a single person could create a referral chain: Account A refers B, B refers C, C refers D, etc. Each "new" account gets the referral bonus, and the original person accumulates rewards from all accounts. |
| **TRIGGER / SCENARIO** | User creates accounts with 10 different SIM cards. A→B→C→D→E→F→G→H→I→J. Each referral gives 100 BDT to the referrer. User gets 900 BDT in referral rewards across account A. Each new account also gets a first-ride bonus. Total exploit: 900 BDT referral + 10 × first-ride bonus. |
| **WHY IT IS PLAUSIBLE** | Referral chain detection requires graph analysis of account relationships; simple per-account validation misses multi-hop chains. |
| **IMPACT** | Referral budget drain; fraudulent reward accumulation; financial loss. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Referral, Auth, Fraud detection, Wallet |

---

**BUG-REF-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Idempotency |
| **SERVICE / MODULE** | Referral / Loyalty Points |
| **POSSIBLE BUG** | If loyalty points are awarded upon ride completion, and the ride completion event is processed twice (due to event bus retry or duplicate message), the loyalty points could be awarded twice. If the ride is later refunded, the loyalty points might not be clawed back, allowing the user to keep points for a ride they didn't pay for. |
| **TRIGGER / SCENARIO** | Ride completes. Event "ride_completed" published. Loyalty handler processes it → awards 50 points. Event bus redelivers the event (retry). Loyalty handler processes again → awards another 50 points. User has 100 points instead of 50. Ride is refunded later. Points not clawed back. |
| **WHY IT IS PLAUSIBLE** | Event-driven point awards are rarely idempotent; point clawback on refund is a separate flow that may not exist. |
| **IMPACT** | Inflated loyalty points; redeemable for real value (discounts, free rides); financial loss. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Loyalty, Events, Refunds |

---

**BUG-REF-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Loyalty / Redemption |
| **POSSIBLE BUG** | If loyalty points can be redeemed for ride discounts or wallet credit, and the redemption rate changes (e.g., 100 points = 10 BDT becomes 100 points = 8 BDT), users who accumulated points under the old rate would find their points devalued. If this isn't communicated or handled with a grace period, it could lead to disputes. More critically, if the system allows a user to redeem points at the moment of the rate change (reading the old rate for the balance check but applying the new rate for the redemption), the user could get more or less value than expected. |
| **TRIGGER / SCENARIO** | User has 1000 points. Old rate: 100 points = 10 BDT (worth 100 BDT). New rate: 100 points = 8 BDT (worth 80 BDT). User initiates redemption at the exact moment of rate change. Balance check reads old rate: 1000 points ≥ 1000 (enough for 100 BDT). Redemption applies new rate: 1000 × 0.08 = 80 BDT credited. User expected 100 BDT. Or conversely: balance check reads new rate, redemption applies old rate. |
| **WHY IT IS PLAUSIBLE** | Rate change and redemption are separate operations; reading the rate and applying it can be inconsistent during the change window. |
| **IMPACT** | User gets wrong value for points; disputes; trust erosion. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Loyalty, Redemption, Wallet |

---

### SECTION X: INTERNATIONALIZATION & LOCALIZATION

**BUG-I18N-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Integrity |
| **SERVICE / MODULE** | Addresses / Search |
| **POSSIBLE BUG** | If addresses can be entered in both Bengali (বাংলা) and English, and the search/matching system normalizes to one script, addresses entered in Bengali might not match against a geocoding database that expects English transliteration. This could cause the same physical location to have different records depending on the language used, leading to duplicate shop listings, mismatched pickup points, or failed address validation. |
| **TRIGGER / SCENARIO** | Shop owner registers address as "ধানমন্ডি ২৭ নম্বর" in Bengali. Customer searches for "Dhanmondi 27" in English. No match found. Same location has two representations that don't cross-reference. |
| **WHY IT IS PLAUSIBLE** | Multi-script address handling requires transliteration or a normalized key, which is non-trivial for Bengali/English. |
| **IMPACT** | Search failures; duplicate records; geocoding errors; poor user experience. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Addresses, Search, Geocoding, Marketplace |

---

**BUG-I18N-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Integrity / Security |
| **SERVICE / MODULE** | User Input / SQL / XSS |
| **POSSIBLE BUG** | If Bengali Unicode characters in user-supplied fields (names, addresses, shop descriptions) are not properly sanitized, they could be used for injection attacks. Some Bengali characters have Unicode normalization forms that could bypass input validation filters designed for ASCII/English characters. Similarly, zero-width characters in Bengali text could be used to create visually identical but technically different usernames or shop names for impersonation. |
| **TRIGGER / SCENARIO** | Attacker creates a shop named "রাইড শপ" (Ride Shop) with a zero-width joiner character inserted, making it visually identical to a legitimate shop but technically different. Customers search for the legitimate shop, find both, and may order from the impersonator. |
| **WHY IT IS PLAUSIBLE** | Unicode normalization and zero-width character filtering is often overlooked, especially for non-Latin scripts. |
| **IMPACT** | Shop impersonation; customer fraud; reputation damage; potential data theft. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Marketplace, Shops, Auth, User profiles |

---

**BUG-I18N-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Phone Numbers / Auth |
| **POSSIBLE BUG** | Bangladesh phone numbers can be represented in multiple formats: +8801XXXXXXXXX, 8801XXXXXXXXX, 01XXXXXXXXX, or 1XXXXXXXXX (without leading zero). If the system doesn't normalize phone numbers to a single format at input time, the same phone number could be associated with multiple accounts, or login/OTP could fail because the stored format doesn't match the input format. |
| **TRIGGER / SCENARIO** | User registers with "01712345678." Later tries to log in with "+8801712345678." System doesn't find a match because the stored format is different. OTP sent to a different "version" of the number. User locked out. Or worse: two accounts exist for the same physical phone (one with "017..." and one with "+88017..."). |
| **WHY IT IS PLAUSIBLE** | Phone number normalization is a notoriously tricky problem, especially with country codes. |
| **IMPACT** | Duplicate accounts; login failures; OTP delivery to wrong record; identity confusion. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Auth, User accounts, OTP, SMS |

---

### SECTION Y: EXTERNAL PROVIDER FAILURES

**BUG-EXT-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / External |
| **SERVICE / MODULE** | Map / Routing API |
| **POSSIBLE BUG** | If the routing/directions API returns different routes for the same origin-destination pair on consecutive calls (which is common — Google Maps and others use real-time traffic data that changes by the second), the estimated fare and ETA could be different each time they're calculated. If the fare is quoted at request time using one route but the actual distance is tracked using a different route (calculated at completion), the final fare could differ from the quote. |
| **TRIGGER / SCENARIO** | Rider requests ride. Route API returns Route A (5km, 15 min, 200 BDT). Quoted to rider. At ride completion, route API returns Route B (5.5km, 12 min, 215 BDT) — different route due to traffic change. Rider charged 215 BDT instead of quoted 200 BDT. |
| **WHY IT IS PLAUSIBLE** | Routing APIs are non-deterministic; the same query can return different results based on real-time traffic conditions. |
| **IMPACT** | Fare mismatch between quote and charge; rider disputes; trust erosion. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Routing, Fare, ETA, Rider experience |

---

**BUG-EXT-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / External |
| **SERVICE / MODULE** | SMS / OTP |
| **POSSIBLE BUG** | If the SMS provider fails to deliver an OTP but does not report the failure back to the platform (silent failure), the user waits for an OTP that never arrives. The platform's OTP system shows the OTP as "sent" and the countdown timer ticks down. The user is stuck — they can't log in, can't request a new OTP until the timer expires, and the platform has no way to know the SMS wasn't delivered. |
| **TRIGGER / SCENARIO** | User requests OTP. Platform sends via SMS provider. SMS provider's delivery to the carrier fails silently (carrier network congestion, number portability issue). User waits. Timer expires. User requests new OTP. Same SMS provider, same failure. User gives up. |
| **WHY IT IS PLAUSIBLE** | SMS delivery is fire-and-forget for many providers; delivery receipts are unreliable or delayed. |
| **IMPACT** | User unable to log in or complete verification; lost user; support escalation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | SMS, OTP, Auth, User onboarding |

---

**BUG-EXT-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / External |
| **SERVICE / MODULE** | Payment Gateway |
| **POSSIBLE BUG** | If the payment gateway returns an ambiguous status — neither clearly "success" nor clearly "failure" (e.g., HTTP 200 with an internal error code, or a timeout after the gateway received the request but before it responded) — the platform must decide whether to treat it as success or failure. If treated as success (optimistic), money might not actually have been deducted. If treated as failure (pessimistic), money might have been deducted but the user is told it failed, prompting a retry and double-charge. |
| **TRIGGER / SCENARIO** | Rider pays 500 BDT via bKash. bKash processes the payment (money deducted from rider's bKash account) but the response times out. Platform treats it as failed. Rider retries. bKash processes again. Rider charged 1000 BDT for a 500 BDT ride. Or: platform treats it as success but bKash didn't actually process it. Rider rides for free. |
| **WHY IT IS PLAUSIBLE** | Ambiguous payment statuses are common with mobile financial services (bKash, Nagad) in Bangladesh; the platform must implement a reconciliation/verification step. |
| **IMPACT** | Double-charge or free service; financial loss for rider or platform; disputes; regulatory issues. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Payment, External APIs, Wallet, Reconciliation |

---

**BUG-EXT-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / External |
| **SERVICE / MODULE** | Map / Geocoding |
| **POSSIBLE BUG** | If the geocoding service (converting addresses to coordinates) is unavailable or returns errors, riders might be unable to set pickup or dropoff locations. If the system falls back to a cached or default location (e.g., city center), rides could be requested to completely wrong locations. Similarly, if reverse geocoding (converting GPS coordinates to addresses for driver display) fails, drivers might not see the pickup address, only raw coordinates. |
| **TRIGGER / SCENARIO** | Geocoding API is down. Rider types "Gulshan 1, Dhaka." System can't geocode → falls back to (0,0) or city center coordinates. Ride is dispatched with a pickup point in the middle of Dhaka city center rather than Gulshan. Driver goes to wrong location. |
| **WHY IT IS PLAUSIBLE** | External API failures with poorly designed fallbacks are common. |
| **IMPACT** | Wrong pickup/dropoff; wasted trips; terrible user experience; driver frustration. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Geocoding, Dispatch, Location, Rider/Driver experience |

---

### SECTION Z: PAGINATION, BATCH & LARGE DATA OPERATIONS

**BUG-BATCH-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Consistency |
| **SERVICE / MODULE** | Admin / Export |
| **POSSIBLE BUG** | If admin data exports (e.g., ride history, financial reports) use offset-based pagination and records are inserted or deleted during the export, the export could either miss records (if records shift due to inserts) or include duplicates (if records shift due to deletes). This is especially problematic for financial reconciliation exports where completeness is critical. |
| **TRIGGER / SCENARIO** | Admin exports all rides for January. Page 1: rides 1-100. During page 2 fetch, a new ride is inserted at position 101 (from a delayed completion). Page 2 now returns rides 101-200, but ride 101 is the newly inserted one, and the original ride 101 has shifted to position 102. The export misses the original ride 101. |
| **WHY IT IS PLAUSIBLE** | Offset-based pagination is not stable under concurrent modifications; cursor-based pagination is needed but may not be used. |
| **IMPACT** | Incomplete financial exports; missing records in reconciliation; audit failures. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Admin, Export, Financial reporting, Reconciliation |

---

**BUG-BATCH-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Scheduler / Concurrency |
| **SERVICE / MODULE** | Notifications / Bulk |
| **POSSIBLE BUG** | If a bulk notification job (e.g., "notify all drivers about a policy change") processes drivers in batches and the job fails midway through (after sending to some drivers but not others), restarting the job could either re-send notifications to already-notified drivers (duplicate notifications) or, if the job tracks progress but the progress marker is lost, start from the beginning (duplicate to all). |
| **TRIGGER / SCENARIO** | Notify 10,000 drivers. Job processes 5,000 then crashes. Progress marker saved to database but the database write failed. Job restarts from driver #1. Drivers 1-5,000 get the notification twice. |
| **WHY IT IS PLAUSIBLE** | Batch job progress tracking and crash recovery are often implemented naively. |
| **IMPACT** | Duplicate notifications; user annoyance; support tickets; loss of trust in notification system. |
| **SEVERITY** | LOW |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Notifications, Scheduler, Bulk operations |

---

**BUG-BATCH-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Resource / Performance |
| **SERVICE / MODULE** | Admin / Reports |
| **POSSIBLE BUG** | If an admin generates a large report (e.g., all rides for the year) without query limits or timeouts, the query could consume excessive database resources, causing slowdowns or timeouts for all other database-dependent operations (ride creation, payment processing, dispatch matching). A single admin report could effectively cause a platform-wide degradation. |
| **TRIGGER / SCENARIO** | Admin requests "all rides for 2024" report. Query runs for 5 minutes, consuming a database connection and significant I/O. During this time, ride completion queries time out. Payments fail. Drivers can't update locations. Platform effectively down. |
| **WHY IT IS PLAUSIBLE** | Admin queries often run against the primary database without resource isolation. |
| **IMPACT** | Platform-wide performance degradation; failed transactions; cascading failures. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Admin, Database, All services |

---

### SECTION AA: COMPLIANCE, DATA RETENTION & AUDIT

**BUG-COMPLY-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Compliance / Data |
| **SERVICE / MODULE** | Data Retention / Deletion |
| **POSSIBLE BUG** | If a user requests account deletion (data deletion request), and the system deletes the user record but not all associated records across all services (ride history, wallet transactions, ratings given/received, marketplace orders, fleet associations), the platform retains personally identifiable information (PII) in violation of data protection requirements. Additionally, if the user's ride history is needed for ongoing dispute resolution, premature deletion could hinder the resolution. |
| **TRIGGER / SCENARIO** | User requests account deletion. User table record deleted. But ride history (with pickup/dropoff addresses — PII), wallet transactions (with bank details — PII), marketplace orders (with delivery address — PII), and driver ratings (with identifiable comments) still exist in their respective tables. Audit team later discovers incomplete deletion. |
| **WHY IT IS PLAUSIBLE** | Data deletion across a distributed system with many tables is extremely complex; cascade deletes may not reach all services. |
| **IMPACT** | Regulatory non-compliance; potential fines; user trust violation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | All services, Data retention, Compliance, Audit |

---

**BUG-COMPLY-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Audit / Data Integrity |
| **SERVICE / MODULE** | Audit Logs |
| **POSSIBLE BUG** | If audit logging is implemented as a side effect of the main operation (e.g., write to audit log after processing a financial transaction), and the audit log write fails, the financial transaction may have already been committed. The system would have a financial operation with no audit trail. If the audit log write is in the same transaction as the financial operation, the audit log failure would roll back the financial operation, which might be worse (preventing valid operations due to logging issues). |
| **TRIGGER / SCENARIO** | Admin processes a 10,000 BDT refund. Refund committed to wallet. Audit log write fails (audit log database full or unavailable). No record of who authorized the refund, when, or why. Regulatory audit discovers the gap. |
| **WHY IT IS PLAUSIBLE** | Audit logging is often a secondary concern; making it transactional with the main operation has performance and reliability trade-offs. |
| **IMPACT** | Missing audit trail; regulatory non-compliance; inability to investigate fraud or disputes. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Audit, Financial, Compliance |

---

### SECTION BB: DATABASE MIGRATIONS & SCHEMA CHANGES

**BUG-MIGRATE-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Deployment / Data Integrity |
| **SERVICE / MODULE** | Database / Migrations |
| **POSSIBLE BUG** | If a database migration adds a new enum value (e.g., a new ride status "arriving") and deploys the database change before the application code is updated (or vice versa), the application could encounter an unknown enum value and crash, or the database could reject a valid new status because the application hasn't been updated yet. In a rolling deployment, some application instances might know the new enum while others don't. |
| **TRIGGER / SCENARIO** | Database migration adds ride status "arriving." Old application instances receive an event with status "arriving" from a new instance. Old instance doesn't recognize the status → throws error or ignores the event. Rider's app connected to old instance doesn't receive the update. |
| **WHY IT IS PLAUSIBLE** | Rolling deployments with database migrations create a window where different instances have different schema awareness. |
| **IMPACT** | Application errors during deployment; missed events; inconsistent behavior across instances. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Database, Deployment, All services |

---

**BUG-MIGRATE-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Deployment / Data |
| **SERVICE / MODULE** | Database / Column Change |
| **POSSIBLE BUG** | If a migration renames a column (e.g., `fare` → `total_fare`) and the old application code reads `fare` while the new code reads `total_fare`, during the deployment window the old code would get NULL or errors (column doesn't exist) and the new code would work. If the migration is done as add-new-column + copy-data + drop-old-column, there's a window where data is being copied and both columns have potentially different values. |
| **TRIGGER / SCENARIO** | Migration adds `total_fare` column and copies data from `fare`. During the copy, a new ride is created. The new ride's `fare` is set but `total_fare` is NULL (trigger not yet active). Old code reads `fare` → correct. New code reads `total_fare` → NULL → error or 0 fare. |
| **WHY IT IS PLAUSIBLE** | Column migrations on live tables with concurrent writes are inherently risky. |
| **IMPACT** | NULL or incorrect values during migration; application errors; incorrect fare displays. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Database, Deployment, All services using the column |

---

### SECTION CC: DISASTER RECOVERY & FAILOVER

**BUG-DR-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / Failover |
| **SERVICE / MODULE** | Database / Failover |
| **POSSIBLE BUG** | If the primary database fails over to a replica, and the replica has replication lag (even a few seconds), transactions that were committed on the primary but not yet replicated to the replica would be lost. Wallet deductions, ride completions, and payment records from those few seconds would disappear, as if they never happened. Users would see their money reappear (wallet balance restored) or their rides revert to a previous state. |
| **TRIGGER / SCENARIO** | Ride completes at T1. Wallet debit committed at T1.1. Primary database crashes at T1.2. Replica promoted at T1.3. Replica's last replicated point: T0.9. The wallet debit and ride completion are lost. Rider's wallet shows original balance (money back). Driver's ride shows as still active. But the ride already happened physically. |
| **WHY IT IS PLAUSIBLE** | Asynchronous replication is standard for performance; synchronous replication has significant performance costs. |
| **IMPACT** | Lost transactions; phantom money; rides in inconsistent states; massive reconciliation effort. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | VERY LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Database, All services, Financial, Ride lifecycle |

---

**BUG-DR-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Distributed / Split-Brain |
| **SERVICE / MODULE** | Database / Cluster |
| **POSSIBLE BUG** | If a database cluster experiences a network partition (split-brain), and both partitions believe they are the primary, writes could be accepted by both partitions. When the partition heals, conflicting writes would need to be resolved. A wallet could be debited in one partition and credited in the other, with both writes being "valid" in their respective partitions but creating an inconsistent state when merged. |
| **TRIGGER / SCENARIO** | Network partition. Partition A: rider's wallet debited 500 BDT for a ride. Partition B: rider's wallet debited 300 BDT for another ride. Both partitions accept the writes. Partition heals. Both debits applied. Total debit: 800 BDT. But rider only had 600 BDT. |
| **WHY IT IS PLAUSIBLE** | Split-brain scenarios are rare but possible in any distributed database; resolution depends on the database's consistency model. |
| **IMPACT** | Data corruption; financial inconsistencies; potential platform-wide data integrity issues. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | VERY LOW |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Database, All services, Financial |

---

### SECTION DD: MULTI-DEVICE & APP VERSION

**BUG-APP-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Compatibility |
| **SERVICE / MODULE** | Mobile / App Version |
| **POSSIBLE BUG** | If the rider's app is on version 2.0 (supports multi-stop rides) but the driver's app is on version 1.5 (doesn't support multi-stop), and a multi-stop ride is dispatched to this driver, the driver's app might not display the additional stops, not allow the driver to mark intermediate stops as completed, or crash when receiving the multi-stop ride data. The driver would complete the ride as a regular point-to-point, skipping intermediate stops. |
| **TRIGGER / SCENARIO** | Rider creates A→B→C multi-stop ride. Driver with old app accepts. Driver's app shows only A→C. Driver drives directly to C, skipping B. Rider's stop at B is missed. |
| **WHY IT IS PLAUSIBLE** | App version mismatches between rider and driver are common; backward compatibility for new features is often incomplete. |
| **IMPACT** | Missed stops; poor rider experience; incorrect fare (route A→C instead of A→B→C); disputes. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | EASY |
| **AFFECTED AREAS** | Mobile, Multi-stop, Ride lifecycle, Dispatch |

---

**BUG-APP-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Compatibility / Data |
| **SERVICE / MODULE** | Mobile / API Version |
| **POSSIBLE BUG** | If the API introduces a breaking change (e.g., a field renamed, an enum value added, a response structure changed) and the old mobile app version doesn't handle the change gracefully, the app could crash, display incorrect data, or silently drop critical information. Since mobile app updates are not instantaneous (users may delay updating), there's a long window where old app versions interact with new API versions. |
| **TRIGGER / SCENARIO** | API v3 changes ride status from "in_progress" to "en_route." Old app checks for "in_progress" status. Status is now "en_route." Old app doesn't recognize it → treats ride as in unknown state → UI shows loading spinner indefinitely. Driver can't interact with the ride. |
| **WHY IT IS PLAUSIBLE** | API backward compatibility is often broken during rapid development; old app versions in the wild create a compatibility matrix. |
| **IMPACT** | App crashes or frozen UI for users on old versions; ride stuck; can't complete ride; safety issue if driver is mid-ride. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Mobile, API, All versions, Ride lifecycle |

---

### SECTION EE: OPERATING SYSTEM & DEVICE-SPECIFIC

**BUG-OS-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Platform / Device |
| **SERVICE / MODULE** | Mobile / Location |
| **POSSIBLE BUG** | Android battery optimization (particularly aggressive on Xiaomi, Samsung, Huawei, and other Chinese/Asian manufacturers) kills background services, including location tracking and WebSocket connections. This means drivers on these devices would stop reporting location updates and go "invisible" to the dispatch system while their screen is off, even though they're actively driving. The dispatch system thinks the driver is unavailable, and location history has gaps. |
| **TRIGGER / SCENARIO** | Driver with Xiaomi phone accepts a ride. Screen turns off during drive to pickup. Xiaomi's MIUI battery optimizer kills the app's background processes. Driver's location stops updating. Dispatch system thinks driver has gone offline. Rider sees "driver has disconnected." Auto-redispatch may trigger, assigning another driver. Original driver arrives at pickup to find rider confused or gone. |
| **WHY IT IS PLAUSIBLE** | Chinese Android manufacturers are notorious for aggressive battery optimization; standard Android foreground services may not be sufficient. |
| **IMPACT** | Driver goes invisible mid-ride; rider confusion; duplicate dispatch; safety issue (can't track driver). |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Mobile, Location, Dispatch, WebSocket, Safety |

---

**BUG-OS-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Platform / Permissions |
| **SERVICE / MODULE** | Mobile / Permissions |
| **POSSIBLE BUG** | If a user revokes location permission while the app is running (e.g., through system settings), the app might not detect the revocation immediately and continue acting as if location is available. The app could send stale/last-known location, or send (0,0) coordinates, which could cause the dispatch system to match the driver to a ride at the null island (0°N, 0°E) in the Gulf of Guinea. |
| **TRIGGER / SCENARIO** | Driver goes online. Location permission granted. Driver starts accepting rides. During a ride, driver's child changes phone settings and revokes location permission. App doesn't detect it. Last known location continues to be reported. Dispatch matches based on stale location. Driver is actually somewhere else. |
| **WHY IT IS PLAUSIBLE** | Permission revocation detection is not always immediate; some apps only check permissions at app start. |
| **IMPACT** | Stale or invalid location data; wrong dispatch; ride mismatches; safety concern. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Mobile, Location, Dispatch, Permissions |

---

### SECTION FF: ADDITIONAL CROSS-SERVICE INTERACTIONS

**BUG-XSVC-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cross-Service / Saga |
| **SERVICE / MODULE** | Ride → Payment → Wallet → Notification |
| **POSSIBLE BUG** | In a multi-step ride completion saga (1. End ride → 2. Calculate fare → 3. Deduct from rider wallet → 4. Credit driver wallet → 5. Apply commission → 6. Send notifications), if step 3 succeeds but step 4 fails, the saga needs compensation (rollback step 3). If the compensation also fails (or is not implemented), the rider is charged but the driver isn't paid. If the saga retries from step 3 (instead of compensating), the rider could be double-charged. |
| **TRIGGER / SCENARIO** | Ride ends. Fare = 500 BDT. Step 3: rider wallet debited 500. Step 4: driver wallet credit fails (database timeout). Saga retries from step 3: rider wallet debited 500 again. Rider now out 1000 BDT. Driver still not paid. |
| **WHY IT IS PLAUSIBLE** | Saga pattern implementation is complex; retry logic often doesn't distinguish between "never attempted" and "attempted and failed." |
| **IMPACT** | Rider double-charged; driver not paid; financial chaos; support nightmare. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Payment, Wallet, Saga, Ride lifecycle |

---

**BUG-XSVC-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cross-Service / Eventual Consistency |
| **SERVICE / MODULE** | Driver Profile → Dispatch → Fleet |
| **POSSIBLE BUG** | If a driver's profile is updated (e.g., vehicle changed, license renewed, zone preference updated) in the driver service, but the dispatch service uses a cached copy of the driver profile for matching, there's a window where the dispatch service matches based on stale profile data. A driver with a new vehicle could be matched based on their old vehicle type. A driver who changed zones could still be dispatched in the old zone. |
| **TRIGGER / SCENARIO** | Driver changes vehicle from sedan to SUV in their profile. Dispatch cache still shows sedan. A rider requests an SUV ride. Dispatch matches this driver (thinks they have a sedan → wrong match). Or: rider requests a sedan, dispatch doesn't match this driver (thinks they have a sedan → should match, but the cache is stale and the vehicle type was just updated to SUV in the wrong direction). |
| **WHY IT IS PLAUSIBLE** | Eventual consistency between services that use cached profile data. |
| **IMPACT** | Wrong vehicle dispatched; rider gets different vehicle type than requested; compliance issues (vehicle type restrictions). |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Driver profile, Dispatch, Fleet, Cache |

---

**BUG-XSVC-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Cross-Service |
| **SERVICE / MODULE** | Shop Order → Payment → Delivery → Wallet |
| **POSSIBLE BUG** | In a marketplace order flow (order placed → payment collected → shop confirms → delivery assigned → delivery completed → payment released to shop), if the payment is collected from the customer but the shop rejects the order (out of stock), the refund flow must trigger. If the refund flow doesn't trigger automatically, or if it triggers but fails, the customer's money is held indefinitely with no order fulfilled. If the delivery was already assigned when the shop rejects, the delivery driver might also be affected (wasted trip). |
| **TRIGGER / SCENARIO** | Customer pays 1000 BDT for an order. Payment collected. Delivery driver assigned. Shop realizes item is out of stock and rejects the order. Refund should be triggered. But the refund handler checks order status and sees "delivery assigned" → doesn't refund (thinks it's in progress). Order is stuck: no refund, no delivery, no product. |
| **WHY IT IS PLAUSIBLE** | Refund eligibility logic may not handle all combinations of order and delivery states. |
| **IMPACT** | Customer money held indefinitely; no product delivered; support escalation. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Marketplace, Payment, Delivery, Refunds |

---

### SECTION GG: DRIVER EARNINGS GAMING & BEHAVIORAL

**BUG-GAME-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Fraud |
| **SERVICE / MODULE** | Ride-hailing / Earnings |
| **POSSIBLE BUG** | If drivers earn bonuses for completing a certain number of rides per day (e.g., "complete 20 rides and get a 500 BDT bonus"), drivers could game the system by taking very short rides (e.g., driving a friend 100 meters) to hit the ride count threshold. The bonus would cost the platform more than the commission earned from the short rides. If the system doesn't check minimum ride distance or fare for bonus eligibility, this abuse is trivial. |
| **TRIGGER / SCENARIO** | Driver needs 20 rides for bonus. Has 15 real rides. Gets a friend to request 5 more very short rides (50 BDT each). Driver completes them quickly. Hits 20 rides. Gets 500 BDT bonus. Platform earned 5 × 50 × 20% = 50 BDT commission from fake rides. Paid 500 BDT bonus. Net loss: 450 BDT. |
| **WHY IT IS PLAUSIBLE** | Ride count bonuses without minimum fare/distance thresholds are easily gameable. |
| **IMPACT** | Platform financial loss; gaming of incentive system; unfair to honest drivers. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Earnings, Promotions, Trust & Safety |

---

**BUG-GAME-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Fraud |
| **SERVICE / MODULE** | Ride-hailing / Surge |
| **POSSIBLE BUG** | If surge pricing is area-based and drivers can see surge zones on their map, drivers could collectively go offline in a specific area to artificially create low supply, triggering surge pricing, and then go back online to capture the higher fares. This is a form of driver collusion that's difficult to detect because each individual driver is simply "choosing" when to be online. |
| **TRIGGER / SCENARIO** | Group of 20 drivers coordinate (via WhatsApp) to all go offline in Gulshan at 5 PM. Demand remains high. Supply drops. System triggers 2x surge. Drivers go back online at 5:10 PM and capture surge rides. |
| **WHY IT IS PLAUSIBLE** | Individual driver behavior is hard to distinguish from collusion; the platform can't force drivers to stay online. |
| **IMPACT** | Artificially inflated prices for riders; revenue manipulation; trust erosion; regulatory scrutiny. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | VERY HARD |
| **AFFECTED AREAS** | Surge, Driver behavior, Pricing, Trust & Safety |

---

### SECTION HH: ADDITIONAL SECURITY CONSIDERATIONS

**BUG-SECX-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / API |
| **SERVICE / MODULE** | Admin / API |
| **POSSIBLE BUG** | If the admin API doesn't have rate limiting per admin user (only per IP), an admin account that's been compromised could be used to make thousands of API calls (data extraction, bulk operations) without triggering rate limits, especially if the attacker uses the same IP or rotates through allowed IP ranges. |
| **TRIGGER / SCENARIO** | Attacker gains admin credentials. Uses them to extract all user data via paginated API calls. No rate limit on admin endpoints (trusted internal users). Attacker extracts 100,000 user records with PII before anyone notices. |
| **WHY IT IS PLAUSIBLE** | Admin endpoints often have relaxed rate limiting because they're "trusted" internal users. |
| **IMPACT** | Mass data exfiltration; PII breach; regulatory catastrophe. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Admin, API, Security, All data |

---

**BUG-SECX-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / API |
| **SERVICE / MODULE** | API / Mass Assignment |
| **POSSIBLE BUG** | If the ride request or order creation API accepts JSON bodies and doesn't strictly validate which fields are user-settable, a malicious user could inject fields that should be server-controlled (e.g., `"fare": 1`, `"status": "completed"`, `"driver_commission_rate": 0.01`). If these fields are blindly written to the database, the user could manipulate their own ride's fare or a driver's commission. |
| **TRIGGER / SCENARIO** | Attacker sends a ride request with additional fields: `{"pickup": "...", "dropoff": "...", "fare": 10, "surge_multiplier": 0.1}`. If the API doesn't strip unknown fields, the ride is created with a 10 BDT fare and minimal surge. |
| **WHY IT IS PLAUSIBLE** | Mass assignment vulnerabilities are common in frameworks that auto-bind request parameters to model objects. |
| **IMPACT** | Fare manipulation; commission manipulation; financial fraud. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | API, Fare, All creation endpoints |

---

**BUG-SECX-003**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Security / Privacy |
| **SERVICE / MODULE** | Ride-hailing / Live Tracking |
| **POSSIBLE BUG** | If the live tracking WebSocket endpoint authenticates the connection at the start but doesn't re-validate authorization for each subsequent location update, a user who was authorized to track a ride (e.g., the rider) could continue receiving location updates even after the ride ends or their authorization is revoked. More dangerously, if the tracking token is shared (e.g., rider shares tracking link with family), the token could be reused to track other rides if it's not scoped to a specific ride ID. |
| **TRIGGER / SCENARIO** | Rider shares live tracking link with family member. Link contains a tracking token. Family member extracts the token. If the token is not scoped to the specific ride, the family member could potentially use it to track the rider's future rides (if the token is based on user ID rather than ride ID). |
| **WHY IT IS PLAUSIBLE** | Tracking tokens are often designed for convenience (shareable links) without strict scope enforcement. |
| **IMPACT** | Privacy violation; stalking vector; location tracking beyond authorized scope. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Live tracking, WebSocket, Privacy, Security |

---

### SECTION II: AMBULANCE & EMERGENCY (DEEPER)

**BUG-AMB-004**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic / Safety |
| **SERVICE / MODULE** | Ambulance / Hospital Integration |
| **POSSIBLE BUG** | If the ambulance dispatch system considers hospital proximity for routing (directing the ambulance to the nearest appropriate hospital), but doesn't integrate with hospital capacity/availability data, the ambulance could be directed to a hospital that is full or doesn't have the relevant specialist (e.g., no burn unit). The driver would need to re-route mid-transport, losing critical time. |
| **TRIGGER / SCENARIO** | Burn victim needs transport. Dispatch routes to nearest hospital (2km). Nearest hospital has no burn unit. Ambulance arrives, is redirected to a hospital 8km away with a burn unit. 8km re-route in Dhaka traffic could take 20+ minutes. |
| **WHY IT IS PLAUSIBLE** | Hospital capacity/specialty integration is complex and often not available in real-time. |
| **IMPACT** | Delayed emergency care; potential life-threatening consequence; poor patient outcome. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | MEDIUM |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Ambulance, Hospital, Emergency, Routing |

---

**BUG-AMB-005**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Concurrency / Safety |
| **SERVICE / MODULE** | Ambulance / Mass Casualty |
| **POSSIBLE BUG** | If a mass casualty event generates multiple simultaneous ambulance requests in the same area, and the dispatch system processes them sequentially (queue-based), the first request might consume all nearby ambulances, leaving subsequent requests (potentially more severe) with no available ambulances. If there's no triage-based prioritization, the dispatch order would be FIFO rather than severity-based. |
| **TRIGGER / SCENARIO** | Building collapse. 10 people need ambulances. 5 ambulances available. First 5 requests (processed first) get ambulances. Remaining 5 have to wait for ambulances to return. But the 6th person might have life-threatening injuries while the 1st person had minor injuries. No severity-based prioritization. |
| **WHY IT IS PLAUSIBLE** | FIFO dispatch is simpler to implement; severity-based dispatch requires real-time triage data. |
| **IMPACT** | Most severe patients not prioritized; delayed care for critical patients; potential loss of life. |
| **SEVERITY** | CRITICAL |
| **LIKELIHOOD** | LOW |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Ambulance, Dispatch, Emergency, Triage |

---

### SECTION JJ: ANALYTICS & REPORTING

**BUG-ANALYTICS-001**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Data Consistency |
| **SERVICE / MODULE** | Reporting / Analytics |
| **POSSIBLE BUG** | If financial reports are generated from a read replica (for performance) and the replica has replication lag, the report could show different numbers depending on when it's run. A report run at 9 AM might show 100 rides and 50,000 BDT revenue, while the same report run at 9:05 AM (after replication catches up) might show 105 rides and 52,500 BDT. If these reports are used for tax filing or partner settlements, the inconsistency creates problems. |
| **TRIGGER / SCENARIO** | Finance team runs daily revenue report at 8 AM (replica lag: 5 minutes). Report shows yesterday's revenue as 100,000 BDT. They run it again at 10 AM (replica has caught up). Report shows 103,000 BDT. The 3,000 BDT difference is rides that were in-flight during the first report. Finance filed the 100,000 BDT number. |
| **WHY IT IS PLAUSIBLE** | Read replicas are standard for report generation; replication lag is inherent. |
| **IMPACT** | Incorrect financial reports; tax filing errors; partner settlement discrepancies; audit issues. |
| **SEVERITY** | HIGH |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | HARD |
| **AFFECTED AREAS** | Reporting, Analytics, Financial, Compliance |

---

**BUG-ANALYTICS-002**
| Field | Detail |
|-------|--------|
| **CATEGORY** | Business Logic |
| **SERVICE / MODULE** | Reporting / Tax |
| **POSSIBLE BUG** | If the tax report includes all rides in a period regardless of their final status (completed, refunded, disputed), the tax liability could be overstated. Rides that were later refunded should not be taxed, but if the refund happens after the tax report is filed, the correction may need to be applied to the next period, creating temporal mismatches in tax reporting. |
| **TRIGGER / SCENARIO** | January tax report: 1000 rides, 500,000 BDT revenue, 75,000 BDT VAT. In February, 50 January rides are refunded (25,000 BDT). The 75,000 BDT was already remitted. Now the platform needs to claim back 3,750 BDT VAT. If the reporting system doesn't track cross-period adjustments, this credit is lost. |
| **WHY IT IS PLAUSIBLE** | Tax reporting and refund processing are temporally decoupled; cross-period adjustments are complex. |
| **IMPACT** | Overpayment of tax; financial loss; compliance complexity. |
| **SEVERITY** | MEDIUM |
| **LIKELIHOOD** | HIGH |
| **DETECTION DIFFICULTY** | MEDIUM |
| **AFFECTED AREAS** | Tax, Reporting, Refunds, Compliance |

---

## REVISED TOP 30 RARE BUT SEVERE BUGS

Updated to include supplementary findings that are particularly likely to escape ordinary testing.

| Rank | BUG ID | Why It Escapes Testing |
|------|--------|----------------------|
| 1 | BUG-DR-001 | Database failover with replication lag loses committed transactions; requires infrastructure failure that testing environments rarely simulate. |
| 2 | BUG-DR-002 | Split-brain database partition requires specific network failure mode; almost impossible to reproduce in testing. |
| 3 | BUG-PAY-003 | Double-entry ledger atomicity failure requires exact crash timing between credit and debit. |
| 4 | BUG-XSVC-001 | Saga retry double-charging requires specific failure at step 3 with retry from step 3 instead of compensation. |
| 5 | BUG-DATA-001 | Cross-service chain failure requires specific service to fail at a specific point in a multi-step transaction. |
| 6 | BUG-CROSS-003 | Auto-accept blocking ambulance requires driver to auto-accept at the exact moment of emergency dispatch. |
| 7 | BUG-SCHED-001 | Duplicate scheduler on multi-instance only manifests in production-like multi-instance deployments. |
| 8 | BUG-PAY-008 | Double disbursement requires external API to succeed but lose response; needs production-like external dependencies. |
| 9 | BUG-OS-001 | Battery optimization killing background services is device/manufacturer-specific; testing on standard emulators misses it. |
| 10 | BUG-EXT-003 | Ambiguous payment status from gateway is a production-only failure mode; sandbox APIs don't simulate ambiguity. |
| 11 | BUG-DR-001 | (Same as rank 1) — reinforces that infrastructure-level failures are the hardest to test. |
| 12 | BUG-MONEY-001 | Floating-point rounding accumulation only manifests over millions of transactions; unit tests pass. |
| 13 | BUG-MONEY-002 | Independent truncation of commission and earnings only shows up in aggregate accounting reconciliation. |
| 14 | BUG-SECX-003 | Tracking token scope validation requires understanding the full authorization flow; functional testing focuses on "happy path" tracking. |
| 15 | BUG-AMB-004 | Hospital capacity integration gap only manifests during actual emergencies with specific hospital conditions. |
| 16 | BUG-AMB-005 | Mass casualty dispatch priority only matters in rare multi-victim events; testing doesn't simulate 10+ simultaneous requests. |
| 17 | BUG-GAME-002 | Driver collusion for surge manipulation requires coordinating multiple driver accounts; functional testing uses single drivers. |
| 18 | BUG-APP-001 | Multi-stop with old driver app requires testing across specific version combinations; usually only latest versions are tested. |
| 19 | BUG-BID-003 | SLA expiry + confirmation race at exact deadline requires sub-second timing precision. |
| 20 | BUG-XSVC-002 | Stale dispatch cache after profile update requires the exact timing window between cache write and profile update. |
| 21 | BUG-ANALYTICS-001 | Report inconsistency from replica lag only manifests when reports are run against replicas in production. |
| 22 | BUG-BATCH-001 | Pagination instability during export requires concurrent inserts/deletes during the exact pagination window. |
| 23 | BUG-I18N-002 | Zero-width Unicode character impersonation requires specific Bengali text handling; rarely in test cases. |
| 24 | BUG-COMPLY-001 | Incomplete data deletion across all services requires auditing every table and service; manual testing only checks primary tables. |
| 25 | BUG-COMPLY-002 | Audit log failure during transaction requires the audit log service to be down while the main service is up. |
| 26 | BUG-MIGRATE-001 | Enum value mismatch during rolling deployment requires testing with mixed-version instances. |
| 27 | BUG-SECX-001 | Admin account compromise data exfiltration requires simulating a compromised account; not part of functional testing. |
| 28 | BUG-SECX-002 | Mass assignment vulnerability requires specifically crafted malicious payloads; standard API testing uses expected inputs. |
| 29 | BUG-EXT-001 | Routing API non-determinism causing fare mismatch requires observing multiple calls to the same route API. |
| 30 | BUG-XSVC-003 | Payment collected but shop rejects order requires specific state combination (payment + delivery assigned + shop rejection). |

---

## UPDATED SELF-CRITIQUE

### Additional Areas Still Potentially Under-Explored

1. **Webhook Ordering & Dependencies**: If multiple webhooks from the same provider (e.g., payment gateway sends "payment initiated" then "payment confirmed") arrive out of order, the system might process "confirmed" before "initiated," causing logic errors if the handler assumes sequential delivery.

2. **Graceful Degradation**: If the system degrades gracefully (e.g., falls back to estimated fare when routing API is down), the degraded mode might become the "normal" mode if the dependency is chronically slow, leading to systematically inaccurate fares that are technically "working."

3. **Load Balancer Session Affinity**: If WebSocket connections are load-balanced, a reconnecting client might hit a different server that doesn't have the client's subscription state. Events for the client's ride might be published to the old server, which can no longer deliver them.

4. **Concurrency in Admin Panel**: Multiple admins viewing and editing the same record (same driver's account, same ride's dispute) simultaneously could overwrite each other's changes without conflict detection.

5. **Cross-Timezone for International Users**: While the platform is Bangladesh-focused, if any user or admin accesses from a different timezone (e.g., diaspora users, international fleet operators), all time displays and business logic assumptions about Dhaka time could be wrong for them.

6. **Memory/Resource Leaks in Long-Running Processes**: WebSocket connections that accumulate without cleanup, location update buffers that grow unbounded, or scheduler job queues that accumulate failed jobs could lead to memory exhaustion over time, causing gradual degradation that's hard to attribute to a specific bug.

7. **Encoding Issues in Database**: If the database character set doesn't fully support Bengali Unicode (e.g., using utf8 instead of utf8mb4 in MySQL), certain Bengali characters could be silently truncated or corrupted, leading to data loss in addresses, names, and messages.

8. **Concurrency on Entity Creation**: If two admins create a shop/driver/vehicle with the same unique identifier (e.g., license plate number, trade license number) simultaneously, both could pass the uniqueness check before either commits, resulting in duplicate records.

9. **Event Sourcing / Event Log Gaps**: If the system uses any form of event sourcing or event log for ride state transitions, a gap in the event log (due to a service crash) would make it impossible to reconstruct the ride's history, complicating dispute resolution.

10. **Interaction Between Scheduler and Manual Admin Actions**: If a scheduler job is about to auto-cancel a stale order, and an admin manually updates the order at the same time, the scheduler might overwrite the admin's update or cancel an order the admin just saved.

---

**End of supplementary catalogue.** The total catalogue contains **128 unique possible bugs** across **28 sections**, covering all requested analysis dimensions: functional, business logic, state machine, concurrency, distributed/async, and security/fraud, with specific attention to financial analysis, cross-service interactions, scheduler failures, mobile/network issues, and rare-but-severe scenarios.