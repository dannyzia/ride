# Plan 05 v2.1 — Authoritative Implementation Plan

**Purpose.** This is the final implementation plan and Kilo Code hand-off for Plan 05. It adjudicates the master plan, Terra execution plan, and three audits against the current repository. It replaces neither the product requirements in `01 05 Supporting Features v2.md` nor AGENTS.md hard rules; it corrects stale paths, endpoint names, and build-versus-extend decisions.

## 1. Final decision

Implement the master-plan scope in five waves plus the Zone Foundation track. Preserve Terra's dependency architecture, but begin with a short repository-reconciliation gate and extend working code rather than duplicating it.

The Zone Foundation remains a hard gate before Wave 4. W1 cancellation API precedes cancellation UI. The schedule backend and scheduler are extensions of existing code, not greenfield replacements. The universal authenticated `/api/sos/alert` is the SOS API for both riders and drivers; do **not** create the master plan's nonexistent `/api/driver/sos-alert`.

Rejected alternatives:

- Do not create `components/plan03/`, `/api/driver/heatmap`, or a second SOS alert route.
- Do not retain the zone fallback/sentinel semantics or use client-side cancellation math.
- Do not add a state store, a charts package, geohash, insurance/withdrawal/referral work, or unrelated refactors.

## 2. Requirement checklist

| Master-plan requirement | Final location / approach | Status |
|---|---|---|
| Wave 0: dependencies, tokens, Pattern A, i18n, `track` auth exemption, time helpers, flags, G-1 baseline | Existing root layout, `theme/goRide.ts`, `lib/time.ts`, `i18n/`, config route; verify first | Implement / verify |
| S1–S3 shared states | Extend flat `components/ErrorBanner.tsx` and `OfflineIndicator.tsx`; reuse flat `components/EmptyState.tsx` | Extend / reuse |
| S4 scheduling control | Existing `SchedulePicker` fails the date, 7-day, +30-min, and Dhaka requirements; create `components/ScheduleRideSheet.tsx` only after preserving/assessing existing uses | Build, justified |
| S5–S8 SOS button, i18n, legal screens | Keep universal SOS endpoint; extend the screen flow; legal placeholder module + four screen consumers remains blocked on approved copy | Extend / blocked only for release copy |
| R1–R2 schedule booking and scheduled confirmation | `confirm-ride`, schedule API, scheduler, `ride-scheduled`; server quote contract and flags | Implement |
| R3–R4 cancellation | Extend `cancel-preview` and cancellation transaction, then bind UI only to server values | Implement |
| R5 promos and R9 pass precedence | `apply-promos`, rider store, home booking flow, `lib/discountEngine.ts`; direct home redeem removed | Implement |
| R6 SOS; R7 lost items; R8 disputes; R10 tracking; R11 scheduled detail | Existing routes/screens, with SOS lifecycle routes and tracking hardening added | Implement / verify as specified |
| D1–D12 driver features | Existing driver screens plus new `min-rate` and `payout-methods`; only after Zone Gate | Implement |
| Backend §8.1–§8.20 | Extend existing matching APIs; use `hotspots+api.ts` as §8.5's canonical target | Implement / verify |
| Scheduler §9 | Extend `utils-server/scheduler.ts`; retain its dispatch tick and 15-minute reminder, add missing catch-up/cutoff/configurable reminders after data-model verification | Extend |
| Z-1…Z-8 multi-zone foundation | One index-only migration, resolver/callers/heartbeat/admin/hygiene/forecast operations | Implement; Wave-4 blocker |
| §11 safeguards | Transactional cancellation/payment ownership, SOS isolation, map source hygiene, promo/pass precedence, vehicle/subscription rule | Mandatory |
| §12 lifecycles | Scheduled rides, SOS, disputes, lost items, booking-for-other, tracking expiry, cancellation races | Mandatory |
| §13–§14 deep links, flags, monitoring, rollback, seed QA, retention policy | Root layout/tracking page, `platform_config`, logger, scripts/runbook | Implement; legal copy remains blocked |
| §16 tests / greps / type / lint | Targeted Jest plus listed mechanical gates and both package type checks | Mandatory |
| §17 exclusions | No insurance rebuild, instant pay/history work, referral links, missed-requests screen, chart package, new stores, geohash | Preserve |

