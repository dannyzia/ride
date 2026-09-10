# RIDE — Full Bug Catalogue (Theoretical)

> Independent possible-bug survey. No codebase access. Hedging language only.
> Each finding describes a **plausible failure mode**, not a confirmed defect.
> Cross-references use `[BUG-XX-NNN]`.

---

## How to read this catalogue

- **Severity** = potential blast radius × recoverability × safety/financial exposure.
- **Likelihood** = how often the preconditions tend to occur in production.
- **Detection difficulty** = how likely a normal QA / monitoring pass would catch it.
- The full column schema is in the brief; abbreviated here for density: ID | CATEGORY | MODULE | POSSIBLE BUG | TRIGGER | PLAUSIBILITY | IMPACT | SEV | LIK | DET | AFFECTED.

---

## A. Auth, Sessions & Multi-tenancy (AUTH)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-AUTH-001 | Concurrency | Auth / Session | Concurrent logout from two devices — revocation cache lags, JWT still validates for a window | Rider taps logout on phone A while phone B holds an open socket; cache invalidation is async | Stateless JWT + async revocation list; cache TTL vs token TTL not aligned | Rider believes they are logged out; a leaked token still authorizes requests | HIGH | HIGH | EASY | Auth, WebSocket, all API |
| BUG-AUTH-002 | Concurrency | Auth / Session | Multi-device login — last-writer-wins on session row leaves an old device with a "valid" session pointer | User logs in on new phone; older phone continues; if single-row constraint exists, which device sees the conflict? | DB schema likely allows multiple active sessions; no "current device" enforcement | Audit trail broken, no device-binding for sensitive ops | MED | HIGH | EASY | Auth, Audit |
| BUG-AUTH-003 | Retry/Idempotency | OTP | Same OTP consumed twice if verification path re-checks then marks used without a transaction | Network blip → user re-enters OTP → server verifies, returns 5xx before marking consumed; client retries, OTP validates again | OTP table write may not be atomic with verification return | Account takeover if attacker intercepted OTP | CRITICAL | MED | HARD | Auth, OTP |
| BUG-AUTH-004 | Security | OTP | OTP brute force — insufficient rate limit / lockout on the verify endpoint | Attacker submits 6-digit codes at high rate | Rate limit often applied at send, not verify | Account takeover | CRITICAL | MED | EASY | Auth |
| BUG-AUTH-005 | Async | OTP | OTP expires before user receives SMS due to provider delay | Provider queue depth high; user receives code 6 min later | TTL typically 3–5 min; SMS latency in BD can exceed that | User locked out, retries charge to provider quota | MED | HIGH | EASY | Auth, Provider |
| BUG-AUTH-006 | Security | Session | Session fixation — token not rotated after privilege escalation (e.g. KYC upgrade) | User logs in as unverified, completes KYC, token claims not refreshed | JWT claims usually immutable until next login | Escalated privileges (e.g. driver mode) gated by stale role | HIGH | MED | HARD | Auth, Driver lifecycle |
| BUG-AUTH-007 | Security | Ride PIN | Driver-onboard flow uses ride PIN to authenticate, PIN leaks via shoulder-surf / screen share | Driver shares screen in support call showing PIN | PIN may be a 4-digit short code, low entropy | Account takeover or impersonation | HIGH | MED | EASY | Auth, Driver |
| BUG-AUTH-008 | Time | Auth | Token expiry relies on server clock, client clock skews → "token expired" or "token valid" mismatch | User device clock wrong | If expiry check uses both server and client (e.g. refresh logic) | Auth flap, mass logouts | MED | MED | EASY | Auth |
| BUG-AUTH-009 | State machine | Auth | Soft-deleted account still has a valid WebSocket connection emitting events | Admin deletes user → DB row soft-deleted, but live socket not terminated | Async account delete vs live connections | Deleted user receives data, can act in window | HIGH | MED | HARD | Auth, WS |
| BUG-AUTH-010 | Multi-tenancy | Auth | Token issued for tenant A is presented to tenant B endpoint; middleware only checks signature, not tenant claim | User belongs to two tenants (e.g. fleet owner + rider) | If claims don't disambiguate, scope check missing | Cross-tenant data leak | CRITICAL | MED | HARD | Auth, Fleet |
| BUG-AUTH-011 | State machine | RBAC | Role change (driver → fleet-admin) not reflected in active session cache | Admin promotes user; user keeps old role for cache TTL | Role lookup cached; no invalidation on role update | Stale privilege boundary | HIGH | MED | MED | Auth, Admin |
| BUG-AUTH-012 | Retry/Idempotency | Refresh token | Refresh token reuse after rotation not detected | Old refresh token replayed; if rotation marks old as expired async, race window | Refresh rotation often optimistic | Token theft undetectable | HIGH | LOW | HARD | Auth |
| BUG-AUTH-013 | Functional | Auth | Phone number change without re-verification of new number | Attacker hijacks account via SIM swap, changes phone, locks out original owner | "Verify old then add new" pattern without cool-down | Account takeover | CRITICAL | LOW | MED | Auth |
| BUG-AUTH-014 | Security | WebSocket | WebSocket handshake authenticates, but per-message authorization skipped | After upgrade, server trusts socket for all event types | WS handlers often skip per-message RBAC | Privilege escalation on live channel | CRITICAL | MED | HARD | WS, Auth |
| BUG-AUTH-015 | State machine | WebSocket | Client reconnects with revoked token during brief network outage | Server revokes session; client's reconnect logic still holds old token | Reconnect path may bypass revocation check | Brief unauthorized access | HIGH | MED | MED | WS, Auth |
| BUG-AUTH-016 | Security | Mobile/Auth | Biometric bypass on rooted/jailbroken device via Frida hook | Rooted Android, attacker hooks biometric gate | Biometric often backed by server token, but local gate is first line | Local bypass → server side may still hold real token | MED | LOW | MED | Auth, Mobile |
| BUG-AUTH-017 | Security | Auth | OTP delivered to voicemail or call forwarding if SMS fails, attacker intercepts | SIM swap or voicemail hack | SMS fallback common in BD | Account takeover | CRITICAL | LOW | HARD | Auth |

---

## B. Dispatch, Matching, Auto-accept, Live Tracking (DISPATCH)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-DISPATCH-001 | Concurrency | Dispatch | Driver assigned to two rides simultaneously (double dispatch) | Two riders request same second, race between "find available driver" and "mark unavailable" | If availability is a read-then-write without row lock or atomic CAS | Rider A waits, rider B waits, one driver "switches", chaos | CRITICAL | MED | MED | Dispatch, Driver, Rider |
| BUG-DISPATCH-002 | Concurrency | Dispatch | Auto-redispatch sends new offer before old driver has formally declined | Driver "reject" request is in flight; redispatch timer fires in parallel | Reject path and redispatch timer are likely two separate code paths | Rider sees two drivers converging | CRITICAL | MED | HARD | Dispatch |
| BUG-DISPATCH-003 | State machine | Driver location | Driver marked available but last GPS update is hours stale | Phone in pocket, no network; status stays "online" because last update was good | Heartbeat and online status are usually decoupled | Stale driver matched far from rider → long ETA, bad rating | HIGH | HIGH | MED | Dispatch, ETA |
| BUG-DISPATCH-004 | Functional | H3 / Geospatial | Rider and driver in adjacent H3 cells at the chosen resolution → never match | Pickup is exactly on a cell boundary; H3 resolution too coarse | H3 resolution choice is global, not pickup-adaptive | No match, rider wait time soars | HIGH | MED | MED | Dispatch, H3 |
| BUG-DISPATCH-005 | Concurrency | Dispatch | Driver taps Accept in app, server processes later; offer expires meanwhile → driver thinks they have ride, system thinks no | Latency between client tap and server processing exceeds offer window | Offer timeout and accept are separate timers | Ghost ride — driver arrives, no rider | HIGH | MED | MED | Dispatch |
| BUG-DISPATCH-006 | State machine | Driver | Driver cancels after picking up — system state machine doesn't model mid-trip cancel cleanly | Driver hits Cancel button after "Started" state | Cancel action may only be defined for pre-pickup states | Rider stranded, no auto-redispatch, no fee applied | CRITICAL | MED | MED | Dispatch, Rider |
| BUG-DISPATCH-007 | State machine | Surge | Surge applied to wrong zone because cell boundary at pickup vs at request time differs | Rider requests in zone X, driver in zone Y, surge taken from Y | If surge is fetched per driver location not per pickup | Unfair pricing, regulatory risk | HIGH | MED | HARD | Surge, Pricing |
| BUG-DISPATCH-008 | Concurrency | Dispatch | First driver rejects, offer to second, first driver changes mind and accepts in last second | Driver UI slow → reject is post-acceptance | Single-offer / single-decision model with optimistic UI | Two drivers en route, one is ghost | CRITICAL | MED | HARD | Dispatch |
| BUG-DISPATCH-009 | Concurrency | Driver | Driver marked "en route to pickup" for two rides due to "I am coming" pre-confirm | Driver accepts ride, then sees another nearby offer and pre-confirms | If "coming" state is per-driver not per-ride | Driver split, both riders wait | CRITICAL | LOW | HARD | Dispatch, Driver |
| BUG-DISPATCH-010 | Async | Location | GPS glitch sends 100s of location updates, server storm, dispatch picks wrong "current" point | Phone reboots, sends history in burst | If upsert is "last write wins" and history not filtered | Driver matched against an outdated location | MED | HIGH | EASY | Dispatch, Location |
| BUG-DISPATCH-011 | Security/Location | Driver | Driver runs a GPS spoofer to be matched with far rides for high-surge | App on rooted device with mock location | App may not detect root or mock providers | Surge gaming, fake ETA | HIGH | MED | HARD | Security, Surge, Location |
| BUG-DISPATCH-012 | Functional | H3 | Dispatch uses H3 res 8, fare engine uses res 9, zone-based fee mismatch | Pickup at cell boundary that splits across resolutions | Resolution choice inconsistent across services | Fare quote ≠ final fare | MED | MED | HARD | Fare, H3 |
| BUG-DISPATCH-013 | State machine | Fare | Zone changes during ride (e.g. city limit crossed), fare recalculated mid-trip | Long ride crosses zone | If fare is computed continuously not snapshotted | Final fare differs from quote | HIGH | MED | MED | Fare, Dispatch |
| BUG-DISPATCH-014 | State machine | Driver | Driver "arrived at pickup" state stuck after rider cancels | Cancel races with arrival event | Cancel and arrival both update same row | Driver keeps "arrived" status, next rider affected | MED | MED | MED | Dispatch, Driver |
| BUG-DISPATCH-015 | State machine | Scheduled ride | Scheduled ride dispatches before the scheduled time due to clock drift / timezone | Server uses UTC, scheduler config is local | DST not handled in scheduled jobs | Early dispatch, rider not ready | HIGH | MED | MED | Dispatch, Scheduled, Time |
| BUG-DISPATCH-016 | Functional | Multi-stop | Multi-stop ride — driver app doesn't show stops in order; rider adds stop after first | API order not preserved through WebSocket | If stops are an unordered set in WS payload | Driver misses stop, route wrong | HIGH | MED | MED | Dispatch, Multi-stop |
| BUG-DISPATCH-017 | State machine | Dispatch | Driver goes offline mid-ride (eats battery, app killed) — system doesn't redispatch | OS kills app, heartbeat stops | If only the driver app signals "offline", server is passive | Rider sees ghost driver, no rescue flow | HIGH | MED | HARD | Dispatch, Mobile |
| BUG-DISPATCH-018 | Concurrency | Auto-accept | Two drivers auto-accept the same offer at the same millisecond | Both drivers enabled auto-accept for similar zones | Auto-accept is server-side race if not gated by row lock | Two drivers, one rider | CRITICAL | LOW | HARD | Dispatch, Auto-accept |
| BUG-DISPATCH-019 | State machine | Ride PIN | PIN verification timer expires before rider reaches driver | PIN timeout = 60s, but driver far from rider | Timer is per-ride, not adjusted for distance | Driver cancels, no-show fee applied | MED | MED | EASY | Dispatch, PIN |
| BUG-DISPATCH-020 | Functional | Ride PIN | PIN bypass on a rebook — second leg has no PIN | System bug or product decision on rebook | Feature parity may not be enforced across flows | Rebook ride starts without rider verification | MED | LOW | EASY | Dispatch, PIN |
| BUG-DISPATCH-021 | Concurrency | Match | Two riders request at same time in same zone with one available driver — both matched | Race in offer creation | Atomic offer gate missing | Two rides, one driver | CRITICAL | MED | HARD | Dispatch |
| BUG-DISPATCH-022 | State machine | Auto-redispatch | Redispatch picks same driver that just cancelled | Cancelled driver still in candidate set | If cancel doesn't remove from pool until next tick | Same driver rejects again | HIGH | MED | MED | Dispatch |
| BUG-DISPATCH-023 | Concurrency | Live tracking | Rider cancels at exact moment driver taps "Start" — who wins? | Rider UI slow, driver proceeded | Two writes, no version column | Ride state inconsistent, fee may not apply correctly | HIGH | MED | HARD | Dispatch, Cancel |
| BUG-DISPATCH-024 | Functional | Zone | Driver enters restricted zone, dispatch still sends them offers | Geo-fence not enforced server-side | Client may check but server is the authority | Regulatory / unauthorized ride | HIGH | LOW | MED | Dispatch, Zone |

---

