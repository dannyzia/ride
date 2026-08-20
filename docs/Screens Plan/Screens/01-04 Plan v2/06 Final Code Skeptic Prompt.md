# RIDE APP — PLANS 01-04 UNIFIED CODE SKEPTIC AUDIT

## TASK TYPE
SKEPTIC / VERIFY

## OBJECTIVE
Perform a single comprehensive adversarial audit of the Ride repository to determine whether Plans 01–04 deserve their "COMPLETE" status. Do NOT modify any code. Your job is to find defects that could survive a normal code review — security breaches, financial corruption, ride-state corruption, broken state machines, authorization bypasses, and canonical requirement violations.

## 0. MANDATORY PRE-READS (In This Order)

Read these files before beginning any audit phase:

1. `AGENTS.md` — Critical rules, architecture map, env vars, known issues
2. `docs/Plan/06-API.md` — API and WebSocket contracts
3. `docs/Plan/13-CONVENTIONS.md` — Coding conventions
4. `docs/Plan/18-KNOWN-ISSUES.md` — Known issues (TD-01, TD-11, TD-15, TD-31)
5. `docs/Plan/14-DEV-CHECKLIST.yaml` — Implementation spec
6. `Ride_App_UIUX_Rethink_3_Master_Plan.md` (canonical v3.0) — UI/UX spec, locked decisions L1–L17, screen inventory, state machines
7. `FEATURES.md` — Full feature inventory with backend/frontend/wiring status

### 0.1 Documentation Precedence Rules (Hard — Resolve All Conflicts Here)

When the Master Plan and AGENTS.md conflict, apply this hierarchy:

| Domain | Primary Source | Secondary Source | Conflict Resolution |
|--------|---------------|------------------|---------------------|
| UI/UX, theming, screen behavior, design tokens, typography, state machine specs | Master Plan v3.0 | AGENTS.md | Master Plan wins |
| Backend architecture, API conventions, DB schema rules, write ownership, security, payment processing | AGENTS.md | Master Plan | AGENTS.md wins |
| WebSocket protocol | `utils-server/types.ts` + `utils-server/index.ts` actual emissions | Master Plan §10.2 | Code wins; plan §10.2 is stale snapshot |
| Screen file paths | Repository actual routes | Master Plan §5 | Verify by feature, not literal path; record drift |

**Never auto-"fix" a conflict.** Report it as "Documentation Drift" with both sources quoted and your evidence-based resolution.

### 0.2 Repository Reality Anchors (Do Not Assume — Verify)

- **WebSocket protocol:** The REAL contract lives in `utils-server/types.ts` and actual emit/handler sites in `utils-server/index.ts`. The Master Plan §10.2 is a stale snapshot. These additional events are LEGITIMATE and must NOT be flagged: `ride:status`, `ride:expired`, `ride:alternatives`, `admin:suspended`, `auth:refresh`, `ride:subscribe`, `ride:unsubscribe`. The plan's "never emitted" list (`ride:offer_expired`, `ride:offer_cancelled`, `ride:status_update`, `subscription:expired`) refers to wire names that should not exist — if found, report as dead code.
- **Screen path drift:** The Master Plan's file paths contain systematic drift from the repository. Example: rider settings live under `app/(main)/(customer)/(tabs)/settings/` (not `settings/`), `call-ledger.tsx` (not `call-ledger/index.tsx`), `packages.tsx` (not `packages/index.tsx`). Establish a drift mapping before classifying any screen as "absent."
- **`lib/riderSocket.ts`:** This file may not exist. The rider WebSocket is instantiated in `services-hub.tsx` or `lib/ws-stub.ts`. Trace the actual behavior, not the filename.
- **`store/useWSStore.ts`:** Does NOT exist. Real stores: `useRiderStore`, `useDriverStore`, `useDriverStatusStore`, `useDriverFlowStore`, `useChatStore`, `usePackageStore`, `useCallLedgerStore`.
- **Dual Barikoi files:** `utils/mapUtils.ts` contains the `useBarikoiMapStyle(isDark)` hook. `lib/useBarikoiMapStyle.ts` contains URL helpers (`getBarikoiAutocompleteUrl`). Do not conflate them.
- **Theming boundary:** NativeWind `dark:` classes in screens NOT rewritten by Plans 01–04 are pre-existing legacy and are NOT L1 violations. Only flag `dark:` in files that Plans 01–04 explicitly claimed to rewrite.
- **bKash vs PortPos:** L16 "bKash only" means the UI collects ONLY bKash numbers (`^01\d{9}$`) for driver payout. PortPos is the unified backend payment processor. Do NOT flag PortPos as an L16 violation. `lib/bkash.ts` and `lib/nagad.ts` are inert stubs.
- **Tab bar vs route groups:** `app/(main)/(customer)/(tabs)/` is an Expo Router route group, not necessarily a visual bottom tab bar. Verify actual UI rendering. The driver app DOES use a visual 5-tab bar. The rider app should use a hamburger FAB (L11).
- **Bodyless POSTs:** Endpoints like `auth/logout`, `auth/verify-token`, `driver/break/start|end`, `user/request-data` take NO request body. They are EXEMPT from the `parseJsonBody` requirement. Do not flag them.
- **Money exception:** `rate_percent` columns (e.g., `tax_rates.rate_percent`) are `numeric(5,2)` because they store percentages (5.00), not money. They are EXEMPT from the "integer paisa" rule.
- **Expo API params:** Dynamic route params are passed DIRECTLY as the second argument: `({ id }: { id: string })`. The Next.js pattern `({ params }: { params: { id: string } })` crashes at runtime. Search for this bug.