## 3. Resolved review findings

| Issue | Gemini | Claude | Qwen Max | Qwen Code | Final decision |
|---|---|---|---|---|---|
| Scheduler status | Existing base; extend | Incomplete | Extend | Existing dispatch and one reminder | Extend the existing 30-second dispatcher and reminder job; add only missing contractual behavior. |
| Shared components | Verify reuse | Existing | Existing flat paths | Existing, flat | Extend `ErrorBanner`/`OfflineIndicator`; reuse `EmptyState`, `StatusBadge`, `SettingsRow`, and `TransactionRow` from `components/`. |
| SOS alert route | Existing partial | Existing partial | Existing partial | Existing partial | Extend `/api/sos/alert`; create only `active` and `resolve`; do not replace its auth/ride-ownership checks. |
| Driver SOS endpoint | Not assessed | Claimed existing | Likely absent | Absent | Universal `/api/sos/alert` is the supported route. Verify driver ride context and screen integration; do not add a driver-only API without a separate product decision. |
| Driver hotspot API | Not assessed | Not assessed | `hotspots` exists | `hotspots` exists | Extend `/api/driver/hotspots`; prohibit a new `heatmap` route. |
| Zone Foundation | Not started | Not started | Not started | Single-zone code/index confirmed | Treat Z-1…Z-8 as unimplemented; it is a hard gate before Wave 4. |
| Cancellation preview | Must extend | Missing required fields | Must extend | Missing required fields | Add the full locked server contract before UI work. |
| Store resets | Not assessed | Absent | Unowned | Said unowned | Current `lib/authCleanup.ts` already clears all seven stores (some use `clear` instead of `reset`). Verify all call sites invoke it; do not redesign stores just to rename methods. |
| Driver payout/legacy routes | Contradictory audit claim | Claimed present | Claimed absent | Absent | Current tree has no driver UI payout routes. Build D10 in Wave 4. Do not delete unrelated legacy routes without provenance evidence. |

## 4. Repository facts that govern the work

- Components are flat under `components/`; `components/plan03/` does not exist.
- `ErrorBanner`, `OfflineIndicator`, `EmptyState`, `SchedulePicker`, `SOSButton`, and `MinRateSlider` already exist. `ErrorBanner` lacks the required type/accessibility contract and `OfflineIndicator` does not yet meet the specified token/animation contract.
- `SchedulePicker` only supplies device-clock presets (including Now/+15); it is not the required Dhaka date-and-time sheet.
- `cancel-preview` currently returns only `fee_bdt` and `reason`.
- `/api/sos/alert` already validates auth/role/ride ownership and persists an alert, but currently uses `open` status and lacks SMS, push, cooldown, required response fields, `active`, and `resolve`.
- `/api/sos/contacts` is a public system-config phone list, not the user's emergency-contact table. `/api/user/emergency-contacts` owns `user_emergency_contacts`; the SOS sender must use that table.
- `lib/dprelay.ts` has generic `sendSms`; it has no circuit breaker. Its SOS limiter must be scoped to SOS so OTP traffic remains unaffected.
- `utils-server/scheduler.ts` already has scheduled dispatch and a 15-minute reminder. It does not establish all required catch-up/cutoff/SOS-auto-resolution behavior.
- Current zone logic is singular (`getActiveZone`) and writes/uses a Bangladesh fallback/sentinel. `zones_one_active` remains in migrations; `demand_forecasts` lacks the required composite uniqueness index.
- `app/api/driver/hotspots+api.ts` exists; `/api/driver/heatmap` does not.
- `app/api/ride/schedule+api.ts` already has a transaction/advisory lock but incorrectly writes the nil zone UUID, permits only one scheduled ride instead of the required overlap rule, lacks the response/quote contract, and has no book-for-other SMS rate limit.
- `lib/authCleanup.ts` is the existing logout cleanup seam. `scripts/seed-pricing.js` exists.

