# Goldfish Annotated Review Report

**Status:** `resolved` (All 19 findings accepted and applied in Plan 28 v3.0)  
**Target:** `docs/Plan/28-RIDE-SHARING-AND-BREADCRUMB-PLAYBACK-PLAN.md` (Lines 1–561)  
**Evaluated Against:** `feature-spec-standard.md`, `implementation-readiness-standard.md`, `zoom-out-standard.md`, and live codebase on disk.  
**Review Swarm:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`

---

## Reviewer Status

| Reviewer Lens | Status | Core Focus |
|---|---|---|
| `egm-design` | **completed** | System architecture, concurrency, DB connection budget, DDOS resilience |
| `egm-codebase-details` | **completed** | Pedantic schema, column names, function signatures, Drizzle imports |
| `egm-implementation-readiness` | **completed** | Unambiguous builder directives, test gates, zero-decision compliance |
| `egm-zoom-out` | **completed** | YAGNI, scope creep, economic alignment with `concepts_brief.md` |

---

## Prioritized Findings & Proposed Fixes

### 🔴 Blockers

#### 1. Scope Divergence: Speculative Auto-Share Match SMS Engine & Contact OTP
* **Reviewer Lenses:** `egm-zoom-out` (Finding 1), `egm-design` (Finding 5)
* **Affected Scope:** §1, §2, §3.1, §3.2 (`ride_share_dispatches`), §7.2, §7.3 (`lib/rideShareSms.ts`), Phase 5
* **Discrepancy Description:** Plan 28 designs an automated backend SMS engine that fires on every ride match, requires emergency contacts to undergo 4-digit SMS OTP verification, and creates an audit ledger. This directly contradicts `concepts_brief.md`, which designates routine match SMS as an *Out-of-Scope Non-Goal* and establishes *1-tap WhatsApp sharing* at zero platform cost.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Eliminates an unrecoverable 30,000–50,000 BDT monthly telecom deficit and prevents severe onboarding friction.
* **Proposed Edit:** Strip table `ride_share_dispatches` and contact OTP verification columns from migration `0088`. Delete `lib/rideShareSms.ts` and drop Phase 5. Re-scope ride sharing to client-side 1-tap WhatsApp deep link (`whatsapp://send?text=...`) in `ride-tracking/[ride_id].tsx`.

#### 2. Runtime Crash in Scheduler `registerJob` Invocation
* **Reviewer Lenses:** `egm-codebase-details` (Finding 1), `egm-design` (Finding 6), `egm-implementation-readiness` (Finding 2)
* **Affected Scope:** §9.1 (Lines 504–508)
* **Discrepancy Description:** Plan 28 calls `registerJob("job_61_breadcrumbs_retention_purge", 24 * 60 * 60 * 1000, async () => { ... })`. In `utils-server/scheduler.ts` lines 885–891, `registerJob` signature is strictly `(fn, ms)`. Passing a string as the first argument causes Node.js to throw `TypeError [ERR_INVALID_ARG_TYPE]: The "callback" argument must be of type function` on startup, crashing `utils-server`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Hard runtime crash on server startup.
* **Proposed Edit:** Reorder parameters to `registerJob(async () => { ... }, 86_400_000)` matching all other 60 jobs in `scheduler.ts`.

#### 3. Ingestion Hot-Path DB Query Starves Connection Pool
* **Reviewer Lenses:** `egm-design` (Finding 3)
* **Affected Scope:** §5.1 (Lines 298–307)
* **Discrepancy Description:** Selecting `status` from `rides` on every 5-second incoming WebSocket frame generates 200 QPS against Postgres at 1,000 concurrent trips. The entire backend pool has only 5 connections (`APP_POOL_SIZE = 5`). This will immediately starve the pool, cascading into API 500s and dispatch halts.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Critical operational scaling bottleneck on low-connection-pool Postgres.
* **Proposed Edit:** Cache `rideId -> { driverId, status }` in memory upon match/accept in `utils-server` (mirroring `driverTraceIndex` in `trace.ts`), making telematics ingestion 100% memory-local with zero SQL queries on the hot path.