## C. Fare, Pricing, Surge (FARE)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-FARE-001 | State machine | Cancellation fee | Cancellation fee computed with surge applied | Rider cancels during peak | If fee formula doesn't strip surge | Excessive fee, complaints | HIGH | MED | MED | Fare, Cancel |
| BUG-FARE-002 | Functional | Fare | Minimum fare below operating cost on certain routes | Short ride, base fare too low | Pricing config may not be per-vehicle | Driver subsidizes ride | MED | MED | EASY | Fare |
| BUG-FARE-003 | Functional | Multi-stop | Multi-stop fare only counts first leg distance | Stop added mid-ride | If only origin-destination distance used | Driver underpaid for actual distance | HIGH | MED | HARD | Fare, Multi-stop |
| BUG-FARE-004 | Functional | Fare | Detour fare calculated using GPS jitter (driver circles once) | GPS drift inflates distance | No smoothing or snap-to-road | Inflated fare, refund requests | MED | HIGH | EASY | Fare, GPS |
| BUG-FARE-005 | Concurrency | Fare | Fare displayed on rider and driver apps diverge mid-ride | Quote cached on rider side, recalculated on driver side | Different re-quote cadences | Trust issue, dispute | HIGH | HIGH | MED | Fare |
| BUG-FARE-006 | Functional | Fare | Quote vs final fare large delta — no explanation surfaced | Distance calc, time, or surge changed | If quote is "best estimate" without guardrail | Rider disputes charge | HIGH | HIGH | EASY | Fare, Trust |
| BUG-FARE-007 | Functional | Toll | Toll not included in fare for known toll routes | Pickup inside Dhaka, route crosses a toll | Toll list may be incomplete | Driver eats toll, or rider charged post-hoc | MED | MED | MED | Fare |
| BUG-FARE-008 | Functional | Toll | Toll charged twice (entry + exit) on same route | Fare loop adds each toll waypoint | If tolls are waypoint-based without dedup | Double charge | MED | LOW | MED | Fare |
| BUG-FARE-009 | State machine | Cancel fee | Pickup fee charged even if driver cancels | Driver no-shows after matching | If fee is on "matched" not "started by driver" | Rider wrongly charged | HIGH | MED | MED | Fare, Cancel |
| BUG-FARE-010 | Functional | Wait time | Wait time charged during traffic light stop | Stop > wait time threshold | If timer doesn't pause on signal stop | Inflated fare | MED | HIGH | EASY | Fare |
| BUG-FARE-011 | Time | Fare | Night surcharge applied during daytime due to server timezone wrong | Server in UTC, config in Dhaka time | TZ misconfig in cron / surge rule | Overcharge or undercharge | MED | LOW | EASY | Fare, Time |
| BUG-FARE-012 | Functional | Promotion | Surge multiplier stacked with promotion discount | Surge 1.5x + 20% off | If discount applies to base, surge still adds on top | Confusing math, potential regulatory issue | HIGH | HIGH | EASY | Fare, Promo |
| BUG-FARE-013 | Time | Scheduled ride | Scheduled ride fare calculated at booking time, not at pickup | Surge moved between booking and pickup | Snapshot is booking-time | Rider pays old surge, or driver loses | HIGH | MED | MED | Fare, Scheduled |
| BUG-FARE-014 | Functional | Zone | Cross-zone fare computed with wrong zone pair | Pickup zone A, drop zone B | Zone table may not cover all pairs | Incorrect fare | MED | MED | MED | Fare, Zone |
| BUG-FARE-015 | State machine | Cancel | Free cancellation timer expires late → fee charged when it shouldn't be | Server delay, race | Timer may be checked against cached time | Wrong fee | MED | MED | MED | Fare, Cancel |
| BUG-FARE-016 | Concurrency | Cancel | Driver-initiated cancel bypasses cancellation fee | Driver cancels from app, no fee on rider | If "canceler" type check missing | Rider never charged fee even when warranted | MED | HIGH | MED | Fare, Cancel |
| BUG-FARE-017 | Functional | Fare | Currency unit mismatch — fare stored in BDT, gateway expects paisa → 100× charge or 1/100 charge | Misconfigured multiplier | Conversion constants in code, not in config | Massive over/undercharge | CRITICAL | LOW | EASY | Fare, Payment |
| BUG-FARE-018 | Functional | Fare | Floating-point fare → rounding loses 0.99 BDT repeatedly | Each leg rounded down | If rounding per leg, not per total | Systemic driver underpayment | MED | MED | HARD | Fare, Financial |
| BUG-FARE-019 | Functional | Fare | Tip charged after ride complete window — silent re-charge | Rider kept app open past window | If tip is "re-bill" not "add charge" | Unexpected charge | MED | LOW | HARD | Fare, Tip |
| BUG-FARE-020 | State machine | Fare | Refund includes tip refund but tip already paid to driver wallet | Refund triggered after driver cashout | Tip settlement order wrong | Loss for platform or driver | HIGH | MED | HARD | Fare, Tip, Refund |

---

## D. Payments, Wallet, Ledger, Refunds, Tax, Payouts (PAY)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-PAY-001 | Retry/Idempotency | Payment | Payment callback processed twice — duplicate wallet credit | Provider retries webhook; server not idempotent on event ID | Webhooks are at-least-once by design | Double credit, real money loss | CRITICAL | HIGH | MED | Payment, Wallet |
| BUG-PAY-002 | Concurrency | Payment | Wallet debited before payment gateway confirms → reversal race | Optimistic debit then confirm | If confirm is async, refund may race | Balance negative, customer complaint | CRITICAL | MED | HARD | Payment, Wallet |
| BUG-PAY-003 | Concurrency | Refund | Refund issued to wrong wallet because user changed wallet mid-flow | User swapped wallet in app during refund processing | If refund uses "current wallet" not "wallet at time of payment" | Refund lost | HIGH | LOW | HARD | Refund, Wallet |
| BUG-PAY-004 | Functional | Refund | Refund > original amount due to bug in amount calc | Partial cancel still credits full | Sign error in refund logic | Real money loss | CRITICAL | MED | MED | Refund |
| BUG-PAY-005 | Retry/Idempotency | Refund | Double refund — same refund triggered by user retry and webhook | Both paths succeed | Idempotency key on refund not enforced | Real money loss | CRITICAL | MED | MED | Refund |
| BUG-PAY-006 | Concurrency | Top-up | Top-up wallet before payment gateway confirms → user spends, gateway rejects | Pre-auth flow | Optimistic credit | Negative balance after settle | CRITICAL | MED | HARD | Top-up, Wallet |
| BUG-PAY-007 | Async | Top-up | Top-up success at gateway but wallet not credited (event lost) | Webhook dropped, no listener | Webhook delivery is at-least-once but could be lost | Customer balance wrong | CRITICAL | MED | HARD | Top-up, Wallet |
| BUG-PAY-008 | Async | Payment | Payment success, ride not marked paid | Webhook processed but ride state not updated | If payment service and ride service are decoupled | Unpaid ride marked complete | HIGH | MED | MED | Payment, Ride |
| BUG-PAY-009 | Functional | Promotion | Promotion applied after discount already given | Two promotion engines | Race between two discount paths | Double discount, real loss | CRITICAL | MED | HARD | Promotion, Payment |
| BUG-PAY-010 | Functional | Promotion | Two promotions stacked when only one allowed | UI shows only one, server allows both | Server-side validation missing | Excessive discount | HIGH | HIGH | EASY | Promotion |
| BUG-PAY-011 | State machine | Promotion | Promotion applied to cancelled ride (refund should be net) | Refund returns full amount, promo not reversed | If promo is a credit not a discount on capture | Loss on cancel | HIGH | MED | MED | Promotion, Refund |
| BUG-PAY-012 | State machine | Pass | Pass expired mid-ride but fare calculated with pass price | Long ride across expiry | If pass check is one-shot at start | Undercharge | MED | MED | MED | Pass, Fare |
| BUG-PAY-013 | Functional | Currency | BDT vs paisa off-by-100 — entire fare 100× wrong | Misconfig in provider adapter | Conversion factor often hardcoded | Massive financial error | CRITICAL | LOW | EASY | Currency, Fare, Payment |
| BUG-PAY-014 | Functional | Fare | Floating-point fare rounding | Each leg or tax rounded separately | Half-even vs floor not consistent | Tiny but systemic loss | MED | HIGH | HARD | Fare, Financial |
| BUG-PAY-015 | State machine | Tip | Tip charged after ride-complete window | Rider keeps app open | If tip window is server-side post window only | Unexpected charge | MED | MED | MED | Tip, Fare |
| BUG-PAY-016 | Functional | Tip | Tip from wallet when wallet has insufficient balance | Tip > balance | If tip is "request debit" not "validate first" | Negative wallet, overdraft | MED | LOW | MED | Tip, Wallet |
| BUG-PAY-017 | State machine | Payment | Partial payment (wallet + cash) — cash not recorded | Driver marks cash but app didn't sync | If cash requires online confirmation | Ledger drift, driver earnings wrong | HIGH | HIGH | MED | Payment, Driver earnings |
| BUG-PAY-018 | Concurrency | Payout | Driver earnings counted twice in next payout cycle | Reversal + re-credit both recorded as earnings | Idempotency on earnings record missing | Driver overpaid | HIGH | MED | HARD | Payout, Earnings |
| BUG-PAY-019 | State machine | Cancel fee | Cancellation fee charged to wrong party | Driver cancels but rider wallet debited | If fee is always from rider unless explicitly routed | Rider wrongly charged | HIGH | MED | MED | Cancel, Payment |
| BUG-PAY-020 | State machine | No-show | No-show fee charged but rider actually showed | Driver reports no-show, rider did show | Driver's report trusted without evidence | Rider wrongly charged | HIGH | HIGH | HARD | No-show, Payment |
| BUG-PAY-021 | Functional | Wait | Waiting charges accumulated after ride started | Wait timer not stopped at start | If wait timer and ride timer are separate | Overcharge | MED | MED | MED | Wait, Fare |
| BUG-PAY-022 | State machine | Fare | Surge applied retroactively on completed ride | Backend job recalculates and rebills | If quote is not authoritative | Surprise charge | CRITICAL | MED | HARD | Surge, Fare |
| BUG-PAY-023 | Functional | Tax | Tax calculated on pre-discount amount | Tax engine uses base, not discounted | Tax rules vary, easy to wire wrong | Over-tax, regulatory issue | HIGH | MED | MED | Tax |
| BUG-PAY-024 | Functional | Tax | Tax charged on cancelled ride (refund must zero tax) | Cancel + refund flow doesn't reverse tax | Tax + refund integration often bespoke | Regulatory issue | MED | MED | MED | Tax, Refund |
| BUG-PAY-025 | Functional | Ledger | Double-entry broken — debit without matching credit | Bug in ledger entry creation | Ledger is a separate system, easy to drift | Ledger imbalance, audit failure | CRITICAL | MED | HARD | Ledger, Accounting |
| BUG-PAY-026 | Concurrency | Wallet | Wallet balance ≠ sum of ledger entries (read replica lag) | User sees old balance after rapid spend | If wallet uses read replica | Customer overpays or under-spends | HIGH | HIGH | MED | Wallet, Ledger |
| BUG-PAY-027 | State machine | Payout | Payout sent to wrong driver | Driver ID swapped, similar names | If payout batch keyed on name not ID | Real money loss | CRITICAL | LOW | MED | Payout |
| BUG-PAY-028 | State machine | Payout | Payout to closed bank account | Driver account closed | If no account status check | Bounce, delay, fee | MED | MED | MED | Payout |
| BUG-PAY-029 | Concurrency | Bonus | Bonus / incentive paid twice | Two trigger sources (campaign + leaderboard) | If incentives from multiple sources not deduped | Overpay | HIGH | MED | HARD | Bonus, Driver earnings |
| BUG-PAY-030 | State machine | COD | COD order paid but not marked paid in system | Driver collected, forgot to confirm | If COD confirmation is manual | Ledger drift, vendor complaint | HIGH | HIGH | MED | COD, Marketplace |
| BUG-PAY-031 | Retry/Idempotency | Wallet | Wallet top-up retried by client, gateway debits twice, one credit | Client timeout, retry | If top-up not idempotent on client txn ID | Double credit | CRITICAL | MED | HARD | Wallet, Top-up |
| BUG-PAY-032 | State machine | Refund | Refund to gateway but gateway rejects (expired card) | Original card expired | If refund doesn't try alternate route | Stuck refund | HIGH | MED | MED | Refund |
| BUG-PAY-033 | Functional | Tax | VAT computation wrong for ride vs marketplace | Different rules per vertical | Tax engine may not be vertical-aware | Regulatory exposure | HIGH | MED | MED | Tax, Marketplace |
| BUG-PAY-034 | Functional | Payout | Payout cycle uses wrong currency for cross-border | Cross-border (BD-IN) | If payout currency is platform default not per driver | Driver short-paid | MED | LOW | MED | Payout |
| BUG-PAY-035 | Retry/Idempotency | Notification | Payment success notification sent twice | Webhook retry | Notification send is fire-and-forget | User confused, "I got charged twice?" | LOW | HIGH | EASY | Notif, Payment |
| BUG-PAY-036 | Functional | Reconciliation | Daily reconciliation job reads while writes happen | Job starts before midnight cutoff | Race between job and ongoing transactions | Discrepancy report wrong | HIGH | HIGH | MED | Reconciliation, Financial |
| BUG-PAY-037 | State machine | Bonus | Bonus given to driver who then cancels — bonus not clawed back | Driver bonus then cancel | If clawback is a separate scheduled job | Overpay | MED | MED | MED | Bonus |
| BUG-PAY-038 | Functional | Refund | Refund processed to old payment method after user updated | User updated card | Refund uses original method, may fail | Customer not refunded | MED | MED | MED | Refund |
| BUG-PAY-039 | State machine | Wallet | Wallet frozen for fraud review, ride payment still debits | Admin freezes wallet | If freeze only blocks manual top-up not auto-debit | Customer surprised, dispute | MED | MED | MED | Wallet, Fraud |
| BUG-PAY-040 | Functional | Ledger | Ledger entry created without corresponding notification to ops | Backfill process | If backfill is "silent" | Audit blind spot | MED | MED | HARD | Ledger, Audit |

---

## E. Location, GPS, H3, Zone (LOC)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-LOC-001 | Functional | GPS | GPS drift inflates distance for fare | Urban canyon, multipath | GPS accuracy not filtered | Inflated fare | MED | HIGH | EASY | Fare, GPS |
| BUG-LOC-002 | State machine | GPS | Stale location used after driver goes offline | Heartbeat stopped | Server may not zero out location | Match against old position | HIGH | HIGH | MED | Dispatch, Location |
| BUG-LOC-003 | Security | GPS | Location spoofing (mock provider) | Rooted device | App may not detect | Match fraud, surge gaming | HIGH | MED | HARD | Security, Surge |
| BUG-LOC-004 | Functional | H3 | H3 cell boundary mismatch between dispatch and fare | Resolution differs | Per-feature resolution choices | Fare / dispatch diverge | MED | MED | HARD | H3, Dispatch, Fare |
| BUG-LOC-005 | Time | Zone | Timezone for zone — Dhaka vs server | Cron uses UTC | Server TZ config | Wrong surge window | MED | MED | EASY | Zone, Surge, Time |
| BUG-LOC-006 | Functional | Zone | Zone polygon doesn't cover a real area (gap) | Admin drew polygon with gap | Manual polygon drawing | Riders in gap can't be matched | MED | LOW | EASY | Zone, Dispatch |
| BUG-LOC-007 | State machine | Zone | Driver zone change doesn't propagate to dispatch | Driver moves | Cache TTL | Wrong match pool | MED | MED | MED | Zone, Dispatch |
| BUG-LOC-008 | Functional | ETA | ETA calculated against driver destination, not pickup | Wrong reference point | If ETA uses different pin than dispatch | Bad rider experience | MED | MED | EASY | ETA, Dispatch |
| BUG-LOC-009 | Concurrency | GPS | GPS burst on app start overwrites correct location with stale | App launch sends old fixes first | If order is "send all" not "send latest" | Driver matched at old position | MED | MED | MED | GPS, Dispatch |