## 5. Dependency graph

```text
Preflight reconciliation
        ↓
Wave 0 foundation
        ├── W1 cancellation API → cancellation UI
        ├── W1 schedule API → scheduler extension → schedule UI/screens → G-1 deletion
        ├── W1 promos/pass/book-for-other/store checks
        ├── W2 SOS contract → SOS UI; lost items/dispute
        ├── W3 pass/tracking verification and hardening
        └── Z-1 → Z-2/Z-3 → Z-4 → Z-5 → Z-7 → Z-6 → Zone Gate
                                                                  ↓
                                                             Wave 4 driver
                                                                  ↓
                                                       Wave 5 integration/release
```

After Wave 0, W1, W2, W3, and the Zone track may run in parallel only where the arrows permit it. Within W1, APIs and the exact quote/preview contracts precede their UI consumers. No Wave 4 feature, including vehicles, hotspots, payout methods, or minimum rate, is accepted before the Zone Gate passes.

## 6. Final implementation plan

### Phase 0 — reconciliation and foundation

**Objective:** turn stale FACT/NEW labels into exact targets and establish cross-cutting contracts.

**Files:** flat shared components, `theme/goRide.ts`, `lib/time.ts`, `i18n/locales/{en,bn}/common.json`, root `_layout.tsx`, config API, `app/track/[rideId].tsx`, package manifest, and `lib/notify.ts`.

**Implementation:**

1. Record the corrected target map in the implementation PR: flat components; extend `sos/alert`; extend `driver/hotspots`; no driver-only SOS route. Inspect existing imports before changing a component or route.
2. Verify/install the SDK-compatible date picker, slider, and NetInfo; use a development build if native dependencies change. Verify tokens before adding only missing `amberLight`, `successLight`, and `infoLight`.
3. Extend the existing error/offline components to the locked contracts; do not duplicate them. Use tokens, `accessibilityRole="alert"`, cleanup, and the defined retry/type behavior.
4. Add `toUtcIso`, `dhakaTodayKey`, and `msUntil`; add only screen keys as each screen lands. Add flags to `platform_config` and identify the existing public read endpoint before client wiring.
5. Exempt public `track` from auth, validate cold/warm links after auth resolves, and make tracking terminal-state/no-store/noindex behavior a real implementation task.
6. Audit G-1 references but delete no route yet. Confirm `authCleanup()` is invoked by every sign-out path and that persisted Plan-05 state is user-scoped.

**Verification:** root and utils-server type checks, lint, a focused test/import check for shared components, and G-1 baseline recorded.

### Phase 1 — rider booking, cancellation, and scheduling

**Objective:** deliver server-authoritative cancellation and a complete scheduled-ride lifecycle.

**Files:** `lib/cancellation.ts`, cancel preview/cancel routes, `lib/paymentEvents.ts`, `app/api/ride/schedule+api.ts`, estimate/quote route, `utils-server/scheduler.ts`, confirm/scheduled/cancel/promos/detail screens, `store/useRiderStore.ts`, customer home, and `lib/discountEngine.ts`.

**Implementation:**

