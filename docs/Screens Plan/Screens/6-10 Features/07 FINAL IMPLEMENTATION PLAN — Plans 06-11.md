# Final Implementation Plan — Plans 06–11

**Decision date:** 2026-08-21  
**Authority:** Master requirements reconciled against `06 Qwen Coder Response.md` direct repository verification. The Gemini input was empty.  
**Scope:** Driver-app Plans 06–10 plus Plan 11 content/i18n, using the current Ride architecture and rules in `AGENTS.md`.

## 1. Final decision

Complete and repair the existing Ride driver implementation in place. Do not recreate working routes, payment flows, guard logic, or storage/i18n foundations merely because the master plan proposes different paths.

Final architectural choices:

1. **Driver navigation:** replace the hidden native tab bar with the specified visible, five-tab native layout: Home, Earnings, Activity, Wallet, Profile. Settings remains a push destination from Profile/FloatingNavMenu; it is not a sixth tab. Keep the root `DriverStatusGuard`; do not wrap it a second time inside the tab layout.
2. **Driver status:** retain `components/auth/DriverStatusGuard.tsx` and add only the missing UX behavior: 30-second polling while blocked, dynamic rejection reason, and Check Status navigation. It already enforces access at the driver root layout.
3. **Vehicle model:** the repository’s eight-value `lib/vehicleTypes.ts` enum is canonical. All vehicle/package UI and validation must use it; the master plan’s four generic labels are visual groupings only, never API or database values.
4. **Packages/subscriptions:** use the existing package architecture as the only monetization source of truth: `/api/package/list`, `/api/package/purchase`, `/api/package/active`, `subscriptions`, `call_ledger`, `PaymentWebView`, `lib/paymentEvents.ts`, and `lib/activateSubscription.ts`. Do not create parallel `/api/driver/subscription*` APIs. Subscription screens become views over the active call package and must not invent cancellation/refund semantics without a product rule.
5. **Wallet/payouts:** reuse the existing PortPos top-up endpoint and payout-method GET/POST. Add a transaction-read API only if the existing wallet response cannot meet the required pagination. Do not implement Instant Pay, payout-history writes, or cash withdrawal until Product supplies the funding source, payout provider, fee/limit policy, reversal/dispute policy, and accounting model. This is a hard implementation-time product gate, not an assertion that the feature is impossible.
6. **Vehicle activation:** repair canonical active-vehicle persistence/derivation before the UI. Preserve `/api/driver/vehicle-type-change` and its eligibility checks rather than adding a duplicate activation route unless source inspection proves it cannot activate a concrete vehicle correctly.
7. **Existing foundations:** extend `i18n/i18n.ts` and existing English/Bengali locale files; centralize legal content at the actual rider and driver settings paths; reuse existing components before adding the minimal missing component set.

Rejected alternatives: a second status guard, a sixth Settings tab, literal four-vehicle enum values, dedicated subscription endpoints, duplicate payout-method GET, duplicate wallet top-up, and an unbacked cash-withdrawal flow.

## 2. Requirement checklist

