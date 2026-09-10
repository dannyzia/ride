# Ride — Independent Possible-Bug Survey

The catalogue below describes theoretical failure modes only. None should be treated as confirmed without verification against the implementation, database constraints, job configuration, event contracts, client behavior, and provider integrations.

## 1. Full Bug Catalogue

### Identity, authorization, tenancy, and lifecycle

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-AUTH-001 | Security | Authentication / sessions | A timed-out login, OTP, or password-reset request could remain usable after a newer request replaces it. | Token invalidation may be non-atomic; account takeover or unauthorized session creation could result. | CRITICAL | HIGH | HARD | Auth, sessions, notifications |
| BUG-AUTH-002 | Concurrency | OTP verification | Two simultaneous OTP submissions could both pass before the attempt is consumed. | Read-then-write verification could allow duplicate authentication or replay. | HIGH | MEDIUM | HARD | Auth, rider, driver |
| BUG-AUTH-003 | Security | Session management | Logout on one device could fail to revoke another active session or an already-issued refresh token. | Revocation state may be cached or device-scoped; unauthorized access could persist. | HIGH | MEDIUM | HARD | Auth, mobile, admin |
| BUG-AUTH-004 | Authorization | RBAC | A user whose role or tenant membership is revoked could retain access through a cached permission decision. | Authorization and cache invalidation may be asynchronous; cross-tenant or privileged access could occur. | CRITICAL | MEDIUM | HARD | RBAC, cache, admin |
| BUG-AUTH-005 | Security | Multi-tenancy | An object lookup could validate the object ID but not the tenant context. | Shared identifiers or incomplete tenant predicates could expose rides, orders, wallets, or reports. | CRITICAL | MEDIUM | HARD | All services |
| BUG-AUTH-006 | Security | Impersonation / support tools | A support or admin action could be recorded under the wrong operator or execute with broader privileges than intended. | Audit identity and execution identity could diverge; sensitive actions may become untraceable. | HIGH | LOW | HARD | Admin, audit, financial |
| BUG-AUTH-007 | Functional | Account lifecycle | Driver, shop, or fleet deactivation could leave active sessions, assignments, or payout eligibility intact. | Lifecycle updates may not propagate to dependent services; inactive actors could continue operating. | HIGH | MEDIUM | MEDIUM | Fleet, dispatch, payments |
| BUG-AUTH-008 | Security | Account recovery | An old recovery link or OTP could remain valid after a phone-number change. | Credential rotation may not invalidate all recovery artifacts; account takeover could result. | CRITICAL | LOW | HARD | Auth, profile |
| BUG-AUTH-009 | Security | Device binding | A device identifier reused after reinstall or number reassignment could be trusted as the previous device. | Weak device identity could bypass risk checks or MFA-like controls. | HIGH | LOW | HARD | Auth, fraud |
| BUG-AUTH-010 | Data consistency | Soft deletion | Deleted users, vehicles, shops, or addresses could remain selectable through cached or denormalized records. | Soft-delete filters may differ across services; actions could target obsolete entities. | MEDIUM | HIGH | MEDIUM | Search, dispatch, marketplace |

### Ride state machine, dispatch, and assignment

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-DISPATCH-001 | Concurrency | Ride assignment | Two drivers could accept the same ride within a narrow timing window. | Acceptance may read an available ride before either transaction claims it; double assignment or conflicting earnings could result. | CRITICAL | HIGH | HARD | Dispatch, driver, notifications |
| BUG-DISPATCH-002 | Concurrency | Auto-accept | Manual acceptance and auto-accept could both claim a ride. | API and scheduler paths may not share an atomic claim operation. | HIGH | MEDIUM | HARD | Dispatch, scheduler |
| BUG-DISPATCH-003 | Concurrency | Redispatch | A cancellation, timeout, and redispatch job could each create or select a different driver assignment. | Multiple actors may operate on stale assignment state; several drivers could be notified. | HIGH | HIGH | HARD | Dispatch, jobs, notifications |
| BUG-DISPATCH-004 | State machine | Ride lifecycle | A ride could move from cancelled or expired back to accepted, arriving, or active. | Transition guards may be incomplete or stale events may be accepted. | CRITICAL | MEDIUM | HARD | Ride, dispatch, payments |
| BUG-DISPATCH-005 | Distributed | Ride lifecycle | A delayed driver event could overwrite a newer rider cancellation or completion state. | Events may lack sequence validation or version checks; state reversal could occur. | HIGH | HIGH | HARD | WebSockets, ride, jobs |
| BUG-DISPATCH-006 | Concurrency | Driver availability | A driver could become available in one request while an older request still assigns them elsewhere. | Availability and assignment may be updated independently; double booking could result. | CRITICAL | HIGH | HARD | Dispatch, driver session |
| BUG-DISPATCH-007 | Concurrency | Rider ride creation | Double taps, retries, or multiple devices could create duplicate rides. | Creation may lack an idempotency key or deduplication window; duplicate charges and drivers could result. | HIGH | HIGH | MEDIUM | Ride, payment, notifications |
| BUG-DISPATCH-008 | Functional | Matching | A driver outside the permitted service area could be matched because the H3 cell or GPS position is stale. | Matching indexes and precise coordinates may be updated at different times. | HIGH | MEDIUM | HARD | Location, dispatch, zones |
| BUG-DISPATCH-009 | Functional | Matching | A driver could be matched despite vehicle type, certification, capacity, or service restriction changes. | Eligibility may be evaluated from stale denormalized data. | HIGH | MEDIUM | HARD | Fleet, dispatch |
| BUG-DISPATCH-010 | Concurrency | First acceptance | Two providers could both appear to be the winner when acceptance response and assignment persistence race. | Winner selection and notification may not be one atomic operation. | HIGH | MEDIUM | HARD | Dispatch, marketplace |
| BUG-DISPATCH-011 | State machine | Assignment | An old assignment record could remain active after reassignment and continue receiving events. | Reassignment may create a new pointer without closing the old one. | HIGH | MEDIUM | HARD | Dispatch, WebSockets |
| BUG-DISPATCH-012 | Distributed | Dispatch events | A provider could receive an offer after the ride has already been accepted, cancelled, or reassigned. | Queued notifications may not be cancelled or checked at delivery time. | MEDIUM | HIGH | EASY | Dispatch, push |
| BUG-DISPATCH-013 | Concurrency | Manual dispatch | An admin dispatch and automated matching could assign different drivers simultaneously. | Administrative and automated paths may bypass the same locking or claim mechanism. | HIGH | LOW | HARD | Admin, dispatch |
| BUG-DISPATCH-014 | Business logic | Auto-redispatch | A driver who rejects or times out could be selected again due to stale eligibility data. | Exclusion lists may be request-local or lost during retry. | MEDIUM | HIGH | MEDIUM | Dispatch |
| BUG-DISPATCH-015 | Functional | Scheduled rides | A scheduled ride could be dispatched using the rider’s current location rather than the scheduled pickup location. | Scheduler may reconstruct state from mutable profile or address data. | HIGH | LOW | HARD | Scheduled rides, dispatch |
| BUG-DISPATCH-016 | Concurrency | Scheduled rides | A scheduler and a user cancellation could both process a scheduled ride. | Cancellation and job pickup may race near the dispatch boundary. | HIGH | HIGH | HARD | Scheduler, ride, notifications |
| BUG-DISPATCH-017 | Functional | Multi-stop rides | A completed stop could be replayed or skipped after reconnect, changing route and fare. | Stop sequence may be client-controlled or not versioned. | HIGH | MEDIUM | HARD | Ride, maps, fare |
| BUG-DISPATCH-018 | Functional | Ride completion | Rider and driver completion actions could produce different final timestamps, distances, or totals. | Completion may accept independently calculated values without reconciliation. | HIGH | MEDIUM | HARD | Fare, payment, earnings |
| BUG-DISPATCH-019 | State machine | Ride completion | A completed ride could later become active because a delayed location or status event is applied. | Background updates may not enforce terminal-state immutability. | CRITICAL | LOW | HARD | Ride, billing |
| BUG-DISPATCH-020 | Functional | No-show | A no-show could be recorded after the rider has already boarded or after the driver has cancelled. | Evidence and timing checks may be evaluated from stale state. | HIGH | MEDIUM | HARD | Cancellation, fees, ratings |
| BUG-DISPATCH-021 | Business logic | Cancellation | Rider and driver cancellation requests could both charge fees or award compensation. | Fee creation may not be idempotent across competing transitions. | HIGH | HIGH | HARD | Wallet, payments |
| BUG-DISPATCH-022 | Business logic | Cancellation | Cancellation near pickup or completion could use inconsistent cutoff times between API and scheduler. | Time zones, clock skew, or duplicated configuration could change fee eligibility. | HIGH | MEDIUM | HARD | Ride, fare, jobs |
| BUG-DISPATCH-023 | Security | Ride PIN | A PIN attempt could be replayed after the ride has been cancelled, reassigned, or completed. | PIN consumption may not be bound to the current assignment and ride version. | HIGH | LOW | HARD | Ride, safety |
| BUG-DISPATCH-024 | Security | Ride PIN | A driver could submit a PIN for a different ride if only the driver or PIN is checked. | Identifier binding may be incomplete; unauthorized ride start could occur. | CRITICAL | LOW | HARD | Ride, fraud |
| BUG-DISPATCH-025 | Concurrency | Driver session | Two devices could mark the same driver online, offline, or active with conflicting heartbeat timestamps. | Last-write-wins behavior may ignore session ownership. | HIGH | HIGH | HARD | Driver, dispatch |
| BUG-DISPATCH-026 | Distributed | Location | A delayed location update could move a driver backward across a zone, geofence, or eligibility boundary. | Updates may be accepted without monotonic timestamps or sequence numbers. | HIGH | HIGH | HARD | Location, fare, dispatch |
| BUG-DISPATCH-027 | Security | Location spoofing | Spoofed coordinates could make a driver appear near pickup, inside a service zone, or eligible for a demand incentive. | Server-side plausibility and movement checks may be incomplete. | HIGH | MEDIUM | HARD | Location, incentives |
| BUG-DISPATCH-028 | Functional | ETA | A stale route or map-provider response could overwrite a newer ETA and trigger premature timeout or cancellation. | External responses may arrive out of order. | MEDIUM | HIGH | HARD | Maps, dispatch, notifications |
| BUG-DISPATCH-029 | Resource conflict | Vehicle assignment | A vehicle could be assigned to two drivers because driver assignment and vehicle assignment are updated separately. | Scarce-resource uniqueness may not be enforced transactionally. | CRITICAL | MEDIUM | HARD | Fleet, dispatch |
| BUG-DISPATCH-030 | Resource conflict | Driver exclusivity | A driver could simultaneously qualify for ride-hailing, delivery, rental, or emergency work. | Cross-vertical reservations may not share a common resource lock. | CRITICAL | MEDIUM | VERY HARD | Dispatch, marketplace, emergency |
| BUG-DISPATCH-031 | Business logic | Availability | A driver could receive new work after accepting a mutually exclusive job because availability is cached. | Cache invalidation may lag behind reservation creation. | HIGH | HIGH | HARD | All dispatch domains |
| BUG-DISPATCH-032 | Functional | Capacity | A vehicle could receive an order exceeding passenger, cargo, medical, or weight capacity after a later assignment. | Capacity may be evaluated only during search, not at final claim. | HIGH | MEDIUM | HARD | Fleet, delivery, emergency |
| BUG-DISPATCH-033 | Distributed | Dispatch retry | Retrying a failed assignment request could create multiple assignment records with one current pointer. | Provider/API retry may be non-idempotent. | HIGH | MEDIUM | HARD | Dispatch, database |

