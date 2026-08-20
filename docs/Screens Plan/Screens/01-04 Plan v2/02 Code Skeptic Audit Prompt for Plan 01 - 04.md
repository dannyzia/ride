Prompt 1 — GLM-5.3 — System-Wide Code Skeptic Audit

You are performing a **CODE SKEPTIC AUDIT**, not an implementation task.

Do NOT modify any source code, migrations, configuration, tests, or documentation.

Your job is to assume that the current implementation may be substantially wrong even if previous agents marked Plans 01–04 as “COMPLETE”. Actively attempt to disprove the correctness of the implementation.

## Canonical specification

Use the provided canonical document:

**Ride App — UI/UX Rethink 3: Master Planning File — Canonical v3.0 — Plans 01–04 Combined**

Treat its locked decisions, screen specifications, state machines, wiring rules, implementation records, known bugs, key decisions, and verification checklists as authoritative.

Do not silently replace the plan with your own preferred architecture.

The supplied plan identifies Plans 01–04 as complete, but this audit must verify whether that claim is actually true in the repository.

The stack is:

* Expo SDK 53, Managed Workflow with Development Builds
* React Native
* TypeScript
* Zustand
* NativeWind/Tailwind
* MapLibre
* Expo API routes under `app/api/`
* Separate Node.js/TypeScript WebSocket dispatch service under `utils-server/`
* PostgreSQL/Supabase with Drizzle ORM
* PortPos payments
* Barikoi maps/geocoding
* H3-based dispatch

## Phase 1 — Repository reconnaissance

Before judging anything:

1. Inspect the repository structure.
2. Locate the canonical plan and any related implementation records.
3. Inspect `AGENTS.md`.
4. Inspect package configuration and TypeScript configuration.
5. Identify the actual navigation structure.
6. Identify Zustand stores and their consumers.
7. Identify shared UI components.
8. Identify API routes.
9. Identify WebSocket client/server implementation.
10. Identify database schema and migrations.
11. Identify authentication/session handling.
12. Identify payment/event/accounting code.
13. Identify logging/error-handling conventions.
14. Identify tests and test infrastructure.
15. Determine whether the repository contains legacy/dead implementations that the plan says should have been removed.

Do not make conclusions from filenames alone. Trace imports, exports, route references, API calls, state transitions, and actual consumers.

## Phase 2 — Challenge the locked architecture

Audit every locked decision L1–L17.

Pay particular attention to:

### L1 — Theming

Verify that new/current screens actually use:

`useIsDark()` from `lib/useAppearance.ts`

and Pattern A inline color selection.

Search aggressively for:

* `dark:`
* `theme === "dark"`
* `theme === "dark" || theme === "system"`
* hard-coded theme-dependent colors
* inconsistent theme logic
* components that render incorrectly in either theme

Do not assume existing compliance merely because the plan says it is complete.

### L2 — Default theme

Verify that:

* system mode follows the device
* the toggle changes only light ↔ dark
* system mode is not accidentally treated as dark
* persistence and initialization are coherent
* there is no flash or contradictory initial theme

### L3 — Theme toggle

Verify that every applicable screen has a theme toggle and that only Splash is exempt.

Check both direct screens and nested screens.

Look for screens that inherit a theme visually but violate the explicit ownership rule.

### L4 — Icons

Search the production UI for:

* emoji
* non-Ionicons production icons
* inconsistent icon libraries
* Unicode symbols used as UI icons

Do not count comments or documentation as violations.

### L5 — Maps

Trace every map implementation.

Verify:

* `components/Map.tsx` is actually used where intended
* MapLibre is used
* `useBarikoiMapStyle(isDark)` is used appropriately
* map theme is not incorrectly coupled to UI theme
* no duplicate map implementation has silently replaced the intended component

### L6 — Typography

Verify actual font loading and usage.

Search for:

* system/default fonts
* inconsistent font family assignments
* incorrect rider/driver scale
* screens violating driver-versus-rider typography requirements

### L7 — Money

This is a high-risk invariant.

Trace money from:

* database
* API
* server calculations
* state
* WebSocket payloads
* UI display

Verify that monetary persistence/calculation follows the integer-paisa convention and that conversion to displayed BDT happens only at presentation boundaries.

Look for:

* floating-point money arithmetic
* accidental `/100` in business logic
* double `/100`
* missing `/100`
* fields whose naming suggests BDT but contain taka rather than paisa
* mismatched client/server monetary contracts

