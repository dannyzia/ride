**Purpose:**     Combined master copy of all 8 independent possible-bug surveys (Part 0 = synthesis; Parts 1–8 = the sources verbatim). One file to search instead of eight.
**Owner:**       Zia (sources are frozen inputs; this header is the only editorial layer)
**Status:**      ACTIVE — sources are theoretical pre-code surveys; verify every claim against the codebase before acting
**Source of truth:** Parts 1–8 below (verbatim, unmodified). The original per-model files in `docs/Bug Survey/*.md` remain in place and unchanged.
**Related (concrete paths):**
  - `docs/Bug Survey/chatgpt luna 5.6.md` — wide catalogue (≈150 bugs), Top 100 + Top 30 + self-critique
  - `docs/Bug Survey/Claude Sonnet.md` — 110 bugs in vertical schema, tiered Top 100, deep self-critique
  - `docs/Bug Survey/deepseek v4 flash.md` — ~120 findings in 16 domains, top-100 tiers, self-critique with verification strategy
  - `docs/Bug Survey/GLM-5.3.md` — 1,652-line catalogue, per-domain sections
  - `docs/Bug Survey/Mimo 2.5Pro.md` — largest catalogue (2,490 lines, ~296 ID mentions), per-domain sections
  - `docs/Bug Survey/Minimax M3.md` — 20 domains (A–W) + banded Top 100 + Top 30 clustered by failure mode
  - `docs/Bug Survey/mistral vibe.md` — tiered catalogue (BUG-CORE/EMG/… prefixes)
  - `docs/Bug Survey/Qwen 3.8Max.md` — compact cluster catalogue (IDs without `BUG-` prefix), top-100 ranks + self-critique
**Last verified:** 2026-09-09, by Buffy (coding agent) — all 8 files read in full; concatenation byte-verified against sources
**How to update:** Treat Parts 1–8 as frozen. If a new survey lands in `docs/Bug Survey/`, re-run the concatenation and add a row to the source inventory. Fixing a confirmed bug belongs in the Rhizome board / findings files, not here.

---

# RIDE — Combined Bug Survey Master

Eight models independently produced theoretical possible-bug surveys of the Ride platform **without codebase access**. Every entry in every part below is a **hypothesis to verify**, not a confirmed defect. This file exists so the survey arc can be searched, triaged, and dispositioned from one place.

## ⚠️ Critical reading rule: bug IDs do NOT match across surveys

Each survey invented its own ID namespace and several collide. **The same ID string means different bugs in different parts.** Examples verified while assembling:

| ID | In deepseek (Part 3) | In mistral (Part 7) | In chatgpt luna (Part 1) |
|---|---|---|---|
| `BUG-FIN-001` | Wallet ≠ ledger non-atomicity | Duplicate wallet debit (client retry) | Quote vs settlement config drift |
| `BUG-MKT-001` | Sealed-bid deadline race | Rider-cancel vs driver-start race | Inventory double-reservation |
| `BUG-MOB-001` | Duplicate completion retry | Duplicate rides (client retry) | *(n/a — different scheme)* |

Also: **Qwen (Part 8) drops the `BUG-` prefix entirely** (`FIN-008`, `DISP-002`…), and **mistral (Part 7)** uses extra prefixes (`BUG-CORE-`, `BUG-EMG-`, `BUG-FF-`). **Never cite a bare `BUG-XXX-nnn` without naming the survey it came from.** When consolidating into an actionable board, re-key findings by theme (below), not by ID.

## Part 0.1 — Source inventory

| Part | Survey | Lines | Approx. distinct findings | Scheme notes |
|---|---|---:|---:|---|
| 1 | chatgpt luna 5.6 | 384 | ~150 | `BUG-<DOMAIN>-nnn`, wide tables + Top 100 + Top 30 + self-critique |
| 2 | Claude Sonnet | 1,456 | 110 | `BUG-<MODULE>-nnn` (global counter), vertical schema, 3 tiers + Top 30 + self-critique |
| 3 | deepseek v4 flash | 623 | ~120 | `BUG-<SECTION>-nnn` (per-section counters), 16 domains, tiered Top 100, Top 30 |
| 4 | GLM-5.3 | 1,652 | ~190 | `BUG-<SECTION>-nnn`, per-domain compact records |
| 5 | Mimo 2.5Pro | 2,490 | ~290 | `BUG-<SECTION>-nnn`, largest catalogue, per-domain table records |
| 6 | Minimax M3 | 1,079 | ~460 (many duplicates across 20 domains) | `BUG-<DOMAIN>-nnn` (per-domain counters, domains A–W), banded Top 100 + clustered Top 30 |
| 7 | mistral vibe | 413 | ~100 | `BUG-CORE-/FIN-/LOC-/FLEET-/MKT-/EMG-/INFRA-/DATA-/MOB-`, tiered Top 100 + Top 30 |
| 8 | Qwen 3.8Max | 451 | ~120 (heavy cluster-merging) | No `BUG-` prefix (`AUTH-`, `DISP-`, `FIN-`, `PROMO-`, `GEO-`, `FLEET-`, `MKT-`, `EMS-`, `JOB-`, `EVENT-`, `NOTIF-`, `CFG-`, `DATA-`, `MOB-`, `SEC-`, `ADMIN-`, `SAFETY-`) |