---

## F. Driver & Vehicle Lifecycle, Fleet, Subscriptions (LIFE)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-LIFE-001 | Concurrency | Driver | Driver online on two devices simultaneously | Two phones logged in | Multi-session allowed without single-active enforcement | Double-dispatch risk, audit confusion | HIGH | MED | MED | Driver, Dispatch |
| BUG-LIFE-002 | State machine | Driver | Driver marked online but location not updating | App in background, no permission | Online status independent of location | Ghost driver matched | HIGH | HIGH | MED | Driver, Dispatch |
| BUG-LIFE-003 | State machine | Driver | Document expired but driver still allowed (license, fitness) | Admin didn't set renewal reminder | Validation may be at upload not periodic | Regulatory risk | HIGH | MED | MED | Driver, Compliance |
| BUG-LIFE-004 | State machine | Driver | Background check pending but driver operating | Fast-track onboarding | If state machine allows "operating" before "approved" | Compliance failure | HIGH | MED | MED | Driver, Onboarding |
| BUG-LIFE-005 | State machine | Driver | Driver deactivated but session still active | Admin deactivates mid-shift | If deactivation doesn't force logout | Deactivated driver can still receive offers | CRITICAL | MED | HARD | Driver, Auth |
| BUG-LIFE-006 | Concurrency | Fleet | Vehicle assigned to two drivers | Two fleet admins both edit | Row lock missing | Insurance/regulatory nightmare | CRITICAL | MED | HARD | Fleet, Vehicle |
| BUG-LIFE-007 | State machine | Fleet | Vehicle unassigned mid-ride | Fleet admin reassigns | If no "vehicle locked during ride" check | Wrong vehicle attributed to ride | HIGH | LOW | HARD | Fleet, Ride |
| BUG-LIFE-008 | State machine | Rider | Rider rebooks cancelled ride — cancellation fee still applies | Auto-rebook | If rebook links to old ride | Wrong fee | MED | MED | EASY | Rider, Cancel |
| BUG-LIFE-009 | State machine | No-show | Rider no-show after ride started | Driver marks started then rider absent | State machine may allow "started" without rider | Driver stranded, no fee? | MED | MED | MED | Ride, No-show |
| BUG-LIFE-010 | State machine | No-show | Driver reports rider no-show, but rider actually in car | Driver wants to cancel mid-ride | If driver report is trusted without evidence | Rider wrongly charged no-show fee | HIGH | HIGH | HARD | No-show, Payment |
| BUG-LIFE-011 | State machine | Fleet | Subscription tier limits not enforced (e.g. number of vehicles) | Fleet adds vehicle beyond plan | If quota check missing | Revenue leakage | MED | MED | MED | Fleet, Subscription |
| BUG-LIFE-012 | State machine | Fleet | Subscription expired but vehicle still active | Auto-renewal fails | If expiry check is periodic not on-event | Revenue leakage, access | MED | MED | MED | Fleet, Subscription |
| BUG-LIFE-013 | State machine | Driver | Driver becomes fleet admin via role update — sees other tenants | Bug in role hierarchy | If role change inherits broader perms | Data leak across tenants | CRITICAL | LOW | HARD | Fleet, RBAC |
| BUG-LIFE-014 | State machine | Driver | Driver certification expired mid-shift (e.g. ambulance cert) | Cert valid at start, expires later | If check is at session start not ride start | Compliance | HIGH | MED | MED | Driver, Compliance |
| BUG-LIFE-015 | State machine | Vehicle | Vehicle insurance expired but vehicle still dispatched | Renewal pending | If check is at onboarding not per-ride | Regulatory | HIGH | MED | MED | Vehicle, Compliance |

---

## G. SOS, Safety, Trip Sharing (SOS)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-SOS-001 | Functional | SOS | SOS button doesn't trigger when app is backgrounded (OS killed background tasks) | User presses power+volume on locked phone | Background execution limited on modern Android/iOS | SOS fails when most needed | CRITICAL | MED | HARD | SOS, Mobile |
| BUG-SOS-002 | State machine | SOS | SOS triggered with stale location (last fix 30 min ago) | Indoor, no GPS | If last fix used | Wrong dispatch location | CRITICAL | MED | MED | SOS, Location |
| BUG-SOS-003 | State machine | SOS | SOS contacts list stale — old ex-partner still listed | User updated contacts in OS, not in app | If app keeps its own copy | Privacy/safety | CRITICAL | LOW | MED | SOS, Privacy |
| BUG-SOS-004 | State machine | SOS | SOS auto-cancels after timeout (e.g. 5 min) | User unconscious | If SOS has a "no response, auto-cancel" timer | False sense of safety | CRITICAL | LOW | HARD | SOS |
| BUG-SOS-005 | State machine | SOS | SOS acknowledged by contact but no follow-up with authorities | Contact just opened link | If "ack" doesn't trigger escalation | Safety gap | HIGH | MED | MED | SOS |
| BUG-SOS-006 | State machine | Trip share | Trip share link still works after trip cancelled | Sharer forgot to revoke | If share is a static URL until explicit revoke | Privacy | HIGH | MED | MED | Privacy, Trip share |
| BUG-SOS-007 | State machine | Trip share | Trip share link works indefinitely (no expiry) | Long after trip | If no TTL on share | Privacy | MED | HIGH | EASY | Privacy |
| BUG-SOS-008 | Functional | SOS | Audio recording fails silently (no storage permission) | User in distress, permission denied | If recording is best-effort | Evidence loss | HIGH | MED | MED | SOS |

---

## H. Marketplace — Shops, Products, Orders (SHOP)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-SHOP-001 | State machine | Catalog | Product deleted while in rider's cart | Shop owner removes item | If cart is snapshotted only at checkout | Cart mismatch, order fails | MED | MED | EASY | Catalog, Cart |
| BUG-SHOP-002 | Concurrency | Inventory | Stock decremented before payment confirmed | Reservation window | If decrement is "optimistic" | Oversell, customer disappointment | HIGH | HIGH | MED | Inventory, Order |
| BUG-SHOP-003 | Functional | Inventory | Stock goes negative | Concurrent decrement without check | No DB constraint or constraint bypassed | Oversell | MED | MED | EASY | Inventory |
| BUG-SHOP-004 | State machine | Order | Order placed on closed shop | Shop hours check stale | Cache or no real-time check | Cannot fulfill | MED | MED | EASY | Order, Shop |
| BUG-SHOP-005 | State machine | Pricing | Shop owner modifies price after order | Edit while order pending | If price snapshot not enforced | Customer overcharged or undercharged | HIGH | MED | MED | Pricing, Order |
| BUG-SHOP-006 | Concurrency | Inventory | Two buyers race for last item | Flash sale | Atomic decrement missing | Oversell | HIGH | MED | HARD | Inventory |
| BUG-SHOP-007 | Functional | Cart | Cart not cleared after order placed | Same session, new order | If clear is async | Duplicate order | HIGH | LOW | MED | Cart, Order |
| BUG-SHOP-008 | State machine | Order | Order confirmation sent to wrong customer | Notification routing bug | If customer_id is mutable | Privacy, confusion | CRITICAL | LOW | HARD | Order, Notif, Privacy |
| BUG-SHOP-009 | Functional | Refund | Refund issued for non-existent order | Typo in order ID | If refund validates weakly | Real money loss | CRITICAL | LOW | MED | Refund, Order |
| BUG-SHOP-010 | Functional | Refund | Partial refund quantities don't match | Multi-item order, partial return | If refund line items aren't tied to order lines | Vendor complaint | MED | MED | MED | Refund, Order |
| BUG-SHOP-011 | State machine | Order | Shop owner marks shipped but order was cancelled | Race | If state machine allows forward-only | Customer receives goods, no order | HIGH | MED | MED | Order, Shipping |
| BUG-SHOP-012 | State machine | Delivery | Delivery person not assigned but order shows "out for delivery" | Auto-status misfire | If status is set by other trigger | Customer waits, no driver | HIGH | MED | MED | Order, Delivery |
| BUG-SHOP-013 | State machine | Order | Order modified after delivery (e.g. item added) | Vendor modifies | If "delivered" isn't terminal | Manipulation | MED | MED | MED | Order |
| BUG-SHOP-014 | Functional | Pricing | Variant price wrong (e.g. size L not L price) | Vendor misconfig | UI may show right, server wrong | Dispute | MED | MED | MED | Pricing, Catalog |

---

## I. Rentals, Bidding, RFQ (RENT)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-RENT-001 | Security | Bidding | Sealed-bid visibility leak — admin or vendor support can see all bids before deadline | Privileged user queries DB | If "sealed" is only at API level | Bidding integrity broken | CRITICAL | MED | HARD | Bidding, Security |
| BUG-RENT-002 | Retry/Idempotency | Bidding | Bid modified after deadline (network retry succeeds) | Client retry of late submit | If deadline check is on submit, not on persist | Unfair advantage | HIGH | MED | HARD | Bidding |
| BUG-RENT-003 | Functional | Bidding | Bid submitted with negative or zero amount | Validation missing | Easy bug | Auction integrity | HIGH | LOW | EASY | Bidding |
| BUG-RENT-004 | Time | Bidding | Bid submitted after deadline due to client clock skew | Server uses client time | If deadline enforced client-side | Unfair | MED | MED | MED | Bidding, Time |
| BUG-RENT-005 | Concurrency | Bidding | Award race — two bids accepted simultaneously | Admin clicks "Award" twice | No row lock | Two winners, double allocation | CRITICAL | MED | HARD | Bidding |
| BUG-RENT-006 | State machine | Bidding | Award without sufficient funds in bidder wallet | Wallet pre-check missing | If post-award only | Failed deal, downtime | HIGH | MED | MED | Bidding, Wallet |
| BUG-RENT-007 | State machine | Bidding | Awarded bid cancelled by bidder | Bidder changes mind | Cancellation flow allows post-award cancel | Operational chaos | HIGH | MED | MED | Bidding |
| BUG-RENT-008 | Concurrency | Fleet | Awarded rental — vehicle reassigned to another rental | Concurrent admin actions | If vehicle lock missing | Two rentals, one vehicle | CRITICAL | MED | HARD | Rental, Fleet |
| BUG-RENT-009 | State machine | Bidding | Old winner continues receiving events after re-award | WebSocket not closed on re-award | If events are tenant-scoped not rental-scoped | Confusion, fraud risk | HIGH | MED | HARD | Bidding, WS |
| BUG-RENT-010 | Time | Bidding | SLA expiry race — award at last second triggers weird state | Award at deadline | Edge case | Confusing | MED | MED | MED | Bidding, Time |
| BUG-RENT-011 | State machine | Bidding | Driver demoted after award (KYC fails, rating drops) | Background check completes late | If demotion not cascading to award | Compliance | HIGH | MED | HARD | Bidding, Driver |
| BUG-RENT-012 | Concurrency | Bidding | Driver and admin confirm award simultaneously | Conflicting confirmations | If confirmation is two-sided | Double confirmation | MED | MED | MED | Bidding |
| BUG-RENT-013 | Functional | RFQ | RFQ submitted to wrong category | Vendor mis-tag | If category inference is brittle | Wrong vendors, time wasted | MED | MED | EASY | RFQ |
| BUG-RENT-014 | State machine | RFQ | Vendor sees RFQ after deadline | Stale notification | If RFQ access check is not time-bound | Unfair | HIGH | LOW | HARD | RFQ |
| BUG-RENT-015 | Retry/Idempotency | RFQ | Vendor modifies RFQ response after submit | Client retry | If response is mutable | Bidding integrity | HIGH | MED | HARD | RFQ |
| BUG-RENT-016 | Concurrency | RFQ | Multiple RFQs accepted for same request | Race | If accept is optimistic | Two vendors start work | HIGH | MED | HARD | RFQ |

---

## J. Delivery, Courier, Truck Rental (DELIV)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-DELIV-001 | Functional | Delivery | Package delivered to wrong address due to GPS pin swap | Driver app shows wrong pin | If pickup vs drop pins are conflated | Lost package | HIGH | MED | MED | Delivery |
| BUG-DELIV-002 | Functional | Delivery | Package weight misdeclared → wrong fee | Sender under-declares | If weight not verified at pickup | Revenue loss | MED | HIGH | MED | Delivery, Fare |
| BUG-DELIV-003 | State machine | Delivery | Multi-package delivery — only some delivered, all marked delivered | Driver marks all at once | If marking is "all" not per-package | Lost items | HIGH | MED | MED | Delivery |
| BUG-DELIV-004 | State machine | Delivery | Return-to-sender race (recipient refuses, sender cancels) | Two cancel paths | If only one path is wired | Lost package | HIGH | MED | MED | Delivery |
| BUG-DELIV-005 | Functional | POD | Proof of delivery image uploaded but not linked to delivery | Upload async, link missing | If upload returns but link not stored | No proof | MED | MED | HARD | Delivery, POD |
| BUG-DELIV-006 | State machine | COD | COD collected by driver but not deposited / recorded | Driver collects, app crashed | If COD requires online confirmation | Vendor short-paid | HIGH | HIGH | MED | COD, Delivery |
| BUG-DELIV-007 | State machine | Delivery | Recipient not home, but driver marks delivered | Pressure on driver | If driver can self-attest without proof | Fraud, dispute | HIGH | MED | HARD | Delivery, POD |
| BUG-DELIV-008 | Concurrency | Delivery | Two drivers assigned to same package | Re-broadcast after timeout | Race in assignment | Two pickups | CRITICAL | LOW | HARD | Delivery, Dispatch |

---