| Master requirement | Final location / approach | Status |
|---|---|---|
| Five visible driver tabs, 64px bar, wallet due badge | `app/(main)/(rider)/(tabs)/_layout.tsx`; five tabs only | Modify |
| Driver status states, polling, reason, actions | Existing `components/auth/DriverStatusGuard.tsx`, protected by parent layout | Modify |
| Storage registry and daily earnings goal | New `lib/storageKeys.ts`; Earnings tab uses integer paisa internally and displays taka | Build |
| Earnings overview, chart, refresh, empty/error states | Existing Earnings tab and daily/weekly APIs | Modify |
| Filterable, paginated driver trip activity | New `GET /api/driver/trips` plus existing Activity tab | Build |
| Wallet balance, due, active package, transactions, top-up | Existing Wallet, wallet/dues/package APIs, existing `wallet/topup+api.ts` | Modify |
| Withdraw / Instant Pay and payout history | Only after formal funding/payout-policy decision; see Gate P0-B | Product gate |
| Profile and Settings actions | Existing Profile/Settings routes; retain sign-out confirmation and settings persistence | Verify/modify |
| Add/manage/select vehicle, photo/document visibility | Existing vehicle screens and APIs, active-state fix first | Modify |
| Four generic vehicle groups in master plan | Render against eight `vehicleTypes.ts` values; no enum/schema downgrade | Resolved |
| Call packages and all subscription screens | Existing package purchase/active flow; screens read active package and reuse PaymentWebView | Modify |
| Cancellation action on subscription | Do not invent refunds/cancel policy; inspect product rule before exposing | Requires inspection |
| Call ledger, dues, missed requests | Existing flows; normalize UI/API only where required | Verify/modify |
| Earnings breakdown and commission statement | Existing screens/API; date/month selection, 12-month history, PDF only if backed by an existing generation/delivery mechanism | Modify / inspect PDF |
| Payout-method management | Existing `payout-method/index.tsx` and existing GET/POST endpoint | Verify/modify |
| Minimum-rate setting | Existing `min-rate/index.tsx`, `MinRateSlider`, `validateDriverMinKm()` | Verify/modify |
| Lost-item response actions | Existing root PATCH; map UI labels to `confirm`, `not_found`, `return_arranged` | Verify/modify |
| Contact support, emergency contacts, FAQ, safety, support hub, trip/report issue, chat, navigation, schedule, no-show | Extend existing routes; preserve shared/generic endpoints where role-safe | Modify / verify |
| Performance, incentives, ratings, referral, profile, hotspot | Verify existing features; fill explicit presentation/behavior gaps; H3 work precedes hotspot completion | Modify / verify |
| Terms, privacy, i18n persistence | `lib/legalContent.ts`, actual settings terms/privacy paths for rider and driver, existing `i18n/` | Build / modify |
| Notification routing, deep links, uploads, confirmations, skeletons, offline states | App root/navigation and shared components; follow existing patterns | Build / verify |
| Validation, auth, paisa, write ownership, test gates | All API/UI work follows `AGENTS.md` | Mandatory |

### 2A. Master screen and workflow traceability

This matrix is deliberately route-level. “Verify/modify” means inspect the current route first and preserve working behavior; it does **not** authorize replacing it with a master-plan path that does not exist in Ride.

| Plan | Master item | Repository target / final action | Delivery status |
|---|---|---|---|
| 06 | Tab layout | `(rider)/(tabs)/_layout.tsx`: visible native five-tab bar, no sixth Settings tab | Modify |
| 06 | Driver status guard | `components/auth/DriverStatusGuard.tsx` under the existing driver-root wrapper | Modify |
| 06 | Earnings tab and goal modal | `(tabs)/earning/index.tsx` plus `lib/storageKeys.ts` | Modify / build |
| 06 | Activity / trip history | `(tabs)/activity/index.tsx` plus `GET /api/driver/trips` if confirmed absent | Build |
| 06 | Wallet | `(tabs)/wallet/index.tsx`; reuse wallet, dues, package-active, and top-up paths | Modify |
| 06 | Profile | `(tabs)/profile/index.tsx`: preserve profile hub/sign-out and verify data fields | Verify / modify |
| 06 | Settings | `(tabs)/settings/index.tsx`: keep as a non-tab destination; persist toggles/preferences | Verify / modify |
| 07 | Add vehicle | `add-vehicle/index.tsx`: canonical 8 types, model selection, validation, existing upload path | Modify |
| 07 | Select active vehicle | `select-active-vehicle.tsx` plus existing vehicle-change implementation | Modify after active-state fix |
| 07 | Vehicle management | `vehicle-management/index.tsx` and `vehicles+api.ts` | Modify |
| 07 | Call packages | Existing `packages.tsx` and `/api/package/*` | Verify / modify |
| 07 | Plans, checkout, confirmation, details, renewal, active subscription | Existing subscription screens backed by package list/purchase/active; no duplicate API family | Modify |
| 08 | Call ledger and missed requests | Existing `call-ledger.tsx` and established read APIs | Verify / modify |
| 08 | Commission statement | Existing `commission-statement/index.tsx` and month-capable reader; PDF only when a real delivery path exists | Modify / inspect |
| 08 | Dues, earnings, earnings breakdown | Existing due/earnings/breakdown routes; parameterize date/month behavior | Modify |
| 08 | Payout method | Existing `payout-method/index.tsx` and existing GET/POST handler | Verify / modify |
| 08 | Payout history and Instant Pay | Do not create until P0-B has approved the economic/payout model | Blocked product gate |
| 08 | Minimum rate | Existing `min-rate/index.tsx` and `MinRateSlider`; use `validateDriverMinKm()` | Verify / modify |
| 08 | Driver lost items | Existing settings Lost Items UI and root PATCH; adapt action labels | Verify / modify |
| 09 | Contact support | Existing `contact-support/index.tsx`; extend the existing role-safe ticket contract only as needed | Modify |
| 09 | Emergency contacts | Existing shared contact API/UI; add server and client phone/count validation | Modify |
| 09 | FAQ | Existing `faq/index.tsx`; verify search/category/empty states against source content | Verify / modify |
| 09 | Safety and SOS | Existing `safety/index.tsx`, `SOSButton`, alert route; test cooldown/state/retry | Verify / modify |
| 09 | Support hub, trip issue, report issue | Existing support/in-ride issue routes; inventory then complete missing wiring | Verify / modify |
| 09 | Driver chat and customer navigation | Existing dynamic ride routes; preserve in-ride authorization and context | Verify |
| 09 | Schedule | Existing schedule UI plus existing overlap route; add time ranges and authoritative conflict handling | Modify |
| 10 | Edit and personal profile | Existing profile routes; photo/city/member/vehicle fields and correct return navigation | Modify |
| 10 | Ratings and referral | Existing rating/referral routes; distribution/anonymity and role-safe referral contract | Modify / verify |
| 10 | Hotspot map | Existing hotspot route; H3-backed cell semantics are a prerequisite to completion | Modify after P0-A |
| 10 | Incentives and performance | Existing routes; verify progress/expiry, period changes, chart bounds, retry/empty states | Verify / modify |
| 10 | Rider no-show | Existing no-show flow; retain server-anchored timer and wait threshold | Verify |
| 11 | Rider terms/privacy | Actual `(customer)/(tabs)/settings/terms-of-service` and `privacy-policy` routes consume shared content | Modify |
| 11 | Driver terms/privacy | Actual `(rider)/settings/terms-of-service` and `privacy-policy` routes consume shared content | Modify |
| 11 | i18n foundation | Existing `i18n/i18n.ts` and `locales/en|bn/common.json`; persist/hydrate language | Modify |
| Cross-cutting | Notifications and deep links | Root handler plus only valid current routes and validated payload IDs | Build / verify |
| Cross-cutting | Uploads, confirmations, skeletons, offline states | Existing utilities/components first; create only proven missing primitives | Verify / modify |