### L8 — WebSocket singleton

Trace all WebSocket creation sites.

Verify:

* driver home is the ONLY driver-side WebSocket creator
* `services-hub` owns the rider session socket
* other screens only register listeners
* no fallback WebSocket creators remain
* listeners are cleaned up
* reconnect behavior does not create duplicate sockets
* navigation between screens does not create multiple active connections
* auth handshake ownership is correct

This must be analyzed dynamically from the code flow, not just by searching for one function name.

### L9 — Expo Managed

Look for bare-workflow assumptions or native changes incompatible with the stated architecture.

### L10 — Phone validation

Trace all phone validation/normalization paths.

Verify consistency between:

* signup
* login
* OTP
* rider booking for someone else
* driver payout where applicable
* API boundaries

Check the exact `+880` + 10 digit requirement and leading-zero normalization.

### L11 — Navigation

Verify rider navigation uses the hamburger/FAB architecture rather than an accidental bottom-tab implementation.

### L12 — Services Hub

Verify authenticated riders actually enter Services Hub where specified and cannot accidentally bypass it through another redirect.

### L13 — Cash-only rides

Trace payment behavior around rides.

Verify wallet/pass/package functionality has not accidentally become a ride-payment mechanism.

### L14 — Stops

Verify every relevant booking/API/state path respects:

**maximum 2 extra stops / 3 destinations total.**

### L15 — Gallery only

Search for camera invocation APIs.

The plan explicitly requires gallery-only document/photo upload.

### L16 — bKash only

Trace driver payout methods and validation.

Look for bank/Nagad fields or incompatible validation.

### L17 — Manual activation

Trace the entire driver verification flow.

Verify that document approval cannot silently activate the driver.

## Phase 3 — Screen inventory audit

The plan marks a very large number of rider and driver screens as complete.

Do NOT simply check whether files exist.

For each screen:

1. Confirm route exists.
2. Confirm it is reachable from the intended flow.
3. Confirm imports resolve.
4. Confirm it uses the expected shared components.
5. Confirm its API calls correspond to the specification.
6. Confirm navigation parameters are correct.
7. Confirm theme behavior.
8. Confirm StatusBar ownership.
9. Confirm loading/error/empty states where relevant.
10. Confirm destructive actions are guarded.
11. Confirm role isolation.
12. Confirm the screen does not contain obsolete implementation from an earlier plan.

Pay special attention to screens where the plan explicitly says a legacy implementation was deleted.

Find dead files and dead routes that can still be reached.

## Phase 4 — State-machine audit

Audit these state machines as actual executable behavior:

1. Rider booking state machine
2. Driver work state machine
3. Auth state machine

For each transition determine:

* triggering event
* current state
* permitted transition
* API/WS call
* success response
* failure response
* timeout behavior
* navigation result
* cleanup
* retry behavior
* duplicate-event behavior
* stale-event behavior

Try to find impossible states.

Examples:

* accepting an offer after it expired
* completing a ride from the wrong state
* starting a ride without valid OTP
* canceling after cancellation is forbidden
* duplicate completion
* duplicate rating
* stale WebSocket event changing a newer ride state
* navigation into a state whose required data is missing
* reconnect replay causing duplicate actions

## Phase 5 — API contract audit

Trace frontend API calls against actual server routes.

For every important endpoint verify:

* HTTP method
* path
* parameters
* request body
* validation
* response shape
* authentication
* authorization
* error handling
* client expectations

Pay special attention to:

* `/api/ride/request`
* `/api/ride/{id}`
* `/api/ride/{id}/cancel`
* `/api/ride/{id}/rate`
* `/api/ride/nearby-drivers`
* `/api/rider/wallet`
* `/api/driver/me`
* `/api/driver/status`
* `/api/driver/break/start`
* `/api/driver/break/end`
* `/api/driver/daily-stats`
* `/api/driver/documents`
* `/api/driver/payout-method`
* `/api/promo/redeem`
* `/api/sos/alert`

Do not assume a route is correct because its filename looks correct.

## Phase 6 — Security and authorization

Look for broken authorization boundaries.

Test mentally for:

* rider accessing another rider's ride
* driver accessing another driver's data
* driver manipulating another driver's payout data
* arbitrary ride IDs
* arbitrary document IDs
* arbitrary user IDs
* unauthorized admin functionality
* IDOR/BOLA
* trusting client-supplied role
* trusting client-supplied ownership
* missing authentication on sensitive endpoints
* unsafe public tracking exposure
* sensitive data leakage through API responses
* unsafe error messages

For each finding explain the actual attack/data-flow path.

## Phase 7 — Repository hygiene

Search for violations of the explicit coding rules:

* `console.log`
* `any`
* `@ts-ignore`
* unsafe API parsing
* missing Zod validation
* `eq(column, null)`
* camelCase DB properties where snake_case is required
* money fields with incorrect representation
* missing transactions where required
* duplicate write ownership
* PortPos callbacks that mutate state before `verifyIPN()`

Do not report false positives from generated code or intentionally permitted Drizzle enum casts. Verify context before reporting.

## Phase 8 — Performance / low-end Android audit

Challenge the implementation against the Bangladesh-first constraints:

* excessive blur
* expensive shadows
* expensive gradients
* unbounded animations
* unnecessary Reanimated worklets
* non-memoized high-frequency components
* map rendering abuse
* excessive polling
* unnecessary rerenders
* large image handling
* unbounded FlatList behavior

Pay special attention to driver screens.

## Phase 9 — Test the tests

Do not assume tests prove correctness.

Inspect existing tests and determine:

* what critical paths are actually covered
* whether tests assert business behavior rather than implementation details
* whether failure cases are covered
* whether state-machine transitions are covered
* whether authorization is covered
* whether WebSocket lifecycle behavior is covered
* whether monetary invariants are covered

Identify critical untested behavior.

## Severity classification

Every finding must be classified:

* **CRITICAL** — security breach, financial corruption, ride-state corruption, data-integrity failure, or system-wide architectural violation
* **HIGH** — major broken business flow, authorization issue, serious race condition, or important canonical requirement violation
* **MEDIUM** — meaningful functional/regression issue
* **LOW** — minor defect or localized inconsistency
* **INFO** — concern worth recording but not demonstrably defective

Do not inflate severity.

## Evidence requirement

Every finding must include concrete evidence:

* file path
* relevant symbol/function/component
* exact behavior observed
* relevant plan requirement
* why the implementation violates or risks violating it
* affected flow
* reproduction/attack scenario where applicable

Do not report vague statements such as “this could be improved.”

## False-positive discipline

Do not report:

* stylistic preferences that contradict no plan requirement
* hypothetical problems without an actual code path
* duplicated findings that are manifestations of the same root cause
* missing functionality that the canonical plan explicitly defers to Plan 05 or Plan 06

Distinguish:

1. implemented correctly
2. implemented but defective
3. partially implemented
4. absent
5. obsolete/dead implementation
6. deferred by plan
7. ambiguous because the supplied plan is incomplete

## Final report

Do not modify anything.

Produce:

### 1. Executive verdict

State whether Plans 01–04 deserve the current “COMPLETE” status based on repository evidence.

Use one of:

* PASS
* PASS WITH MATERIAL DEFECTS
* FAIL

### 2. Critical findings

Only CRITICAL/HIGH findings.

### 3. Detailed findings

Table:

| ID | Severity | Area | File(s) | Requirement | Finding | Evidence | Impact |
| -- | -------- | ---- | ------- | ----------- | ------- | -------- | ------ |

### 4. State-machine failures

List broken or unsafe transitions separately.

### 5. Security/data-integrity findings

List separately.

### 6. WebSocket findings

List every socket creation/listener/lifecycle issue separately.

### 7. Canonical-rule violations

Map findings to L1–L17.

### 8. Missing test coverage

Only critical/high-value gaps.

### 9. False confidence risks

Identify places where the implementation appears complete but repository evidence suggests otherwise.

### 10. Recommended remediation order

Do not implement the fixes. Give an ordered remediation plan only.

If the repository contains ambiguity that prevents a reliable conclusion, explicitly identify it and explain exactly what evidence is missing.

Do not change code merely to make tests pass.

The goal is not to praise the previous implementation. The goal is to find where it can fail.


#### Prompt 2 — GLM-5.3 — Backend, WebSocket & Business-Logic Skeptic

You are performing a **deep adversarial skeptic audit** of the Ride application's backend, WebSocket dispatch layer, database interactions, financial logic, authorization, and ride state machines.