### Fare, promotions, wallet, payments, ledger, tax, and payouts

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-FIN-001 | Financial | Fare quote | A quote could be calculated with one zone, vehicle class, or configuration and settled with another. | Quote and settlement may read different versions of mutable configuration. | HIGH | HIGH | HARD | Fare, zones, config |
| BUG-FIN-002 | Concurrency | Fare settlement | Two completion or payment attempts could each create a charge or ledger debit. | Settlement may lack an idempotency key or unique business reference. | CRITICAL | HIGH | HARD | Payment, wallet, ledger |
| BUG-FIN-003 | Financial | Fare settlement | A retry after a timeout could charge the rider twice while showing only one ride. | Server success may be followed by client retry without deduplication. | CRITICAL | HIGH | MEDIUM | Mobile, payment |
| BUG-FIN-004 | Financial | Payment callback | Duplicate or reordered provider callbacks could mark a failed payment as successful or create duplicate credits. | Webhooks may be trusted without event uniqueness and monotonic state rules. | CRITICAL | HIGH | HARD | Payment, wallet |
| BUG-FIN-005 | Financial | Payment callback | A callback for one transaction could be applied to another when provider references are reused, truncated, or poorly mapped. | External and internal identifiers may not be bound strongly enough. | CRITICAL | LOW | VERY HARD | Payment, ledger |
| BUG-FIN-006 | Financial | Wallet top-up | A top-up could credit the wallet after an authorization reversal, expired payment, or failed capture. | Asynchronous payment states may be simplified into success/failure. | CRITICAL | MEDIUM | HARD | Wallet, payment |
| BUG-FIN-007 | Financial | Wallet withdrawal | A withdrawal could be submitted twice from multiple devices while the available balance is checked before either reservation. | Read-then-write balance race could cause overdraft or duplicate payout. | CRITICAL | MEDIUM | HARD | Wallet, payout |
| BUG-FIN-008 | Financial | Wallet balance | A wallet balance could diverge from its double-entry ledger after a partial failure between posting and balance update. | Derived balance and journal entry may not share atomicity. | CRITICAL | MEDIUM | VERY HARD | Wallet, ledger |
| BUG-FIN-009 | Financial | Ledger | A compensating entry could be posted without reversing all original tax, commission, or vendor splits. | Reversal logic may cover only the primary transaction. | HIGH | MEDIUM | HARD | Ledger, tax, accounting |
| BUG-FIN-010 | Financial | Refund | Two refund requests could both pass an original-payment check and refund more than the original amount. | Refund totals may be checked before concurrent reservation. | CRITICAL | MEDIUM | HARD | Payment, wallet |
| BUG-FIN-011 | Financial | Refund | A refund could be issued after a chargeback, cancellation refund, or prior manual refund. | External and internal refund state may be reconciled late. | CRITICAL | LOW | VERY HARD | Payment, support |
| BUG-FIN-012 | Financial | Refund | A refund could credit the wrong wallet or payment instrument after account merge, phone change, or reassignment. | Recipient may be resolved from current ownership rather than transaction ownership. | CRITICAL | LOW | HARD | Wallet, accounts |
| BUG-FIN-013 | Business logic | Waiting charge | Waiting time could continue after cancellation, completion, driver offline status, or a paused stop. | Timer jobs and ride state may use different clocks or terminal checks. | HIGH | HIGH | HARD | Fare, ride |
| BUG-FIN-014 | Business logic | Distance fare | GPS drift, provider route changes, or duplicate points could inflate distance. | Raw tracking may be trusted without outlier filtering or monotonic processing. | HIGH | MEDIUM | HARD | Location, fare |
| BUG-FIN-015 | Business logic | Surge / demand pricing | A stale demand multiplier could remain active after demand drops or be applied twice. | Cached pricing and settlement recomputation may differ. | HIGH | MEDIUM | HARD | Pricing, dispatch |
| BUG-FIN-016 | Business logic | Pickup fee | Pickup charges could be applied both in the quote and again during settlement. | Component-level and total-level pricing may be combined incorrectly. | HIGH | MEDIUM | MEDIUM | Fare, payment |
| BUG-FIN-017 | Business logic | Tips | A tip could be added more than once after repeated post-ride submission or edited from multiple devices. | Tip creation may lack a ride/user uniqueness rule. | MEDIUM | HIGH | MEDIUM | Wallet, driver earnings |
| BUG-FIN-018 | Business logic | Tips | A tip could be attributed to the wrong driver after reassignment or pooled ride changes. | Recipient may be determined from current assignment rather than completed assignment. | HIGH | LOW | HARD | Ride, earnings |
| BUG-FIN-019 | Business logic | Promotions | A coupon could be consumed before a failed ride/order is committed, preventing valid reuse. | Promotion redemption and order creation may not be transactional. | MEDIUM | HIGH | MEDIUM | Promotions, orders |
| BUG-FIN-020 | Security | Promotions | Concurrent checkout attempts could reuse a single-use coupon. | Eligibility and redemption could be separate operations. | HIGH | HIGH | HARD | Promotions, payment |
| BUG-FIN-021 | Security | Promotions | A user could exploit cancellation and recreation to receive repeated first-ride or referral benefits. | Benefit eligibility may inspect current status rather than irreversible history. | HIGH | MEDIUM | HARD | Promotions, referrals |
| BUG-FIN-022 | Business logic | Passes | A pass could activate twice, extend incorrectly, or remain active after refund. | Activation and payment callback retries may not be idempotent. | HIGH | MEDIUM | HARD | Passes, wallet |
| BUG-FIN-023 | Business logic | Call packages | Package minutes or credits could be consumed twice after client retry or reconnect. | Consumption events may be replayed without a unique usage key. | MEDIUM | MEDIUM | HARD | Packages, billing |
| BUG-FIN-024 | Financial | Driver earnings | Earnings could be credited from both provisional and final fare records. | Settlement and payout aggregation may consume different event types. | CRITICAL | MEDIUM | VERY HARD | Earnings, ledger |
| BUG-FIN-025 | Financial | Vendor earnings | Marketplace commissions could be calculated from gross amount while refunds reverse only net amount. | Fee components may not have a shared reversal model. | HIGH | MEDIUM | HARD | Orders, vendors, tax |
| BUG-FIN-026 | Financial | Payouts | A payout could include transactions later cancelled, refunded, or disputed. | Payout cutoff and transaction finality may not align. | CRITICAL | MEDIUM | HARD | Payouts, refunds |
| BUG-FIN-027 | Financial | Tax | Tax could be calculated using the quote’s jurisdiction while settlement uses a different pickup or delivery location. | Location changes and tax calculation may occur at different times. | HIGH | MEDIUM | HARD | Tax, fare, orders |
| BUG-FIN-028 | Financial | Tax | Rounding at line-item, tax, commission, and total levels could produce inconsistent amounts. | Multiple rounding boundaries could leave ledger totals unbalanced. | HIGH | HIGH | MEDIUM | Tax, accounting |
| BUG-FIN-029 | Financial | Currency units | Paisa/BDT or percentage/decimal conversion could apply twice or not at all in one integration. | Unit contracts may be inconsistent across services or providers. | CRITICAL | MEDIUM | HARD | All financial services |
| BUG-FIN-030 | Financial | Accounting export | A replayed export could duplicate journal entries or mark unexported entries as exported prematurely. | Batch checkpoints may not be atomic. | HIGH | MEDIUM | VERY HARD | Accounting, ledger |
| BUG-FIN-031 | Financial | Payment entitlement | A service could become active after payment authorization but before capture ultimately fails. | Entitlement may be granted on an intermediate provider state. | HIGH | MEDIUM | HARD | Payment, rides, passes |
| BUG-FIN-032 | Financial | Payment timeout | A provider timeout could leave a ride blocked despite later successful payment. | Reconciliation may not wake or repair the business object. | HIGH | HIGH | HARD | Payment, ride |
| BUG-FIN-033 | Security | Payment replay | A previously valid payment token, callback, or client request could be replayed against a new order. | Binding to amount, user, order, and expiry may be incomplete. | CRITICAL | LOW | VERY HARD | Payment, fraud |
| BUG-FIN-034 | Financial | Balance limits | Concurrent credits and debits could bypass wallet limits, negative-balance rules, or withdrawal holds. | Limits may be evaluated against stale balances. | HIGH | MEDIUM | HARD | Wallet, risk |
| BUG-FIN-035 | Financial | Reconciliation | A provider-side success with missing internal record could be credited to an unmatched or wrong customer during repair. | Manual or automated reconciliation may rely on weak matching keys. | CRITICAL | LOW | VERY HARD | Payment, support |