### 2B. Explicit implementation-time gates

- **Product/legal copy gate:** `lib/legalContent.ts` must centralize approved copy, not let an engineering agent author legal terms. Obtain Product/Legal-approved English and Bengali content, revision dates, contact address, and effective-date policy before claiming Plan 11 complete.
- **Payout gate:** P0-B must have a written decision before a payout write route, a `withdrawal` transaction type, payout history, fees, or a Withdraw control appears.
- **Contract gate:** use an existing endpoint only after inspecting its auth, Zod, request/response shape, ownership and semantics. An existing path is not by itself proof it meets a screen requirement.
- **Notification/deep-link gate:** implement the master routing table only where the target route and payload producer both exist. Do not turn an unverified notification type into a client-only dead route.

## 3. Resolved review findings

| Issue | Gemini | Claude | Qwen Max | Qwen Code | Final decision |
|---|---|---|---|---|---|
| DriverStatusGuard placement | No input | Parent layout already guards tabs | Repeats old audit concern | Confirms parent guard | Keep parent guard; add UX gaps only. |
| Payout-method GET | No input | Exists | Audit had stale absence claim | Confirms GET and POST | Reuse and contract-test it; do not add GET. |
| Wallet top-up | No input | Existing PortPos endpoint | Underweighted | Confirms existing endpoint | Wire UI to existing endpoint only. |
| Instant Pay | No input | Product/funding decision required | Missing scope item | Not impossible; limited balances may exist | Gate implementation until funding and payout rules are approved. |
| Min-rate, payout screen, overlap API | No input | — | Audit says stale | Confirms files exist | Inspect/modify; never create duplicates. |
| Vehicle types | No input | — | Finds 4 vs 8 conflict | Confirms 8 values | Use canonical eight-value enum. |
| Subscription APIs | No input | Existing packages worth preserving | Notes missing literal APIs | Confirms package architecture | Choose package-backed Option A; no parallel endpoints. |
| Tab bar/FloatingNav | No input | — | Calls for decision | Confirms hidden bar and menu | Follow explicit master requirement: visible native five-tab bar; retain menu only for non-tab destinations if still useful. |
| Legal/i18n paths | No input | — | Flags path mismatch | Confirms actual paths/foundation | Extend actual settings paths and `i18n/`. |