**DO NOT MODIFY CODE.**

Assume previous implementation work may contain subtle race conditions, authorization defects, duplicated event handling, incorrect state transitions, monetary errors, or violations of write ownership.

Your objective is to find defects that could survive a normal code review.

## Scope

Concentrate on:

* `app/api/`
* `utils-server/`
* `src/db/`
* `lib/`
* `utils-server/dispatch*`
* WebSocket client utilities
* Zustand stores involved in ride/driver state
* authentication/session utilities
* payment/event/accounting code
* ride lifecycle code
* document/verification code
* relevant tests

Use the canonical Ride App UI/UX Rethink 3 v3.0 plan as the specification.

The actual stack uses Expo API routes plus a separate Node.js/TypeScript WebSocket dispatch service, PostgreSQL/Supabase with Drizzle, PortPos, and H3-based dispatch.

## 1. WebSocket singleton audit

Prove or disprove:

* Driver Home is the only driver-side socket creator.
* Services Hub owns the rider session socket.
* Other screens only use `addEventListener("message")`.
* There are no fallback socket creators.
* There are no duplicate connections caused by navigation.
* Reconnection does not create duplicate logical sessions.
* Event listeners are removed correctly.
* Authentication handshake cannot be duplicated incorrectly.
* Heartbeats cannot multiply.
* Location updates cannot multiply.
* A stale socket cannot continue issuing ride actions after the screen/session changes.

Trace the complete lifecycle:

`create -> connect -> auth:hello -> auth:ok -> listeners -> heartbeat/location -> reconnect -> cleanup -> close`

Report every place where the actual lifecycle differs from the canonical architecture.

## 2. WebSocket protocol audit

The canonical protocol includes:

Inbound:

* `auth:hello`
* `heartbeat`
* `location:update`
* `fetch:confirm`
* `offer:accept`
* `offer:reject`
* `ride:arrived`
* `ride:start`
* `ride:complete`
* `chat:typing`

Outbound:

* `auth:ok`
* `auth:error`
* `ride:offer`
* `fetch:confirmed`
* `fetch:error`
* `offer:accepted`
* `offer:rejected`
* `offer:lost`
* `ride:arrived`
* `ride:started`
* `ride:start_failed`
* `ride:completed`
* `ride:cancelled`
* `location:driver`
* `chat:message`
* `chat:typing`
* `error`

The plan explicitly says these should NOT be handled:

* `ride:offer_expired`
* `ride:offer_cancelled`
* `ride:status_update`
* `subscription:expired`

Verify the actual implementation against this contract.

Look for:

* misspelled events
* undocumented events
* inconsistent payloads
* client/server type mismatches
* events handled but never emitted
* events emitted but not handled
* event handlers with unsafe assumptions
* event handlers that mutate state without validating ride ownership/state

## 3. Ride-state race-condition audit

For every transition in the rider and driver state machines, ask:

“What happens if the same action happens twice?”

Examples:

* double accept
* double reject
* accept after offer loss
* arrive twice
* start twice
* complete twice
* cancel while completion is occurring
* cancel after ride entered in-progress
* rating twice
* reconnect during an action
* HTTP request retry after timeout
* WebSocket event arriving after HTTP success
* stale event arriving after navigation

Identify whether the server is authoritative and whether operations are idempotent or safely rejected.

## 4. Authorization / ownership audit

Attempt IDOR/BOLA-style reasoning against:

* rides
* rider data
* driver data
* documents
* payout methods
* wallet data
* due amounts
* subscriptions
* call ledger
* ratings
* SOS alerts
* lost items
* fare disputes
* chat
* public tracking

For every endpoint accepting an ID, verify that the authenticated actor is authorized to access that resource.

Do not trust client-supplied:

* role
* user ID
* driver ID
* rider ID
* ownership
* ride state
* payment status

## 5. Money integrity audit

The canonical rule is:

**Integer paisa everywhere; divide by 100 only at display.**

Trace:

* fare calculation
* surge
* tips
* cancellation fees
* driver earnings
* wallet
* due amounts
* subscriptions
* packages
* pass purchases
* PortPos amounts
* accounting entries
* tax ledgers
* call ledger
* payment events

Find:

* floating point arithmetic
* inconsistent units
* duplicate conversion
* wrong database column semantics
* client-controlled fare values
* client-controlled payout values
* race conditions causing double accounting
* missing transactions
* inconsistent rounding