## 1. PHASE 1 — REPOSITORY RECONNAISSANCE

Before judging anything:

1. Map the actual navigation structure (Expo Router file tree).
2. List all Zustand stores and their consumers.
3. Identify all shared UI components in `components/`.
4. Identify all API routes in `app/api/`.
5. Identify WebSocket client and server implementations.
6. Identify DB schema, migrations, and Drizzle usage patterns.
7. Identify auth/session handling.
8. Identify payment/event/accounting code.
9. Identify logging/error-handling conventions.
10. List all test files and what they cover.
11. Identify legacy/dead implementations the plan says should have been removed.
12. Use `codebase-memory-mcp` (`search_graph`, `trace_path`, `get_architecture`) for structural queries where available.

## 2. PHASE 2 — LOCKED ARCHITECTURE AUDIT (L1–L17)

Audit every locked decision. For each, determine: implemented correctly / implemented but defective / partially implemented / absent / obsolete / deferred.

### L1 — Theming (Pattern A)
- Verify Plan 01–04 rewritten screens use `useIsDark()` from `lib/useAppearance.ts` with inline `colors.*` ternaries.
- Search for `theme === "dark"`, `theme === "dark" || theme === "system"`, hard-coded theme colors.
- `dark:` classes in PRE-Plan-01 files are legacy — NOT violations. Only flag in Plan 01–04 rewritten screens.

### L2 — Default Theme
- Verify `'system'` follows device via `useColorScheme()`.
- Verify toggle cycles `light &lt;-&gt; dark` only (no system option in toggle).
- Check for theme flash or contradictory initialization.

### L3 — Theme Toggle
- Verify every screen EXCEPT `SplashAnimation` has a sun/moon toggle.
- Check nested screens and modal screens.

### L4 — Icons
- Search production UI for emoji, non-Ionicons icons, Unicode symbols used as UI.
- Comments and documentation are exempt.

### L5 — Maps
- Verify `components/Map.tsx` uses MapLibre.
- Verify `useBarikoiMapStyle(isDark)` is used correctly.
- Verify map theme is independent of UI theme.
- Check for duplicate map implementations.

### L6 — Typography
- Verify Plus Jakarta Sans loading and usage.
- Check rider (28/18/15/13/11) vs driver (32/22/18/16/14) scales.
- Search for system font leakage.

### L7 — Money (Integer Paisa)
- Trace money from DB → API → state → WS → UI display.
- ALL `*_bdt` columns must be integer paisa. Divide by 100 ONLY at display boundaries.
- Look for floating-point arithmetic, double `/100`, missing `/100`.
- EXEMPT: `rate_percent` columns (`numeric(5,2)`).
- Verify `lib/money.ts` or equivalent enforces this.

### L8 — WebSocket Singleton
- Trace ALL WebSocket creation sites.
- Driver home (`app/(main)/(rider)/(tabs)/index.tsx`) must be the ONLY driver-side `new WebSocket`.
- Rider socket must be created in `services-hub` (or `lib/ws-stub.ts` if that is the actual pattern).
- All other screens must use `addEventListener("message")` only.
- Verify no fallback WS creators remain.
- Verify listeners are cleaned up on unmount.
- Verify reconnect does not create duplicate sockets.
- Verify heartbeat/location updates cannot multiply.

### L9 — Expo Managed
- Look for bare-workflow assumptions, `react-native.config.js`, or native module configs incompatible with managed workflow.

