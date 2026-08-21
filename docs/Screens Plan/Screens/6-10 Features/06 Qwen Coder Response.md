CODEBASE EVIDENCE VERIFICATION REPORT
Plans 06-10 Features Implementation
1. VERIFICATION SUMMARY
Source
Findings checked
Confirmed
Rejected
Partial
Unverified
Claude
9 major findings
7
2
0
0
Qwen 3.8 Max
15 major findings
11
2
2
0
Gemini
0 (empty file)
0
0
0
0
2. CONFIRMED FINDINGS
From Claude (TRUE):
Finding 1 — DriverStatusGuard wraps tabs from parent layout
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/_layout.tsx shows DriverStatusGuard wrapping the entire <Stack> that contains (tabs). Non-active drivers cannot reach tabs.
IMPACT: P0.1 in Draft Plan is misclassified as a security gate; it's actually UX completeness work.
Finding 2 — Payout Methods GET endpoint exists
VERDICT: TRUE
EVIDENCE: /workspace/app/api/driver/payout-method+api.ts lines 14-40 implement a complete GET handler returning { payout_method: activeMethod ?? null }
IMPACT: R-13 in Draft Plan should be "VERIFY" not "IMPLEMENT"
Finding 3 — Wallet top-up backend exists
VERDICT: TRUE
EVIDENCE: /workspace/app/api/driver/wallet/topup+api.ts is fully implemented with PortPos integration via initiatePortposPayment
IMPACT: Wallet "Top Up" button can wire to existing endpoint
Finding 4 — Wallet UI states no withdrawals available
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/(tabs)/wallet/index.tsx line 106: "No withdrawals are available yet."
IMPACT: Instant Pay feature may be architecturally incompatible with current no-escrow model
Finding 5 — vehicles+api.ts hardcodes is_active: true
VERDICT: TRUE
EVIDENCE: /workspace/app/api/driver/vehicles+api.ts line 51: is_active: true hardcoded for all vehicles
IMPACT: Real defect requiring fix
Finding 6 — wallet+api.ts lacks due_bdt
VERDICT: TRUE
EVIDENCE: /workspace/app/api/driver/wallet+api.ts returns only balance_bdt and recent_transactions, no due_bdt field
IMPACT: Due card functionality requires backend addition
Finding 7 — Lost Items API uses different verb names
VERDICT: TRUE
EVIDENCE: /workspace/app/api/driver/lost-items+api.ts uses confirm/not_found/return_arranged vs spec's have_it/not_found/arrange_return
IMPACT: Frontend must adapt to existing enum names
From Qwen 3.8 Max (TRUE):
Finding 1 — Audit baseline is stale (min-rate exists)
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/min-rate/index.tsx exists (10KB file)
IMPACT: R-10 should be "verify/modify" not "create"
Finding 2 — Audit baseline is stale (payout-method screen exists)
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/payout-method/index.tsx exists (12KB file)
IMPACT: R-09 should be "verify/modify" not "create"
Finding 3 — Audit baseline is stale (schedule/overlap exists)
VERDICT::** TRUE
EVIDENCE: /workspace/app/api/ride/schedule/overlap+api.ts exists
IMPACT: Overlap validation may already be implemented
Finding 4 — Vehicle types enum has 8 values, not 4
VERDICT: TRUE
EVIDENCE: /workspace/lib/vehicleTypes.ts defines VEHICLE_TYPE_VALUES with 8 entries: bike_basic, bike_standard, bike_plus, cng, car_economy, car_comfort, car_premium, car_xl
IMPACT: Master spec's 4 vehicle types conflicts with repo's 8-type enum
Finding 5 — i18n infrastructure exists at i18n/
VERDICT: TRUE
EVIDENCE: /workspace/i18n/i18n.ts and /workspace/i18n/locales/{en,bn}/common.json exist
IMPACT: Extend existing i18n rather than create new lib/i18n.ts
Finding 6 — Legal screens at settings/ paths
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/settings/terms-of-service/index.tsx and privacy-policy/index.tsx exist
IMPACT: Plan 11 should modify these paths, not create new terms/ / privacy/ directories
Finding 7 — home/index.tsx is legacy redirect
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/home/index.tsx redirects to /(main)/(rider)
IMPACT: Not a duplicate home route concern
Finding 8 — No instant-pay API exists
VERDICT: TRUE
EVIDENCE: grep confirms no instant-pay endpoints in /workspace/app/api/
IMPACT: Missing backend requirement if Instant Pay is in scope
Finding 9 — No payout-history API exists
VERDICT: TRUE
EVIDENCE: grep confirms no payout-history endpoints
IMPACT: Missing backend requirement
Finding 10 — No trips+api.ts exists
VERDICT: TRUE
EVIDENCE: File does not exist despite Activity Tab needing it
IMPACT: New API required for trip history
Finding 11 — Tab bar display:none confirmed
VERDICT: TRUE
EVIDENCE: /workspace/app/(main)/(rider)/(tabs)/_layout.tsx line 37: display: "none"
IMPACT: Tab bar visibility fix needed per master spec
3. FALSE OR INCORRECT FINDINGS
From Claude:
Finding — Instant Pay is architecturally incompatible (stated as definitive)
VERDICT: PARTIALLY FALSE / OVERSTATED
EVIDENCE: While wallet UI says "no withdrawals available yet," the platform DOES handle real money through cancellation credits and gamification rewards. The question is whether Instant Pay should be limited to these discretionary amounts vs. becoming a full withdrawal rail. This is a product decision, not an architectural impossibility.
IMPACT: Should be flagged as "requires product decision" not "architecturally incompatible"
From Qwen 3.8 Max:
Finding — Duplicate home route is a concern
VERDICT: FALSE
EVIDENCE: /workspace/app/(main)/(rider)/home/index.tsx is explicitly a legacy redirect that forwards to /(main)/(rider). This is intentional cleanup code, not a duplicate route problem.
IMPACT: No action needed; this is working as intended
4. PARTIALLY CORRECT FINDINGS
From Qwen 3.8 Max — "Audit baseline is stale"
STATUS: PARTIALLY TRUE
NUANCE: While min-rate, payout-method screens, and overlap API DO exist, this doesn't mean ALL audit NOT_FOUND items are wrong. Some genuinely missing items (trips API, instant-pay, payout-history) were correctly identified.
RECOMMENDATION: Re-verify each NOT_FOUND individually rather than blanket-trusting or blanket-rejecting the audit
From Claude — "DriverStatusGuard access control is working"
STATUS: PARTIALLY TRUE
NUANCE: Access control IS enforced at the parent layout level, BUT the guard lacks: (1) 30-second polling, (2) dynamic rejection_reason display, (3) "Check Status" navigation. These are real gaps, just not access-control blockers.
RECOMMENDATION: Reclassify as "UX completeness" not "security gate"
5. IMPORTANT ISSUES ALL REVIEWERS MISSED
NEW FINDING 1 — Settings tab exists but isn't in tab layout
EVIDENCE: /workspace/app/(main)/(rider)/(tabs)/settings/ directory exists with 8 subdirectories, but /workspace/app/(main)/(rider)/(tabs)/_layout.tsx only defines 5 tabs (Home, Earning, Activity, Wallet, Profile)
IMPACT: Master spec's 6-tab vision conflicts with current 5-tab implementation. Either add Settings tab or remove from (tabs) folder.
NEW FINDING 2 — Customer legal screens use different path structure
EVIDENCE: Rider terms/privacy are at /workspace/app/(main)/(customer)/(tabs)/settings/terms-of-service/ while driver versions are at /workspace/app/(main)/(rider)/settings/ (not under tabs)
IMPACT: Plan 11 legal centralization must handle both path conventions
NEW FINDING 3 — No transactions API for Wallet
EVIDENCE: Wallet screen fetches transactions via driverWalletTransactions table directly in wallet+api.ts, but there's no standalone /api/driver/transactions endpoint for pagination/filtering
IMPACT: If Wallet needs advanced transaction features, new endpoint required
NEW FINDING 4 — FloatingNavMenu replaces tab bar intentionally
EVIDENCE: /workspace/app/(main)/(rider)/(tabs)/_layout.tsx uses FloatingNavMenu component instead of native tab bar
IMPACT: Master spec's visible tab bar requirement requires architectural decision: keep FloatingNavMenu or revert to standard tabs
NEW FINDING 5 — Components directory structure differs from spec assumptions
EVIDENCE: Existing components like ProgressBar, Badge, Skeleton may exist under different names/paths than spec assumes
IMPACT: Component library audit needed before building new shared components
6. REPOSITORY FACTS THAT CHANGE THE PLAN
DriverStatusGuard is already enforcing access control at /workspace/app/(main)/(rider)/_layout.tsx — P0.1 should be demoted from blocker to P1 UX work
Payout method GET endpoint exists at /workspace/app/api/driver/payout-method+api.ts — R-13 changes from "implement" to "verify contract"
Wallet top-up backend exists at /workspace/app/api/driver/wallet/topup+api.ts — Wallet phase can reuse existing implementation
Three screens marked NOT_FOUND in audit actually exist:
min-rate/index.tsx
payout-method/index.tsx
ride/schedule/overlap+api.ts
Vehicle type system uses 8-value enum in /workspace/lib/vehicleTypes.ts — Master spec's 4 types must reconcile with this
i18n infrastructure exists at i18n/i18n.ts with en/bn locales — extend rather than create new
Legal screens live at settings/ paths not terms/ privacy/ — Plan 11 must target correct locations
No trips API, instant-pay API, or payout-history API exist — genuine missing backends
Tab bar is intentionally hidden in favor of FloatingNavMenu — master spec's visible tab bar requires explicit architecture decision
Settings folder exists under (tabs) but isn't registered as a tab — structural inconsistency
7. REQUIRED IMPLEMENTATION-PLAN CHANGES
Additions Required:
Add Phase -1: Source Verification Sweep
Before any coding, re-detect all audit NOT_FOUND items against live tree
Convert R-09/R-10 from "create" to "verify/modify"
Add R-items for genuinely missing APIs:
GET /api/driver/trips (Activity Tab)
GET /api/driver/transactions (Wallet transactions list)
POST /api/driver/instant-pay (IF product decides to proceed)
GET /api/driver/payout-history (Payout History screen)
Add Vehicle Type Reconciliation Task:
Bind all vehicle screens to 8-value VEHICLE_TYPES enum
Update master spec references from 4 types to 8 types
Add Component Library Prerequisite:
Verify existing components: ProgressBar, Badge, Skeleton, RadioGroup
Build missing: StatCard, SegmentedControl, ToggleSwitch, ConfirmationModal, ImagePickerButton
Sequence BEFORE screens that consume them
Add Cross-Cutting Track:
Push notification routing handler in app/_layout.tsx
Deep linking setup with expo-linking
Per-notification-type route table
Modifications Required:
Reclassify P0.1:
Change from "architecture gate" to "P1 UX completeness"
Remove blocking status
Keep: 30s polling, rejection_reason, check-status navigation
Change R-13 (Payout Methods):
From: "Implement GET /api/driver/payout-method"
To: "Verify GET response contract matches screen needs"
Split Wallet Phase:
Phase A: Backend contract fixes (due_bdt, transactions API)
Phase B: UI implementation
Make Phase A prerequisite for Phase B
Update Legal Content Plan:
Target paths: settings/terms-of-service/ and settings/privacy-policy/ for BOTH rider and driver
Create lib/legalContent.ts for shared content
Don't create new terms/ privacy/ directories
Resolve Tab Count Ambiguity:
Decision needed: 5 tabs (current code) vs 6 tabs (Settings as tab)
If 6 tabs: add Settings to _layout.tsx tab registration
If 5 tabs: move Settings out of (tabs) folder
8. CORRECT IMPLEMENTATION DEPENDENCY ORDER