### Location, zones, H3, and pricing eligibility

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-LOC-001 | Functional | H3 matching | A point near a cell boundary could be assigned to a neighboring cell at different resolutions. | Services may use inconsistent H3 resolution or rounding. | HIGH | MEDIUM | HARD | Matching, pricing |
| BUG-LOC-002 | Functional | Geofencing | A rider could be considered inside a service zone by one service and outside by another. | Polygon versions, coordinate order, or boundary semantics may differ. | HIGH | MEDIUM | HARD | Dispatch, fare, eligibility |
| BUG-LOC-003 | Security | Location validation | A provider could spoof pickup arrival by sending coordinates inside the pickup radius. | Arrival may trust a single location sample without movement or sensor checks. | HIGH | MEDIUM | HARD | No-show, cancellation, fraud |
| BUG-LOC-004 | Distributed | Location | Out-of-order GPS samples could produce impossible speed, route, or waiting calculations. | Timestamp and sequence validation may be absent. | HIGH | HIGH | HARD | Fare, safety, ETA |
| BUG-LOC-005 | Functional | Location permissions | A mobile client that loses location permission could retain its last valid location as current. | Staleness may not be surfaced consistently to dispatch. | HIGH | HIGH | MEDIUM | Dispatch, safety |
| BUG-LOC-006 | Business logic | Zone pricing | Zone entry and exit events could be duplicated, causing repeated surcharge changes. | Event retries may not be deduplicated. | HIGH | MEDIUM | HARD | Fare, zones |
| BUG-LOC-007 | Time/configuration | Service zones | A zone configuration effective at midnight or month-end could be applied inconsistently across servers. | Cache expiry and timezone interpretation may differ. | HIGH | MEDIUM | HARD | Pricing, dispatch |
| BUG-LOC-008 | Security | Incentive eligibility | A driver could cross a zone boundary repeatedly to earn entry-based incentives. | Incentive logic may count events rather than sustained presence or unique sessions. | HIGH | LOW | HARD | Incentives, location |
| BUG-LOC-009 | Functional | Map provider | A provider outage or fallback route could return distance units or route segments in an incompatible format. | Fallback contracts may differ; fare or ETA could be materially wrong. | HIGH | MEDIUM | HARD | Maps, fare |
| BUG-LOC-010 | Safety | SOS location | SOS could use an old location after the client backgrounds, reconnects, or switches device. | Safety location and live location pipelines may diverge. | CRITICAL | MEDIUM | HARD | SOS, notifications |

