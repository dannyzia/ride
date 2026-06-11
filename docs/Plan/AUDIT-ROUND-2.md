# Ride Planning Docs — Consistency Audit Round 2
> 255 new mistakes, gaps, and inconsistencies not addressed in the prior audit.
> Each entry identifies the offending file(s), the problem, and the fix.

---

## Legend
- **[DOC]** = Documentation/wording error only — no code impact
- **[LOGIC]** = Semantic/behavioural contradiction between two or more documents
- **[SCHEMA]** = Data model gap or rule violation
- **[API]** = HTTP API contract error
- **[WS]** = WebSocket event contract error
- **[SEC]** = Security concern
- **[SCHED]** = Scheduler / cron logic error
- **[UI]** = UI/UX spec inconsistency
- **[ENV]** = Environment variable issue
- **[BUILD]** = Build / deploy / infra issue

---

## Category A — Status Transition Contradictions (10 issues)

**A-01 [LOGIC]** `matched → driver_arriving` transition is directly contradicted between documents.  
- `06-API.md` Ride Lifecycle State Machine: `matched | Immediate (same TX as match) | driver_arriving | System` — means the status auto-advances to `driver_arriving` in the same DB transaction that records the match.  
- `07-USER-FLOWS.md` Flow 4 step 6 note: *"The `rides.status` stays in `'matched'` until the driver taps 'Start Ride' (which transitions to `driver_arriving`)"* — contradicts the lifecycle table entirely.  
- **Fix:** Remove the incorrect parenthetical from `07-USER-FLOWS.md` step 6. The note should read: "The `rides.status` advances to `driver_arriving` immediately on match. The driver then taps 'Start Ride' which transitions to `in_progress`."

**A-02 [LOGIC]** `07-USER-FLOWS.md` Flow 4 step 9 misnames the status transition triggered by "Start Ride."  
- Step 9 says: *"Driver arrives at pickup → taps 'Start Ride'. `rides.status = 'in_progress'`, `started_at = now()`."*  
- Per the lifecycle table and `06-API.md POST /api/ride/:id/start` (precondition: `driver_arriving` → returns `in_progress`), the Start Ride button triggers `driver_arriving → in_progress`, not `matched → in_progress`.  
- **Fix:** Flow 4 step 9 should say "Driver arrives at pickup → taps 'Start Ride'. `rides.status` transitions from `driver_arriving` to `in_progress`."

**A-03 [LOGIC]** Stale matched-ride timeout checks the wrong status.  
- `02-ARCHITECTURE.md` stale ride timeout: *"auto-cancel rides WHERE `status='matched'` AND `matched_at < now() - interval '30 min'`"*.  
- `12-FOLDER-STRUCTURE.md` scheduler entry 13 mirrors this: *"status='matched' AND matched_at < now() - interval '30 min'"*.  
- But if `matched` immediately auto-advances to `driver_arriving` (per A-01), no ride will ever stay in `matched` long enough for this check to trigger.  
- **Fix:** The stale-ride query must check `status='driver_arriving'` (and retain `matched_at` as the timestamp). Update both `02-ARCHITECTURE.md` and `12-FOLDER-STRUCTURE.md` scheduler entry 13.

**A-04 [LOGIC]** `17-MONITORING.md` stale-ride alert checks `matched` status — same error as A-03.  
- Alert table: *"Rides in `matched` status for > 30 min | > 0 | P3"*.  
- **Fix:** Change to `driver_arriving` status to match the corrected scheduler query.

**A-05 [API]** `POST /api/ride/:id/start` precondition is correct (`driver_arriving`) but the UX spec and user flows do not explain how the driver app knows when to show the "Start Ride" button.  
- If `driver_arriving` is set immediately on match, the button should be active from the moment the driver accepts. But `08-UI-SPEC.md` Screen 7 (Ride Offer Card) says nothing about the post-accept transition to the navigation/start-ride screen. There is no screen specification for the driver navigation-to-pickup screen.  
- **Fix:** Add a "Screen 7b: Driver Navigation to Pickup" entry in `08-UI-SPEC.md` describing the state when `rides.status='driver_arriving'`, showing the "Start Ride" button, and linking to `POST /api/ride/:id/start`.

**A-06 [LOGIC]** `06-API.md` ride status response field `status` lists `"matched|driver_arriving|..."`. If `driver_arriving` is set immediately on match, riders will never see `status="matched"` in the polling response — the observable states become `driver_arriving`, `in_progress`, etc. The documentation does not flag this for implementers.  
- **Fix:** Add a note in `06-API.md GET /api/ride/:id/status` that `status='matched'` is a transient DB state set and immediately overwritten; clients polling this endpoint should expect `driver_arriving` as the first post-dispatch-acceptance status.

**A-07 [LOGIC]** `06-API.md` Ride Lifecycle State Machine shows `matched` as a valid target for `POST /api/ride/:id/cancel` (precondition: `status IN ('pending','dispatching','matched','driver_arriving')`). But if `matched` is immediately overwritten by `driver_arriving`, the `matched` case in the cancellation precondition is unreachable.  
- **Fix:** Remove `matched` from the cancellation precondition and update the reason column to just `driver_arriving`, OR add a clarifying note that `matched` may appear briefly in the window between match and the following DB auto-transition.

**A-08 [DOC]** `06-API.md` WebSocket events note on `ride:expired` says: *"This replaces what `02-ARCHITECTURE.md` labels as `ride:cancelled`."* But `02-ARCHITECTURE.md` currently does not label general ride expiry as `ride:cancelled` — it says `ride:expired`. The note refers to a stale version and is confusingly misleading.  
- **Fix:** Remove or rewrite the parenthetical. Replace with: *"Use `ride:expired` for all no-driver-found or timeout expiry scenarios. `ride:cancelled` is reserved for the stale-matched-ride auto-cancel."*

**A-09 [LOGIC]** `07-USER-FLOWS.md` Flow 4 Edge Case says "The scheduler checks for this condition every 60 seconds" for subscription-expiry-during-active-ride defer. But `02-ARCHITECTURE.md` says "Maximum defer: 2 hours." The user flow omits the 2-hour hard cap, which is a business-critical rule.  
- **Fix:** Add to the edge-case block in `07-USER-FLOWS.md`: *"Maximum defer: 2 hours. If the subscription has been expired for > 2 hours regardless of ride state, emit `subscription:expired` and prevent new offers. The active ride continues unaffected."*

**A-10 [LOGIC]** `06-API.md` Lifecycle table entry for `in_progress` says it is *"not cancellable."* But what happens if a driver disconnects mid-ride or the rider's phone dies? There is no documented mechanism for auto-cancelling or recovering a ride stuck in `in_progress`. The stale-matched-ride timeout only handles `driver_arriving`. No equivalent exists for `in_progress`.  
- **Fix:** Add a note or a new scheduler entry in `12-FOLDER-STRUCTURE.md` for rides stuck in `in_progress` for > X hours (e.g., > 4 hours), auto-complete or auto-cancel with `cancelled_by='system'`.

---

## Category B — Phone Masking Contradictions (4 issues)

**B-01 [SEC] [LOGIC]** `02-ARCHITECTURE.md` Security Boundaries states *"Rider phone never sent to driver."* `06-API.md GET /api/ride/:id/contact` states *"Driver gets masked rider phone (last 3 digits only)."* These are directly contradictory. A masked phone number is still sent to the driver.  
- **Fix:** Correct `02-ARCHITECTURE.md` to: *"Rider full phone never sent to driver. A masked form (`+880 1X-XXXX-789`) is provided via `GET /api/ride/:id/contact` during matched/active rides."*

**B-02 [LOGIC]** PRD Non-functional Requirement (Security): *"Phone numbers masked until ride start; full visibility only after match."* But `06-API.md` allows contact visibility from `status='matched'` — which is before `in_progress` (the actual ride start). The phrase "ride start" is ambiguous.  
- **Fix:** Clarify PRD to: *"Driver phone visible to rider from `status='matched'` onward. Rider masked phone visible to driver from `status='matched'` onward. Full rider phone is never shared with driver."*

**B-03 [API]** `06-API.md GET /api/ride/:id/contact` response does not document role-based field selection. The `phone` field description says "Rider gets full driver phone. Driver gets masked rider phone." But the response shape is the same for both roles — the server must conditionally populate fields based on caller role. This conditional logic is absent from the API spec.  
- **Fix:** Add a "Role behaviour" sub-table to the endpoint: Rider → `phone = driver_phone (full), masked_phone = null`; Driver → `phone = null, masked_phone = masked_rider_phone`.

**B-04 [API]** `06-API.md GET /api/ride/:id/contact` `masked_phone` example shows *"+880 1X-XXXX-789"* (last 3 digits visible). But the description says *"last 3 digits only."* These are consistent but the masking pattern is not formally specified — how many digits are always hidden? The pattern should be formally expressed (e.g., reveal only digits 9–11 of the national number).  
- **Fix:** Add: *"Masking pattern: show last 3 digits of the 10-digit national number; replace all other digits with X. Format: `+880 1X-XXXX-{d1}{d2}{d3}`."*

---

## Category C — Nagad Callback Method Contradiction (3 issues)

**C-01 [API] [LOGIC]** `06-API.md` documents `GET /api/payment/nagad/callback` (query params). `12-FOLDER-STRUCTURE.md` labels the same file `"POST Nagad payment callback (webhook)"`.  
- These are directly contradictory. A Nagad callback must use one HTTP method.  
- **Fix:** Research the actual Nagad Merchant API callback method. If Nagad uses GET: fix `12-FOLDER-STRUCTURE.md`. If POST: fix `06-API.md`. Add the correct method to the endpoint title in `06-API.md`.

**C-02 [BUILD]** `12-FOLDER-STRUCTURE.md` lists `payment/nagad/callback+api.ts` as the file path. In Expo Router, a file named `callback+api.ts` in the `app/api/payment/nagad/` directory handles GET and POST via exported function names (`GET`, `POST`). If Nagad uses GET, the route file must export a `GET` async function; if POST, a `POST` function. The implementation guidance is absent.  
- **Fix:** Specify in `06-API.md`: *"Export a `GET` (or `POST`) async function from `app/api/payment/nagad/callback+api.ts`. Match the Nagad API callback specification."*

**C-03 [LOGIC]** `02-ARCHITECTURE.md` "Request lifecycle: package purchase (bKash)" mentions "bKash callback (POST /api/payment/bkash/callback)" but has no equivalent lifecycle diagram for Nagad. Given that Nagad might use GET with query params (not POST with JSON body), the signature verification logic would differ substantially.  
- **Fix:** Add a "Request lifecycle: package purchase (Nagad)" section in `02-ARCHITECTURE.md` mirroring the bKash one, showing RSA JWT verification instead of HMAC.

---

## Category D — CAR_XL Seat Count "6–7" vs "7" (4 issues)

**D-01 [LOGIC]** `07-USER-FLOWS.md` Flow 2 Step 1 says: *"Car XL (AC, **6–7 seats**, ≥25 rides / 4.3★ gate after threshold)"*. The canonical value (established in prior audits) is **7 seats**.  
- **Fix:** Change to *"Car XL (AC, 7 seats, ≥25 rides / 4.3★ gate after threshold)".*

**D-02 [UI]** `08-UI-SPEC.md` Screen 4 Step 1 lists: *"Car XL (AC, **6–7 seats**)"*. Same error.  
- **Fix:** Change to *"Car XL (AC, 7 seats)".*

**D-03 [DOC]** `19-GLOSSARY.md` Vehicle Type entry says *"CAR_XL (AC, **6-7 seats**)"*.  
- **Fix:** Change to *"CAR_XL (AC, 7 seats)".*

**D-04 [DOC]** `04-ADR.md` ADR-014 Consequences says: *"CAR_XL (AC, 7 seats)"* — this one is already correct. No fix needed. However, the inconsistency across D-01, D-02, D-03 creates confusion. The fix to those three will align all docs.

---

## Category E — `cc_range` API Response "cc" Suffix Inconsistency (3 issues)