## Part 0.2 — Cross-model consensus themes

Every survey converged on the same handful of systemic patterns. These are the highest-value investigation leads because independent reasoning hit them repeatedly. (Composite, in rough consensus order; each theme lists representative entries — **with their survey** — not an exhaustive list.)

1. **Non-atomic wallet↔ledger / cross-service partial failure.** "A succeeds, B fails" chains (payment→wallet→ledger→tax) with no compensation. All 8 surveys flagged this; usually their #1 or #2 financial finding.
   (deepseek `BUG-FIN-001`/`BUG-DATA-001` · chatgpt `BUG-FIN-008`/`BUG-CROSS-001..004` · Claude `BUG-WALLET-026`/`BUG-LEDGER-033`/`BUG-DATA-097` · GLM `BUG-FIN-007` · Minimax `BUG-PAY-001` cluster · Qwen `FIN-017`/`FIN-018`/`DATA-001` · mistral `BUG-FIN-006`/`BUG-FIN-012` · Mimo wallet/ledger sections)
2. **Duplicate processing of retried/redelivered events** — payment callbacks, webhooks, job retries, WS reconnect replay, client retries. Every survey has an idempotency cluster; deepseek's self-critique names it explicitly as the first audit to run (grep for idempotency keys, transactions, version checks).
   (chatgpt `BUG-FIN-002/003/004`, `BUG-INFRA-020/023` · Claude `BUG-WALLET-027`, `BUG-MOB-101` · GLM `BUG-FIN-001/002/005` · Qwen `FIN-008/015/019` · deepseek `BUG-FIN-002/004`, `BUG-JOB-001`, `BUG-EVENT-001` · mistral `BUG-FIN-009` · Minimax `BUG-PAY-002/005/007/031`)
3. **Double-accept / double-assignment races on scarce resources** — two drivers accepting one ride, one driver matched to two riders, vehicle double-assignment, ambulance first-accept, rental double-award. The single most-repeated dispatch finding.
   (chatgpt `BUG-DISPATCH-001/010/029/030`, `BUG-SAFE-001`, `BUG-MKT-011` · Claude `BUG-DISPATCH-005`, `BUG-FLEET-049`, `BUG-RENTAL-060`, `BUG-EMRG-074` · deepseek `BUG-DISPATCH-001`, `BUG-AMB-002` · GLM `BUG-DISPATCH-001/003/007` · Minimax Top-30 cluster A · Qwen `DISP-002`, `FLEET-001`, `EMS-003` · Mimo `BUG-DISPATCH-001`)
4. **Stale/terminal-state violation** — delayed events resurrecting cancelled/completed rides; jobs acting on state that changed after enqueue; cancelled rides becoming active. All surveys flag missing version/sequence guards.
   (chatgpt `BUG-DISPATCH-004/019`, `BUG-INFRA-003` · Claude `BUG-SCHED_014`, `BUG-LIFECYCLE_018` · deepseek `BUG-RIDE-001/003`, `BUG-JOB-002` · GLM `BUG-RIDE-001` · Qwen `DISP-016/017` · mistral `BUG-CORE-004`, `BUG-DATA-005` · Minimax `BUG-DATA-005`)
5. **UTC vs Dhaka(+6) boundary errors** — scheduled rides across local midnight, expiry/promo/billing month-end boundaries, report bucketing. Unanimous.
   (chatgpt `BUG-INFRA-016/018`, `BUG-DISPATCH-022` · Claude `BUG-SCHED_015`, `BUG-TIME-092` · deepseek `BUG-CONFIG-002/007` · GLM `BUG-RIDE-010` · Qwen `CFG-003`, `JOB-007` · mistral `BUG-CORE-008` · Minimax TIME domain)
6. **Unit mismatches (paisa/BDT, percent/decimal, s/ms, m/km).** Project rule says integer-paisa everywhere; the surveys' point is that boundaries (providers, config entry, new team members) still corrupt units — 100× errors.
   (Claude `BUG-CURRENCY-038`, `BUG-TIME-090` · chatgpt `BUG-FIN-029` · GLM `BUG-FIN-010` · deepseek `BUG-FIN-006`, `BUG-CONFIG-004/006` · Qwen `CFG-002`, `FIN-006` · mistral `BUG-FIN-007` · Minimax FF/TIME domains)