### Marketplace, RFQ, rental, food, and delivery

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-MKT-001 | Concurrency | Product inventory | Two orders could reserve the last item simultaneously. | Inventory check and decrement may not be atomic. | HIGH | HIGH | HARD | Shops, orders, payment |
| BUG-MKT-002 | Distributed | Inventory | A payment timeout could leave stock reserved indefinitely, while cancellation could release it twice. | Reservation expiry and payment reconciliation may race. | HIGH | HIGH | HARD | Inventory, payment |
| BUG-MKT-003 | Functional | Product catalog | A deleted or price-changed product could remain purchasable from cache or an old cart. | Cart validation may not recheck current product state. | HIGH | HIGH | MEDIUM | Shops, orders |
| BUG-MKT-004 | Financial | Order pricing | Cart, checkout, vendor acceptance, and delivery settlement could use different prices or fees. | Mutable catalog, promotion, and delivery data may be read at different stages. | HIGH | HIGH | HARD | Orders, fare, payment |
| BUG-MKT-005 | State machine | Shop order | An order could become confirmed after cancellation or refund because a delayed vendor response is accepted. | Vendor events may lack order-version checks. | HIGH | MEDIUM | HARD | Orders, vendors |
| BUG-MKT-006 | Distributed | Food delivery bridge | One food order could create multiple delivery requests after retry or scheduler repair. | Bridge creation may lack a unique order-to-delivery constraint. | CRITICAL | MEDIUM | HARD | Food, delivery |
| BUG-MKT-007 | Financial | Food delivery bridge | Delivery fees, commissions, and order totals could diverge between the order and delivery records. | Each domain may independently calculate settlement components. | HIGH | MEDIUM | HARD | Food, delivery, ledger |
| BUG-MKT-008 | Concurrency | RFQ | A buyer could cancel an RFQ while a provider submits or updates a quote. | Deadline and cancellation transitions may be checked inconsistently. | MEDIUM | MEDIUM | HARD | RFQ, notifications |
| BUG-MKT-009 | Security | Sealed bids | A bidder could see another bid through a response, cache, event, or authorization gap before the deadline. | Read permissions may not enforce the sealed-bid phase. | CRITICAL | LOW | HARD | RFQ, rental |
| BUG-MKT-010 | Concurrency | Sealed-bid deadline | A bid submitted at the deadline could be accepted by one server and rejected by another. | Clock skew and inconsistent boundary precision may affect eligibility. | HIGH | MEDIUM | HARD | RFQ, scheduler |
| BUG-MKT-011 | Concurrency | Rental award | Buyer confirmation, automatic award, and deadline expiry could select different winners. | Winner selection may be performed by multiple paths without a durable claim. | CRITICAL | MEDIUM | VERY HARD | Rental, scheduler |
| BUG-MKT-012 | State machine | Rental award | A losing bidder could continue receiving acceptance or negotiation events after another bidder wins. | Old bid subscriptions and event recipients may not be closed. | HIGH | MEDIUM | HARD | Rental, WebSockets |
| BUG-MKT-013 | Functional | Rental SLA | SLA expiry could demote or cancel a winner while the winner is simultaneously confirming. | Expiry job and user action may race. | HIGH | HIGH | HARD | Rental, jobs |
| BUG-MKT-014 | Resource conflict | Rental assignment | A vehicle or driver could change after award without revalidating capacity, license, or availability. | Award state may not lock underlying resources. | HIGH | MEDIUM | HARD | Fleet, rental |
| BUG-MKT-015 | Business logic | Rental pricing | A bid revision could alter the visible amount but not the final settlement amount, or vice versa. | Bid snapshots and mutable bid records may be confused. | HIGH | LOW | HARD | Rental, payment |
| BUG-MKT-016 | Concurrency | Delivery creation | Customer, shop, and scheduler paths could each create a delivery leg for one order. | Delivery idempotency may be scoped to the caller rather than the order. | HIGH | MEDIUM | HARD | Delivery, orders |
| BUG-MKT-017 | State machine | Delivery lifecycle | Delivery could be marked delivered after cancellation, return, failed delivery, or refund. | Driver updates may be accepted without terminal-state checks. | CRITICAL | MEDIUM | HARD | Delivery, refunds |
| BUG-MKT-018 | Functional | Delivery handoff | Proof of delivery could be attached to the wrong order after driver app reconnect or offline queue replay. | Local queued actions may lack immutable order binding. | HIGH | LOW | VERY HARD | Delivery, mobile |
| BUG-MKT-019 | Business logic | Courier pricing | Weight, distance, or service level could be measured differently at quote and settlement. | Package metadata may change during fulfillment. | HIGH | MEDIUM | HARD | Courier, fare |
| BUG-MKT-020 | Security | Order access | A delivery link, tracking token, or deep link could expose another customer’s order. | Tokens may be guessable, reusable, or insufficiently tenant-bound. | HIGH | LOW | HARD | Delivery, notifications |
| BUG-MKT-021 | Functional | Shop availability | A shop closed by an admin or scheduler could accept orders through a stale client or cache. | Availability propagation may be delayed. | HIGH | HIGH | EASY | Shops, orders |
| BUG-MKT-022 | Financial | Vendor cancellation | Vendor cancellation compensation could be duplicated by both order cancellation and delivery cancellation flows. | Each domain may independently issue credit. | HIGH | MEDIUM | HARD | Orders, wallet |
| BUG-MKT-023 | Concurrency | Rental resource exclusivity | A driver winning a rental could remain eligible for an urgent ride or ambulance dispatch. | Cross-vertical resource locks may not be shared. | CRITICAL | MEDIUM | VERY HARD | Rental, dispatch, emergency |
| BUG-MKT-024 | Distributed | Order events | An old “accepted” event could overwrite a newer “preparing,” “cancelled,” or “delivered” state. | Event ordering and version checks may be incomplete. | HIGH | HIGH | HARD | Orders, WebSockets |
| BUG-MKT-025 | Functional | Address / delivery zone | Address edits after payment could change the delivery zone without repricing or rechecking availability. | Order snapshot and current address may be mixed. | HIGH | MEDIUM | HARD | Orders, maps, fare |

### Emergency, ambulance, safety, ratings, and trust

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-SAFE-001 | Safety | Emergency dispatch | Two providers could both accept an ambulance request, or neither could be reliably designated primary. | First-accept selection may not be atomic. | CRITICAL | MEDIUM | HARD | Emergency, dispatch |
| BUG-SAFE-002 | Safety | Emergency dispatch | A stale provider could receive an emergency broadcast after certification expiry, logout, or reassignment. | Broadcast recipient lists may be cached. | CRITICAL | MEDIUM | HARD | Emergency, fleet |
| BUG-SAFE-003 | Safety | Certification | Expired or revoked medical, vehicle, or driver certification could remain eligible until a periodic job runs. | Eligibility may depend on delayed denormalized status. | CRITICAL | MEDIUM | HARD | Emergency, fleet |
| BUG-SAFE-004 | Safety | Emergency radius | A provider outside the intended emergency radius could receive or accept the request due to H3 or unit conversion errors. | Approximate cells and precise radius checks may differ. | HIGH | LOW | HARD | Emergency, location |
| BUG-SAFE-005 | Safety | Urgent vs scheduled dispatch | Scheduled dispatch rules could be applied to an urgent request, delaying response. | Shared dispatch code may select the wrong priority path. | CRITICAL | LOW | VERY HARD | Emergency, scheduler |
| BUG-SAFE-006 | Safety | SOS | Repeated SOS taps or reconnects could create several incidents and contradictory escalation states. | Incident creation may not be idempotent. | HIGH | MEDIUM | HARD | SOS, support |
| BUG-SAFE-007 | Safety | SOS | SOS cancellation could stop escalation for one channel while another channel continues or is never notified. | Multi-channel escalation may lack a shared incident state. | CRITICAL | MEDIUM | VERY HARD | SOS, notifications |
| BUG-SAFE-008 | Security | SOS access | An unauthorized support user, driver, or household member could view SOS location or audio metadata. | Sensitive incident permissions may differ from ordinary ride permissions. | CRITICAL | LOW | HARD | SOS, RBAC |
| BUG-SAFE-009 | Trust | Ratings | Multiple devices or retries could submit multiple ratings for one ride. | Rating uniqueness may not be enforced per actor and ride. | MEDIUM | HIGH | EASY | Ratings, profiles |
| BUG-SAFE-010 | Trust | Ratings | A rating could be attributed to the wrong driver after reassignment or pooled-service changes. | Current assignment may be used instead of completed assignment. | HIGH | LOW | HARD | Ratings, driver |
| BUG-SAFE-011 | Security | Trust and safety | A blocked rider or driver could interact through a stale assignment, group chat, or notification link. | Blocking may not propagate to all communication channels. | HIGH | MEDIUM | HARD | Safety, messaging |
| BUG-SAFE-012 | Functional | Emergency cancellation | An emergency request could be cancelled automatically by an ordinary timeout job. | Generic expiry processing may not distinguish emergency priority. | CRITICAL | LOW | VERY HARD | Emergency, scheduler |

