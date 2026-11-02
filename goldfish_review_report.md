# Goldfish Annotated Review Report (Round 2)

**Status:** `resolved` (All Round 2 findings accepted and applied in Plan 28 v3.1)  
**Target:** `docs/Plan/28-RIDE-SHARING-AND-BREADCRUMB-PLAYBACK-PLAN.md` (Lines 1–571)  
**Evaluated Against:** `feature-spec-standard.md`, `implementation-readiness-standard.md`, `zoom-out-standard.md`, and live codebase on disk.  
**Review Swarm:** `egm-design`, `egm-codebase-details`, `egm-implementation-readiness`, `egm-zoom-out`

---

## Reviewer Status (Round 2)

| Reviewer Lens | Status | Core Focus | Round 2 Outcome |
|---|---|---|---|
| `egm-design` | **completed** | System architecture, concurrency, DB connection budget, live coordinates | 3 Blockers, 6 Majors (Cleanly Resolved) |
| `egm-codebase-details` | **completed** | Pedantic schema, SQL syntax, test assertions, variable names | 3 Blockers, 6 Majors, 2 Nits (Cleanly Resolved) |
| `egm-implementation-readiness` | **completed** | Unambiguous builder directives, test fixtures, zero-decision compliance | 4 Blockers, 3 Majors (Cleanly Resolved) |
| `egm-zoom-out` | **completed** | YAGNI, scope creep, economic alignment with `concepts_brief.md` | 1 Blocker, 2 Majors, 3 Nits (Cleanly Resolved) |

---

## Round 2 Prioritized Findings & Applied Resolutions

### 🔴 Blockers

#### 1. Fatal PostgreSQL Syntax Error in Job 61 (`DELETE ... LIMIT 1000`)
* **Reviewer Lenses:** `egm-codebase-details` (Finding 1), `egm-design` (Finding 1), `egm-implementation-readiness` (Finding 1), `egm-zoom-out` (Finding 1) — *Unanimous*
* **Affected Scope:** Section 12 (Lines 508–514)
* **Discrepancy Description:** PostgreSQL does not support a `LIMIT` clause on `DELETE` statements (unlike MySQL). Executing `DELETE FROM ride_routes WHERE ... LIMIT 1000` triggers `syntax error at or near "LIMIT"`, crashing Job 61 on every scheduler tick.
* **Resolution Applied:** Rewrote the query into a bounded subquery idiom with non-terminal dispute filtering:
  ```sql
  DELETE FROM ride_routes
  WHERE ride_id IN (
    SELECT ride_id FROM ride_routes
    WHERE created_at < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM sos_alerts sa WHERE sa.ride_id = ride_routes.ride_id)
      AND NOT EXISTS (
        SELECT 1 FROM fare_disputes fd 
        WHERE fd.ride_id = ride_routes.ride_id 
          AND fd.status IN ('open', 'under_review', 'escalated')
      )
    LIMIT 1000
  );
  ```

#### 2. `activeTripCache` Security Ownership Guard, Hot-Path SQL Elimination, and Restart Hydration
* **Reviewer Lenses:** `egm-design` (Findings 3 & 4), `egm-codebase-details` (Findings 3 & 4), `egm-implementation-readiness` (Finding 2), `egm-zoom-out` (Finding 2) — *Unanimous*
* **Affected Scope:** Section 8.1 (Lines 261–290), Section 4 Item 2
* **Discrepancy Description:**
  1. *Missing Driver Ownership Check:* `location:update` checked `activeTrip.status === "in_progress"`, omitting `activeTrip.driverId === client.driverId`. Any connected driver could spoof coordinates into another driver's active ride.
  2. *Hot-Path SQL Leak:* In `utils-server/index.ts`, `detectRouteDeviation` executed a `SELECT` on every 5s frame for corridor coordinates (`origin_latitude/longitude, destination_latitude/longitude`), violating "Zero SQL on hot path".
  3. *Process Restart Eviction:* `activeTripCache` starts empty on server restart, dropping telematics for all in-flight rides.