### L10 — Phone Validation
- Trace ALL phone validation paths: signup, login, OTP, book-for-someone-else, driver payout.
- Verify `+880` + 10 digits = 14 chars.
- Verify leading-zero stripping (`017XXXXXXXX` → `+88017XXXXXXXX`).

### L11 — Hamburger &gt; Tab Bar (Rider)
- Verify rider navigation uses draggable hamburger FAB, NOT a bottom tab bar.
- The `(tabs)` directory is a route group — verify actual UI, not folder name.
- Driver app legitimately uses 5-tab bottom bar.

### L12 — Services Hub First
- Verify authenticated riders land on Services Hub after auth/onboarding.
- Verify no bypass redirects exist.

### L13 — Cash Only for Rides
- Verify wallet/pass/package functionality is NOT used for ride payment.
- Trace payment behavior around ride completion.

### L14 — Max 2 Extra Stops
- Verify every booking/API/state path respects max 2 extra stops (3 destinations total).

### L15 — Gallery Only
- Search for `launchCameraAsync`, `Camera` API, or any camera invocation.
- Only `launchImageLibraryAsync` is permitted.

### L16 — bKash Only (Driver Payout)
- Verify driver payout UI collects only bKash numbers (`^01\d{9}$`).
- Verify no bank/Nagad fields exist in driver payout flows.
- PortPos as backend processor is CORRECT, not a violation.

### L17 — Manual Admin Activation
- Trace: document submission → verification → admin review → driver status → activation.
- Verify document approval does NOT auto-activate.
- Verify client cannot self-activate.
- Verify legacy `/api/driver/verify-driver` client usage is gone (admin route is OK).

## 3. PHASE 3 — SCREEN INVENTORY AUDIT

**Rule:** Verify by feature/route resolution, NOT literal Master Plan paths. Establish drift mapping first.

For each screen claimed complete by Plans 01–04:

1. Confirm the route exists and is reachable.
2. Confirm imports resolve.
3. Confirm it uses expected shared components.
4. Confirm API calls match the specification.
5. Confirm navigation parameters are correct.
6. Confirm theme behavior (Pattern A, StatusBar, toggle).
7. Confirm loading/error/empty states.
8. Confirm destructive actions are guarded.
9. Confirm role isolation.
10. Confirm no obsolete implementation from earlier plans remains.

**Tiered depth:**
- **Tier 1 (deep audit):** All screens the plan explicitly says were rewritten/deleted in Plans 01–04, plus all money-touching and WS-touching screens.
- **Tier 2 (medium audit):** All other screens marked ✅ in the plan.
- **Tier 3 (existence check):** Settings sub-screens and deferred Plan 05/06 screens.

**Special attention:** Screens where the plan says legacy was deleted (fallback WS creators, `verifyReached`, flat onboarding, dead routes). Prove deletion.

## 4. PHASE 4 — STATE MACHINE AUDIT

Audit these as actual executable behavior:

### 4.1 Rider Booking State Machine
`IDLE → DESTINATION → PICKUP → VEHICLE → CONFIRM → FINDING_DRIVER → RIDE_TRACKING → RIDE_COMPLETE`

For each transition verify: trigger, guard condition, API/WS call, success/failure response, timeout, navigation, cleanup, retry, duplicate-event handling, stale-event handling.

Find impossible states: accepting after expiry, completing from wrong state, canceling after in-progress, duplicate rating, stale WS event changing newer ride state.

### 4.2 Driver Work State Machine
`OFFLINE → ONLINE → RIDE_OFFER → FIND_CUSTOMER → ENTER_OTP → FINISH_RIDE → BREAK_MODE`

Same rigor as rider. Pay special attention to:
- Double accept/reject
- Accept after offer loss (`offer:lost`)
- Arrive twice
- Start twice / without valid OTP
- Complete twice
- Cancel while completion occurring
- Reconnect replay causing duplicate actions

### 4.3 Auth State Machine
`SPLASH → WELCOME → PHONE_ENTRY → LOGIN → OTP_VERIFY → REGISTER → ENABLE_LOCATION → NOTIFICATIONS_PERMISSION → SERVICES_HUB/DRIVER_HOME`

Verify no blocking on location/notifications denial.

## 5. PHASE 5 — API CONTRACT AUDIT

Trace frontend API calls against actual server routes.

For every important endpoint verify: HTTP method, path, params, request body, Zod validation, response shape, auth, authorization, error handling.