### Jobs, events, notifications, flags, time, and mobile

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-INFRA-001 | Distributed | Scheduler | Two scheduler workers could execute the same job for the same record. | Job claiming or lease renewal may not be atomic. | HIGH | HIGH | HARD | All scheduled domains |
| BUG-INFRA-002 | Distributed | Scheduler | A job could be skipped permanently after a worker crashes after claiming but before completion. | Lease recovery or retry handling may be incomplete. | HIGH | MEDIUM | HARD | Payments, rides, orders |
| BUG-INFRA-003 | Distributed | Scheduler | A delayed job could apply an outdated action after the user has already changed state. | Jobs may not compare record version or current status. | HIGH | HIGH | HARD | All state machines |
| BUG-INFRA-004 | Distributed | Scheduler | A backlog could cause expiration, payout, refund, or notification jobs to run out of order. | Priority and dependency handling may be absent. | HIGH | HIGH | HARD | Jobs, finance |
| BUG-INFRA-005 | Distributed | Scheduler | A partially completed batch could resume from the wrong checkpoint and duplicate or skip records. | Checkpoint persistence may not share transaction boundaries. | HIGH | MEDIUM | VERY HARD | Accounting, notifications |
| BUG-INFRA-006 | Availability | Scheduler | One failing record could abort a whole batch, leaving later records unprocessed. | Error isolation may be insufficient. | HIGH | HIGH | MEDIUM | Jobs, orders, payouts |
| BUG-INFRA-007 | Distributed | WebSockets | Reconnection could subscribe a device twice and deliver duplicate status or payment events. | Subscription cleanup may lag behind reconnect. | MEDIUM | HIGH | EASY | Mobile, WebSockets |
| BUG-INFRA-008 | Distributed | WebSockets | Events could arrive out of order and cause the client to display an obsolete status or act on it. | Client may not enforce server sequence numbers. | HIGH | HIGH | MEDIUM | Mobile, ride, orders |
| BUG-INFRA-009 | Security | WebSockets | A reconnecting client could receive events for a prior user, tenant, ride, or order. | Channel authorization may be established only at initial connection. | CRITICAL | LOW | HARD | WebSockets, auth |
| BUG-INFRA-010 | Notifications | Push | A notification could be sent to the wrong user after phone reassignment, account merge, or stale device-token mapping. | Device tokens may not be revoked promptly. | HIGH | LOW | HARD | Push, auth |
| BUG-INFRA-011 | Notifications | Push | Cancellation, refund, or emergency notifications could be delayed until after the underlying action is no longer reversible. | Queue backlog and retry ordering may be uncontrolled. | HIGH | MEDIUM | HARD | Notifications, safety |
| BUG-INFRA-012 | Notifications | Deep links | A stale deep link could open a new object with a reused or ambiguous identifier. | Links may lack version, tenant, or authorization validation. | HIGH | LOW | HARD | Mobile, all domains |
| BUG-INFRA-013 | Configuration | Feature flags | A flag could be enabled in the API but disabled in the worker or mobile client, producing incompatible workflows. | Flag evaluation and rollout caches may differ. | HIGH | HIGH | HARD | Config, mobile, jobs |
| BUG-INFRA-014 | Configuration | Feature flags | A percentage rollout could apply different variants to the same user across devices or services. | Assignment may not use a stable subject key. | MEDIUM | MEDIUM | HARD | Flags, pricing |
| BUG-INFRA-015 | Configuration | Units | Seconds/milliseconds, metres/kilometres, or decimal/paisa conversion could alter timeout, radius, or fare behavior. | Configuration contracts may lack explicit units. | HIGH | MEDIUM | HARD | Config, fare, location |
| BUG-INFRA-016 | Time | Time handling | UTC and Dhaka timestamps could make a scheduled ride, expiry, pass, or promotion activate at the wrong local time. | Storage, display, and scheduler comparisons may use different zones. | HIGH | HIGH | MEDIUM | Scheduler, pricing |
| BUG-INFRA-017 | Time | Expiration | An object could be accepted exactly at its deadline by one server and rejected by another. | Clock skew and precision truncation may differ. | HIGH | MEDIUM | HARD | Auctions, rides, promotions |
| BUG-INFRA-018 | Time | Month-end billing | Monthly subscriptions, payouts, or tax periods could include or exclude transactions inconsistently at month boundaries. | Inclusive/exclusive interval conventions may differ. | HIGH | MEDIUM | HARD | Billing, tax |
| BUG-INFRA-019 | Mobile | Offline queue | A queued cancellation, completion, or delivery confirmation could execute after the object has changed state. | Offline commands may lack expiry and version binding. | HIGH | MEDIUM | VERY HARD | Mobile, ride, delivery |
| BUG-INFRA-020 | Mobile | Client retry | “Server succeeded, phone failed” could cause duplicate ride, order, payment, or SOS creation after retry. | Client may not retain or reuse an idempotency key. | CRITICAL | HIGH | MEDIUM | Mobile, all write APIs |
| BUG-INFRA-021 | Mobile | Client state | “Phone succeeded, server failed” could show the user a completed ride or order that never existed. | Optimistic local state may not reconcile with authoritative state. | HIGH | MEDIUM | MEDIUM | Mobile, support |
| BUG-INFRA-022 | Mobile | Backgrounding | A driver app backgrounded during acceptance or completion could submit a stale action after resuming. | UI state may survive longer than server state. | HIGH | HIGH | HARD | Mobile, ride |
| BUG-INFRA-023 | Distributed | Event retry | A retry could emit a notification or reward twice even when the underlying state change is idempotent. | Side effects may not share the event’s deduplication key. | HIGH | HIGH | HARD | Notifications, promotions |
| BUG-INFRA-024 | Data consistency | Cache | A cache could expose a former wallet balance, driver eligibility, order status, or authorization after an update. | Invalidation may be asynchronous or selectively scoped. | CRITICAL | MEDIUM | HARD | Cache, finance, auth |
| BUG-INFRA-025 | Data consistency | Counters | Denormalized counters for inventory, active rides, wallet totals, or assignments could drift after partial failures. | Increment/decrement events may be lost or duplicated. | HIGH | HIGH | HARD | All services |
| BUG-INFRA-026 | Data consistency | Orphan records | Payment, delivery, ledger, notification, or assignment records could be created without a valid parent. | Cross-service creation is not atomic. | HIGH | HIGH | HARD | All cross-service chains |
| BUG-INFRA-027 | Data consistency | Orphan cleanup | Cleanup could delete a record still referenced by a delayed callback or retry. | Retention and retry windows may be misaligned. | HIGH | LOW | VERY HARD | Payments, jobs |
| BUG-INFRA-028 | Reliability | Provider callback | A provider callback could arrive before the internal transaction or order is committed and be discarded permanently. | Callback consumer may not retry unresolved references. | HIGH | MEDIUM | HARD | Payment, delivery |
| BUG-INFRA-029 | Reliability | External provider | Provider outage recovery could replay a large callback batch, overwhelming workers and causing secondary duplicate effects. | Recovery may lack rate limiting or deduplication. | HIGH | MEDIUM | HARD | Payment, maps, SMS |
| BUG-INFRA-030 | Security | Notification privacy | Sensitive ride, wallet, or emergency details could appear in lock-screen notifications intended for a shared device. | Notification content may not reflect account sensitivity settings. | MEDIUM | MEDIUM | EASY | Push, safety |