## 4. Actual repository facts that control the plan

- The driver root layout already wraps `(tabs)` in `DriverStatusGuard`; blocked drivers cannot mount tabs.
- The tab layout currently hides the bar (`display: 'none'`) and uses `FloatingNavMenu`.
- `GET /api/driver/payout-method` and POST already exist; the screen also exists.
- `POST /api/driver/wallet/topup` already initiates PortPos through the sanctioned payment-event helper.
- `GET /api/driver/wallet` lacks `due_bdt`; `GET /api/driver/dues` exists and should remain the due source.
- `GET /api/driver/vehicles` currently reports every vehicle `is_active: true`; this is a real data-contract defect.
- `min-rate/index.tsx`, `payout-method/index.tsx`, and `app/api/ride/schedule/overlap+api.ts` exist despite the older baseline saying otherwise.
- `GET /api/driver/trips`, transactions, Instant Pay, and payout-history endpoints were reported absent; verify exact absence in Phase -1 before creating any.
- Package list/purchase/active and PaymentWebView already implement the working purchase flow; subscriptions are already tied to packages.
- `lib/vehicleTypes.ts` has eight lower-case values and is mandatory for all vehicle values.
- Terms/privacy are under actual settings routes for driver and rider; i18n is already `i18n/i18n.ts` plus `en`/`bn` JSON.
- Lost-items is root PATCH with existing action values, not the master plan’s proposed nested POST endpoint.
- The legacy `home/index.tsx` is a redirect, not a competing home implementation.

## 5. Final dependency graph

```text
P-1 source verification + route/component inventory
  ├─ P0-A invariant audit (money, packages, vehicle active state, H3)
  ├─ P0-B product gate: Instant Pay/payout-history funding and policy
  └─ P0-C component/API contract decisions
       ↓
P1 navigation/status/storage + shared UI primitives
       ↓
P2 driver foundations: earnings goal, trips, wallet read contract
       ├─ P3 vehicle and package/subscription views
       ├─ P4 money/support/safety/schedule work
       ├─ P5 performance/intelligence/profile work
       └─ P6 legal/i18n + notification/deep-link wiring
              ↓
P7 integration, accessibility, regression and release validation
```

P3–P6 may run in parallel after P1/P2 interfaces stabilize. P0-B blocks only Instant Pay and payout history, not top-up, dues, active package, or payout-method settings.

## 6. Final implementation plan

### P-1 — Source-verification sweep

**Objective:** replace stale audit assumptions with current facts before changes.  
**Inspect:** all paths called `NOT_FOUND`, `app/(main)/(rider)/(tabs)/_layout.tsx`, root driver layout, `DriverStatusGuard`, wallet/payout/package APIs, `vehicleTypes.ts`, schema active-vehicle fields, component inventory, legal/i18n paths, `app/_layout.tsx`.  
**Implementation:** create no feature code. Record whether the existing min-rate, payout-method, schedule-overlap, components, commission-PDF capability, and report/support routes satisfy their contracts.  
**Verification:** path-level source evidence and an API request/response inventory. Never infer an endpoint from a route name.

### P0-A — Safety and ownership contracts

**Objective:** lock the data decisions that prevent money, dispatch, and vehicle regressions.  
**Files/modules:** `src/db/schema.ts`, vehicle APIs, `lib/paymentEvents.ts`, `lib/activateSubscription.ts`, callback/repair code, package APIs, `utils-server/`, H3 wrappers only as needed.  
**Implementation:**

- Fix active-vehicle semantics at the data source: derive from the existing driver vehicle reference if present, or make the smallest schema-backed representation necessary. Never return fabricated `is_active` flags.
- Preserve `vehicle-type-change` authorization/eligibility and force a safe offline transition if switching while online is required by the verified status flow.
- Inventory payment-event/call-ledger/accounting writers. No new direct writer may be introduced.
- Select package-backed subscription Option A; add a read adapter only when the screens need a stable, package-derived response shape.
- Confirm H3 resolution 9, demand/supply semantics, multi-zone handling, and heartbeat zone behavior before declaring the hotspot feature complete.

**Verification:** active selection survives refetch; dispatch sees the correct vehicle eligibility; package purchase creates/activates exactly once; dispatch invariants remain valid.

### P0-B — Product gate for payouts