**Critical endpoints to verify:**
- `POST /api/ride/request`
- `GET /api/ride/{id}` (file: `app/api/ride/[id]/index+api.ts`)
- `POST /api/ride/{id}/cancel`
- `POST /api/ride/{id}/rate`
- `POST /api/ride/nearby-drivers`
- `GET /api/rider/wallet`
- `GET /api/driver/me`
- `POST /api/driver/status`
- `POST /api/driver/break/start|end`
- `GET /api/driver/daily-stats`
- `GET /api/driver/dues` (note: plan says `due-amounts`, actual may differ)
- `POST /api/driver/documents`
- `GET /api/driver/documents`
- `POST /api/driver/payout-method`
- `POST /api/promo/redeem`
- `POST /api/sos/alert`

**Rules:**
- Zod at every boundary.
- `parseJsonBody` for POST bodies that HAVE a body.
- Bodyless POSTs are EXEMPT.
- UUID validation for dynamic params.
- `{ id }` direct second arg (NOT `{ params }`).
- Snake_case DB properties.
- `isNull(col)` / `isNotNull(col)` — NEVER `eq(col, null)`.

## 6. PHASE 6 — SECURITY & AUTHORIZATION

Attempt IDOR/BOLA-style reasoning against every resource:

- rides, rider data, driver data, documents, payout methods, wallet, due amounts, subscriptions, call ledger, ratings, SOS alerts, lost items, fare disputes, chat, public tracking.

For every endpoint accepting an ID, verify the authenticated actor is authorized to access that resource.

**Do not trust client-supplied:** role, user ID, driver ID, rider ID, ownership, ride state, payment status.

**Public tracking audit:** Inspect `app/track/[rideId].tsx`. Determine exactly what unauthenticated users can retrieve. Can they see rider identity, driver identity, phone numbers, precise location, historical route?

## 7. PHASE 7 — REPOSITORY HYGIENE

Search for violations of explicit coding rules:

- `console.log` → must use `lib/logger.ts`
- `any` / `@ts-ignore` / `@ts-expect-error` without explanatory comment
- Missing Zod validation
- `eq(column, null)` → must be `isNull(col)`
- camelCase DB properties where snake_case required
- Money fields with incorrect representation
- Missing transactions for writes touching: `call_ledger`, `subscriptions`, `payment_events`, `tax_ledgers`, `accounting_entries`, `accounting_entry_lines`
- Duplicate write ownership (call_ledger deductions ONLY in `utils-server/heartbeat.ts`; payment_events creation ONLY in `lib/paymentEvents.ts`)
- PortPos callbacks that mutate state BEFORE `verifyIPN()`
- Next.js `{ params }` destructuring in Expo API routes

## 8. PHASE 8 — PERFORMANCE / LOW-END ANDROID

Challenge against Bangladesh-first constraints:

- Excessive blur, expensive shadows, expensive gradients
- Unbounded animations, unnecessary Reanimated worklets
- Non-memoized high-frequency components
- Map rendering abuse, excessive polling
- Unbounded FlatList behavior, huge images
- Focus on driver screens (glanceability, large touch targets, minimal cognitive load)

## 9. PHASE 9 — BACKEND DEEP-DIVE

### 9.1 WebSocket Lifecycle
Trace complete lifecycle: `create → connect → auth:hello → auth:ok → listeners → heartbeat/location → reconnect → cleanup → close`.

### 9.2 Dispatch Invariants (from AGENTS.md)
Verify these 5 invariants:
1. Single deduction per `(ride_id, driver_id)`.
2. Deduction row has matching `dispatch_offers` row with `outcome='delivered'`.
3. `calls_remaining = 0` drivers never in candidate pool.
4. Daily cap exceeded drivers never in candidate pool.
5. No driver receives same offer in consecutive batches.

### 9.3 Payment Invariants (from AGENTS.md)
Verify these 3 invariants:
1. Same idempotency key → exactly one `payment_events` row.
2. Duplicate callback activates subscription exactly once.
3. Failed activation → `compensation_queue` entry within 30 seconds.

### 9.4 PortPos Security
For every callback path:
1. Is request authenticated/validated?
2. Does `portposClient.verifyIPN()` run BEFORE state mutation?
3. Is verification against correct transaction/reference?
4. Does callback compare invoice amount to locally-stored `payment_events.amount_bdt` in integer paisa?
5. Are duplicate callbacks idempotent?

### 9.5 Write Ownership
Map every write to:
- `call_ledger` (deductions ONLY in `utils-server/heartbeat.ts`; other types ONLY in `lib/activateSubscription.ts`)
- `dispatch_offers` (ONLY `utils-server/dispatch.ts` and `heartbeat.ts`)
- `payment_events` (creation ONLY `lib/paymentEvents.ts`; status transitions ONLY `lib/activateSubscription.ts` and `app/api/payment/portpos/callback+api.ts`)