### Cross-service chains, reporting, and administration

| ID | Category | Service / Module | Possible bug and trigger | Why plausible / impact | Sev. | Likelihood | Detection | Affected areas |
|---|---|---|---|---|---|---|---|---|
| BUG-CROSS-001 | Distributed | Ride → payment → wallet | Ride completion could succeed while payment creation fails, leaving the ride completed but financially unsettled. | Cross-service transaction lacks atomic commit or durable outbox. | CRITICAL | HIGH | HARD | Ride, payment, ledger |
| BUG-CROSS-002 | Distributed | Payment → entitlement | Payment could succeed while the ride, pass, or package remains inactive. | Callback or entitlement worker may fail after payment capture. | HIGH | HIGH | HARD | Payment, rides, passes |
| BUG-CROSS-003 | Distributed | Wallet → ledger | Wallet balance could change while the corresponding journal entry is missing or duplicated. | Balance mutation and accounting entry may be separate operations. | CRITICAL | MEDIUM | VERY HARD | Wallet, ledger |
| BUG-CROSS-004 | Distributed | Ledger → tax | Tax posting could fail after customer payment and vendor earning are recorded. | Tax may be a later asynchronous stage. | CRITICAL | MEDIUM | HARD | Tax, accounting |
| BUG-CROSS-005 | Distributed | Ride → fleet | A ride could complete while vehicle usage, driver hours, or subscription quota remains unchanged. | Fleet accounting may consume separate completion events. | HIGH | MEDIUM | HARD | Ride, fleet |
| BUG-CROSS-006 | Distributed | Ride → notification | The ride could be cancelled or refunded while the user receives a success or completion notification. | Event ordering and notification queueing may diverge. | MEDIUM | HIGH | EASY | Ride, notifications |
| BUG-CROSS-007 | Authorization | Admin reports | Reports could combine records across tenants or use unfiltered replicas. | Reporting queries may have weaker authorization paths than operational APIs. | CRITICAL | LOW | HARD | Admin, finance |
| BUG-CROSS-008 | Financial | Reports | Operational balance, ledger balance, payout total, and tax report could disagree after late corrections. | Reports may use different cutoff times or transaction definitions. | HIGH | HIGH | HARD | Admin, accounting |
| BUG-CROSS-009 | Security | Admin mutation | An admin bulk action could affect records selected from a stale search result after ownership or status changes. | Bulk operations may not revalidate each record. | HIGH | MEDIUM | HARD | Admin, all domains |
| BUG-CROSS-010 | Security | Audit trail | A failed or partially completed financial/admin action could lack a complete audit record. | Logging may occur after mutation or only on success. | HIGH | MEDIUM | HARD | Admin, compliance |
| BUG-CROSS-011 | Configuration | Billing / subscriptions | A plan change could be applied to future billing, current entitlement, and usage limits inconsistently. | Plan state may be replicated across billing and access services. | HIGH | MEDIUM | HARD | Fleet, subscriptions |
| BUG-CROSS-012 | Concurrency | Subscription limits | Simultaneous driver or vehicle additions could exceed a fleet subscription limit. | Limit check and resource creation may race. | HIGH | HIGH | HARD | Fleet, billing |
| BUG-CROSS-013 | Business logic | Subscription cancellation | Cancellation could stop billing but leave paid features active indefinitely, or remove access before the paid period ends. | Entitlement and billing periods may use different timestamps. | HIGH | MEDIUM | HARD | Fleet, billing |
| BUG-CROSS-014 | Financial | Chargeback | A chargeback could reverse a payment while ride, vendor, driver, and tax balances remain settled. | Chargeback may update only the payment subsystem. | CRITICAL | LOW | VERY HARD | Payment, ledger, tax |
| BUG-CROSS-015 | Data consistency | Repair/reconciliation | Automatic repair could “fix” a legitimate unusual transaction by applying a generic compensating entry. | Heuristics may lack transaction-specific context. | HIGH | LOW | VERY HARD | Finance, support |
| BUG-CROSS-016 | Security | Export/download | Exported financial, customer, or location data could remain accessible after permission revocation. | Pre-signed links or cached exports may outlive authorization. | HIGH | MEDIUM | HARD | Admin, reporting |
| BUG-CROSS-017 | Functional | Search indexes | Search could return deactivated drivers, cancelled orders, or cross-tenant records after primary data changes. | Index updates may be delayed or incomplete. | HIGH | HIGH | MEDIUM | Search, all domains |
| BUG-CROSS-018 | Data consistency | Soft-delete cascade | Deleting a parent could hide the parent while leaving active child assignments, balances, bids, or notifications. | Cascade rules may differ across services. | HIGH | MEDIUM | HARD | All domains |
| BUG-CROSS-019 | Security | Support refund | A support agent could refund a transaction using a stale screen after the customer already received an automated refund. | UI state and server-side refund total may not be revalidated. | HIGH | MEDIUM | HARD | Admin, payment |
| BUG-CROSS-020 | Reliability | Outbox/event publication | A committed state change could fail to publish its event, leaving downstream services permanently stale. | Transactional outbox or replay mechanism may be missing or incomplete. | CRITICAL | MEDIUM | VERY HARD | All event-driven chains |

## 2. Top 100 Bugs to Investigate First

The following priority order weighs financial exposure, safety, security, likelihood, difficulty of detection, recovery difficulty, and cross-service blast radius.