#### 4. Job 61 Purge Under-Sizing Defeats Retention Policy
* **Reviewer Lenses:** `egm-design` (Finding 1), `egm-implementation-readiness` (Finding 5)
* **Affected Scope:** §9.1 (Lines 497–517)
* **Discrepancy Description:** A single `LIMIT 1000` execution once every 24 hours purges <0.5% of daily breadcrumb volume (240,000 rows/day at 5s cadence). The table accumulates >239,000 unpurged rows per day (>87M rows/yr), completely defeating the 30-day retention invariant.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Defeats data retention compliance and bloats database storage.
* **Proposed Edit:** Implement a batched `while` loop deleting in chunks of 5,000 rows within a time budget, or store route breadcrumbs as a single record per ride (see Finding 9).

#### 5. Fatal OTP Method Signature Contradiction in `lib/dprelay.ts`
* **Reviewer Lenses:** `egm-implementation-readiness` (Finding 1), `egm-codebase-details` (Finding 2)
* **Affected Scope:** §7.2 (Lines 448–451)
* **Discrepancy Description:** Plan calls `sendOtp(phone, otp)`. In `lib/dprelay.ts` line 90, `sendOtp` takes only `(phoneNumber: string)`. Passing 2 arguments fails `tsc --noEmit`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Hard compilation error (obviated when contact OTP is removed per Finding 1).

#### 6. Missing Mandatory Standard Sections
* **Reviewer Lenses:** `egm-design` (Finding 2)
* **Affected Scope:** Document Structure
* **Discrepancy Description:** Violates `feature-spec-standard.md` by omitting formal Problem Statement, Goals & Non-Goals, Alternatives Considered, and Risks & Mitigations sections.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Standard compliance and document completeness.
* **Proposed Edit:** Restructure document to add Problem Statement, Goals vs Non-Goals, Alternatives Considered, and Risks & Mitigations upfront.

#### 7. Invalid Import `timestamptz` from `drizzle-orm/pg-core`
* **Reviewer Lenses:** `egm-codebase-details` (Finding 3)
* **Affected Scope:** §3.2 (Line 172)
* **Discrepancy Description:** `timestamptz` is not exported by `drizzle-orm/pg-core`. It is a local helper function declared on line 23 of `src/db/schema.ts`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Hard compilation error.
* **Proposed Edit:** Remove `timestamptz` from Drizzle imports comment; import `bigint, unique` only.

---

### 🟡 Majors

#### 8. Speculative GPX 1.1 File Export (YAGNI)
* **Reviewer Lenses:** `egm-zoom-out` (Finding 2), `egm-implementation-readiness` (Finding 3)
* **Affected Scope:** §2, §8.2, Phase 6
* **Discrepancy Description:** Commuters in Bangladesh need trip receipts and a route map; no consumer imports `.gpx` files into desktop GIS or Google Earth. Adding XML serializers and share permissions adds bloat for an unneeded feature.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Scope minimization and code simplification.
* **Proposed Edit:** Delete GPX export endpoint and file writing dependencies. Ride history focuses purely on rendering the route polyline in `history-detail/index.tsx`.

#### 9. Relational Row Explosion vs. Compact Route Storage
* **Reviewer Lenses:** `egm-zoom-out` (Finding 4)
* **Affected Scope:** §3.1, §3.2, §9.1
* **Discrepancy Description:** Storing individual 5s breadcrumb rows generates ~10.8M rows/month on Postgres with heavy autovacuum churn, when the data is only ever queried by `ride_id`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Cuts monthly database row count by 99.7% (from ~10,800,000 to ~30,000), drastically reduces query latency, and simplifies Job 61 retention cleanup.
* **Proposed Edit:** Store completed trip breadcrumbs as a single record per ride in `ride_routes` (`ride_id UUID PRIMARY KEY, points JSONB NOT NULL, recorded_at TIMESTAMPTZ`) or a `route_points JSONB` column on `rides`.

#### 10. Public Tracking Endpoint (`/track/[id]`) Lacks Caching & Rate Limiting
* **Reviewer Lenses:** `egm-design` (Finding 4)
* **Affected Scope:** §6.1, `track+api.ts`
* **Discrepancy Description:** Public unauthenticated endpoint has no rate limiter and no caching for active rides. A shared link opened by a WhatsApp group generates multiple concurrent SQL queries, risking pool exhaustion.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Protects the 5-connection pool from traffic spikes.
* **Proposed Edit:** Add IP rate limiting and edge caching headers: `Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=5`.