**Objective:** make monetary scope explicit before any withdrawal implementation.  
**Required Product decisions:** eligible balance source; whether only cancellation/gamification credits or a fully funded wallet can be paid; PortPos/bKash payout rail; minimum/maximum/daily limit/fee/tax; idempotency, reversal, failure, dispute, and accounting entries; whether payout history includes only completed payouts.  
**Rule:** without these decisions, render no Withdraw control and create no `/instant-pay` write route. Top-up and payout-method settings proceed independently.

### P1 — Navigation, status, storage, and shared primitives

**Files:** tab layout, `components/auth/DriverStatusGuard.tsx`, `lib/storageKeys.ts`, existing/reusable component files.  
**Implementation:** expose five 64px native tabs with theme tokens, icons, safe-area spacing, and a wallet due badge. Do not change access-control ownership. Add status polling only while a blocked status is shown, dynamic rejection reason, Check Status, support, and reapply actions. Add the documented storage constants and create only missing shared primitives (for example confirmation modal, segmented control, toggle, stat card, image-picker button) after proving no existing equivalent can be reused.  
**Verification:** active drivers have no mount flash; all blocked statuses cannot access a tab; Settings remains reachable but is not a sixth tab; all new controls are accessible.

### P2 — Core tabs and wallet read model

**Files:** Earnings, Activity, Wallet, Profile/Settings screens; `trips+api.ts` if absent; wallet read API; package-active reader.  
**Implementation:**

- Add persisted earnings goal (100–50,000 taka input; store integer paisa), goal progress, refresh, zero/empty/error/offline states, and correct date navigation.
- Build trip history with Zod-validated filters, authorized driver-only query, stable pagination, reset-on-filter, and 20-item pages. Map canonical ride statuses to UI labels.
- Keep wallet balances in paisa. Add due card from the established dues source, active package card from package-active, recent transactions from the existing response or a new paginated read-only endpoint, and Top Up using existing `wallet/topup+api.ts`/PaymentWebView. Do not fabricate transaction types or cash withdrawals.
- Verify Profile/Settings actions, optimistic auto-accept rollback, persistent sound/navigation preferences, sign-out cleanup, and all loading/error states.

**Verification:** pagination cannot duplicate rows; goal survives restart; top-up starts one payment event; due/active package cards reflect real API data; no money is rendered as a float internally.

### P3 — Vehicles and package-backed subscriptions

**Files:** existing add/manage/select vehicle and subscription/package screens plus relevant API readers.  
**Implementation:** bind all form/API validation to `vehicleTypeSchema`; show eight canonical choices (grouped in UI if helpful). Complete vehicle photos, expiry warnings, empty state, activation prompt, and online switch confirmation. Keep existing `vehicle-type-change` if it accurately represents a vehicle switch; otherwise make the smallest compatible update, not a second API family.

Make subscription plans/details/renewal views package-backed: package list and active package supply plan/usage/expiry data; package purchase supplies checkout and renewal through existing PaymentWebView; confirmation reflects verified activation. Require terms acknowledgement client-side before starting payment, but never use it as proof of payment. Omit cancel/refund controls until policy exists.

**Verification:** mismatched vehicle package purchase returns existing `403 vehicle_type_mismatch`; a purchase activates only once after verified callback; screen refresh shows active-package calls and expiry.

### P4 — Earnings, support, safety, and schedule

**Files:** existing ledger, commission, due, payout-method, min-rate, lost-items, contact-support, emergency-contacts, FAQ, safety, support, trip/report issue, chat, navigation, schedule, and no-show routes.  
**Implementation:** retain working endpoints and improve required presentation/validation. Commission statement gains month query/history only if the API can calculate it; PDF delivery is an inspection item, not a fake button. Reuse existing payout-method GET/POST. Reuse `validateDriverMinKm()`. Map lost-item labels to existing actions. Add Bangladesh phone validation and enforce max five contacts client and server-side. Add support category/subject/message/attachment only if the existing ticket schema/storage supports it; otherwise extend its existing role-safe contract, not a parallel driver endpoint. Complete schedule time ranges with server-validated overlaps using the existing overlap route. Verify safety/SOS cooldown, retries, state polling, in-ride report, chat, navigation, and no-show flows.

**Verification:** user/driver authorization on every endpoint; invalid body/UUID has canonical errors; schedule cannot persist overlap; SOS cannot bypass cooldown; no legacy route or action is duplicated.

### P5 — Performance, intelligence, and profile