**E-01 [API]** `06-API.md GET /api/reference/vehicle-types` response example shows `"cc_range": "≤100cc"`, `"cc_range": "101-150cc"`, `"cc_range": ">150cc"` (WITH 'cc' suffix).  
- `05-DATA-MODEL.md` states: *"cc_range stored values: `'≤100'`, `'101-150'`, `'>150'` (no 'cc' suffix). These are the exact string values stored in `vehicles.cc_range`… Display labels (e.g. '≤100cc') are formatted only in the UI layer."*  
- The API response should return raw stored values, not display labels.  
- **Fix:** Change the `06-API.md` response example values to `"≤100"`, `"101-150"`, `">150"` (no 'cc' suffix). Add a note: *"'cc' suffix is added by the client UI layer only; do not append it server-side."*

**E-02 [API]** `06-API.md POST /api/vehicle/register` body field `cc_range` validation says: *"Values: `'≤100'`, `'101-150'`, `'>150'`."* This is correct (no cc suffix). But if the GET reference endpoint returns values with the suffix (per E-01 before fix), drivers would send the display value `"≤100cc"` back to the register endpoint and get a validation error. Fix E-01 to prevent this UX confusion.

**E-03 [DOC]** `07-USER-FLOWS.md` Flow 2 Step 1 lists bike types as: *"Bike Basic (≤100cc), Bike Standard (101–150cc), Bike Plus (>150cc)"* — uses 'cc' suffix correctly as display text (this is the user-facing label, so it's fine). No fix needed here, but confirm the register endpoint uses the suffix-less stored value after fixing E-01.

---

## Category F — `validateDriverMinKm` Location Contradiction (2 issues)

**F-01 [LOGIC]** `05-DATA-MODEL.md` `drivers.min_per_km_bdt` field description says: *"Validated on every update via `lib/fareCalc.ts: validateDriverMinKm()`."*  
- `05-DATA-MODEL.md` Reference Data section says `lib/vehicleTypes.ts` exports `validateDriverMinKm(vehicleType, zonePerKmBdt, minPerKmBdt)`.  
- `12-FOLDER-STRUCTURE.md` lists `validateDriverMinKm` under `lib/vehicleTypes.ts` exports.  
- **Fix:** Correct the `min_per_km_bdt` field note in `05-DATA-MODEL.md` to: *"Validated via `lib/vehicleTypes.ts: validateDriverMinKm()`."* Remove the erroneous reference to `fareCalc.ts`.

**F-02 [LOGIC]** `02-ARCHITECTURE.md` KEEP list under `lib/` says `lib/fareCalc.ts` performs `validateDriverMinKm()`. This is the same error as F-01 propagated to the architecture.  
- **Fix:** Remove `validateDriverMinKm()` from the `fareCalc.ts` description in `02-ARCHITECTURE.md`. It belongs only in `vehicleTypes.ts`.

---

## Category G — Hard-Rule Violations in Data Model (7 issues)

**G-01 [SCHEMA]** `used_challenges` table violates the hard rule *"Every table: `created_at timestamptz NOT NULL DEFAULT now()`"*. The spec only shows `jti`, `used_at`, `expires_at` — no `created_at`. `used_at` is not the same column.  
- **Fix:** Add `created_at timestamptz NOT NULL DEFAULT now()` to the `used_challenges` table in `05-DATA-MODEL.md`. (The `used_at` column can remain as a more specific semantic field.)

**G-02 [SCHEMA]** `rate_limits` table violates the hard rule. The spec shows `key`, `window_start`, `count` — no `created_at`. The table IS listed in the append-only exception, so `updated_at` is not required, but `created_at` still is.  
- **Fix:** Add `created_at timestamptz NOT NULL DEFAULT now()` to `rate_limits` in `05-DATA-MODEL.md`.

**G-03 [SCHEMA]** `system_config` table violates the hard rule. The spec shows `key`, `value`, `updated_at` — no `created_at`.  
- **Fix:** Add `created_at timestamptz NOT NULL DEFAULT now()` to `system_config` in `05-DATA-MODEL.md`.

**G-04 [SCHEMA]** `driver_online_sessions` table violates the hard rule for `updated_at`. The table is NOT listed in the append-only exception (`call_ledger`, `dispatch_offers`, `used_challenges`, `rate_limits`, `payment_events`, `credit_vouchers`). Since `went_offline_at` and `duration_minutes` are updated after creation, the table is NOT append-only.  
- **Fix:** Add `updated_at timestamptz NOT NULL DEFAULT now()` to `driver_online_sessions` in `05-DATA-MODEL.md`. Update Drizzle schema and checklist P2-07h accordingly.

**G-05 [SCHEMA]** `payment_events` IS listed as append-only (and thus exempt from `updated_at`), but it IS updated: `confirmed_at` (set on callback), `subscription_id` (set after activation), and implicitly `status` (changed from 'initiated' to 'paid'/'failed'). Append-only tables should never be updated; they should only have INSERTs.  
- **Fix:** Either (a) remove `payment_events` from the append-only exception list and add `updated_at`, or (b) replace the mutable columns with a separate `payment_event_updates` audit table. Option (a) is simpler. Update `05-DATA-MODEL.md` hard rules and the append-only exception list.

**G-06 [SCHEMA]** `credit_vouchers` is listed as append-only but has a `status` field (`'active'`, `'redeemed'`, `'expired'`) that is updated by the scheduler and by `lib/activateSubscription.ts`. It is not truly append-only.  
- **Fix:** Remove `credit_vouchers` from the append-only exception list in `05-DATA-MODEL.md`. Add `updated_at timestamptz NOT NULL DEFAULT now()` to the `credit_vouchers` table. The `updated_at` would be set when status changes.

**G-07 [SCHEMA]** `05-DATA-MODEL.md` hard rules list says *"No hard deletes on: users, drivers, riders, packages, call_ledger, rides, documents, **ratings**."* There is no `ratings` table — ratings are stored as columns directly on `rides` (per `02-ARCHITECTURE.md`). The word "ratings" is a stale reference to a deleted concept.  
- **Fix:** Remove "ratings" from the no-hard-delete list in `05-DATA-MODEL.md`.

---

## Category H — CHECK Constraint Implementation Error (1 issue)

**H-01 [SCHEMA]** `05-DATA-MODEL.md` states: *"CHECK constraint: pricing link. `(SELECT vehicle_type FROM pricing WHERE pricing.id = rides.pricing_id) = rides.vehicle_type`. Enforced in `lib/fareCalc.ts`."*  
- PostgreSQL does NOT support subquery-based `CHECK` constraints. The syntax `CHECK ((SELECT ...))` is a SQL standard restriction. This would fail silently or with a migration error.  
- **Fix:** Remove the `CHECK` constraint. Replace with: (a) an application-layer assertion in `lib/fareCalc.ts` that throws if `pricing.vehicle_type !== ride.vehicle_type`, and (b) a database trigger if strict enforcement is needed. Document which layer enforces it.

---

## Category I — Rider Rating Not Aggregated (3 issues)

**I-01 [SCHEMA]** `POST /api/ride/:id/rate` side effects only update `drivers.rating_count`, `drivers.rating_sum`, and `drivers.rating` when `role='rider'`. There are no documented side effects for `role='driver'`. Drivers rate riders (stored in `rides.driver_rating`) but there is no aggregate rider rating column or table.  
- PRD req 18 says: *"Rider rating used for rider quality scoring and abuse detection."*  
- **Fix:** Add `rating` numeric(3,2), `rating_count` integer, `rating_sum` integer columns to the `users` table (or create a `rider_stats` table). Document the `POST /api/ride/:id/rate` (role='driver') side effect: increment `users.rating_count`, `users.rating_sum`, update `users.rating`.

**I-02 [API]** `POST /api/ride/:id/rate` has no duplicate-rating protection for `role='driver'`. The error table lists `409 (already rated)` and `403 (not participant)` but does not specify separate tracking for rider-rated and driver-rated states. `rides.rider_rating` and `rides.driver_rating` are the storage columns. The 409 logic needs to check if the calling role's corresponding column is already non-null.  
- **Fix:** Add a note: *"For role='rider': 409 if `rides.rider_rating IS NOT NULL`. For role='driver': 409 if `rides.driver_rating IS NOT NULL`."*

**I-03 [API]** `GET /api/ride/:id/status` does not return rider rating or driver rating after the ride completes. The response shape shows `status`, `driver`, `eta_minutes`, etc. but no rating fields. After completion, both parties would want to see whether a rating was submitted.  
- **Fix:** Add optional `rider_rating: integer|null` and `driver_rating: integer|null` fields to the GET response, populated only when `status='completed'`.

---

## Category J — Missing Admin Upgrade Endpoint (2 issues)

**J-01 [API]** `05-DATA-MODEL.md` `vehicle_type_changes.change_reason` enum includes `'admin_upgrade'`. `16-INCIDENT-RESPONSE.md` discusses admin downgrades. But `06-API.md` only documents `POST /api/admin/driver/downgrade`. There is no `POST /api/admin/driver/upgrade` endpoint. `admin_upgrade` is an undocumented operation.  
- **Fix:** Either (a) add a `POST /api/admin/driver/upgrade` endpoint to `06-API.md` mirroring the downgrade endpoint (with valid upgrade-order enforcement), or (b) document that admin upgrades flow through `POST /api/admin/driver/type-change-approve` (treating admin-initiated upgrade as a fast-tracked type-change-approve with no 7-day cooling-off). Align with `vehicle_type_changes.change_reason` enum.

**J-02 [DOC]** `05-DATA-MODEL.md` vehicle_type_changes Notes say: *"Admin downgrades are immediate... Driver-initiated type changes require admin review. On approval: `status='cooling_off'`."* No mention of admin-initiated upgrades. The `'admin_upgrade'` enum value exists but its behaviour (immediate? cooling-off?) is not specified.  
- **Fix:** Add a note: *"Admin upgrades (`change_reason='admin_upgrade'`): immediate, no cooling-off period. `status` goes to `'approved'` directly."*

---

## Category K — Vehicle Register Body Missing Conditional Documents (3 issues)

**K-01 [API]** `06-API.md POST /api/vehicle/register` body does not include `helmet_photo_document_id` fields (required for BIKE_* types) or `dashboard_photo_document_id` (required for car types) or `third_row_photo_document_id` (required for CAR_XL).  
- **Fix:** Add the following conditional body fields:
  - `helmet_photo_1_document_id: uuid` (required if `vehicle_type IN ('BIKE_BASIC','BIKE_STANDARD','BIKE_PLUS')`)
  - `helmet_photo_2_document_id: uuid` (required if bike)
  - `dashboard_photo_document_id: uuid` (required if `vehicle_type IN ('CAR_ECONOMY','CAR_COMFORT','CAR_PREMIUM','CAR_XL')`)
  - `third_row_photo_document_id: uuid` (required if `vehicle_type = 'CAR_XL'`)

**K-02 [LOGIC]** Without the conditional document IDs in the register body (per K-01), the server cannot verify that conditional documents were uploaded BEFORE creating the vehicle row. A driver could register a CAR_XL without uploading the third-row photo, since the server has no way to link the photo to the vehicle at registration time.  
- **Fix:** The server must validate: for each required doc type given the `vehicle_type`, at least one confirmed document of that type exists for the driver in the `documents` table. This can be done either via document IDs in the request body (preferred) or via a DB query at registration time.

**K-03 [LOGIC]** `05-DATA-MODEL.md` vehicles table has `passenger_seats integer yes —` described as derived from vehicle_type. This is redundant — the value can always be looked up from `lib/vehicleTypes.ts`. Storing a derived value creates a consistency risk if vehicle_type is changed (admin downgrade) and `passenger_seats` is not updated.  
- **Fix:** Either (a) remove `passenger_seats` from the vehicles table and always compute it from vehicle_type, or (b) add a note that `passenger_seats` MUST be updated atomically with every `vehicle_type` change. Document this in `POST /api/admin/driver/downgrade` side effects.

---

## Category L — `payment_events` Missing Updated-At and Lifecycle (2 issues)

**L-01 [SCHEMA]** `payment_events` table has `confirmed_at timestamptz no NULL` and `subscription_id uuid no NULL` that are set after initial INSERT (on callback receipt). This makes the table non-append-only (see G-05). The table also lacks `updated_at`. As a result, there is no way to track when a payment event was last modified (critical for audit and monitoring).  
- **Fix:** Add `updated_at timestamptz NOT NULL DEFAULT now()` to `payment_events`. Remove from the append-only exception list.

**L-02 [SCHEMA]** `payment_events.status` enum values include `'callback_pending'`. But the initial insert uses `status='initiated'`. When does it become `'callback_pending'`? The lifecycle suggests: after the bKash payment URL is opened but before the callback arrives. But there is no documented DB update that sets `status='callback_pending'`. The Monitoring doc queries for rows `WHERE status='callback_pending'`. If this transition is never written, the monitoring query would always return 0 rows.  
- **Fix:** Document the `status='callback_pending'` transition: after `POST /api/package/purchase` returns the payment URL, update `payment_events.status = 'callback_pending'` (i.e., initiated → callback_pending when the WebView is opened). Add this to the API spec side effects.

---

## Category M — `owner_consents.is_legacy_operator` Misplaced (2 issues)

**M-01 [SCHEMA]** `05-DATA-MODEL.md` `owner_consents` table has `is_legacy_operator boolean yes false` described as *"Does the owner have prior Uber/Pathao affiliation?"* This is semantically wrong — legacy operator status describes the DRIVER, not the vehicle owner. The field belongs to the driver, not the consent document.  
- **Fix:** Remove `is_legacy_operator` from `owner_consents`. The driver's legacy status is already captured in `drivers.is_legacy_operator`. The owner consent is about the vehicle owner, not the driver's employment history. Update the checklist P2-07e accordingly.

**M-02 [API]** `06-API.md POST /api/driver/owner-consent/submit` request body includes `legacy_screenshot_document_id`. But `05-DATA-MODEL.md` `owner_consents` table has `legacy_document_id` (not `legacy_screenshot_document_id`). The DB column name and the API field name are different.  
- **Fix:** Align: either rename the DB column to `legacy_screenshot_document_id` or rename the API field to `legacy_document_id`. Also update `POST /api/driver/owner-consent/submit` to document that `legacy_screenshot_document_id` sets `drivers.is_legacy_operator = true` as a side effect.

---

## Category N — `system_config` Table Missing `brta_fare_ceiling_bdt` Dual-Store (2 issues)

**N-01 [SCHEMA]** `brta_fare_ceiling_bdt` is stored in two places:
1. `system_config` table: `key='brta_fare_ceiling_bdt', value='50000'` (global, in paisa)
2. `pricing` table: `brta_fare_ceiling_bdt integer no NULL` (per vehicle type, per zone)

`02-ARCHITECTURE.md` says `system_config.brta_fare_ceiling_bdt` is used by `lib/fareCalc.ts`. `17-MONITORING.md` mentions the same. But `05-DATA-MODEL.md` also has a per-vehicle `pricing.brta_fare_ceiling_bdt`. These two stores can diverge.  
- **Fix:** Clarify which one `lib/fareCalc.ts` reads. Document: *"fareCalc first checks `pricing.brta_fare_ceiling_bdt` (per vehicle type). If NULL, falls back to `system_config.brta_fare_ceiling_bdt` (global). Admin should prefer setting the per-type value."*

**N-02 [DOC]** `05-DATA-MODEL.md` `system_config` initial rows include `brta_fare_ceiling_bdt = '50000'` (= ৳500). But `17-MONITORING.md` and `18-KNOWN-ISSUES.md` TD-25 say "Admin must review against current BRTA regulations." ৳500 is almost certainly below actual BRTA ceiling rates, making the default value actively harmful if left unreviewed. The default should be `'0'` (disabled/unset) or a NULL sentinel rather than a hardcoded possibly-wrong amount.  
- **Fix:** Change the `system_config` seed value to `brta_fare_ceiling_bdt = '0'` (meaning "not configured") and update `lib/fareCalc.ts` to skip the ceiling check when value is `'0'`. Add a post-deploy checklist item: *"Set brta_fare_ceiling_bdt to the actual BRTA ceiling before enabling rides."*

---

## Category O — Start-Verification Flow: Direct CF vs Expo Proxy Contradiction (4 issues)

**O-01 [LOGIC]** `01-PRD.md` step 2: *"The app… calls `startVerification` Cloud Function with `{phone, timestamp, appCheckToken}`."* `02-ARCHITECTURE.md` auth lifecycle: *"App → call Firebase Cloud Function: startVerification."* `07-USER-FLOWS.md` step 2: *"Client calls Firebase Cloud Function `startVerification`."*  
- But `12-FOLDER-STRUCTURE.md` creates `app/api/auth/start-verification+api.ts` described as a *"proxy to startVerification CF"*. And `06-API.md` documents `POST /api/auth/start-verification` as an Expo API route.  
- **Contradiction:** Does the client call the CF directly or through an Expo API proxy? Both cannot be true simultaneously.  
- **Fix:** Decide one canonical path. Preferred: the client calls the Expo API proxy (`POST /api/auth/start-verification`), which calls the CF server-side and returns the result. Update `01-PRD.md`, `02-ARCHITECTURE.md`, and `07-USER-FLOWS.md` to say *"App calls `POST /api/auth/start-verification` (Expo API proxy)"* rather than calling the CF directly. The proxy handles rate limiting at the API layer.

**O-02 [LOGIC]** Same contradiction for `checkAuth`. `02-ARCHITECTURE.md` auth lifecycle says *"App polls every 3s: checkAuth({sessionCode})"* (implies direct CF call). `12-FOLDER-STRUCTURE.md` has `check-auth+api.ts ← POST polls verification status from CF` (proxy). `06-API.md` documents `POST /api/auth/check-auth` as an Expo route.  
- **Fix:** Align with O-01. Client calls `POST /api/auth/check-auth` (Expo proxy). Proxy calls CF `checkAuth`. Update all three docs.

**O-03 [SEC]** If the client calls the CF directly (current PRD/Architecture/UserFlows interpretation), App Check token validation happens entirely in the CF. If the client calls the Expo API proxy, the proxy must also pass the `appCheckToken` to the CF. The proxy-to-CF call details (how the proxy authenticates with the CF) are not documented in either the architecture or API specs.  
- **Fix:** After resolving O-01, document the proxy-to-CF authentication mechanism (e.g., the Expo API calls the CF via its deployed URL, passing the client's `appCheckToken` in the request body or as a CF-callable function call).

**O-04 [DOC]** `06-API.md POST /api/auth/check-auth` has no documented rate limit in the Rate Limiting Key Format table. With polling every 3s for up to 60s, a single user generates ~20 requests per session. With hundreds of concurrent users, this creates high load on the proxy and CF.  
- **Fix:** Add an entry to the Rate Limiting Key Format table: `auth_check:{sessionCode} | 20s | 10` (10 checks within 20s, then exponential backoff or 429).

---

## Category P — `AC-AUTH-4` Missing Numbering (1 issue)

**P-01 [DOC]** `01-PRD.md` Acceptance Criteria go from `AC-AUTH-3` directly to `AC-AUTH-5` — `AC-AUTH-4` is missing.  
- **Fix:** Add `AC-AUTH-4`: *"Polling `checkAuth` returns `'mismatch'` when the RTDB receipt was written by an anonymous UID different from the `initiator_uid` stored at `startVerification` time. The app shows an error and clears the session. Verified by: security test with a spoofed RTDB write from a different anonymous session."*

---

## Category Q — PRD Requirement Numbering Errors (3 issues)

**Q-01 [DOC]** `01-PRD.md` requirement 31 appears TWICE: once as *"Three-Step Driver Onboarding & Document Upload"* (under Driver Onboarding, correctly numbered 31) and again as *"Rider Cancellation"* (under Cancel & Dispute Handling, also numbered 31). Duplicate requirement numbers.  
- **Fix:** Renumber the "Rider Cancellation" to the next available number (e.g., 51), and renumber all subsequent "Cancel & Dispute" requirements sequentially.

**Q-02 [DOC]** `01-PRD.md` requirement 32 also appears twice: *"Manual Admin Approval"* under Onboarding (number 32) and *"Driver Cancellation"* under Cancel & Dispute (also 32). Same problem as Q-01.  
- **Fix:** Renumber all requirements under Cancel & Dispute Handling, Anti-Fraud, Infrastructure, Admin, and Data sections sequentially after the highest Driver Onboarding number.

**Q-03 [DOC]** The PRD requirement numbering sequence under Must-have is inconsistent: starts at 1–5 (Phone Auth), jumps to 31–32 (Driver Onboarding), then to 8–9 (Legacy, SLA), then 10–14 (Subscription), then 15–18 (Rider), then 19–30 (Matching, Trip), then re-uses 31–36 (Cancel, Fraud, Infrastructure). The non-sequential numbering makes cross-referencing from AC and other docs unreliable.  
- **Fix:** Assign sequential unique numbers to all requirements (1–N) and update all cross-references in AC table, `07-USER-FLOWS.md`, and `08-UI-SPEC.md`.

---

## Category R — `driver_arriving` State Missing from PRD (2 issues)

**R-01 [DOC]** `01-PRD.md` req 30: *"Driver 'Start Ride' and 'Complete Ride' buttons."* Only two buttons are mentioned. But per the lifecycle table, there should be a third state (`driver_arriving`) between `matched` and `in_progress`. If `driver_arriving` is set automatically (per A-01), the PRD is technically correct (no third button needed). But if `driver_arriving` requires a driver action ("I've arrived"), a third button is missing from the PRD.  
- **Fix:** After resolving A-01, update PRD req 30 to explicitly state: *"'Start Ride' transitions status from `driver_arriving` to `in_progress`. No separate 'I've arrived' button — `driver_arriving` is set automatically when the driver accepts the offer."*

**R-02 [DOC]** `08-UI-SPEC.md` Screen 7 (Ride Offer Card) documents the offer/accept flow but has no post-accept screen showing the driver navigating to pickup in `driver_arriving` state. The transition from accepting an offer to the navigation/start-ride screen is not documented.  
- **Fix:** Add "Screen 7b: Driver Navigating to Pickup" covering the `driver_arriving` state: map view, rider pickup pin, "Start Ride" button (green, full-width), ETA to pickup.

---

## Category S — `POST /api/driver/documents/submit` Usage Gap (2 issues)

**S-01 [LOGIC]** `06-API.md` documents `POST /api/driver/documents/submit` and `08-UI-SPEC.md` documents the onboarding flow. But neither document shows WHERE this endpoint is called during onboarding. `07-USER-FLOWS.md` Flow 2 Step 3 API calls: only `POST /api/driver/owner-consent/submit` and `POST /api/admin/driver/approve`. There is no step that calls `POST /api/driver/documents/submit`.  
- **Fix:** Add to `07-USER-FLOWS.md` Flow 2 Step 3: *"After the consent form is submitted, the app calls `POST /api/driver/documents/submit` to finalize the document submission and move the driver to the admin review queue."* Update `08-UI-SPEC.md` Screen 4 Step 3 post-submit API calls accordingly.

**S-02 [API]** `06-API.md POST /api/driver/documents/submit` body is `None`. But how does the server know which documents to include in the review? It presumably queries all `documents` rows for the driver where `status='pending'`. If the driver uploaded documents across multiple sessions and some were replaced, there could be duplicate doc_type rows. The unique partial index on `(driver_id, doc_type) WHERE status IN ('pending','approved')` prevents duplicates for active docs. But the submit endpoint has no validation that all REQUIRED document types for the driver's vehicle_type are present.  
- **Fix:** Add a validation description: *"Server checks that all required document types for the driver's vehicle_type are present (status='pending' or 'approved'). Returns 422 `missing_required_documents` with a list of missing types if any are absent."*

---

## Category T — `GET /api/package/list` daily_cap Null vs DB 200 (2 issues)

**T-01 [API]** `06-API.md GET /api/package/list` response note: *"daily_cap is null for finite, 200 for unlimited."* But `05-DATA-MODEL.md` `packages` table has `daily_cap integer yes 200` as the DEFAULT for ALL packages, not just unlimited. The API returns null for finite packages even though the DB stores 200 for them.  
- **Fix:** Either (a) set `packages.daily_cap = NULL DEFAULT NULL` for finite packages at creation time (enforce this in `POST /api/admin/package`), or (b) add a note to the API response: *"daily_cap is null for finite packages (the DB value is ignored for non-unlimited packages). Only meaningful when `call_count = -1`."*

**T-02 [API]** `POST /api/admin/package` body says `daily_cap: integer|null`. But the data model default is 200. If admin creates a finite package without specifying `daily_cap`, it defaults to 200 in the DB — a value that is then suppressed in the API response. This is confusing. Admin should receive clear guidance that `daily_cap` is irrelevant for finite packages.  
- **Fix:** Add to `POST /api/admin/package` spec: *"If `call_count > 0` (finite package), `daily_cap` is stored but ignored during dispatch. Recommended: pass `null` for finite packages to make intent explicit. Server should store `null` (not 200) when `call_count > 0`."*

---

## Category U — `lib/jwt.ts` Sign vs Verify Ambiguity (1 issue)

**U-01 [DOC]** `12-FOLDER-STRUCTURE.md` `lib/jwt.ts` description: *"challenge_jwt sign/verify with FUNCTIONS_JWT_SECRET."* The Firebase Cloud Function (`checkAuth`) SIGNS the `challenge_jwt`. The Expo API (`POST /api/register`) VERIFIES it. The Expo app's `lib/jwt.ts` should only verify — it has no authority to sign challenge JWTs. Having "sign" in the description implies the Expo app could create challenge JWTs, which is a security concern.  
- **Fix:** Change description to: *"challenge_jwt VERIFY with FUNCTIONS_JWT_SECRET. Used by `POST /api/register` to validate the JWT signed by the `checkAuth` Cloud Function. Does NOT sign — signing happens in `functions/src/checkAuth.ts` only."*

---

## Category V — `useChatStore` Missing from Architecture (2 issues)

**V-01 [DOC]** `02-ARCHITECTURE.md` KEEP section says to add new stores: *"`usePackageStore`, `useCallLedgerStore`, `useChatStore`."* Wait, actually it says "Add new stores: `usePackageStore`, `useCallLedgerStore`, `useDriverStatusStore`" — `useChatStore` is missing from this list.  
- `12-FOLDER-STRUCTURE.md` lists all four: `usePackageStore`, `useCallLedgerStore`, `useDriverStatusStore`, `useChatStore`.  
- **Fix:** Add `useChatStore` to the store list in `02-ARCHITECTURE.md` KEEP section.

**V-02 [DOC]** `02-ARCHITECTURE.md` ADD section lists new lib files but does not mention `lib/sms-retriever.ts`. `12-FOLDER-STRUCTURE.md` includes it. The architecture doc is missing this file.  
- **Fix:** Add `lib/sms-retriever.ts — Android SMS_RETRIEVER_API wrapper (Expo config plugin)` to the ADD section of `02-ARCHITECTURE.md`.

---

## Category W — `@neondatabase/serverless` Missing from Folder Structure (1 issue)

**W-01 [DOC]** `12-FOLDER-STRUCTURE.md` `utils-server/package.json` REPLACE note lists: *"add ws, h3-js, firebase-admin, drizzle-orm."* But `03-TECH-STACK.md` Utils-server section includes `@neondatabase/serverless ^1.0.0`. This package is omitted from the folder structure install instruction.  
- **Fix:** Update `12-FOLDER-STRUCTURE.md` utils-server package.json note to: *"add ws, h3-js, firebase-admin, @neondatabase/serverless, drizzle-orm."*

---

## Category X — `RTDB` Cleanup from `utils-server` Is Architecturally Wrong (1 issue)

**X-01 [BUILD]** `12-FOLDER-STRUCTURE.md` `utils-server/scheduler.ts` entry 7 says: *"(7) RTDB verification cleanup: every 30 minutes."* The utils-server is a Node.js process that connects to PostgreSQL via `@neondatabase/serverless`. It also has `firebase-admin` for FCM. Deleting RTDB nodes from utils-server would require the Firebase Admin SDK RTDB delete operation (`admin.database().ref('verification_requests').orderByChild('expiresAt').endAt(Date.now()).remove()`). This is possible but:  
1. It mixes the RTDB cleanup concern into the dispatch server.  
2. The Firebase Cloud Functions already have access to the RTDB. A scheduled CF (Cloud Scheduler + Cloud Functions) would be a more appropriate location.  
- **Fix:** Move the RTDB cleanup to a Firebase Cloud Function triggered by Cloud Scheduler every 30 minutes. Remove entry 7 from `utils-server/scheduler.ts`. Add a new CF file `functions/src/cleanupVerification.ts`.

---

## Category Y — `lib/sms-retriever.ts` Is Misclassified as a Config Plugin (1 issue)

**Y-01 [BUILD]** `12-FOLDER-STRUCTURE.md` describes `lib/sms-retriever.ts` as an *"Expo config plugin."* Expo config plugins are project-configuration-time scripts (run during `expo prebuild`), not runtime modules. A runtime SMS listener is a native module wrapper, not a config plugin. The file likely wraps `react-native-otp-verify` for use at runtime.  
- **Fix:** Change the description to: *"Runtime wrapper for `react-native-otp-verify` (Android SMS_RETRIEVER_API). Provides `startSmsRetriever()` and `onSmsReceived(callback)` for use in `app/(auth)/otp-polling.tsx`."* Remove the "config plugin" label.

---

## Category Z — Deploy Order Risk (3 issues)

**Z-01 [BUILD]** `15-RUNBOOK-DEPLOY.md` production deploy order:
1. Firebase Cloud Functions
2. utils-server (new version)
3. DB migrations
4. EAS build

Step 2 deploys the NEW utils-server BEFORE step 3 runs DB migrations. If the new utils-server expects new columns or tables that don't exist yet, it will crash at startup.  
- **Fix:** Swap steps 2 and 3. Correct order: Functions → DB migrations → utils-server → EAS build. Update the rationale note.

**Z-02 [BUILD]** `15-RUNBOOK-DEPLOY.md` post-deploy checklist says *"Verify pricing rows: `SELECT count(*) FROM pricing WHERE is_active=true` → should return 8."* But `seed-pricing.js` only inserts rows if the pricing table is empty. On subsequent deploys (not first deploy), this check will always pass as long as the 8 rows were inserted on the first deploy. However, if a migration drops and recreates the pricing table, the seed wouldn't run automatically.  
- **Fix:** Add to the pre-deploy checklist: *"If any migration drops+recreates the pricing table, re-run `seed-pricing.js` before starting utils-server."*

**Z-03 [BUILD]** `10-DEV-SETUP.md` step 8 instructs: *"`npx drizzle-kit push`"* for local dev. But `15-RUNBOOK-DEPLOY.md` explicitly says *"Never run `drizzle-kit push` in production — only `migrate`."* The dev setup docs use `push` (correct for dev) but a developer who copies the command to staging/production without reading the runbook could cause issues.  
- **Fix:** Add a warning box in `10-DEV-SETUP.md` step 8: *"⚠️ `drizzle-kit push` is for local development ONLY. Use `drizzle-kit migrate` for staging and production."*

---

## Category AA — Env Var Placement Errors (3 issues)

**AA-01 [ENV]** `11-ENV-VARS.md` places `RIDER_RATE_LIMIT_PER_HOUR` and `MAX_ACTIVE_RIDES_PER_RIDER` in the **utils-server** env vars section. But both constraints are enforced in the Expo API route `POST /api/ride/request+api.ts` (server-side Expo), not in utils-server. They should be in the Expo app server-side variables section.  
- **Fix:** Move `RIDER_RATE_LIMIT_PER_HOUR` and `MAX_ACTIVE_RIDES_PER_RIDER` to the Expo app server-side variables table in `11-ENV-VARS.md`.

**AA-02 [ENV]** `11-ENV-VARS.md` marks `WEBSOCKET_SERVER_INTERNAL_URL` as `Required: yes` but gives a default of `http://localhost:3001`. If it has a sensible default, it should be `Required: no`.  
- **Fix:** Change to `Required: no | Default: http://localhost:3001`.

**AA-03 [ENV]** `11-ENV-VARS.md` `DISPATCH_PAUSED` description says *"Emergency kill switch. Set to 'true' to halt all new ride offer broadcasts."* It does not mention that changing this env var requires a utils-server restart (dropping 5,000 WebSocket connections), and that the correct runtime mechanism is `POST /api/admin/dispatch-toggle`.  
- **Fix:** Add: *"⚠️ Startup fallback only. Changing this env var requires a restart. For runtime control without restart, use `POST /api/admin/dispatch-toggle` (writes to system_config table, takes effect within one dispatch cycle)."*

---

## Category AB — `functions_jwt_secret` Firebase Config Key Format (2 issues)

**AB-01 [BUILD]** `11-ENV-VARS.md` shows the Firebase Functions config set command as:
```
firebase functions:config:set hmac.secret="..." app.rtdb_url="..." functions_jwt_secret="..."
```
`hmac.secret` is under the `hmac` namespace. `app.rtdb_url` is under the `app` namespace. But `functions_jwt_secret` is at the root level (no namespace). Firebase Functions config access would be `functions.config().functions_jwt_secret` — but the `config()` object is keyed by the first segment of dot-notation. A root-level key like `functions_jwt_secret` would be accessed as `functions.config()['functions_jwt_secret']`, which is non-standard. It should be namespaced, e.g., `jwt.secret`.  
- **Fix:** Change to `firebase functions:config:set jwt.secret="..."`. Update all references from `functions_jwt_secret` key to `jwt.secret`. The `functions_jwt_secret` key in the Node.js env (Expo API) remains `FUNCTIONS_JWT_SECRET` (that's an env var name, not a CF config key).

**AB-02 [DOC]** The three Firebase Functions config keys (`hmac.secret`, `app.rtdb_url`, `jwt.secret` after fix) are accessed in Cloud Function code as `functions.config().hmac.secret`, etc. But `functions/.runtimeconfig.json` format for local dev is not shown in `10-DEV-SETUP.md`. Step 6 only shows `{"hmac":{"secret":"..."}}`. The JWT secret entry is missing from the example.  
- **Fix:** Update `10-DEV-SETUP.md` step 6 runtimeconfig.json example to:
```json
{
  "hmac": {"secret": "your-dev-hmac-secret"},
  "app": {"rtdb_url": "https://ride-bd-dev-default-rtdb..."},
  "jwt": {"secret": "your-dev-jwt-secret"}
}
```

---

## Category AC — `driver_online_sessions` Write Ownership Undocumented (3 issues)

**AC-01 [LOGIC]** `12-FOLDER-STRUCTURE.md` placement rules say *"Online session writes | `app/api/driver/status` (Expo API) + utils-server (WebSocket disconnect)."* But `06-API.md POST /api/driver/status` side effects are not documented — there is no mention of creating or closing `driver_online_sessions` rows.  
- **Fix:** Add to `06-API.md POST /api/driver/status` side effects: *"If `is_online=true`: INSERT `driver_online_sessions {driver_id, subscription_id=active_sub.id, went_online_at=now()}`. If `is_online=false`: UPDATE `driver_online_sessions SET went_offline_at=now(), duration_minutes=EXTRACT(EPOCH FROM (now()-went_online_at))/60 WHERE driver_id=? AND went_offline_at IS NULL`."*

**AC-02 [LOGIC]** When a driver's WebSocket disconnects, utils-server treats it as implicit rejection of pending offers. But there is no documentation about utils-server updating `driver_online_sessions.went_offline_at` on WebSocket disconnect. The placement rules mention utils-server handles this, but the WebSocket reconnection policy section in `02-ARCHITECTURE.md` doesn't mention it.  
- **Fix:** Add to `02-ARCHITECTURE.md` WebSocket Reconnection Policy: *"On disconnect: UPDATE `driver_online_sessions SET went_offline_at=now(), duration_minutes=...` WHERE the session row for this driver has `went_offline_at IS NULL`. UPDATE `drivers.is_online = false`."*

**AC-03 [LOGIC]** If a driver purchases a new subscription while they are already online (subscription renewal before expiry), which `subscription_id` should be used for the new `driver_online_sessions` rows? There could be a brief window where the old subscription's session row is still open and the new subscription becomes active. This edge case is undocumented.  
- **Fix:** Add a note: *"On subscription renewal while driver is online: close the existing session row (set `went_offline_at=now()`), then open a new session row with the new `subscription_id`."*

---

## Category AD — Missing Admin Suspension WebSocket Notification (2 issues)

**AD-01 [WS]** `06-API.md POST /api/admin/driver/suspend` side effects: *"Driver forced offline, active offers cancelled."* But there is no WebSocket event documented for the admin forcing a driver offline. The driver's app would not know it was suspended until it next polls an endpoint.  
- **Fix:** Add to the WebSocket events table: `admin:suspended | server → driver | {driver_id, reason}` — sent when admin suspends a driver. Driver app should show a blocking modal: "Your account has been suspended. Reason: [reason]. Contact support."

**AD-02 [LOGIC]** The Expo API route `POST /api/admin/driver/suspend` is not in utils-server, but it needs to notify utils-server to disconnect the driver's WebSocket. The mechanism for Expo API → utils-server driver disconnect is not documented. A similar challenge exists for `admin:vehicle-downgrade` events.  
- **Fix:** Document an internal endpoint in utils-server: `POST /internal/driver/force-offline {driver_id, reason}` authenticated with `WEBSOCKET_INTERNAL_SECRET`. The Expo API calls this after updating the DB on suspension/downgrade. Add to `06-API.md` Internal Endpoints section.

---

## Category AE — Rate Limiting Fixed Window vs Rolling Window (2 issues)

**AE-01 [LOGIC]** `06-API.md` rate limits section says *"5 requests per rider per **rolling** 60 minutes"* for ride requests. But the `rate_limits` table uses `(key, window_start)` as a composite PK — this is a fixed-window design (one row per hour per user). A fixed window allows bursting: a driver could make 5 requests at 11:59 and 5 more at 12:01. A rolling window requires tracking individual request timestamps or a sliding counter.  
- **Fix:** Either (a) change the rate limiting implementation to a true rolling window (using request timestamps, e.g., a `rate_limit_events` table), or (b) change the PRD/API spec from "rolling" to "fixed window" to match the implementation. Document the choice explicitly.

**AE-02 [SCHEMA]** The `rate_limits` table stores `count integer yes 0`. For the fixed-window approach, this count is incremented on each request. But there is no mechanism to expire or decrement the count within the window — only the scheduler cleanup deletes rows after `window_start < now() - 1 hour`. If the cleanup runs 60 minutes late, stale rows could block requests in the next window.  
- **Fix:** Add a note: *"The rate_limits cleanup scheduler (every 60 minutes) must run reliably. If delayed, stale rows from the previous window may persist. This is acceptable for MVP scale."*

---

## Category AF — Missing Rider Quality Score (2 issues)

**AF-01 [SCHEMA]** PRD req 18 says *"Rider rating used for rider quality scoring and abuse detection."* But there is no rider rating aggregation in the data model (see I-01). Furthermore, there is no `rider_quality_score` column or equivalent. `POST /api/ride/:id/rate` with `role='driver'` stores the rating in `rides.driver_rating` but doesn't aggregate it.  
- **Fix:** Add `rating numeric(3,2) DEFAULT NULL`, `rating_count integer NOT NULL DEFAULT 0`, `rating_sum integer NOT NULL DEFAULT 0` to the `users` table in `05-DATA-MODEL.md`. Document the update logic in `POST /api/ride/:id/rate` (role='driver') side effects.

**AF-02 [LOGIC]** `05-DATA-MODEL.md` Anti-Fraud section references `users.device_id` for unlimited-package device binding. But neither `01-PRD.md` nor `06-API.md` documents a device-binding endpoint. `06-API.md` "Documented Gaps" acknowledges this. However, `users.device_bound_at` exists. There should be at least a placeholder endpoint (even if unimplemented MVP) so the DB columns are understood.  
- **Fix:** Add to `06-API.md` Documented Gaps: *"Device binding enforcement: `POST /api/user/bind-device {device_id}` — sets `users.device_id` and `users.device_bound_at`. If device changes: triggers OTP re-verify + 24h cooldown. Not implemented in MVP but columns exist."*

---

## Category AG — Legacy Operator SLA Not Reflected in Monitoring (2 issues)

**AG-01 [LOGIC]** `01-PRD.md` req 8: *"Legacy operators who are also vehicle owners receive fast-track approval — admin review SLA reduced to **12 hours**."* `17-MONITORING.md` admin queue alert: *"Oldest pending driver submission age > **24h** → P2."* The alert uses the standard 24h SLA without any exception for the 12h legacy-operator SLA.  
- **Fix:** Add a separate alert row: *"Legacy-operator pending submission age > 12h | > 0 | P2 | SLA breach for fast-track legacy operator. Notify admin immediately."*

**AG-02 [API]** `06-API.md GET /api/admin/queue` response field `sla_breach: boolean`. The boolean does not distinguish 12h SLA (legacy operators) from 24h SLA (regular drivers). Admin looking at the queue would not know which breach type they are dealing with.  
- **Fix:** Change `sla_breach: boolean` to `sla_breach: "none" | "standard" | "fast_track"` (or add a `sla_hours: 12 | 24` field) to the queue response. Update the admin queue table in `08-UI-SPEC.md` to highlight fast-track SLA breaches with a different colour.

---

## Category AH — `apk_download_url` Not in system_config (2 issues)

**AH-01 [API]** `06-API.md GET /api/app-config` response includes `{ "min_app_version": ..., "latest_version": ..., "apk_download_url": ... }`. But `05-DATA-MODEL.md` `system_config` initial rows only seed `dispatch_paused`, `min_app_version`, `brta_fare_ceiling_bdt`. There is no `apk_download_url` or `latest_version` key.  
- **Fix:** Add two new `system_config` initial rows:
  - `apk_download_url = ''` (admin must set the actual URL after each EAS build)
  - `latest_version = '1.0.0'` (admin must update on each release)
  Add these to `05-DATA-MODEL.md` system_config initial rows and to `scripts/seed-system-config.js`.

**AH-02 [BUILD]** There is no documented process for updating `apk_download_url` and `latest_version` in `system_config` after each EAS build. These should be in the post-deploy checklist.  
- **Fix:** Add to `15-RUNBOOK-DEPLOY.md` Step 4 post-actions: *"After EAS build submits, update `system_config`: `POST /api/admin/config {key:'apk_download_url', value:'https://...'}` and `{key:'latest_version', value:'x.y.z'}`."*

---

## Category AI — `scripts/seed-packages.js` Missing (2 issues)

**AI-01 [BUILD]** `14-DEV-CHECKLIST.yaml` P2-16 documents initial package seeding with `required_packages` (Starter 50 and a micro-trial). `10-DEV-SETUP.md` does not include a step for seeding packages. `12-FOLDER-STRUCTURE.md` does not list `scripts/seed-packages.js`.  
- **Fix:** Add `seed-packages.js` to `12-FOLDER-STRUCTURE.md` scripts section and to `10-DEV-SETUP.md` as step 14: *"node scripts/seed-packages.js — inserts initial micro-trial and starter packages."*

**AI-02 [BUILD]** `15-RUNBOOK-DEPLOY.md` production deploy checklist includes `seed-system-config.js` and `seed-pricing.js` but not package seeding. If the packages table is empty, drivers cannot purchase subscriptions.  
- **Fix:** Add `DATABASE_URL="<production-url>" node scripts/seed-packages.js` as a step in the production deploy checklist.

---

## Category AJ — `GET /api/ride/estimate` Zone Check Undocumented at Estimate Time (1 issue)

**AJ-01 [API]** `06-API.md GET /api/ride/estimate` notes: *"If pickup outside zone → 422 `outside_zone`."* But the purpose of the estimate endpoint is for riders to see fares BEFORE they confirm a pickup. If zone validation rejects estimates for outside-zone pickups, riders see a zone error before they even understand where the service operates. The UX spec (Screen 8, FareBreakdownSheet) handles the zone error with a toast — but the spec says "Sheet does not open" on 422.  
- **Fix:** Document the zone check clearly in both `06-API.md` and `08-UI-SPEC.md`. Add: *"Zone check on estimate is intentional — prevents riders from seeing fares for areas the service doesn't cover. On 422 `outside_zone`, show the zone error toast on the map screen (not inside the fare sheet which never opens). Rider should reposition the pickup pin."*

---

## Category AK — `vehicles.registration_date` vs `drivers.vehicle_registration_date` Sync (2 issues)

**AK-01 [SCHEMA]** `05-DATA-MODEL.md` drivers table note on `vehicle_registration_date`: *"⚠ Redundancy note: this value is also stored as `vehicles.registration_date` (the canonical source). Both must always be set together from the same source."* But `POST /api/vehicle/register` only creates the `vehicles` row. It is not documented that the handler also updates `drivers.vehicle_registration_date`.  
- **Fix:** Add to `06-API.md POST /api/vehicle/register` side effects: *"After INSERT vehicles, UPDATE drivers SET vehicle_registration_date = :registration_date, vehicle_id = :vehicle_id WHERE id = :driver_id."*

**AK-02 [SCHEMA]** On admin vehicle type downgrade, if the vehicle_type changes but registration_date stays the same (the same vehicle), `drivers.vehicle_registration_date` does not need to change. But `drivers.vehicle_type` is updated. The driver's `vehicle_registration_date` column notes say to prefer `vehicles.registration_date` for accuracy. However, since both exist, there's an implicit assumption they match. No validation or assertion checks they're equal.  
- **Fix:** Add an invariant note: *"Invariant: `drivers.vehicle_registration_date = vehicles.registration_date WHERE drivers.vehicle_id = vehicles.id`. Any code that updates one must update both."*

---

## Category AL — `driver_arriving` vs `matched` in Cancellation Reason (1 issue)

**AL-01 [API]** `06-API.md POST /api/ride/:id/cancel` body: *"`reason`: conditional — required for rider post-match."* But per the corrected status flow (A-01), `matched` is immediately overwritten by `driver_arriving`. So the check should be *"required for rider when status='driver_arriving'"* not "post-match" (which is vague).  
- **Fix:** Change to: *"`reason`: required when caller is rider AND `rides.status = 'driver_arriving'` or `in_progress`. Optional otherwise."*

---

## Category AM — `comp_queue` INSERT Timing Undocumented (2 issues)

**AM-01 [LOGIC]** `06-API.md POST /api/payment/bkash/callback`: *"If `activateSubscription()` throws: INSERT compensation_queue row."* But there is a potential for duplicate `compensation_queue` rows if the callback is received twice (bKash may retry callbacks). The `compensation_queue` has a `payment_event_id` unique index to prevent this. But if the INSERT of compensation_queue itself fails (e.g., because the row already exists), the callback handler would silently ignore it. This should be documented.  
- **Fix:** Add: *"The compensation_queue INSERT uses ON CONFLICT ON CONSTRAINT compensation_queue_payment_event_id_key DO NOTHING — ensuring idempotency if the callback is received twice."*

**AM-02 [LOGIC]** `05-DATA-MODEL.md` compensation_queue notes say: *"INSERT happens in the same transaction as `payment_events` status update."* But if the payment callback handler calls `activateSubscription()` and it throws, the handler inserts into `compensation_queue`. The question is: does the `payment_events.status` update happen BEFORE or AFTER `activateSubscription()`? If status is updated to 'paid' before activation and activation then fails, the compensation path correctly triggers. But if activation succeeds but the status update fails, the payment would be activated without the event being marked 'paid'. The transaction order needs to be documented explicitly.  
- **Fix:** Add a sequencing note: *"Transaction order in `activateSubscription()`: (1) UPDATE `payment_events.status='paid'`, `confirmed_at=now()`, `subscription_id=new_sub.id`; (2) INSERT subscriptions; (3) INSERT call_ledger initial_load. If (1) fails (e.g., already 'paid'), raise idempotency error and skip steps 2-3. This ensures the payment event is marked paid atomically with activation."*

---

## Category AN — `AC-10` Missing Platform-Shortage Detection Detail (2 issues)

**AN-01 [LOGIC]** `01-PRD.md AC-10` says: *"Subscription expiring with `< 50% calls used` AND `online_minutes > 60% of duration` → `credit_vouchers` row created."* But `07-USER-FLOWS.md` Flow 5 adds a third condition: the driver must have received fewer than 50% of the zone average (platform-side shortage detection). AC-10 omits this third condition.  
- **Fix:** Update AC-10: *"...AND received_offers_count < 50% of zone-average offers for the subscription period (platform-side shortage) → INSERT `credit_vouchers` row..."*

**AN-02 [SCHED]** `07-USER-FLOWS.md` Flow 5 describes the pro-rata credit calculation using `total_offers_dispatched_in_zone / total_active_drivers_in_zone`. But there is no DB table or column that tracks `total_offers_dispatched_in_zone` per subscription period. Without this data, the platform-shortage detection cannot be implemented.  
- **Fix:** Add a note to `05-DATA-MODEL.md`: *"Pro-rata shortage check: query `COUNT(*) FROM dispatch_offers WHERE ride_id IN (SELECT id FROM rides WHERE zone_id=? AND created_at BETWEEN sub.purchased_at AND sub.expires_at)` as zone_total_offers, divided by online-driver count for the period. This is computed at expiry time — no additional table needed."*

---

## Category AO — `documents` Hard-Delete vs Soft-Delete (2 issues)

**AO-01 [SCHEMA]** `05-DATA-MODEL.md` hard rules: *"No hard deletes on: users, drivers, …, documents…"* And the `documents` table has `deleted_at timestamptz NULL` for soft deletes. But the scheduler purge (entry 8 in `12-FOLDER-STRUCTURE.md`) says: *"DELETE Firebase Storage objects WHERE `documents.purge_at < now()`, set `storage_url=NULL`."* The storage object is deleted but the documents DB row remains (with `storage_url=NULL`). This is correct per the no-hard-delete rule. But the purge description says "DELETE Firebase Storage objects" — this could be misread as also deleting the DB row.  
- **Fix:** Clarify in `12-FOLDER-STRUCTURE.md`: *"(8) Document purge: daily. For each documents row WHERE `purge_at < now() AND storage_url IS NOT NULL`: call Firebase Storage `deleteObject(storage_url)`. Then `UPDATE documents SET storage_url=NULL WHERE purge_at < now()`. Do NOT delete the documents DB row — it is retained indefinitely per no-hard-delete rule."*

**AO-02 [LOGIC]** The `documents.purge_at` is set "on account closure." But there is no "account closure" endpoint or workflow documented anywhere in the API spec. PRD req 44 says *"Uploaded document images purged 90 days after account closure."* How does account closure happen? Admin action? Driver inactivity? This gap is entirely undocumented.  
- **Fix:** Add to `06-API.md` Admin Routes: `POST /api/admin/driver/close-account {driver_id}` (or incorporate it into the suspend flow). Side effect: `UPDATE documents SET purge_at=now()+90days WHERE driver_id=?`. Document that account closure is admin-initiated only.

---

## Category AP — Chat Room Dual-Route File Confusion (2 issues)

**AP-01 [BUILD]** `08-UI-SPEC.md` Screen 13 (In-App Chat) route: *"`app/(main)/(customer)/chat` or `app/(main)/(rider)/chat`."* With Expo Router, these are two separate routes requiring two separate files (or one file with a shared component). `12-FOLDER-STRUCTURE.md` does not list either `(customer)/chat.tsx` or `(rider)/chat.tsx` in the new files. These files are missing from the folder structure.  
- **Fix:** Add both `app/(main)/(customer)/chat.tsx` (rider chat) and `app/(main)/(rider)/chat.tsx` (driver chat) to `12-FOLDER-STRUCTURE.md`, both using the shared `components/ChatScreen.tsx` component.

**AP-02 [DOC]** `08-UI-SPEC.md` Screen 13 says the header has *"Phone icon → GET /api/ride/:id/contact → `Linking.openURL('tel:' + phone)`."* But per B-03 (phone masking), the driver receives a masked phone number. Calling `Linking.openURL('tel:' + masked_phone)` would dial an invalid number (`+880 1X-XXXX-789` is not dialable). The native dialer button should only be enabled for the rider (who gets the full driver phone).  
- **Fix:** Add: *"The 'Call' button is shown to BOTH parties but uses the full phone for the rider's view and is HIDDEN for the driver (driver cannot call rider). If driver needs to contact rider, in-app chat is the only channel."*

---

## Category AQ — `GET /api/app-config` is `[public]` but Returns Sensitive Config Keys (1 issue)

**AQ-01 [SEC]** `06-API.md GET /api/app-config` is marked `[public]` and returns `min_app_version`, `latest_version`, and `apk_download_url`. This is intentional (unauthenticated clients need to know if they need to update). But `POST /api/admin/config` allows admin to write ANY `system_config` key/value. If an admin accidentally writes a sensitive value (e.g., a debug flag) to `system_config`, it would be exposed via the public `GET /api/app-config` endpoint.  
- **Fix:** `GET /api/app-config` should have an allowlist of keys it returns (e.g., only `min_app_version`, `latest_version`, `apk_download_url`). Add: *"This endpoint returns only pre-approved system_config keys. Any key not in the allowlist is excluded from the response, even if present in system_config."*

---

## Category AR — `offer:accept` vs `offer:reject` Deduction Semantics (3 issues)

**AR-01 [WS]** The WebSocket flow: `fetch:confirm` → deduction window opens (5s) → driver sends `offer:accept` within 15s. But what if a driver sends `offer:accept` WITHOUT first sending `fetch:confirm`? The server requires `fetch:confirm` for deduction, but `offer:accept` is a separate message. Does the server reject `offer:accept` if no `fetch:confirm` was received?  
- **Fix:** Add to `02-ARCHITECTURE.md` or `04-ADR.md` ADR-004: *"If `offer:accept` is received without a prior `fetch:confirm`: the server treats this as a late confirmation. If still within the 5s deduction window, process as normal. If outside the window, process the accept without deduction (no call charged) — the driver will receive the ride but no call is deducted (edge case acceptable at MVP scale; deduction-less accepts are logged for monitoring)."*

**AR-02 [WS]** `19-GLOSSARY.md` defines "Fetch Confirm" as: *"The WebSocket message (`fetch:confirm`) sent by the driver app on the **first user interaction** with the ride offer card."* But `08-UI-SPEC.md` Screen 7 states: *"`fetch:confirm` is sent when the driver first interacts with the card (touch on swipe handle, card area, or any button — whichever happens first within the 5-second window)."* These are consistent.  
- But `04-ADR.md` ADR-004 Consequences says: *"The `fetch:confirm` WebSocket message must be sent by the driver app on the **first user interaction** with the ride offer card — typically when the driver touches the card (swipe handle, card area, or any button)."* And: *"This is NOT on render (which would charge drivers for offers they never saw) and NOT on accept/reject."*  
- All three docs agree. But `07-USER-FLOWS.md` Flow 4 step 5 says: *"On first user interaction with the offer card (touch on swipe handle or any button): app sends `fetch:confirm` WebSocket message."* This is also consistent.  
- No fix needed here — noting consistency.

**AR-03 [WS]** The `offer:reject` WebSocket event payload is: `{ride_id, reason?}`. The `reason` field is optional. But is the rejection reason stored anywhere in the DB? `dispatch_offers.outcome='rejected'` captures the outcome. But the reason is not stored. For analytics (e.g., "driver rejected 10 rides because of long distance"), storing the rejection reason would be valuable.  
- **Fix:** Add `rejection_reason varchar(100) NULL` to the `dispatch_offers` table. Document that `offer:reject` with a reason string populates this column.

---

## Category AS — Scheduled Ride Dispatch Window Ambiguity (2 issues)

**AS-01 [SCHED]** `07-USER-FLOWS.md` Alternate path: Scheduled ride says: *"Scheduler runs every 60s and queries rides WHERE `scheduled_at BETWEEN now()+60s AND now()+120s`."* This means dispatch begins 60–120 seconds before `scheduled_at`. `01-PRD.md` AC-9 says: *"Scheduled ride is NOT dispatched immediately; dispatch begins at `scheduled_at - 120s`."* The AC implies dispatch begins EXACTLY at -120s, not "between -60s and -120s."  
- These are contradictory: the scheduler query selects rides within a 60–120s window (meaning dispatch could start anywhere from 60s to 120s before the scheduled time), but AC-9 says exactly 120s before.  
- **Fix:** Align. The scheduler catches rides whose scheduled time falls in the NEXT dispatch cycle window. With a 60s cycle: at time T, the scheduler catches rides where `scheduled_at BETWEEN T+60s AND T+120s`. This means dispatch starts at `scheduled_at - 60s` to `scheduled_at - 120s`. AC-9 should say: *"dispatch begins 60–120 seconds before `scheduled_at`"* (not exactly 120s).

**AS-02 [SCHED]** `18-KNOWN-ISSUES.md` TD-04 says: *"If utils-server restarts, in-flight scheduled ride timers are lost."* The workaround is: *"At utils-server startup, query DB for any scheduled rides with `scheduled_at BETWEEN now() AND now() + 60 min` and re-register their timers."* But `12-FOLDER-STRUCTURE.md` startup recovery only covers: (1) rebuild H3 index, (2) recover stuck dispatching rides, (3) replay compensation queue. It does NOT include re-registering scheduled ride timers.  
- **Fix:** Add to `02-ARCHITECTURE.md` startup recovery and `12-FOLDER-STRUCTURE.md` utils-server/index.ts: *"(4) Recover scheduled rides: query rides WHERE `status='pending' AND scheduled_at IS NOT NULL AND scheduled_dispatched_at IS NULL AND scheduled_at BETWEEN now() AND now()+60min`. Register setInterval callbacks for each, as if the scheduler had detected them."*

---

## Category AT — `free_wait_minutes` Removed from Schema (resolved)

**AT-01 [SCHEMA — RESOLVED]** `free_wait_minutes` has been removed from the `pricing` table. Free waiting is now a platform-wide constant: 60 seconds, stored in `system_config.max_free_wait_seconds`. No per-vehicle-type free wait configuration exists. The auto-start timer in `utils-server/scheduler.ts` transitions the ride to `in_progress` after 60 seconds if the driver hasn't tapped "Start Ride".

---

## Category AU — `10-DEV-SETUP.md` Missing Tables in Verify Step (1 issue)

**AU-01 [BUILD]** `10-DEV-SETUP.md` verify step says *"21 tables visible in Neon dashboard."* The list then names 21 tables. But counting the actual tables in `05-DATA-MODEL.md` (modified + new): users, drivers, rides, vehicles, packages, subscriptions, credit_vouchers, call_ledger, dispatch_offers, owner_consents, used_challenges, rate_limits, payment_events, documents, zones, chat_messages, pricing, driver_online_sessions, compensation_queue, system_config, vehicle_type_changes = exactly 21. This matches. However, the GlideX base schema may include additional tables not listed here (e.g., a `notifications` table or `ratings` table that GlideX might have). If GlideX has tables that are not deleted, the count could exceed 21.  
- **Fix:** Add: *"Note: GlideX may have additional tables (e.g., legacy notification or ratings tables). The 21 listed tables are the Ride-specific ones. Total table count may be higher if GlideX base tables are retained."*

---

## Category AV — `ADR-007` References Deleted `ratings` Table (1 issue)

**AV-01 [DOC]** `04-ADR.md` ADR-007 Consequences note: *"Note: There is no separate `ratings` table — rider and driver ratings are stored as columns directly on the `rides` table."* This note is correct and good. But the same note is implicitly contradicted by the `05-DATA-MODEL.md` hard rules listing "ratings" in the no-hard-delete list (issue G-07). Together these create confusion about whether a ratings table exists.  
- **Fix:** After applying fix G-07, ADR-007 is now internally consistent. No additional fix needed beyond G-07.

---

## Category AW — `dispatch_offers.outcome='filtered'` Unique Index Conflict (2 issues)

**AW-01 [SCHEMA]** `05-DATA-MODEL.md` critical indexes: *"`dispatch_offers | ride_id, driver_id | unique | Prevent same driver receiving same ride twice."*  
- But `05-DATA-MODEL.md` also says filtered offers create a `dispatch_offers` row with `outcome='filtered'`. If a driver is first filtered (min_per_km too high) for ride X, a row `(ride_X, driver_A, 'filtered')` exists. Later in the same dispatch, if the admin updates pricing (edge case: mid-dispatch), the dispatch engine might try to offer ride X to driver A again. The unique index would prevent this second INSERT, which is correct behaviour — but the error should be caught gracefully, not crash.  
- **Fix:** Add to `utils-server/dispatch.ts` implementation notes: *"The unique index on `(ride_id, driver_id)` prevents re-offering the same ride to the same driver. The EXCLUSION FILTER (query dispatch_offers before scoring) ensures this case never reaches an INSERT attempt. The unique index is a safety net only."*

**AW-02 [SCHEMA]** `dispatch_offers.outcome='filtered'` rows are counted in `GET /api/driver/missed-requests` and `filtered_count_7d`. But the acceptance rate formula (02-ARCHITECTURE.md) excludes `outcome='filtered'` from `offers_received`. This means filtered offers don't appear in the acceptance rate denominator — correct. But filtered offers DO appear in the missed-requests log. A driver could confuse "filtered" missed offers with offers where their acceptance rate was hurt. The UI should clearly distinguish.  
- **Fix:** Add to `08-UI-SPEC.md` Screen 17 (Driver Minimum Rate): *"Missed ride offers shown on this screen include both expired/refunded offers (count against acceptance rate) and filtered offers (do NOT count against acceptance rate). Use distinct visual labels: '⚡ Rate too high' for filtered, '⏰ No response' for expired."*

---

## Category AX — `POST /api/ride/request` Alternative Response 202 Semantics (2 issues)

**AX-01 [API]** `06-API.md POST /api/ride/request` documents a "202 (no drivers of requested type)" response returned *"When: all 3 dispatch batches exhausted AND `allow_downgrade=true` AND other vehicle types have available drivers."* But a 202 HTTP response means "Accepted — request being processed asynchronously." Here it means "processed synchronously, here are alternatives." A 200 with a different `status` field would be semantically more correct.  
- **Fix:** Change the alternative response code from 202 to 200 (or 200 with `status:"no_drivers"` as the body already shows). Update the HTTP status code in `06-API.md` and `07-USER-FLOWS.md` wherever 202 is mentioned.

**AX-02 [LOGIC]** `06-API.md POST /api/ride/request` says the 202/alternatives response is returned "when all 3 batches exhausted." But dispatch is asynchronous — the HTTP response for `POST /api/ride/request` returns the fare breakdown BEFORE dispatch starts. The alternatives response would only be available after dispatch finishes (up to 45s later). How does the HTTP response return alternatives synchronously while dispatch happens asynchronously?  
- **Fix:** The alternatives mechanism should be WebSocket-only (the server sends `ride:alternatives` event) — not part of the initial HTTP response. The HTTP response should return the usual 201 with `status:'pending'` and `ride_id`. After dispatch fails, the `ride:alternatives` WebSocket event is sent. The 202/alternatives HTTP response documented in `06-API.md` is architecturally incorrect. Update to: the initial HTTP response is always 201 with `status:'pending'`. Alternatives arrive via `ride:alternatives` WebSocket event.

---

## Category AY — `POST /api/register` `next` Field Logic Undocumented (1 issue)

**AY-01 [API]** `06-API.md POST /api/register` response includes `next: "onboarding|home"`. But the server-side logic for determining `next` is not specified. For a new driver, `next = 'onboarding'`. For a new rider, `next = 'home'`. But what if a driver was already partially through onboarding (vehicle registered but profile not submitted)? Should `next` be `'onboarding'` (resume) or something else?  
- **Fix:** Add: *"`next` determination: if `role='rider'` → always `'home'`. If `role='driver'` → always `'onboarding'` (driver must complete vehicle registration and profile regardless of prior partial state — the app handles step resumption internally)."*

---

## Category AZ — `used_challenges.expires_at` vs `challenge_jwt` Expiry (1 issue)

**AZ-01 [SCHEMA]** `05-DATA-MODEL.md` `used_challenges` table has `expires_at timestamptz yes —`. The `challenge_jwt` expires in 5 minutes (per JWT `exp` claim). `used_challenges.expires_at` should be set to the JWT's `exp` time. The scheduler cleans up rows WHERE `expires_at < now()`. This is correct. But the cleanup interval is 60 minutes while the TTL is 5 minutes — up to 55 minutes of expired rows accumulate. For replay attacks using old JTIs, the DB check is: "does this JTI exist in used_challenges?" If a JTI was cleaned up before the check, a replay would succeed.  
- **Fix:** Add a note: *"A replayed `challenge_jwt` with a JTI that was already cleaned up from `used_challenges` would also fail the JWT `exp` claim check (expired JWT). The `used_challenges` table is a secondary replay guard; the primary guard is the JWT `exp` claim. This is safe."*

---

## Category BA — `delivery` vs `dispatching` Status Confusion (1 issue)

**BA-01 [LOGIC]** `06-API.md` WebSocket event `ride:offer` includes the driver scoring and batch processing. Between `POST /api/ride/request` and the first offer being sent, `rides.status = 'dispatching'`. But the Ride Lifecycle State Machine says `pending → dispatching` is triggered by `"/internal/dispatch" received`. The internal endpoint notifies utils-server of a new ride. There is no documented HTTP spec for this internal endpoint.  
- **Fix:** Add to `06-API.md` (or create `06a-INTERNAL-API.md`): *"Internal endpoint `POST /internal/dispatch` authenticated by `WEBSOCKET_INTERNAL_SECRET` header. Body: `{ride_id: uuid}`. utils-server sets `rides.status='dispatching'` and starts the dispatch pipeline. Called by `POST /api/ride/request+api.ts` after the rides DB row is created."*

---

## Category BB — `GET /api/driver/pricing-reference` Cache and Consistency (1 issue)

**BB-01 [API]** `GET /api/driver/pricing-reference` returns the active pricing row for the driver's vehicle type. But if pricing changes mid-session (admin updates pricing via `POST /api/admin/pricing`), the driver's slider bounds could be stale. A driver might set `min_per_km_bdt = 1800` (150% of old 1200 per_km), but after the pricing update (new per_km = 1600), 1800 is now 112.5% which is still valid. But if per_km drops to 1000, 1800 would be 180% — above the 150% cap — and the driver would be silently filtered from dispatches until they update their minimum.  
- **Fix:** Add to `POST /api/admin/pricing` side effects: *"After updating pricing, server must re-validate all drivers with `min_per_km_bdt IS NOT NULL` for the affected vehicle_type. Drivers whose minimum now exceeds 150% of the new per_km_bdt should receive a push notification: 'System pricing updated. Your minimum rate now exceeds the allowed range. Please review your settings.'"*

---

## Category BC — Drizzle `drizzle-kit push` in Dev Setup Is Dangerous (1 issue)

**BC-01 [BUILD]** `10-DEV-SETUP.md` step 8 says to run `npx drizzle-kit push` for local dev. The common error table includes: *"`drizzle-kit push` fails with 'column already exists' | Run `npx drizzle-kit drop` then re-push (dev only — never in production)."* But `drizzle-kit drop` drops ALL tables. This is extremely destructive and should be a last resort, not a routine fix.  
- **Fix:** Change the fix to: *"Run `npx drizzle-kit push --force` to overwrite the schema (dev only). If still failing, check for migration conflicts in `drizzle/` folder. As a last resort for dev: drop only the conflicting table via Neon console (not `drizzle-kit drop` which drops everything)."*

---

## Category BD — ADR-003 Haversine Fallback Method Mismatch (1 issue)

**BD-01 [LOGIC]** `04-ADR.md` ADR-003 Consequences: *"Fallback: if H3 index is empty (cold start), falls back to `ORDER BY ST_Distance` Haversine query on PostgreSQL."* But `02-ARCHITECTURE.md` dispatch section says: *"fallback to Haversine when needed."* Neither mentions using `ST_Distance` (which requires the PostGIS extension). Neon does support PostGIS, but it must be explicitly enabled.  
- **Fix:** Either (a) document PostGIS as a required extension in `05-DATA-MODEL.md` or `10-DEV-SETUP.md` (`CREATE EXTENSION IF NOT EXISTS postgis`), or (b) change the fallback to pure application-level Haversine computation (no PostGIS needed). Document the choice consistently across ADR-003 and `02-ARCHITECTURE.md`.

---

## Category BE — `driver_online_sessions` Missing `subscription_id` Update on Renewal (1 issue)

**BE-01 [SCHEMA]** `driver_online_sessions.subscription_id` is set when the driver goes online. If the driver's subscription expires and they purchase a new one without going offline+online (e.g., subscription renews silently in the background), the session row still points to the old `subscription_id`. Pro-rata credit calculations query sessions by `subscription_id` — so credits would be attributed to the old subscription, not the new one.  
- **Fix:** Add a trigger or application note: *"On subscription activation (`lib/activateSubscription.ts`): check if the driver is currently online (`drivers.is_online=true` AND open session row exists). If so, close the old session and open a new one with the new `subscription_id`."*

---

## Category BF — `POST /api/ride/:id/rate` for Cancelled Rides (1 issue)

**BF-01 [API]** `06-API.md POST /api/ride/:id/rate` precondition: `status = 'completed'`. This prevents rating on cancelled rides. But a rider who had a matched driver who then cancelled (driver cancellation after accept) might want to rate the experience negatively. Without rating capability on cancellations, driver cancellation behaviour is only tracked via `drivers.acceptance_rate` and admin flags — not rider sentiment.  
- **Fix:** This is a design decision. Either (a) allow rating when `status='cancelled' AND cancelled_by='driver'` (add to precondition), or (b) document explicitly that cancellations are not rateable in the PRD "out of scope" or as a known limitation. Currently neither doc addresses this.

---

## Category BG — `13-CONVENTIONS.md` Naming Rules Include Inconsistency (2 issues)

**BG-01 [DOC]** `13-CONVENTIONS.md` naming table: *"Source files | kebab-case | `fare-calc.ts`."* But the actual lib files listed in `12-FOLDER-STRUCTURE.md` use camelCase/PascalCase: `fareCalc.ts`, `activateSubscription.ts`, `vehicleTypes.ts`, `referenceData.ts`, `presignUrl.ts`. These are camelCase, not kebab-case. The convention and the implementation don't match.  
- **Fix:** Align the naming convention. Either (a) change the convention to camelCase for `lib/` files and update the example, or (b) rename all lib files to kebab-case (`fare-calc.ts`, `activate-subscription.ts`, etc.) and update all import paths.

**BG-02 [DOC]** `13-CONVENTIONS.md` naming table: *"WebSocket events | `domain:action` (kebab domain, camelCase action not used) | `ride:offer`, `fetch:confirm`, `location:update`."* But `vehicle-type:change-applied` has a hyphenated domain (`vehicle-type`), not a single word. The convention says "kebab domain" but doesn't explicitly allow hyphens within the domain segment.  
- **Fix:** Update the convention to: *"WebSocket event names: `{domain}:{action}` where domain is kebab-case (hyphens allowed) and action is kebab-case. Examples: `ride:offer`, `vehicle-type:change-applied`."*

---

## Category BH — `GET /api/call-ledger` `balance_after` Semantics for Unlimited (1 issue)

**BH-01 [API]** `06-API.md GET /api/call-ledger` response shows `balance_after` as an integer. For unlimited packages, `balance_after = -1` (sentinel for unlimited). But the UI (`08-UI-SPEC.md` Screen 9) shows `balance_after` as a number. If -1 is displayed to the driver as a ledger balance, it would show "-1 calls" which is confusing.  
- **Fix:** Add a note to `06-API.md GET /api/call-ledger`: *"For unlimited subscriptions: `balance_after = -1` is a sentinel value meaning 'unlimited'. Client must check for -1 and display 'Unlimited' instead of the numeric value."* Update `08-UI-SPEC.md` Screen 9 balance display logic accordingly.

---

## Category BI — `lib/fareCalc.ts` Distance Source Inconsistency (1 issue)

**BI-01 [LOGIC]** `02-ARCHITECTURE.md` ride request lifecycle says `lib/fareCalc.ts` uses "Google Maps **Directions** API" for distance. `02-ARCHITECTURE.md` `rides.eta_minutes` says ETA uses "Google Maps **Distance Matrix** API." These are two different Google Maps APIs:
- Directions API: returns turn-by-turn directions + distance
- Distance Matrix API: returns distance/time between origins and destinations  
The fare distance and the ETA are calculated using two different APIs. This is fine and intentional (Directions for route accuracy, Distance Matrix for bulk ETA). But the API spec and architecture should make this distinction explicit.  
- **Fix:** Add a note in `02-ARCHITECTURE.md` and `05-DATA-MODEL.md` (rides table `eta_minutes` field): *"Distance for fare: Google Maps Directions API (more accurate route). ETA for `rides.eta_minutes`: Google Maps Distance Matrix API (faster, no route details needed). Both use `GOOGLE_MAPS_SERVER_API_KEY`."*

---

## Category BJ — `POST /api/auth/verify-token` Response Asymmetry (1 issue)

**BJ-01 [API]** `06-API.md POST /api/auth/verify-token` returns two asymmetric shapes:
- Existing user: `{ "user_id": "uuid", "role": "rider|driver|admin", "exists": true }`  
- New user: `{ "exists": false }`  

These two shapes have different keys. A TypeScript client would need a type guard: `if (response.exists) { /* use user_id and role */ }`. This is valid but worth documenting as intentional.  
- **Fix:** Add a comment: *"Discriminated union response: check `exists` field first. If `false`, all other fields are absent. If `true`, `user_id` and `role` are always present."* Consider whether to add `"user_id": null, "role": null` to the `exists=false` shape for consistent field presence.

---

## Category BK — `17-MONITORING.md` Missing Alert for Zero-Active-Pricing (1 issue)

**BK-01 [LOGIC]** If `seed-pricing.js` was never run or pricing was accidentally deactivated, all `POST /api/ride/request` calls would return 404 (`No active zone or pricing config for requested vehicle_type`). There is no monitoring alert for "pricing rows missing or all inactive."  
- **Fix:** Add to `17-MONITORING.md` stale rides and stuck states table: *"Active pricing rows count | 8 (one per vehicle type) | < 8 for > 5 min | P2 | Pricing config missing. Run seed-pricing.js or re-activate via admin panel."*

---

## Category BL — Missing `video` Media Type in EXPO_PUBLIC_SUPPORT_PHONE (1 issue)

**BL-01 [ENV]** `11-ENV-VARS.md` `EXPO_PUBLIC_SUPPORT_PHONE` description: *"Support phone number displayed on payment failure, suspension, and help screens (E.164 format)."* But `08-UI-SPEC.md` Screen 15 and `07-USER-FLOWS.md` Flow 2 Error States both reference `EXPO_PUBLIC_SUPPORT_PHONE`. `07-USER-FLOWS.md` says: *"Show support phone number: `EXPO_PUBLIC_SUPPORT_PHONE`."* The env var exists in the Expo app client variables section. No issue with the var itself, but it's referenced using `{EXPO_PUBLIC_SUPPORT_PHONE}` as if it's a template literal in the user flow text.  
- **Fix:** Minor. Clarify in `07-USER-FLOWS.md`: *"Display the value of `process.env.EXPO_PUBLIC_SUPPORT_PHONE` as a tappable phone link."*

---

## Category BM — `03-TECH-STACK.md` `@turf/turf` Version and Tree-Shaking (1 issue)

**BM-01 [BUILD]** `03-TECH-STACK.md` lists `@turf/turf ^6.5.0` and says: *"minimal footprint when tree-shaken."* But `@turf/turf` version `^6.5.0` is a monolithic bundle. The tree-shaken individual packages (e.g., `@turf/kinks`, `@turf/area`) are in `@turf/turf` v7+ or as separate `@turf/*` packages. Version 6 does NOT tree-shake well — the full Turf.js bundle (>500KB) is included.  
- **Fix:** Either (a) upgrade to `@turf/turf ^7.x` (which supports proper tree-shaking), or (b) replace with individual packages: `@turf/kinks ^6.5.0` and `@turf/area ^6.5.0`. Update `03-TECH-STACK.md` accordingly. Since the ADR says this is server-side only (`POST /api/admin/zone`), bundle size matters less — but the "tree-shaken" claim should be accurate.

---

## Category BN — `09-UX-SPEC.md` Alternatives Must Be Automatic vs. `allow_downgrade` Flag (1 issue)

**BN-01 [LOGIC]** `09-UX-SPEC.md` says: *"Alternatives must be automatic. When no drivers of the rider's chosen vehicle type are available, the system must automatically suggest alternatives without requiring the rider to go back."* But `01-PRD.md` req 47 says: *"Auto-downgrade requires explicit rider consent via an `allow_downgrade` flag (default false)."* And `06-API.md` confirms: `allow_downgrade: boolean, no, Default false`.  
- **Contradiction:** UX says "automatic," PRD says "requires explicit consent (`allow_downgrade=true`)."  
- **Fix:** Reconcile. The `allow_downgrade` flag in the FIRST request body is the consent mechanism. If the flag is false (default), alternatives are NOT shown. If true, they ARE shown automatically when no drivers are found. Update `09-UX-SPEC.md`: *"Alternatives are shown automatically ONLY when `allow_downgrade=true` in the original ride request. The rider's explicit action of enabling this flag (e.g., by tapping 'I'm flexible with vehicle type' before requesting) constitutes consent."*

---

## Category BO — `compensationWorker` and `activateSubscription` Double-Processing Risk (1 issue)

**BO-01 [LOGIC]** `compensationWorker.ts` polls `compensation_queue` and calls `activateSubscription()`. The admin endpoint `POST /api/admin/payment-event/:id/recover` also calls `activateSubscription()`. If both trigger simultaneously for the same `payment_event_id`, `activateSubscription()` must be idempotent. The data model has a unique partial index on `subscriptions(driver_id) WHERE status='active'` which prevents two active subscriptions. But does `activateSubscription()` explicitly check for an already-existing subscription before inserting?  
- **Fix:** Add to `02-ARCHITECTURE.md` or `12-FOLDER-STRUCTURE.md` `lib/activateSubscription.ts` description: *"Idempotency check: at the start of the transaction, read `payment_events.subscription_id`. If already non-null (activation already completed), return early without throwing. This prevents double-activation from concurrent compensationWorker and admin recovery calls."*

---

## Category BP — `19-GLOSSARY.md` Uses "Token" for Calls in One Place (1 issue)

**BP-01 [DOC]** `19-GLOSSARY.md` Avoid table says: *"Token (for calls) → use Call."* But the `used_challenges` table stores `jti` (JWT token identifier). The word "token" IS used for authentication tokens (Firebase ID token, challenge_jwt). The glossary entry should clarify: *"Token (for calls) → use Call. 'Token' is acceptable when referring to authentication tokens (Firebase ID token, challenge JWT, etc.)."*  
- **Fix:** Update the avoid entry to: *"Avoid: 'Token' when referring to the call balance unit. Use: 'Call'. Exception: 'token' is correct for authentication tokens (Firebase ID token, JWT)."*

---

## Category BQ — Missing `driver_status: 'temporary'` in Toggle-Online Rule (1 issue)

**BQ-01 [UI]** `09-UX-SPEC.md` Driver status-gated UI table:
- `temporary | Enabled | Shown | Enabled`

`08-UI-SPEC.md` Screen 6 says: *"Toggle online is DISABLED until `status` IN ('temporary', 'active') and `calls_remaining > 0`."* These are consistent. But `06-API.md POST /api/driver/status` pre-conditions say: *"status IN ('active','temporary') + active subscription + `calls_remaining > 0`."* These three docs align. Good — no fix needed, just confirming consistency.

---

## Category BR — Summary Inconsistencies in Structured Data (4 issues)

**BR-01 [SCHEMA]** `05-DATA-MODEL.md` `vehicles.old_vehicle_type varchar(25)` and `vehicles.new_vehicle_type varchar(25)` in `vehicle_type_changes`. But all other vehicle_type columns use `varchar(20)` (in drivers, vehicles, pricing, dispatch_offers, rides). The longest enum value is `BIKE_STANDARD` at 13 chars. `varchar(25)` vs `varchar(20)` for the same enum is an inconsistency.  
- **Fix:** Change `vehicle_type_changes.old_vehicle_type` and `new_vehicle_type` to `varchar(20)` to match all other vehicle_type columns.

**BR-02 [SCHEMA]** `05-DATA-MODEL.md` `owner_consents.is_legacy_operator` is described as "Does the owner have prior Uber/Pathao affiliation?" — but the legacy operator concept applies to DRIVERS (drivers who previously worked for Uber/Pathao). This is doubly wrong (semantic misattribution AND redundancy with `drivers.is_legacy_operator`). Fix M-01 covers this, but the semantic error should also be noted.

**BR-03 [SCHEMA]** `05-DATA-MODEL.md` `vehicles.type_change_effective_at timestamptz no NULL` — described as "When a driver-initiated type change becomes effective (created_at + 7 days cooling-off). NULL if no pending type change." But `vehicle_type_changes.effective_at` stores the same information. When the cooling-off completes and the scheduler applies the change, which column is authoritative for reading? The scheduler uses `vehicle_type_changes WHERE status='cooling_off' AND effective_at < now()`. The `vehicles.type_change_effective_at` is used by dispatch to know the change is pending. These serve different purposes — but they must stay synchronized.  
- **Fix:** Add: *"Invariant: for any vehicle with a pending type change: `vehicles.type_change_effective_at = vehicle_type_changes.effective_at` (for the most recent cooling_off row for this vehicle's driver). These are set together in `POST /api/admin/driver/type-change-approve`."*

**BR-04 [DOC]** `07-USER-FLOWS.md` Flow 7 Alternate Path table: *"Driver suspended during cooling-off | Type change cancelled. `status='rejected'`."* But should a suspended driver's pending type change be cancelled or kept? If the suspension is temporary, the driver might be reinstated and want the type change to proceed. Automatically rejecting it on suspension seems overly aggressive.  
- **Fix:** Change to: *"Driver suspended during cooling-off | Type change paused (status remains 'cooling_off'). `effective_at` is extended by the duration of the suspension. Admin may manually reject the type change during the suspension review."*

---

## Category BS — `10-DEV-SETUP.md` Missing Firebase Config Steps (2 issues)

**BS-01 [BUILD]** `10-DEV-SETUP.md` step 6 sets `hmac.secret` in the Functions config but omits the `functions_jwt_secret` (or `jwt.secret` after AB-01 fix). Without this, `checkAuth` cannot mint `challenge_jwt` and `POST /api/register` cannot verify it.  
- **Fix:** Add to step 6: `firebase functions:config:set jwt.secret="your-dev-jwt-secret-here"` and add the corresponding entry to `.runtimeconfig.json`.

**BS-02 [BUILD]** `10-DEV-SETUP.md` step 7 says *"fill in required values."* But the env var `FUNCTIONS_JWT_SECRET` (Expo server-side) is not in the "Minimum to fill for local dev" list. It is required for `POST /api/register` to work.  
- **Fix:** Add `FUNCTIONS_JWT_SECRET` to the minimum local dev env vars list in step 7, with note: *"Must match `jwt.secret` in `functions/.runtimeconfig.json`."*

---

## Category BT — `09-UX-SPEC.md` Font Loading Timing Risk (1 issue)

**BT-01 [UI]** `09-UX-SPEC.md` says: *"Font stack: `'Noto Sans Bengali', 'Hind Siliguri', system-ui, sans-serif`. Preload Noto Sans Bengali via `expo-font` in `app/_layout.tsx` before rendering any screen."* But `app/_layout.tsx` is a GlideX file being kept (KEEP category in `02-ARCHITECTURE.md`). The instruction to modify `_layout.tsx` to preload fonts is not in the `12-FOLDER-STRUCTURE.md` changes list. This modification would be missed during implementation.  
- **Fix:** Add to `12-FOLDER-STRUCTURE.md` "GlideX files to REPLACE" section (or a new "GlideX files to MODIFY" section): `app/_layout.tsx — ADD: expo-font preload for Noto Sans Bengali. ADD: min_app_version check via GET /api/app-config on launch.`

---

## Category BU — `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` Not Used in Flow (1 issue)

**BU-01 [ENV]** `11-ENV-VARS.md` client-exposed variables includes `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`. This is a standard Firebase config variable. In the Ride auth flow, `signInWithCustomToken` is used (not email/password or Google sign-in). `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` is typically used for OAuth redirect flows, which are not part of the Ride auth flow. It may still be needed for Firebase SDK initialization, but its purpose in Ride-specific flows should be documented.  
- **Fix:** Add a note: *"Required for Firebase SDK initialization (standard config). Not used in the HMAC phone auth flow directly, but must be set for Firebase to initialize correctly."*

---

## Category BV — `scripts/check-temporary-expiry.js` Referenced but Not Documented Properly (1 issue)

**BV-01 [BUILD]** `12-FOLDER-STRUCTURE.md` lists `scripts/check-temporary-expiry.js ← One-off: manually trigger temporary activation expiry check (dev/staging)`. But `16-INCIDENT-RESPONSE.md` P3 incident (Pro-rata credit job) says: *"node scripts/check-temporary-expiry.js --mode pro-rata --date YYYY-MM-DD."* This uses CLI flags that are not documented in `12-FOLDER-STRUCTURE.md`.  
- **Fix:** Update `12-FOLDER-STRUCTURE.md` to: *"`check-temporary-expiry.js ← CLI tool for manual scheduler triggers. Flags: `--mode` ('expiry', 'pro-rata', 'consent-deadline'), `--date` (ISO-8601, defaults to now), `--driver-id` (optional, target specific driver)."*

---

*End of Ride Planning Docs Consistency Audit Round 2.*
*Total: 255 issues across 44 categories.*