1. Extend cancel preview first. Return exactly `fee_bdt`, `free_until`, `server_now`, `policy`, `ride_status`, and `reason_required`; calculate from fresh `platform_config`. The cancel POST must use the atomic status guard and send all cancel-fee/no-show payment events only through `lib/paymentEvents.ts` within the transaction. Bind UI countdowns to `server_now`, never device policy math; re-fetch on 409.
2. Reconcile the estimate contract before UI: attach `quote_valid_until` (five minutes) to the authoritative fare estimate and silently re-estimate expired quotes with visible refreshed fare. Do not invent a second estimate service.
3. Extend the schedule route, retaining the existing transaction/advisory-lock seam. Replace nil zone fallback with Z-2 resolution, enforce UTC +30m/+7d, required overlap semantics, and its specified response. Add server validation for book-for-other phone/consent/self-phone and a DB-backed 5/hour SMS limit; SMS failure is non-blocking.
4. Extend, never replace, scheduler dispatch. Add safe catch-up, promotion, cutoff cancellation, notifications, auto-redispatch on driver cancellation, and SOS auto-resolution. Keep each periodic query bounded and index-backed. The required 60/15 reminder persistence must be implemented only after confirming an existing durable notification-idempotency mechanism; if none exists, stop and resolve the master plan's one-index-only-migration constraint before adding schema.
5. Build R1/R2/R11 around the final contracts. Create `ScheduleRideSheet` because the existing picker cannot meet them. Add R3/R4 server-bound behavior. Remove DEL-1…4 only after G-1 is zero.
6. Implement R5: redeem solely on Apply Promos, stage a validated promo, make the selector consume staged state, remove the home direct redeem, and apply the locked pass-first discount behavior. Fix the scheduled-rides filter if source inspection confirms it; preserve current reset behavior.

**Verification:** tests for preview policy/countdown contract, atomic cancellation race, payment writer ownership, schedule overlap/advisory lock, timezone bounds, catch-up/cutoff and reminder idempotency; manual schedule-to-dispatch-to-cancel lifecycle.

### Phase 2 — rider safety and support

**Objective:** make SOS safety-complete without weakening existing auth/ownership behavior.

**Files:** `app/api/sos/{alert,active,resolve}+api.ts`, `lib/dprelay.ts`, `lib/notify.ts`, `utils-server/scheduler.ts`, emergency SOS screen, `SOSButton`, lost-item/dispute screens and APIs.

**Implementation:**

1. Preserve alert auth, role, and ride checks. Use `user_emergency_contacts`, not public SOS system contacts, for notification recipients. Migrate `open` semantics to the specified lifecycle only after verifying existing admin/safety consumers and updating them together.
2. Add 15-minute user cooldown, 201 response, push, best-effort SMS plus one retry, and a **SOS-only** hourly circuit breaker. Alert insertion succeeds even when SMS/push fails; log locked codes. Add `active` and creator-only `resolve`; scheduler resolves after 30 minutes.
3. Rebuild R6 with confirm/double-submit protection, location best effort, 999 dial regardless of failure, user-scoped offline retry, 10-second polling, and cleanup. Keep `SOSButton` dial-first/universal-alert behavior, adjusting only gaps exposed by the new contract.
4. Enforce lost-item enum/24-hour window, verify 48-hour dispute window and status badge, and retain existing admin/chat flows.

**Verification:** permission denied/offline SOS still dials 999; SMS failure leaves a persisted 201 alert; cooldown, ownership, active/resolve, retry, admin visibility, and cleanup tests pass.

### Phase 3 — verification plus required hardening

**Objective:** complete the narrow shared rider requirements without scope expansion.

**Implementation:** verify active rider passes against `/api/rider/passes` only; verify canonical call-ledger missed tab; implement public tracking terminal expiry plus no-store/noindex headers; validate cold/warm/unauthenticated deep links; enforce book-for-other server guards if not completed in Phase 1. Do not rebuild insurance or add a missed-requests screen.

**Verification:** pass/catalog separation, terminal tracking expiry, malformed-link safe landing, and booking-for-other limits/consent.

### Phase Z — Zone Foundation (hard gate)

**Objective:** replace single-zone semantics safely before driver feature work.

**Files:** new generated migration after `0041`, `lib/zone.ts`, all estimate/request/schedule callers, heartbeat, admin zones API/UI, `scripts/zone-hygiene.ts`, a new focused forecast module or a clearly bounded scheduler extension, `scripts/seed-pricing.js` header.