* **Resolution Applied:**
  1. Extended `activeTripCache` to store `{ driverId, status, originLat, originLng, destLat, destLng }`.
  2. Enforced strict driver ownership: `if (!activeTrip || activeTrip.driverId !== client.driverId)`.
  3. Passed cached corridor coordinates to `detectRouteDeviation`, eliminating the secondary SQL query.
  4. Added `startup()` hydration in `utils-server/index.ts` for all active trips (`matched`, `driver_arriving`, `driver_arrived`, `in_progress`), plus a self-healing read-through DB check on cache miss.

#### 3. Public Live Tracking Coordinate Disconnect & Test Suite Breakage
* **Reviewer Lenses:** `egm-design` (Finding 2), `egm-codebase-details` (Finding 2), `egm-implementation-readiness` (Finding 3)
* **Affected Scope:** Section 9.1 (Lines 357–408), Section 13 Phase 4
* **Discrepancy Description:**
  1. *Telematics Disconnect:* Telematics remain in-memory in `utils-server` and are not written to `drivers.last_location_lat/lng` on every frame. During rides, `finish-ride/index.tsx` is mounted outside `(tabs)`, so `useDriverHeartbeat` is unmounted. Section 9.1 queried PostgreSQL `drivers.last_location_*`, causing public tracking to render a frozen car marker or null coordinates.
  2. *Header Logic & Test Breakage:* `tests/api/ride/track.test.ts` line 147 explicitly asserts `expect(res.headers.get("x-robots-tag")).toBeNull()` for scheduled rides, which Plan 28 broke by setting `noindex, nofollow` on all `!isActive` rides. Terminal headers omitted `"Pragma": "no-cache"` (asserted on line 117). Adding `driver_lat`/`driver_lng` broke exact `toEqual` assertions on line 84.
* **Resolution Applied:**
  1. Exposing internal endpoint `GET /internal/ride/:id/live-coords` on `utils-server` (protected by `WEBSOCKET_INTERNAL_SECRET`), returning latest in-memory coordinates with fallback to DB. Combined with edge caching (`Cache-Control: public, max-age=3`), CDN edge caches coalesce viewer polls to ~0.3 QPS, delivering live car motion at zero database load.
  2. Restructured headers to differentiate `isTerminal` from `isActive`: only terminal rides set `no-store, no-cache`, `Pragma: no-cache`, and `X-Robots-Tag: noindex, nofollow`. Scheduled rides receive standard caching without `X-Robots-Tag`.
  3. Added explicit instructions in Phase 4 to update `tests/api/ride/track.test.ts` fixture and assertions for `driver_lat`/`driver_lng`.

---

### 🟡 Majors

#### 4. `flushAndEvictRoute` OnConflict Overwrite vs SIGTERM Partial Route
* **Reviewer Lenses:** `egm-codebase-details` (Finding 5), `egm-design` (Finding 5)
* **Affected Scope:** Section 8.2 & 8.3 (Lines 314–350)
* **Discrepancy Description:** `SIGTERM` flushers insert partial routes on shutdown using `onConflictDoNothing()`. When the trip subsequently finishes, the final flush hits the conflict and discards the complete route, permanently retaining the truncated partial route.
* **Resolution Applied:** Changed `flushAndEvictRoute` to use `.onConflictDoUpdate({ target: rideRoutes.ride_id, set: { points: ..., duration_seconds: ..., distance_meters: ... } })` to ensure final trip completion overwrites partial shutdown checkpoints.

#### 5. Omission of Cancellation Cache Eviction in `utils-server`
* **Reviewer Lenses:** `egm-design` (Finding 5), `egm-codebase-details` (Finding 6)
* **Affected Scope:** Section 8.2 & 8.3
* **Discrepancy Description:** When a ride is cancelled mid-trip via `POST /internal/ride/cancelled`, buffered breadcrumbs were not evicted, leaking memory and allowing cancelled routes to be flushed to DB on `SIGTERM`.
* **Resolution Applied:** Hooked `activeBreadcrumbs.delete(ride_id)` and `unregisterActiveTrip(ride_id)` into `req.url === "/internal/ride/cancelled"` in `utils-server/index.ts`.