**Files:** performance, incentives, ratings, referral, hotspot, edit/personal profile, no-show.  
**Implementation:** preserve implemented APIs and add only missing rating distribution/anonymous cues, referral-role verification, member/vehicle profile details, correct post-save route, and verified H3-driven hotspot presentation. Do not call centroid-only data an H3 heatmap.  
**Verification:** period changes, chart point bound, retries, referral authorization, hotspot cell semantics, and rider no-show regression flow.

### P6 — Legal, i18n, notifications, and deep links

**Files:** new `lib/legalContent.ts`; actual driver/rider settings terms/privacy screens; existing `i18n/`; app root/navigation.  
**Implementation:** provide one legal-content source consumed by the four real settings screens. Persist language choice and hydrate before UI strings render; extend English/Bengali driver strings rather than adding a competing i18n system. Implement notification-response routing and deep-link parsing only for routes that actually exist; validate dynamic IDs before navigation and handle foreground/background/cold starts. Use existing upload utilities/buckets and confirmation/skeleton/offline patterns.

**Verification:** restarting retains Bangla/English; all four legal screens draw from one source; valid notification/deep-link routes correctly and malformed data fails safely.

### P7 — Integration and release validation

Run lint, root typecheck, focused Jest tests, then the full suite. Test manually and with approved UI flows after satisfying the project’s Maestro pre-read/gate rules. Run the required console/removed-technology sweeps. Update the graph after code changes (`code-review-graph update`; `graphify update .` for a large batch).

## 7. Testing and acceptance criteria

- API tests: Zod body/query validation, Supabase role enforcement, invalid UUID errors, pagination/filter boundaries, no data leakage across drivers.
- Money tests: top-up idempotency; payment callback activates once; every sanctioned payment event has correct amount in paisa; no unauthorized payment-event/call-ledger/accounting writer; Instant Pay tests exist only after P0-B policy approval.
- Vehicle tests: active vehicle is truthfully reported after switch/refetch; eligibility and online warning; eight-value enum enforcement; package type mismatch.
- Subscription tests: package list/purchase/active flow, duplicate callback, renewal reuses package purchase safely, no parallel subscription source.
- UI tests: guard states and polling, tab visibility, goal persistence/reset, activity filter/pagination/empty/loading/offline, wallet cards/top-up, emergency-contact limits, schedule conflicts, terms/i18n persistence, notification/deep-link routes.
- Dispatch regression: one deduction per ride/driver, only delivered offers deducted, zero-call/daily-cap drivers excluded, no repeat offer in consecutive batches.
- Release success: `npm run lint`, `npx tsc --noEmit`, relevant Jest/full suite, and source sweeps pass; no `console.log`, Clerk, Stripe, or Firebase references; package-specific `utils-server` validation is run when touched.

## 8. Regression checklist

- Expo managed workflow remains intact; no bare-workflow config.
- Driver root guard remains the sole access-control wrapper.
- FloatingNavMenu/non-tab routes continue to reach Settings and in-ride destinations.
- Package purchase, PortPos callback verification, payment repair, call ledger ownership, and subscription activation remain unchanged except through sanctioned helpers.
- `vehicleTypes.ts`, H3 import boundaries, platform-config no-cache rule, and BDT-paisa handling remain intact.
- Rider terms/privacy, rider ride flow, admin packages, dispatch heartbeat, SOS, chat, lost items, and legacy home redirect continue working.

## 9. Coding-agent instructions

Inspect before modifying and reuse before creating. Treat the P-1 inventory as mandatory; old `NOT_FOUND` claims are not evidence. Preserve Ride’s Expo API conventions: flat dynamic params, `parseJsonBody`, Zod, `verifySupabaseToken`/`requireRole`, snake_case Drizzle properties, integer paisa, and canonical errors. Follow all table-write ownership rules exactly. Do not add endpoints merely to match a master-plan path. Make one scoped phase change at a time, run focused tests after each phase, resolve all type/lint failures, and report changed files, validation evidence, and remaining risks. Do not perform P0-B-gated payout work without the missing product decision.

## 10. Final Kilo Code prompt