| Rank | Bug ID | Investigation priority |
|---:|---|---|
| 1 | BUG-FIN-002 | Duplicate settlement could directly create duplicate charges and debits. |
| 2 | BUG-DISPATCH-001 | Double ride acceptance could affect safety, assignment integrity, and earnings. |
| 3 | BUG-FIN-004 | Duplicate or reordered payment callbacks could create false payment success or duplicate credits. |
| 4 | BUG-CROSS-001 | Completed rides with failed payment settlement could create large unreconciled exposure. |
| 5 | BUG-FIN-008 | Wallet/ledger divergence could conceal financial loss over time. |
| 6 | BUG-FIN-010 | Concurrent refunds could exceed the original payment. |
| 7 | BUG-FIN-003 | Client retry after timeout could produce duplicate rider charges. |
| 8 | BUG-FIN-007 | Concurrent withdrawals could overdraw wallets or duplicate payouts. |
| 9 | BUG-SAFE-001 | Multiple emergency acceptances could create unclear or delayed ambulance response. |
| 10 | BUG-DISPATCH-004 | Cancelled rides becoming active could trigger unsafe or billable phantom trips. |
| 11 | BUG-AUTH-005 | Missing tenant isolation could expose broad customer and financial data. |
| 12 | BUG-INFRA-009 | WebSocket authorization failure could leak live operational data. |
| 13 | BUG-SAFE-003 | Revoked or expired emergency certification could leave an unsafe provider eligible. |
| 14 | BUG-DISPATCH-029 | Double vehicle assignment could create operational and insurance exposure. |
| 15 | BUG-DISPATCH-030 | Cross-vertical resource conflicts could prevent emergency response or duplicate assignments. |
| 16 | BUG-MKT-006 | Duplicate food-to-delivery bridges could generate duplicate fulfillment and fees. |
| 17 | BUG-MKT-011 | Rental award races could assign the same job to multiple providers. |
| 18 | BUG-MKT-017 | Delivery completion after cancellation or refund could cause loss and customer disputes. |
| 19 | BUG-FIN-024 | Duplicate driver earnings could create direct payout leakage. |
| 20 | BUG-FIN-026 | Payouts containing refunded or cancelled transactions could be difficult to recover. |
| 21 | BUG-CROSS-003 | Wallet changes without matching ledger entries could compromise accounting integrity. |
| 22 | BUG-CROSS-014 | Chargebacks not propagated to all balances could create unrecoverable loss. |
| 23 | BUG-FIN-006 | Failed or reversed top-ups could leave spendable false credits. |
| 24 | BUG-FIN-031 | Entitlement after failed capture could provide unpaid services. |
| 25 | BUG-FIN-035 | Reconciliation could credit provider success to the wrong account. |
| 26 | BUG-FIN-011 | Refund after chargeback or prior refund could produce duplicate loss. |
| 27 | BUG-FIN-029 | Unit conversion errors could affect every financial transaction in a path. |
| 28 | BUG-FIN-028 | Rounding divergence could make ledger and tax totals unbalanced. |
| 29 | BUG-FIN-030 | Replayed accounting exports could duplicate financial records. |
| 30 | BUG-INFRA-020 | Generic client retry problems could duplicate many classes of write operations. |
| 31 | BUG-INFRA-003 | Stale jobs could reverse current state across rides, payments, and orders. |
| 32 | BUG-INFRA-001 | Duplicate scheduler execution could multiply state changes and side effects. |
| 33 | BUG-INFRA-020 | Offline or timeout replay could duplicate SOS, completion, or delivery confirmation. |
| 34 | BUG-DISPATCH-003 | Cancellation, timeout, and redispatch races could notify and assign multiple drivers. |
| 35 | BUG-DISPATCH-005 | Delayed events could reverse newer ride state. |
| 36 | BUG-DISPATCH-006 | Driver availability races could cause double booking. |
| 37 | BUG-DISPATCH-019 | Completed rides becoming active could reopen billing and operational workflows. |
| 38 | BUG-DISPATCH-021 | Competing cancellation flows could charge and compensate simultaneously. |
| 39 | BUG-FIN-020 | Coupon redemption races could create repeated discounts. |
| 40 | BUG-FIN-021 | Cancellation/recreation could repeatedly grant referral or first-use benefits. |
| 41 | BUG-FIN-013 | Waiting timers could materially inflate fares. |
| 42 | BUG-FIN-014 | GPS anomalies could inflate distance-based charges. |
| 43 | BUG-FIN-015 | Stale or duplicated surge could systematically overcharge riders. |
| 44 | BUG-FIN-019 | Coupons consumed on failed operations could cause customer disputes. |
| 45 | BUG-FIN-022 | Pass retries could grant duplicate entitlement. |
| 46 | BUG-FIN-025 | Vendor commission/refund mismatches could create recurring settlement errors. |
| 47 | BUG-FIN-027 | Wrong tax jurisdiction could affect customer charges and statutory reporting. |
| 48 | BUG-CROSS-004 | Failed tax posting could leave incomplete statutory accounting. |
| 49 | BUG-CROSS-008 | Conflicting reports could impair payout, tax, and fraud decisions. |
| 50 | BUG-CROSS-020 | Missing events could leave entire downstream chains stale. |
| 51 | BUG-INFRA-024 | Stale authorization or wallet caches could enable access or spending after revocation. |
| 52 | BUG-AUTH-004 | Cached revoked permissions could enable privileged actions. |
| 53 | BUG-AUTH-008 | Old account-recovery artifacts could enable takeover. |
| 54 | BUG-AUTH-001 | Reusable authentication artifacts could compromise accounts. |
| 55 | BUG-AUTH-002 | Concurrent OTP verification could enable replay. |
| 56 | BUG-FIN-033 | Payment replay could attach valid authorization to a different order. |
| 57 | BUG-MKT-009 | Sealed-bid visibility leakage could compromise a competitive process. |
| 58 | BUG-MKT-013 | Rental SLA demotion could race with provider confirmation. |
| 59 | BUG-MKT-014 | Awarded resources could become invalid without revalidation. |
| 60 | BUG-MKT-023 | Rental and emergency/ride work could consume the same driver. |
| 61 | BUG-MKT-001 | Inventory races could oversell scarce products. |
| 62 | BUG-MKT-002 | Stuck or double-released inventory could distort availability. |
| 63 | BUG-MKT-004 | Checkout and settlement price divergence could create systematic disputes. |
| 64 | BUG-MKT-005 | Delayed vendor events could reactivate cancelled orders. |
| 65 | BUG-MKT-016 | Duplicate delivery creation could duplicate service fees and assignments. |
| 66 | BUG-MKT-024 | Out-of-order order events could display or enforce obsolete status. |
| 67 | BUG-MKT-025 | Address edits could bypass pricing and availability checks. |
| 68 | BUG-SAFE-002 | Stale emergency broadcasts could reach unavailable providers. |
| 69 | BUG-SAFE-005 | Urgent requests could be delayed by scheduled-dispatch behavior. |
| 70 | BUG-SAFE-007 | Partial SOS cancellation could leave escalation inconsistent. |
| 71 | BUG-SAFE-010 | Ratings could be attributed to the wrong provider. |
| 72 | BUG-LOC-010 | SOS using stale location could impair emergency response. |
| 73 | BUG-LOC-002 | Zone disagreement could alter matching, fare, and service eligibility. |
| 74 | BUG-LOC-004 | Out-of-order GPS data could affect fare and safety decisions. |
| 75 | BUG-LOC-005 | Last-known location could be treated as live availability. |
| 76 | BUG-LOC-003 | Spoofed arrival could enable fraudulent no-show or cancellation fees. |
| 77 | BUG-LOC-006 | Duplicate zone events could repeatedly alter fare or incentives. |
| 78 | BUG-LOC-001 | H3 boundary inconsistencies could cause intermittent matching failures. |
| 79 | BUG-INFRA-016 | Time-zone errors could affect scheduled rides, expiries, and promotions. |
| 80 | BUG-INFRA-017 | Deadline boundary disagreement could affect auctions and acceptances. |
| 81 | BUG-INFRA-016 | Month-end and local-time mistakes could affect subscriptions and tax periods. |
| 82 | BUG-INFRA-007 | WebSocket reconnect duplication could multiply visible events and actions. |
| 83 | BUG-INFRA-008 | Out-of-order client events could cause stale UI actions. |
| 84 | BUG-INFRA-022 | Backgrounded mobile actions could submit stale completions or acceptances. |
| 85 | BUG-INFRA-028 | Early provider callbacks could be permanently lost. |
| 86 | BUG-INFRA-029 | Provider recovery replay could cause callback storms and duplicates. |
| 87 | BUG-INFRA-025 | Counter drift could hide capacity, inventory, or accounting problems. |
| 88 | BUG-INFRA-026 | Orphaned financial or assignment records could accumulate unprocessed liabilities. |
| 89 | BUG-INFRA-017 | Batch checkpoint errors could skip or duplicate financial records. |
| 90 | BUG-INFRA-006 | One bad record could prevent an entire expiry or payout batch. |
| 91 | BUG-CROSS-007 | Cross-tenant reporting could expose regulated customer and financial data. |
| 92 | BUG-CROSS-009 | Bulk admin actions could mutate records that no longer meet selection criteria. |
| 93 | BUG-CROSS-010 | Missing audit trails could prevent investigation and recovery. |
| 94 | BUG-CROSS-016 | Revoked users could retain access to exported sensitive data. |
| 95 | BUG-CROSS-017 | Search indexes could expose deactivated or cross-tenant records. |
| 96 | BUG-CROSS-018 | Soft-delete cascades could leave active child operations. |
| 97 | BUG-CROSS-019 | Manual and automated refunds could overlap. |
| 98 | BUG-CROSS-011 | Subscription plan and entitlement divergence could cause billing disputes. |
| 99 | BUG-CROSS-012 | Concurrent additions could bypass fleet subscription limits. |
| 100 | BUG-CROSS-013 | Subscription cancellation could incorrectly remove or retain paid access. |

## 3. Top 30 Rare but Severe Bugs

These scenarios could be especially likely to escape ordinary testing because they require unusual timing, multiple actors, provider failure, stale state, retries, or scheduler interaction.