**Order and safeguards:**

1. Z-1: drop `zones_one_active`; add active-zone, unique `(zone_id, forecast_hour)`, and `(rides.zone_id, created_at)` indexes. Include exact rollback SQL in the migration comment.
2. Z-2/Z-3: add cached, invalidatable multi-zone `getZoneForLocation`; normalize polygons once and use smallest polygon first. Return `503 zones_not_configured` for zero zones and `422 outside_zone` otherwise; remove nil/fallback writes at request, estimate, and schedule sites.
3. Z-4: resolve driver zones from heartbeat coordinates with three-consecutive-heartbeat hysteresis and 10-minute force refresh.
4. Z-5: permit multiple active zones, validate polygons, invalidate resolver cache, flag-gate the change, and make the smallest necessary admin UI/API accommodation.
5. Z-7 before Z-6: run batched, low-traffic hygiene; then write hourly Dhaka-time forecast upserts, cold-start fallback, 14-day prune, timeout and alerting. Document per-zone pricing seed operation (Z-8).

**Zone Gate:** two active zones, outside both=422, zero zones=503, no sentinel writes, stable heartbeat boundary behavior, forecasts/hotspots, P&L/lifecycle Jobs 19/26/27, migration rollback, and both package checks must pass before Wave 4.

### Phase 4 — driver features

**Objective:** implement D1–D12 against the final zone and API contracts.

**Files:** find-customer/customer-navigation/no-show/hotspot/performance/incentives/earning/vehicle/settings/subscription screens; new `min-rate` and `payout-methods` screens; `hotspots+api.ts`, earnings/payout/vehicle APIs, `MinRateSlider`, flat shared rows/badges, `DriverStatsBar`.

**Implementation:** make all touched driver UI light-first/accessibility compliant. Add booked-for call split/no-show entry; hotspot pill and map source hygiene; performance bars (SVG, ≤30); incentives auth/credit copy; goal persistence keyed by user; vehicle type transactional checks, auto-offline, document/subscription eligibility and G-2 deletion; D9 reusing `MinRateSlider` plus `validateDriverMinKm`; D10 bKash-only GET/POST validation; package/PortPos copy and settings entries. Search for every retry handler and fix stale refetch closures, not a guessed list of screens.

**Verification:** named entry for each screen, min-rate/payout/vehicle validation, no-show behavior, 50-circle map limit, retry refetch, and daylight/accessibility screenshots.

### Phase 5 — integration and release

**Implementation:** complete i18n sweep, legal placeholder wiring (do not claim release-ready without supplied copy), `seed-qa.ts`, manual matrix, flag/rollback/log review, and native-build validation if dependencies changed.

**Verification:** full suite, manual matrix from the master plan, root + utils-server types, lint, grep gates, and deploy order migration → utils-server → EAS.

## 7. Testing and acceptance criteria

- Add targeted Jest coverage for cancellation race/payment ownership, scheduled overlap and bounds, scheduler catch-up/cutoff/reminder idempotency, SOS persistence despite delivery failures, SOS cooldown/ownership, zone resolution/hysteresis/forecast upsert, and promo/pass precedence.
- Manually test the master-plan matrix: scheduling lifecycle and every cancel status; no location/network SOS; promo+pass; book-for-other; deep links; hotspots empty/data; min rate and payout input.
- Completion requires every R/D/S item reachable by its named entry, API body/UUID/auth rules, integer paisa, Dhaka display/UTC transport, no client cancellation policy math, correct write ownership, and no unapproved scope.

## 8. Regression checklist

- Preserve Expo managed workflow, two-package type boundaries, Supabase auth, PortPos payment ownership, WebSocket dispatch invariants, H3-only imports, platform-config fresh reads, and existing admin flows.
- Preserve existing SOS alert authentication/ride ownership and dial-first behavior while extending delivery/lifecycle.
- Preserve existing scheduler jobs and notification behavior; do not replace the scheduler wholesale.
- Preserve existing store-clear semantics and legacy routes unless their deletion gate/provenance has been verified.