## K. Food Delivery (FOOD)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-FOOD-001 | State machine | Food | Restaurant accepts order, then closes / goes offline | Restaurant turns off tablet | If state not refreshed | Order cannot be made | HIGH | MED | MED | Food, Order |
| BUG-FOOD-002 | State machine | Food | Order modified after kitchen started preparation | Customer adds item | If "started" isn't a lock | Kitchen chaos | MED | MED | EASY | Food |
| BUG-FOOD-003 | Concurrency | Inventory | Item out of stock but still orderable | Menu not updated | Cache staleness | Refund, angry customer | HIGH | HIGH | EASY | Food, Inventory |
| BUG-FOOD-004 | Functional | ETA | Delivery time calculated with stale traffic | Heavy rain, ETA doesn't update | If ETA is static at quote | Late delivery, low rating | MED | HIGH | EASY | Food, ETA |
| BUG-FOOD-005 | State machine | Food | Cold food / time expired but not flagged | Long kitchen delay | If no SLA timer | Quality issue | MED | HIGH | MED | Food, SLA |
| BUG-FOOD-006 | Functional | Food | Rider picks up from wrong restaurant | Multiple shops at same complex | If restaurant ID not shown to rider | Wrong food delivered | HIGH | MED | EASY | Food, Delivery |
| BUG-FOOD-007 | Concurrency | Food | Multiple riders assigned to same food order | Re-dispatch | Race in assignment | Two pickups | CRITICAL | LOW | HARD | Food, Dispatch |
| BUG-FOOD-008 | Functional | Food | Food order bridged to wrong delivery (ride-hailing instead of dedicated food) | Wrong service selected | If routing logic is loose | Wrong vehicle | MED | MED | MED | Food, Delivery |

---

## L. Ambulance & Emergency (AMB)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-AMB-001 | State machine | Ambulance | Certification expired but ambulance still dispatched | Cert valid at start, expires later | If check is at start of shift not per-request | Compliance, life-safety | CRITICAL | MED | HARD | Ambulance, Compliance |
| BUG-AMB-002 | State machine | Ambulance | Wrong ambulance type dispatched (BLS vs ALS) | Triage data not consulted | If dispatcher defaults to first available | Patient risk | CRITICAL | MED | MED | Ambulance, Safety |
| BUG-AMB-003 | Concurrency | Ambulance | First-accept race — two ambulances both accept | Both see alert at same time | Atomic accept gate missing | Two ambulances dispatched, one is ghost | CRITICAL | MED | HARD | Ambulance, Dispatch |
| BUG-AMB-004 | State machine | Ambulance | Broadcast to stale providers (offline, far) | Provider list not refreshed | If provider pool is cached | Slow response | CRITICAL | MED | HARD | Ambulance, Dispatch |
| BUG-AMB-005 | Functional | Ambulance | Wrong geographic radius — too far | Radius config wrong | If radius is global default | Long ETA, life-safety | CRITICAL | MED | MED | Ambulance, Location |
| BUG-AMB-006 | State machine | Ambulance | Scheduled ambulance dispatched urgently (or vice versa) | Type mismatch | If type isn't checked at dispatch | Wrong response | CRITICAL | LOW | HARD | Ambulance |
| BUG-AMB-007 | State machine | Ambulance | Equipment (oxygen, defibrillator) expired but ambulance dispatched | Maintenance not synced | If equipment check is manual | Patient risk | CRITICAL | LOW | HARD | Ambulance, Equipment |
| BUG-AMB-008 | Concurrency | Ambulance | Provider en route to one emergency, assigned to another | Re-broadcast | If assignment is not locked on en route | Two emergencies, one provider | CRITICAL | LOW | HARD | Ambulance |

---

## M. Admin, RBAC, Reporting (ADMIN)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-ADMIN-001 | Security | Admin | IDOR — admin lists rides without tenant scope | URL like `/admin/rides/{id}` | If middleware only checks role, not ownership | Cross-tenant data leak | CRITICAL | MED | MED | Admin, Multi-tenancy |
| BUG-ADMIN-002 | Security | RBAC | Role escalation — driver calls admin endpoint with valid token but wrong role | Bug in middleware | If role check is endpoint-level only, not per-action | Privilege escalation | CRITICAL | MED | MED | RBAC, Security |
| BUG-ADMIN-003 | State machine | Admin | Admin force-completes a ride that driver already cancelled | Manual override | If override is not audited | Financial impact | HIGH | MED | MED | Admin, Audit |
| BUG-ADMIN-004 | Functional | Report | Financial report totals don't match sum of rows | Rounding / aggregation bug | Reports are separate code | Audit failure | HIGH | MED | MED | Report, Financial |
| BUG-ADMIN-005 | Time | Report | Report uses UTC for date filter but admin expects Dhaka day | TZ misconfig | Common bug | Wrong data in report | MED | MED | EASY | Report, Time |
| BUG-ADMIN-006 | Functional | Tax | Admin tax report misses one vertical (e.g. ambulance) | Per-vertical config not applied | Vertical routing complex | Regulatory | HIGH | LOW | HARD | Tax, Report |
| BUG-ADMIN-007 | Security | Audit | Admin action (refund, payout) not logged | Logging skipped | If logging is opt-in | Audit gap, regulatory | CRITICAL | MED | HARD | Audit |
| BUG-ADMIN-008 | State machine | Admin | Admin marks driver "active" but original deactivation reason still queued | Two actions race | If state machine allows backwards | Inconsistent state | MED | MED | MED | Admin, Driver |

---

## N. Scheduler, Cron, Background Jobs (SCHED)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-SCHED-001 | Concurrency | Scheduler | Duplicate job execution (cron + manual trigger) | Ops runs job manually | No distributed lock | Double effect (e.g. double payout) | CRITICAL | MED | MED | Scheduler, Payout |
| BUG-SCHED-002 | Concurrency | Scheduler | Missed job (long-running previous) | Previous run still going | No overlap protection | Stale data | HIGH | HIGH | EASY | Scheduler |
| BUG-SCHED-003 | Concurrency | Scheduler | Job runs on stale data (read replica lag) | Heavy reads on replica | If scheduler uses replica | Wrong payouts, etc. | HIGH | HIGH | MED | Scheduler, Read replica |
| BUG-SCHED-004 | Concurrency | Scheduler | Overlapping jobs (two instances both run) | Multi-region scheduler | No global lock | Double effect | CRITICAL | MED | HARD | Scheduler |
| BUG-SCHED-005 | Concurrency | Scheduler | Backlog cascade — job falls behind | Slow downstream | No backpressure | Stale reports, late payouts | HIGH | HIGH | MED | Scheduler |
| BUG-SCHED-006 | Concurrency | Scheduler | Cascading failure — one job fails, others pile up | Downstream outage | No DLQ or rate limit | All jobs late | HIGH | MED | MED | Scheduler |
| BUG-SCHED-007 | Time | Scheduler | Cron runs in wrong timezone | UTC vs Dhaka | TZ config | Daily summary at wrong time | MED | MED | EASY | Scheduler, Time |
| BUG-SCHED-008 | Time | Scheduler | Cron overlap with DST (if BD ever observes) | DST change | Rare but possible | Job runs twice or not at all | LOW | LOW | HARD | Scheduler, Time |
| BUG-SCHED-009 | Concurrency | Scheduler | Payout job runs twice in same day | Reschedule | No idempotency | Double payout | CRITICAL | MED | HARD | Payout, Scheduler |
| BUG-SCHED-010 | State machine | Scheduler | Payout job skips failed payouts, never retries | Initial failure | If retry is a separate job | Driver unpaid | HIGH | MED | MED | Payout |
| BUG-SCHED-011 | Concurrency | Scheduler | Daily summary job races with new transactions | Job at midnight | If cutoff is wrong | Count mismatch | MED | HIGH | MED | Report, Scheduler |
| BUG-SCHED-012 | State machine | Scheduler | Scheduled ride dispatcher fires before the time | TZ bug | Per [BUG-DISPATCH-015] | Early dispatch | HIGH | MED | MED | Dispatch, Scheduled |
| BUG-SCHED-013 | Concurrency | Scheduler | Subscription expiry job and renewal race | Both fire at expiry | If not coordinated | Brief unauthorized use | MED | MED | MED | Subscription, Scheduler |
| BUG-SCHED-014 | Functional | Scheduler | Job silently fails (exception eaten) | Bad data | If no alerting | Silent failure | HIGH | MED | HARD | Scheduler |
| BUG-SCHED-015 | Concurrency | Scheduler | Invoice generation job races with new orders | Long generation | Cutoff issue | Invoice missing items | MED | MED | MED | Invoice, Scheduler |

---

## O. WebSocket, Real-time Events, Notifications (WS / NOTIF)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-WS-001 | Concurrency | WebSocket | WebSocket message lost on reconnect (server didn't queue) | Brief disconnect | If server doesn't buffer per-client | Lost event | MED | HIGH | MED | WS |
| BUG-WS-002 | Concurrency | WebSocket | Duplicate message on reconnect (server re-sent everything) | Reconnect logic | If no "last event id" tracking | Duplicate effect (e.g. double charge) | HIGH | MED | HARD | WS, Payment |
| BUG-WS-003 | State machine | WebSocket | Stale message received after new state | Out-of-order delivery | If ordering not guaranteed | Client acts on stale | HIGH | MED | HARD | WS |
| BUG-WS-004 | State machine | WebSocket | Out-of-order messages | Network | If no seq number | Race in client logic | MED | MED | HARD | WS |
| BUG-WS-005 | State machine | WebSocket | WebSocket event sent to wrong recipient (broadcast too wide) | Multi-tenant bug | If channel scoping missed | Privacy leak | CRITICAL | LOW | HARD | WS, Privacy |
| BUG-WS-006 | Concurrency | WebSocket | Backpressure — server slow, client flood | Spike | If no flow control | Lost events, latency | MED | MED | MED | WS |
| BUG-WS-007 | State machine | WebSocket | Auth token expires mid-session, server keeps sending | Long socket | If refresh not implemented | Privileged stream | HIGH | MED | MED | WS, Auth |
| BUG-WS-008 | Concurrency | WebSocket | Reconnect with old message ID, server replays | Client logic | If replay uses client message ID | Duplicate effects | MED | LOW | HARD | WS |
| BUG-WS-009 | Concurrency | WebSocket | Driver location update storm during reconnect — duplicate locations | Burst on reconnect | If client sends history on connect | Match against old pos | MED | MED | MED | WS, GPS |
| BUG-NOTIF-001 | Functional | Notif | Push notification to wrong user | Token mismatch | If notification key uses device ID not user | Privacy | CRITICAL | LOW | HARD | Notif, Privacy |
| BUG-NOTIF-002 | State machine | Notif | Notification for cancelled ride | Race | If notif sent before cancel registered | User confused | LOW | HIGH | EASY | Notif |
| BUG-NOTIF-003 | State machine | Notif | Stale deep link — opens cancelled ride | Cached notification | If payload not refreshed | User sees old state | LOW | HIGH | EASY | Notif |
| BUG-NOTIF-004 | State machine | Notif | Multi-device — only one device notified | Old device, new device | If notif fanout missing | Missed alert | MED | HIGH | EASY | Notif |
| BUG-NOTIF-005 | Async | Notif | Notification lost when device offline | No offline queue | If push fails, no fallback | Missed alert | MED | MED | MED | Notif |
| BUG-NOTIF-006 | Functional | Notif | SMS to international number fails silently | Non-BD number | If SMS provider doesn't support | User can't login | MED | MED | MED | Notif, Auth |
| BUG-NOTIF-007 | Security | Notif | Email with sensitive data leaked (PII, OTP) | Email mis-routed | If email not scoped | Privacy | CRITICAL | LOW | HARD | Notif, Privacy |

---

## P. Feature Flags, Config, A/B (FF)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-FF-001 | State machine | Feature flag | Feature flag enabled in API but not in client — UI doesn't show it | Partial rollout | Per-layer config | Confusion | MED | HIGH | EASY | Config |
| BUG-FF-002 | Functional | Config | Feature flag unit mismatch (seconds vs ms) | New config | If unit implicit | 1000× wrong timing | HIGH | MED | HARD | Config |
| BUG-FF-003 | State machine | Config | Config changed but cache not invalidated | Update | If cache TTL long | Wrong behavior until TTL | MED | HIGH | EASY | Config |
| BUG-FF-004 | State machine | A/B | A/B bucket assignment changes mid-session | User logs out, in | If bucket = hash(user_id) but reassigned | Inconsistent UX | MED | MED | MED | A/B |
| BUG-FF-005 | Security | Config | Tier-based feature visible in lower tier (e.g. ambulance) | Misconfig | If tier check missing | Compliance | HIGH | LOW | HARD | Config, RBAC |

---