| Rank | Bug ID | Rare trigger | Potential consequence |
|---:|---|---|---|
| 1 | BUG-CROSS-020 | A transaction commits immediately before event publication fails, followed by database failover before replay. | Downstream payment, wallet, tax, fleet, and notification state could remain permanently stale. |
| 2 | BUG-FIN-005 | A provider callback arrives with a reused or malformed reference during a retry storm. | A successful payment could be applied to the wrong customer or transaction. |
| 3 | BUG-MKT-011 | Automatic rental award, buyer confirmation, and deadline job execute on different workers at the same boundary. | Multiple winners or contradictory award state could result. |
| 4 | BUG-DISPATCH-019 | Driver completion, rider cancellation, and delayed location event arrive in a specific order. | A terminal ride could become active again and trigger new billing or dispatch. |
| 5 | BUG-SAFE-001 | Two ambulance providers accept after network partition and both later reconnect. | Both could travel to the incident, or neither could be reliably designated primary. |
| 6 | BUG-INFRA-009 | A mobile token reconnects during account switching while old channel cleanup is delayed. | Events from the previous account or tenant could reach the new session. |
| 7 | BUG-FIN-008 | Wallet update succeeds while ledger write commits on a different storage path that later fails. | Available funds could permanently diverge from accounting records. |
| 8 | BUG-FIN-010 | Two refund requests are issued from customer support and an automatic cancellation handler. | Refund could exceed the original charge. |
| 9 | BUG-DISPATCH-030 | A driver accepts a rental while an emergency dispatcher evaluates an old availability snapshot. | One scarce resource could be committed to incompatible services. |
| 10 | BUG-MKT-006 | Food-order retry occurs after delivery creation succeeds but before the bridge response reaches the order service. | Duplicate delivery legs and duplicate driver assignments could result. |
| 11 | BUG-FIN-004 | A “success” callback arrives after a “failure” callback, followed by a duplicate success retry. | Payment and entitlement state could oscillate or be credited twice. |
| 12 | BUG-INFRA-028 | A callback arrives before the internal order transaction becomes visible to the callback worker. | A legitimate payment or delivery event could be discarded. |
| 13 | BUG-LOC-004 | GPS messages cross in transit during a sharp turn or cell change. | Distance, waiting time, geofence, and safety decisions could use impossible movement. |
| 14 | BUG-INFRA-016 | A scheduled ride is created around a Dhaka midnight transition while workers use UTC. | Dispatch, expiry, or cancellation could occur on the wrong local date. |
| 15 | BUG-FIN-030 | Accounting export crashes after external submission but before the internal checkpoint commits. | A replay could duplicate journal entries. |
| 16 | BUG-CROSS-014 | A payment chargeback occurs after driver payout and vendor settlement but before nightly reconciliation. | Multiple downstream balances could require manual recovery. |
| 17 | BUG-DISPATCH-003 | Cancellation, offer timeout, and redispatch all execute after a delayed provider response. | Multiple assignments and contradictory notifications could be created. |
| 18 | BUG-SAFE-007 | SOS cancellation reaches push but not escalation, or escalation but not support. | One safety channel could falsely indicate that the incident is closed. |
| 19 | BUG-MKT-018 | A delivery driver replays an offline proof-of-delivery action after receiving a new order. | Proof could attach to the wrong order. |
| 20 | BUG-FIN-029 | A rare provider or fallback path returns BDT while the normal path expects paisa. | A transaction could be off by a factor of 100. |
| 21 | BUG-AUTH-005 | An identifier collision or replica lag occurs during a cross-tenant lookup. | One tenant’s ride, order, or wallet data could be exposed or modified. |
| 22 | BUG-INFRA-001 | Scheduler lease renewal arrives after another worker has already reclaimed the job. | Both workers could process financial or state-changing effects. |
| 23 | BUG-MKT-009 | A sealed-bid object is cached before the deadline and served after authorization changes. | A bidder could see confidential competitor information. |
| 24 | BUG-DISPATCH-029 | Driver and vehicle updates succeed independently during fleet reassignment. | Two drivers could operate under one vehicle identity or one driver under two vehicles. |
| 25 | BUG-FIN-024 | Provisional and final earnings events are replayed after a payout batch starts. | Duplicate driver payout could be difficult to recover. |
| 26 | BUG-CROSS-001 | Ride completion commits, payment service times out, and reconciliation runs before the retry becomes visible. | The ride could be treated as both unpaid and already reconciled. |
| 27 | BUG-INFRA-003 | An old expiration job runs after an admin manually extends the object. | The valid object could be expired by stale background work. |
| 28 | BUG-SAFE-003 | Certification revocation occurs between provider matching and emergency acceptance. | An ineligible provider could still receive the emergency assignment. |
| 29 | BUG-FIN-035 | Provider reconciliation matches on amount and date after a reference field is missing. | Funds could be assigned to the wrong customer or account. |
| 30 | BUG-CROSS-008 | Late refunds, reversals, or corrections cross a reporting-period boundary. | Operational reports, tax reports, ledger totals, and payout statements could disagree. |

## 4. Self-Critique and Coverage Gaps

The catalogue emphasizes cross-service races and financial state, but the following areas should receive explicit verification because they could still contain missed failure modes:

- **Identity and recovery:** phone-number reassignment, merged accounts, device-token reuse, session revocation, privileged support impersonation, and recovery artifacts.
- **Authorization:** tenant scoping in operational APIs, WebSockets, exports, search indexes, background jobs, reports, and provider callbacks.
- **Financial paths:** authorization versus capture, partial capture, reversals, chargebacks, manual adjustments, tax reversals, payout cutoff logic, wallet holds, negative balances, and unmatched provider transactions.
- **State machines:** terminal-state immutability, transition versioning, repeated transitions, cancellation after completion, refunds after chargebacks, and job execution after manual correction.
- **Resource locking:** drivers, vehicles, ambulances, rental resources, delivery capacity, subscriptions, and cross-vertical exclusivity should be examined as shared scarce resources rather than separate domain records.
- **Marketplace interactions:** inventory reservation, RFQ secrecy, rental deadline precision, winner replacement, stale losers, delivery creation, return flows, vendor cancellation, and order-to-delivery reconciliation.
- **Emergency safety:** certification revocation, urgent-versus-scheduled priority, stale provider broadcasts, SOS escalation cancellation, location freshness, and fallback behavior during provider outage.
- **Scheduler behavior:** duplicate workers, missed leases, backlog ordering, partial batch failure, retries after manual intervention, daylight/time-zone boundaries, and stale jobs modifying newer state.
- **WebSockets and notifications:** reconnect duplication, recipient authorization, event sequence numbers, stale deep links, device-token revocation, post-cancellation messages, and notification privacy.
- **Mobile behavior:** offline queues, backgrounding, multiple devices, optimistic UI, server-success/client-timeout behavior, retry-key persistence, and local state after account switching.
- **Configuration:** feature-flag skew, stale configuration caches, rollout consistency, unit conventions, currency units, map-provider fallback contracts, and configuration versioning.
- **Data repair:** orphan cleanup, reconciliation heuristics, counter repair, cache invalidation, soft-delete cascades, and whether automated repair itself is idempotent.
- **Observability:** every state-changing operation should be traceable by a stable business identifier, idempotency key, actor, tenant, source device, event version, provider reference, and job execution ID.
- **Duplicate consolidation:** the highest-overlap clusters are duplicate payment/settlement effects, stale event state reversal, scheduler duplication, cross-vertical resource conflicts, order-to-delivery duplication, wallet/ledger divergence, and authorization/cache inconsistency. These should be tested through shared idempotency and versioning controls rather than only through separate endpoint tests.

A practical verification sequence would be: first establish invariants for terminal states, resource uniqueness, payment/refund upper bounds, ledger balance, tenant isolation, and emergency eligibility; then inject retries, delayed events, duplicate callbacks, worker overlap, provider outages, clock skew, reconnects, and concurrent user actions against those invariants.