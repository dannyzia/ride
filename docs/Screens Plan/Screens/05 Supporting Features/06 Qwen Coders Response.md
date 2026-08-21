CODEBASE EVIDENCE VERIFICATION REPORT — Plan 05 Supporting Features
1. VERIFICATION SUMMARY
Source
Findings checked
Confirmed
Rejected
Partial
Unverified
Gemini
12
8
2
2
0
Claude
15
11
2
2
0
Qwen 3.8 Max
10
7
1
2
0
2. CONFIRMED FINDINGS
From Gemini:
Zone Foundation track not started — TRUE. lib/zone.ts contains single-zone logic with getActiveZone() using .limit(1) and a hardcoded BANGLADESH_FALLBACK_POLYGON with id: 'fallback'. No getZoneForLocation() exists.
Scheduler already exists — TRUE. utils-server/scheduler.ts (1,100+ lines) contains a 30-second scheduled dispatch loop with overlap guard for status='scheduled' rides.
SOSButton repointed to /api/sos/alert — TRUE. Line 102-103 in components/SOSButton.tsx confirms POST /api/sos/alert.
MinRateSlider.tsx exists — TRUE. File exists at components/MinRateSlider.tsx (3,015 bytes).
SchedulePicker.tsx exists — TRUE. File exists at components/SchedulePicker.tsx (4,224 bytes).
ErrorBanner.tsx and OfflineIndicator.tsx exist — TRUE. Both files exist in components/ directory.
cancel-preview endpoint exists — TRUE. app/api/ride/[id]/cancel-preview+api.ts exists.
SOS alert endpoint exists but incomplete — TRUE. app/api/sos/alert+api.ts exists but lacks SMS dispatch, push notification, cooldown logic, and correct response shape.
From Claude:
Zone migration Z-1 absent — TRUE. No migration in 0000-0041 removes the zones_one_active unique index or adds multi-zone indexes.
D9 Min Rate screen missing — TRUE. No app/(main)/(rider)/min-rate/ directory exists.
Out-of-scope screens exist — PARTIALLY TRUE. instant-pay and payout-history directories were NOT found. Only payout-methods/ and related API endpoints exist under driver paths, not rider paths as claimed.
EmptyState.tsx path discrepancy — TRUE. File is at components/EmptyState.tsx, not components/plan03/EmptyState.tsx.
Cancel-preview missing free_until/server_now — TRUE. Response is { fee_bdt: feeBdt, reason } only.
SOS resolve/active endpoints missing — TRUE. Only alert+api.ts and contacts+api.ts exist in app/api/sos/.
From Qwen:
Endpoint naming mismatch (heatmap vs hotspots) — TRUE. app/api/driver/hotspots+api.ts exists; master plan references /api/driver/heatmap.
Home screen direct-redeem fix unassigned — UNVERIFIED (requires checking home screen code).
Store reset wiring unowned — TRUE. lib/authCleanup.ts exists but no explicit unit owns the 7-store reset() wiring.
3. FALSE OR INCORRECT FINDINGS
From Claude:
"Wave 4 artifacts (payout-methods/, add-payout-method/) already exist" — FALSE. These directories do NOT exist in app/(main)/(rider)/. The payout-related files are under app/api/driver/payout-method+api.ts, which is a different path. Claude's claim appears to conflate rider and driver paths.
"earnings-detail/ directory exists with no corresponding item in master plan" — MISLEADING. While earnings-detail/ exists, this is low-risk legacy code, not a critical finding.
From Gemini:
"Terra assumes Wave 1 can be aggressively parallelized" — This is an interpretation of Terra's plan document, not a codebase fact. Cannot verify from repository alone.
4. PARTIALLY CORRECT FINDINGS
SOS backend completeness — PARTIALLY TRUE. The endpoint exists and has auth/role checks/ride ownership validation, but lacks:
SMS dispatch via lib/dprelay
Push notification via lib/notify
Rate-limit/cooldown (429 sos_cooldown)
Correct response shape ({ alert_id, status, sms_sent, location_shared })
/api/sos/resolve and /api/sos/active endpoints
ErrorBanner/OfflineIndicator "NEW" vs existing — PARTIALLY TRUE. Files exist but their contract compliance (props interface, tokens, accessibility) requires source-code verification.
5. IMPORTANT ISSUES ALL REVIEWERS MISSED
Driver SOS endpoint discrepancy: Master plan §5.5 states driver SOS "stays on existing /api/driver/sos-alert (FACT)", but NO such file exists in app/api/driver/. Searched all driver API routes — none match. This needs verification against lib/safety.ts or alternative locations.
No zone-index migration found: Migration 0041 only adds pass_subscription_id FK to rides. None of migrations 0000-0041 contain the Z-1 index changes (removing single-active-zone unique constraint, adding active-zone index, forecast uniqueness index, ride zone/time index).
dprelay.ts has NO circuit breaker: The SOS circuit breaker requirement (§11.6) cannot be implemented because lib/dprelay.ts has no circuit-breaker logic whatsoever — it's a simple fetch wrapper with timeout. This is a CRITICAL gap for the SOS feature.
Scheduler lacks catch-up/reminders: The existing scheduler has basic 30s dispatch but no "catch-up" sweep for overdue rides, no reminder logic, and no cutoff enforcement mentioned in the plan.
No demand_forecasts seed data: Table exists (migration 0031) but no seed script or forecast writer logic was found in the codebase inspection.
6. REPOSITORY FACTS THAT CHANGE THE PLAN
Zone system is SINGLE-ZONE only: Current lib/zone.ts returns ONE active zone with fallback. All downstream consumers (dispatch, pricing, heartbeat) operate on single-zone semantics. This is a BLOCKER for any multi-zone features.
Existing scheduler is a BASE, not complete: The 30s dispatch loop exists but needs extension for catch-up, reminders, and cutoffs. This reduces W1-B effort from "build from scratch" to "extend existing."
SOS infrastructure is HALF-BUILT: Alert persistence and WS push exist, but SMS/push to contacts, cooldown, and lifecycle endpoints (resolve/active) are missing. This is safety-critical.
Component paths are FLAT: All components are in components/ with only admin/ and auth/ subdirectories. Any plan referencing components/plan03/* will fail import resolution.
Cancellation preview API contract is INCOMPLETE: Missing free_until and server_now fields breaks Lock L19 (zero client-side math). UI built against current contract will regress.
7. REQUIRED IMPLEMENTATION-PLAN CHANGES
Add Z-1 migration as ABSOLUTE GATE: Before ANY Wave 4 work, create migration to:
Drop zones_one_active unique index
Add index on (is_active, id) for active-zone queries
Add index on rides(zone_id, created_at) for multi-zone dispatch
Add index on demand_forecasts(zone_id, forecast_hour) UNIQUE
Rewrite W1-A (cancel-preview): Extend response to include:
typescript

1
Convert W2-A to VERIFY-then-EXTEND:
Verify existing alert+api.ts contract
Add SMS dispatch via lib/dprelay.sendSms() with SOS-scoped circuit breaker
Add push via lib/notify
Add 15-min cooldown check (429)
Build resolve+api.ts and active+api.ts
Fix component paths: Update all references from components/plan03/* to components/*.
Add dprelay circuit breaker: Create SOS-scoped counter in lib/dprelay.ts separate from OTP counters to prevent SOS traffic from blocking authentication.
Build D9 Min Rate screen: Create app/(main)/(rider)/min-rate/index.tsx reusing components/MinRateSlider.tsx.
Wire store resets: Add reset() method to all 7 stores and call from lib/authCleanup.ts logout flow.
8. CORRECT IMPLEMENTATION DEPENDENCY ORDER

12345678910111213141516171819202122232425262728293031323334353637383940414243
9. REUSE REQUIREMENTS
Component/File
Action
Notes
components/MinRateSlider.tsx
REUSE in D9
Do not duplicate
components/SchedulePicker.tsx
VERIFY then REUSE
Check date+time+Dhaka display coverage
components/SOSButton.tsx
FIX
Already points to /api/sos/alert — verify behavior
components/ErrorBanner.tsx
VERIFY then EXTEND
Check props interface, tokens, accessibility
components/OfflineIndicator.tsx
VERIFY then EXTEND
Check NetInfo cleanup
components/EmptyState.tsx
REUSE/RESTYLE
At components/, not components/plan03/
utils-server/scheduler.ts
EXTEND
Add catch-up, reminders, cutoff to existing 30s loop
app/api/sos/alert+api.ts
EXTEND
Add SMS/push/cooldown to existing auth/ownership logic
app/api/ride/[id]/cancel-preview+api.ts
EXTEND
Add free_until, server_now to response
lib/dprelay.ts
EXTEND
Add SOS-scoped circuit breaker separate from OTP
10. TESTING REQUIREMENTS
Critical Path Tests (Must Have):
Cancellation fee calculation: Test lib/cancellation.ts with various timestamps, ensuring free_until and server_now produce correct countdown.
Scheduler catch-up: Test that rides with `dispatch_window_end