7. **TOCTOU on single-use things** — OTP consume, coupon redemption, pass activation, withdrawal/balance check, subscription seat limits, sealed-bid deadline. Read-then-write races; fix class = atomic claim + DB-level uniqueness.
   (Claude `BUG-OTP-003`, `BUG-PROMO-023`, `BUG-WALLET-028`, `BUG-FLEET-051`, `BUG-BID-071` · deepseek `BUG-AUTH-004`, `BUG-FIN-016`, `BUG-SEC-002/008` · GLM `BUG-FIN-008/009/011` · chatgpt `BUG-AUTH-002`, `BUG-FIN-010`, `BUG-MKT-001` · Qwen `FIN-009/010`, `FLEET-003` · Minimax PAY/SHOP domains)
8. **Cross-vertical resource exclusivity** — one driver/vehicle eligible in ride-hailing + delivery + rental + emergency simultaneously; no shared "currently engaged" lock. Flagged by 6+ surveys as architecturally hard.
   (chatgpt `BUG-DISPATCH-030/031`, `BUG-MKT-023` · Claude `BUG-EXCL-065`, `BUG-FLEET-055` · deepseek `BUG-MKT-009` · GLM `BUG-DISPATCH-007` · Qwen `FLEET-002`, `MKT-011` · mistral `BUG-FLEET-001` · Minimax `BUG-X-003`)
9. **Stale eligibility/credential at dispatch time** — expired certification, expired docs, vehicle in workshop, de-certified ambulance still receiving broadcasts because eligibility is cached/periodically recomputed. Safety-critical flavor.
   (Claude `BUG-FLEET-056`, `BUG-EMRG-073/078` · chatgpt `BUG-SAFE-003/002` · deepseek `BUG-AMB-001/003` · GLM `BUG-FLEET-002`-adjacent · Qwen `EMS-001/002`, `DISP-019`, `FLEET-005` · mistral `BUG-EMG-007`)
10. **Cancellation-fee / no-show attribution races** — rider+driver cancel simultaneously, GPS-drift false arrival starting waiting/no-show charges, fee decision from stale arrival state.
   (chatgpt `BUG-DISPATCH-020/021/022` · Claude `BUG-CANCEL-009/010`, `BUG-NOSHOW-011` · GLM `BUG-RIDE-003/004/005/013/014` · Qwen `DISP-004/005/009`, `GEO-001` · deepseek `BUG-RIDE-004`, `BUG-FIN-007` · mistral `BUG-CORE-009`, `BUG-FIN-013` · Minimax CORE domain)
11. **Duplicate bridges/deliveries** — food-order→delivery leg created twice on retry; delivery completed after refund/cancel.
    (chatgpt `BUG-MKT-006/016/017` · Claude `BUG-FOOD-066` · deepseek `BUG-DELIVERY-001/002` · Qwen `MKT-014/015` · Minimax `BUG-X-002` · GLM food-delivery section)
12. **Refund over-payment family** — refund > original (promo/tax base ignored), double refund (two paths), refund after chargeback, payout including refunded rides, no earnings clawback. The most diverse high-severity financial family.
    (chatgpt `BUG-FIN-010/011/024/026` · Claude `BUG-REFUND-029/030`, `BUG-PAYOUT-035/036`, `BUG-VENDOR_040` · deepseek `BUG-FIN-003/004/013` · GLM `BUG-FIN-004/005/021/022/023` · Qwen `FIN-010/011/013` · mistral `BUG-FIN-007` · Minimax `BUG-PAY-005`)
13. **Stale-recipient event/notification leakage** — old winner keeps receiving award events, wrong-recipient WS delivery after role/device switch, notifications after cancellation, deep links to stale objects.
    (chatgpt `BUG-DISPATCH-012`, `BUG-MKT-012`, `BUG-INFRA-009/010` · Claude `BUG-RENTAL-062`, `BUG-WS-084`, `BUG-NOTIF-085/087` · deepseek `BUG-EVENT-004/005`, `BUG-MKT-004` · Qwen `EVENT-002`, `MKT-008` · Minimax `BUG-RENT-009` · GLM notification sections)
14. **Scheduler systemic risks** — overlapping runs, missed runs after deploy, stale-state jobs, backlog ordering, one bad record aborting a batch, non-idempotent retries. `INSTANCE_COUNT=1` mitigates some (no split-brain) but not overlap/crash-recovery.
    (chatgpt `BUG-INFRA-001..006` · Claude `BUG-SCHED-079..082` · deepseek `BUG-JOB-001..007` · Qwen `JOB-001..008` · Minimax SCHED domain + `BUG-INFRA-012`)