## Q. Time, Timezone, Boundary (TIME)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-TIME-001 | Time | Fare | UTC vs Dhaka time in surge window | Server UTC | TZ config | Wrong surge | MED | MED | EASY | Fare, Time |
| BUG-TIME-002 | Time | Coupon | Coupon expired at 23:59, user claims at 23:58:30 but server says expired | Clock skew | If coupon TTL is exact | Coupon rejected | LOW | HIGH | EASY | Promo, Time |
| BUG-TIME-003 | Time | Billing | Month-end billing — driver active on last day | Cutoff | If cutoff wrong | Wrong invoice | MED | MED | MED | Billing, Time |
| BUG-TIME-004 | Time | Scheduler | DST not handled (BD currently doesn't observe) | DST change | Forward compat | Jobs run twice or skip | LOW | LOW | HARD | Time, Scheduler |
| BUG-TIME-005 | Functional | UI | Countdown timer wrong due to sync delay | Server-client clock | If timer is client-only | Missed action | MED | HIGH | EASY | UI, Time |
| BUG-TIME-006 | State machine | Scheduled ride | Scheduled ride in the past | Past time submitted | If validation missing | Instant dispatch? | MED | MED | EASY | Scheduled, Time |
| BUG-TIME-007 | Time | Cross-border | Cross-border (BD-IN) timezone for ride | Cross-border ride | If system assumes single TZ | Wrong timestamp | MED | LOW | MED | Time, Cross-border |
| BUG-TIME-008 | Time | OTP | OTP TTL uses server time but client shows countdown from different base | Client clock wrong | If countdown client-side only | User confused | LOW | HIGH | EASY | OTP, Time |

---

## R. Data Consistency, Cache, Cross-service (DATA)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-DATA-001 | State machine | Data | Soft-delete — record marked deleted but still queryable | App filter missing `deleted_at` | If soft-delete filter missed | Ghost data | HIGH | MED | HARD | Data |
| BUG-DATA-002 | State machine | Cache | Cache stale — pricing from yesterday | Cache TTL long | If TTL > config change | Wrong fare | MED | HIGH | EASY | Cache, Fare |
| BUG-DATA-003 | Functional | Counter | Counter drift — trip count off by 1 | Concurrent increments | No atomic | Stat wrong | LOW | HIGH | HARD | Counter |
| BUG-DATA-004 | Functional | Referential | Orphan record — payment without ride | Race in insert | If FK not enforced | Audit gap | MED | MED | MED | Data |
| BUG-DATA-005 | Concurrency | Wallet/Ledger | Wallet balance ≠ sum of ledger entries | Read replica lag, or bug | If wallet uses replica | Customer overpays | HIGH | HIGH | MED | Wallet, Ledger |
| BUG-DATA-006 | Concurrency | Cross-service | Cross-service chain — A succeeds, B fails | Payment OK, ride not marked paid | Distributed transaction missing | Inconsistent state | CRITICAL | MED | HARD | Cross-service |
| BUG-DATA-007 | Concurrency | Consistency | Eventual consistency window — rider sees old status | Replica lag | If API reads from replica | Confusing | MED | HIGH | EASY | Consistency |
| BUG-DATA-008 | Functional | Data | Read replica lag — driver stats wrong | Heavy load | If stats from replica | Driver misinformed | MED | HIGH | MED | Data |
| BUG-DATA-009 | Functional | DB | Database constraint missing — duplicate row | Race | If no unique index | Duplicate data | MED | MED | HARD | DB |
| BUG-DATA-010 | State machine | Cache | User profile cache stale after update | Cache TTL | If TTL long | Wrong name in ride | MED | MED | EASY | Cache, Profile |

---

## S. Mobile, Network, Offline (MOB)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-MOB-001 | Retry/Idempotency | Mobile | Request retried on 5xx — server actually succeeded | Timeout | If client retries on 5xx | Duplicate effect | HIGH | HIGH | HARD | Mobile, Retry |
| BUG-MOB-002 | State machine | Mobile | Backgrounded app — heartbeat stopped, marked offline | OS pauses | If heartbeat not OS-aware | False offline | HIGH | HIGH | MED | Mobile, Dispatch |
| BUG-MOB-003 | Retry/Idempotency | Mobile | Local queue replay — duplicate action after reconnect | Offline → online | If queue not deduped | Duplicate | HIGH | MED | HARD | Mobile, Retry |
| BUG-MOB-004 | State machine | Mobile | Stale state after reconnect | Local state not refreshed | If state not pulled on reconnect | User acts on stale | MED | HIGH | MED | Mobile |
| BUG-MOB-005 | State machine | Mobile | App killed during ride — driver thinks offline | OS kills app | If server only reacts to client signal | Rider sees ghost | HIGH | MED | HARD | Mobile, Driver |
| BUG-MOB-006 | Functional | Mobile | App version mismatch — old client calls new API | Old app not forced update | If API allows old | Wrong behavior | MED | MED | EASY | Mobile, API |
| BUG-MOB-007 | Concurrency | Mobile | Slow network — request times out, action not sent | Edge | If timeout = send | Lost action | MED | HIGH | EASY | Mobile |
| BUG-MOB-008 | State machine | Mobile | Offline mode — actions queued indefinitely | Long offline | If queue unbounded | Stale actions | MED | MED | MED | Mobile |

---

## T. Security, Fraud, Privacy (SEC)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-SEC-001 | Security | IDOR | See other user's ride via predictable ID | URL guess | If only auth check, not ownership | Privacy breach | CRITICAL | MED | EASY | Security, Privacy |
| BUG-SEC-002 | Security | RBAC | Privilege escalation via API | Misrouted call | If role check is global, not per-action | Takeover | CRITICAL | MED | MED | Security, RBAC |
| BUG-SEC-003 | Security | Location | Driver location spoofing | Mock provider | If not detected | Surge gaming | HIGH | MED | HARD | Security, Surge |
| BUG-SEC-004 | Security | Promo | Promo code brute force | Many tries | If rate limit weak | Revenue loss | MED | MED | EASY | Security, Promo |
| BUG-SEC-005 | Fraud | Collusion | Rider + driver collude for fake ride, split refund | Pattern | If anomaly detection weak | Real money loss | HIGH | MED | HARD | Fraud |
| BUG-SEC-006 | Security | Location | Fake GPS during ride | Rooted device | If app doesn't verify | Inflated fare | HIGH | MED | HARD | Security, Fare |
| BUG-SEC-007 | Security | Payment | Replay attack on payment callback | Re-send webhook | If webhook not signed | Duplicate credit | CRITICAL | MED | MED | Security, Payment |
| BUG-SEC-008 | Fraud | Promo | Promo stacking via race | Click both, race | If not atomic | Excessive discount | HIGH | MED | HARD | Fraud, Promo |
| BUG-SEC-009 | Security | Auth | Account takeover via leaked OTP | SIM swap | If SIM swap not detected | Account hijack | CRITICAL | LOW | HARD | Security, Auth |
| BUG-SEC-010 | Fraud | Collusion | Driver colluding with rider for fake rides | Pattern | If pattern not detected | Money laundering | HIGH | MED | HARD | Fraud |
| BUG-SEC-011 | Fraud | Self-hail | Rider = driver (same person both sides) | Two accounts | If not detected | Bonus fraud | MED | MED | HARD | Fraud |
| BUG-SEC-012 | Security | Privacy | Driver PII leaked via API | Endpoint with too much data | Over-fetch | Privacy | HIGH | MED | EASY | Security, Privacy |
| BUG-SEC-013 | Security | Payment | Webhook signature not verified | Provider sends unsigned | If verification optional | Spoofed callback | CRITICAL | LOW | MED | Security, Payment |
| BUG-SEC-014 | Security | WebSocket | WS handler doesn't re-verify per message | Token expired | Per-message auth missing | Privilege escalation on live channel | CRITICAL | MED | HARD | Security, WS |
| BUG-SEC-015 | Security | Privacy | Trip data retained beyond policy | No TTL | If retention is per-feature | Regulatory | MED | HIGH | EASY | Privacy |

---

## U. Cross-cutting / Interaction Bugs (X)

These arise specifically from interactions between features.

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-X-001 | Cross-cutting | Rental + Delivery | Same driver simultaneously eligible for rental and delivery | Overlapping eligibility windows | If driver pools are not partitioned | Sub-optimal dispatch, fairness | MED | MED | MED | Rental, Delivery, Dispatch |
| BUG-X-002 | Cross-cutting | Food + Bridge | Order→delivery bridge duplicates when retried | Client retry of bridge call | If bridge endpoint not idempotent | Two deliveries, double charge | CRITICAL | MED | HARD | Food, Delivery, Idempotency |
| BUG-X-003 | Cross-cutting | Emergency + Ride | Ambulance provider accepts ride-hailing offer | Provider pool overlap | If pools not disjoint | Wrong service, life-safety | CRITICAL | LOW | HARD | Ambulance, Ride |
| BUG-X-004 | Cross-cutting | Multi-stop + Fare | Multi-stop ride re-quoted mid-ride using single-leg algorithm | Quote recalculated | If multi-stop logic only at quote | Fare delta, dispute | HIGH | MED | HARD | Multi-stop, Fare |
| BUG-X-005 | Cross-cutting | Prom + Pass | Promo + pass both apply | Stacking | Per [BUG-PAY-010] | Excessive discount | HIGH | HIGH | EASY | Promo, Pass |
| BUG-X-006 | Cross-cutting | Scheduled + Auto-accept | Scheduled ride matched to driver who has auto-accept on, driver wasn't ready | Pre-scheduled dispatch | If scheduled and instant share flow | Bad experience | MED | MED | MED | Scheduled, Auto-accept |
| BUG-X-007 | Cross-cutting | Wallet + Refund + Tax | Refund reverses payment but tax/VAT not reversed | Tax integration missing | If tax is a separate record | Regulatory | HIGH | MED | HARD | Wallet, Refund, Tax |
| BUG-X-008 | Cross-cutting | Multi-tenant + RBAC | Fleet admin of tenant A queries tenant B's data via report endpoint | Report endpoint missing tenant scope | Per [BUG-ADMIN-001] | Cross-tenant leak | CRITICAL | MED | HARD | Multi-tenancy, RBAC |
| BUG-X-009 | Cross-cutting | Driver deactivation + Active ride | Driver deactivated mid-ride (admin action), no driver replacement | If deactivation doesn't trigger reassignment | Per [BUG-LIFE-005] | Rider stranded | HIGH | MED | MED | Driver, Ride |
| BUG-X-010 | Cross-cutting | Tip + Wallet + Payout | Tip paid by rider wallet, already in driver's earnings pool, but payout cycle locks pre-tip | Payout snapshot | If tip is post-snapshot | Tip not paid out | HIGH | MED | HARD | Tip, Payout |
| BUG-X-011 | Cross-cutting | Auto-redispatch + PIN | Redispatch re-sends offer, rider gets new PIN, but driver in transit still has old PIN | PIN regenerated on re-offer | If PIN is per-ride not per-offer | Confusion | MED | MED | MED | Auto-redispatch, PIN |
| BUG-X-012 | Cross-cutting | Bonus + Cancel | Bonus given then ride cancelled — clawback runs but driver already cashed out | Clawback after payout | If clawback not blocking | Loss for platform | HIGH | MED | HARD | Bonus, Payout |
| BUG-X-013 | Cross-cutting | Loyalty + Refund | Loyalty points earned on ride then ride refunded | Points credited before refund | If points crediting is eager | Loss | MED | MED | MED | Loyalty, Refund |
| BUG-X-014 | Cross-cutting | KYC + Active ride | Driver KYC rejected mid-shift, but no termination of current ride | If KYC check is async | Regulatory | HIGH | MED | HARD | KYC, Driver, Compliance |
| BUG-X-015 | Cross-cutting | Rental + Vehicle rebalance | Driver reassigned to vehicle rebalance task mid-rental | Two tasks at once | If driver can be in two states | Service degradation | MED | MED | HARD | Rental, Fleet |
| BUG-X-016 | Cross-cutting | Timezone + Cross-border | Bangladesh-India ride, surge applied using BD rules on IN side | Single rule | If surge is region-global | Wrong surge | MED | LOW | HARD | Time, Cross-border |
| BUG-X-017 | Cross-cutting | Subscriptions + Limits | Driver hits daily bonus cap, but scheduled ride pre-cap, dispatched post-cap | If cap is checked at booking not start | Confusing earnings | MED | MED | MED | Bonus, Scheduled |
| BUG-X-018 | Cross-cutting | WebSocket + Cache | Stale WebSocket state sent because server cache hasn't refreshed | TTL race | Per [BUG-DATA-002] | Ghost events | MED | MED | MED | WS, Cache |
| BUG-X-019 | Cross-cutting | Multi-tenant + Wallet | Tenant-A wallet used to pay for tenant-B ride | Wallet scope not enforced | If wallet is global not tenant-scoped | Cross-tenant money flow | CRITICAL | LOW | HARD | Multi-tenancy, Wallet |
| BUG-X-020 | Cross-cutting | Refund + Promo + Tax | Refund returns base only, but original charge was base + discount + tax; tax not reversed | Each component handled separately | Per [BUG-X-007] | Regulatory + customer complaint | HIGH | MED | HARD | Refund, Promo, Tax |

---

## V. Marketplace, Workshops, Vendors (VEN)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-VEN-001 | State machine | Workshop | Workshop booked then parts unavailable | Backorder | If inventory check is post-book | Cancellation chaos | MED | MED | MED | Workshop, Inventory |
| BUG-VEN-002 | Functional | Workshop | Workshop assigned to wrong specialization | Vendor mis-tag | If skill not validated | Bad service | MED | MED | MED | Workshop |
| BUG-VEN-003 | State machine | Vendor | Vendor payout delayed but vendor sees "paid" | Status vs cash race | If "paid" is post-gateway but pre-bank | Vendor confusion | MED | MED | MED | Payout, Vendor |
| BUG-VEN-004 | Concurrency | Vendor | Two vendors accept same workshop booking | Race | If accept is not atomic | Double booking | HIGH | MED | HARD | Workshop, Vendor |

---

## W. Reporting, Analytics, Reconciliation (RPT)

| ID | Cat | Module | Possible Bug | Trigger | Why plausible | Impact | Sev | Lik | Det | Affected |
|---|---|---|---|---|---|---|---|---|---|---|
| BUG-RPT-001 | Time | Reconciliation | Daily reconciliation crosses midnight in Dhaka | UTC | TZ | Wrong day totals | MED | MED | EASY | RPT, Time |
| BUG-RPT-002 | Functional | Report | Ride count report includes cancelled rides | Filter missing | If filter is opt-in | Inflated numbers | MED | MED | MED | RPT |
| BUG-RPT-003 | Functional | Tax | Tax report missing one vertical | Per-vertical aggregation | Per [BUG-ADMIN-006] | Regulatory | HIGH | LOW | HARD | RPT, Tax |
| BUG-RPT-004 | Concurrency | Report | Report generated while writes happen, totals drift | Long report | If snapshot not used | Discrepancy | MED | MED | MED | RPT |
| BUG-RPT-005 | Functional | Analytics | Driver earnings report doesn't include tips | Tip is separate ledger | If tip not joined | Driver underpaid on paper | MED | MED | MED | RPT, Tip |

---

End of Full Bug Catalogue. Count: ~210 findings across 23 domains.

Next files: `02-top-100-bugs.md`, `03-top-30-rare-severe.md`, `04-self-critique.md`.


# Top 100 Bugs to Investigate First (RIDE)

> Prioritized by: financial damage × safety/security × likelihood × detection difficulty × recovery cost × cross-service blast radius.
> Each entry references the full finding in `01-full-bug-catalogue.md`. Read the full entry for trigger, plausibility, and impact detail.
> Bands:
> - **Band 1 (1–30): Life-safety, direct financial loss, regulatory** — investigate this sprint.
> - **Band 2 (31–65): Severe but bounded** — investigate next sprint.
> - **Band 3 (66–100): High likelihood / repeated user pain** — investigate within the quarter.

---

## Band 1 — Investigate first (life-safety, money loss, regulatory)

| # | ID | Domain | Why this rank | Sev | Lik | Det |
|---|---|---|---|---|---|---|
| 1 | BUG-AMB-002 | Ambulance | Wrong ambulance type (BLS vs ALS) → patient harm, life-safety | CRIT | MED | MED |
| 2 | BUG-AMB-001 | Ambulance | Expired certification still dispatched | CRIT | MED | HARD |
| 3 | BUG-AMB-003 | Ambulance | Two ambulances both accept the same emergency | CRIT | MED | HARD |
| 4 | BUG-AMB-005 | Ambulance | Wrong geographic radius — long ETA, life-safety | CRIT | MED | MED |
| 5 | BUG-AMB-007 | Ambulance | Expired equipment (O₂, defib) still dispatched | CRIT | LOW | HARD |
| 6 | BUG-AMB-006 | Ambulance | Scheduled ambulance dispatched as urgent (or vice versa) | CRIT | LOW | HARD |
| 7 | BUG-AMB-004 | Ambulance | Broadcast to stale/offline providers | CRIT | MED | HARD |
| 8 | BUG-AMB-008 | Ambulance | Provider en route to one emergency, assigned to another | CRIT | LOW | HARD |
| 9 | BUG-DISPATCH-001 | Dispatch | Driver double-assigned to two simultaneous rides | CRIT | MED | MED |
| 10 | BUG-DISPATCH-018 | Dispatch | Two drivers auto-accept the same offer at the same ms | CRIT | LOW | HARD |
| 11 | BUG-DISPATCH-006 | Dispatch | Driver cancels after pickup — state machine has no mid-trip cancel | CRIT | MED | MED |
| 12 | BUG-DISPATCH-002 | Dispatch | Auto-redispatch before old driver formally declines | CRIT | MED | HARD |
| 13 | BUG-DISPATCH-008 | Dispatch | First driver rejects, second accepts, first changes mind and accepts late | CRIT | MED | HARD |
| 14 | BUG-DISPATCH-009 | Dispatch | Driver "en route" for two rides | CRIT | LOW | HARD |
| 15 | BUG-DISPATCH-021 | Dispatch | Two riders, one available driver, both matched | CRIT | MED | HARD |
| 16 | BUG-DISPATCH-023 | Dispatch | Cancel vs Start race — who wins? No version column | HIGH | MED | HARD |
| 17 | BUG-PAY-001 | Payment | Webhook double-processed → duplicate wallet credit | CRIT | HIGH | MED |
| 18 | BUG-PAY-004 | Refund | Refund > original amount | CRIT | MED | MED |
| 19 | BUG-PAY-005 | Refund | Double refund (retry + webhook) | CRIT | MED | MED |
| 20 | BUG-PAY-013 | Currency | BDT vs paisa off-by-100 across the system | CRIT | LOW | EASY |
| 21 | BUG-PAY-022 | Surge | Surge applied retroactively on completed ride | CRIT | MED | HARD |
| 22 | BUG-PAY-025 | Ledger | Double-entry broken — debit without credit | CRIT | MED | HARD |
| 23 | BUG-PAY-002 | Payment | Wallet debited before gateway confirms, reversal race | CRIT | MED | HARD |
| 24 | BUG-PAY-006 | Top-up | Top-up wallet before gateway confirms | CRIT | MED | HARD |
| 25 | BUG-PAY-007 | Top-up | Top-up success at gateway, wallet not credited (event lost) | CRIT | MED | HARD |
| 26 | BUG-PAY-009 | Promotion | Promotion applied after discount already given (two paths) | CRIT | MED | HARD |
| 27 | BUG-PAY-031 | Wallet | Top-up retried by client, gateway debits twice | CRIT | MED | HARD |
| 28 | BUG-PAY-027 | Payout | Payout sent to wrong driver (ID swap) | CRIT | LOW | MED |
| 29 | BUG-AUTH-003 | Auth | OTP consumed twice (verify not atomic with mark-used) | CRIT | MED | HARD |
| 30 | BUG-AUTH-010 | Auth | Token issued for tenant A accepted at tenant B endpoint | CRIT | MED | HARD |

---

## Band 2 — Investigate next (severe but bounded)

| # | ID | Domain | Why this rank | Sev | Lik | Det |
|---|---|---|---|---|---|---|
| 31 | BUG-SOS-001 | SOS | SOS button fails when app backgrounded (OS killed) | CRIT | MED | HARD |
| 32 | BUG-SOS-004 | SOS | SOS auto-cancels after timeout (e.g. user unconscious) | CRIT | LOW | HARD |
| 33 | BUG-SOS-002 | SOS | SOS triggered with stale (hours-old) location | CRIT | MED | MED |
| 34 | BUG-SOS-003 | SOS | SOS contacts list stale (ex-partner still listed) | CRIT | LOW | MED |
| 35 | BUG-RENT-001 | Bidding | Sealed-bid visibility leak — privileged user sees all bids | CRIT | MED | HARD |
| 36 | BUG-RENT-005 | Bidding | Award race — two bids accepted simultaneously | CRIT | MED | HARD |
| 37 | BUG-RENT-008 | Rental | Awarded rental — vehicle reassigned to another rental | CRIT | MED | HARD |
| 38 | BUG-DATA-006 | Cross-svc | A succeeds, B fails — payment OK, ride not marked paid | CRIT | MED | HARD |
| 39 | BUG-X-002 | Cross-svc | Food→delivery bridge duplicates on retry (two deliveries, double charge) | CRIT | MED | HARD |
| 40 | BUG-X-003 | Cross-svc | Ambulance provider accepts ride-hailing offer | CRIT | LOW | HARD |
| 41 | BUG-X-007 | Cross-svc | Refund reverses payment but tax not reversed | HIGH | MED | HARD |
| 42 | BUG-X-008 | Cross-svc | Cross-tenant report leak via admin endpoint | CRIT | MED | HARD |
| 43 | BUG-X-019 | Cross-svc | Tenant-A wallet used to pay for tenant-B ride | CRIT | LOW | HARD |
| 44 | BUG-SCHED-001 | Scheduler | Duplicate job execution (manual + cron) | CRIT | MED | MED |
| 45 | BUG-SCHED-004 | Scheduler | Two scheduler instances both run payout → double payout | CRIT | MED | HARD |
| 46 | BUG-SCHED-009 | Scheduler | Payout job runs twice in same day | CRIT | MED | HARD |
| 47 | BUG-FARE-017 | Fare | Currency unit mismatch → 100× charge | CRIT | LOW | EASY |
| 48 | BUG-PAY-020 | No-show | Driver reports no-show, rider actually in car → false fee | HIGH | HIGH | HARD |
| 49 | BUG-PAY-019 | Cancel | Cancellation fee charged to wrong party | HIGH | MED | MED |
| 50 | BUG-SEC-001 | IDOR | Predictable ride ID, see other user's ride | CRIT | MED | EASY |
| 51 | BUG-SEC-007 | Payment | Replay attack on payment callback (no signature) | CRIT | MED | MED |
| 52 | BUG-SEC-013 | Payment | Webhook signature not verified | CRIT | LOW | MED |
| 53 | BUG-SEC-014 | WebSocket | WS handler doesn't re-verify per message | CRIT | MED | HARD |
| 54 | BUG-SEC-002 | RBAC | Privilege escalation via admin endpoint | CRIT | MED | MED |
| 55 | BUG-AUTH-014 | WebSocket | WS handshake authenticates, per-message RBAC skipped | CRIT | MED | HARD |
| 56 | BUG-AUTH-004 | OTP | OTP brute force — weak rate limit | CRIT | MED | EASY |
| 57 | BUG-AUTH-013 | Auth | Phone number change without re-verification | CRIT | LOW | MED |
| 58 | BUG-AUTH-017 | Auth | OTP to voicemail / call forwarding | CRIT | LOW | HARD |
| 59 | BUG-LIFE-005 | Driver | Driver deactivated but session still active | CRIT | MED | HARD |
| 60 | BUG-LIFE-006 | Fleet | Vehicle assigned to two drivers | CRIT | MED | HARD |
| 61 | BUG-LIFE-013 | RBAC | Driver becomes admin via role hierarchy bug | CRIT | LOW | HARD |
| 62 | BUG-ADMIN-001 | Admin | IDOR — admin lists rides without tenant scope | CRIT | MED | MED |
| 63 | BUG-ADMIN-002 | Admin | Role escalation — global role check, not per-action | CRIT | MED | MED |
| 64 | BUG-ADMIN-007 | Audit | Admin action (refund, payout) not logged | CRIT | MED | HARD |
| 65 | BUG-NOTIF-001 | Notif | Push notification routed to wrong user | CRIT | LOW | HARD |

---

## Band 3 — High likelihood / repeated user pain

| # | ID | Domain | Why this rank | Sev | Lik | Det |
|---|---|---|---|---|---|---|
| 66 | BUG-DISPATCH-003 | Dispatch | Stale driver location matched (hours old) | HIGH | HIGH | MED |
| 67 | BUG-DISPATCH-005 | Dispatch | Driver accepts in app but server processes after offer window | HIGH | MED | MED |
| 68 | BUG-DISPATCH-016 | Multi-stop | Stops delivered out of order on WS | HIGH | MED | MED |
| 69 | BUG-DISPATCH-017 | Driver | Driver goes offline mid-ride — no redispatch | HIGH | MED | HARD |
| 70 | BUG-DISPATCH-011 | Security | Driver GPS spoofer for surge gaming | HIGH | MED | HARD |
| 71 | BUG-DISPATCH-014 | Driver | Driver "arrived" state stuck after rider cancel | MED | MED | MED |
| 72 | BUG-DISPATCH-022 | Dispatch | Redispatch picks same driver that just cancelled | HIGH | MED | MED |
| 73 | BUG-FARE-001 | Fare | Surge applied to cancellation fee | HIGH | MED | MED |
| 74 | BUG-FARE-003 | Multi-stop | Multi-stop fare only counts first leg | HIGH | MED | HARD |
| 75 | BUG-FARE-005 | Fare | Fare on rider and driver apps diverge mid-ride | HIGH | HIGH | MED |
| 76 | BUG-FARE-006 | Fare | Quote vs final fare large delta | HIGH | HIGH | EASY |
| 77 | BUG-FARE-009 | Cancel | Pickup fee charged even if driver cancels | HIGH | MED | MED |
| 78 | BUG-FARE-012 | Promo | Surge + promotion stacked | HIGH | HIGH | EASY |
| 79 | BUG-FARE-013 | Scheduled | Scheduled ride fare at booking time, not pickup | HIGH | MED | MED |
| 80 | BUG-PAY-010 | Promo | Two promotions stacked when only one allowed | HIGH | HIGH | EASY |
| 81 | BUG-PAY-011 | Promo | Promotion applied to cancelled ride | HIGH | MED | MED |
| 82 | BUG-PAY-017 | Payment | Cash not recorded in partial payment | HIGH | HIGH | MED |
| 83 | BUG-PAY-018 | Payout | Driver earnings counted twice next cycle | HIGH | MED | HARD |
| 84 | BUG-PAY-029 | Bonus | Bonus/incentive paid twice (campaign + leaderboard) | HIGH | MED | HARD |
| 85 | BUG-PAY-030 | COD | COD collected but not marked paid | HIGH | HIGH | MED |
| 86 | BUG-PAY-032 | Refund | Refund to gateway rejected (expired card) | HIGH | MED | MED |
| 87 | BUG-PAY-036 | Recon | Daily reconciliation reads while writes happen | HIGH | HIGH | MED |
| 88 | BUG-PAY-014 | Fare | Floating-point fare rounding (systemic tiny loss) | MED | HIGH | HARD |
| 89 | BUG-AUTH-001 | Auth | Concurrent logout, JWT still valid for cache window | HIGH | HIGH | EASY |
| 90 | BUG-AUTH-006 | Auth | Session fixation on KYC upgrade | HIGH | MED | HARD |
| 91 | BUG-AUTH-009 | Auth | Soft-deleted account still has valid WS connection | HIGH | MED | HARD |
| 92 | BUG-AUTH-011 | RBAC | Role change not reflected in active session | HIGH | MED | MED |
| 93 | BUG-WS-002 | WS | Duplicate message on reconnect — duplicate effect | HIGH | MED | HARD |
| 94 | BUG-WS-005 | WS | Event sent to wrong recipient (broadcast too wide) | CRIT | LOW | HARD |
| 95 | BUG-WS-007 | WS | Auth token expires mid-session, server keeps sending | HIGH | MED | MED |
| 96 | BUG-LIFE-001 | Driver | Driver online on two devices simultaneously | HIGH | MED | MED |
| 97 | BUG-LIFE-002 | Driver | Driver online but no location updates | HIGH | HIGH | MED |
| 98 | BUG-LIFE-010 | No-show | Driver false no-show report, rider charged | HIGH | HIGH | HARD |
| 99 | BUG-MOB-001 | Mobile | Request retried on 5xx, server actually succeeded | HIGH | HIGH | HARD |
| 100 | BUG-MOB-002 | Mobile | Backgrounded app — heartbeat stops, marked offline | HIGH | HIGH | MED |

---

## How to use this list

- Items 1–30 are the "if this breaks in prod tonight, we have a crisis" list. They map to a small set of architectural invariants (atomic dispatch, idempotent payment, deterministic state transitions, tenant isolation, ambulance compliance).
- Items 31–65 are the "money loss or compliance breach within a quarter" list. Many of these are interaction bugs — they won't be caught by unit tests, only by end-to-end adversarial scenarios.
- Items 66–100 are the "user complaints, ratings drop, support load spike" list. Individually bounded, but they accumulate into trust erosion.

The next file (`03-top-30-rare-severe.md`) selects 30 from across the catalogue that are most likely to **escape ordinary testing** — rare timing, multi-actor, provider failure, retry edge cases, stale state, scheduler interaction, multiple devices, unusual data.


# Top 30 Rare-but-Severe Bugs (RIDE)

> These are the bugs most likely to **escape ordinary testing**: rare timing, multiple actors, provider failure, retry edges, stale state, scheduler interaction, multi-device, unusual data, or interaction between features that nobody wires together in a happy-path test.
> Each entry is condensed. Full entry lives in `01-full-bug-catalogue.md`.
> Format per finding: **ID | Domain | The trap | Why ordinary testing misses it | Severity** + a short incident-style sketch.

---

## Cluster A — Multi-actor race conditions (require ≥2 actors acting in a small window)

### 1. BUG-DISPATCH-018 — Two drivers auto-accept the same offer in the same millisecond
Both drivers have auto-accept enabled for an overlapping zone; server picks up both `accept` writes before either is committed. **Missed because** most tests run with one offer, one driver. **Severity: CRITICAL.** *Sketch: rider sees two drivers converging, only one has a valid assignment, the other bills a cancellation fee.*

### 2. BUG-DISPATCH-008 — First driver rejects, second accepts, first changes mind and accepts late
Optimistic UI lets first driver tap "accept" after their reject reached the server. **Missed because** reject-then-accept sequence isn't a user flow QA would script. **Severity: CRITICAL.** *Sketch: rider pays no-show fee to first driver who is now en route, second driver also shows up.*

### 3. BUG-DISPATCH-009 — Driver "en route to pickup" pre-confirm leaks across rides
A driver pre-confirms "I'm coming" on a different offer while their previous ride is still active. **Missed because** "I am coming" state usually tested as a single-offer flow. **Severity: CRITICAL.** *Sketch: driver in middle of a ride gets second rider in their app, drives to wrong pickup.*

### 4. BUG-AMB-008 — Ambulance provider en route to one emergency, assigned to another
Re-broadcast triggers a re-assignment while provider is locked to en route. **Missed because** the "lock provider while en route" invariant is usually tested for the first assignment only. **Severity: CRITICAL.** *Sketch: two emergencies share one ambulance, patient risk.*

### 5. BUG-AMB-003 — First-accept race in emergency broadcast
Two providers tap accept at the same time on a critical emergency alert. **Missed because** emergency flows are usually tested with one provider in test. **Severity: CRITICAL.** *Sketch: two ambulances dispatched, only one is "real," the other bills the first patient.*

### 6. BUG-RENT-005 — Two bids awarded simultaneously (admin double-click)
Admin clicks "Award" twice in a slow-loading UI. No row lock. **Missed because** admin UI not normally part of QA race testing. **Severity: CRITICAL.** *Sketch: two vendors start work for the same rental, both bill.*

### 7. BUG-RENT-008 — Awarded rental vehicle reassigned to another rental
Two fleet admins reassign the same vehicle at the same time. **Missed because** cross-tenant vehicle assignment is not usually tested. **Severity: CRITICAL.** *Sketch: vendor A's customer receives vendor B's vehicle, regulatory nightmare.*

### 8. BUG-DISPATCH-021 — Two riders, one available driver, both matched
Read-then-write race in offer creation. **Missed because** dispatch tests usually isolate one offer at a time. **Severity: CRITICAL.** *Sketch: rider A sees driver B as assigned, rider C sees the same driver; one gets a cancellation.*

### 9. BUG-X-003 — Ambulance provider accepts a ride-hailing offer
Pool overlap between emergency and ride-hailing providers. **Missed because** verticals are tested independently. **Severity: CRITICAL.** *Sketch: a patient waits for an ambulance that shows up as a regular car.*

---

## Cluster B — Async/retry chain collapses (require webhook retry + state machine + idempotency hole)

### 10. BUG-PAY-001 + BUG-PAY-002 + BUG-PAY-007 — Wallet race with reversal
Optimistic wallet debit, gateway callback arrives later, and a retry from the client creates a triple-state problem. **Missed because** each tested in isolation. **Severity: CRITICAL.** *Sketch: user charged 3×, wallet shows -2×, support can't reconcile.*

### 11. BUG-PAY-031 — Top-up retried by client, gateway debits twice
Client timeout, retry, gateway processes both, server credits both because idempotency key is the request ID (not the gateway transaction ID). **Missed because** idempotency is usually tested with same key, not different request IDs. **Severity: CRITICAL.** *Sketch: user "top-up 500" gets 1000 credited, gateway charged 1000, real money lost.*

### 12. BUG-PAY-005 — Double refund via two paths
User taps refund, gateway also sends a refund webhook (e.g. chargeback initiated), both succeed. **Missed because** user-initiated refund and gateway webhook are usually tested separately. **Severity: CRITICAL.** *Sketch: customer refunded twice for one cancelled ride.*

### 13. BUG-PAY-022 — Surge applied retroactively on completed ride
Backend reconciliation job recalculates fare and re-bills. **Missed because** quote is taken as authoritative in tests, not the post-job recalculation. **Severity: CRITICAL.** *Sketch: rider sees final fare 1.5× higher than the quote, days later.*

### 14. BUG-X-002 — Food→delivery bridge duplicates on client retry
Bridge call from food system to delivery system is retried because the first response was lost. **Missed because** bridge endpoints often lack idempotency keys. **Severity: CRITICAL.** *Sketch: restaurant delivers once, platform charges for two deliveries.*

### 15. BUG-WS-002 — Duplicate WebSocket message on reconnect
Server re-sends all events since last seen; client processes again. If event is "deduct wallet," it deducts twice. **Missed because** WS reconnect is rarely tested with side-effect events. **Severity: HIGH.** *Sketch: top-up triggered by WS event charged twice on flaky network.*

### 16. BUG-PAY-001 (variant) — Provider webhook retry + state machine progress
Webhook arrives, server marks paid, processes, returns 5xx; provider retries; server marks paid again and re-credits wallet. **Missed because** the "verify not idempotent" bug only surfaces when the first response is lost. **Severity: CRITICAL.**

---

## Cluster C — State machine holes (cancelled/expired can still act, or old events modify newer state)

### 17. BUG-AUTH-009 — Soft-deleted account still has a valid WebSocket connection
Admin deletes user; DB row soft-deleted; live socket not terminated. **Missed because** account deletion is tested in isolation, not with active sockets. **Severity: HIGH.** *Sketch: deleted user receives data, can act in a brief window.*

### 18. BUG-AUTH-010 — Token for tenant A presented to tenant B endpoint
Claims don't disambiguate tenants; middleware checks signature only. **Missed because** multi-tenant tokens are usually a single-tenant concern. **Severity: CRITICAL.** *Sketch: fleet admin in tenant A reads tenant B's rider list.*

### 19. BUG-SOS-004 — SOS auto-cancels after timeout (e.g. user unconscious)
SOS has a "no response → auto-cancel" timer. **Missed because** SOS happy-path doesn't include "user cannot respond." **Severity: CRITICAL.** *Sketch: rider triggers SOS, falls unconscious, system cancels after 5 min.*

### 20. BUG-LIFE-005 — Driver deactivated but session still active
Admin deactivates driver; active session not invalidated. **Missed because** deactivation is tested via login gate, not active sessions. **Severity: CRITICAL.** *Sketch: deactivated driver still receives and accepts offers for 30+ minutes.*

### 21. BUG-LIFE-013 — Driver becomes admin via role update; inherits broader perms
Role hierarchy bug. **Missed because** role escalation is usually tested for explicit admin promotion, not for "promotion inherits broader perms than intended." **Severity: CRITICAL.** *Sketch: promoted driver reads cross-tenant data.*

### 22. BUG-RENT-009 — Old winner keeps receiving events after re-award
WebSocket not closed on re-award. **Missed because** re-award flows are rare in test. **Severity: HIGH.** *Sketch: old winner continues working, customer charged twice.*

### 23. BUG-RENT-011 — Driver demoted after award (KYC fails, rating drops)
Background check completes late, demotion cascades but not to active rental. **Missed because** KYC is usually treated as static at award time. **Severity: HIGH.** *Sketch: awarded driver is now non-compliant, rental continues.*

### 24. BUG-X-014 — Driver KYC rejected mid-shift, current ride unaffected
KYC check is async, doesn't terminate active ride. **Missed because** KYC is usually a gate at start of shift, not a per-ride check. **Severity: HIGH.** *Sketch: driver KYC rejected during a ride, system doesn't know to redispatch.*

### 25. BUG-X-012 — Bonus given then ride cancelled, clawback runs after payout
Clawback is a scheduled job, payout happens first. **Missed because** cancel and payout are in different processes. **Severity: HIGH.** *Sketch: driver cashes out bonus, ride cancels, clawback sends balance negative.*

---

## Cluster D — Cross-service / cross-domain interaction (only visible when ≥2 services are healthy)

### 26. BUG-X-007 — Refund reverses payment but tax not reversed
Tax integration is a separate record; refund doesn't reverse it. **Missed because** tax and refund are tested independently. **Severity: HIGH.** *Sketch: cancelled ride has a tax line in the report that doesn't match the refund.*

### 27. BUG-X-010 — Tip from wallet, but payout cycle snapshot was pre-tip
Tip is added after payout window closes. **Missed because** tip timing is tested, not the snapshot. **Severity: HIGH.** *Sketch: rider tips 50 BDT, driver never sees it in payout.*

### 28. BUG-X-019 — Tenant-A wallet used to pay for tenant-B ride
Wallet is global, not tenant-scoped. **Missed because** multi-tenancy is usually enforced at the entity level, not at the wallet level. **Severity: CRITICAL.** *Sketch: tenant A's rider pays for a ride in tenant B's region, money flows across tenants.*

### 29. BUG-PAY-018 — Driver earnings counted twice next cycle (reversal + re-credit)
Reversal creates a negative earnings row, re-credit creates a positive row, next cycle's payout sums both. **Missed because** reversal and re-credit are usually two separate flows, not tested as a sequence. **Severity: HIGH.** *Sketch: driver overpaid next cycle, accounting flags it.*

### 30. BUG-DATA-006 — Cross-service A succeeds, B fails (payment OK, ride not marked paid)
Distributed transaction missing. **Missed because** each service is tested in isolation; the "A OK, B fail" path requires a specific fault injection. **Severity: CRITICAL.** *Sketch: rider sees "paid" but ride is in limbo, support has to manually reconcile.*

---

## What makes these 30 different from the Top 100

The Top 100 prioritizes bugs that **will** eventually surface and cause damage. These 30 are a stricter subset: bugs that **statistically** will not surface in normal QA, will not be caught by 95th-percentile monitoring, and will only manifest when a specific combination of:
- two actors act in the same window
- a network blip + a retry collide with a missing idempotency key
- a state transition races with a delayed event
- a vertical's logic is unaware of another vertical's invariants
- a scheduler + a state machine + a payout cycle all align in a bad way

…occurs at the same moment.

The realistic test for these is **chaos engineering**: kill the gateway mid-charge, simulate SMS delay, replay webhooks, mock the wallet service, inject 100ms latency between two adjacent state transitions. None of them will surface in a happy-path integration test.

---

## Recommended investigation order for these 30

1. **First**: any item involving a **refund** (4, 12, 13, 26) — these are the highest monetary loss per occurrence.
2. **Second**: any item involving a **rental/ambulance award** (5, 6, 7, 9, 22) — these are the highest regulatory and life-safety exposure.
3. **Third**: any item involving a **state machine rollback** (17, 18, 19, 20, 23, 24) — these are the hardest to recover from.
4. **Fourth**: any item involving a **cross-tenant boundary** (18, 21, 28) — these have audit and compliance implications.
5. **Fifth**: any item involving a **WS/socket** (15) — these are the hardest to reproduce and the easiest to ignore.

The next file (`04-self-critique.md`) audits what this catalogue might have missed, what the duplicates are, and where the real codebase investigation should focus first.


# Self-Critique — What This Survey May Have Missed (RIDE)

> A meta-audit of the catalogue. Every theoretical bug survey has blind spots; this document lists them explicitly so the next investigator (or a follow-up model) can prioritize accordingly.

---

## 1. Subsystems and surfaces that are under-covered

### 1.1 Subsystems I touched lightly but probably deserve deeper coverage
- **In-app chat / phone call masking** — possible bugs around content moderation, PII leakage in chat logs, missed messages, group chat, language detection.
- **Driver ratings → deactivation cascade** — the auto-deactivation threshold logic has a lot of subtle failure modes (false positives, single bad day, collusion).
- **Loyalty / referral / gift cards / vouchers** — each is a separate financial subsystem with its own idempotency and state machine.
- **Inter-city / outstation / hourly rentals / round trips** — these are pricing models with multi-leg, multi-day logic that can break in many of the same ways as multi-stop, but with time and price snapshots.
- **Subscription / pass / call packages** — recurring billing, mid-cycle change of plan, proration, expiry edge cases.
- **Carpool / shared ride** — multi-rider state machine, dynamic pricing under seat fill, mid-route pickups.
- **Promo code generation and abuse** — bulk generation, race in redemption, geo-restriction, partner codes.
- **KYC provider integration** — vendor-specific delays, partial completion, document expiry checks.
- **Map provider integration** — Mapbox vs Google vs local; geocoding mismatches, ETA inaccuracy, route differences.
- **Push notification provider** — APNs/FCM token rotation, multi-device, dead letters.
- **CDN / image upload / file storage** — orphan files, broken links, virus scanning gaps.
- **Background jobs for marketplace** — RFQ matching, vendor payout, inventory reconciliation.
- **Localization** — Bangla rendering, RTL (if any), currency formatting, date format, number format (lakh vs million).
- **Accessibility** — voice-over flows, dynamic type.

### 1.2 Subsystems I might have missed entirely
- **Driver onboarding documents** — license OCR, photo verification, liveness check failures.
- **Tax invoice generation** — PDF generation race, broken on edge cases, missing tax ID.
- **Compliance reporting** — Bangladesh Bank reports, BTRC reports, ride-hailing regulatory reports.
- **Vehicle inspection / fitness** — manual process, sync to system.
- **Driver training / certification** — expiry management, renewal reminders.
- **App version management** — force update, deprecated API, beta cohort.
- **Customer support / dispute resolution** — admin actions, audit log, two-way state changes.
- **Marketing campaigns / A/B tests** — bucket assignment, feature interaction, canary releases.
- **Telemetry / observability** — dropped events, sampling, debug mode, PII in logs.

---

## 2. Specific financial paths that need a dedicated pass

The catalogue has ~40 financial findings, but the following paths are **not** covered in enough depth:

### 2.1 Wallet ↔ gateway reconciliation
The catalogue covers wallet debit/credit races and webhook idempotency, but the full reconciliation path (gateway statement vs platform ledger) is under-covered. Bugs in this path are the most common source of "we're missing money" tickets.

**Plausible bugs** (not in catalogue):
- Daily reconciliation job includes transactions still in flight (gateway pending) → undercount.
- Refund processed by gateway but platform marks it as failed → mismatch.
- Currency conversion at gateway vs platform (BDT vs USD) at reconciliation time.
- Failed payouts reversed to wallet, but wallet already spent.

### 2.2 Tax engine
The catalogue has 4 tax-related findings (BUG-PAY-023, BUG-PAY-024, BUG-PAY-033, BUG-ADMIN-006, BUG-RPT-003). Tax is a deep enough problem that it probably deserves a dedicated survey:
- Per-vertical rules (ride vs marketplace vs food vs ambulance)
- Per-region rules (Dhaka vs Chittagong vs Sylhet)
- VAT vs service charge vs commission vs supplier
- Reverse charge on cancelled or partial refund
- Multi-currency for cross-border
- Tax on promotional discount (discount before or after tax)
- Tax on tip (tip is service, taxable)
- Tax on no-show fee
- Tax on cancellation fee

### 2.3 Driver / vendor earnings
The catalogue covers earnings and bonuses at a high level, but the **earnings ledger** is its own state machine:
- Pending → confirmed → payable → paid
- Reversal at each stage behaves differently
- Clawback timing relative to payout
- Tip and bonus integration
- Incentive campaign eligibility windows
- Multi-tier commission (platform takes X, fleet takes Y, driver gets Z)

### 2.4 Customer-side wallet + loyalty + referral
The catalogue has a few [BUG-PAY-*] findings for wallet and [BUG-X-013] for loyalty + refund, but:
- Loyalty point earning rate per vertical
- Point expiry
- Redemption vs cash value
- Referral chain (3 levels deep?)
- Anti-abuse on referral (self-referral, family referral)

---

## 3. Cross-service interaction chains I should have called out more

The catalogue has BUG-X-* for cross-cutting, but the following chains are particularly fragile and deserve explicit enumeration:

### 3.1 The "complete a ride" chain
`rider taps end → driver taps end → server closes ride → payment service computes → wallet debits → gateway charges → webhook → ledger posts → tax posts → driver earnings posted → notification → rating prompt → trip history updated → analytics updated → financial report updated → daily reconciliation runs`

A failure at **any one** of these steps leaves the system in an inconsistent state. The catalogue covers most individual steps but doesn't draw the chain explicitly.

### 3.2 The "refund" chain
`rider requests refund → support reviews → admin approves → refund service → gateway → webhook → wallet credit → ledger reverse → tax reverse → vendor/driver earnings reverse → notification → analytics → reconciliation`

A failure at "ledger reverse" is the most common silent failure — gateway says refunded, wallet credited, but ledger entries are dangling. This is exactly the BUG-PAY-005 / BUG-PAY-038 / BUG-PAY-032 family.

### 3.3 The "rental award" chain
`RFQ → bids → admin reviews → award → vendor confirm → driver/vehicle assign → schedule → dispatch → pickup → delivery → return → billing → payout → reconciliation`

A failure at "driver/vehicle assign" is the most common — assigned driver becomes unavailable, vendor confused, customer notified late.

### 3.4 The "ambulance dispatch" chain
`request → triage → broadcast → first-accept → en route → pickup → transport → hospital handoff → billing → settlement`

A failure at "triage" (BLS vs ALS) is the most life-safety-critical.

---

## 4. Security and fraud cases I might have under-covered

### 4.1 Specific BD-context fraud
- **bKash / Nagad / Rocket wallet abuse** — SIM swap on these wallets is very common in BD; if the platform's wallet is linked to a hijacked mobile wallet, the attacker drains.
- **Driver-side fraud** — fake rides, GPS spoofing, "ghost trips," cash rides not recorded.
- **Rider-side fraud** — promo abuse, refund fraud, multi-account.
- **Collusion** — rider + driver + fleet owner.
- **Account takeover** — SIM swap, OTP interception, password reuse, leaked databases.

### 4.2 OWASP-style coverage
- Injection (SQL, NoSQL, command, LDAP)
- Broken auth (token, session, password)
- Sensitive data exposure (PII in logs, over-fetching)
- XML external entities
- Broken access control (IDOR, missing function-level checks)
- Security misconfiguration
- Cross-site scripting
- Insecure deserialization
- Vulnerable components
- Insufficient logging & monitoring

The catalogue covers IDOR, broken access control, replay, signature verification, but **does not cover**:
- SQL injection / NoSQL injection
- XSS / CSRF
- SSRF (server-side request forgery)
- Insecure deserialization
- Path traversal
- File upload abuse
- API versioning
- Mass assignment (over-posting)
- HTTP request smuggling
- DNS rebinding
- Subdomain takeover
- Clickjacking
- Open redirect

These deserve a dedicated security review pass, not a theoretical survey.

### 4.3 Privacy / data protection
The catalogue has BUG-SOS-003, BUG-SEC-012, BUG-SEC-015 for privacy, but the following are missing:
- Right to be forgotten implementation
- Data export (DSAR / GDPR-style)
- PII in logs / error reports
- PII in analytics / BI
- Data retention enforcement
- Cross-border data transfer (BD servers vs others)
- Data residency
- Encryption at rest vs in transit
- Key rotation
- Backup encryption
- PII in screenshots / recordings

---

## 5. Scheduler / mobile failures I should have called out

### 5.1 Scheduler
The catalogue has BUG-SCHED-001 to BUG-SCHED-015, but:
- **Distributed locking** — Quartz, ShedLock, or DB advisory locks? If missing, all jobs are vulnerable.
- **Job priority / preemption** — long low-priority job blocking short high-priority job.
- **Dead letter queue** — failed jobs go where?
- **Idempotency** — every job should be idempotent on (job_name, scheduled_time).
- **Observability** — execution time, lag, error rate.
- **Backpressure** — slow downstream causing backlog.
- **Cron expression validation** — invalid cron silently fails.
- **Holiday calendar** — BD has many holidays, do cron jobs account?

### 5.2 Mobile
The catalogue has BUG-MOB-001 to BUG-MOB-008, but the following are missing or under-covered:
- **Android Doze mode** — background apps don't get network, heartbeat stops.
- **iOS Background App Refresh** — limited windows, no real-time.
- **Battery optimization** — user enables "battery saver," app gets killed.
- **Network type change** — wifi → cellular → offline → online, sockets re-establish.
- **VPN / corporate proxy** — IP changes, sockets break, geolocation changes.
- **App killed by OS** — silent termination, no callback to server.
- **App upgrade mid-ride** — app upgraded while ride in progress, new version has new state machine.
- **Permissions revoked mid-ride** — location permission off, app continues using last known.
- **Two phones logged in** — same account, two devices, both active.
- **Stale data after long offline** — hours of cached state replayed.
- **Clock manipulation** — user changes device clock, scheduled rides behave wrong.
- **Push notification token rotation** — token changes, platform doesn't know, silent loss.
- **Deep link** — opens old ride, race with state changes.
- **Universal link / app link verification** — spoofed.
- **Crash reporting** — crash happens, retry, duplicate.
- **Local database** — SQLite corruption, lost writes, sync race.

---

## 6. Provider integration failures I should have called out

### 6.1 Payment gateway
- bKash, Nagad, Rocket — different APIs, different retry semantics, different timeout behaviors.
- Card gateway — 3DS, chargeback, partial capture, recurring.
- Bank transfer — settlement time, bounce, fees.
- Refund gateway — different route for refund vs original.

### 6.2 Map provider
- Geocoding mismatch between providers.
- ETA accuracy.
- Toll data.
- Restricted zone data (BD has many restricted areas).
- Address format (Bangla vs English, formal vs informal).

### 6.3 SMS provider
- Local vs international SMS.
- DND (Do Not Disturb) — Indian users, less BD.
- Delivery receipt (DLR) failure.
- Sender ID registration.
- Bulk vs transactional.
- Concurrency on the same number (rate-limited).

### 6.4 KYC provider
- Document verification (NID, passport, driving license).
- Liveness check.
- Background check.
- Address verification.
- Cross-vendor data.

### 6.5 Push notification provider
- FCM, APNs.
- Token registration.
- Topic subscription.
- Multi-device.

---

## 7. Duplicates and near-duplicates to merge

Reviewing the catalogue for duplicates / near-duplicates:

| Duplicate pair | Notes | Action |
|---|---|---|
| BUG-DISPATCH-001 ↔ BUG-DISPATCH-021 | Both describe "one driver, multiple rides." | Merge into BUG-DISPATCH-001; refer to it from BUG-DISPATCH-021. |
| BUG-DISPATCH-002 ↔ BUG-DISPATCH-022 | Both describe "redispatch / old driver still in pool." | Merge into BUG-DISPATCH-002. |
| BUG-PAY-002 ↔ BUG-PAY-006 | Both describe "optimistic balance change before gateway confirm." | Keep both, but note they share an underlying pattern. |
| BUG-AUTH-001 ↔ BUG-AUTH-009 | Both describe "revoked auth still active." | Note in BUG-AUTH-009 that BUG-AUTH-001 is the API variant. |
| BUG-AUTH-014 ↔ BUG-SEC-014 | Both describe WS per-message auth. | Merge into BUG-SEC-014 as the security view; BUG-AUTH-014 as the auth view. |
| BUG-SCHED-001 ↔ BUG-SCHED-004 ↔ BUG-SCHED-009 | All describe "duplicate job execution." | Keep BUG-SCHED-001 as canonical; refer from 004 and 009. |
| BUG-WS-002 ↔ BUG-WS-009 | Both describe "duplicate on reconnect." | Merge. |
| BUG-PAY-014 ↔ BUG-FARE-018 | Both describe "floating-point fare rounding." | Merge into BUG-PAY-014 as the canonical financial version. |
| BUG-X-007 ↔ BUG-PAY-024 | Both describe "tax on refund." | Merge. |
| BUG-X-007 ↔ BUG-X-020 | Both describe "refund + tax + promo." | Merge. |
| BUG-DISPATCH-011 ↔ BUG-SEC-003 ↔ BUG-SEC-006 | All describe "GPS spoofing." | Keep BUG-SEC-003 as the security view. |
| BUG-PAY-001 ↔ BUG-PAY-031 | Both describe "idempotency hole on payment / wallet." | Note shared pattern. |
| BUG-DATA-005 ↔ BUG-PAY-026 | Both describe "wallet ≠ ledger." | Merge. |
| BUG-FARE-017 ↔ BUG-PAY-013 | Both describe "BDT vs paisa." | Merge. |
| BUG-SOS-006 ↔ BUG-SOS-007 | Both describe "trip share link expiry." | Merge. |
| BUG-LIFE-005 ↔ BUG-DISPATCH-017 | Both describe "driver offline mid-ride." | Note the link. |
| BUG-AUTH-001 ↔ BUG-AUTH-015 | Both describe "WS holds revoked token." | Note the link. |
| BUG-RENT-005 ↔ BUG-RENT-016 | Both describe "two accepted." | Note the link. |
| BUG-DATA-002 ↔ BUG-FF-003 | Both describe "stale config cache." | Merge. |
| BUG-MOB-002 ↔ BUG-LIFE-002 | Both describe "online but no location." | Note the link. |

**After merging, the catalogue's net count drops from ~210 to ~190, but cross-references are stronger.**

---

## 8. What's deliberately out of scope

To avoid scope creep, the following are explicitly NOT covered (each deserves its own survey):

1. **Performance / scalability** — load testing, capacity planning, DB performance. Different problem class.
2. **Disaster recovery** — backup, restore, region failover. Operations concern.
3. **Compliance** — Bangladesh Bank, BTRC, ride-hailing regulations. Legal concern.
4. **Accessibility** — WCAG compliance, screen reader, motor accessibility. UX concern.
5. **Localization** — Bangla, Bengali numerals, etc. i18n concern.
6. **Marketing analytics** — campaign tracking, attribution, A/B framework. Different system.
7. **Data warehousing** — ETL, BI, analytics. Different system.
8. **Customer support tooling** — admin UI, ticket system. Different system.

---

## 9. Limitations of this survey

1. **No codebase access** — every finding is hypothetical. The next pass must confirm or refute each against the actual code.
2. **No schema knowledge** — table layouts, indexes, constraints are guessed. The actual schema will reveal some bugs trivially (e.g. "is there a unique index on (driver_id, status='active')?").
3. **No provider docs read** — specific quirks of bKash, Nagad, FCM, APNs, etc. are inferred from general knowledge.
4. **No historical incident data** — if the team has a Jira/incident history, the "actually happened" bugs would be very different from the "theoretically possible" bugs. The team should overlay this catalogue against their incident log.
5. **No load model** — likelihoods are best-guess. A production traffic profile would re-rank many findings.
6. **Bangla-language specific bugs** — encoding, font, RTL are not covered.
7. **Cross-border specifics** — BD-IN rides are mentioned but not deeply analyzed.
8. **Seasonal effects** — Ramadan, Eid, monsoon, political events all change traffic patterns and could expose different bugs.

---

## 10. Recommended next steps for the verifying model

1. **Overlay against incident log** — find which catalogue items have already manifested and which haven't. Prioritize un-incidented high-severity findings (these are the "unknown unknowns").
2. **Walk the state machines** — for each major object (ride, payment, rental, SOS, wallet txn), list every state, every transition, every actor who can trigger it, and check the catalogue covers each.
3. **Walk the API surface** — for each of the ~205 API routes, classify as read/write, sensitive/insensitive, idempotent/non-idempotent. Check the catalogue for each.
4. **Walk the scheduler** — list the 57 jobs, classify by criticality and idempotency. Verify the catalogue.
5. **Walk the financial path** — for each money flow (rider → platform → driver, vendor, tax, etc.), verify idempotency, atomicity, and reconciliation.
6. **Walk the cross-tenant boundary** — for each entity, verify tenant scoping at every read/write.
7. **Stress-test the rare-30** — each of the 30 in `03-top-30-rare-severe.md` should be tested with chaos engineering (kill the gateway, replay the webhook, delay the SMS, rotate the token, etc.).
8. **Audit the security coverage** — re-run the catalogue against OWASP Top 10 and BD-specific threats (SIM swap, mobile wallet fraud).
9. **Add a privacy review** — DSAR, PII in logs, data retention.
10. **Add a mobile review** — Android Doze, iOS background, OS kill, permissions.

---

## 11. Final note

This catalogue is best used as a **checklist for adversarial testing**, not as a literal bug list. ~80% of the items here will not be confirmed against the real codebase. The 20% that are confirmed should be the focus of the next sprint.

The most valuable outcome of this survey is the **list of failure modes that nobody was thinking about** — not the list of confirmed bugs. If a finding here triggers a code reviewer to ask "wait, does our system handle X?", the survey has done its job.