Do not merely search for `/100`. Follow the value.

## 6. Transaction and write-ownership audit

The plan requires transactions for writes touching:

* `call_ledger`
* `subscriptions`
* `payment_events`
* `tax_ledgers`
* `accounting_entries`
* `accounting_entry_lines`

Verify this from actual code.

The plan also specifies:

* `call_ledger` deductions ONLY in `utils-server/heartbeat.ts`
* `payment_events` creation ONLY in `lib/paymentEvents.ts`

Search for every write to these tables and prove whether ownership is respected.

Identify bypasses.

## 7. PortPos security audit

For every PortPos callback/IPN path:

1. Determine whether the request is authenticated/validated.
2. Determine whether `portposClient.verifyIPN()` runs before state mutation.
3. Determine whether verification is performed against the correct transaction/reference.
4. Determine whether duplicate callbacks are idempotent.
5. Determine whether a malicious callback could create or modify payment state.

Any state mutation before IPN verification is at least HIGH severity unless demonstrably harmless.

## 8. API boundary audit

Verify the AGENTS rules:

* Zod at every API boundary
* `parseJsonBody` for POST bodies
* UUID validation for route parameters
* `{ id }` Expo parameter convention
* snake_case DB properties
* correct NULL checks
* no unsafe `any`
* no `@ts-ignore`
* no `console.log`

Do not report permitted Drizzle enum casts as violations without checking their context.

## 9. Driver activation audit

The plan explicitly requires:

**Manual admin activation.**

Trace:

document submission -> verification -> admin review -> driver status -> activation.

Prove that:

* document approval does not automatically activate
* client cannot activate itself
* driver cannot forge active state
* verification screen accurately reflects server state
* legacy `/api/driver/verify-driver` usage is actually gone

## 10. Driver payout audit

Verify:

* bKash only
* `^01\d{9}$`
* no bank/Nagad payout fields
* payout ownership checks
* payout mutation authorization
* no client-controlled payout recipient
* appropriate transaction/error handling

## 11. Public tracking audit

Inspect:

`app/track/[rideId].tsx`

and its supporting APIs.

Determine exactly what unauthenticated users can retrieve.

Ask whether a user who knows a ride ID can enumerate or expose:

* rider identity
* driver identity
* phone numbers
* precise location
* historical route
* sensitive metadata

Compare actual behavior to the intended public tracking requirement.

## 12. Failure and recovery audit

Analyze:

* database unavailable
* WebSocket unavailable
* API timeout
* duplicate requests
* stale sessions
* expired auth
* malformed API responses
* malformed `fare_breakdown`
* missing driver
* missing rider
* deleted vehicle
* rejected document
* PortPos timeout
* PortPos duplicate callback
* dispatch failure

Look for code paths that leave the ride in an inconsistent state.

## Final output

Do not modify anything.

Produce:

### Verdict

PASS / PASS WITH MATERIAL DEFECTS / FAIL

### Findings

| ID | Severity | Domain | File | Function | Attack/Failure Scenario | Evidence | Impact |
| -- | -------- | ------ | ---- | -------- | ----------------------- | -------- | ------ |

### Race Conditions

List every credible race condition separately.

### Financial Integrity

List every money/accounting defect separately.

### Authorization

List every ownership/authorization defect separately.

### WebSocket

List every lifecycle/protocol defect separately.

### State Machine

List every invalid transition or unsafe transition separately.

### Remediation Priority

Rank only the fixes that should be performed next.

Do not implement fixes.

Be adversarial. A previous implementation being marked “complete” is not evidence of correctness.


#### Prompt 3 — DeepSeek V4 Flash — UI/UX and Canonical Screen Skeptic Audit

You are performing a **focused CODE SKEPTIC AUDIT** of the Ride application's React Native UI implementation.

**DO NOT MODIFY CODE.**

Assume the screens marked “Complete” in the canonical Ride App UI/UX Rethink 3 v3.0 plan may contain incomplete or inconsistent implementations.

Your job is to identify concrete deviations from the canonical plan.

## Repository inspection

First inspect:

* `AGENTS.md`
* theme utilities
* shared components
* all rider screens
* all driver screens
* auth screens
* settings screens
* relevant navigation files
* relevant map components
* package configuration

Do not rely on filenames alone.

## Audit 1 — Theme Pattern A

The mandatory pattern is:

`useIsDark()` from `lib/useAppearance.ts`

with inline color ternaries.

Search all relevant screens for:

* NativeWind `dark:` classes
* `theme === "dark"`
* `theme === "dark" || theme === "system"`
* hard-coded colors that break either theme
* inconsistent color tokens
* missing dark-mode colors
* missing light-mode colors

Verify that screens use the canonical theme source rather than inventing their own theme state.

## Audit 2 — StatusBar

Every screen owns its own StatusBar except the explicit Splash behavior.

Check:

* `barStyle`
* background color
* light/dark correctness
* translucent behavior where specified
* missing StatusBar
* contradictory nested StatusBar behavior

## Audit 3 — Theme toggle

Verify the sun/moon toggle exists on every applicable screen.

Check:

* 40x40dp target
* correct icon
* correct color
* correct surface/border
* correct toggle behavior
* Splash is the only explicit exception

## Audit 4 — Icons

Search production UI for emoji and non-Ionicons icon libraries.

Report only actual production UI violations.

## Audit 5 — Typography

Verify:

**Rider**

* Display 28
* Heading 18
* Body 15
* Label 13
* Caption 11
* Metric 36
* ETA 20

**Driver**

* Display 32
* Heading 22
* Body 18
* Label 14
* Caption 12
* Metric 40
* ETA 24

Check Plus Jakarta Sans usage and identify obvious system-font leakage.

## Audit 6 — Touch targets

Verify:

* Rider minimum 48x48dp
* Driver minimum 56x56dp
* critical actions 64x64dp or full-width 56dp

Pay special attention to:

* driver action buttons
* emergency actions
* slide controls
* navigation controls
* small icon-only buttons
* theme toggles

## Audit 7 — Bangladesh-first constraints

Look for violations of:

* light-first usability
* high contrast
* cheap Android performance
* minimal blur
* limited shadows
* limited animation
* large touch targets
* offline indicators
* retry states
* GPS fallback
* driver glanceability
* low-end GPU constraints

Do not turn subjective design preference into a finding unless it conflicts with the canonical specification.

## Audit 8 — Rider screens

Verify the important requirements for:

* Services Hub
* Home/Booking
* Finding Driver
* Ride Tracking
* Rate Driver
* Rides
* Ride Detail
* Wallet
* Profile
* Inbox
* Schedule Ride
* Cancel Reason
* Emergency SOS
* Promos
* Fare Dispute
* Lost Items
* Ride Pass
* Public tracking
* Book for someone else

Check actual implementation against the specified behavior, not just visual appearance.

## Audit 9 — Driver screens

Verify:

* Driver Home
* Reach Customer
* Finish Ride
* Rate Rider
* Break Mode
* Enter OTP
* Cancellation
* Onboarding
* Documents
* Verification
* Earnings
* Activity
* Wallet
* Profile
* Settings
* Vehicle Management
* Hotspot Map
* Subscriptions
* Performance
* Rider No-Show

Pay special attention to requirements explicitly marked as deletions:

* fallback WebSocket creators
* `verifyReached`
* `verifyReachedStage`
* unreachable modal JSX
* legacy onboarding flows
* legacy verification API usage

## Audit 10 — Shared components

Check the existing components against the plan:

* AuthLayout
* CustomButton
* OtpInput
* SplashAnimation
* ThemeToggle
* Map
* BarikoiAutocomplete
* FloatingNavMenu
* FareBreakdownSheet
* RideCard
* RideOfferSheet
* CountdownRing
* SlideButton
* SOSButton
* SchedulePicker
* PaymentWebView
* LoadingRider
* DocumentUploadCard
* ErrorFindDriver
* DriverStatusBadge
* ChatScreen
* DriverNavigation
* InputField
* VehicleCategoryCard

Also determine whether the listed new components exist where already expected.

## Audit 11 — Gallery-only rule

Search for camera APIs.

The plan requires gallery-only image selection.

Report any production camera invocation.

## Audit 12 — Navigation

Verify:

* riders use hamburger/FAB rather than an unintended bottom-tab navigation architecture
* Services Hub is the rider post-auth entry
* rate-driver receives `rideId`
* ride tracking receives `ride_id`
* driver routes preserve expected parameters
* there are no obvious dead links
* there are no links to deleted legacy flows

## Audit 13 — Loading/error/empty states

Look for screens that assume:

* API always succeeds
* data is never null
* fare breakdown always has expected shape
* driver/rider always exists
* network never fails
* location is always available

Report concrete unsafe assumptions.

## Audit 14 — Performance

Look for:

* unbounded polling
* excessive animation loops
* expensive blur
* excessive shadows
* huge images
* unnecessary rerenders
* missing list virtualization
* map components recreated unnecessarily

Focus on issues likely to affect low-end Android devices.

## Finding rules

Every finding requires:

* file
* component/function
* exact issue
* relevant canonical requirement
* severity
* concrete evidence

Use:

* CRITICAL
* HIGH
* MEDIUM
* LOW
* INFO

Do not report mere aesthetic disagreement.

Do not modify anything.

## Final report

### Verdict

PASS / PASS WITH MATERIAL DEFECTS / FAIL

### Findings

| ID | Severity | Area | File | Requirement | Evidence | Impact |
| -- | -------- | ---- | ---- | ----------- | -------- | ------ |

### Theme Violations

### Navigation Violations

### Screen Contract Violations

### Shared Component Violations

### Performance Concerns

### Missing/Weak Test Coverage

### Recommended Fix Order

Do not implement fixes.


#### Prompt 4 — MiMo 2.5 Pro — Independent Skeptic Review

Perform an **INDEPENDENT CODE SKEPTIC REVIEW** of the current Ride repository against the canonical:

**Ride App — UI/UX Rethink 3: Master Planning File — Canonical v3.0**

Do NOT modify any code.

Previous agents may have already produced audit reports. If those reports are available in the workspace, read them, but do NOT assume their findings are correct.

Your role is specifically to challenge both:

1. the implementation, and
2. the previous auditors' conclusions.

## Independence requirement

Do not begin by checking whether the previous audit findings are correct.

First independently inspect the repository and form your own conclusions.

Then compare your conclusions with the previous reports.

For every disagreement, explain why.

## Priority areas

Focus particularly on:

1. L1–L17 locked architecture decisions
2. Rider booking state machine
3. Driver work state machine
4. Auth state machine
5. WebSocket singleton ownership
6. API/client contract consistency
7. authorization and resource ownership
8. money/paisa integrity
9. database transaction requirements
10. call ledger/payment event write ownership
11. PortPos callback verification
12. manual driver activation
13. deletion of legacy flows
14. theme Pattern A
15. rider/driver navigation
16. offline/retry/error behavior
17. public ride tracking privacy
18. test coverage of high-risk behavior

## Skeptic methodology

For each important feature ask:

* What assumption does this implementation make?
* Can that assumption become false?
* What happens on duplicate events?
* What happens after reconnect?
* What happens if the API succeeds but navigation fails?
* What happens if navigation succeeds but the API response is stale?
* What happens if the user retries?
* What happens if two devices act on the same account?
* What happens if a malicious client modifies request parameters?
* What happens if a database transaction partially fails?
* What happens if a WebSocket message arrives late?
* What happens if the app is killed and relaunched?
* What happens if the network disappears during the operation?

## Evidence standard

Do not report hypothetical issues without a credible code path.

Every finding must identify:

* file
* symbol
* actual code/data flow
* canonical requirement
* failure scenario
* impact
* severity

## Severity

Use:

* CRITICAL
* HIGH
* MEDIUM
* LOW
* INFO

Do not inflate severity.

## Compare previous audits

If previous audit reports exist, produce:

### Confirmed Findings

Findings you independently verified.

### Rejected Findings

Previous findings that are demonstrably false or unsupported.

### Missed Findings

Important defects the previous auditors failed to identify.

### Disputed Findings

Findings where reasonable interpretation differs.

### Severity Corrections

Cases where the previous severity is too high or too low.

## Final verdict

State one:

* PASS
* PASS WITH MATERIAL DEFECTS
* FAIL

Then provide:

### Top 10 Issues

Rank by actual production risk, not cosmetic importance.

### Canonical Compliance Matrix

| Requirement | Status | Evidence | Risk |
| ----------- | ------ | -------- | ---- |

### State Machine Assessment

### WebSocket Assessment

### Security Assessment

### Financial/Data Integrity Assessment

### UI/UX Contract Assessment

### Test Coverage Assessment

### Recommended Remediation Sequence

Do not implement any remediation.

Your purpose is independent verification and adversarial review, not code modification.