## Part 0.3 — Per-survey one-line characterization

| Survey | Characterization |
|---|---|
| chatgpt luna 5.6 | Broadest flat catalogue with the most explicit financial cross-service coverage; strong Top-100 ordering; self-critique proposes shared-invariant testing (terminal states, refund upper bounds, ledger balance, tenant isolation). |
| Claude Sonnet | Deepest per-entry prose (110 items, vertical schema); best rare-but-severe reasoning; self-critique proposes consolidating into ~6 systemic patterns (TOCTOU family, timezone family, quote-vs-settle family, cache-vs-realtime family). |
| deepseek v4 flash | Best verification strategy: **grep the codebase for the three primitives — idempotency keys, transaction wrapping, version/status guards — and map each absence to catalogue entries.** Converts the survey into a concrete audit plan. |
| GLM-5.3 | Largest single-domain depth in dispatch/financial records; strong Bangladesh-specific entries (phone-number recycling takeover, OTP confusion between ride-start and login). |
| Mimo 2.5Pro | Largest volume (~2,900 lines of catalogue); strong driver-lifecycle and availability-transition coverage (mid-ride suspension, session overlap, rating-after-refund). |
| Minimax M3 | Unique structure: Top 30 clustered by **failure mode** (multi-actor races / retry-chain collapse / state-machine holes) rather than domain — the cluster view is the fastest way to see root-cause families. |
| mistral vibe | Compact tiered list; unique angles: tip-before-tax ordering, overlapping ride intervals in earnings, fleet billing snapshot staleness. |
| Qwen 3.8Max | Most aggressive cluster-merging (one finding covers several paths); best "race combinations worth testing" list (multi-actor perfect storms) and explicit cash-reconciliation / payout-rail gaps. |

## Part 0.4 — Consolidated verification strategy (from the surveys' own self-critiques)

All four self-critiques converge on the same next step. In priority order:

1. **Primitive audit first (deepseek):** grep for idempotency keys, transaction wrapping, and version/status guards on every state-changing write; map each gap to catalogue themes 1, 2, 4, 7, 12. This is the highest-precision conversion of theory → findings.
2. **Invariant testing (chatgpt):** establish invariants for terminal states, resource uniqueness, payment/refund upper bounds, ledger balance, tenant isolation, and emergency eligibility; then inject retries, delayed events, duplicate callbacks, worker overlap, clock skew, reconnects, and concurrent actions against those invariants.
3. **Systemic-pattern remediation (Claude):** fix by pattern, not per-bug — "audit all single-use-token checks for atomicity," "audit all timezone-sensitive boundaries," "audit all quote-then-settle financial calculations," "audit all cache-vs-realtime eligibility checks."
4. **Multi-actor storms (Qwen/Minimax):** the test-suite-worthy combinations are listed in Qwen §4.1B and Minimax Top-30 clusters (e.g., admin+scheduler+webhook on one ride; rental award + payment capture + certification revocation in one window; SOS + cancellation + refund + contact notification).
5. **Known blind spots all surveys admit:** tax as a first-class domain, payout rails/retries/partial payouts, workshops vertical, referral/loyalty lifecycle, KYC/document flows, mobile OS backgrounding behavior, provider (map/payment/SMS) degradation paths. None of the eight covered these deeply.

---
---

# FULL SOURCE DOCUMENTS (verbatim)

Each part below is the complete, unmodified text of one survey, delimited as shown. Nothing inside the delimiters has been edited.


---
---

# PART 1 — chatgpt luna 5.6

> **Source file:** `docs/Bug Survey/chatgpt luna 5.6.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 1.*


---
---

# PART 2 — Claude Sonnet

> **Source file:** `docs/Bug Survey/Claude Sonnet.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 2.*


---
---

# PART 3 — deepseek v4 flash

> **Source file:** `docs/Bug Survey/deepseek v4 flash.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 3.*


---
---

# PART 4 — GLM-5.3

> **Source file:** `docs/Bug Survey/GLM-5.3.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 4.*


---
---

# PART 5 — Mimo 2.5Pro

> **Source file:** `docs/Bug Survey/Mimo 2.5Pro.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 5.*


---
---

# PART 6 — Minimax M3

> **Source file:** `docs/Bug Survey/Minimax M3.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 6.*


---
---

# PART 7 — mistral vibe

> **Source file:** `docs/Bug Survey/mistral vibe.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 7.*


---
---

# PART 8 — Qwen 3.8Max

> **Source file:** `docs/Bug Survey/Qwen 3.8Max.md` · **Copied verbatim, unmodified** · **Survey ID caution: IDs are NOT comparable across parts (see Part 0 warning).**

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

*End of Part 8.*