#### 11. Coordinate Type Drift in `track+api.ts`
* **Reviewer Lenses:** `egm-codebase-details` (Finding 4), `egm-implementation-readiness` (Finding 10)
* **Affected Scope:** §6.1, `track.test.ts`
* **Discrepancy Description:** Wrapping coordinates in `Number()` breaks existing tests (`tests/api/ride/track.test.ts` line 129) that expect string equality (`"23.8103"`).
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Preserves backward wire compatibility.
* **Proposed Edit:** Keep `origin_lat/lng` and `destination_lat/lng` as strings; cast only `driver_lat/lng` to number.

#### 12. Driver Background Location Implementation Gap
* **Reviewer Lenses:** `egm-implementation-readiness` (Finding 6)
* **Affected Scope:** §4.1, §4.2
* **Discrepancy Description:** `Location.watchPositionAsync` is foreground-only. Enabling `isAndroidForegroundServiceEnabled: true` in `app.config.js` does not keep GPS alive in Google Maps without `Location.startLocationUpdatesAsync` and `TaskManager.defineTask`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Accurate technical directives for native mobile implementation.
* **Proposed Edit:** Detail the `TaskManager.defineTask` foreground service registration for background tracking.

#### 13. Missing Endpoint for Rider Master Preference
* **Reviewer Lenses:** `egm-codebase-details` (Finding 6), `egm-implementation-readiness` (Finding 4)
* **Affected Scope:** §3.1, §7.2
* **Discrepancy Description:** Column `users.auto_share_rides_enabled` has no read or write route in `me+api.ts`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** If master toggle is kept, it must be writeable (or dropped if sharing is 1-tap WhatsApp).
* **Proposed Edit:** Dropped alongside Blocker 1, since ride sharing is user-initiated on tap.

#### 14. Undeclared Dependency `expo-sharing`
* **Reviewer Lenses:** `egm-implementation-readiness` (Finding 7)
* **Affected Scope:** §8.2, Phase 6
* **Discrepancy Description:** `expo-sharing` is not in `package.json`.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Obviated by dropping GPX export per Finding 8.

#### 15. Absence of Rollback Procedures & Loose Verification Gates
* **Reviewer Lenses:** `egm-implementation-readiness` (Findings 8 & 9)
* **Affected Scope:** §10 (Roadmap)
* **Discrepancy Description:** Missing down-migration SQL and explicit automated test CLI commands.
* **AI Suggestion:** **PROPOSE FIX**
* **Justification:** Production safety and CI verification rigor.
* **Proposed Edit:** Add explicit down-migration SQL and concrete test file execution commands for each phase.

---

### 🟢 Nits

#### 16. Incorrect Store Name `useRideStore` in Ledger
* **Reviewer Lenses:** `egm-codebase-details` (Finding 7)
* **Affected Scope:** §1 (Item 3)
* **AI Suggestion:** **PROPOSE FIX**
* **Proposed Edit:** Correct typo from `useRideStore` to `useRiderStore`.

#### 17. Inconsistent Participant Guard Error Response
* **Reviewer Lenses:** `egm-codebase-details` (Finding 8)
* **Affected Scope:** §8.1
* **AI Suggestion:** **PROPOSE FIX**
* **Proposed Edit:** Return `{ error: "not_ride_participant", message: "You are not a participant in this ride" }` matching `details+api.ts`.

#### 18. Live Code Status Select Clarification
* **Reviewer Lenses:** `egm-codebase-details` (Finding 5)
* **Affected Scope:** §5.1
* **AI Suggestion:** **PROPOSE FIX**
* **Proposed Edit:** Clarify that `status: rides.status` is a proposed addition to `utils-server/index.ts` line 1442.

#### 19. Client Timestamp Bounds Sanitization
* **Reviewer Lenses:** `egm-design` (Finding 7)
* **Affected Scope:** §5.1
* **AI Suggestion:** **PROPOSE FIX**
* **Proposed Edit:** Clamp client timestamps to `Date.now()` if skewed >5 minutes into the past/future.