#### 6. Missing Implementation Details for In-App Route Playback in `history-detail/index.tsx`
* **Reviewer Lenses:** `egm-implementation-readiness` (Finding 4)
* **Affected Scope:** Section 11.2 (Lines 487–490), Section 13 Phase 5
* **Discrepancy Description:** Section 11.2 provided two prose sentences without JSX. Coordinate order (`[lng, lat]` for GeoJSON `LineString` vs `{ lat, lng }` in `points`), MapLibre loader, and bounding box camera setup were left as design decisions for the implementer.
* **Resolution Applied:** Provided complete MapLibre JSX in Section 11.2 using `useBarikoiMapStyle`, coordinate inversion `{ lat, lng } -> [lng, lat]`, and dynamic camera bounds.

#### 7. Missing Route Parameters, UUID Validation, and Error Envelopes in `breadcrumbs+api.ts`
* **Reviewer Lenses:** `egm-codebase-details` (Finding 8), `egm-implementation-readiness` (Finding 6)
* **Affected Scope:** Section 11.1 (Lines 451–485)
* **Discrepancy Description:** Omitted `{ id }: { id: string }` route context, UUID validation (`z.string().uuid()`), and top-level `try/catch` with standard `@/lib/errors` mapping (400 invalid_uuid, 401 unauthorized, 403 not_ride_participant, 404 ride_not_found, 500 internal_error).
* **Resolution Applied:** Provided complete file implementation conforming to repository conventions in `details+api.ts`.

#### 8. Variable Reference Errors in `finish-ride/index.tsx` and WhatsApp Share Handler
* **Reviewer Lenses:** `egm-codebase-details` (Finding 7), `egm-implementation-readiness` (Finding 5)
* **Affected Scope:** Section 7.1 (Lines 193–207), Section 10 (Lines 428–445)
* **Discrepancy Description:** `localRideIdParam` was referenced without being declared via `useLocalSearchParams<{ ride_id?: string }>()`. In `ride-tracking/[ride_id].tsx`, `driverName`, `vehicleType`, `plateNumber` were referenced directly instead of via `driver?.full_name`, etc.
* **Resolution Applied:** Corrected parameter declarations and driver object field accesses in Sections 7.1 and 10.

#### 9. Legal Hold Overbreadth and Promise Safety in Job 61
* **Reviewer Lenses:** `egm-design` (Finding 6), `egm-codebase-details` (Finding 9), `egm-zoom-out` (Finding 1)
* **Affected Scope:** Section 12 (Lines 500–519)
* **Discrepancy Description:** Bare existence check on `fare_disputes` prevented deletion of routes for rides whose disputes were resolved years ago. Additionally, Job 61 lacked a `catch` block around `withJobBudget`, which rethrows non-timeout errors as unhandled promise rejections.
* **Resolution Applied:** Filtered `fare_disputes` to `status IN ('open', 'under_review', 'escalated')` and added `catch (e) { logger.error(...); }` inside the job runner.

---

### 🟢 Nits & Architectural Polish

#### 10. Decoupling Documentation for Pillar 2 (Post-Trip Email Receipts)
* **Reviewer Lenses:** `egm-zoom-out` (Finding 3)
* **Resolution Applied:** Added explicit entry in Section 2 "Out-of-Scope Non-Goals" noting that post-trip email receipts (Pillar 2 of `concepts_brief.md`) are decoupled to a dedicated transactional receipt plan.

#### 11. Reuse of Existing `parsePointTs` Utility
* **Reviewer Lenses:** `egm-zoom-out` (Finding 5)
* **Resolution Applied:** Reused `parsePointTs(ts)` from `utils-server/trace.ts` for safe timestamp parsing (handles both Unix epoch numbers and ISO date strings).

#### 12. Computation of `distance_meters` in `flushAndEvictRoute`
* **Reviewer Lenses:** `egm-codebase-details` (Finding 11), `egm-design` (Finding 8)
* **Resolution Applied:** Computed cumulative distance using `haversineKm` on consecutive points in `flushAndEvictRoute` to populate `distance_meters` for forensic use in `'route_longer'` fare disputes.

#### 13. Public Tracking Interface and Edge Caching Clarification
* **Reviewer Lenses:** `egm-design` (Finding 12), `egm-zoom-out` (Finding 6)
* **Resolution Applied:** Updated `TrackData` interface in `app/track/[rideId].tsx` to include `driver_lat: number | null` and `driver_lng: number | null`. Clarified that edge cache headers (`Cache-Control: public, max-age=3`) protect the public endpoint at the CDN/reverse proxy layer without database write churn.