```text
Implement Ride Plans 06–11 as an in-place completion of the existing Expo managed-workflow application. Do not treat this as greenfield work.

First perform a read-only source-verification sweep. Inspect the driver root and tabs layouts, DriverStatusGuard, package/payment/wallet/payout/vehicle APIs, vehicleTypes.ts, schema active-vehicle representation, min-rate/payout-method/schedule-overlap routes, component inventory, i18n, legal settings routes, app root notification handling, and exact absence/presence of trips/transactions/instant-pay/payout-history APIs. Record create-versus-modify decisions before editing.

Non-negotiable decisions:
- Keep DriverStatusGuard at the driver root. It already blocks tabs. Add only 30-second polling while blocked, dynamic rejection reason, Check Status, support, and reapply UX. Do not double wrap it.
- Make the native tab bar visible with exactly five 64px tabs: Home, Earnings, Activity, Wallet, Profile. Settings is a pushed route, not a sixth tab. Preserve non-tab navigation.
- Use the eight lower-case vehicle values from lib/vehicleTypes.ts everywhere. Never define a four-value or inline vehicle enum.
- Keep package-backed monetization as the only subscription source: /api/package/list, /api/package/purchase, /api/package/active, existing PaymentWebView, subscriptions, and sanctioned payment helpers. Do not create /api/driver/subscription* endpoints. Adapt subscription screens to package/active-package data and do not expose cancellation/refund without an approved policy.
- Reuse the existing payout-method GET/POST and wallet/topup PortPos endpoint. Do not duplicate either.
- Do not implement Instant Pay, cash withdrawal, payout-history writes, or a Withdraw control until Product explicitly supplies a funded balance source, payout provider, limits/fees/tax, idempotency/reversal/dispute rules, and accounting model. Mark those as blocked rather than inventing behavior.
- Repair actual active-vehicle semantics before vehicle UI. Preserve vehicle-type-change authorization and eligibility; do not create parallel activation APIs unless direct inspection proves the existing route cannot support canonical vehicle selection.
- Extend existing i18n/i18n.ts and locales; put shared legal text in lib/legalContent.ts and consume it from the real rider/driver settings terms/privacy routes.

Implement in this order:
1. P0 contracts: active vehicle, payment-write inventory, package-backed subscription adapter as needed, H3/hotspot data prerequisites.
2. Navigation/status/storage/shared primitives: five visible tabs, status UX, lib/storageKeys.ts, reuse/create only missing shared controls.
3. Core tabs: persisted earnings goal (paisa internally); driver trip API with authorized filters/pagination; wallet due/active package/transactions/top-up UI. Create only genuinely missing read APIs after the sweep.
4. Vehicle/package screens: eight-type validation, documents/photos/expiry states, online switch confirmation; package-backed plans/details/renewal/confirmation.
5. Money/support/safety/schedule: improve existing endpoints and screens, reusing payout method/min rate/lost-item actions and schedule overlap route. Never fake a PDF or attachment backend; inspect/extend existing contracts if needed.
6. Performance/profile/hotspot: repair only confirmed gaps and do not label zone centroids as H3 cells.
7. Legal/i18n/notifications/deep links: persist language, centralize content, validate deep-link IDs, and cover foreground/background/cold-start notification navigation.

For every API: use parseJsonBody for bodies, Zod at every boundary, require verified auth/role, use flat Expo dynamic params, validate UUID params, return canonical error objects, use snake_case Drizzle fields, and keep money as integer paisa. Respect all payment_events, call_ledger, subscriptions, accounting, H3, platform_config, and dispatch ownership constraints from AGENTS.md.

After each phase, provide changed files, commands run, validation evidence, and remaining risk. Run focused Jest tests, then npm run lint, npx tsc --noEmit, applicable full tests, required source sweeps, and graph updates. Do not make unrelated refactors.
```

## 11. Definition of done

- [ ] P-1 source verification is recorded and no stale-audit route was duplicated.
- [ ] Five visible driver tabs work; guard security is preserved and missing status UX works.
- [ ] Required Plan 06–11 screens are completed by extending their real routes, with loading/empty/error/offline/accessibility states.
- [ ] Active vehicle, trips, wallet due/transactions/top-up, and package-backed subscription flows are correct and tested.
- [ ] All vehicle values use the eight-value canonical enum; all money remains integer paisa.
- [ ] Instant Pay/payout history is either implemented only after approved P0-B policy or explicitly documented as blocked—not improvised.
- [ ] Legal/i18n/deep link/notification changes use the existing foundations and real route paths.
- [ ] Payment, dispatch, rider, admin, and SOS regressions are covered.
- [ ] Lint, typecheck, relevant tests, required sweeps, and graph maintenance complete cleanly.