### 9.6 Timezone & Timestamp
- Verify all timestamps are UTC `timestamptz`.
- Verify `nextBdtMidnightUtc()` from `lib/time.ts` is used for Dhaka midnight calculations (daily stats, daily caps).
- Verify no local timezone arithmetic in DB queries.

### 9.7 Vehicle Type Scoping
- Verify `packages.vehicle_type` scoping: NULL = universal; non-null = only matching `drivers.vehicle_type` can see/purchase.
- Verify `vehicleTypeEnum` has exactly 8 lowercase values: `bike_basic`, `bike_standard`, `bike_plus`, `cng`, `car_economy`, `car_comfort`, `car_premium`, `car_xl`.
- Verify legacy uppercase values (`MOTORCYCLE`, `CNG_AUTO_RICKSHAW`, `CAR`, `MICROBUS`) are removed.

### 9.8 platform_config
- Verify never cached; read from DB at every request.
- Verify admin changes via `PATCH /api/admin/config` take effect without restart.

## 10. PHASE 10 — TEST COVERAGE AUDIT

Do not assume tests prove correctness.

Inspect all 23 test files:
- What critical paths are covered?
- Do tests assert business behavior or implementation details?
- Are failure cases covered?
- Are state-machine transitions covered?
- Are authorization boundaries covered?
- Are WebSocket lifecycle behaviors covered?
- Are monetary invariants covered?
- Are the 5 dispatch invariants and 3 payment invariants covered?

Identify critical untested behavior.

## 11. SEVERITY CLASSIFICATION

Every finding MUST be classified:

- **CRITICAL** — security breach, financial corruption, ride-state corruption, data-integrity failure, system-wide architectural violation
- **HIGH** — major broken business flow, authorization issue, serious race condition, important canonical requirement violation
- **MEDIUM** — meaningful functional/regression issue
- **LOW** — minor defect or localized inconsistency
- **INFO** — concern worth recording but not demonstrably defective

Do not inflate severity. Do not report stylistic preferences. Do not report hypothetical problems without a credible code path. Do not report missing functionality deferred to Plan 05/06.

## 12. EVIDENCE STANDARD

Every finding MUST include:
- Exact file path
- Relevant symbol/function/component
- Exact behavior observed (quote code if possible)
- Relevant canonical requirement
- Why the implementation violates or risks violating it
- Affected flow
- Reproduction/attack scenario where applicable

## 13. OUTPUT FORMAT

Produce a single markdown report at `/mnt/agents/output/audit-report-plans-01-04.md`:

### 1. Executive Verdict
State ONE of: **PASS** / **PASS WITH MATERIAL DEFECTS** / **FAIL**

### 2. Critical & High Findings
Table: | ID | Severity | Area | File(s) | Requirement | Finding | Evidence | Impact |

### 3. State Machine Failures
List broken or unsafe transitions separately.

### 4. Security / Data-Integrity Findings
List separately with attack paths.

### 5. WebSocket Findings
List every socket creation/listener/lifecycle issue.

### 6. Financial Integrity Findings
List every money/accounting defect.

### 7. Canonical-Rule Violations (L1–L17)
Map findings to locked decisions.

### 8. Theme / UI Violations
### 9. API Contract Violations
### 10. Performance Concerns
### 11. Missing Test Coverage
### 12. Documentation Drifts
List Master Plan vs AGENTS.md vs repository conflicts found.

### 13. False Confidence Risks
Places where implementation appears complete but evidence suggests otherwise.

### 14. Recommended Remediation Order
Rank by actual production risk. Do not implement fixes.

## 14. READ-ONLY ENFORCEMENT

You are FORBIDDEN from:
- Modifying any source code, migrations, config, tests, or documentation
- Running `drizzle-kit push`, `drizzle-kit generate`, or any DB mutation
- Installing or removing packages
- Running `git commit`, `git push`, or any write to version control
- Creating new files outside the audit report

Permitted commands:
- `grep`, `find`, `cat`, `head`, `tail`, `ls`
- `npx tsc --noEmit` (root only; `utils-server/` is excluded)
- `npm run lint` (root only; `utils-server/` is excluded)
- `codebase-memory-mcp` tools for structural queries

## 15. BLOCKER REPORTING

If you encounter genuine ambiguities that prevent a reliable conclusion (e.g., a file referenced by multiple canonical docs but missing from the repo, contradictory requirements with no clear precedence), report them as **BLOCKERS** with:
- What you tried to verify
- What evidence you found
- Why it is ambiguous
- What additional information would resolve it

Do not guess. Do not assume. Do not fabricate evidence.