## 9. Coding-agent instructions

Inspect before modifying; reuse before creating; use the exact targets above. Apply AGENTS.md rules: Zod/`parseJsonBody`, flat Expo params, `requireRole`/token verification, snake_case Drizzle, transactions and write ownership, integer paisa, `logger`, no `any`, and cleanup. Work one dependency phase at a time, run focused tests after each backend phase, and stop for inspection when a stated plan constraint conflicts with the actual schema or an existing consumer. Do not make unrelated changes, do not delete a route before its grep gate, and do not begin Wave 4 before the Zone Gate.

## 10. Final Kilo Code prompt

```text
Implement Plan 05 Supporting Features using this authoritative sequence.

First inspect the exact files named in the plan and preserve the repository's existing architecture. This is an Expo managed app with separate utils-server package. Follow AGENTS.md hard rules without exception: Supabase auth, Zod + parseJsonBody, flat Expo dynamic params, integer paisa, snake_case Drizzle, transactions/write ownership, no console.log/any, H3 wrappers only, fresh platform_config reads, resource cleanup, and legacy npm lint command.

Repository corrections are binding: components are flat (never create components/plan03); extend existing ErrorBanner, OfflineIndicator, SOSButton, SchedulePicker, MinRateSlider, cancel-preview, sos/alert, scheduler, and driver/hotspots. Create only sos/active, sos/resolve, ScheduleRideSheet, min-rate screen, payout-methods screen, migration M1, zone-hygiene, seed-qa, and other explicitly greenfield targets. Use /api/driver/hotspots, never create /api/driver/heatmap. Use universal /api/sos/alert for rider and driver; do not invent /api/driver/sos-alert.

Execute: (0) reconciliation/foundation; (1) cancellation API then scheduling API/scheduler then dependent rider UI/promos; (2) SOS backend then SOS UI/support; (3) tracking/deep-link/pass verification and required hardening; (Z) Z-1→Z-2/Z-3→Z-4→Z-5→Z-7→Z-6 and pass Zone Gate; (4) driver features; (5) release integration. APIs precede their UI consumers. Wave 4 is prohibited until Zone Gate passes. Delete legacy schedule or active-vehicle routes only after their respective grep gates return zero external references.

Implement all product details in master Plan 05 §4–§16: server-bound cancellation preview/countdown; scheduled ride lifecycle with quote validity, locking, overlap protection, catch-up/cutoff, notifications and Dhaka time; promo/pass precedence; book-for-other validation/rate limits; SOS persistence/dial-first/offline behavior/cooldown/SMS+push failure isolation; multi-zone safety; driver accessibility and UI requirements; tracking expiry/no-store/noindex; flags, monitoring, seed QA, and rollback documentation. For SOS, use user_emergency_contacts, not the public system SOS contacts list; make the SMS breaker SOS-scoped so OTP remains available.

Add focused tests for all race/safety/zone changes. After each phase resolve type and lint failures; at the end run root tsc, utils-server tsc, npm run lint, relevant Jest tests, all Plan-05 grep gates, and the manual acceptance matrix. Do not add excluded insurance, withdrawal, referral, geohash, chart-library, missed-requests-screen, or new-store work.
```

## 11. Definition of done

- [ ] Every requirement row above is implemented or explicitly verified; legal copy alone is marked blocked until owner text arrives.
- [ ] No duplicate component or endpoint was created; all stale path/name corrections were honored.
- [ ] Cancellation, scheduling, SOS, and zone tests pass, including failure and race cases.
- [ ] Zone Gate passes before driver work is accepted.
- [ ] All R1–R11/D1–D12/S1–S8 scope is reachable, accessible, and uses required states.
- [ ] All tests, types, lint, grep gates, seed/manual QA, logs/flags/rollback checks pass.
- [ ] No excluded feature or unrelated refactor is included.