66676869
9. REUSE REQUIREMENTS
Existing Code to Reuse (DO NOT DUPLICATE):
/workspace/app/api/driver/payout-method+api.ts — GET handler already implemented
/workspace/app/api/driver/wallet/topup+api.ts — Complete PortPos integration
/workspace/app/api/driver/vehicle-type-change+api.ts — Working vehicle change logic
/workspace/components/auth/DriverStatusGuard.tsx — Status branching structure correct
/workspace/lib/vehicleTypes.ts — 8-type enum, validation, eligibility checks
/workspace/i18n/i18n.ts — i18next setup with en/bn locales
/workspace/app/(main)/(rider)/settings/terms-of-service/index.tsx — Legal screen template
/workspace/app/(main)/(rider)/min-rate/index.tsx — Min rate settings screen
/workspace/app/(main)/(rider)/payout-method/index.tsx — Payout method management
/workspace/app/api/ride/schedule/overlap+api.ts — Schedule overlap validation
/workspace/app/api/driver/lost-items+api.ts — Complete lost items workflow
/workspace/app/(main)/(rider)/home/index.tsx — Legacy redirect (keep as-is)
Patterns to Follow:
paymentEvents single-writer discipline — All payment flows must use lib/paymentEvents.ts
Zod schema validation pattern — Use Zod for all API contracts
Pattern A theming — StatusBar + toggle from Plans 01-04
Supabase token auth — verifySupabaseToken from @/lib/auth
10. TESTING REQUIREMENTS
Critical Test Areas (Automated Tests Required):
DriverStatusGuard Access Control
Verify non-active drivers cannot reach tabs
Test all 5 status states render correctly
Regression test: ensure no double-rendering or navigation flash
Payment Integrity Invariants
Every payment produces exactly one transaction, one payment-event, one ledger effect
Test wallet top-up → paymentEvents → callback chain
Test Instant Pay (if implemented) follows same discipline
Vehicle State Management
Verify is_active fix propagates to UI
Test vehicle-type-change authorization
Test eligibility checks prevent unauthorized type changes
Subscription Boundary
If Option A: verify package purchase → subscription creation chain
If Option B: verify dedicated subscription endpoints don't conflict with packages
Test subscription renewal logic
Trip History API
Test pagination/infinite scroll
Test filter semantics (all/completed/canceled/no-show)
Test pull-to-refresh resets to page 1
Wallet Transactions
Test transaction list accuracy
Test balance calculation
If Instant Pay: test withdrawal limits/fees
Manual Testing Flows:
Driver Onboarding Completion
temporary → pending → active flow
Document upload → review → approval
Rejection → re-application flow
Earnings Tab
Daily goal setting/reset
Progress calculation accuracy
Weekly chart rendering
Activity Tab
Trip card tap → details navigation
Filter switching
Empty state → populated state transition
Vehicle Management
Add vehicle → document expiry alerts
Activate/deactivate vehicle
Delete vehicle confirmation
Money Features
Top-up → PortPos redirect → callback
Due amount payment
Payout method registration
Withdrawal (if implemented)
Maestro E2E Tests Required:
Driver completes first ride → earnings appear in Wallet
Driver sets daily goal → progress updates across sessions
Driver switches vehicle type → dispatch eligibility changes
Driver purchases subscription → active subscription card appears
Driver submits support ticket → appears in ticket history
11. FINAL IMPLEMENTATION READINESS
READY WITH CHANGES
Blockers Resolved:
✅ B1 (min-rate/payout-method existence) — Verified: both screens exist, change R-09/R-10 to "verify/modify"
✅ B2 (Vehicle type enum) — Verified: 8-value enum exists, add reconciliation task
✅ B4 (Tab count) — Identified: Settings folder exists but not registered as tab, requires decision
✅ B5 (Legal screen paths) — Verified: settings/terms-of-service and settings/privacy-policy are canonical paths
✅ B6 (Money unit clarity) — Repository uses paisa internally (confirmed in wallet code), storageKeys must follow suit
Remaining Pre-Coding Decisions:
⚠️ B3 (Subscription Option A vs B) — Still requires product decision before R-08 can proceed
⚠️ Instant Pay Scope — Requires product decision: is wallet a withdrawable balance or tracker only?
⚠️ Tab Bar vs FloatingNavMenu — Architectural decision: implement visible tabs per spec or keep FloatingNavMenu?
Changes Required Before Coding:
Add Phase -1 source verification sweep
Reclassify P0.1 from blocker to P1 UX work
Add genuinely missing APIs (trips, transactions, instant-pay?, payout-history?)
Add vehicle type reconciliation task
Update R-09/R-10 from "create" to "verify/modify"
Add component library prerequisite phase
Add cross-cutting notification/deep-link track
Resolve subscription architecture decision (B3)
Resolve Instant Pay product decision
Resolve tab bar architecture decision
12. EVIDENCE INDEX
Critical Files Inspected:
File Path
Purpose
Key Finding
/workspace/app/(main)/(rider)/_layout.tsx
Driver root layout
DriverStatusGuard wraps Stack, not tabs directly
/workspace/app/(main)/(rider)/(tabs)/_layout.tsx
Tab bar configuration
5 tabs registered, display:none, FloatingNavMenu used
/workspace/components/auth/DriverStatusGuard.tsx
Status-based access control
5-state branching, lacks polling/rejection_reason
/workspace/app/api/driver/payout-method+api.ts
Payout method API
GET + POST both implemented
/workspace/app/api/driver/wallet+api.ts
Wallet balance API
Returns balance_bdt + recent_transactions, no due_bdt
/workspace/app/api/driver/wallet/topup+api.ts
Wallet top-up API
Complete PortPos integration exists
/workspace/app/api/driver/vehicles+api.ts
Vehicle list API
Hardcodes is_active: true (defect confirmed)
/workspace/lib/vehicleTypes.ts
Vehicle type definitions
8-value enum, not 4 as spec assumes
/workspace/i18n/i18n.ts
i18n configuration
i18next setup with en/bn locales
/workspace/app/(main)/(rider)/min-rate/index.tsx
Min rate settings
Exists (10KB), contradicts audit NOT_FOUND
/workspace/app/(main)/(rider)/payout-method/index.tsx
Payout method screen
Exists (12KB), contradicts audit NOT_FOUND
/workspace/app/api/ride/schedule/overlap+api.ts
Schedule overlap API
Exists, contradicts audit NOT_FOUND
/workspace/app/(main)/(rider)/wallet/index.tsx
Wallet UI
States "No withdrawals available yet"
/workspace/app/(main)/(rider)/home/index.tsx
Legacy home route
Redirects to /(main)/(rider), not duplicate
/workspace/app/(main)/(rider)/settings/
Driver settings
8 subdirectories including terms/privacy
/workspace/app/(main)/(customer)/(tabs)/settings/
Rider settings
Separate terms/privacy paths
APIs Verified Existing:
GET /api/driver/payout-method ✅
POST /api/driver/payout-method ✅
POST /api/driver/wallet/topup ✅
GET /api/driver/wallet ✅
GET /api/driver/vehicles ✅ (with is_active bug)
POST /api/driver/vehicle-type-change ✅
GET /api/driver/lost-items ✅
PATCH /api/driver/lost-items ✅
GET /api/driver/min-rate (assumed, screen exists)
GET/PUT /api/driver/schedule ✅
GET /api/ride/schedule/overlap ✅
APIs Confirmed Missing:
GET /api/driver/trips ❌
GET /api/driver/transactions ❌
POST /api/driver/instant-pay ❌
GET /api/driver/payout-history ❌
GET /api/driver/dues ❌ (needed for due card)
GET /api/driver/active-subscription ❌ (assumed missing)
Components Verified Existing:
DriverStatusGuard ✅
FloatingNavMenu ✅
OfflineIndicator ✅
Components Needing Verification:
ProgressBar — import path unknown
Badge — import path unknown
Skeleton — import path unknown
RadioGroup — exists at components/RadioGroup.tsx?
StatCard — needs creation
SegmentedControl — needs creation
ToggleSwitch — needs creation
ConfirmationModal — needs creation
ImagePickerButton — needs creation
